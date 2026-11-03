// ============================================================================
// ⭐ INVOICES NEW — módulo nuevo de invoices (el módulo "Invoices" de siempre
//    sigue aparte, sin cambios). Un invoice = un job y su cliente, con pagos,
//    PDF, envío por correo y enlace de Stripe. Se construye por etapas (ver
//    la nota "Invoices New" de code-notes.md).
//    Esta vista solo orquesta: permisos, datos (hooks de
//    features/invoices-new) y componentes.
// ============================================================================
import { useState } from 'react';
import type {
  ClientAccountKey, Invoice, InvoiceBulkResult, InvoiceDeliveryOutcome, InvoiceNoticeAction, InvoiceNoticeTone, Property,
  Role, SystemUser,
} from '../types/index';
import { todayIso } from '../utils/dateFormat';
import { getInvoicesNewRights } from '../features/invoices-new/invoicesNewPermissions';
import { useInvoicesWindow } from '../features/invoices-new/hooks/useInvoicesWindow';
import { useInvoiceFilters } from '../features/invoices-new/hooks/useInvoiceFilters';
import { useInvoiceList } from '../features/invoices-new/hooks/useInvoiceList';
import { getSelectionScopeKey, useInvoiceSelection } from '../features/invoices-new/hooks/useInvoiceSelection';
import { describeBulkResult } from '../features/invoices-new/invoiceBulk';
import { restoreInvoices } from '../features/invoices-new/services/invoiceBulkService';
import { fullName } from '../utils/homeData';
import { useClientInvoices } from '../features/invoices-new/hooks/useClientInvoices';
import { getClientAccountKey } from '../features/invoices-new/clientAccount';
import HistoryWindowNotice from '../components/HistoryWindowNotice';
import InvoicesNewHeader from '../features/invoices-new/components/InvoicesNewHeader';
import InvoiceSummaryCards from '../features/invoices-new/components/InvoiceSummaryCards';
import InvoiceFiltersBar from '../features/invoices-new/components/InvoiceFiltersBar';
import InvoiceRegister from '../features/invoices-new/components/InvoiceRegister';
import InvoiceFormModal from '../features/invoices-new/components/InvoiceFormModal';
import InvoiceSavedNotice from '../features/invoices-new/components/InvoiceSavedNotice';
import SavedInvoicePdfPreview from '../features/invoices-new/components/SavedInvoicePdfPreview';
import { downloadSavedInvoicePdf } from '../features/invoices-new/invoicePdfFile';
import { describeDeliveryOutcome, getMissingPhotosWarning } from '../features/invoices-new/invoiceDelivery';
import InvoiceDetailModal from '../features/invoices-new/components/InvoiceDetailModal';
import RecordPaymentDialog from '../features/invoices-new/components/RecordPaymentDialog';
import SendInvoiceDialog from '../features/invoices-new/components/SendInvoiceDialog';
import InvoiceBulkBar from '../features/invoices-new/components/InvoiceBulkBar';
import BulkPaymentDialog from '../features/invoices-new/components/BulkPaymentDialog';
import BulkSendDialog from '../features/invoices-new/components/BulkSendDialog';
import ClientAccountModal from '../features/invoices-new/components/ClientAccountModal';
import DeleteInvoicesDialog from '../features/invoices-new/components/DeleteInvoicesDialog';
import './InvoicesNewView.css';

interface InvoicesNewViewProps {
  onOpenMenu: () => void;
  /** Casas del listener global de App.tsx (ventana de 12 meses): los jobs del formulario. */
  properties: Property[];
  currentUser: SystemUser | null;
  activeRole: Role | null;
  isSuperAdmin: boolean;
}

/** Formulario abierto: crear (`invoice` null) o editar ese invoice. */
type InvoiceFormTarget = { invoice: Invoice | null } | null;

/** Acción en bloque abierta sobre los invoices marcados. */
type BulkAction = 'markAsPaid' | 'send' | null;

/** Texto del aviso al terminar cada acción en bloque. */
const BULK_RESULT_TEXT: Record<Exclude<BulkAction, null>, string> = {
  markAsPaid: 'marked as paid',
  send: 'sent',
};

