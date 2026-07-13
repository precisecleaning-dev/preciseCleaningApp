import { useState } from 'react';
import type { CSSProperties } from 'react';
import { MapPin, Users, ChevronDown, AlertTriangle, CalendarDays, StickyNote, CheckCircle } from 'lucide-react';
import type { Property as BaseProperty, Status, Team, Priority } from '../types/index';
import { formatDate, dateSortValue } from '../utils/dateFormat';
import { getRelationName, getRelationColor } from '../utils/relations';
import StatusChangeModal, { type StatusModalConfig } from './StatusChangeModal';
import './PipelineBoardView.css';

/* ------------------------------------------------------------------
   PipelineBoardView.tsx — Vista alternativa tipo tablero (Kanban)
   para HousesView. Una columna por cada Status; cada trabajo es una
   tarjeta arrastrable visualmente (cambia el estado desde el menú).
   Presentacional puro: recibe los datos y callbacks por props, así
   que no toca Firebase ni tu lógica existente.
   Usa tu misma paleta (#3b82f6, #111827, etc.) y el color de cada
   status para diferenciar columnas.
   ------------------------------------------------------------------ */

type Property = BaseProperty & {
  scheduleDate?: string | null;
  receiveDate?: string | null;
  note?: string | null;
  generalNotes?: string | null;
};

interface PipelineBoardViewProps {
  properties: Property[];
  statuses: Status[];
  teams: Team[];
  priorities?: Priority[];
  getClientName: (idOrName?: string | null) => string;
  onOpenDetail: (p: Property) => void;
  onQuickStatusChange: (propertyId: string, newStatusId: string) => void;
  canEdit?: boolean;
  isSaving?: boolean;
  /** Opcional: si tienes el monto facturado por propiedad, muéstralo y suma por columna */
  getAmount?: (p: Property) => number;
}

/* Pastilla de estado en la tarjeta. Al tocarla YA NO abre un dropdown:
   solicita abrir el modal central de selección (StatusChangeModal), igual
   que en HousesView (tabla, tarjetas móviles y detalle). */
function StatusPill({ current, statuses, disabled, onOpen }: {
  current: string; statuses: Status[]; disabled?: boolean; onOpen: () => void;
}) {
  const v = String(current || '').toLowerCase().trim();
  const st = statuses.find(s => String(s.id).toLowerCase().trim() === v || String(s.name).toLowerCase().trim() === v);
  const color = st?.color || '#64748b';
  return (
    <button
      className="pb-status-pill"
      onClick={(e) => { e.stopPropagation(); if (!disabled) onOpen(); }}
      disabled={disabled}
      title={disabled ? undefined : 'Cambiar estado'}
    >
      <span className="pb-status-pill-label">
        <span className="pb-status-dot" style={{ '--dot-color': color } as CSSProperties} />
        <span className="pb-status-pill-name">{st?.name || 'Unassigned'}</span>
      </span>
      <ChevronDown size={15} color="#94a3b8" className="pb-shrink-0" />
    </button>
  );
}

