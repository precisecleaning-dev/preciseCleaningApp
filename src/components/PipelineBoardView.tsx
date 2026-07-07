import { useState } from 'react';
import type { CSSProperties } from 'react';
import { MapPin, Users, ChevronDown, AlertTriangle, CheckCircle, CalendarDays, X, Activity, StickyNote } from 'lucide-react';
import type { Property as BaseProperty, Status, Team, Priority } from '../types/index';
import { formatDate, dateSortValue } from '../utils/dateFormat';
import './PipelineBoardView.css';

/* ------------------------------------------------------------------
   PipelineBoardView.tsx — Vista alternativa tipo tablero (Kanban)
   para HousesView. Una columna por cada Status; cada trabajo es una
   tarjeta arrastrable visualmente (cambia el estado desde el menú).
   Presentacional puro: recibe los datos y callbacks por props, así
   que no toca Firebase ni tu lógica existente.
   Usa tu misma paleta (#3b82f6, #111827, etc.) y el color de cada
   status para diferenciar columnas.

   NUEVO: filtro de rango de fechas (Desde / Hasta) arriba del tablero.
   Las columnas Quality Check y Recall SIEMPRE muestran todo su trabajo,
   sin importar el filtro (son buckets de pendientes que no se deben
   perder de vista). El filtro usa scheduleDate y, si no hay, receiveDate.
   ------------------------------------------------------------------ */

type Property = BaseProperty & {
  employeeFinishedBy?: string | null;
  scheduleDate?: string | null;
  receiveDate?: string | null;
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

const getRel = (list: any[], idOrName?: string | null, fb = '-') => {
  if (!idOrName) return fb;
  const v = String(idOrName).toLowerCase().trim();
  const found = list.find(i => String(i.id).toLowerCase().trim() === v || String(i.name).toLowerCase().trim() === v);
  return found ? found.name : fb;
};
const getRelColor = (list: any[], idOrName?: string | null) => {
  if (!idOrName) return undefined;
  const v = String(idOrName).toLowerCase().trim();
  return list.find(i => String(i.id).toLowerCase().trim() === v || String(i.name).toLowerCase().trim() === v)?.color;
};

/* Normaliza una fecha a 'YYYY-MM-DD' para comparar como string (ISO) */

// Configuración que la tarjeta envía al modal central de cambio de estado.
type StatusModalConfig = {
  currentId: string;
  onSelect: (id: string) => void;
  title?: string;
  subtitle?: string;
};

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

/* Modal central de selección de estado — mismo diseño que el de HousesView.
   Autocontenido (estilos en PipelineBoardView.css) para no depender de nada
   del padre. Se elige un estado (queda resaltado) y se confirma con "Aceptar". */
function StatusChangeModal({ config, statuses, onClose }: {
  config: StatusModalConfig; statuses: Status[]; onClose: () => void;
}) {
  const cur = String(config.currentId || '').toLowerCase().trim();
  const resolveCurrentId = () => {
    const match = statuses.find(st => String(st.id).toLowerCase().trim() === cur || String(st.name).toLowerCase().trim() === cur);
    return match ? match.id : (config.currentId || '');
  };
  const [selectedId, setSelectedId] = useState<string>(resolveCurrentId());

  const selectedIsCurrent = (() => {
    const sel = statuses.find(st => st.id === selectedId);
    const selName = String(sel?.name || '').toLowerCase().trim();
    return String(selectedId).toLowerCase().trim() === cur || (selName !== '' && selName === cur);
  })();

  const handleAccept = () => {
    if (selectedId && !selectedIsCurrent) config.onSelect(selectedId);
    onClose();
  };

  return (
    <div className="pb-status-overlay" onClick={onClose}>
      <div className="pb-status-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="pb-modal-head">
          <div className="pb-modal-head-info">
            <div className="pb-modal-icon">
              <Activity size={20} color="#2563eb" />
            </div>
            <div className="pb-min-w-0">
              <h3 className="pb-modal-title">Cambiar estado</h3>
              {config.title && (
                <p className="pb-modal-subtitle">
                  {config.title}{config.subtitle ? ` · ${config.subtitle}` : ''}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="pb-close-btn">
            <X size={22} />
          </button>
        </div>

        {/* Grid de estados */}
        <div className="pb-status-grid">
          {statuses.length === 0 ? (
            <div className="pb-status-empty">No hay estados configurados.</div>
          ) : statuses.map(st => {
            const isCurrent = String(st.id).toLowerCase().trim() === cur || String(st.name).toLowerCase().trim() === cur;
            const isSelected = st.id === selectedId;
            return (
              <button
                key={st.id}
                onClick={() => setSelectedId(st.id)}
                className={`pb-status-option${isSelected ? ' selected' : ''}`}
              >
                <span
                  className="pb-status-option-dot"
                  style={{ '--dot-color': st.color, '--dot-shadow': `${st.color}1f` } as CSSProperties}
                />
                <span className="pb-status-option-name">{st.name}</span>
                {isCurrent && !isSelected && (
                  <span className="pb-status-option-badge">Actual</span>
                )}
                {isSelected && <CheckCircle size={18} color="#2563eb" className="pb-shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pb-status-foot">
          <button onClick={onClose} className="pb-btn-secondary">Cancelar</button>
          <button onClick={handleAccept} disabled={selectedIsCurrent} className="pb-btn-primary">
            <CheckCircle size={16} /> Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PipelineBoardView({
  properties, statuses, teams, priorities = [], getClientName,
  onOpenDetail, onQuickStatusChange, canEdit, isSaving, getAmount,
}: PipelineBoardViewProps) {

  // --- FILTRO DE FECHAS (rango Desde / Hasta) ---
  // Modal central de cambio de estado (null = cerrado)
  const [statusModal, setStatusModal] = useState<StatusModalConfig | null>(null);

  // Columnas = todos los status (excluye "invoice", igual que tu tabla)
  const columns = statuses.filter(s => s.name?.toLowerCase() !== 'invoice');

  const propsForStatus = (st: Status) =>
    properties.filter(p => {
      const match = p.statusId === st.id || p.statusId === st.name;
      if (!match) return false;
      const isInvoice = (getRel(statuses, p.statusId, '') || '').toLowerCase() === 'invoice';
      if (isInvoice) return false;
      return true;
    })
    // ⭐ Orden por fecha descendente (más reciente primero). Usa scheduleDate, si no receiveDate.
    .sort((a, b) => dateSortValue((b as any).scheduleDate || (b as any).receiveDate) - dateSortValue((a as any).scheduleDate || (a as any).receiveDate));

  // Contadores para el indicador del filtro
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
                  const teamColor = getRelColor(teams, p.teamId);
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
                        <span>{(p as any).scheduleDate ? formatDate((p as any).scheduleDate) : 'Sin fecha'}</span>
                      </div>

                      {/* Nota general (NO la del empleado). Soporta datos de la app (note)
                          y los importados de AppSheet (generalNotes). */}
                      {((p as any).note || (p as any).generalNotes) && (
                        <div className="pb-job-note">
                          <StickyNote size={12} className="pb-job-note-icon" />
                          <span className="pb-job-note-text">{(p as any).note || (p as any).generalNotes}</span>
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
                        {getRel(teams, p.teamId, 'Unassigned')}
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
