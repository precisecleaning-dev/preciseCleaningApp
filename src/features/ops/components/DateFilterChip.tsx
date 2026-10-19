// Aviso de que el Task list está filtrado por un día del calendario, con el
// botón para quitar el filtro.
import { CalendarDays, X } from 'lucide-react';
import { formatDate } from '../../../utils/dateFormat';
import './DateFilterChip.css';

interface DateFilterChipProps {
  /** Día del filtro, AAAA-MM-DD. */
  isoDate: string;
  onClear: () => void;
}

const DateFilterChip = ({ isoDate, onClear }: DateFilterChipProps) => (
  <p className="date-filter-chip" role="status">
    <CalendarDays size={16} aria-hidden="true" />
    <span className="date-filter-chip-text">Showing tasks due {formatDate(isoDate)}</span>
    <button type="button" className="date-filter-chip-clear" onClick={onClear} aria-label="Clear date filter">
      <X size={14} /> Clear
    </button>
  </p>
);

export default DateFilterChip;
