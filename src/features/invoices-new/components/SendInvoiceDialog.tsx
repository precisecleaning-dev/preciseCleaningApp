// Send / Resend Invoice: resumen (número, cliente y total), correo del cliente
// y qué se manda (PDF, enlace de Stripe o los dos). El PDF va marcado; el
// enlace, si el invoice tiene uno y no está pagado. Si cambian el correo o el
// enlace, se guardan en el invoice antes de enviar (quedan en su Activity).
import { useState, type FormEvent } from 'react';
import type { Invoice, InvoiceDeliveryChoice, InvoiceDeliveryOutcome, Property, SystemUser } from '../../../types/index';
import { invoicesService, type InvoiceActor } from '../../../services/invoicesService';
import { fullName } from '../../../utils/homeData';
import { formatCents } from '../invoiceMath';
import { isPaidStatus } from '../invoiceStatus';
import { getDeliveryErrors } from '../invoiceDelivery';
import { sendInvoiceEmail } from '../services/invoiceEmailService';
import InvoiceDialog from './InvoiceDialog';
import InvoiceDeliveryFields from './InvoiceDeliveryFields';
import './SendInvoiceDialog.css';

interface SendInvoiceDialogProps {
  invoice: Invoice;
  /** Casa del job (null si no está en la ventana de 12 meses). */
  jobProperty: Property | null;
  currentUser: SystemUser | null;
  onClose: () => void;
  onSent: (invoice: Invoice, outcome: InvoiceDeliveryOutcome) => void;
}

const SendInvoiceDialog = ({ invoice, jobProperty, currentUser, onClose, onSent }: SendInvoiceDialogProps) => {
  const isPaid = isPaidStatus(invoice.status);
  const [choice, setChoice] = useState<InvoiceDeliveryChoice>(() => ({
    sendPdf: true,
    sendPaymentLink: !!invoice.paymentLinkUrl && !isPaidStatus(invoice.status),
    recipientEmail: invoice.recipientEmail || invoice.client.email,
    paymentLinkUrl: invoice.paymentLinkUrl,
  }));
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const effectiveChoice = { ...choice, sendPaymentLink: choice.sendPaymentLink && !isPaid };
  const deliveryErrors = getDeliveryErrors(effectiveChoice, true);
  const isResend = invoice.delivery.sendCount > 0;
  const submitLabel = isResend ? 'Resend Invoice' : 'Send Invoice';

  const handleChoiceChange = (patch: Partial<InvoiceDeliveryChoice>) => {
    setChoice((currentChoice) => ({ ...currentChoice, ...patch }));
  };

  // Correo y enlace nuevos se guardan antes de enviar: la función los lee del invoice.
  const saveDeliveryFields = async (actor: InvoiceActor): Promise<Invoice> => {
    const recipientEmail = effectiveChoice.recipientEmail.trim();
    const paymentLinkUrl = effectiveChoice.paymentLinkUrl.trim();
    const patch = {
      ...(recipientEmail !== invoice.recipientEmail ? { recipientEmail } : {}),
      ...(effectiveChoice.sendPaymentLink && paymentLinkUrl !== invoice.paymentLinkUrl ? { paymentLinkUrl } : {}),
    };
    if (Object.keys(patch).length === 0) return invoice;
    await invoicesService.update(invoice.id, patch, actor);
    return { ...invoice, ...patch };
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasTriedSubmit(true);
    if (Object.keys(deliveryErrors).length > 0 || isSending) return;
    if (!currentUser) {
      setSendError('Your user profile is not loaded. Reload the app and try again.');
      return;
    }
    const actor: InvoiceActor = { id: currentUser.id, name: fullName(currentUser) };
    const to = effectiveChoice.recipientEmail.trim();
    setIsSending(true);
    setSendError('');
    try {
      const invoiceToSend = await saveDeliveryFields(actor);
      const { missingPhotoCount } = await sendInvoiceEmail({
        invoice: invoiceToSend,
        jobProperty,
        to,
        includePdf: effectiveChoice.sendPdf,
        includePaymentLink: effectiveChoice.sendPaymentLink,
        actor,
      });
      onSent(invoice, { status: 'sent', to, missingPhotoCount });
    } catch (error) {
      console.error('Could not send the invoice:', error);
      setSendError(error instanceof Error ? error.message : 'Could not send the invoice. Try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <InvoiceDialog
      title={submitLabel}
      subtitle={`${invoice.number} · ${invoice.client.name}`}
      size="narrow"
      isCloseDisabled={isSending}
      onClose={onClose}
    >
      <form className="sid-form" noValidate onSubmit={handleSubmit}>
        <div className="invd-body">
          <dl className="sid-summary">
            <div className="sid-summary-item">
              <dt>Invoice</dt>
              <dd>{invoice.number}</dd>
            </div>
            <div className="sid-summary-item">
              <dt>Client</dt>
              <dd>{invoice.client.name}</dd>
            </div>
            <div className="sid-summary-item">
              <dt>Total</dt>
              <dd>{formatCents(invoice.totalCents)}</dd>
            </div>
          </dl>
          <InvoiceDeliveryFields
            choice={choice}
            onChange={handleChoiceChange}
            isPaid={isPaid}
            totalText={formatCents(invoice.totalCents)}
            errors={hasTriedSubmit ? deliveryErrors : {}}
          />
        </div>
        <footer className="invd-footer">
          {sendError && <p className="invd-footer-error" role="alert">{sendError}</p>}
          <button type="button" className="invd-secondary-btn" disabled={isSending} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary invd-primary-btn" disabled={isSending}>
            {isSending ? 'Sending…' : submitLabel}
          </button>
        </footer>
      </form>
    </InvoiceDialog>
  );
};

export default SendInvoiceDialog;
