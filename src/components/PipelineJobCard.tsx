// Tarjeta de un trabajo en el tablero (Pipeline): cliente, banderas (terminado
// por el equipo, prioridad alta), dirección, fecha, notas (la de oficina solo
// con permiso), monto opcional, equipo y su status. Tocarla abre el detalle.
// La misma tarjeta para Normal y Cavalry.
import type { CSSProperties } from 'react';
import { AlertTriangle, Briefcase, CalendarDays, CheckCircle, MapPin, StickyNote, Users } from 'lucide-react';
import type { Property, Status } from '../types/index';
import { formatDate } from '../utils/dateFormat';
import { money } from '../utils/jobFinancials';
import PipelineStatusPill from './PipelineStatusPill';

interface PipelineJobCardProps {
  property: Property;
  clientName: string;
  teamName: string;
  teamColor: string;
  isHighPriority: boolean;
  /** Nota de oficina visible (permiso "Office Notes" + Configure Fields). */
  isOfficeNoteVisible: boolean;
  /** Monto de la casa; null = no se muestra. */
  propertyAmount: number | null;
  statuses: Status[];
  canChangeStatus: boolean;
  onOpenPropertyDetail: (property: Property) => void;
  onRequestStatusChange: (property: Property) => void;
}

const PipelineJobCard = ({
  property, clientName, teamName, teamColor, isHighPriority, isOfficeNoteVisible, propertyAmount, statuses,
  canChangeStatus, onOpenPropertyDetail, onRequestStatusChange,
}: PipelineJobCardProps) => {
  // Nota general (NO la del empleado): la de la app (note) o la importada de AppSheet (generalNotes).
  const generalNote = property.note || property.generalNotes;
  // El fondo del avatar sale del mismo color en el CSS (color-mix).
  const teamAvatarStyle = { '--team-color': teamColor } as CSSProperties;

  const handleOpenPropertyDetail = () => onOpenPropertyDetail(property);

  return (
    <div onClick={handleOpenPropertyDetail} className="pb-job-card">
      <div className="pb-job-top-row">
        <span className="pb-job-name">{clientName}</span>
        <div className="pb-job-flags">
          {property.employeeFinishedBy && <CheckCircle size={15} className="finished pb-job-flag" />}
          {isHighPriority && <AlertTriangle size={15} className="high pb-job-flag" />}
        </div>
      </div>

      {property.address && (
        <div className="pb-job-meta-row">
          <MapPin size={12} className="pb-shrink-0" />
          <span className="pb-job-meta-text">{property.address}</span>
        </div>
      )}

      <div className="pb-job-meta-row">
        <CalendarDays size={12} className="pb-shrink-0" />
        <span>{property.scheduleDate ? formatDate(property.scheduleDate) : 'No date'}</span>
      </div>

      {/* Notas de oficina en azul y con etiqueta: van primero, son de coordinación. */}
      {isOfficeNoteVisible && property.officeNote && (
        <div className="office pb-job-note">
          <Briefcase size={12} className="office pb-job-note-icon" />
          <span className="pb-job-note-body">
            <span className="pb-job-note-label">Office</span>
            <span className="pb-job-note-text">{property.officeNote}</span>
          </span>
        </div>
      )}

      {generalNote && (
        <div className="pb-job-note">
          <StickyNote size={12} className="pb-job-note-icon" />
          <span className="pb-job-note-text">{generalNote}</span>
        </div>
      )}

      {propertyAmount !== null && <div className="pb-job-amount">{money(propertyAmount)}</div>}

      <div className="pb-job-team-row">
        <span className="pb-job-team-avatar" style={teamAvatarStyle}>
          <Users size={12} />
        </span>
        {teamName}
      </div>

      <PipelineStatusPill
        currentStatusId={property.statusId}
        statuses={statuses}
        isDisabled={!canChangeStatus}
        onRequestStatusChange={() => onRequestStatusChange(property)}
      />
    </div>
  );
};

export default PipelineJobCard;
