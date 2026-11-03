// Send invoice en bloque: se elige una vez qué se manda (PDF y/o enlace de
// Stripe) y cada invoice marcado va al correo de SU cliente, uno tras otro, con
// el avance a la vista. Antes de enviar dice cuáles se saltan y por qué (sin
// correo válido, sin enlace de Stripe, pagado sin PDF). Máximo MAX_BULK_SEND
// por vez. Al terminar muestra cuántos salieron y cuáles fallaron.
import { useId, useState, type FormEvent } from 'react';
import type { BulkSendOptions, Invoice, InvoiceBulkResult, Property, SystemUser } from '../../../types/index';
import { fullName } from '../../../utils/homeData';
import { pluralize } from '../../../utils/countFormat';
import { MAX_BULK_SEND, describeBulkResult, planBulkSend } from '../invoiceBulk';
import { sendInvoicesInBulk } from '../services/invoiceBulkService';
import InvoiceDialog from './InvoiceDialog';
import InvoiceBulkIssueList from './InvoiceBulkIssueList';
import './InvoiceFormModal.css';
import './InvoiceBulkDialog.css';

/** Texto del resultado ("5 invoices sent."). */
const RESULT_ACTION_TEXT = 'sent';

interface BulkSendDialogProps {
  /** Invoices marcados. */
  invoices: Invoice[];
  /** Casa del job de un invoice (sus fotos van al PDF). */
  findJobProperty: (invoice: Invoice) => Property | null;
  currentUser: SystemUser | null;
  /** Se cierra sin haber enviado nada. */
  onClose: () => void;
  /** Se cierra después de enviar: la vista limpia la selección y avisa. */
  onFinished: (result: InvoiceBulkResult) => void;
}

/** Por qué no se puede enviar con estas opciones ('' = se puede). */
const getSendBlocker = (options: BulkSendOptions, sendCount: number): string => {
  if (!options.sendPdf && !options.sendPaymentLink) return 'Choose what to send: the PDF, the payment link or both.';
  if (sendCount === 0) return 'None of the selected invoices can be sent with these options.';
  if (sendCount > MAX_BULK_SEND) {
    return `Up to ${MAX_BULK_SEND} invoices can be emailed at once (${sendCount} selected). Unselect some and try again.`;
  }
  return '';
};

const BulkSendDialog = ({ invoices, findJobProperty, currentUser, onClose, onFinished }: BulkSendDialogProps) => {
  const fieldIdPrefix = useId();
  const pdfOptionId = `${fieldIdPrefix}-pdf`;
  const paymentLinkOptionId = `${fieldIdPrefix}-card`;
  const [options, setOptions] = useState<BulkSendOptions>({ sendPdf: true, sendPaymentLink: false });
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);
  const [progress, setProgress] = useState<{ doneCount: number; totalCount: number } | null>(null);
  const [result, setResult] = useState<InvoiceBulkResult | null>(null);
  const [sendError, setSendError] = useState('');
  const plan = planBulkSend(invoices, options);
  const sendBlocker = getSendBlocker(options, plan.items.length);
  const isSending = progress !== null;
  const submitLabel = progress
    ? `Sending ${Math.min(progress.doneCount + 1, progress.totalCount)} of ${progress.totalCount}…`
    : `Send ${pluralize(plan.items.length, 'Invoice', 'Invoices')}`;

  const handleClose = () => {
    if (result) onFinished(result);
    else onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasTriedSubmit(true);
    if (sendBlocker || isSending) return;
    if (!currentUser) {
      setSendError('Your user profile is not loaded. Reload the app and try again.');
      return;
    }
    // Lo que se manda queda fijo al empezar (las opciones no cambian a medio envío).
    const { items, skipped } = plan;
    setSendError('');
    setProgress({ doneCount: 0, totalCount: items.length });
    try {
      const runResult = await sendInvoicesInBulk(
        items,
        findJobProperty,
        { id: currentUser.id, name: fullName(currentUser) },
        (doneCount, totalCount) => setProgress({ doneCount, totalCount }),
      );
      setResult({ ...runResult, skipped });
    } catch (error) {
      console.error('Could not send the invoices:', error);
      setSendError('Could not send the invoices. Check the Activity of each invoice before trying again.');
    } finally {
      setProgress(null);
    }
  };

  if (result) {
    return (
      <InvoiceDialog title="Send invoices" size="narrow" onClose={handleClose}>
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
      title="Send invoices"
      subtitle={`${pluralize(invoices.length, 'invoice', 'invoices')} selected`}
      size="narrow"
      isCloseDisabled={isSending}
      onClose={handleClose}
    >
      <form className="invbd-form" noValidate onSubmit={handleSubmit}>
        <div className="invd-body">
          <div className="invf-option-card">
            <label className="invf-option-row" htmlFor={pdfOptionId}>
              <input
                id={pdfOptionId}
                type="checkbox"
                checked={options.sendPdf}
                disabled={isSending}
                onChange={(event) => setOptions({ ...options, sendPdf: event.target.checked })}
              />
              <span className="invf-option-copy">
                <span className="invf-option-title">Email invoice as PDF</span>
                <span className="invf-option-help">Each client receives the PDF of their invoice as an attachment.</span>
              </span>
            </label>
            <label className="invf-option-row" htmlFor={paymentLinkOptionId}>
              <input
                id={paymentLinkOptionId}
                type="checkbox"
                checked={options.sendPaymentLink}
                disabled={isSending}
                onChange={(event) => setOptions({ ...options, sendPaymentLink: event.target.checked })}
              />
              <span className="invf-option-copy">
                <span className="invf-option-title">Email invoice for card payment</span>
                <span className="invf-option-help">
                  Uses the Stripe payment link saved on each invoice. Paid invoices never get a payment link.
                </span>
              </span>
            </label>
          </div>
          <p className="invf-help">
            {`${pluralize(plan.items.length, 'invoice', 'invoices')} will be sent, each one to its client's email. `}
            Sending a Needs Invoice moves it to Pending.
          </p>
          <InvoiceBulkIssueList title="Will be skipped" issues={plan.skipped} tone="warning" />
          {hasTriedSubmit && sendBlocker && <p className="invf-error" role="alert">{sendBlocker}</p>}
          {isSending && <p className="invf-help" aria-live="polite">Keep this window open until all the emails are sent.</p>}
        </div>
        <footer className="invd-footer">
          {sendError && <p className="invd-footer-error" role="alert">{sendError}</p>}
          <button type="button" className="invd-secondary-btn" disabled={isSending} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary invd-primary-btn" disabled={isSending}>
            {submitLabel}
          </button>
        </footer>
      </form>
    </InvoiceDialog>
  );
};

export default BulkSendDialog;
