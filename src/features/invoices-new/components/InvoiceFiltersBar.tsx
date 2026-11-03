// Barra de filtros de la lista: búsqueda (número, cliente o job), estado
// puntual (el que se ve, con Overdue), rango de fechas y Clear filters.
import { Search } from 'lucide-react';
import type { InvoiceDateField, InvoiceDateRange, InvoiceDisplayStatus } from '../../../types/index';
import { INVOICE_DISPLAY_STATUSES, INVOICE_STATUS_LABELS } from '../invoiceStatus';
import DateRangePopover from '../../../shared/components/DateRangePopover';
import './InvoiceFiltersBar.css';

/** Deleted va al final: muestra solo los invoices de la papelera. */
const STATUS_OPTIONS: (InvoiceDisplayStatus | 'all')[] = ['all', ...INVOICE_DISPLAY_STATUSES, 'deleted'];

const DATE_FIELD_OPTIONS: { value: InvoiceDateField; label: string }[] = [
  { value: 'issueDate', label: 'Issue date' },
  { value: 'dueDate', label: 'Due date' },
];

const getStatusOptionLabel = (status: InvoiceDisplayStatus | 'all'): string =>
  (status === 'all' ? 'All statuses' : INVOICE_STATUS_LABELS[status]);

interface InvoiceFiltersBarProps {
  search: string;
  onSearchChange: (search: string) => void;
  status: InvoiceDisplayStatus | 'all';
  onStatusChange: (status: InvoiceDisplayStatus | 'all') => void;
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
      onChange={(event) => onStatusChange(event.target.value as InvoiceDisplayStatus | 'all')}
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