export default function PipelineBoardView({
  properties, statuses, teams, priorities = [], getClientName,
  onOpenDetail, onQuickStatusChange, canEdit, isSaving, getAmount,
}: PipelineBoardViewProps) {

  // Modal central de cambio de estado (null = cerrado)
  const [statusModal, setStatusModal] = useState<StatusModalConfig | null>(null);

  // Columnas = todos los status (excluye "invoice", igual que tu tabla)
  const columns = statuses.filter(s => s.name?.toLowerCase() !== 'invoice');

  const propsForStatus = (st: Status) =>
    properties
      .filter(p => p.statusId === st.id || p.statusId === st.name)
      // ⭐ Orden por fecha descendente (más reciente primero). Usa scheduleDate, si no receiveDate.
      .sort((a, b) => dateSortValue(b.scheduleDate || b.receiveDate) - dateSortValue(a.scheduleDate || a.receiveDate));

  return (
    <div className="pipeline-board-wrap">

      {/* --- TABLERO --- */}
      <div className="pipeline-board">
        {columns.map(st => {
          const items = propsForStatus(st);
          const total = getAmount ? items.reduce((sum, p) => sum + (getAmount(p) || 0), 0) : null;
          return (
            <div key={st.id} className="board-column">
              {/* Cabecera de columna */}
              <div className="pb-column-head" style={{ '--col-color': st.color || '#e5e7eb' } as CSSProperties}>
                <div className="pb-column-head-row">
                  <h3 className="pb-column-title">
                    {st.name}
                  </h3>
                  <span className="pb-column-count">
                    {items.length}
                  </span>
                </div>
                {total !== null && (
                  <div className="pb-column-total">
                    ${total.toFixed(2)} total
                  </div>
                )}
              </div>

              {/* Tarjetas */}
              <div className="pb-column-body">
                {items.length === 0 ? (
                  <div className="pb-column-empty">
                    Sin trabajos
                  </div>
                ) : items.map(p => {
                  const prObj = priorities.find(pp => pp.id === p.priorityId || pp.name === p.priorityId);
                  const isHigh = prObj?.name?.toLowerCase() === 'high' || String(p.priorityId).toLowerCase() === 'high';
                  const teamColor = getRelationColor(teams, p.teamId);
                  return (
                    <div
                      key={p.id}
                      onClick={() => onOpenDetail(p)}
                      className="pb-job-card"
                    >
                      {/* Título + flags */}
                      <div className="pb-job-top-row">
                        <span className="pb-job-name">
                          {getClientName(p.client)}
                        </span>
                        <div className="pb-job-flags">
                          {p.employeeFinishedBy && <CheckCircle size={15} color="#10b981" />}
                          {isHigh && <AlertTriangle size={15} color="#dc2626" />}
                        </div>
                      </div>

                      {/* Dirección */}
                      {p.address && (
                        <div className="pb-job-meta-row">
                          <MapPin size={12} className="pb-shrink-0" />
                          <span className="pb-job-meta-text">{p.address}</span>
                        </div>
                      )}

                      {/* Schedule date */}
                      <div className="pb-job-meta-row">
                        <CalendarDays size={12} className="pb-shrink-0" />
                        <span>{p.scheduleDate ? formatDate(p.scheduleDate) : 'Sin fecha'}</span>
                      </div>

                      {/* Nota general (NO la del empleado). Soporta datos de la app (note)
                          y los importados de AppSheet (generalNotes). */}
                      {(p.note || p.generalNotes) && (
                        <div className="pb-job-note">
                          <StickyNote size={12} className="pb-job-note-icon" />
                          <span className="pb-job-note-text">{p.note || p.generalNotes}</span>
                        </div>
                      )}

                      {/* Monto (si se provee) */}
                      {getAmount && (
                        <div className="pb-job-amount">
                          ${(getAmount(p) || 0).toFixed(2)}
                        </div>
                      )}

                      {/* Equipo */}
                      <div className="pb-job-team-row">
                        <span
                          className="pb-job-team-avatar"
                          style={{ '--team-bg': `${teamColor || '#64748b'}20`, '--team-color': teamColor || '#64748b' } as CSSProperties}
                        >
                          <Users size={12} />
                        </span>
                        {getRelationName(teams, p.teamId, 'Unassigned')}
                      </div>

                      {/* Cambiar estado — abre el modal central */}
                      <div onClick={(e) => e.stopPropagation()}>
                        <StatusPill
                          current={p.statusId}
                          statuses={statuses}
                          disabled={isSaving || !canEdit}
                          onOpen={() => setStatusModal({
                            currentId: p.statusId,
                            onSelect: (id) => onQuickStatusChange(p.id, id),
                            title: getClientName(p.client),
                            subtitle: p.address,
                          })}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* --- MODAL CENTRAL DE CAMBIO DE ESTADO --- */}
      {statusModal && (
        <StatusChangeModal
          config={statusModal}
          statuses={statuses}
          onClose={() => setStatusModal(null)}
        />
      )}
    </div>
  );
}
