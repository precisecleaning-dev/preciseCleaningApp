// Bloque de la lista: tabla con su paginación, o el estado que corresponda
// (cargando, error de lectura, sin invoices todavía, sin resultados).
import type { Invoice, YmdDate } from '../../../types/index';
import PaginationBar from '../../../shared/components/PaginationBar';
import InvoiceTable from './InvoiceTable';
import type { InvoiceRowActions } from './InvoiceRow';
import InvoicesEmptyState from './InvoicesEmptyState';
import { INVOICE_PAGE_SIZES } from '../hooks/useInvoiceFilters';

interface InvoiceRegisterProps extends InvoiceRowActions {
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
  canEdit: boolean;
}

const InvoiceRegister = ({
  pageInvoices, filteredCount, windowCount, isLoading, hasError, today, page, pageCount, pageSize, onPageChange,
  onPageSizeChange, onClearFilters, canEdit, onViewInvoice, onEditInvoice, onMarkAsPaid, onPreviewPdf, onDownloadPdf,
  onSendInvoice,
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
        canEdit={canEdit}
        onViewInvoice={onViewInvoice}
        onEditInvoice={onEditInvoice}
        onMarkAsPaid={onMarkAsPaid}
        onPreviewPdf={onPreviewPdf}
        onDownloadPdf={onDownloadPdf}
        onSendInvoice={onSendInvoice}
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
