// Mark as Paid: registra el pago COMPLETO recibido fuera de Stripe (Cash,
// Bank transfer, Check u Other). El service relee el invoice y no deja
// registrar un segundo pago: dos clics o dos personas dejan uno solo.
import { useState, type FormEvent } from 'react';
import type { Invoice, InvoiceManualPaymentInput, SystemUser } from '../../../types/index';
import { InvoiceAlreadyPaidError, invoicesService } from '../../../services/invoicesService';
import { fullName } from '../../../utils/homeData';
import { formatCents } from '../invoiceMath';
import { createEmptyManualPayment, getManualPaymentErrors } from '../invoicePayment';
import InvoiceDialog from './InvoiceDialog';
import InvoiceManualPaymentFields from './InvoiceManualPaymentFields';
import './RecordPaymentDialog.css';

interface RecordPaymentDialogProps {
  invoice: Invoice;
  currentUser: SystemUser | null;
  onClose: () => void;
  onRecorded: (invoice: Invoice) => void;
}

const RecordPaymentDialog = ({ invoice, currentUser, onClose, onRecorded }: RecordPaymentDialogProps) => {
  const [payment, setPayment] = useState<InvoiceManualPaymentInput>(createEmptyManualPayment);
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const paymentErrors = getManualPaymentErrors(payment, invoice.issueDate);
  const shownErrors = hasTriedSubmit ? paymentErrors : {};

  const handlePaymentChange = (field: keyof InvoiceManualPaymentInput, value: string) => {
    setPayment((currentPayment) => ({ ...currentPayment, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasTriedSubmit(true);
    if (Object.keys(paymentErrors).length > 0 || isSaving) return;
    if (!currentUser) {
      setSaveError('Your user profile is not loaded. Reload the app and try again.');
      return;
    }
    setIsSaving(true);
    setSaveError('');
    try {
      await invoicesService.recordManualPayment(invoice.id, payment, { id: currentUser.id, name: fullName(currentUser) });
      onRecorded(invoice);
    } catch (error) {
      console.error('Could not record the payment:', error);
      if (error instanceof InvoiceAlreadyPaidError) setSaveError('This invoice is already paid. Nothing was recorded.');
      else setSaveError('Could not record the payment. Check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <InvoiceDialog
      title="Record payment"
      subtitle={`${invoice.number} · ${invoice.client.name}`}
      size="narrow"
      isCloseDisabled={isSaving}
      onClose={onClose}
    >
      <form className="rpd-form" noValidate onSubmit={handleSubmit}>
        <div className="invd-body">
          <div className="rpd-amount">
            <span className="rpd-amount-label">Full payment</span>
            <strong className="rpd-amount-value">{formatCents(invoice.totalCents)}</strong>
          </div>
          <InvoiceManualPaymentFields payment={payment} onPaymentChange={handlePaymentChange} errors={shownErrors} />
        </div>
        <footer className="invd-footer">
          {saveError && <p className="invd-footer-error" role="alert">{saveError}</p>}
          <button type="button" className="invd-secondary-btn" disabled={isSaving} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary invd-primary-btn" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Record Payment'}
          </button>
        </footer>
      </form>
    </InvoiceDialog>
  );
};

export default RecordPaymentDialog;
