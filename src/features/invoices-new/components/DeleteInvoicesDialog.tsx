// Delete: manda uno o varios invoices a la PAPELERA con un motivo obligatorio
// (el mismo para todos). Salen de la lista y de los totales, conservan su
// número y su Activity, y se pueden restaurar. Los pagados se saltan. Si un
// invoice ya tiene el enlace de Stripe enviado, avisa que hay que desactivarlo
// en Stripe (el cliente todavía podría pagar). Con varios, muestra el avance y
// al final cuáles no se borraron.
import { useId, useState, type FormEvent } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import type { Invoice, InvoiceBulkIssue, InvoiceBulkResult, SystemUser } from '../../../types/index';
import { fullName } from '../../../utils/homeData';
import { pluralize } from '../../../utils/countFormat';
import { INVOICE_LIMITS } from '../invoiceLimits';
import { canMoveToTrash, isDeletedInvoice } from '../invoiceStatus';
import { deleteInvoicesInBulk } from '../services/invoiceBulkService';
import { getBulkProgressLabel, useBulkRun } from '../hooks/useBulkRun';
import InvoiceDialog from './InvoiceDialog';
import InvoiceFormField from './InvoiceFormField';
import InvoiceBulkIssueList from './InvoiceBulkIssueList';
import InvoiceBulkResultView from './InvoiceBulkResultView';
import './InvoiceFormModal.css';
import './InvoiceBulkDialog.css';

/** Texto del resultado ("3 invoices deleted."). */
const RESULT_ACTION_TEXT = 'deleted';

/** Qué se borra y qué se salta, con lo marcado al abrir. */
const planDeletion = (invoices: readonly Invoice[]) => ({
  deletableInvoices: invoices.filter(canMoveToTrash),
  skipped: invoices
    .filter((invoice) => !canMoveToTrash(invoice))
    .map((invoice): InvoiceBulkIssue => ({ invoice, reason: isDeletedInvoice(invoice) ? 'Already deleted' : 'Paid' })),
  withPaymentLink: invoices
    .filter((invoice) => canMoveToTrash(invoice) && invoice.status === 'payment_link_sent')
    .map((invoice): InvoiceBulkIssue => ({ invoice, reason: 'Deactivate its link in Stripe' })),
});

interface DeleteInvoicesDialogProps {
  /** El invoice de la fila o del detalle, o los marcados. */
  invoices: Invoice[];
  currentUser: SystemUser | null;
  onClose: () => void;
  /** Terminó: la vista limpia la selección y avisa (con Undo). */
  onFinished: (result: InvoiceBulkResult) => void;
}

const DeleteInvoicesDialog = ({ invoices, currentUser, onClose, onFinished }: DeleteInvoicesDialogProps) => {
  const reasonId = useId();
  const bulkRun = useBulkRun(invoices, { onClose, onFinished });
  const { frozenInvoices, progress, isRunning, result } = bulkRun;
  const [plan] = useState(() => planDeletion(frozenInvoices));
  const [reason, setReason] = useState('');
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);
  const isSingle = frozenInvoices.length === 1;
  const deleteCount = plan.deletableInvoices.length;
  const title = isSingle
    ? `Delete ${frozenInvoices[0].number}`
    : `Delete ${pluralize(frozenInvoices.length, 'invoice', 'invoices')}`;
  const reasonError = reason.trim() ? '' : 'Write why the invoice is deleted.';
  const submitLabel = progress
    ? getBulkProgressLabel('Deleting', progress)
    : `Delete ${isSingle ? 'Invoice' : pluralize(deleteCount, 'Invoice', 'Invoices')}`;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasTriedSubmit(true);
    if (reasonError || isRunning || deleteCount === 0) return;
    if (!currentUser) {
      bulkRun.setRunError('Your user profile is not loaded. Reload the app and try again.');
      return;
    }
    const actor = { id: currentUser.id, name: fullName(currentUser) };
    const runResult = await bulkRun.run(
      deleteCount,
      (onProgress) => deleteInvoicesInBulk(plan.deletableInvoices, reason, actor, onProgress),
      { skipped: plan.skipped, errorMessage: 'Could not delete the invoices. Check your connection and try again.' },
    );
    if (!runResult) return;
    // Uno solo y sin problemas: se cierra y la página avisa (con Undo).
    const isCleanSingle = isSingle && runResult.doneInvoices.length === 1;
    if (isCleanSingle) onFinished(runResult);
    else bulkRun.showResult(runResult);
  };

  if (result) {
    return <InvoiceBulkResultView title={title} actionText={RESULT_ACTION_TEXT} result={result} onDone={bulkRun.handleClose} />;
  }

  return (
    <InvoiceDialog title={title} size="narrow" isCloseDisabled={isRunning} onClose={bulkRun.handleClose}>
      <form className="invbd-form" noValidate onSubmit={handleSubmit}>
        <div className="invd-body">
          <p className="invf-help">
            Deleted invoices leave the list and the totals. They keep their number and Activity, and can be restored
            from the “Deleted” status filter.
          </p>
          <InvoiceBulkIssueList title="Payment link sent" issues={plan.withPaymentLink} tone="warning" />
          {plan.withPaymentLink.length > 0 && (
            <p className="invf-warning" role="status">
              The client already received a Stripe payment link and could still pay it. Deactivate the link in Stripe.
            </p>
          )}
          <InvoiceBulkIssueList title="Will be skipped" issues={plan.skipped} tone="warning" />
          {deleteCount === 0 ? (
            <p className="invf-help">Paid invoices cannot be deleted. There is nothing to delete.</p>
          ) : (
            <InvoiceFormField htmlFor={reasonId} label="Reason" error={hasTriedSubmit ? reasonError : undefined}>
              <textarea
                id={reasonId}
                className="invf-input invf-textarea"
                rows={2}
                maxLength={INVOICE_LIMITS.deletionReason}
                placeholder="Duplicated, created by mistake…"
                value={reason}
                disabled={isRunning}
                onChange={(event) => setReason(event.target.value)}
              />
            </InvoiceFormField>
          )}
        </div>
        <footer className="invd-footer">
          {bulkRun.runError && <p className="invd-footer-error" role="alert">{bulkRun.runError}</p>}
          <button type="button" className="invd-secondary-btn" disabled={isRunning} onClick={onClose}>Cancel</button>
          <button type="submit" className="invd-danger-btn" disabled={isRunning || deleteCount === 0}>
            {isRunning ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
            {` ${submitLabel}`}
          </button>
        </footer>
      </form>
    </InvoiceDialog>
  );
};

export default DeleteInvoicesDialog;
