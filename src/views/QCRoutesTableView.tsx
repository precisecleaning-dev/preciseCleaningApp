import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Route, Menu, Share2, Eye, X, CheckCircle2, Radio, MapPin,
  Loader2, Clock, Search, LocateFixed, Edit2, Trash2, Save, ArrowUp, ArrowDown
} from 'lucide-react';
import { db } from '../config/firebase';
import { collection, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { shareRouteLink, liveDivIcon, type LiveUserPosition } from '../utils/liveRoute';
import { type LatLng, ensureLeaflet, fetchOSRMRoute } from '../utils/routing';
import { escapeHtml } from '../utils/escapeHtml';
import './QCRoutesTableView.css';

// ============================================================================
//  QCRoutesTableView — pestaña "Rutas" del hub de Quality Check.
//
//  Tabla en tiempo real (onSnapshot) de la colección `qc_routes`: las rutas
//  guardadas desde el drawer de QualityCheckView o desde QCRouteView. Muestra
//  el avance (paradas visitadas), quién está transmitiendo GPS en este
//  momento y el estado (En curso / Completada / Pendiente). Al terminar una
//  ruta, el botón "Ver" abre el detalle con la hora de llegada a cada parada
//  — el recorrido que tomó el manager. "Compartir" genera el mismo link
//  `?qcRoute=<id>` que el drawer (helpers en utils/liveRoute.ts).
// ============================================================================

interface RouteStop {
  houseId: string;
  client: string;
  address: string;
  lat: number | null;
  lng: number | null;
  legKm?: number;
  etaMin?: number;
  arrived?: boolean;
  arrivedAt?: string | null;
}

interface QCRouteDoc {
  id: string;
  name?: string;
  origin?: LatLng | null;
  avgSpeed?: number;
  stops?: RouteStop[];
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  live?: Record<string, LiveUserPosition>;
}

interface Props {
  onOpenMenu: () => void;
}

const LIVE_STALE_MS = 5 * 60 * 1000;

type RouteState = 'live' | 'done' | 'pending';

const fmtDate = (iso?: string): string =>
  iso ? new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTime = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDuration = (ms: number): string => {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
};

export default function QCRoutesTableView({ onOpenMenu }: Props) {
  const [routes, setRoutes] = useState<QCRouteDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<QCRouteDoc | null>(null);
  // ⭐ Punto 5: edición de una ruta guardada (nombre + paradas: quitar/reordenar)
  const [editRoute, setEditRoute] = useState<QCRouteDoc | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  // ⭐ Vista EN VIVO: modal con mapa (ruta + posiciones GPS en tiempo real)
  const [liveView, setLiveView] = useState<QCRouteDoc | null>(null);
  // Tick cada 30 s para refrescar qué posiciones "en vivo" siguen frescas
  const [, setTick] = useState(0);

  const liveMapElRef = useRef<HTMLDivElement | null>(null);
  const liveMapRef = useRef<any>(null);          // instancia Leaflet (lib sin tipos)
  const liveLayerRef = useRef<any>(null);        // capa redibujada en cada snapshot
  const fitDoneRef = useRef(false);              // encuadrar solo la primera vez
  const osrmCacheRef = useRef<{ id: string; geometry: unknown } | null>(null);
  const openedFromLinkRef = useRef(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'qc_routes'), snap => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() } as QCRouteDoc));
      arr.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setRoutes(arr);
      setLoading(false);
      // Si el detalle o la vista en vivo están abiertos, reflejarles los cambios
      setDetail(prev => prev ? (arr.find(r => r.id === prev.id) || prev) : prev);
      setLiveView(prev => prev ? (arr.find(r => r.id === prev.id) || prev) : prev);
    }, err => {
      console.error('Error cargando rutas:', err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // ⭐ Link compartido (?qcRoute=<id>): abre la vista EN VIVO de esa ruta al cargar
  useEffect(() => {
    if (loading || openedFromLinkRef.current) return;
    openedFromLinkRef.current = true;
    const id = new URLSearchParams(window.location.search).get('qcRoute');
    if (!id) return;
    const r = routes.find(x => x.id === id);
    if (r) setLiveView(r);
    else alert('La ruta del link ya no existe (pudo haber sido eliminada).');
  }, [loading, routes]);

  // ⭐ Mapa EN VIVO: dibuja la ruta (paradas numeradas + trazo OSRM) y las posiciones
  //    GPS; se redibuja con cada snapshot (llegadas y movimientos en tiempo real).
  //    La geometría OSRM se cachea por ruta para no pedirla en cada actualización,
  //    y el encuadre solo se hace al abrir (para no "brincar" el mapa al usuario).
  useEffect(() => {
    if (!liveView) {
      try { liveMapRef.current?.remove(); } catch { /* noop */ }
      liveMapRef.current = null;
      liveLayerRef.current = null;
      fitDoneRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const L = await ensureLeaflet();
        if (cancelled || !liveMapElRef.current) return;
        if (!liveMapRef.current) {
          liveMapRef.current = L.map(liveMapElRef.current, { zoomControl: true });
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(liveMapRef.current);
          setTimeout(() => { try { liveMapRef.current?.invalidateSize(); } catch { /* noop */ } }, 200);
        }
        const map = liveMapRef.current;
        if (liveLayerRef.current) { try { map.removeLayer(liveLayerRef.current); } catch { /* noop */ } }
        const layer = L.layerGroup().addTo(map);
        liveLayerRef.current = layer;

        const numIcon = (label: string, extra: string) => L.divIcon({
          className: 'qcrt-div-icon',
          html: `<div class="qcrt-marker${extra}">${label}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const pts: LatLng[] = [];
        if (liveView.origin) {
          L.marker([liveView.origin.lat, liveView.origin.lng], { icon: numIcon('★', ' origin'), title: 'Inicio' }).addTo(layer);
          pts.push(liveView.origin);
        }
        (liveView.stops || []).forEach((s, i) => {
          if (s.lat == null || s.lng == null) return;
          L.marker([s.lat, s.lng], { icon: numIcon(String(i + 1), s.arrived ? ' done' : ''), title: s.client })
            .bindPopup(`${i + 1}. ${escapeHtml(s.client)}<br>${escapeHtml(s.address || '')}`)
            .addTo(layer);
          pts.push({ lat: s.lat, lng: s.lng });
        });

        // Trazo de manejo (cacheado por ruta)
        let geometry: unknown = osrmCacheRef.current?.id === liveView.id ? osrmCacheRef.current.geometry : null;
        if (!geometry && pts.length >= 2) {
          const osrm = await fetchOSRMRoute(pts);
          if (cancelled) return;
          geometry = osrm?.geometry ?? null;
          osrmCacheRef.current = { id: liveView.id, geometry };
        }
        const geom = geometry as { coordinates?: [number, number][] } | null;
        if (geom?.coordinates) {
          L.polyline(geom.coordinates.map(c => [c[1], c[0]]), { color: '#4338ca', weight: 4, opacity: 0.8 }).addTo(layer);
        } else if (pts.length >= 2) {
          L.polyline(pts.map(p => [p.lat, p.lng]), { color: '#94a3b8', weight: 3, dashArray: '6 6' }).addTo(layer);
        }

        // Posiciones GPS en tiempo real
        liveUsers(liveView).forEach(u => {
          L.marker([u.lat, u.lng], { icon: liveDivIcon(L, u.name, false), zIndexOffset: 900 })
            .bindPopup(escapeHtml(u.name))
            .addTo(layer);
        });

        if (!fitDoneRef.current && pts.length > 0) {
          map.fitBounds(pts.map(p => [p.lat, p.lng]), { padding: [26, 26] });
          fitDoneRef.current = true;
        }
      } catch (e) { console.error('No se pudo dibujar el mapa en vivo:', e); }
    })();
    return () => { cancelled = true; };
    // liveUsers es estable a efectos prácticos (función del componente que lee Date.now()).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveView]);

  // ⭐ Punto 5: eliminar una ruta guardada
  const handleDeleteRoute = async (r: QCRouteDoc) => {
    if (!window.confirm(`¿Eliminar la ruta "${r.name || 'Sin nombre'}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteDoc(doc(db, 'qc_routes', r.id));
      setDetail(prev => (prev?.id === r.id ? null : prev));
      setLiveView(prev => (prev?.id === r.id ? null : prev));
    } catch (e) {
      console.error('Error eliminando la ruta:', e);
      alert('No se pudo eliminar la ruta.');
    }
  };

  // ⭐ Punto 5: guardar la edición (nombre y paradas reordenadas/quitadas)
  const handleSaveEditRoute = async () => {
    if (!editRoute) return;
    if ((editRoute.stops || []).length === 0) {
      alert('La ruta debe tener al menos una parada.');
      return;
    }
    setIsSavingEdit(true);
    try {
      await updateDoc(doc(db, 'qc_routes', editRoute.id), {
        name: editRoute.name || 'Ruta QC',
        stops: editRoute.stops,
      });
      setEditRoute(null);
    } catch (e) {
      console.error('Error guardando la ruta:', e);
      alert('No se pudo guardar la ruta.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const moveEditStop = (index: number, dir: -1 | 1) => {
    setEditRoute(prev => {
      if (!prev) return prev;
      const stops = [...(prev.stops || [])];
      const j = index + dir;
      if (j < 0 || j >= stops.length) return prev;
      [stops[index], stops[j]] = [stops[j], stops[index]];
      return { ...prev, stops };
    });
  };

  const removeEditStop = (index: number) => {
    setEditRoute(prev => {
      if (!prev) return prev;
      const stops = [...(prev.stops || [])];
      stops.splice(index, 1);
      return { ...prev, stops };
    });
  };

  // ---------- derivados por ruta ----------
  const liveUsers = (r: QCRouteDoc): LiveUserPosition[] => {
    const now = Date.now();
    return Object.values(r.live || {}).filter(v =>
      v && typeof v.lat === 'number' && now - new Date(v.updatedAt || 0).getTime() < LIVE_STALE_MS
    );
  };

  const routeState = (r: QCRouteDoc): RouteState => {
    const stops = r.stops || [];
    const arrived = stops.filter(s => s.arrived).length;
    if (stops.length > 0 && arrived === stops.length) return 'done';
    if (liveUsers(r).length > 0 || arrived > 0) return 'live';
    return 'pending';
  };

  const stateBadge = (state: RouteState) => {
    if (state === 'done') return <span className="qcrt-badge done"><CheckCircle2 size={12} /> Completada</span>;
    if (state === 'live') return <span className="qcrt-badge live"><Radio size={12} /> En curso</span>;
    return <span className="qcrt-badge pending">Pendiente</span>;
  };

  // Inicio / fin / duración del recorrido según las horas de llegada registradas
  const routeTimes = (r: QCRouteDoc): { start: string | null; end: string | null; durationMs: number | null } => {
    const times = (r.stops || [])
      .map(s => s.arrivedAt)
      .filter((t): t is string => Boolean(t))
      .map(t => new Date(t).getTime())
      .filter(t => !isNaN(t))
      .sort((a, b) => a - b);
    if (times.length === 0) return { start: null, end: null, durationMs: null };
    return {
      start: new Date(times[0]).toISOString(),
      end: new Date(times[times.length - 1]).toISOString(),
      durationMs: times.length > 1 ? times[times.length - 1] - times[0] : null,
    };
  };

  const q = search.trim().toLowerCase();
  const filtered = routes.filter(r =>
    !q || [r.name, r.createdBy].filter(Boolean).join(' ').toLowerCase().includes(q)
  );

  return (
    <div className="fade-in qcrt-page">
      <header className="main-header qcrt-header">
        <div>
          <h1 className="qcrt-title"><Route size={24} color="#4338ca" /> Rutas de inspección</h1>
          <p className="qcrt-subtitle">Rutas guardadas, en curso en este momento y el recorrido que tomó cada una</p>
        </div>
      </header>

      <button className="hamburger-btn qcrt-hamburger-btn" onClick={onOpenMenu} aria-label="Open menu">
        <Menu size={24} />
      </button>

      {/* Buscador */}
      <div className="qcrt-toolbar">
        <div className="qcrt-search">
          <Search size={17} color="#9ca3af" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o creador..." />
          {search && <button onClick={() => setSearch('')} className="qcrt-clear-btn" aria-label="Limpiar búsqueda"><X size={15} /></button>}
        </div>
      </div>

      {loading ? (
        <div className="qcrt-loading"><Loader2 size={20} className="qcrt-spin" /> Cargando rutas...</div>
      ) : filtered.length === 0 ? (
        <div className="qcrt-empty">
          No hay rutas guardadas todavía. Crea una desde las tarjetas de casas pendientes ("Agregar a ruta") o en la vista QC Route.
        </div>
      ) : (
        <div className="qcrt-table-wrap">
          <table className="qcrt-table">
            <thead>
              <tr>
                <th className="qcrt-th">Ruta</th>
                <th className="qcrt-th">Direcciones</th>
                <th className="qcrt-th">Estado</th>
                <th className="qcrt-th">Avance</th>
                <th className="qcrt-th">En vivo</th>
                <th className="qcrt-th">Creada por</th>
                <th className="qcrt-th">Fecha</th>
                <th className="qcrt-th right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const stops = r.stops || [];
                const arrived = stops.filter(s => s.arrived).length;
                const live = liveUsers(r);
                const pct = stops.length > 0 ? Math.round(arrived / stops.length * 100) : 0;
                return (
                  <tr key={r.id} className="qcrt-tr">
                    <td className="qcrt-td">
                      <div className="qcrt-route-name">{r.name || 'Sin nombre'}</div>
                      <div className="qcrt-route-sub">{stops.length} parada(s)</div>
                    </td>
                    {/* ⭐ Direcciones guardadas de la ruta (primeras 3 + contador) */}
                    <td className="qcrt-td">
                      <ul className="qcrt-addr-list">
                        {stops.slice(0, 3).map((s, i) => (
                          <li key={s.houseId + i} className="qcrt-addr-item">
                            <span className="qcrt-addr-num">{i + 1}</span>
                            <span className="qcrt-ellipsis">{s.address || s.client || '—'}</span>
                          </li>
                        ))}
                        {stops.length > 3 && <li className="qcrt-addr-more">+{stops.length - 3} más…</li>}
                        {stops.length === 0 && <li className="qcrt-muted">—</li>}
                      </ul>
                    </td>
                    <td className="qcrt-td">{stateBadge(routeState(r))}</td>
                    <td className="qcrt-td">
                      <div className="qcrt-progress-text">{arrived}/{stops.length}</div>
                      <div className="qcrt-progress-track">
                        <div className="qcrt-progress-fill" style={{ '--qcrt-pct': `${pct}%` } as CSSProperties} />
                      </div>
                    </td>
                    <td className="qcrt-td">
                      {live.length > 0 ? (
                        <span className="qcrt-live-users" title={live.map(u => u.name).join(', ')}>
                          <Radio size={13} /> {live.length} usuario(s)
                        </span>
                      ) : (
                        <span className="qcrt-muted">—</span>
                      )}
                    </td>
                    <td className="qcrt-td">{r.createdBy || '—'}</td>
                    <td className="qcrt-td">{fmtDate(r.createdAt)}</td>
                    <td className="qcrt-td right">
                      <div className="qcrt-actions">
                        <button className="qcrt-action-btn" onClick={() => setLiveView(r)} title="Ver la ruta y las posiciones GPS en tiempo real">
                          <Radio size={16} /> En vivo
                        </button>
                        <button className="qcrt-action-btn" onClick={() => setDetail(r)} title="Ver detalle del recorrido">
                          <Eye size={16} /> Ver
                        </button>
                        <button className="qcrt-action-btn" onClick={() => shareRouteLink(r.id, r.name || 'Ruta QC')} title="Compartir link para seguir esta ruta">
                          <Share2 size={16} /> Compartir
                        </button>
                        {/* ⭐ Punto 5: editar y eliminar la ruta guardada */}
                        <button className="qcrt-action-btn" onClick={() => setEditRoute({ ...r, stops: [...(r.stops || [])] })} title="Editar nombre y paradas">
                          <Edit2 size={16} /> Editar
                        </button>
                        <button className="qcrt-action-btn danger" onClick={() => handleDeleteRoute(r)} title="Eliminar esta ruta">
                          <Trash2 size={16} /> Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════ MODAL: EDITAR RUTA (nombre + paradas) ═══════════ */}
      {editRoute && (
        <div className="qcrt-overlay" onClick={() => setEditRoute(null)}>
          <div className="qcrt-modal qcrt-edit-modal" onClick={e => e.stopPropagation()}>
            <div className="qcrt-modal-header">
              <h3 className="qcrt-modal-title"><Edit2 size={17} /> Editar ruta</h3>
              <button onClick={() => setEditRoute(null)} className="qcrt-modal-close" aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="qcrt-modal-body">
              <label className="qcrt-edit-label" htmlFor="qcrt-edit-name">Nombre de la ruta</label>
              <input
                id="qcrt-edit-name"
                className="qcrt-edit-input"
                value={editRoute.name || ''}
                onChange={e => setEditRoute({ ...editRoute, name: e.target.value })}
                placeholder="Nombre de la ruta..."
              />
              <span className="qcrt-edit-label">Paradas ({(editRoute.stops || []).length})</span>
              <ul className="qcrt-edit-stops">
                {(editRoute.stops || []).map((s, i) => (
                  <li key={`${s.houseId}_${i}`} className="qcrt-edit-stop">
                    <span className="qcrt-addr-num">{i + 1}</span>
                    <div className="qcrt-edit-stop-info">
                      <div className="qcrt-edit-stop-client">{s.client || '—'}</div>
                      <div className="qcrt-edit-stop-addr">{s.address || '—'}</div>
                    </div>
                    <div className="qcrt-edit-stop-actions">
                      <button className="qcrt-mini-btn" onClick={() => moveEditStop(i, -1)} disabled={i === 0} aria-label="Subir"><ArrowUp size={14} /></button>
                      <button className="qcrt-mini-btn" onClick={() => moveEditStop(i, 1)} disabled={i === (editRoute.stops || []).length - 1} aria-label="Bajar"><ArrowDown size={14} /></button>
                      <button className="qcrt-mini-btn danger" onClick={() => removeEditStop(i)} aria-label="Quitar parada"><Trash2 size={14} /></button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="qcrt-modal-footer">
              <button className="qcrt-action-btn" onClick={() => setEditRoute(null)}>Cancelar</button>
              <button className="qcrt-action-btn solid" onClick={handleSaveEditRoute} disabled={isSavingEdit}>
                {isSavingEdit ? <Loader2 size={16} className="qcrt-spin" /> : <Save size={16} />} Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ MODAL: RUTA EN VIVO (mapa en tiempo real) ═══════════ */}
      {liveView && (() => {
        const stops = liveView.stops || [];
        const arrived = stops.filter(s => s.arrived).length;
        const live = liveUsers(liveView);
        return (
          <div className="qcrt-overlay" onClick={() => setLiveView(null)}>
            <div className="qcrt-modal qcrt-live-modal" onClick={e => e.stopPropagation()}>
              <div className="qcrt-modal-header">
                <h3 className="qcrt-modal-title"><Radio size={18} /> {liveView.name || 'Sin nombre'} — en vivo</h3>
                <button onClick={() => setLiveView(null)} className="qcrt-modal-close" aria-label="Cerrar"><X size={18} /></button>
              </div>
              <div className="qcrt-modal-body">
                {live.length > 0 ? (
                  <div className="qcrt-live-banner">
                    <Radio size={14} /> En ruta ahora: {live.map(u => u.name).join(', ')}
                  </div>
                ) : (
                  <div className="qcrt-live-banner idle">
                    Nadie está transmitiendo GPS en este momento. La ruta se actualizará aquí en cuanto alguien active "Seguir con GPS".
                  </div>
                )}
                <div className="qcrt-live-map" ref={liveMapElRef} />
                <p className="qcrt-live-progress">
                  <CheckCircle2 size={14} /> {arrived}/{stops.length} paradas visitadas
                  {liveView.createdBy ? ` · Creada por ${liveView.createdBy}` : ''}
                </p>
              </div>
              <div className="qcrt-modal-footer">
                <button className="qcrt-action-btn" onClick={() => shareRouteLink(liveView.id, liveView.name || 'Ruta QC')}>
                  <Share2 size={16} /> Compartir ruta
                </button>
                <button className="qcrt-action-btn solid" onClick={() => setLiveView(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══════════ MODAL: DETALLE DEL RECORRIDO ═══════════ */}
      {detail && (() => {
        const stops = detail.stops || [];
        const arrived = stops.filter(s => s.arrived).length;
        const live = liveUsers(detail);
        const times = routeTimes(detail);
        return (
          <div className="qcrt-overlay" onClick={() => setDetail(null)}>
            <div className="qcrt-modal" onClick={e => e.stopPropagation()}>
              <div className="qcrt-modal-header">
                <h3 className="qcrt-modal-title"><Route size={18} /> {detail.name || 'Sin nombre'}</h3>
                <button onClick={() => setDetail(null)} className="qcrt-modal-close" aria-label="Cerrar"><X size={18} /></button>
              </div>

              <div className="qcrt-modal-body">
                {/* Resumen del recorrido */}
                <dl className="qcrt-detail-dl">
                  <div className="qcrt-detail-pair"><dt>Estado</dt><dd>{stateBadge(routeState(detail))}</dd></div>
                  <div className="qcrt-detail-pair"><dt>Avance</dt><dd>{arrived}/{stops.length} paradas visitadas</dd></div>
                  <div className="qcrt-detail-pair"><dt>Creada por</dt><dd>{detail.createdBy || '—'} · {fmtDate(detail.createdAt)}</dd></div>
                  <div className="qcrt-detail-pair"><dt>Primera llegada</dt><dd>{fmtTime(times.start)}</dd></div>
                  <div className="qcrt-detail-pair"><dt>Última llegada</dt><dd>{fmtTime(times.end)}</dd></div>
                  <div className="qcrt-detail-pair"><dt>Duración del recorrido</dt><dd>{times.durationMs != null ? fmtDuration(times.durationMs) : '—'}</dd></div>
                </dl>

                {live.length > 0 && (
                  <div className="qcrt-live-banner">
                    <Radio size={14} /> En ruta ahora: {live.map(u => u.name).join(', ')}
                  </div>
                )}

                {/* Paradas en el orden de la ruta, con hora de llegada */}
                <ul className="qcrt-stops-list">
                  {stops.map((s, i) => (
                    <li key={s.houseId + i} className={`qcrt-stop${s.arrived ? ' arrived' : ''}`}>
                      <div className={`qcrt-stop-num${s.arrived ? ' done' : ''}`}>
                        {s.arrived ? <CheckCircle2 size={15} /> : i + 1}
                      </div>
                      <div className="qcrt-stop-body">
                        <div className="qcrt-stop-client">{s.client}</div>
                        <div className="qcrt-stop-address"><MapPin size={12} className="qcrt-shrink-0" /> <span className="qcrt-ellipsis">{s.address || '—'}</span></div>
                        <div className="qcrt-stop-meta">
                          {s.arrived && s.arrivedAt
                            ? <span className="qcrt-stop-arrival"><Clock size={12} /> Llegada: {fmtTime(s.arrivedAt)}</span>
                            : <span className="qcrt-muted">Sin visitar</span>}
                          {typeof s.legKm === 'number' && s.legKm > 0 && <span>{s.legKm} km desde la anterior</span>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                {detail.origin && (
                  <p className="qcrt-origin-note">
                    <LocateFixed size={13} /> Punto de inicio registrado: {detail.origin.lat.toFixed(5)}, {detail.origin.lng.toFixed(5)}
                    {detail.avgSpeed ? ` · velocidad promedio ${detail.avgSpeed} km/h` : ''}
                  </p>
                )}
              </div>

              <div className="qcrt-modal-footer">
                <button className="qcrt-action-btn" onClick={() => shareRouteLink(detail.id, detail.name || 'Ruta QC')}>
                  <Share2 size={16} /> Compartir link
                </button>
                <button className="qcrt-action-btn solid" onClick={() => setDetail(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}