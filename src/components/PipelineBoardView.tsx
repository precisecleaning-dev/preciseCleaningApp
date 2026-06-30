import { useState } from 'react';
import { MapPin, Users, ChevronDown, AlertTriangle, CheckCircle, CalendarDays, Filter, RotateCcw } from 'lucide-react';
import type { Property as BaseProperty, Status, Team, Priority } from '../types/index';

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

/* Columnas que NUNCA se ocultan con el filtro de fechas */
const isAlwaysVisibleStatus = (st: { name?: string }) => {
  const n = String(st?.name || '').toLowerCase();
  return n.includes('quality') || n.includes('recall');
};

/* Normaliza una fecha a 'YYYY-MM-DD' para comparar como string (ISO) */
const normDate = (d?: string | null) => (d ? String(d).slice(0, 10) : '');

/* Menú compacto para cambiar el status desde la tarjeta */
function StatusMenu({ current, statuses, onChange, disabled }: {
  current: string; statuses: Status[]; onChange: (id: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const v = String(current || '').toLowerCase().trim();
  const st = statuses.find(s => String(s.id).toLowerCase().trim() === v || String(s.name).toLowerCase().trim() === v);
  return (
    <div tabIndex={0} onBlur={() => setTimeout(() => setOpen(false), 150)} style={{ position: 'relative' }}>
      <button
        onClick={(e) => { e.stopPropagation(); if (!disabled) setOpen(o => !o); }}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px',
          fontSize: '0.82rem', fontWeight: 600, color: '#111827',
          cursor: disabled ? 'not-allowed' : 'pointer', minHeight: 40,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: st?.color || '#64748b', flexShrink: 0 }} />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st?.name || 'Unassigned'}</span>
        </span>
        <ChevronDown size={15} color="#9ca3af" style={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'white',
          border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 10px 25px rgba(0,0,0,.12)',
          zIndex: 50, maxHeight: 220, overflowY: 'auto',
        }}>
          {statuses.map(s => (
            <div
              key={s.id}
              onClick={(e) => { e.stopPropagation(); if (s.id !== current && s.name !== current) onChange(s.id); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer',
                fontSize: '0.82rem', color: '#111827', borderBottom: '1px solid #f1f5f9',
                background: (current === s.id || current === s.name) ? '#f8fafc' : 'transparent',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
              onMouseLeave={(e) => (e.currentTarget.style.background = (current === s.id || current === s.name) ? '#f8fafc' : 'transparent')}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              {s.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PipelineBoardView({
  properties, statuses, teams, priorities = [], getClientName,
  onOpenDetail, onQuickStatusChange, canEdit, isSaving, getAmount,
}: PipelineBoardViewProps) {

  // --- FILTRO DE FECHAS (rango Desde / Hasta) ---
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const filterActive = !!(fromDate || toDate);

  const clearFilter = () => { setFromDate(''); setToDate(''); };

  // ¿La propiedad cae dentro del rango? (usa scheduleDate, si no receiveDate)
  const inDateRange = (p: Property) => {
    if (!fromDate && !toDate) return true;
    const d = normDate(p.scheduleDate || p.receiveDate);
    if (!d) return false; // sin fecha: se oculta cuando hay filtro (salvo columnas siempre visibles)
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return true;
  };

  // Columnas = todos los status (excluye "invoice", igual que tu tabla)
  const columns = statuses.filter(s => s.name?.toLowerCase() !== 'invoice');

  const propsForStatus = (st: Status) =>
    properties.filter(p => {
      const match = p.statusId === st.id || p.statusId === st.name;
      if (!match) return false;
      const isInvoice = (getRel(statuses, p.statusId, '') || '').toLowerCase() === 'invoice';
      if (isInvoice) return false;
      // Quality Check y Recall: nunca se filtran por fecha
      if (isAlwaysVisibleStatus(st)) return true;
      return inDateRange(p);
    });

  // Contadores para el indicador del filtro
  const totalJobs = properties.filter(p => (getRel(statuses, p.statusId, '') || '').toLowerCase() !== 'invoice').length;
  const visibleJobs = columns.reduce((n, st) => n + propsForStatus(st).length, 0);

  // Estilos del filtro
  const dateInputStyle: React.CSSProperties = {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 10px',
    fontSize: '0.85rem', color: '#111827', fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
  };
  const fieldLabelStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 600, color: '#64748b',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 12 }}>

      {/* --- BARRA DE FILTRO DE FECHAS --- */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 14px',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
          <Filter size={15} color="#3b82f6" /> Filtrar por fecha
        </span>

        <label style={fieldLabelStyle}>
          Desde
          <input type="date" value={fromDate} max={toDate || undefined}
            onChange={e => setFromDate(e.target.value)} style={dateInputStyle} />
        </label>

        <label style={fieldLabelStyle}>
          Hasta
          <input type="date" value={toDate} min={fromDate || undefined}
            onChange={e => setToDate(e.target.value)} style={dateInputStyle} />
        </label>

        {filterActive && (
          <button onClick={clearFilter} style={{
            display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', border: '1px solid #e5e7eb',
            borderRadius: 8, padding: '7px 12px', fontSize: '0.82rem', fontWeight: 600, color: '#475569', cursor: 'pointer',
          }}>
            <RotateCcw size={14} /> Limpiar
          </button>
        )}

        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
            {visibleJobs} <span style={{ color: '#94a3b8', fontWeight: 600 }}>de {totalJobs} trabajos</span>
          </span>
          {filterActive && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 700,
              color: '#0369a1', background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: 999, padding: '3px 10px',
            }}>
              <CheckCircle size={12} /> QC y Recall siempre visibles
            </span>
          )}
        </span>
      </div>

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
          const alwaysVisible = isAlwaysVisibleStatus(st);
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
                {/* Aviso "siempre visible" cuando hay un filtro activo */}
                {filterActive && alwaysVisible && (
                  <div style={{
                    marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.68rem',
                    fontWeight: 700, color: '#0369a1', background: '#e0f2fe', borderRadius: 999, padding: '2px 8px',
                  }}>
                    <CheckCircle size={11} /> Sin filtrar
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
                        <span>{(p as any).scheduleDate || 'Sin fecha'}</span>
                      </div>

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

                      {/* Cambiar estado */}
                      <div onClick={(e) => e.stopPropagation()}>
                        <StatusMenu
                          current={p.statusId}
                          statuses={statuses}
                          onChange={(id) => onQuickStatusChange(p.id, id)}
                          disabled={isSaving || !canEdit}
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
    </div>
  );
}