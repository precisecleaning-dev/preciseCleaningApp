// ============================================================================
// ⭐ INVOICES NEW — módulo nuevo de invoices (el módulo "Invoices" de siempre
//    sigue aparte, sin cambios). Un invoice = un job y su cliente, con pagos,
//    PDF, envío por correo y enlace de Stripe. Se construye por etapas (ver
//    la nota "Invoices New" de code-notes.md).
//    Esta vista solo orquesta: permisos, datos (hooks de
//    features/invoices-new) y componentes.
// ============================================================================
import { useState } from 'react';
import type { Invoice, Property, Role, SystemUser } from '../types/index';
import { todayIso } from '../utils/dateFormat';
import { getInvoicesNewRights } from '../features/invoices-new/invoicesNewPermissions';
import { useInvoicesWindow } from '../features/invoices-new/hooks/useInvoicesWindow';
import { useInvoiceFilters } from '../features/invoices-new/hooks/useInvoiceFilters';
import { useInvoiceList } from '../features/invoices-new/hooks/useInvoiceList';
import HistoryWindowNotice from '../components/HistoryWindowNotice';
import InvoicesNewHeader from '../features/invoices-new/components/InvoicesNewHeader';
import InvoiceSummaryCards from '../features/invoices-new/components/InvoiceSummaryCards';
import InvoiceFiltersBar from '../features/invoices-new/components/InvoiceFiltersBar';
import InvoiceRegister from '../features/invoices-new/components/InvoiceRegister';
import InvoiceFormModal from '../features/invoices-new/components/InvoiceFormModal';
import InvoiceSavedNotice from '../features/invoices-new/components/InvoiceSavedNotice';
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

const InvoicesNewView = ({ onOpenMenu, properties, currentUser, activeRole, isSuperAdmin }: InvoicesNewViewProps) => {
  const rights = getInvoicesNewRights(activeRole, isSuperAdmin);
  const today = todayIso();
  const invoicesWindow = useInvoicesWindow();
  const { filters, actions: filterActions, hasActiveFilters } = useInvoiceFilters();
  const invoiceList = useInvoiceList(invoicesWindow.invoices, filters, today);
  const [formTarget, setFormTarget] = useState<InvoiceFormTarget>(null);
  const [savedMessage, setSavedMessage] = useState('');

  const handleInvoiceSaved = (result: { number: string; isNew: boolean }) => {
    setFormTarget(null);
    setSavedMessage(result.isNew ? `Invoice ${result.number} created.` : `Invoice ${result.number} saved.`);
    // Al crear se limpian los filtros para que el invoice nuevo quede a la vista (alcance §9).
    if (result.isNew) filterActions.clear();
  };

  return (
    <div className="fade-in invn-page">
      <InvoicesNewHeader
        onOpenMenu={onOpenMenu}
        canCreate={rights.canCreate}
        onCreateInvoice={() => setFormTarget({ invoice: null })}
      />
      <HistoryWindowNotice />
      {savedMessage && <InvoiceSavedNotice message={savedMessage} onDismiss={() => setSavedMessage('')} />}
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
        onEditInvoice={(invoice) => setFormTarget({ invoice })}
      />
      {formTarget && (
        <InvoiceFormModal
          invoice={formTarget.invoice}
          properties={properties}
          currentUser={currentUser}
          onClose={() => setFormTarget(null)}
          onSaved={handleInvoiceSaved}
        />
      )}
    </div>
  );
};

export default InvoicesNewView;
