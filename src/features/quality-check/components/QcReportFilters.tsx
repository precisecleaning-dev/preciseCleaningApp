// Filtros de la tabla de reportes (van dentro de la PeriodBar, que filtra por
// la fecha de la inspección): "Reports" (todos, con cuántos reportes) o
// "Recalls" (solo los de casas que estuvieron alguna vez en Recall, con cuántas
// CASAS son) y el buscador.
// Los reportes de casas HOY en Recall están en las tarjetas de arriba.
import { FileText, RotateCcw, Search } from 'lucide-react';

interface QcReportFiltersProps {
  reportCount: number;
  /** Casas (no reportes) que estuvieron en Recall. */
  recallHouseCount: number;
  isShowingOnlyRecalls: boolean;
  searchText: string;
  onShowOnlyRecallsChange: (isShowingOnlyRecalls: boolean) => void;
  onSearchTextChange: (searchText: string) => void;
}

const QcReportFilters = ({
  reportCount, recallHouseCount, isShowingOnlyRecalls, searchText, onShowOnlyRecallsChange, onSearchTextChange,
}: QcReportFiltersProps) => (
  <div className="qcrs-filters">
    <div className="qcrs-chips" role="group" aria-label="Show reports">
      <button
        type="button"
        className={`qcrs-chip${isShowingOnlyRecalls ? '' : ' active'}`}
        aria-pressed={!isShowingOnlyRecalls}
        onClick={() => onShowOnlyRecallsChange(false)}
      >
        <FileText size={15} />
        Reports
        <span className="qcrs-chip-count">{reportCount}</span>
      </button>
      <button
        type="button"
        className={`qcrs-chip recall${isShowingOnlyRecalls ? ' active' : ''}`}
        aria-pressed={isShowingOnlyRecalls}
        onClick={() => onShowOnlyRecallsChange(true)}
      >
        <RotateCcw size={15} />
        Recalls
        <span className="qcrs-chip-count">{recallHouseCount}</span>
      </button>
    </div>
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