const InvoicesNewView = ({ onOpenMenu, properties, currentUser, activeRole, isSuperAdmin }: InvoicesNewViewProps) => {
  const rights = getInvoicesNewRights(activeRole, isSuperAdmin);
  const today = todayIso();
  const invoicesWindow = useInvoicesWindow();
  const { filters, actions: filterActions, hasActiveFilters } = useInvoiceFilters();
  const invoiceList = useInvoiceList(invoicesWindow.invoices, filters, today);
  // Checkboxes de la página visible: con Edit (Mark as Paid, Send) o Delete; no en la vista Deleted.
  const selection = useInvoiceSelection(invoiceList.pageInvoices, getSelectionScopeKey(filters, invoiceList.page));
  const canSelect = (rights.canEdit || rights.canDelete) && filters.status !== 'deleted';
  // Delete (papelera): ids del invoice de la fila / detalle o de los marcados.
  const [deleteInvoiceIds, setDeleteInvoiceIds] = useState<string[] | null>(null);
  const [bulkAction, setBulkAction] = useState<BulkAction>(null);
  const [formTarget, setFormTarget] = useState<InvoiceFormTarget>(null);
  // Detalle y Record payment guardan el id: el invoice se toma EN VIVO de la lista.
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);
  const [sendInvoiceId, setSendInvoiceId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: InvoiceNoticeTone; action?: InvoiceNoticeAction } | null>(null);
  // Cuenta del cliente abierta: sus invoices de CUALQUIER fecha, en vivo.
  const [clientAccountKey, setClientAccountKey] = useState<ClientAccountKey | null>(null);
  const clientInvoices = useClientInvoices(clientAccountKey);
  // Un invoice de fuera de la ventana de 12 meses (abierto desde la cuenta del
  // cliente) se toma en vivo del listener de la cuenta.
  const findInvoice = (invoiceId: string | null) =>
    invoicesWindow.invoices.find((windowInvoice) => windowInvoice.id === invoiceId)
    ?? clientInvoices.invoices.find((clientInvoice) => clientInvoice.id === invoiceId)
    ?? null;
  const findJobProperty = (invoice: Invoice) => properties.find((property) => property.id === invoice.propertyId) ?? null;
  const detailInvoice = findInvoice(detailInvoiceId);
  const paymentInvoice = findInvoice(paymentInvoiceId);
  const previewInvoice = findInvoice(previewInvoiceId);
  const sendInvoice = findInvoice(sendInvoiceId);
  const invoicesToDelete = (deleteInvoiceIds ?? []).flatMap((invoiceId) => findInvoice(invoiceId) ?? []);
  const actor = currentUser ? { id: currentUser.id, name: fullName(currentUser) } : null;

  const handleInvoiceSaved = (result: { id: string; number: string; isNew: boolean; delivery: InvoiceDeliveryOutcome | null }) => {
    setFormTarget(null);
    const savedText = result.isNew ? `Invoice ${result.number} created.` : `Invoice ${result.number} saved.`;
    const deliveryText = result.delivery ? describeDeliveryOutcome(result.delivery) : null;
    setNotice({
      message: deliveryText ? `${savedText} ${deliveryText.text}` : savedText,
      tone: deliveryText?.isProblem ? 'error' : 'success',
    });
    // Al crear se limpian los filtros y se abre su detalle, para que el invoice
    // nuevo quede a la vista (alcance §9). El detalle aparece cuando el listener lo trae.
    if (result.isNew) {
      filterActions.clear();
      setDetailInvoiceId(result.id);
    }
  };

  const handleInvoiceSent = (invoice: Invoice, outcome: InvoiceDeliveryOutcome) => {
    setSendInvoiceId(null);
    const { text, isProblem } = describeDeliveryOutcome(outcome);
    setNotice({ message: `Invoice ${invoice.number}: ${text}`, tone: isProblem ? 'error' : 'success' });
  };

  const handleBulkFinished = (result: InvoiceBulkResult) => {
    const { text, isProblem } = describeBulkResult(bulkAction ? BULK_RESULT_TEXT[bulkAction] : 'updated', result);
    setBulkAction(null);
    selection.clear();
    setNotice({ message: text, tone: isProblem ? 'error' : 'success' });
  };

  // Undo de Delete y Restore: sacan de la papelera y avisan.
  const handleRestoreInvoices = async (invoices: Invoice[]) => {
    if (!actor) {
      setNotice({ message: 'Your user profile is not loaded. Reload the app and try again.', tone: 'error' });
      return;
    }
    setNotice({ message: 'Restoring…', tone: 'info' });
    const { text, isProblem } = describeBulkResult('restored', await restoreInvoices(invoices, actor));
    setNotice({ message: text, tone: isProblem ? 'error' : 'success' });
  };

  // Delete terminó: limpia la selección, cierra el detalle de lo borrado y avisa con Undo.
  const handleInvoicesDeleted = (result: InvoiceBulkResult) => {
    setDeleteInvoiceIds(null);
    selection.clear();
    if (result.doneInvoices.some((invoice) => invoice.id === detailInvoiceId)) setDetailInvoiceId(null);
    const isSingle = result.doneInvoices.length === 1 && result.skipped.length === 0 && result.failed.length === 0;
    const { text, isProblem } = describeBulkResult('deleted', result);
    setNotice({
      message: isSingle ? `Invoice ${result.doneInvoices[0].number} deleted.` : text,
      tone: isProblem ? 'error' : 'success',
      action: result.doneInvoices.length > 0
        ? { label: 'Undo', onAction: () => handleRestoreInvoices(result.doneInvoices) }
        : undefined,
    });
  };

  // La cuenta va DEBAJO del detalle: si se abre desde el detalle, el detalle se
  // cierra (al tocar un invoice de la cuenta, su detalle se abre encima).
  const handleOpenClientAccount = (invoice: Invoice) => {
    setDetailInvoiceId(null);
    setClientAccountKey(getClientAccountKey(invoice));
  };

  const handlePaymentRecorded = (invoice: Invoice) => {
    setPaymentInvoiceId(null);
    setNotice({ message: `Payment recorded for ${invoice.number}.`, tone: 'success' });
  };

  // Download PDF desde el menú o el detalle (sin abrir la vista previa).
  const handleDownloadPdf = async (invoice: Invoice) => {
    setNotice({ message: `Preparing the PDF of ${invoice.number}…`, tone: 'info' });
    try {
      const { missingPhotoCount } = await downloadSavedInvoicePdf(invoice, findJobProperty(invoice));
      if (missingPhotoCount > 0) {
        setNotice({ message: `PDF of ${invoice.number} downloaded. ${getMissingPhotosWarning(missingPhotoCount)}`, tone: 'error' });
      } else {
        setNotice({ message: `PDF of ${invoice.number} downloaded.`, tone: 'success' });
      }
    } catch (error) {
      console.error('Could not create the PDF:', error);
      setNotice({ message: `Could not create the PDF of ${invoice.number}. Check your connection and try again.`, tone: 'error' });
    }
  };

  return (
    <div className="fade-in invn-page">
      <InvoicesNewHeader
        onOpenMenu={onOpenMenu}
        canCreate={rights.canCreate}
        onCreateInvoice={() => setFormTarget({ invoice: null })}
      />
      <HistoryWindowNotice />
      {notice && (
        <InvoiceSavedNotice
          message={notice.message}
          tone={notice.tone}
          action={notice.action}
          onDismiss={() => setNotice(null)}
        />
      )}
      <InvoiceSummaryCards
        summary={invoiceList.summary}
        selectedCard={filters.card}
        onSelectCard={filterActions.selectCard}
        isLoading={invoicesWindow.isLoading}
      />
      <InvoiceFiltersBar
        search={filters.search}
        onSearchChange={filterActions.setSearch}
        status={filters.status}
        onStatusChange={filterActions.setStatus}
        dateRange={filters.dateRange}
        onDateRangeChange={filterActions.setDateRange}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={filterActions.clear}
      />
      {canSelect && selection.isSomeSelected && (
        <InvoiceBulkBar
          selectedCount={selection.selectedInvoices.length}
          canEdit={rights.canEdit}
          canDelete={rights.canDelete}
          onMarkAsPaid={() => setBulkAction('markAsPaid')}
          onSendInvoices={() => setBulkAction('send')}
          onDeleteInvoices={() => setDeleteInvoiceIds(selection.selectedInvoices.map((invoice) => invoice.id))}
          onClearSelection={selection.clear}
        />
      )}
      <InvoiceRegister
        pageInvoices={invoiceList.pageInvoices}
        filteredCount={invoiceList.filteredCount}
        windowCount={invoicesWindow.invoices.length}
        isLoading={invoicesWindow.isLoading}
        hasError={invoicesWindow.hasError}
        today={today}
        page={invoiceList.page}
        pageCount={invoiceList.pageCount}
        pageSize={filters.pageSize}
        onPageChange={filterActions.setPage}
        onPageSizeChange={filterActions.setPageSize}
        onClearFilters={filterActions.clear}
        canEdit={rights.canEdit}
        canDelete={rights.canDelete}
        selection={canSelect ? {
          selectedIds: selection.selectedIds,
          isAllSelected: selection.isAllSelected,
          isSomeSelected: selection.isSomeSelected,
          onToggleInvoice: selection.toggleInvoice,
          onToggleAll: selection.toggleAll,
        } : null}
        onViewInvoice={(invoice) => setDetailInvoiceId(invoice.id)}
        onEditInvoice={(invoice) => setFormTarget({ invoice })}
        onMarkAsPaid={(invoice) => setPaymentInvoiceId(invoice.id)}
        onPreviewPdf={(invoice) => setPreviewInvoiceId(invoice.id)}
        onDownloadPdf={handleDownloadPdf}
        onSendInvoice={(invoice) => setSendInvoiceId(invoice.id)}
        onOpenClientAccount={handleOpenClientAccount}
        onDeleteInvoice={(invoice) => setDeleteInvoiceIds([invoice.id])}
        onRestoreInvoice={(invoice) => handleRestoreInvoices([invoice])}
      />
      {clientAccountKey && (
        <ClientAccountModal
          clientKey={clientAccountKey}
          invoices={clientInvoices.invoices}
          isLoading={clientInvoices.isLoading}
          hasError={clientInvoices.hasError}
          today={today}
          onViewInvoice={(invoice) => setDetailInvoiceId(invoice.id)}
          onClose={() => setClientAccountKey(null)}
        />
      )}
      {detailInvoice && (
        <InvoiceDetailModal
          invoice={detailInvoice}
          jobProperty={findJobProperty(detailInvoice)}
          today={today}
          canEdit={rights.canEdit}
          canDelete={rights.canDelete}
          currentUser={currentUser}
          onClose={() => setDetailInvoiceId(null)}
          onEditInvoice={(invoice) => setFormTarget({ invoice })}
          onMarkAsPaid={(invoice) => setPaymentInvoiceId(invoice.id)}
          onPreviewPdf={(invoice) => setPreviewInvoiceId(invoice.id)}
          onDownloadPdf={handleDownloadPdf}
          onSendInvoice={(invoice) => setSendInvoiceId(invoice.id)}
          onOpenClientAccount={handleOpenClientAccount}
          onDeleteInvoice={(invoice) => setDeleteInvoiceIds([invoice.id])}
          onRestoreInvoice={(invoice) => handleRestoreInvoices([invoice])}
        />
      )}
      {formTarget && (
        <InvoiceFormModal
          invoice={formTarget.invoice}
          properties={properties}
          currentUser={currentUser}
          onClose={() => setFormTarget(null)}
          onSaved={handleInvoiceSaved}
        />
      )}
      {paymentInvoice && (
        <RecordPaymentDialog
          invoice={paymentInvoice}
          currentUser={currentUser}
          onClose={() => setPaymentInvoiceId(null)}
          onRecorded={handlePaymentRecorded}
        />
      )}
      {sendInvoice && (
        <SendInvoiceDialog
          invoice={sendInvoice}
          jobProperty={findJobProperty(sendInvoice)}
          currentUser={currentUser}
          onClose={() => setSendInvoiceId(null)}
          onSent={handleInvoiceSent}
        />
      )}
      {bulkAction === 'markAsPaid' && (
        <BulkPaymentDialog
          invoices={selection.selectedInvoices}
          currentUser={currentUser}
          onClose={() => setBulkAction(null)}
          onFinished={handleBulkFinished}
        />
      )}
      {bulkAction === 'send' && (
        <BulkSendDialog
          invoices={selection.selectedInvoices}
          findJobProperty={findJobProperty}
          currentUser={currentUser}
          onClose={() => setBulkAction(null)}
          onFinished={handleBulkFinished}
        />
      )}
      {deleteInvoiceIds && invoicesToDelete.length > 0 && (
        <DeleteInvoicesDialog
          invoices={invoicesToDelete}
          currentUser={currentUser}
          onClose={() => setDeleteInvoiceIds(null)}
          onFinished={handleInvoicesDeleted}
        />
      )}
      {previewInvoice && (
        <SavedInvoicePdfPreview
          invoice={previewInvoice}
          jobProperty={findJobProperty(previewInvoice)}
          onClose={() => setPreviewInvoiceId(null)}
        />
      )}
    </div>
  );
};

export default InvoicesNewView;
