// Filtros de las casas de Quality Check (van dentro de la PeriodBar): buscador,
// "Copiar direcciones" (lista numerada de las pendientes visibles, para el
// flujo de ruta) y All / Pending / Recall con sus totales.
import { Copy, Search, X } from 'lucide-react';
import type { QcHouseGroup } from '../../../types/index';

interface QcHouseFiltersProps {
  searchText: string;
  selectedGroup: QcHouseGroup;
  houseCountByGroup: Record<QcHouseGroup, number>;
  onSearchTextChange: (searchText: string) => void;
  onSelectGroup: (group: QcHouseGroup) => void;
  onCopyAddresses: () => void;
}

const HOUSE_GROUPS: QcHouseGroup[] = ['All', 'Pending', 'Recall'];

const QcHouseFilters = ({
  searchText, selectedGroup, houseCountByGroup, onSearchTextChange, onSelectGroup, onCopyAddresses,
}: QcHouseFiltersProps) => (
  <div className="qc-house-filters">
    <div className="qc-table-search">
      <Search size={18} color="#9ca3af" />
      <input
        type="text"
        value={searchText}
        onChange={(event) => onSearchTextChange(event.target.value)}
        placeholder="Buscar por estado, fecha, dirección, cliente, equipo..."
      />
      {searchText && (
        <button type="button" onClick={() => onSearchTextChange('')} aria-label="Limpiar búsqueda" className="qcv-clear-search-btn">
          <X size={16} />
        </button>
      )}
    </div>
    <button
      type="button"
      className="qcv-copy-addr-btn"
      onClick={onCopyAddresses}
      title="Copia la lista numerada de direcciones de las casas de esta vista"
    >
      <Copy size={15} /> Copiar direcciones
    </button>
    <div className="qc-status-pills">
      {HOUSE_GROUPS.map((group) => (
        <button
          key={group}
          type="button"
          className={`qc-tab${group === 'Recall' ? ' qc-tab-recall' : ''}${selectedGroup === group ? ' active' : ''}`}
          onClick={() => onSelectGroup(group)}
        >
          {group} ({houseCountByGroup[group]})
        </button>
      ))}
    </div>
  </div>
);

export default QcHouseFilters;
