import { useEffect, useState } from 'react';
import { History, ArrowRight, Loader2 } from 'lucide-react';
import { statusHistoryService, type StatusHistoryEntry } from '../services/statusHistoryService';
import type { Status } from '../types/index';

interface StatusHistoryPanelProps {
  propertyId: string;
  statuses: Status[];
  /** Cambia este número para forzar una recarga (p. ej. tras cambiar el status). */
  refreshKey?: number;
}

export default function StatusHistoryPanel({ propertyId, statuses, refreshKey = 0 }: StatusHistoryPanelProps) {
  const [entries, setEntries] = useState<StatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    statusHistoryService.getByProperty(propertyId).then(rows => {
      if (active) { setEntries(rows); setLoading(false); }
    });
    return () => { active = false; };
  }, [propertyId, refreshKey]);

  const findStatus = (idOrName?: string | null) => {
    if (!idOrName) return undefined;
    const safe = String(idOrName).toLowerCase().trim();
    return statuses.find(s => String(s.id).toLowerCase().trim() === safe || String(s.name).toLowerCase().trim() === safe);
  };
  const colorFor = (idOrName?: string | null) => findStatus(idOrName)?.color || '#64748b';
  const nameFor = (idOrName?: string | null) => idOrName ? (findStatus(idOrName)?.name || String(idOrName)) : '—';

  const fmt = (iso?: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  // Conteos por status (por nombre resuelto)
  const counts: Record<string, number> = {};
  entries.forEach(e => {
    const k = nameFor(e.toStatusName || e.toStatusId);
    counts[k] = (counts[k] || 0) + 1;
  });
  const countList = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ backgroundColor: '#f8fafc', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#334155', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <History size={14} /> Status History
      </div>

      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <Loader2 size={16} style={{ animation: 'shp-spin 1s linear infinite' }} /> Loading history...
          <style>{`@keyframes shp-spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`}</style>
        </div>
      ) : entries.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>
          No status changes recorded yet. Counting starts from the next status change.
        </div>
      ) : (
        <>
          {/* Conteos por status */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {countList.map(([name, n]) => {
              const color = colorFor(name);
              return (
                <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '20px', backgroundColor: `${color}12`, border: `1px solid ${color}40`, fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color }} />
                  {name}
                  <span style={{ backgroundColor: color, color: 'white', borderRadius: '10px', minWidth: '20px', textAlign: 'center', padding: '0 6px', fontSize: '0.72rem', fontWeight: 800 }}>{n}</span>
                </span>
              );
            })}
          </div>

          {/* Línea de tiempo */}
          <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
            {entries.map((e, i) => (
              <div key={e.id || i} style={{ padding: '12px 16px', borderBottom: i < entries.length - 1 ? '1px solid #f1f5f9' : 'none', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: colorFor(e.toStatusName || e.toStatusId), flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#1e293b', fontWeight: 600, flexWrap: 'wrap' }}>
                    {e.fromStatusId && (
                      <>
                        <span style={{ color: '#94a3b8', fontWeight: 500 }}>{nameFor(e.fromStatusName || e.fromStatusId)}</span>
                        <ArrowRight size={13} color="#cbd5e1" />
                      </>
                    )}
                    <span>{nameFor(e.toStatusName || e.toStatusId)}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                    {fmt(e.changedAt)}{e.changedBy ? ` · ${e.changedBy}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}