// Formulario Create / Edit Invoice. Se elige el JOB (no hay selector de
// cliente): el cliente y los SERVICIOS que se cobran salen del job (no se
// escriben a mano); se agregan fees porcentuales. Pie con solo Cancel y Create
// Invoice (o Save Changes al editar).
// "Preview PDF" muestra el documento provisional (DRAFT al crear) sin guardar.
// "Send by email": al guardar, manda el PDF y/o el enlace de Stripe. Si el
// correo falla, el invoice queda guardado y el aviso lo dice (se reintenta con
// Send Invoice). Enviarlo pasa un Needs Invoice a Pending (lo hace el servidor).
// Status: Needs Invoice / Pending / Paid. Al editar, todo (cambios, pago si se
// elige Paid y fotos) va en UNA transacción: si falla, no queda nada a medias.
// `invoice` es la copia de cuando se abrió (estado inicial y control de cambios
// ajenos); `liveInvoice`, la versión en vivo: si otra persona lo guarda, se
// avisa antes de intentar guardar.
import { useState, type FormEvent } from 'react';
import { CreditCard, Eye, FileText, Image as ImageIcon, Percent, Plus, Send, StickyNote } from 'lucide-react';
import type {
  Actor, Invoice, InvoiceDeliveryChoice, InvoiceDeliveryOutcome, InvoiceNote, InvoiceSaveResult, Property, SystemUser,
} from '../../../types/index';
import { useLiveData } from '../../../shared/data/liveCollections';
import { useHouseRecords } from '../../houses/hooks/useLiveHouse';
import { cavalryClientKeys, houseBusiness } from '../../../shared/utils/businesses';
import { fullName } from '../../../utils/homeData';
import {
  InvoiceChangedError, invoicesService, buildInvoiceNote,
} from '../../../services/invoicesService';
import { formatCents } from '../invoiceMath';
import type { InvoicePdfData } from '../invoicePdf';
import {
  areSameLineItems, buildAllJobPhotoItems, buildClientSnapshot, buildInvoiceLineItems, buildJobSnapshot,
  getJobAmountsAtIssue,
} from '../invoiceSnapshot';
import {
  getInvoiceFormCharges, getInvoiceFormDelivery, getInvoiceFormErrors, isRecordingPayment, useInvoiceForm,
  type InvoiceFormNote,
} from '../hooks/useInvoiceForm';
import { isManualStatus, isPaidStatus } from '../invoiceStatus';
import {
  INVOICE_EMAIL_PATTERN, buildStripePaymentUrl, getDeliveryErrors, isDeliveryRequested,
} from '../invoiceDelivery';
import { sendInvoiceEmail } from '../services/invoiceEmailService';
import { useInvoiceJobOptions } from '../hooks/useInvoiceJobOptions';
import { useJobInvoices } from '../hooks/useJobInvoices';
import { useInvoicePhotoSelection } from '../hooks/useInvoicePhotoSelection';
import { usePhotoChoice } from '../hooks/usePhotoChoice';
import InvoiceDialog from './InvoiceDialog';
import InvoiceFormSection from './InvoiceFormSection';
import InvoiceJobPicker from './InvoiceJobPicker';
import InvoiceDatesFields from './InvoiceDatesFields';
import InvoiceServicesList from './InvoiceServicesList';
import InvoiceFeesEditor from './InvoiceFeesEditor';
import InvoiceTotalsSummary from './InvoiceTotalsSummary';
import InvoiceNotesEditor from './InvoiceNotesEditor';
import InvoicePhotosOption from './InvoicePhotosOption';
import InvoicePaymentFields from './InvoicePaymentFields';
import InvoiceDeliveryFields from './InvoiceDeliveryFields';
import InvoicePdfPreviewModal from './InvoicePdfPreviewModal';
import './InvoiceFormModal.css';

