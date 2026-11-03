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
import { describeBulkResult } from '../invoiceBulk';
import { deleteInvoicesInBulk } from '../services/invoiceBulkService';
import InvoiceDialog from './InvoiceDialog';
import InvoiceFormField from './InvoiceFormField';
import InvoiceBulkIssueList from './InvoiceBulkIssueList';
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
  const [plan] = useState(() => planDeletion(invoices));
  const [reason, setReason] = useState('');
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);
  const [progress, setProgress] = useState<{ doneCount: number; totalCount: number } | null>(null);
  const [result, setResult] = useState<InvoiceBulkResult | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const isDeleting = progress !== null;
  const isSingle = invoices.length === 1;
  const deleteCount = plan.deletableInvoices.length;
  const title = isSingle ? `Delete ${invoices[0].number}` : `Delete ${pluralize(invoices.length, 'invoice', 'invoices')}`;
  const reasonError = reason.trim() ? '' : 'Write why the invoice is deleted.';
  const submitLabel = progress
    ? `Deleting ${Math.min(progress.doneCount + 1, progress.totalCount)} of ${progress.totalCount}…`
    : `Delete ${isSingle ? 'Invoice' : pluralize(deleteCount, 'Invoice', 'Invoices')}`;

  const handleClose = () => {
    if (result) onFinished(result);
    else onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasTriedSubmit(true);
    if (reasonError || isDeleting || deleteCount === 0) return;
    if (!currentUser) {
      setDeleteError('Your user profile is not loaded. Reload the app and try again.');
      return;
    }
    setDeleteError('');
    setProgress({ doneCount: 0, totalCount: deleteCount });
    try {
      const runResult = await deleteInvoicesInBulk(
        plan.deletableInvoices,
        reason,
        { id: currentUser.id, name: fullName(currentUser) },
        (doneCount, totalCount) => setProgress({ doneCount, totalCount }),
      );
      const finalResult = { ...runResult, skipped: [...plan.skipped, ...runResult.skipped] };
      // Uno solo y sin problemas: se cierra y la página avisa (con Undo).
      const isCleanSingle = isSingle && finalResult.doneInvoices.length === 1;
      if (isCleanSingle) onFinished(finalResult);
      else setResult(finalResult);
    } catch (error) {
      console.error('Could not delete the invoices:', error);
      setDeleteError('Could not delete the invoices. Check your connection and try again.');
    } finally {
      setProgress(null);
    }
  };

  if (result) {
    return (
      <InvoiceDialog title={title} size="narrow" onClose={handleClose}>
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
    <InvoiceDialog title={title} size="narrow" isCloseDisabled={isDeleting} onClose={handleClose}>
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
                disabled={isDeleting}
                onChange={(event) => setReason(event.target.value)}
              />
            </InvoiceFormField>
          )}
        </div>
        <footer className="invd-footer">
          {deleteError && <p className="invd-footer-error" role="alert">{deleteError}</p>}
          <button type="button" className="invd-secondary-btn" disabled={isDeleting} onClick={onClose}>Cancel</button>
          <button type="submit" className="invd-danger-btn" disabled={isDeleting || deleteCount === 0}>
            {isDeleting ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
            {` ${submitLabel}`}
          </button>
        </footer>
      </form>
    </InvoiceDialog>
  );
};

export default DeleteInvoicesDialog;
