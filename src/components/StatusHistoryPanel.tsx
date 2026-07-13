import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { History, ArrowRight, Loader2 } from 'lucide-react';
import { statusHistoryService, type StatusHistoryEntry } from '../services/statusHistoryService';
import type { Status } from '../types/index';
import { getRelationName, getRelationColor } from '../utils/relations';
import './StatusHistoryPanel.css';

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

  const colorFor = (idOrName?: string | null) => getRelationColor(statuses, idOrName) || '#64748b';
  // A diferencia de getRelationName, si el status ya no existe en el catálogo (fue borrado)
  // cae al valor crudo guardado en el historial en vez de un fallback genérico — así el
  // historial sigue siendo legible aunque el status ya no exista.
  const nameFor = (idOrName?: string | null) => idOrName ? getRelationName(statuses, idOrName, String(idOrName)) : '—';

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
    <div className="shp-panel">
      <div className="shp-header">
        <History size={14} /> Status History
      </div>

      {loading ? (
        <div className="shp-loading">
          <Loader2 size={16} className="shp-spin" /> Loading history...
        </div>
      ) : entries.length === 0 ? (
        <div className="shp-empty">
          No status changes recorded yet. Counting starts from the next status change.
        </div>
      ) : (
        <>
          {/* Conteos por status */}
          <ul className="shp-counts">
            {countList.map(([name, n]) => {
              const color = colorFor(name);
              return (
                <li key={name} className="shp-pill" style={{ '--pill-bg': `${color}12`, '--pill-border': `${color}40` } as CSSProperties}>
                  <span className="shp-dot-8" style={{ '--dot-color': color } as CSSProperties} />
                  {name}
                  <span className="shp-count-badge" style={{ '--dot-color': color } as CSSProperties}>{n}</span>
                </li>
              );
            })}
          </ul>

          {/* Línea de tiempo */}
          <ul className="shp-timeline">
            {entries.map((e, i) => (
              <li key={e.id || i} className="shp-timeline-row">
                <span className="shp-dot-10" style={{ '--dot-color': colorFor(e.toStatusName || e.toStatusId) } as CSSProperties} />
                <div className="shp-timeline-content">
                  <div className="shp-status-row">
                    {e.fromStatusId && (
                      <>
                        <span className="shp-from-status">{nameFor(e.fromStatusName || e.fromStatusId)}</span>
                        <ArrowRight size={13} color="#cbd5e1" />
                      </>
                    )}
                    <span>{nameFor(e.toStatusName || e.toStatusId)}</span>
                  </div>
                  <div className="shp-meta">
                    {fmt(e.changedAt)}{e.changedBy ? ` · ${e.changedBy}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