interface InvoiceFormModalProps {
  /** null = crear; un invoice = editarlo (la copia de cuando se abrió el formulario). */
  invoice: Invoice | null;
  /** Al editar: el mismo invoice en vivo (null si ya no está en la lista). */
  liveInvoice: Invoice | null;
  /** Casas de la ventana de App.tsx (las del selector de job). */
  properties: Property[];
  currentUser: SystemUser | null;
  onClose: () => void;
  /** `delivery` = resultado del envío por correo (null si no se pidió). */
  onSaved: (result: InvoiceSaveResult) => void;
}

/** Paso del guardado: guardar el invoice y, si se pidió, mandarlo por correo. */
type SaveStep = 'saving' | 'sending' | null;

/** Por qué las fotos no se pueden cambiar en Edit (vacío = sí se pueden): sin la
 *  selección guardada, el formulario partiría de "todas" y no podría guardarla. */
const getSavedPhotosNotice = (isEditing: boolean, savedPhotos: { isLoading: boolean; hasError: boolean }): string => {
  if (!isEditing) return '';
  if (savedPhotos.hasError) return 'Could not load the saved photos, so they will not change. Close the form and open it again to edit them.';
  if (savedPhotos.isLoading) return 'Loading the saved photos…';
  return '';
};

/** Notas a guardar: las sin cambios quedan igual, las editadas conservan
 *  autor y fecha, las nuevas llevan a quien las escribió; las vacías se van. */
const buildSavedNotes = (formNotes: InvoiceFormNote[], actor: Actor): InvoiceNote[] =>
  formNotes
    .filter((formNote) => formNote.text.trim() !== '')
    .map((formNote) => {
      const text = formNote.text.trim();
      if (!formNote.original) return buildInvoiceNote(text, actor);
      return formNote.original.text === text ? formNote.original : { ...formNote.original, text };
    });

