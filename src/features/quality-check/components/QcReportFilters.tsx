// Filtros de la tabla de reportes (van dentro de la PeriodBar, que filtra por
// la fecha de la inspección): cuántos reportes se ven y el buscador. Ya no hay
// pestañas: los reportes de casas en Recall están en las tarjetas de arriba.
import { FileText, Search } from 'lucide-react';

interface QcReportFiltersProps {
  reportCount: number;
  searchText: string;
  onSearchTextChange: (searchText: string) => void;
}

const QcReportFilters = ({ reportCount, searchText, onSearchTextChange }: QcReportFiltersProps) => (
  <div className="qcrs-filters">
    <span className="qcrs-total">
      <FileText size={15} />
      Reports
      <span className="qcrs-total-count">{reportCount}</span>
    </span>
    <div className="qcrs-input-wrap qcrs-search-cell">
      <Search className="qcrs-input-icon" size={16} />
      <input
        type="text"
        className="qcrs-input"
        placeholder="Buscar por cliente, dirección o inspector..."
        aria-label="Search (client, address or inspector)"
        value={searchText}
        onChange={(event) => onSearchTextChange(event.target.value)}
      />
    </div>
  </div>
);

export default QcReportFilters;
