// Pastilla con el status de un trabajo en el tablero (Pipeline). Al tocarla
// pide abrir el modal central para cambiarlo (StatusChangeModal), igual que en
// la tabla y el detalle de Houses. Sirve igual para Normal y Cavalry.
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Status } from '../types/index';
import { getRelationColor, getRelationName } from '../utils/relations';

interface PipelineStatusPillProps {
  /** Id (o nombre, en casas viejas) del status actual. */
  currentStatusId: string;
  statuses: Status[];
  isDisabled: boolean;
  onRequestStatusChange: () => void;
}

const DEFAULT_STATUS_COLOR = '#64748b';

const PipelineStatusPill = ({ currentStatusId, statuses, isDisabled, onRequestStatusChange }: PipelineStatusPillProps) => {
  // getRelationName/Color comparan sin mayúsculas y sin espacios de más (casas viejas).
  const currentStatusName = getRelationName(statuses, currentStatusId, 'Unassigned');
  const currentStatusColor = getRelationColor(statuses, currentStatusId) ?? DEFAULT_STATUS_COLOR;
  const statusDotStyle = { '--dot-color': currentStatusColor } as CSSProperties;

  // Un botón disabled no dispara onClick: aquí solo falta que el clic no abra la tarjeta.
  const handleRequestStatusChange = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onRequestStatusChange();
  };

  return (
    <button
      className="pb-status-pill"
      onClick={handleRequestStatusChange}
      disabled={isDisabled}
      title={isDisabled ? undefined : 'Change status'}
    >
      <span className="pb-status-pill-label">
        <span className="pb-status-dot" style={statusDotStyle} />
        <span className="pb-status-pill-name">{currentStatusName}</span>
      </span>
      <ChevronDown size={15} className="pb-status-pill-chevron" />
    </button>
  );
};

export default PipelineStatusPill;