const InvoiceFormModal = ({ invoice, liveInvoice, properties, currentUser, onClose, onSaved }: InvoiceFormModalProps) => {
  const customers = useLiveData('customers');
  const services = useLiveData('services');
  const products = useLiveData('products');
  const statuses = useLiveData('statuses');
  const { state, actions, isEditing, isPaymentLocked } = useInvoiceForm(invoice);
  const [showAllJobs, setShowAllJobs] = useState(false);
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);
  /** Datos del PDF provisional abierto (null = sin vista previa). */
  const [previewData, setPreviewData] = useState<InvoicePdfData | null>(null);
  const [saveStep, setSaveStep] = useState<SaveStep>(null);
  const [saveError, setSaveError] = useState('');
  const isSaving = saveStep !== null;

  const jobOptions = useInvoiceJobOptions(properties, statuses, customers, showAllJobs, state.propertyId);
  const selectedProperty = properties.find((property) => property.id === state.propertyId) ?? null;
  // Servicios cobrados del job: al crear, las líneas del invoice; al editar,
  // para "Refresh from job" y para avisar si cambiaron.
  const jobRecords = useHouseRecords(state.propertyId || null);
  const jobInvoices = useJobInvoices(state.propertyId, invoice?.id ?? null);
  // Fotos actuales del job (null si el job no está en la ventana: al editar, así
  // no se guarda una selección vacía por no tener el job cargado).
  const jobPhotos = selectedProperty ? buildAllJobPhotoItems(selectedProperty) : null;
  const savedPhotos = useInvoicePhotoSelection(invoice?.id ?? null);
  const photoChoice = usePhotoChoice(savedPhotos.selection, jobPhotos ?? []);

  const jobLineItems = selectedProperty && jobRecords.loaded
    ? buildInvoiceLineItems(selectedProperty, jobRecords.services, [products, services])
    : null;
  const charges = getInvoiceFormCharges(state, invoice, jobLineItems);
  const { totals } = charges;
  const savedStatus = invoice?.status ?? null;
  const errors = getInvoiceFormErrors(state, charges, savedStatus);
  // Edit: los servicios del job ya no son los del invoice (o el invoice no tiene).
  const canRefreshFromJob = isEditing && !isPaymentLocked && jobLineItems !== null && jobLineItems.length > 0;
  const hasJobServiceChanges = isEditing && jobLineItems !== null && !!charges.lineItems
    && !areSameLineItems(jobLineItems, charges.lineItems);
  const recordsPayment = isRecordingPayment(state, savedStatus);
  const shownErrors = hasTriedSubmit ? errors : {};

  const client = invoice?.client ?? (selectedProperty ? buildClientSnapshot(selectedProperty, customers) : null);
  const delivery = getInvoiceFormDelivery(state, client?.email ?? '');
  const deliveryErrors = getDeliveryErrors(delivery, false);
  const isFormValid = Object.keys(errors).length === 0 && Object.keys(deliveryErrors).length === 0 && !photoChoice.error;
  // Otra persona guardó el invoice después de abrir el formulario: guardar fallaría
  // (InvoiceChangedError), así que se avisa antes. Mientras se guarda no cuenta: es el propio cambio.
  const isChangedByOthers = !!invoice && !!liveInvoice && liveInvoice.updatedAt !== invoice.updatedAt && !isSaving;
  const changedByOthersMessage = isChangedByOthers && invoice
    ? `Someone else changed invoice ${invoice.number} after you opened it. Close the form and open it again to see the latest version.`
    : '';
  // El aviso de cambio ajeno va primero: mientras exista, guardar está desactivado.
  const footerError = changedByOthersMessage || saveError;
  const savedPhotosNotice = getSavedPhotosNotice(isEditing, savedPhotos);
  const serviceDate = invoice?.job.serviceDate ?? selectedProperty?.scheduleDate ?? '';

  const jobWarnings = [
    ...(selectedProperty?.invoiceHold ? ['This job is on invoice hold (failed Quality Check).'] : []),
    ...(jobInvoices.invoices.length > 0
      ? [`This job already has ${jobInvoices.invoices.length} invoice(s): ${jobInvoices.invoices.map((jobInvoice) => jobInvoice.number).join(', ')}.`]
      : []),
    ...(jobInvoices.hasError ? ['Could not check if this job already has invoices.'] : []),
  ];

  const title = isEditing ? 'Edit Invoice' : 'Create Invoice';
  const submitLabel = isEditing ? 'Save Changes' : 'Create Invoice';
  const savingLabel = saveStep === 'sending' ? 'Sending…' : 'Saving…';
  // Correo y enlace se guardan solo si se usan en este envío (si no, quedan los de antes).
  const savedRecipientEmail = delivery.recipientEmail.trim();
  const savedPaymentLinkUrl = delivery.paymentLinkUrl.trim();
  // Sin envío, el correo del cliente se guarda solo si es válido: un correo mal
  // escrito en Customers no debe impedir crear el invoice.
  const clientEmail = client?.email.trim() ?? '';
  const fallbackRecipientEmail = INVOICE_EMAIL_PATTERN.test(clientEmail) ? clientEmail : '';

  // Otro job: vuelven su monto y tasa, y la selección de fotos pasa a todas las del job nuevo.
  const handleSelectJob = (propertyId: string) => {
    actions.selectJob(propertyId);
    photoChoice.resetForNewJob();
  };

  // Edit: trae los servicios actuales del job (se guardan al guardar el invoice).
  const handleRefreshFromJob = () => {
    if (jobLineItems) actions.refreshLineItems(jobLineItems);
  };

  const createInvoice = async (actor: Actor): Promise<{ id: string; number: string }> => {
    if (!selectedProperty || !client) throw new Error('Select a job.');
    if (!isManualStatus(state.status)) throw new Error('Choose Needs Invoice, Pending or Paid.');
    return invoicesService.create({
      client,
      job: buildJobSnapshot(selectedProperty, services),
      business: houseBusiness(selectedProperty, cavalryClientKeys(customers)),
      jobAmountsAtIssue: jobRecords.loaded ? getJobAmountsAtIssue(selectedProperty, jobRecords.services) : null,
      issueDate: state.issueDate,
      paymentTerms: state.paymentTerms,
      dueDate: state.dueDate,
      lineItems: charges.lineItems ?? [],
      fees: charges.feeInputs,
      recipientEmail: isDeliveryRequested(delivery) ? savedRecipientEmail : fallbackRecipientEmail,
      paymentLinkUrl: delivery.sendPaymentLink ? savedPaymentLinkUrl : '',
      noteTexts: state.notes.map((note) => note.text),
      photos: photoChoice.toInput(),
      status: state.status,
      initialPayment: recordsPayment ? state.payment : null,
    }, actor);
  };

  const updateInvoice = async (savedInvoice: Invoice, actor: Actor): Promise<{ id: string; number: string }> => {
    // Needs Invoice ↔ Pending va en el patch; Paid, con su pago (misma transacción).
    const draftOrPendingStatus = state.status === 'needs_invoice' || state.status === 'pending' ? state.status : null;
    const changedStatus = draftOrPendingStatus !== savedInvoice.status ? draftOrPendingStatus : null;
    // Fotos solo si el job está cargado y la selección guardada llegó bien: si
    // no, se guardaría "todas las fotos" encima de la selección real (la sección
    // de fotos está de solo lectura en ese caso: savedPhotosNotice).
    const canSavePhotos = jobPhotos !== null && savedPhotosNotice === '';
    const changedPhotos = canSavePhotos && photoChoice.isChanged ? photoChoice.toInput() : null;
    await invoicesService.update(savedInvoice.id, {
      issueDate: state.issueDate,
      paymentTerms: state.paymentTerms,
      dueDate: state.dueDate,
      // Servicios solo si se trajeron del job; fees siempre (el service guarda solo lo que cambió).
      ...(isPaymentLocked ? {} : {
        fees: charges.feeInputs,
        ...(state.refreshedLineItems ? { lineItems: state.refreshedLineItems } : {}),
      }),
      notes: buildSavedNotes(state.notes, actor),
      ...(isDeliveryRequested(delivery) ? { recipientEmail: savedRecipientEmail } : {}),
      ...(delivery.sendPaymentLink ? { paymentLinkUrl: savedPaymentLinkUrl } : {}),
      ...(changedStatus ? { status: changedStatus } : {}),
    }, actor, {
      expectedUpdatedAt: savedInvoice.updatedAt,
      manualPayment: recordsPayment ? state.payment : null,
      photos: changedPhotos,
    });
    return { id: savedInvoice.id, number: savedInvoice.number };
  };

  // Envío después de guardar: un error aquí NO deshace el invoice guardado.
  const emailSavedInvoice = async (
    invoiceId: string, deliveryChoice: InvoiceDeliveryChoice, actor: Actor,
  ): Promise<InvoiceDeliveryOutcome> => {
    try {
      const savedInvoice = await invoicesService.getOne(invoiceId);
      if (!savedInvoice) throw new Error('The invoice was saved but could not be read back.');
      const to = deliveryChoice.recipientEmail.trim();
      const { missingPhotoCount } = await sendInvoiceEmail({
        invoice: savedInvoice,
        jobProperty: selectedProperty,
        to,
        includePdf: deliveryChoice.sendPdf,
        includePaymentLink: deliveryChoice.sendPaymentLink,
        actor,
      });
      return { status: 'sent', to, missingPhotoCount };
    } catch (error) {
      console.error('Could not email the invoice:', error);
      return { status: 'failed', message: error instanceof Error ? error.message : 'Unknown error.' };
    }
  };

  // Preview PDF: pide los datos principales válidos (job, fechas, monto y tasa),
  // no los opcionales; al crear el documento sale como DRAFT.
  const savedPaymentLinkWithReference = invoice?.paymentLinkUrl ? buildStripePaymentUrl(invoice.paymentLinkUrl, invoice.id) : '';
  const previewPaymentLinkUrl = delivery.sendPaymentLink ? savedPaymentLinkUrl : savedPaymentLinkWithReference;

  const handlePreviewPdf = () => {
    const mainFieldErrors = [errors.job, errors.issueDate, errors.dueDate, errors.services, errors.fees].filter(Boolean);
    const job = invoice?.job ?? (selectedProperty ? buildJobSnapshot(selectedProperty, services) : null);
    if (mainFieldErrors.length > 0 || !client || !job) {
      setHasTriedSubmit(true);
      return;
    }
    setPreviewData({
      number: invoice?.number ?? null,
      status: state.status,
      client,
      recipientEmail: isDeliveryRequested(delivery) ? savedRecipientEmail : (invoice?.recipientEmail ?? fallbackRecipientEmail),
      job,
      issueDate: state.issueDate,
      paymentTerms: state.paymentTerms,
      dueDate: state.dueDate,
      lineItems: charges.lineItems ?? [],
      fees: totals.fees,
      subtotalCents: totals.subtotalCents,
      taxRateBps: totals.taxRateBps,
      taxCents: totals.taxCents,
      feesCents: totals.feesCents,
      totalCents: totals.totalCents,
      notes: state.notes.map((note) => note.text),
      paymentLinkUrl: previewPaymentLinkUrl,
      photos: photoChoice.include ? photoChoice.items : [],
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasTriedSubmit(true);
    if (!isFormValid || isSaving || isChangedByOthers) return;
    if (!currentUser) {
      setSaveError('Your user profile is not loaded. Reload the app and try again.');
      return;
    }
    const actor: Actor = { id: currentUser.id, name: fullName(currentUser) };
    setSaveStep('saving');
    setSaveError('');
    let saved: { id: string; number: string };
    try {
      saved = invoice ? await updateInvoice(invoice, actor) : await createInvoice(actor);
    } catch (error) {
      console.error('Could not save the invoice:', error);
      const detail = error instanceof Error ? error.message : '';
      setSaveError(error instanceof InvoiceChangedError
        ? detail
        : `Could not save the invoice. ${detail} Check your connection and try again.`.trim());
      setSaveStep(null);
      return;
    }
    let deliveryOutcome: InvoiceDeliveryOutcome | null = null;
    if (isDeliveryRequested(delivery)) {
      setSaveStep('sending');
      deliveryOutcome = await emailSavedInvoice(saved.id, delivery, actor);
    }
    setSaveStep(null);
    onSaved({ ...saved, isNew: !invoice, delivery: deliveryOutcome });
  };

  return (
    <InvoiceDialog
      title={title}
      subtitle="Choose the job, review the services it charges and add fees if needed."
      isCloseDisabled={isSaving}
      onClose={onClose}
    >
      <form className="invf-form" noValidate onSubmit={handleSubmit}>
        <div className="invd-body modal-body-scroll">
          <InvoiceFormSection
            id="invoice-details-heading"
            title="Invoice details"
            icon={FileText}
            actions={(
              <button type="button" className="invf-text-btn" onClick={handlePreviewPdf}>
                <Eye size={16} aria-hidden="true" /> Preview PDF
              </button>
            )}
          >
            <InvoiceJobPicker
              jobOptions={jobOptions}
              selectedPropertyId={state.propertyId}
              onSelectJob={handleSelectJob}
              showAllJobs={showAllJobs}
              onShowAllJobsChange={setShowAllJobs}
              isLocked={isEditing}
              error={shownErrors.job}
              warnings={jobWarnings}
              client={client}
              serviceDate={serviceDate}
            />
            <InvoiceDatesFields
              issueDate={state.issueDate}
              paymentTerms={state.paymentTerms}
              dueDate={state.dueDate}
              onIssueDateChange={actions.setIssueDate}
              onPaymentTermsChange={actions.setPaymentTerms}
              onDueDateChange={actions.setDueDate}
              issueDateError={shownErrors.issueDate}
              dueDateError={shownErrors.dueDate}
            />
          </InvoiceFormSection>

          <InvoiceFormSection id="invoice-services-heading" title="Services" icon={FileText}>
            <InvoiceServicesList
              lineItems={charges.lineItems}
              hasJob={!!state.propertyId}
              error={shownErrors.services}
              canRefresh={canRefreshFromJob}
              hasJobChanges={hasJobServiceChanges}
              isRefreshed={state.refreshedLineItems !== null}
              onRefresh={handleRefreshFromJob}
            />
          </InvoiceFormSection>

          <InvoiceFormSection
            id="invoice-fees-heading"
            title="Fees"
            icon={Percent}
            isOptional
            actions={isPaymentLocked ? undefined : (
              <button type="button" className="invf-text-btn" onClick={actions.addFee}>
                <Plus size={16} aria-hidden="true" /> Add fee
              </button>
            )}
          >
            <InvoiceFeesEditor
              fees={state.fees}
              computedFees={totals.fees}
              onChangeFee={actions.changeFee}
              onRemoveFee={actions.removeFee}
              isLocked={isPaymentLocked}
              error={shownErrors.fees}
            />
            <InvoiceTotalsSummary totals={totals} />
          </InvoiceFormSection>

          <InvoiceFormSection
            id="invoice-notes-heading"
            title="Notes"
            icon={StickyNote}
            isOptional
            actions={(
              <button type="button" className="invf-text-btn" onClick={actions.addNote}>
                <Plus size={16} aria-hidden="true" /> Add note
              </button>
            )}
          >
            <InvoiceNotesEditor
              notes={state.notes}
              onChangeNote={actions.changeNote}
              onRemoveNote={actions.removeNote}
              error={shownErrors.notes}
            />
          </InvoiceFormSection>

          <InvoiceFormSection id="invoice-photos-heading" title="Job photos" icon={ImageIcon}>
            <InvoicePhotosOption
              photoChoice={photoChoice}
              jobPhotos={jobPhotos}
              error={hasTriedSubmit ? photoChoice.error : ''}
              unavailableMessage={savedPhotosNotice}
            />
          </InvoiceFormSection>

          <InvoiceFormSection id="invoice-payment-heading" title="Payment" icon={CreditCard}>
            <InvoicePaymentFields
              status={state.status}
              onStatusChange={actions.setStatus}
              payment={state.payment}
              onPaymentChange={actions.setPaymentField}
              savedStatus={savedStatus}
              paymentErrors={shownErrors}
            />
          </InvoiceFormSection>

          <InvoiceFormSection id="invoice-delivery-heading" title="Send by email" icon={Send} isOptional>
            <InvoiceDeliveryFields
              choice={{ ...state.delivery, recipientEmail: delivery.recipientEmail }}
              onChange={actions.setDelivery}
              isPaid={isPaidStatus(state.status)}
              totalText={formatCents(totals.totalCents)}
              errors={hasTriedSubmit ? deliveryErrors : {}}
            />
          </InvoiceFormSection>
        </div>

        <footer className="invd-footer">
          {footerError && <p className="invd-footer-error" role="alert">{footerError}</p>}
          <button type="button" className="invd-secondary-btn" disabled={isSaving} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary invd-primary-btn" disabled={isSaving || isChangedByOthers}>
            {isSaving ? savingLabel : submitLabel}
          </button>
        </footer>
      </form>
      {previewData && <InvoicePdfPreviewModal data={previewData} onClose={() => setPreviewData(null)} />}
    </InvoiceDialog>
  );
};

export default InvoiceFormModal;
