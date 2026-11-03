// src/features/invoices-new/hooks/useInvoicePageActions.ts
// ============================================================================
// Acciones de la página de Invoices New, en un solo lugar:
//   · `invoiceActions`: lo que se hace con UN invoice (abrir el detalle, editar,
//     PDF, enviar, pagar, borrar, restaurar…). Las usan la fila, el detalle y la
//     cuenta del cliente.
//   · `finish*`: lo que pasa cuando un diálogo termina (cerrarlo, avisar, limpiar
//     la selección, Undo de Delete).
// ============================================================================
import type {
  Actor, Invoice, InvoiceActions, InvoiceBulkResult, InvoiceDeliveryOutcome, InvoiceSaveResult, SystemUser,
} from '../../../types/index';
import { fullName } from '../../../utils/homeData';
import { describeBulkResult } from '../invoiceBulk';
import { describeDeliveryOutcome, getMissingPhotosWarning } from '../invoiceDelivery';
import { downloadSavedInvoicePdf } from '../invoicePdfFile';
import { restoreInvoices } from '../services/invoiceBulkService';
import type { InvoiceBulkAction, InvoiceDialogsController } from './useInvoiceDialogs';
import type { InvoiceNoticeController } from './useInvoiceNotice';

/** Texto del aviso al terminar cada acción en bloque. */
const BULK_RESULT_TEXT: Record<InvoiceBulkAction, string> = {
  markAsPaid: 'marked as paid',
  send: 'sent',
};

const PROFILE_NOT_LOADED = 'Your user profile is not loaded. Reload the app and try again.';

interface InvoicePageActionsInput {
  dialogs: InvoiceDialogsController;
  notices: InvoiceNoticeController;
  currentUser: SystemUser | null;
  /** Al crear un invoice: limpiar los filtros para que quede a la vista. */
  onInvoiceCreated: () => void;
  /** Al terminar una acción en bloque o Delete: limpiar la selección. */
  onSelectionDone: () => void;
}

export function useInvoicePageActions({
  dialogs, notices, currentUser, onInvoiceCreated, onSelectionDone,
}: InvoicePageActionsInput) {
  const { showNotice, updateNotice } = notices;
  const actor: Actor | null = currentUser ? { id: currentUser.id, name: fullName(currentUser) } : null;

  // Restore (y Undo de Delete): saca de la papelera y avisa.
  const restoreAndNotify = async (invoices: Invoice[]) => {
    if (!actor) {
      showNotice(PROFILE_NOT_LOADED, 'error');
      return;
    }
    const noticeId = showNotice('Restoring…', 'info');
    const { text, isProblem } = describeBulkResult('restored', await restoreInvoices(invoices, actor));
    updateNotice(noticeId, text, isProblem ? 'error' : 'success');
  };

  // Download PDF desde el menú o el detalle (sin abrir la vista previa).
  const downloadPdfAndNotify = async (invoice: Invoice) => {
    const noticeId = showNotice(`Preparing the PDF of ${invoice.number}…`, 'info');
    try {
      const { missingPhotoCount } = await downloadSavedInvoicePdf(invoice, dialogs.findJobProperty(invoice));
      if (missingPhotoCount > 0) {
        updateNotice(noticeId, `PDF of ${invoice.number} downloaded. ${getMissingPhotosWarning(missingPhotoCount)}`, 'error');
      } else {
        updateNotice(noticeId, `PDF of ${invoice.number} downloaded.`, 'success');
      }
    } catch (error) {
      console.error('Could not create the PDF:', error);
      updateNotice(noticeId, `Could not create the PDF of ${invoice.number}. Check your connection and try again.`, 'error');
    }
  };

  const invoiceActions: InvoiceActions = {
    viewInvoice: (invoice) => dialogs.openDetail(invoice.id),
    editInvoice: dialogs.openEdit,
    markAsPaid: dialogs.openPayment,
    previewPdf: dialogs.openPreview,
    downloadPdf: downloadPdfAndNotify,
    sendInvoice: dialogs.openSend,
    openClientAccount: dialogs.openClientAccount,
    deleteInvoice: (invoice) => dialogs.openDelete([invoice]),
    restoreInvoice: (invoice) => restoreAndNotify([invoice]),
  };

  const finishSave = (result: InvoiceSaveResult) => {
    dialogs.closeForm();
    const savedText = result.isNew ? `Invoice ${result.number} created.` : `Invoice ${result.number} saved.`;
    const deliveryText = result.delivery ? describeDeliveryOutcome(result.delivery) : null;
    showNotice(deliveryText ? `${savedText} ${deliveryText.text}` : savedText, deliveryText?.isProblem ? 'error' : 'success');
    // Al crear se limpian los filtros y se abre su detalle, para que el invoice
    // nuevo quede a la vista (alcance §9). El detalle aparece cuando el listener lo trae.
    if (result.isNew) {
      onInvoiceCreated();
      dialogs.openDetail(result.id);
    }
  };

  const finishSend = (invoice: Invoice, outcome: InvoiceDeliveryOutcome) => {
    dialogs.closeSend();
    const { text, isProblem } = describeDeliveryOutcome(outcome);
    showNotice(`Invoice ${invoice.number}: ${text}`, isProblem ? 'error' : 'success');
  };

  const finishPayment = (invoice: Invoice) => {
    dialogs.closePayment();
    showNotice(`Payment recorded for ${invoice.number}.`, 'success');
  };

  const finishBulkAction = (result: InvoiceBulkResult) => {
    const actionText = dialogs.bulkDialog ? BULK_RESULT_TEXT[dialogs.bulkDialog.action] : 'updated';
    const { text, isProblem } = describeBulkResult(actionText, result);
    dialogs.closeBulk();
    onSelectionDone();
    showNotice(text, isProblem ? 'error' : 'success');
  };

  // Delete terminó: limpia la selección, cierra el detalle de lo borrado y avisa con Undo.
  const finishDelete = (result: InvoiceBulkResult) => {
    dialogs.closeDelete();
    onSelectionDone();
    if (result.doneInvoices.some((invoice) => invoice.id === dialogs.detailInvoiceId)) dialogs.closeDetail();
    const isSingle = result.doneInvoices.length === 1 && result.skipped.length === 0 && result.failed.length === 0;
    const { text, isProblem } = describeBulkResult('deleted', result);
    const undoAction = result.doneInvoices.length > 0
      ? { label: 'Undo', onAction: () => restoreAndNotify(result.doneInvoices) }
      : undefined;
    showNotice(isSingle ? `Invoice ${result.doneInvoices[0].number} deleted.` : text, isProblem ? 'error' : 'success', undoAction);
  };

  return {
    invoiceActions,
    finishers: { finishSave, finishSend, finishPayment, finishBulkAction, finishDelete },
  };
}

export type InvoicePageFinishers = ReturnType<typeof useInvoicePageActions>['finishers'];
