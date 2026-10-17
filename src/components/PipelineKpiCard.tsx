// Indicador de un status arriba del tablero (Pipeline): ícono, nombre y cuántos
// trabajos tiene. Al tocarlo filtra el tablero por ese status (o quita el filtro).
import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Status } from '../types/index';

interface PipelineKpiCardProps {
  status: Status;
  jobCount: number;
  icon: LucideIcon;
  isActive: boolean;
  onToggleFilter: (status: Status) => void;
}

const PipelineKpiCard = ({ status, jobCount, icon: KpiIcon, isActive, onToggleFilter }: PipelineKpiCardProps) => {
  const kpiColorStyle = {
    '--kpi-color': status.color,
    '--kpi-color-30': `${status.color}30`,
    '--kpi-icon-bg': `${status.color}15`,
  } as CSSProperties;

  return (
    <div
      className={`hv-kpi-card${isActive ? ' active' : ''}`}
      style={kpiColorStyle}
      onClick={() => onToggleFilter(status)}
      title={isActive ? 'Click para limpiar filtro' : `Filtrar trabajos por ${status.name}`}
    >
      <div className="hv-kpi-icon-box">
        <KpiIcon size={18} />
      </div>
      <div className="hv-min-w-0">
        <div className="hv-kpi-label">{status.name}</div>
        <div className="hv-kpi-count">{jobCount}</div>
      </div>
    </div>
  );
};

export default PipelineKpiCard;
