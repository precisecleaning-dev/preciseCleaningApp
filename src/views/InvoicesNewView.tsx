// ============================================================================
// ⭐ INVOICES NEW — módulo nuevo de invoices (el módulo "Invoices" de siempre
//    sigue aparte, sin cambios). Un invoice = un job y su cliente, con pagos,
//    PDF, envío por correo y enlace de Stripe. Se construye por etapas (ver
//    la nota "Invoices New" de code-notes.md).
//    Esta vista solo orquesta: permisos, datos y filtros (hooks de
//    features/invoices-new), qué diálogo está abierto (useInvoiceDialogs), qué
//    hace cada acción (useInvoicePageActions) y los componentes.
// ============================================================================
import type { InvoiceTableSelection } from '../features/invoices-new/components/InvoiceTable';
import type { Property, Role, SystemUser } from '../types/index';
import { todayIso } from '../utils/dateFormat';
import { getInvoicesNewRights } from '../features/invoices-new/invoicesNewPermissions';
import { useInvoicesWindow } from '../features/invoices-new/hooks/useInvoicesWindow';
import { useInvoiceFilters } from '../features/invoices-new/hooks/useInvoiceFilters';
import { useInvoiceList } from '../features/invoices-new/hooks/useInvoiceList';
import { getSelectionScopeKey, useInvoiceSelection } from '../features/invoices-new/hooks/useInvoiceSelection';
import { useInvoiceDialogs } from '../features/invoices-new/hooks/useInvoiceDialogs';
import { useInvoiceNotice } from '../features/invoices-new/hooks/useInvoiceNotice';
import { useInvoicePageActions } from '../features/invoices-new/hooks/useInvoicePageActions';
import HistoryWindowNotice from '../components/HistoryWindowNotice';
import InvoicesNewHeader from '../features/invoices-new/components/InvoicesNewHeader';
import InvoiceSummaryCards from '../features/invoices-new/components/InvoiceSummaryCards';
import InvoiceFiltersBar from '../features/invoices-new/components/InvoiceFiltersBar';
import InvoiceBulkBar from '../features/invoices-new/components/InvoiceBulkBar';
import InvoiceRegister from '../features/invoices-new/components/InvoiceRegister';
import InvoiceSavedNotice from '../features/invoices-new/components/InvoiceSavedNotice';
import InvoiceDialogsHost from '../features/invoices-new/components/InvoiceDialogsHost';
import './InvoicesNewView.css';

interface InvoicesNewViewProps {
  onOpenMenu: () => void;
  /** Casas del listener global de App.tsx (ventana de 12 meses): los jobs del formulario. */
  properties: Property[];
  currentUser: SystemUser | null;
  activeRole: Role | null;
  isSuperAdmin: boolean;
}

const InvoicesNewView = ({ onOpenMenu, properties, currentUser, activeRole, isSuperAdmin }: InvoicesNewViewProps) => {
  const rights = getInvoicesNewRights(activeRole, isSuperAdmin);
  const today = todayIso();
  const invoicesWindow = useInvoicesWindow();
  const { filters, actions: filterActions, hasActiveFilters } = useInvoiceFilters();
  const invoiceList = useInvoiceList(invoicesWindow.invoices, filters, today);
  // Checkboxes de la página visible: con Edit (Mark as Paid, Send) o Delete; no en la vista Deleted.
  const selection = useInvoiceSelection(invoiceList.pageInvoices, getSelectionScopeKey(filters, invoiceList.page));
  const canSelect = (rights.canEdit || rights.canDelete) && filters.status !== 'deleted';
  const dialogs = useInvoiceDialogs(invoicesWindow.invoices, properties);
  const notices = useInvoiceNotice();
  const { invoiceActions, finishers } = useInvoicePageActions({
    dialogs,
    notices,
    currentUser,
    onInvoiceCreated: filterActions.clear,
    onSelectionDone: selection.clear,
  });
  const tableSelection: InvoiceTableSelection | null = canSelect
    ? {
      selectedIds: selection.selectedIds,
      isAllSelected: selection.isAllSelected,
      isSomeSelected: selection.isSomeSelected,
      onToggleInvoice: selection.toggleInvoice,
      onToggleAll: selection.toggleAll,
    }
    : null;
  const isBulkBarVisible = canSelect && selection.isSomeSelected;
  const { notice } = notices;

  return (
    <div className="fade-in invn-page">
      <InvoicesNewHeader onOpenMenu={onOpenMenu} canCreate={rights.canCreate} onCreateInvoice={dialogs.openCreate} />
      <HistoryWindowNotice />
      {notice && (
        <InvoiceSavedNotice
          key={notice.id}
          message={notice.message}
          tone={notice.tone}
          action={notice.action}
          onDismiss={notices.dismissNotice}
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
      {isBulkBarVisible && (
        <InvoiceBulkBar
          selectedCount={selection.selectedInvoices.length}
          canEdit={rights.canEdit}
          canDelete={rights.canDelete}
          onMarkAsPaid={() => dialogs.openBulk('markAsPaid', selection.selectedInvoices)}
          onSendInvoices={() => dialogs.openBulk('send', selection.selectedInvoices)}
          onDeleteInvoices={() => dialogs.openDelete(selection.selectedInvoices)}
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
        rights={rights}
        actions={invoiceActions}
        selection={tableSelection}
      />
      <InvoiceDialogsHost
        dialogs={dialogs}
        invoiceActions={invoiceActions}
        finishers={finishers}
        rights={rights}
        properties={properties}
        currentUser={currentUser}
        today={today}
      />
    </div>
  );
};

export default InvoicesNewView;
