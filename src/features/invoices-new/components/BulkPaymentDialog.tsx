// Mark as Paid en bloque: UN pago (método, fecha, referencia y nota) que se
// registra en cada invoice marcado sin pagar, cada uno por su propio total
// (p. ej. un cheque que paga varios). Los ya pagados se saltan. Al terminar
// muestra cuántos se registraron y cuáles no (y por qué).
import { useState, type FormEvent } from 'react';
import type { Invoice, InvoiceBulkResult, InvoiceManualPaymentInput, SystemUser } from '../../../types/index';
import { fullName } from '../../../utils/homeData';
import { formatDate } from '../../../utils/dateFormat';
import { pluralize } from '../../../utils/countFormat';
import { formatCents } from '../invoiceMath';
import { createEmptyManualPayment, getManualPaymentErrors } from '../invoicePayment';
import { describeBulkResult, planBulkPayment } from '../invoiceBulk';
import { recordPaymentsInBulk } from '../services/invoiceBulkService';
import InvoiceDialog from './InvoiceDialog';
import InvoiceManualPaymentFields from './InvoiceManualPaymentFields';
import InvoiceBulkIssueList from './InvoiceBulkIssueList';
import './InvoiceBulkDialog.css';

/** Texto del resultado ("5 invoices marked as paid."). */
const RESULT_ACTION_TEXT = 'marked as paid';

interface BulkPaymentDialogProps {
  /** Invoices marcados (los pagados se saltan). */
  invoices: Invoice[];
  currentUser: SystemUser | null;
  /** Se cierra sin haber registrado nada. */
  onClose: () => void;
  /** Se cierra después de registrar: la vista limpia la selección y avisa. */
  onFinished: (result: InvoiceBulkResult) => void;
}

const BulkPaymentDialog = ({ invoices, currentUser, onClose, onFinished }: BulkPaymentDialogProps) => {
  const [payment, setPayment] = useState<InvoiceManualPaymentInput>(createEmptyManualPayment);
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);
  const [progress, setProgress] = useState<{ doneCount: number; totalCount: number } | null>(null);
  const [result, setResult] = useState<InvoiceBulkResult | null>(null);
  const [saveError, setSaveError] = useState('');
  // El plan se fija con lo marcado al abrir: si un invoice se paga mientras el
  // diálogo está abierto, el service lo detecta y lo cuenta como saltado.
  const [plan] = useState(() => planBulkPayment(invoices));
  const paymentErrors = getManualPaymentErrors(payment, plan.latestIssueDate);
  const shownErrors = hasTriedSubmit ? paymentErrors : {};
  const isSaving = progress !== null;
  const hasInvoicesToPay = plan.unpaidInvoices.length > 0;
  const submitLabel = progress
    ? `Recording ${progress.doneCount} of ${progress.totalCount}…`
    : `Record ${pluralize(plan.unpaidInvoices.length, 'Payment', 'Payments')}`;
  const issueDateHelp = plan.latestIssueDate
    ? `The payment date cannot be before ${formatDate(plan.latestIssueDate)}, the latest issue date selected.`
    : '';

  const handlePaymentChange = (field: keyof InvoiceManualPaymentInput, value: string) => {
    setPayment((currentPayment) => ({ ...currentPayment, [field]: value }));
  };

  const handleClose = () => {
    if (result) onFinished(result);
    else onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasTriedSubmit(true);
    if (Object.keys(paymentErrors).length > 0 || isSaving || !hasInvoicesToPay) return;
    if (!currentUser) {
      setSaveError('Your user profile is not loaded. Reload the app and try again.');
      return;
    }
    setSaveError('');
    setProgress({ doneCount: 0, totalCount: plan.unpaidInvoices.length });
    try {
      const runResult = await recordPaymentsInBulk(
        plan.unpaidInvoices,
        payment,
        { id: currentUser.id, name: fullName(currentUser) },
        (doneCount, totalCount) => setProgress({ doneCount, totalCount }),
      );
      setResult({ ...runResult, skipped: [...plan.skipped, ...runResult.skipped] });
    } catch (error) {
      console.error('Could not record the payments:', error);
      setSaveError('Could not record the payments. Check your connection and the Activity of each invoice.');
    } finally {
      setProgress(null);
    }
  };

  if (result) {
    return (
      <InvoiceDialog title="Record payments" size="narrow" onClose={handleClose}>
        <div className="invd-body">
          <p className="invbd-result-text">{describeBulkResult(RESULT_ACTION_TEXT, result).text}</p>
          <InvoiceBulkIssueList title="Failed" issues={result.failed} tone="error" />
          <InvoiceBulkIssueList title="Skipped" issues={result.skipped} tone="warning" />
        </div>
        <footer className="invd-footer">
          <button type="button" className="btn-primary invd-primary-btn" onClick={handleClose}>Done</button>
        </footer>
      </InvoiceDialog>
    );
  }

  return (
    <InvoiceDialog
      title="Record payments"
      subtitle={`${pluralize(invoices.length, 'invoice', 'invoices')} selected`}
      size="narrow"
      isCloseDisabled={isSaving}
      onClose={handleClose}
    >
      <form className="invbd-form" noValidate onSubmit={handleSubmit}>
        <div className="invd-body">
          <div className="invbd-summary">
            <span className="invbd-summary-label">
              {`Full payment of ${pluralize(plan.unpaidInvoices.length, 'invoice', 'invoices')}`}
            </span>
            <strong className="invbd-summary-value">{formatCents(plan.totalCents)}</strong>
          </div>
          <InvoiceBulkIssueList title="Will be skipped" issues={plan.skipped} tone="warning" />
          {hasInvoicesToPay ? (
            <>
              <p className="invf-help">
                The same method, date, reference and note are recorded on each invoice, each one for its own total.
                {issueDateHelp && ` ${issueDateHelp}`}
              </p>
              <InvoiceManualPaymentFields payment={payment} onPaymentChange={handlePaymentChange} errors={shownErrors} />
            </>
          ) : (
            <p className="invf-help">All the selected invoices are already paid. There is nothing to record.</p>
          )}
        </div>
        <footer className="invd-footer">
          {saveError && <p className="invd-footer-error" role="alert">{saveError}</p>}
          <button type="button" className="invd-secondary-btn" disabled={isSaving} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary invd-primary-btn" disabled={isSaving || !hasInvoicesToPay}>
            {submitLabel}
          </button>
        </footer>
      </form>
    </InvoiceDialog>
  );
};

export default BulkPaymentDialog;
