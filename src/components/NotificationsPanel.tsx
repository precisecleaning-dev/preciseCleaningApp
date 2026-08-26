// ============================================================================
// ⭐ PANEL DE NOTIFICACIONES.
// Se abre desde el menú lateral. Muestra: (1) el aviso de versión nueva con su
// botón de actualizar, cuando aplica, y (2) la actividad reciente de la app
// (últimos movimientos de la bitácora: quién hizo qué y cuándo), para estar al
// tanto sin ir al Activity Log completo.
// ============================================================================
import { useEffect, useState } from 'react';
import { Bell, X, RefreshCw, ScrollText } from 'lucide-react';
import { fetchLogs } from '../services/activityLogService';
import type { ActivityLogEntry } from '../services/activityLogService';
import { reloadForUpdate } from '../hooks/useVersionCheck';
import './NotificationsPanel.css';

interface NotificationsPanelProps {
  open: boolean;
  onClose: () => void;
  updateAvailable: boolean;
}

const ACTION_LABEL: Record<string, string> = {
  create: 'creó',
  update: 'editó',
  delete: 'borró',
  status_change: 'cambió el status de',
  calendar_sync: 'sincronizó a Calendar',
  note: 'anotó en',
  photos: 'subió fotos de',
};

const timeAgo = (iso: string): string => {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} día(s)`;
};

export default function NotificationsPanel({
  open,
  onClose,
  updateAvailable,
}: NotificationsPanelProps) {
  const [entries, setEntries] = useState<ActivityLogEntry[] | null>(null);
  // ⚠ null = cargando (evita un setState síncrono dentro del efecto).
  const isLoading = entries === null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchLogs({ pageSize: 15 })
      .then((page) => {
        if (!cancelled) setEntries(page.entries);
      })
      .catch((error) => {
        console.error('Notificaciones: no se pudo leer la bitácora', error);
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
      // Al cerrar se limpia para que la próxima apertura muestre datos frescos.
      setEntries(null);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-overlay-centered" onClick={onClose}>
      <div className="modal-50 np-modal" onClick={(e) => e.stopPropagation()}>
        <header className="np-header">
          <h3 className="np-title">
            <Bell size={18} /> Notificaciones
          </h3>
          <button className="np-close" aria-label="Cerrar" onClick={onClose}>
            <X size={22} />
          </button>
        </header>

        <div className="np-body">
          {updateAvailable && (
            <div className="np-update-card">
              <div className="np-update-text">
                <span className="np-update-title">Nueva versión disponible</span>
                <span className="np-update-sub">
                  Hay una actualización desplegada. Recarga para usar la versión
                  más reciente.
                </span>
              </div>
              <button className="np-update-btn" onClick={reloadForUpdate}>
                <RefreshCw size={15} /> Actualizar
              </button>
            </div>
          )}

          <div className="np-section-title">
            <ScrollText size={14} /> Actividad reciente
          </div>

          {isLoading ? (
            <div className="np-empty">Cargando actividad…</div>
          ) : !entries || entries.length === 0 ? (
            <div className="np-empty">Sin actividad reciente.</div>
          ) : (
            <ul className="np-list">
              {entries.map((e) => (
                <li key={e.id} className="np-item">
                  <span className="np-item-line">
                    <b>{e.userName || 'Alguien'}</b>{' '}
                    {ACTION_LABEL[e.action] || e.action}{' '}
                    <b>{e.targetLabel || e.module}</b>
                    <span className="np-item-module"> · {e.module}</span>
                  </span>
                  {e.detail ? (
                    <span className="np-item-detail">{e.detail}</span>
                  ) : null}
                  <span className="np-item-when">{timeAgo(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
