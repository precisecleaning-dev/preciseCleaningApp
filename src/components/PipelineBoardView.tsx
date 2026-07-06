import { useState } from 'react';
import { MapPin, Users, ChevronDown, AlertTriangle, CheckCircle, CalendarDays, X, Activity, StickyNote } from 'lucide-react';
import type { Property as BaseProperty, Status, Team, Priority } from '../types/index';
import { formatDate, dateSortValue } from '../utils/dateFormat';

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
      onClick={(e) => { e.stopPropagation(); if (!disabled) onOpen(); }}
      disabled={disabled}
      title={disabled ? undefined : 'Cambiar estado'}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px',
        fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', minHeight: 42,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.65 : 1,
        transition: 'background .15s, border-color .15s',
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#cbd5e1'; } }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st?.name || 'Unassigned'}</span>
      </span>
      <ChevronDown size={15} color="#94a3b8" style={{ flexShrink: 0 }} />
    </button>
  );
}

/* Modal central de selección de estado — mismo diseño que el de HousesView.
   Autocontenido (estilos inline) para no depender de nada del padre. Se elige
   un estado (queda resaltado) y se confirma con "Aceptar". */
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
    <>
      <style>{`
        @media (max-width: 768px) {
          .pb-status-overlay { align-items: flex-end !important; padding: 0 !important; }
          .pb-status-card { max-width: 100% !important; width: 100% !important; border-radius: 22px 22px 0 0 !important; max-height: 82vh !important; }
          .pb-status-grid { grid-template-columns: 1fr !important; }
          .pb-status-foot > button { flex: 1; justify-content: center; }
        }
      `}</style>
      <div className="pb-status-overlay" onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20, boxSizing: 'border-box',
      }}>
        <div className="pb-status-card" onClick={e => e.stopPropagation()} style={{
          background: '#fff', width: '100%', maxWidth: 480, borderRadius: 18,
          boxShadow: '0 24px 48px -12px rgba(15,23,42,0.35)', display: 'flex', flexDirection: 'column',
          maxHeight: '85vh', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '20px 22px', borderBottom: '1px solid #eef2f7', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Activity size={20} color="#2563eb" />
              </div>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Cambiar estado</h3>
                {config.title && (
                  <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {config.title}{config.subtitle ? ` · ${config.subtitle}` : ''}
                  </p>
                )}
              </div>
            </div>
            <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 6, display: 'flex', borderRadius: 8, flexShrink: 0 }}>
              <X size={22} />
            </button>
          </div>

          {/* Grid de estados */}
          <div className="pb-status-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '20px 22px', overflowY: 'auto' }}>
            {statuses.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', padding: 24 }}>No hay estados configurados.</div>
            ) : statuses.map(st => {
              const isCurrent = String(st.id).toLowerCase().trim() === cur || String(st.name).toLowerCase().trim() === cur;
              const isSelected = st.id === selectedId;
              return (
                <button
                  key={st.id}
                  onClick={() => setSelectedId(st.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                    textAlign: 'left', width: '100%', minHeight: 56, fontFamily: 'inherit',
                    background: isSelected ? '#eff6ff' : '#ffffff',
                    border: `2px solid ${isSelected ? '#2563eb' : '#e5e7eb'}`,
                    boxShadow: isSelected ? '0 2px 10px rgba(37,99,235,0.18)' : '0 1px 2px rgba(0,0,0,0.03)',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: st.color, flexShrink: 0, boxShadow: `0 0 0 4px ${st.color}1f`, border: '1px solid rgba(0,0,0,0.12)' }} />
                  <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', lineHeight: 1.3, wordBreak: 'break-word' }}>{st.name}</span>
                  {isCurrent && !isSelected && (
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>Actual</span>
                  )}
                  {isSelected && <CheckCircle size={18} color="#2563eb" style={{ flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="pb-status-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 22px', borderTop: '1px solid #eef2f7', flexShrink: 0, background: '#fff' }}>
            <button onClick={onClose} style={{ padding: '11px 18px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={handleAccept} disabled={selectedIsCurrent} style={{
              padding: '11px 20px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: '0.9rem',
              cursor: selectedIsCurrent ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: selectedIsCurrent ? 'none' : '0 4px 10px rgba(37,99,235,0.25)', opacity: selectedIsCurrent ? 0.55 : 1,
            }}>
              <CheckCircle size={16} /> Aceptar
            </button>
          </div>
        </div>
      </div>
    </>
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
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 12 }}>

      {/* --- TABLERO --- */}
      <div className="pipeline-board" style={{
        flex: 1, minHeight: 0, display: 'flex', gap: 16, overflowX: 'auto', overflowY: 'hidden',
        paddingBottom: 12, alignItems: 'flex-start', WebkitOverflowScrolling: 'touch',
      }}>
        <style>{`
          @media (max-width: 768px) {
            .pipeline-board {
              flex-direction: column !important;
              overflow-x: hidden !important;
              overflow-y: auto !important;
            }
            .pipeline-board .board-column {
              flex: 1 1 auto !important;
              max-width: 100% !important;
              width: 100% !important;
              max-height: none !important;
            }
          }
        `}</style>
        {columns.map(st => {
          const items = propsForStatus(st);
          const total = getAmount ? items.reduce((sum, p) => sum + (getAmount(p) || 0), 0) : null;
          return (
            <div key={st.id} className="board-column" style={{
              flex: '0 0 300px', maxWidth: 300, display: 'flex', flexDirection: 'column',
              background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 12, maxHeight: '100%',
            }}>
              {/* Cabecera de columna */}
              <div style={{ padding: '14px 16px', borderBottom: `3px solid ${st.color || '#e5e7eb'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {st.name}
                  </h3>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 999, padding: '2px 10px', flexShrink: 0 }}>
                    {items.length}
                  </span>
                </div>
                {total !== null && (
                  <div style={{ marginTop: 4, fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>
                    ${total.toFixed(2)} total
                  </div>
                )}
              </div>

              {/* Tarjetas */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 60 }}>
                {items.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: '16px 0' }}>
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
                      style={{
                        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14,
                        cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.05)', transition: 'all .15s',
                        display: 'flex', flexDirection: 'column', gap: 10,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,.10)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.05)'; e.currentTarget.style.transform = 'none'; }}
                    >
                      {/* Título + flags */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontWeight: 700, color: '#111827', fontSize: '0.92rem', lineHeight: 1.3 }}>
                          {getClientName(p.client)}
                        </span>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          {p.employeeFinishedBy && <CheckCircle size={15} color="#10b981" />}
                          {isHigh && <AlertTriangle size={15} color="#dc2626" />}
                        </div>
                      </div>

                      {/* Dirección */}
                      {p.address && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#6b7280' }}>
                          <MapPin size={12} style={{ flexShrink: 0 }} />
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.address}</span>
                        </div>
                      )}

                      {/* Schedule date */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#6b7280' }}>
                        <CalendarDays size={12} style={{ flexShrink: 0 }} />
                        <span>{(p as any).scheduleDate ? formatDate((p as any).scheduleDate) : 'Sin fecha'}</span>
                      </div>

                      {/* Nota general (NO la del empleado). Soporta datos de la app (note)
                          y los importados de AppSheet (generalNotes). */}
                      {((p as any).note || (p as any).generalNotes) && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: '0.78rem', color: '#475569', background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 6, padding: '6px 8px' }}>
                          <StickyNote size={12} style={{ flexShrink: 0, marginTop: 2, color: '#94a3b8' }} />
                          <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{(p as any).note || (p as any).generalNotes}</span>
                        </div>
                      )}

                      {/* Monto (si se provee) */}
                      {getAmount && (
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
                          ${(getAmount(p) || 0).toFixed(2)}
                        </div>
                      )}

                      {/* Equipo */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#475569' }}>
                        <span style={{ width: 22, height: 22, borderRadius: '50%', background: `${teamColor || '#64748b'}20`, color: teamColor || '#64748b', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
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