// Cuenta del cliente · pestaña Invoices: todos sus invoices (de cualquier
// fecha) ya filtrados por tarjeta y estado, con el filtro de estado y la
// paginación. Tocar una fila abre el detalle del invoice encima.
import type { Invoice, InvoiceDisplayStatus, YmdDate } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import { clampPage, getPageCount, getPageItems } from '../../../shared/utils/pagination';
import PaginationBar from '../../../shared/components/PaginationBar';
import { formatCents } from '../invoiceMath';
import { INVOICE_DISPLAY_STATUSES, INVOICE_STATUS_LABELS, getDisplayStatus } from '../invoiceStatus';
import { INVOICE_PAGE_SIZES } from '../hooks/useInvoiceFilters';
import InvoiceStatusBadge from './InvoiceStatusBadge';
import './InvoiceTable.css';
import './InvoiceFiltersBar.css';

const STATUS_OPTIONS: (InvoiceDisplayStatus | 'all')[] = ['all', ...INVOICE_DISPLAY_STATUSES];

const getStatusOptionLabel = (status: InvoiceDisplayStatus | 'all'): string =>
  (status === 'all' ? 'All statuses' : INVOICE_STATUS_LABELS[status]);

interface ClientInvoicesTabProps {
  /** Invoices del cliente ya filtrados y ordenados. */
  invoices: Invoice[];
  status: InvoiceDisplayStatus | 'all';
  onStatusChange: (status: InvoiceDisplayStatus | 'all') => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  today: YmdDate;
  onViewInvoice: (invoice: Invoice) => void;
}

const ClientInvoicesTab = ({
  invoices, status, onStatusChange, page, pageSize, onPageChange, onPageSizeChange, today, onViewInvoice,
}: ClientInvoicesTabProps) => {
  const pageCount = getPageCount(invoices.length, pageSize);
  const visiblePage = clampPage(page, pageCount);
  const pageInvoices = getPageItems(invoices, visiblePage, pageSize);

  return (
    <div className="cam-tab">
      <select
        className="cam-status-select invfb-select"
        aria-label="Filter the client invoices by status"
        value={status}
        onChange={(event) => onStatusChange(event.target.value as InvoiceDisplayStatus | 'all')}
      >
        {STATUS_OPTIONS.map((statusOption) => (
          <option key={statusOption} value={statusOption}>{getStatusOptionLabel(statusOption)}</option>
        ))}
      </select>
      {pageInvoices.length === 0 ? (
        <p className="cam-empty">No invoices for this client with these filters.</p>
      ) : (
        <div className="invt-scroll">
          <table className="cam-table invt-table">
            <thead>
              <tr>
                <th scope="col">Invoice</th>
                <th scope="col">Job</th>
                <th scope="col">Issue Date</th>
                <th scope="col">Due Date</th>
                <th scope="col" className="invt-money">Total</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {pageInvoices.map((invoice) => (
                <tr key={invoice.id} className="invt-row" onClick={() => onViewInvoice(invoice)}>
                  <td>
                    <button type="button" className="invt-number" onClick={() => onViewInvoice(invoice)}>{invoice.number}</button>
                  </td>
                  <td className="cam-job">{[invoice.job.address, invoice.job.unit].filter(Boolean).join(' · ') || 'No address'}</td>
                  <td className="invt-date">{formatDate(invoice.issueDate)}</td>
                  <td className="invt-date">{formatDate(invoice.dueDate)}</td>
                  <td className="invt-money">{formatCents(invoice.totalCents)}</td>
                  <td><InvoiceStatusBadge status={getDisplayStatus(invoice, today)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PaginationBar
        page={visiblePage}
        pageCount={pageCount}
        pageSize={pageSize}
        pageSizeOptions={INVOICE_PAGE_SIZES}
        totalItems={invoices.length}
        itemLabel="invoices"
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
};

export default ClientInvoicesTab;
