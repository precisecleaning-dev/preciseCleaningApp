// Tarjeta de una casa en Quality Check: pendiente de inspección, que no pasó
// (Did Not Pass) o en Recall. Muestra cliente, dirección, fecha, equipo y notas;
// cambia el status, la agrega o quita de la ruta e inicia (o repite) la
// inspección. En Recall marca "Correcciones hechas". Tocar la tarjeta abre el
// detalle de la casa (editar y borrar se hacen desde ahí).
import type { CSSProperties, MouseEvent } from 'react';
import {
  AlertTriangle, CalendarDays, Check, ClipboardCheck, Edit2, MapPin, Repeat, Route, StickyNote, Users,
} from 'lucide-react';
import type { Property } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';

interface QcHouseCardProps {
  house: Property;
  /** pending = espera inspección · failed = la última no pasó · recall = casa en Recall. */
  variant: 'pending' | 'failed' | 'recall';
  clientName: string;
  teamName: string;
  houseNote: string;
  /** Nota de oficina ('' si no hay o el rol no tiene "Office Notes"). */
  officeNote: string;
  statusName: string;
  statusColor: string;
  isInRoute: boolean;
  isInspectDisabled: boolean;
  /** Solo Recall: correcciones del último reporte que no pasó (null = no hay reporte). */
  corrections: { doneAt: string | null; doneBy: string | null } | null;
  onOpenDetail: (house: Property) => void;
  onChangeStatus: (house: Property) => void;
  onToggleRoute: (house: Property) => void;
  onInspect: (house: Property) => void;
  onMarkCorrectionsDone: (house: Property) => void;
}

const INSPECT_LABEL: Record<QcHouseCardProps['variant'], string> = {
  pending: 'Iniciar inspección',
  failed: 'Revisar / Corregir QC',
  recall: 'Re-inspeccionar',
};

/** Los botones de adentro no deben abrir el detalle de la casa. */
const stopCardClick = (event: MouseEvent) => event.stopPropagation();

const QcHouseCard = ({
  house, variant, clientName, teamName, houseNote, officeNote, statusName, statusColor, isInRoute, isInspectDisabled,
  corrections, onOpenDetail, onChangeStatus, onToggleRoute, onInspect, onMarkCorrectionsDone,
}: QcHouseCardProps) => {
  const cardModifier = variant === 'pending' ? '' : ` ${variant}`;
  const scheduleText = house.scheduleDate ? formatDate(house.scheduleDate) : 'Sin fecha';
  const statusDotStyle = { '--dot-color': statusColor } as CSSProperties;

  const handleChangeStatus = (event: MouseEvent) => {
    event.stopPropagation();
    onChangeStatus(house);
  };
  const handleToggleRoute = (event: MouseEvent) => {
    event.stopPropagation();
    onToggleRoute(house);
  };
  const handleInspect = (event: MouseEvent) => {
    event.stopPropagation();
    onInspect(house);
  };
  const handleMarkCorrectionsDone = (event: MouseEvent) => {
    event.stopPropagation();
    onMarkCorrectionsDone(house);
  };

  return (
    <div onClick={() => onOpenDetail(house)} className={`qcv-house-card${cardModifier}`}>
      <div className="qcv-house-card-title-row">
        <div className="qcv-house-client-name">{clientName}</div>
        {variant === 'pending' && <span className="pending-yellow qcv-house-badge">Pending</span>}
        {variant === 'failed' && <span className="failed qcv-house-badge"><AlertTriangle size={12} /> Did Not Pass</span>}
        {variant === 'recall' && <span className="qcv-house-badge recall"><Repeat size={12} /> Recall</span>}
      </div>

      <div className="qcv-house-info-col">
        <div className="qcv-house-info-row">
          <MapPin size={16} color="#94a3b8" className="qcv-shrink-0" />
          <span className="qcv-ellipsis">{house.address || '—'}</span>
        </div>
        <div className="qcv-house-info-row">
          <CalendarDays size={16} color="#94a3b8" className="qcv-shrink-0" />
          <span>Schedule: {scheduleText}</span>
        </div>
        <div className="qcv-house-info-row">
          <Users size={16} color="#94a3b8" className="qcv-shrink-0" />
          <span>{teamName}</span>
        </div>
        {houseNote !== '' && (
          <div className="qcv-house-note">
            <StickyNote size={12} className="qcv-house-note-icon" />
            <span className="qcv-house-note-text">{houseNote}</span>
          </div>
        )}
        {officeNote !== '' && (
          <div className="office qcv-house-note">
            <StickyNote size={12} className="qcv-house-note-icon" />
            <span className="qcv-house-note-text">{officeNote}</span>
          </div>
        )}
        <button type="button" onClick={handleChangeStatus} title="Cambiar status de la casa" className="qcv-house-status-btn">
          <span className="qcv-house-status-dot" style={statusDotStyle} />
          {statusName}
          <Edit2 size={12} color="#94a3b8" />
        </button>
        <button
          type="button"
          onClick={handleToggleRoute}
          title={isInRoute ? 'Quitar de la ruta' : 'Agregar a la ruta de inspección'}
          className={`qcv-house-route-btn${isInRoute ? ' in-route' : ''}`}
        >
          {isInRoute ? <Check size={13} /> : <Route size={13} />}
          {isInRoute ? 'En ruta — quitar' : 'Agregar a ruta'}
        </button>
      </div>

      {corrections?.doneAt && (
        <div className="qcv-corr-chip" onClick={stopCardClick} title={`Por ${corrections.doneBy || '—'}`}>
          <Check size={13} /> Correcciones hechas · {formatDate(String(corrections.doneAt).split('T')[0])}
        </div>
      )}
      {corrections && !corrections.doneAt && (
        <button type="button" onClick={handleMarkCorrectionsDone} className="full qcv-corr-btn">
          <Check size={14} /> Correcciones hechas
        </button>
      )}

      <button onClick={handleInspect} disabled={isInspectDisabled} className={`qcv-house-inspect-btn${cardModifier}`}>
        <ClipboardCheck size={17} /> {INSPECT_LABEL[variant]}
      </button>
    </div>
  );
};

export default QcHouseCard;
