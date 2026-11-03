// Formulario Create / Edit Invoice. Se elige el JOB (no hay selector de
// cliente): el cliente y los montos salen del job y se pueden editar. Pie con
// solo Cancel y Create Invoice (o Save Changes al editar).
// "Preview PDF" muestra el documento provisional (DRAFT al crear) sin guardar.
// Pendiente en etapas siguientes: las opciones de envío por correo / Stripe.
import { useState, type FormEvent } from 'react';
import { CreditCard, Eye, FileText, Image as ImageIcon, Plus, StickyNote } from 'lucide-react';
import type { Invoice, InvoiceNote, Property, SystemUser } from '../../../types/index';
import { useLiveData } from '../../../shared/data/liveCollections';
import { useHouseRecords } from '../../houses/hooks/useLiveHouse';
import { cavalryClientKeys, houseBusiness } from '../../../shared/utils/businesses';
import { findCustomer } from '../../../utils/customerDocs';
import { fullName } from '../../../utils/homeData';
import { invoicesService, buildInvoiceNote, type InvoiceActor } from '../../../services/invoicesService';
import { formatCents } from '../invoiceMath';
import type { InvoicePdfData } from '../invoicePdf';
import {
  buildAllJobPhotoItems, buildClientSnapshot, buildJobSnapshot, getInvoiceDefaults,
} from '../invoiceSnapshot';
import {
  getInvoiceFormAmounts, getInvoiceFormErrors, useInvoiceForm, type InvoiceFormNote,
} from '../hooks/useInvoiceForm';
import { useInvoiceJobOptions } from '../hooks/useInvoiceJobOptions';
import { useJobInvoices } from '../hooks/useJobInvoices';
import { useInvoicePhotoSelection } from '../hooks/useInvoicePhotoSelection';
import { usePhotoChoice } from '../hooks/usePhotoChoice';
import InvoiceDialog from './InvoiceDialog';
import InvoiceFormSection from './InvoiceFormSection';
import InvoiceJobPicker from './InvoiceJobPicker';
import InvoiceDatesFields from './InvoiceDatesFields';
import InvoiceAmountFields from './InvoiceAmountFields';
import InvoiceNotesEditor from './InvoiceNotesEditor';
import InvoicePhotosOption from './InvoicePhotosOption';
import InvoicePaymentFields from './InvoicePaymentFields';
import InvoicePdfPreviewModal from './InvoicePdfPreviewModal';
import './InvoiceFormModal.css';

interface InvoiceFormModalProps {
  /** null = crear; un invoice = editarlo. */
  invoice: Invoice | null;
  /** Casas de la ventana de App.tsx (las del selector de job). */
  properties: Property[];
  currentUser: SystemUser | null;
  onClose: () => void;
  onSaved: (result: { id: string; number: string; isNew: boolean }) => void;
}

/** Notas a guardar: las sin cambios quedan igual, las editadas conservan
 *  autor y fecha, las nuevas llevan a quien las escribió; las vacías se van. */
const buildSavedNotes = (formNotes: InvoiceFormNote[], actor: InvoiceActor): InvoiceNote[] =>
  formNotes
    .filter((formNote) => formNote.text.trim() !== '')
    .map((formNote) => {
      const text = formNote.text.trim();
      if (!formNote.original) return buildInvoiceNote(text, actor);
      return formNote.original.text === text ? formNote.original : { ...formNote.original, text };
    });

