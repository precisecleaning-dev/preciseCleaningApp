// Bloque de la lista: tabla con su paginación, o el estado que corresponda
// (cargando, error de lectura, sin invoices todavía, sin resultados).
import type { Invoice, InvoiceActions, InvoicesNewRights, YmdDate } from '../../../types/index';
import PaginationBar from '../../../shared/components/PaginationBar';
import InvoiceTable, { type InvoiceTableSelection } from './InvoiceTable';
import InvoicesEmptyState from './InvoicesEmptyState';
import { INVOICE_PAGE_SIZES } from '../hooks/useInvoiceFilters';

interface InvoiceRegisterProps {
  pageInvoices: Invoice[];
  filteredCount: number;
  /** Invoices en la ventana, antes de filtrar (0 = todavía no hay ninguno). */
  windowCount: number;
  isLoading: boolean;
  hasError: boolean;
  today: YmdDate;
  page: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onClearFilters: () => void;
  rights: InvoicesNewRights;
  /** Lo que se hace con cada invoice (menú de la fila). */
  actions: InvoiceActions;
  /** Checkboxes de la tabla (null = sin columna de selección). */
  selection: InvoiceTableSelection | null;
}

const InvoiceRegister = ({
  pageInvoices, filteredCount, windowCount, isLoading, hasError, today, page, pageCount, pageSize, onPageChange,
  onPageSizeChange, onClearFilters, rights, actions, selection,
}: InvoiceRegisterProps) => {
  if (isLoading) {
    return (
      <div className="invn-register-loading" aria-hidden="true">
        <span className="skel-line skel-row-main" />
        <span className="skel-line skel-row-main" />
        <span className="skel-line skel-row-main" />
      </div>
    );
  }
  if (hasError) {
    return (
      <InvoicesEmptyState
        title="Invoices could not be loaded"
        description="Check your connection or your permissions and reload the app. The list is not empty: it did not load."
      />
    );
  }
  if (windowCount === 0) {
    return (
      <InvoicesEmptyState
        title="No invoices yet"
        description="Invoices you create will appear here with their totals, due dates and payment status."
      />
    );
  }
  if (filteredCount === 0) {
    return (
      <InvoicesEmptyState title="No invoices found" description="Try another search, status or date range.">
        <button type="button" className="invn-clear-btn" onClick={onClearFilters}>Clear filters</button>
      </InvoicesEmptyState>
    );
  }

  return (
    <section aria-label="Invoices">
      <InvoiceTable
        invoices={pageInvoices}
        today={today}
        rights={rights}
        actions={actions}
        selection={selection}
      />
      <PaginationBar
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        pageSizeOptions={INVOICE_PAGE_SIZES}
        totalItems={filteredCount}
        itemLabel="invoices"
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </section>
  );
};

export default InvoiceRegister;
