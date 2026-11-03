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
import { planBulkPayment } from '../invoiceBulk';
import { recordPaymentsInBulk } from '../services/invoiceBulkService';
import { getBulkProgressLabel, useBulkRun } from '../hooks/useBulkRun';
import InvoiceDialog from './InvoiceDialog';
import InvoiceManualPaymentFields from './InvoiceManualPaymentFields';
import InvoiceBulkIssueList from './InvoiceBulkIssueList';
import InvoiceBulkResultView from './InvoiceBulkResultView';
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
  // Lo marcado se congela al abrir: si un invoice se paga mientras el diálogo
  // está abierto, el service lo detecta y lo cuenta como saltado.
  const bulkRun = useBulkRun(invoices, { onClose, onFinished });
  const { frozenInvoices, progress, isRunning, result } = bulkRun;
  const [plan] = useState(() => planBulkPayment(frozenInvoices));
  const [payment, setPayment] = useState<InvoiceManualPaymentInput>(createEmptyManualPayment);
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);
  const paymentErrors = getManualPaymentErrors(payment, plan.latestIssueDate);
  const shownErrors = hasTriedSubmit ? paymentErrors : {};
  const hasInvoicesToPay = plan.unpaidInvoices.length > 0;
  const submitLabel = progress
    ? getBulkProgressLabel('Recording', progress)
    : `Record ${pluralize(plan.unpaidInvoices.length, 'Payment', 'Payments')}`;
  const issueDateHelp = plan.latestIssueDate
    ? `The payment date cannot be before ${formatDate(plan.latestIssueDate)}, the latest issue date selected.`
    : '';

  const handlePaymentChange = (field: keyof InvoiceManualPaymentInput, value: string) => {
    setPayment((currentPayment) => ({ ...currentPayment, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasTriedSubmit(true);
    if (Object.keys(paymentErrors).length > 0 || isRunning || !hasInvoicesToPay) return;
    if (!currentUser) {
      bulkRun.setRunError('Your user profile is not loaded. Reload the app and try again.');
      return;
    }
    const actor = { id: currentUser.id, name: fullName(currentUser) };
    const runResult = await bulkRun.run(
      plan.unpaidInvoices.length,
      (onProgress) => recordPaymentsInBulk(plan.unpaidInvoices, payment, actor, onProgress),
      {
        skipped: plan.skipped,
        errorMessage: 'Could not record the payments. Check your connection and the Activity of each invoice.',
      },
    );
    if (runResult) bulkRun.showResult(runResult);
  };

  if (result) {
    return (
      <InvoiceBulkResultView
        title="Record payments"
        actionText={RESULT_ACTION_TEXT}
        result={result}
        onDone={bulkRun.handleClose}
      />
    );
  }

  return (
    <InvoiceDialog
      title="Record payments"
      subtitle={`${pluralize(frozenInvoices.length, 'invoice', 'invoices')} selected`}
      size="narrow"
      isCloseDisabled={isRunning}
      onClose={bulkRun.handleClose}
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
          {bulkRun.runError && <p className="invd-footer-error" role="alert">{bulkRun.runError}</p>}
          <button type="button" className="invd-secondary-btn" disabled={isRunning} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary invd-primary-btn" disabled={isRunning || !hasInvoicesToPay}>
            {submitLabel}
          </button>
        </footer>
      </form>
    </InvoiceDialog>
  );
};

export default BulkPaymentDialog;
