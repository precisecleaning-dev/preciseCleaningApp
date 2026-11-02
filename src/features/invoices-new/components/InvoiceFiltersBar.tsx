// Barra de filtros de la lista: búsqueda (número, cliente o job), estado
// puntual, rango de fechas y Clear filters.
import { Search } from 'lucide-react';
import type { InvoiceStatus } from '../../../types/index';
import type { InvoiceDateField, InvoiceDateRange } from '../invoiceFilters';
import { INVOICE_STATUS_LABELS } from '../invoiceStatus';
import DateRangePopover from '../../../shared/components/DateRangePopover';
import './InvoiceFiltersBar.css';

const STATUS_OPTIONS: (InvoiceStatus | 'all')[] = ['all', 'awaiting_payment', 'payment_link_sent', 'paid', 'paid_via_stripe'];

const DATE_FIELD_OPTIONS: { value: InvoiceDateField; label: string }[] = [
  { value: 'issueDate', label: 'Issue date' },
  { value: 'dueDate', label: 'Due date' },
];

const getStatusOptionLabel = (status: InvoiceStatus | 'all'): string =>
  (status === 'all' ? 'All statuses' : INVOICE_STATUS_LABELS[status]);

interface InvoiceFiltersBarProps {
  search: string;
  onSearchChange: (search: string) => void;
  status: InvoiceStatus | 'all';
  onStatusChange: (status: InvoiceStatus | 'all') => void;
  dateRange: InvoiceDateRange;
  onDateRangeChange: (dateRange: InvoiceDateRange) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

const InvoiceFiltersBar = ({
  search, onSearchChange, status, onStatusChange, dateRange, onDateRangeChange, hasActiveFilters, onClearFilters,
}: InvoiceFiltersBarProps) => (
  <div className="invfb-bar">
    <label className="invfb-search" htmlFor="invoice-search">
      <Search size={16} className="invfb-search-icon" aria-hidden="true" />
      <input
        id="invoice-search"
        className="invfb-search-input"
        type="search"
        placeholder="Search invoice, client or job"
        aria-label="Search invoices by number, client or job"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
    </label>
    <select
      className="invfb-select"
      aria-label="Payment status"
      value={status}
      onChange={(event) => onStatusChange(event.target.value as InvoiceStatus | 'all')}
    >
      {STATUS_OPTIONS.map((statusOption) => (
        <option key={statusOption} value={statusOption}>{getStatusOptionLabel(statusOption)}</option>
      ))}
    </select>
    <DateRangePopover value={dateRange} fieldOptions={DATE_FIELD_OPTIONS} onApply={onDateRangeChange} />
    {hasActiveFilters && (
      <button type="button" className="invfb-clear-btn" onClick={onClearFilters}>Clear filters</button>
    )}
  </div>
);

export default InvoiceFiltersBar;
