// Tarjeta de un trabajo en el tablero (Pipeline): cliente, banderas (terminado
// por el equipo, prioridad alta), dirección, fecha, notas (la de oficina solo
// con permiso), monto opcional, equipo y su status. Tocarla abre el detalle.
// La misma tarjeta para Normal y Cavalry.
import type { CSSProperties } from 'react';
import { AlertTriangle, Briefcase, CalendarDays, CheckCircle, MapPin, StickyNote, Users } from 'lucide-react';
import type { Property, Status } from '../types/index';
import { formatDate } from '../utils/dateFormat';
import PipelineStatusPill from './PipelineStatusPill';

interface PipelineJobCardProps {
  house: Property;
  clientName: string;
  teamName: string;
  teamColor: string;
  isHighPriority: boolean;
  /** Nota de oficina visible (permiso "Office Notes" + Configure Fields). */
  showOfficeNote: boolean;
  /** Monto de la casa; null = no se muestra. */
  amount: number | null;
  statuses: Status[];
  canChangeStatus: boolean;
  onOpenDetail: (house: Property) => void;
  onRequestStatusChange: (house: Property) => void;
}

const PipelineJobCard = ({
  house, clientName, teamName, teamColor, isHighPriority, showOfficeNote, amount, statuses, canChangeStatus,
  onOpenDetail, onRequestStatusChange,
}: PipelineJobCardProps) => {
  // Nota general (NO la del empleado): la de la app (note) o la importada de AppSheet (generalNotes).
  const generalNote = house.note || house.generalNotes;
  const teamAvatarStyle = { '--team-bg': `${teamColor}20`, '--team-color': teamColor } as CSSProperties;

  return (
    <div onClick={() => onOpenDetail(house)} className="pb-job-card">
      <div className="pb-job-top-row">
        <span className="pb-job-name">{clientName}</span>
        <div className="pb-job-flags">
          {house.employeeFinishedBy && <CheckCircle size={15} color="#10b981" />}
          {isHighPriority && <AlertTriangle size={15} color="#dc2626" />}
        </div>
      </div>

      {house.address && (
        <div className="pb-job-meta-row">
          <MapPin size={12} className="pb-shrink-0" />
          <span className="pb-job-meta-text">{house.address}</span>
        </div>
      )}

      <div className="pb-job-meta-row">
        <CalendarDays size={12} className="pb-shrink-0" />
        <span>{house.scheduleDate ? formatDate(house.scheduleDate) : 'Sin fecha'}</span>
      </div>

      {/* Notas de oficina en azul y con etiqueta: van primero, son de coordinación. */}
      {showOfficeNote && house.officeNote && (
        <div className="office pb-job-note">
          <Briefcase size={12} className="office pb-job-note-icon" />
          <span className="pb-job-note-body">
            <span className="pb-job-note-label">Office</span>
            <span className="pb-job-note-text">{house.officeNote}</span>
          </span>
        </div>
      )}

      {generalNote && (
        <div className="pb-job-note">
          <StickyNote size={12} className="pb-job-note-icon" />
          <span className="pb-job-note-text">{generalNote}</span>
        </div>
      )}

      {amount !== null && <div className="pb-job-amount">${amount.toFixed(2)}</div>}

      <div className="pb-job-team-row">
        <span className="pb-job-team-avatar" style={teamAvatarStyle}>
          <Users size={12} />
        </span>
        {teamName}
      </div>

      <PipelineStatusPill
        currentStatusId={house.statusId}
        statuses={statuses}
        isDisabled={!canChangeStatus}
        onRequestStatusChange={() => onRequestStatusChange(house)}
      />
    </div>
  );
};

export default PipelineJobCard;