const InvoiceFormModal = ({ invoice, properties, currentUser, onClose, onSaved }: InvoiceFormModalProps) => {
  const customers = useLiveData('customers');
  const services = useLiveData('services');
  const statuses = useLiveData('statuses');
  const taxes = useLiveData('taxes');
  const { state, actions, isEditing, isPaymentLocked } = useInvoiceForm(invoice);
  const [showAllJobs, setShowAllJobs] = useState(false);
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);
  /** Datos del PDF provisional abierto (null = sin vista previa). */
  const [previewData, setPreviewData] = useState<InvoicePdfData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const jobOptions = useInvoiceJobOptions(properties, statuses, customers, showAllJobs, state.propertyId);
  const selectedProperty = properties.find((property) => property.id === state.propertyId) ?? null;
  const jobRecords = useHouseRecords(isEditing ? null : state.propertyId || null);
  const jobInvoices = useJobInvoices(state.propertyId, invoice?.id ?? null);
  const selectedCustomer = selectedProperty ? findCustomer(customers, selectedProperty.client) : null;
  // Fotos actuales del job (null si el job no está en la ventana: al editar, así
  // no se guarda una selección vacía por no tener el job cargado).
  const jobPhotos = selectedProperty ? buildAllJobPhotoItems(selectedProperty) : null;
  const savedPhotos = useInvoicePhotoSelection(invoice?.id ?? null);
  const photoChoice = usePhotoChoice(savedPhotos.selection, jobPhotos ?? []);

  const jobDefaults = selectedProperty && jobRecords.loaded
    ? getInvoiceDefaults({
      property: selectedProperty,
      billedServices: jobRecords.services,
      customer: selectedCustomer,
      defaultTaxPercentage: Number(taxes[0]?.percentage ?? 0),
    })
    : null;
  const amounts = getInvoiceFormAmounts(state, jobDefaults);
  const errors = getInvoiceFormErrors(state, amounts, isEditing);
  const shownErrors = hasTriedSubmit ? errors : {};
  const isFormValid = Object.keys(errors).length === 0 && !photoChoice.error;

  const client = invoice?.client ?? (selectedProperty ? buildClientSnapshot(selectedProperty, customers) : null);
  const serviceDate = invoice?.job.serviceDate ?? selectedProperty?.scheduleDate ?? '';

  const jobWarnings = [
    ...(selectedProperty?.invoiceHold ? ['This job is on invoice hold (failed Quality Check).'] : []),
    ...(jobInvoices.invoices.length > 0
      ? [`This job already has ${jobInvoices.invoices.length} invoice(s): ${jobInvoices.invoices.map((jobInvoice) => jobInvoice.number).join(', ')}.`]
      : []),
    ...(jobInvoices.hasError ? ['Could not check if this job already has invoices.'] : []),
  ];
  const isJobAmountDifferent = !!jobDefaults && jobDefaults.jobAmountsAtIssue.servicePriceCents > 0
    && !jobDefaults.matchesJobFinalCost && state.amountText === null;
  const jobAmountHint = isJobAmountDifferent && jobDefaults
    ? `Review the amount: this job's Final Cost is ${formatCents(jobDefaults.jobAmountsAtIssue.finalCostCents)}.`
    : null;

  const title = isEditing ? 'Edit Invoice' : 'Create Invoice';
  const submitLabel = isEditing ? 'Save Changes' : 'Create Invoice';

  // Otro job: vuelven su monto y tasa, y la selección de fotos pasa a todas las del job nuevo.
  const handleSelectJob = (propertyId: string) => {
    actions.selectJob(propertyId);
    photoChoice.resetForNewJob();
  };

  const createInvoice = async (actor: InvoiceActor) => {
    if (!selectedProperty || !client) throw new Error('Select a job.');
    const created = await invoicesService.create({
      client,
      job: buildJobSnapshot(selectedProperty, services),
      business: houseBusiness(selectedProperty, cavalryClientKeys(customers)),
      jobAmountsAtIssue: jobDefaults?.jobAmountsAtIssue ?? null,
      issueDate: state.issueDate,
      paymentTerms: state.paymentTerms,
      dueDate: state.dueDate,
      subtotalCents: amounts.subtotalCents ?? 0,
      taxRateBps: amounts.taxRateBps ?? 0,
      recipientEmail: client.email,
      paymentLinkUrl: '',
      noteTexts: state.notes.map((note) => note.text),
      photos: photoChoice.toInput(),
      status: state.status,
      initialPayment: state.status === 'paid' ? state.payment : null,
    }, actor);
    onSaved({ ...created, isNew: true });
  };

  const updateInvoice = async (savedInvoice: Invoice, actor: InvoiceActor) => {
    await invoicesService.update(savedInvoice.id, {
      issueDate: state.issueDate,
      paymentTerms: state.paymentTerms,
      dueDate: state.dueDate,
      ...(isPaymentLocked ? {} : { subtotalCents: amounts.subtotalCents ?? 0, taxRateBps: amounts.taxRateBps ?? 0 }),
      notes: buildSavedNotes(state.notes, actor),
    }, actor);
    if (jobPhotos && !savedPhotos.isLoading && photoChoice.isChanged) {
      await invoicesService.updatePhotoSelection(savedInvoice.id, photoChoice.toInput(), actor);
    }
    onSaved({ id: savedInvoice.id, number: savedInvoice.number, isNew: false });
  };

  // Preview PDF: pide los datos principales válidos (job, fechas, monto y tasa),
  // no los opcionales; al crear el documento sale como DRAFT.
  const handlePreviewPdf = () => {
    const mainFieldErrors = [errors.job, errors.issueDate, errors.dueDate, errors.amount, errors.taxRate].filter(Boolean);
    const job = invoice?.job ?? (selectedProperty ? buildJobSnapshot(selectedProperty, services) : null);
    if (mainFieldErrors.length > 0 || !client || !job) {
      setHasTriedSubmit(true);
      return;
    }
    setPreviewData({
      number: invoice?.number ?? null,
      status: invoice?.status ?? state.status,
      client,
      recipientEmail: invoice?.recipientEmail ?? client.email,
      job,
      issueDate: state.issueDate,
      paymentTerms: state.paymentTerms,
      dueDate: state.dueDate,
      subtotalCents: amounts.subtotalCents ?? 0,
      taxRateBps: amounts.taxRateBps ?? 0,
      taxCents: amounts.taxCents,
      totalCents: amounts.totalCents,
      notes: state.notes.map((note) => note.text),
      paymentLinkUrl: invoice?.paymentLinkUrl ?? '',
      photos: photoChoice.include ? photoChoice.items : [],
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasTriedSubmit(true);
    if (!isFormValid || isSaving) return;
    if (!currentUser) {
      setSaveError('Your user profile is not loaded. Reload the app and try again.');
      return;
    }
    const actor: InvoiceActor = { id: currentUser.id, name: fullName(currentUser) };
    setIsSaving(true);
    setSaveError('');
    try {
      if (invoice) await updateInvoice(invoice, actor);
      else await createInvoice(actor);
    } catch (error) {
      console.error('Could not save the invoice:', error);
      const detail = error instanceof Error ? error.message : '';
      setSaveError(`Could not save the invoice. ${detail} Check your connection and try again.`.trim());
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <InvoiceDialog
      title={title}
      subtitle="Choose the job, review the amount and decide how the invoice is recorded."
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
            <InvoiceAmountFields
              amountText={amounts.amountText}
              taxRateText={amounts.taxRateText}
              onAmountChange={actions.setAmount}
              onTaxRateChange={actions.setTaxRate}
              subtotalCents={amounts.subtotalCents ?? 0}
              taxRateBps={amounts.taxRateBps ?? 0}
              taxCents={amounts.taxCents}
              totalCents={amounts.totalCents}
              isLocked={isPaymentLocked}
              amountError={shownErrors.amount}
              taxRateError={shownErrors.taxRate}
              jobAmountHint={jobAmountHint}
            />
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
            />
          </InvoiceFormSection>

          <InvoiceFormSection id="invoice-payment-heading" title="Payment" icon={CreditCard}>
            <InvoicePaymentFields
              status={state.status}
              onStatusChange={actions.setStatus}
              payment={state.payment}
              onPaymentChange={actions.setPaymentField}
              savedStatus={invoice?.status ?? null}
              paymentErrors={shownErrors}
            />
          </InvoiceFormSection>
        </div>

        <footer className="invd-footer">
          {saveError && <p className="invd-footer-error" role="alert">{saveError}</p>}
          <button type="button" className="invd-secondary-btn" disabled={isSaving} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary invd-primary-btn" disabled={isSaving}>
            {isSaving ? 'Saving…' : submitLabel}
          </button>
        </footer>
      </form>
      {previewData && <InvoicePdfPreviewModal data={previewData} onClose={() => setPreviewData(null)} />}
    </InvoiceDialog>
  );
};

export default InvoiceFormModal;
