// Pastilla con el status de un trabajo en el tablero (Pipeline). Al tocarla
// pide abrir el modal central para cambiarlo (StatusChangeModal), igual que en
// la tabla y el detalle de Houses. Sirve igual para Normal y Cavalry.
import type { CSSProperties, MouseEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Status } from '../types/index';

interface PipelineStatusPillProps {
  /** Id (o nombre, en casas viejas) del status actual. */
  currentStatusId: string;
  statuses: Status[];
  isDisabled: boolean;
  onRequestStatusChange: () => void;
}

const PipelineStatusPill = ({ currentStatusId, statuses, isDisabled, onRequestStatusChange }: PipelineStatusPillProps) => {
  const normalizedStatusId = String(currentStatusId ?? '').toLowerCase().trim();
  const currentStatus = statuses.find((status) => String(status.id).toLowerCase().trim() === normalizedStatusId
    || String(status.name).toLowerCase().trim() === normalizedStatusId);
  const statusDotStyle = { '--dot-color': currentStatus?.color || '#64748b' } as CSSProperties;

  const handleRequestStatusChange = (event: MouseEvent) => {
    event.stopPropagation();
    if (!isDisabled) onRequestStatusChange();
  };

  return (
    <button
      className="pb-status-pill"
      onClick={handleRequestStatusChange}
      disabled={isDisabled}
      title={isDisabled ? undefined : 'Cambiar estado'}
    >
      <span className="pb-status-pill-label">
        <span className="pb-status-dot" style={statusDotStyle} />
        <span className="pb-status-pill-name">{currentStatus?.name || 'Unassigned'}</span>
      </span>
      <ChevronDown size={15} color="#94a3b8" className="pb-shrink-0" />
    </button>
  );
};

export default PipelineStatusPill;
