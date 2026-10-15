// ⭐ Tarjeta de un trabajo en la lista móvil del Overview (antes vivía dentro
//    de HousesView). Con `memo` y handlers estables (useStableCallback), escribir
//    en el formulario de la casa ya no vuelve a dibujar todas las tarjetas.
//    Sus clases (hv-job-card, hv-card-*) siguen en views/HousesView.css.
import { memo, type CSSProperties } from 'react';
import { AlertTriangle, Camera, CalendarDays, CheckCircle, Edit2, Image as ImageIcon, MapPin, Trash2, Users } from 'lucide-react';
import type { Priority, Property, Status, Team } from '../../../types/index';
import type { StatusModalConfig } from '../../../components/StatusChangeModal';
import { formatDate } from '../../../utils/dateFormat';
import { getRelationColor, getRelationName } from '../../../utils/relations';
import StatusPillSelector from './StatusPillSelector';

interface JobCardProps {
  prop: Property;
  clientName: string;
  teams: Team[];
  priorities: Priority[];
  statuses: Status[];
  statusLocked: boolean;
  /** Un guardado rápido de esta casa va en camino. */
  pending: boolean;
  /** Botones Before / After (visibilidad del rol y candado de Start Job). */
  showPhotos: boolean;
  onOpen: (prop: Property) => void;
  onStatusChange: (propertyId: string, newStatusId: string) => void;
  onRequestStatus: (cfg: StatusModalConfig) => void;
  onPhotos: (prop: Property, which: 'before' | 'after') => void;
  onEdit?: (prop: Property) => void;
  onDelete?: (prop: Property) => void;
}

function JobCard({
  prop, clientName, teams, priorities, statuses, statusLocked, pending, showPhotos,
  onOpen, onStatusChange, onRequestStatus, onPhotos, onEdit, onDelete,
}: JobCardProps) {
  const teamName = getRelationName(teams, prop.teamId, '');
  const teamColor = getRelationColor(teams, prop.teamId);
  const prObj = priorities.find((pp) => pp.id === prop.priorityId || pp.name === prop.priorityId);
  const isHighPriority = prObj?.name?.toLowerCase() === 'high' || prop.priorityId?.toLowerCase() === 'high';

  return (
    <div onClick={() => onOpen(prop)} className={`hv-job-card${pending ? ' is-pending' : ''}`}>
      <div className="hv-card-top-row">
        <span className="hv-card-client-name">{clientName}</span>
        <div className="hv-card-flags">
          {prop.employeeFinishedBy && <CheckCircle size={18} color="#10b981" />}
          {isHighPriority && <AlertTriangle size={18} color="#dc2626" />}
        </div>
      </div>

      <div className="hv-card-info-col">
        <div className="hv-card-info-row">
          <MapPin size={18} color="#94a3b8" className="hv-shrink-0" />
          <span className="hv-card-info-text">{prop.address || '—'}</span>
        </div>
        <div className="hv-card-info-row">
          <CalendarDays size={18} color="#94a3b8" className="hv-shrink-0" />
          <span>
            {prop.scheduleDate ? formatDate(prop.scheduleDate) : 'Sin fecha'}
            {prop.timeIn ? `  ·  ${prop.timeIn}` : ''}
          </span>
        </div>
        <div className="hv-card-team-row">
          <span
            className="hv-card-team-avatar"
            style={{ '--team-bg': teamColor ? `${teamColor}20` : '#f1f5f9' } as CSSProperties}
          >
            <Users size={15} color={teamColor || '#94a3b8'} />
          </span>
          <span className={`hv-card-team-label${teamName ? ' assigned' : ''}`}>{teamName || 'Unassigned'}</span>
        </div>
      </div>

      <div onClick={(e) => e.stopPropagation()}>
        <StatusPillSelector
          fullWidth
          currentStatusId={prop.statusId}
          statuses={statuses}
          onChange={(newId) => onStatusChange(prop.id, newId)}
          disabled={statusLocked}
          onRequestOpen={onRequestStatus}
          modalTitle={clientName}
          modalSubtitle={prop.address}
        />
      </div>

      {/* ⭐ Botones de fotos (táctiles, con feedback al presionar). */}
      {showPhotos && (
        <div className="hv-card-photos-row">
          <button
            onClick={(e) => { e.stopPropagation(); onPhotos(prop, 'before'); }}
            className="hv-card-btn-photos before"
          >
            <Camera size={18} /> Before Photos
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onPhotos(prop, 'after'); }}
            className="hv-card-btn-photos after"
          >
            <ImageIcon size={18} /> After Photos
          </button>
        </div>
      )}

      {(onEdit || onDelete) && (
        <div className="hv-card-actions-row">
          {onEdit && (
            <button onClick={(e) => { e.stopPropagation(); onEdit(prop); }} className="hv-card-btn-edit">
              <Edit2 size={17} /> Editar
            </button>
          )}
          {onDelete && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(prop); }} className="hv-card-btn-delete">
              <Trash2 size={17} /> Eliminar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(JobCard);
