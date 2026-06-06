import { useState } from 'react';
import { MapPin, Users, ChevronDown, AlertTriangle, CheckCircle, CalendarDays } from 'lucide-react';
import type { Property as BaseProperty, Status, Team, Priority } from '../types/index';

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
  employeeFinishedBy?: string | null;
  scheduleDate?: string | null;
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

  // Columnas = todos los status (excluye "invoice", igual que tu tabla)
  const columns = statuses.filter(s => s.name?.toLowerCase() !== 'invoice');

  const propsForStatus = (st: Status) =>
    properties.filter(p => {
      const match = p.statusId === st.id || p.statusId === st.name;
      const isInvoice = (getRel(statuses, p.statusId, '') || '').toLowerCase() === 'invoice';
      return match && !isInvoice;
    });

  return (
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
  );
}