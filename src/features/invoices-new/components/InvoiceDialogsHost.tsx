// Todos los diálogos de la página de Invoices New, en el orden de apilado: la
// cuenta del cliente va DEBAJO del detalle (un invoice de la cuenta abre su
// detalle encima), y el formulario, los pagos, envíos, Delete y la vista previa
// van encima de los dos. Qué está abierto lo dice useInvoiceDialogs; qué pasa
// al terminar, useInvoicePageActions.
import type { InvoiceActions, InvoicesNewRights, Property, SystemUser, YmdDate } from '../../../types/index';
import type { InvoiceDialogsController } from '../hooks/useInvoiceDialogs';
import type { InvoicePageFinishers } from '../hooks/useInvoicePageActions';
import ClientAccountModal from './ClientAccountModal';
import InvoiceDetailModal from './InvoiceDetailModal';
import InvoiceFormModal from './InvoiceFormModal';
import RecordPaymentDialog from './RecordPaymentDialog';
import SendInvoiceDialog from './SendInvoiceDialog';
import BulkPaymentDialog from './BulkPaymentDialog';
import BulkSendDialog from './BulkSendDialog';
import DeleteInvoicesDialog from './DeleteInvoicesDialog';
import SavedInvoicePdfPreview from './SavedInvoicePdfPreview';

interface InvoiceDialogsHostProps {
  dialogs: InvoiceDialogsController;
  invoiceActions: InvoiceActions;
  finishers: InvoicePageFinishers;
  rights: InvoicesNewRights;
  /** Casas del listener global de App.tsx (los jobs del formulario). */
  properties: Property[];
  currentUser: SystemUser | null;
  today: YmdDate;
}

const InvoiceDialogsHost = ({
  dialogs, invoiceActions, finishers, rights, properties, currentUser, today,
}: InvoiceDialogsHostProps) => {
  const { detailInvoice, formTarget, paymentInvoice, sendInvoice, bulkDialog, invoicesToDelete, previewInvoice } = dialogs;

  return (
    <>
      {dialogs.clientAccountKey && (
        <ClientAccountModal
          clientKey={dialogs.clientAccountKey}
          invoices={dialogs.clientInvoices.invoices}
          isLoading={dialogs.clientInvoices.isLoading}
          hasError={dialogs.clientInvoices.hasError}
          today={today}
          onViewInvoice={invoiceActions.viewInvoice}
          onClose={dialogs.closeClientAccount}
        />
      )}
      {detailInvoice && (
        <InvoiceDetailModal
          invoice={detailInvoice}
          jobProperty={dialogs.findJobProperty(detailInvoice)}
          today={today}
          rights={rights}
          currentUser={currentUser}
          actions={invoiceActions}
          onClose={dialogs.closeDetail}
        />
      )}
      {formTarget && (
        <InvoiceFormModal
          invoice={formTarget.invoice}
          liveInvoice={dialogs.formLiveInvoice}
          properties={properties}
          currentUser={currentUser}
          onClose={dialogs.closeForm}
          onSaved={finishers.finishSave}
        />
      )}
      {paymentInvoice && (
        <RecordPaymentDialog
          invoice={paymentInvoice}
          currentUser={currentUser}
          onClose={dialogs.closePayment}
          onRecorded={finishers.finishPayment}
        />
      )}
      {sendInvoice && (
        <SendInvoiceDialog
          invoice={sendInvoice}
          jobProperty={dialogs.findJobProperty(sendInvoice)}
          currentUser={currentUser}
          onClose={dialogs.closeSend}
          onSent={finishers.finishSend}
        />
      )}
      {bulkDialog?.action === 'markAsPaid' && (
        <BulkPaymentDialog
          invoices={bulkDialog.invoices}
          currentUser={currentUser}
          onClose={dialogs.closeBulk}
          onFinished={finishers.finishBulkAction}
        />
      )}
      {bulkDialog?.action === 'send' && (
        <BulkSendDialog
          invoices={bulkDialog.invoices}
          findJobProperty={dialogs.findJobProperty}
          currentUser={currentUser}
          onClose={dialogs.closeBulk}
          onFinished={finishers.finishBulkAction}
        />
      )}
      {invoicesToDelete && invoicesToDelete.length > 0 && (
        <DeleteInvoicesDialog
          invoices={invoicesToDelete}
          currentUser={currentUser}
          onClose={dialogs.closeDelete}
          onFinished={finishers.finishDelete}
        />
      )}
      {previewInvoice && (
        <SavedInvoicePdfPreview
          invoice={previewInvoice}
          jobProperty={dialogs.findJobProperty(previewInvoice)}
          onClose={dialogs.closePreview}
        />
      )}
    </>
  );
};

export default InvoiceDialogsHost;
