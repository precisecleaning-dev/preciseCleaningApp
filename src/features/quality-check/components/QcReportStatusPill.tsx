// Píldora con el status ACTUAL de la casa de un reporte. Al tocarla se cambia
// (Quality Check · Recall · Invoice). Si la casa ya no existe, se ve estática.
import type { CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Property, Status } from '../../../types/index';

interface QcReportStatusPillProps {
  house: Property | undefined;
  statuses: Status[];
  isDisabled: boolean;
  onChangeStatus: (house: Property) => void;
}

const QcReportStatusPill = ({ house, statuses, isDisabled, onChangeStatus }: QcReportStatusPillProps) => {
  if (!house) return <span className="missing qcrs-status-pill">Casa no encontrada</span>;

  const rawStatus = String(house.statusId ?? '').toLowerCase().trim();
  const houseStatus = statuses.find((status) => String(status.id).toLowerCase().trim() === rawStatus
    || String(status.name).toLowerCase().trim() === rawStatus);

  return (
    <button
      type="button"
      className={`qcrs-status-pill${isDisabled ? ' disabled' : ''}`}
      disabled={isDisabled}
      onClick={() => onChangeStatus(house)}
    >
      <span className="qcrs-pill-dot" style={{ '--dot-color': houseStatus?.color ?? '#64748b' } as CSSProperties} />
      <span className="qcrs-pill-text">{houseStatus?.name ?? 'Unassigned'}</span>
      {!isDisabled && <ChevronDown size={14} className="qcrs-pill-chevron" />}
    </button>
  );
};

export default QcReportStatusPill;
