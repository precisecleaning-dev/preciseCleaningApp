// Send invoice en bloque: se elige una vez qué se manda (PDF y/o enlace de
// Stripe) y cada invoice marcado va al correo de SU cliente, uno tras otro, con
// el avance a la vista. Antes de enviar dice cuáles se saltan y por qué (sin
// correo válido, sin enlace de Stripe, pagado sin PDF). Máximo MAX_BULK_SEND
// por vez. Al terminar muestra cuántos salieron y cuáles fallaron.
import { useState, type FormEvent } from 'react';
import type { BulkSendOptions, Invoice, InvoiceBulkResult, Property, SystemUser } from '../../../types/index';
import { fullName } from '../../../utils/homeData';
import { pluralize } from '../../../utils/countFormat';
import { MAX_BULK_SEND, planBulkSend } from '../invoiceBulk';
import { sendInvoicesInBulk } from '../services/invoiceBulkService';
import { getBulkProgressLabel, useBulkRun } from '../hooks/useBulkRun';
import InvoiceDialog from './InvoiceDialog';
import InvoiceBulkIssueList from './InvoiceBulkIssueList';
import InvoiceBulkResultView from './InvoiceBulkResultView';
import InvoiceDeliveryOptions from './InvoiceDeliveryOptions';
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
  // Lo marcado se congela al abrir: un Needs Invoice que se envía pasa a Pending
  // y sale de la página (y de la selección) a mitad del envío.
  const bulkRun = useBulkRun(invoices, { onClose, onFinished });
  const { frozenInvoices, progress, isRunning, result } = bulkRun;
  const [options, setOptions] = useState<BulkSendOptions>({ sendPdf: true, sendPaymentLink: false });
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);
  const plan = planBulkSend(frozenInvoices, options);
  const sendBlocker = getSendBlocker(options, plan.items.length);
  const submitLabel = progress
    ? getBulkProgressLabel('Sending', progress)
    : `Send ${pluralize(plan.items.length, 'Invoice', 'Invoices')}`;

  const handleOptionsChange = (patch: Partial<BulkSendOptions>) => {
    setOptions((currentOptions) => ({ ...currentOptions, ...patch }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasTriedSubmit(true);
    if (sendBlocker || isRunning) return;
    if (!currentUser) {
      bulkRun.setRunError('Your user profile is not loaded. Reload the app and try again.');
      return;
    }
    const actor = { id: currentUser.id, name: fullName(currentUser) };
    const runResult = await bulkRun.run(
      plan.items.length,
      (onProgress) => sendInvoicesInBulk(plan.items, findJobProperty, actor, onProgress),
      {
        skipped: plan.skipped,
        errorMessage: 'Could not send the invoices. Check the Activity of each invoice before trying again.',
      },
    );
    if (runResult) bulkRun.showResult(runResult);
  };

  if (result) {
    return (
      <InvoiceBulkResultView
        title="Send invoices"
        actionText={RESULT_ACTION_TEXT}
        result={result}
        onDone={bulkRun.handleClose}
      />
    );
  }

  return (
    <InvoiceDialog
      title="Send invoices"
      subtitle={`${pluralize(frozenInvoices.length, 'invoice', 'invoices')} selected`}
      size="narrow"
      isCloseDisabled={isRunning}
      onClose={bulkRun.handleClose}
    >
      <form className="invbd-form" noValidate onSubmit={handleSubmit}>
        <div className="invd-body">
          <InvoiceDeliveryOptions
            sendPdf={options.sendPdf}
            sendPaymentLink={options.sendPaymentLink}
            onChange={handleOptionsChange}
            pdfHelp="Each client receives the PDF of their invoice as an attachment."
            paymentLinkHelp="Uses the Stripe payment link saved on each invoice. Paid invoices never get a payment link."
            isDisabled={isRunning}
          />
          <p className="invf-help">
            {`${pluralize(plan.items.length, 'invoice', 'invoices')} will be sent, each one to its client's email. `}
            Sending a Needs Invoice moves it to Pending.
          </p>
          <InvoiceBulkIssueList title="Will be skipped" issues={plan.skipped} tone="warning" />
          {hasTriedSubmit && sendBlocker && <p className="invf-error" role="alert">{sendBlocker}</p>}
          {isRunning && <p className="invf-help" aria-live="polite">Keep this window open until all the emails are sent.</p>}
        </div>
        <footer className="invd-footer">
          {bulkRun.runError && <p className="invd-footer-error" role="alert">{bulkRun.runError}</p>}
          <button type="button" className="invd-secondary-btn" disabled={isRunning} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary invd-primary-btn" disabled={isRunning}>
            {submitLabel}
          </button>
        </footer>
      </form>
    </InvoiceDialog>
  );
};

export default BulkSendDialog;
