// Filtros de la tabla de reportes (van dentro de la PeriodBar, que filtra por
// la fecha de la inspección): pestañas por estado ACTUAL de la casa (Quality
// Checks · Invoice · Recall, cada una con su total) y buscador.
import { ClipboardCheck, FileText, Repeat, Search } from 'lucide-react';
import type { QcReportTab } from '../../../types/index';
import { REPORT_TAB_LABEL, REPORT_TAB_ORDER } from '../qcReports';

interface QcReportFiltersProps {
  selectedTab: QcReportTab;
  reportCountByTab: Record<QcReportTab, number>;
  searchText: string;
  onSelectTab: (tab: QcReportTab) => void;
  onSearchTextChange: (searchText: string) => void;
}

const REPORT_TAB_ICON = { quality_check: ClipboardCheck, invoice: FileText, recall: Repeat };

const QcReportFilters = ({
  selectedTab, reportCountByTab, searchText, onSelectTab, onSearchTextChange,
}: QcReportFiltersProps) => (
  <div className="qcrs-filters">
    <div className="qcrs-tabs">
      {REPORT_TAB_ORDER.map((tab) => {
        const TabIcon = REPORT_TAB_ICON[tab];
        return (
          <button
            key={tab}
            type="button"
            className={`qcrs-tab ${tab}${selectedTab === tab ? ' active' : ''}`}
            onClick={() => onSelectTab(tab)}
          >
            <TabIcon size={15} />
            {REPORT_TAB_LABEL[tab]}
            <span className="qcrs-tab-count">{reportCountByTab[tab]}</span>
          </button>
        );
      })}
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
