import { useState, useEffect, useCallback } from 'react';
import { Menu, Search, ScrollText, RefreshCw, ArrowRight } from 'lucide-react';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { SystemUser, Role } from '../types/index';
import { fetchLogs, type ActivityLogEntry, type LogAction } from '../services/activityLogService';
import './ActivityLogView.css';

/* ------------------------------------------------------------------
   ActivityLogView.tsx — Bitacora de actividad

   Quien hizo que, cuando y sobre que registro. En las ediciones muestra
   campo por campo el valor anterior y el nuevo.

   Se pagina contra el servidor (50 por pagina): la coleccion crece sin
   techo y traerla completa repetiria el problema de rendimiento que ya
   arreglamos en Overview.
   ------------------------------------------------------------------ */

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<LogAction | 'all', string> = {
  all: 'Todas',
  create: 'Alta',
  update: 'Edición',
  delete: 'Borrado',
  status_change: 'Cambio de status',
  calendar_sync: 'Google Calendar',
  photo_upload: 'Fotos',
  login: 'Inicio de sesión',
  export: 'Exportación',
};

const ACTION_ORDER: (LogAction | 'all')[] = [
  'all', 'create', 'update', 'delete', 'status_change', 'calendar_sync', 'photo_upload', 'export',
];

interface ActivityLogViewProps {
  onOpenMenu: () => void;
  currentUser?: SystemUser | null;
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
}

const fmtDate = (iso?: string): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export default function ActivityLogView({ onOpenMenu }: ActivityLogViewProps) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [users, setUsers] = useState<SystemUser[]>([]);
  const [userFilter, setUserFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState<LogAction | 'all'>('all');
  const [search, setSearch] = useState('');

  // Catalogo de usuarios para el selector
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'system_users'),
      (snap) => setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })) as SystemUser[]),
      (err) => console.error('Error system_users:', err),
    );
    return () => unsub();
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const page = await fetchLogs({ pageSize: PAGE_SIZE, userId: userFilter, action: actionFilter });
      setEntries(page.entries);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (error) {
      console.error('Error cargando la bitácora:', error);
      // El error mas comun aqui es un indice compuesto faltante en Firestore.
      setLoadError('No se pudo cargar la bitácora. Si acabas de combinar filtros, revisa la consola: Firestore suele pedir crear un índice y deja el enlace directo ahí.');
      setEntries([]);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [userFilter, actionFilter]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (!cursor) return;
    setIsLoadingMore(true);
    try {
      const page = await fetchLogs({ pageSize: PAGE_SIZE, cursor, userId: userFilter, action: actionFilter });
      setEntries(prev => [...prev, ...page.entries]);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (error) {
      console.error('Error paginando la bitácora:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // La busqueda por texto filtra la pagina ya cargada (Firestore no hace
  // busqueda parcial de texto sin un servicio aparte).
  const q = search.toLowerCase().trim();
  const shown = q === '' ? entries : entries.filter(e =>
    String(e.targetLabel || '').toLowerCase().includes(q) ||
    String(e.userName || '').toLowerCase().includes(q) ||
    String(e.module || '').toLowerCase().includes(q) ||
    String(e.detail || '').toLowerCase().includes(q)
  );

  return (
    <div className="fade-in al-page">

      <header className="al-header">
        <button onClick={onOpenMenu} className="al-hamburger-btn" aria-label="Open menu">
          <Menu size={24} />
        </button>
        <div className="al-header-title-group">
          <div className="al-header-icon-box"><ScrollText size={22} color="#ffffff" /></div>
          <div>
            <h1 className="al-title">Activity Log</h1>
            <p className="al-subtitle">Quién hizo qué, cuándo y sobre qué registro</p>
          </div>
        </div>
        <button className="al-btn-refresh" onClick={load} disabled={isLoading}>
          <RefreshCw size={15} /> Actualizar
        </button>
      </header>

      {/* ---- Filtros ---- */}
      <div className="al-filters-card">
        <div className="al-chips-row">
          {ACTION_ORDER.map(a => (
            <button
              key={a}
              className={`al-chip${actionFilter === a ? ' active' : ''}`}
              onClick={() => setActionFilter(a)}
            >
              {ACTION_LABELS[a]}
            </button>
          ))}
        </div>

        <div className="al-filters-row">
          <div className="al-field">
            <label className="al-label">Usuario</label>
            <select
              className="al-select"
              value={userFilter}
              onChange={e => setUserFilter(e.target.value)}
            >
              <option value="all">Todos los usuarios</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.id}
                </option>
              ))}
            </select>
          </div>

          <div className="al-field grow">
            <label className="al-label">Buscar en esta página</label>
            <div className="al-search-box">
              <Search size={16} className="al-search-icon" />
              <input
                type="text"
                className="al-search-input"
                placeholder="Cliente, dirección, usuario o módulo..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ---- Listado ---- */}
      <div className="al-card">
        {loadError !== '' && <div className="al-error">{loadError}</div>}

        {isLoading ? (
          <div className="al-empty">Cargando bitácora...</div>
        ) : shown.length === 0 ? (
          <div className="al-empty">
            No hay eventos registrados con estos filtros.
          </div>
        ) : (
          <div className="al-list">
            {shown.map(e => (
              <div key={e.id} className="al-entry">
                <div className="al-entry-head">
                  <span className={`al-action-badge ${e.action}`}>
                    {ACTION_LABELS[e.action] || e.action}
                  </span>
                  <span className="al-entry-module">{e.module}</span>
                  <span className="al-entry-date">{fmtDate(e.at)}</span>
                </div>

                <div className="al-entry-body">
                  <div className="al-entry-target">{e.targetLabel || e.targetId || '-'}</div>
                  <div className="al-entry-user">por {e.userName}</div>
                  {e.detail !== '' && e.detail !== undefined && (
                    <div className="al-entry-detail">{e.detail}</div>
                  )}
                </div>

                {e.changes && e.changes.length > 0 && (
                  <div className="al-changes">
                    {e.changes.map((c, i) => (
                      <div key={`${e.id}-${i}`} className="al-change-row">
                        <span className="al-change-field">{c.field}</span>
                        <span className="al-change-before">{c.before || '(vacío)'}</span>
                        <ArrowRight size={13} className="al-change-arrow" />
                        <span className="al-change-after">{c.after || '(vacío)'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {hasMore && !isLoading && (
          <div className="al-loadmore-wrap">
            <button className="al-btn-loadmore" onClick={loadMore} disabled={isLoadingMore}>
              {isLoadingMore ? 'Cargando...' : 'Cargar más'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}