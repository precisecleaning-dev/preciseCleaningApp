import { useState, useEffect, useRef } from 'react';
import {
  Route, MapPin, Navigation, Save, Trash2, Loader2, ArrowUp, ArrowDown, X, Plus,
  Clock, LocateFixed, RefreshCw, CheckCircle2, Circle, Building2, ExternalLink, Search, Menu, Radio, Share2
} from 'lucide-react';
import type { Property, SystemUser, Status, Customer, Team } from '../types/index';
import { settingsService } from '../services/settingsService';
import { db } from '../config/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { getRelationName } from '../utils/relations';
import { isQualityCheckStatus, housePassedQC, houseFailedQC, type QCStatusLike } from '../utils/qcStatus';
import { type LatLng, haversineKm, getCurrentPosition, ensureLeaflet, fetchOSRMRoute } from '../utils/routing';
import { geocodeAddressForced } from '../utils/geocodeForce';
import { escapeHtml } from '../utils/escapeHtml';
import { useLiveRoute, liveDivIcon, shareRouteLink, type LiveUserPosition } from '../utils/liveRoute';
import './QCRouteView.css';

interface QCRouteViewProps {
  onOpenMenu: () => void;
  properties: Property[];
  currentUser?: SystemUser | null;
}

interface QCListRecord extends QCStatusLike {
  id?: string;
}

interface Stop {
  houseId: string;
  client: string;
  address: string;
  lat: number | null;
  lng: number | null;
  legKm: number;      // km desde la parada anterior (o desde el origen)
  etaMin: number;     // minutos estimados de ese tramo
  arrived: boolean;
  arrivedAt: string | null;
}

interface SavedRoute {
  id?: string;
  name: string;
  origin: LatLng | null;
  avgSpeed: number;
  stops: Stop[];
  createdBy?: string;
  createdAt?: string;
}

// ---------- utilidades de geo ----------
// haversineKm/geocodeAddress/getCurrentPosition/ensureLeaflet/fetchOSRMRoute viven en
// src/utils/routing.ts (compartidas con el motor que antes tenía, por separado, el drawer
// "Route" embebido en QualityCheckView.tsx — ver code-notes.md).
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const preCoords = (h: any): LatLng | null => {
  const lat = h?.lat ?? h?.latitude ?? h?.coords?.lat ?? h?.location?.lat;
  const lng = h?.lng ?? h?.lon ?? h?.longitude ?? h?.coords?.lng ?? h?.location?.lng;
  if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  return null;
};

const fmtMin = (m: number): string => {
  if (!m || m <= 0) return '0 min';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h ? `${h} h ${mm} min` : `${mm} min`;
};

export default function QCRouteView({ onOpenMenu, properties, currentUser }: QCRouteViewProps) {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [qcList, setQcList] = useState<QCListRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<'select' | 'route'>('select');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [avgSpeed, setAvgSpeed] = useState<number>(40);
  const [routeName, setRouteName] = useState('');
  const [currentRouteId, setCurrentRouteId] = useState<string | null>(null);

  const [building, setBuilding] = useState(false);
  const [geoStatus, setGeoStatus] = useState('');
  const [savingRoute, setSavingRoute] = useState(false);

  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [addPick, setAddPick] = useState('');

  // ⭐ Ruta real de manejo (OSRM) + mapa (Leaflet) — motor compartido en utils/routing.ts
  const [realDistanceKm, setRealDistanceKm] = useState<number | null>(null);
  const [realDurationMin, setRealDurationMin] = useState<number | null>(null);
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const mapLayerRef = useRef<any>(null);
  const liveLayerRef = useRef<any>(null);
  const openedFromLinkRef = useRef(false);

  // ⭐ Seguimiento GPS en vivo (compartido con QCRouteDrawer vía utils/liveRoute.ts):
  //    publica mi posición en qc_routes/{id}.live y muestra la de otros usuarios que
  //    tengan esta misma ruta guardada abierta.
  const { tracking, startTracking, stopTracking, myPos, others } = useLiveRoute(mode === 'route' ? currentRouteId : null, currentUser);
  const othersCount = Object.keys(others).length;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [statusesData, qcSnap, customersSnap, teamsData, routesSnap] = await Promise.all([
          settingsService.getAll('settings_statuses').catch(() => []),
          getDocs(collection(db, 'quality_checks')).catch(() => null),
          getDocs(collection(db, 'customers')).catch(() => null),
          settingsService.getAll('settings_teams').catch(() => []),
          getDocs(collection(db, 'qc_routes')).catch(() => null),
        ]);
        setStatuses(statusesData as Status[]);
        setQcList((qcSnap?.docs || []).map(d => ({ id: d.id, ...d.data() } as QCListRecord)));
        setCustomers((customersSnap?.docs || []).map(d => ({ id: d.id, ...d.data() } as Customer)));
        setTeams(teamsData as Team[]);
        const routes = (routesSnap?.docs || []).map(d => ({ id: d.id, ...d.data() } as SavedRoute));
        routes.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setSavedRoutes(routes);
      } catch (e) {
        console.error('Error cargando datos de ruta:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ⭐ Link compartido: si la URL trae ?qcRoute=<id> (generado con "Compartir" en el
  //    drawer de QualityCheckView o en la tabla de Rutas), abre esa ruta guardada
  //    automáticamente para que la persona pueda seguirla (y activar su GPS).
  useEffect(() => {
    if (loading || openedFromLinkRef.current) return;
    openedFromLinkRef.current = true;
    const id = new URLSearchParams(window.location.search).get('qcRoute');
    if (!id) return;
    const r = savedRoutes.find(x => x.id === id);
    if (r) openSaved(r);
    else alert('La ruta del link ya no existe (pudo haber sido eliminada).');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, savedRoutes]);

  // ---------- resolución de nombres ----------
  const getClientName = (idOrName?: string | null): string => getRelationName(customers, idOrName, String(idOrName || 'Unknown'));
  const getTeamName = (h?: Property | null): string => getRelationName(teams, h?.teamId, 'Unassigned');

  // ---------- casas con QC pendiente (lógica compartida con QualityCheckView, ver utils/qcStatus.ts) ----------
  const pendingHouses = properties.filter(h =>
    isQualityCheckStatus(h.statusId, statuses) && !housePassedQC(h.id, qcList) && !houseFailedQC(h.id, qcList)
  );
  const filteredPending = pendingHouses.filter(h => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [h.address, getClientName(h.client), getTeamName(h)].filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  const toggleSelect = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const selectAll = () => setSelectedIds(filteredPending.map(h => h.id));
  const clearSel = () => setSelectedIds([]);

  // ---------- construcción / cálculo de la ruta ----------
  const orderNearestFirst = (orig: LatLng | null, list: Stop[]): Stop[] => {
    const withCoords = list.filter(s => s.lat != null && s.lng != null);
    const without = list.filter(s => s.lat == null || s.lng == null);
    const remaining = [...withCoords];
    const out: Stop[] = [];
    let cur: LatLng | null = orig || (remaining[0] ? { lat: remaining[0].lat as number, lng: remaining[0].lng as number } : null);
    while (remaining.length) {
      let bi = 0, bd = Infinity;
      remaining.forEach((s, i) => {
        const d = cur ? haversineKm(cur, { lat: s.lat as number, lng: s.lng as number }) : 0;
        if (d < bd) { bd = d; bi = i; }
      });
      const nx = remaining.splice(bi, 1)[0];
      out.push(nx);
      cur = { lat: nx.lat as number, lng: nx.lng as number };
    }
    return [...out, ...without];
  };

  const recomputeLegs = (orig: LatLng | null, list: Stop[], speed: number): Stop[] => {
    let prev: LatLng | null = orig;
    return list.map(s => {
      let legKm = 0;
      if (prev && s.lat != null && s.lng != null) legKm = haversineKm(prev, { lat: s.lat, lng: s.lng });
      const etaMin = legKm > 0 && speed > 0 ? Math.round(legKm / speed * 60) : 0;
      if (s.lat != null && s.lng != null) prev = { lat: s.lat, lng: s.lng };
      return { ...s, legKm: Math.round(legKm * 10) / 10, etaMin };
    });
  };

  const persistIfSaved = async (arr: Stop[]) => {
    if (!currentRouteId) return;
    try {
      await updateDoc(doc(db, 'qc_routes', currentRouteId), { stops: arr, avgSpeed, updatedAt: new Date().toISOString() });
      setSavedRoutes(prev => prev.map(r => r.id === currentRouteId ? { ...r, stops: arr, avgSpeed } : r));
    } catch (e) { console.error('No se pudo actualizar la ruta guardada:', e); }
  };

  const generateRoute = async () => {
    const chosen = pendingHouses.filter(h => selectedIds.includes(h.id));
    if (chosen.length === 0) { alert('Selecciona al menos una casa.'); return; }
    setBuilding(true);
    try {
      setGeoStatus('Obteniendo tu ubicación actual...');
      let orig: LatLng | null = null;
      try { orig = await getCurrentPosition(); }
      catch { alert('No se pudo obtener tu ubicación (activa el permiso de ubicación). La ruta se generará igual, pero sin tu punto de partida.'); }
      setOrigin(orig);

      const located: Stop[] = [];
      for (let i = 0; i < chosen.length; i++) {
        const h = chosen[i];
        setGeoStatus(`Ubicando direcciones ${i + 1}/${chosen.length}...`);
        let coords = preCoords(h);
        if (!coords) {
          coords = await geocodeAddressForced(h.address || '');
          await sleep(1100); // respeta el límite de Nominatim (1/seg)
        }
        located.push({
          houseId: h.id, client: getClientName(h.client), address: h.address || '',
          lat: coords?.lat ?? null, lng: coords?.lng ?? null,
          legKm: 0, etaMin: 0, arrived: false, arrivedAt: null,
        });
      }

      const ordered = orderNearestFirst(orig, located);
      setStops(recomputeLegs(orig, ordered, avgSpeed));
      setCurrentRouteId(null);
      if (!routeName.trim()) setRouteName(`Ruta ${new Date().toLocaleDateString('es-MX')}`);
      setMode('route');
    } finally {
      setBuilding(false);
      setGeoStatus('');
    }
  };

  const recalcFromLocation = async () => {
    setBuilding(true);
    try {
      setGeoStatus('Obteniendo tu ubicación actual...');
      let orig: LatLng | null = origin;
      try { orig = await getCurrentPosition(); setOrigin(orig); } catch { /* mantiene origen previo */ }
      const ordered = orderNearestFirst(orig, stops);
      const recomputed = recomputeLegs(orig, ordered, avgSpeed);
      setStops(recomputed);
      persistIfSaved(recomputed);
    } finally {
      setBuilding(false);
      setGeoStatus('');
    }
  };

  const changeSpeed = (v: number) => {
    const speed = v > 0 ? v : 1;
    setAvgSpeed(speed);
    if (mode === 'route') {
      const r = recomputeLegs(origin, stops, speed);
      setStops(r);
      persistIfSaved(r);
    }
  };

  const moveStop = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stops.length) return;
    const arr = [...stops];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const r = recomputeLegs(origin, arr, avgSpeed);
    setStops(r); persistIfSaved(r);
  };

  const removeStop = (i: number) => {
    const arr = stops.filter((_, k) => k !== i);
    const r = recomputeLegs(origin, arr, avgSpeed);
    setStops(r); persistIfSaved(r);
  };

  const toggleArrived = (i: number) => {
    const arr = stops.map((s, k) => k === i ? { ...s, arrived: !s.arrived, arrivedAt: !s.arrived ? new Date().toISOString() : null } : s);
    setStops(arr); persistIfSaved(arr);
  };

  const addStop = async (houseId: string) => {
    const h = pendingHouses.find(x => x.id === houseId);
    setAddPick('');
    if (!h || stops.some(s => s.houseId === houseId)) return;
    setBuilding(true);
    try {
      setGeoStatus('Ubicando dirección...');
      const coords = preCoords(h) || await geocodeAddressForced(h.address || '');
      const ns: Stop = {
        houseId: h.id, client: getClientName(h.client), address: h.address || '',
        lat: coords?.lat ?? null, lng: coords?.lng ?? null,
        legKm: 0, etaMin: 0, arrived: false, arrivedAt: null,
      };
      const r = recomputeLegs(origin, [...stops, ns], avgSpeed);
      setStops(r); persistIfSaved(r);
    } finally {
      setBuilding(false); setGeoStatus('');
    }
  };

  const saveRoute = async () => {
    if (stops.length === 0) { alert('No hay paradas para guardar.'); return; }
    const payload: SavedRoute = {
      name: routeName.trim() || `Ruta ${new Date().toLocaleDateString('es-MX')}`,
      origin: origin || null,
      avgSpeed,
      stops,
      createdBy: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown',
      createdAt: new Date().toISOString(),
    };
    setSavingRoute(true);
    try {
      if (currentRouteId) {
        await updateDoc(doc(db, 'qc_routes', currentRouteId), { ...payload, updatedAt: new Date().toISOString() });
        setSavedRoutes(prev => prev.map(r => r.id === currentRouteId ? { id: currentRouteId, ...payload } : r));
        alert('Ruta actualizada.');
      } else {
        const ref = await addDoc(collection(db, 'qc_routes'), payload);
        setCurrentRouteId(ref.id);
        setSavedRoutes(prev => [{ id: ref.id, ...payload }, ...prev]);
        alert('Ruta guardada.');
      }
    } catch (e) {
      console.error('Error guardando la ruta:', e);
      alert('No se pudo guardar la ruta.');
    } finally {
      setSavingRoute(false);
    }
  };

  const openSaved = (r: SavedRoute) => {
    setCurrentRouteId(r.id || null);
    setRouteName(r.name || '');
    setOrigin(r.origin || null);
    setAvgSpeed(r.avgSpeed || 40);
    setStops((r.stops || []).map(s => ({ ...s, legKm: s.legKm ?? 0, etaMin: s.etaMin ?? 0, arrived: s.arrived ?? false, arrivedAt: s.arrivedAt ?? null })));
    setShowSaved(false);
    setMode('route');
  };

  const deleteSaved = async (id?: string) => {
    if (!id || !window.confirm('¿Eliminar esta ruta guardada?')) return;
    try {
      await deleteDoc(doc(db, 'qc_routes', id));
      setSavedRoutes(prev => prev.filter(r => r.id !== id));
      if (currentRouteId === id) { setCurrentRouteId(null); setStops([]); setMode('select'); }
    } catch (e) { console.error(e); alert('No se pudo eliminar la ruta.'); }
  };

  const newRoute = () => {
    stopTracking();
    setMode('select'); setStops([]); setCurrentRouteId(null); setSelectedIds([]); setRouteName('');
  };

  // ---------- mapa (Leaflet) + ruta real de manejo (OSRM) ----------
  const renderMap = async (orig: LatLng | null, orderedStops: Stop[], geometry: any) => {
    try {
      const L = await ensureLeaflet();
      if (!mapElRef.current) return;
      if (!mapInstanceRef.current) {
        mapInstanceRef.current = L.map(mapElRef.current, { zoomControl: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapInstanceRef.current);
      }
      const map = mapInstanceRef.current;
      if (mapLayerRef.current) { map.removeLayer(mapLayerRef.current); mapLayerRef.current = null; }
      const layerGroup = L.layerGroup().addTo(map);
      mapLayerRef.current = layerGroup;

      const points: LatLng[] = [];
      if (orig) {
        L.marker([orig.lat, orig.lng], { title: 'Mi ubicación' }).addTo(layerGroup);
        points.push(orig);
      }
      orderedStops.forEach((s, i) => {
        if (s.lat == null || s.lng == null) return;
        L.marker([s.lat, s.lng], { title: s.client }).bindPopup(`${i + 1}. ${s.client}`).addTo(layerGroup);
        points.push({ lat: s.lat, lng: s.lng });
      });

      const geom = geometry as { coordinates?: [number, number][] } | null;
      if (geom?.coordinates) {
        const latlngs = geom.coordinates.map((c) => [c[1], c[0]]);
        L.polyline(latlngs, { color: '#4338ca', weight: 4, opacity: 0.8 }).addTo(layerGroup);
      } else if (points.length >= 2) {
        L.polyline(points.map(p => [p.lat, p.lng]), { color: '#94a3b8', weight: 3, dashArray: '6 6' }).addTo(layerGroup);
      }

      if (points.length > 0) {
        map.fitBounds(points.map(p => [p.lat, p.lng]), { padding: [30, 30] });
      }
    } catch (e) { console.error('No se pudo dibujar el mapa:', e); }
  };

  // Recalcula la ruta REAL de manejo (OSRM) + redibuja el mapa cada vez que cambian las
  // paradas o el origen, mientras estamos en modo "ruta". Independiente de recomputeLegs
  // (que sigue usando Haversine para el ETA rápido por parada).
  useEffect(() => {
    if (mode !== 'route') return;
    const withCoords = stops.filter(s => s.lat != null && s.lng != null);
    if (withCoords.length === 0) {
      setRealDistanceKm(null); setRealDurationMin(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const points: LatLng[] = [
        ...(origin ? [origin] : []),
        ...withCoords.map(s => ({ lat: s.lat as number, lng: s.lng as number })),
      ];
      const osrm = points.length >= 2 ? await fetchOSRMRoute(points) : null;
      if (cancelled) return;
      if (osrm) {
        setRealDistanceKm(Math.round(osrm.distanceKm * 10) / 10);
        setRealDurationMin(Math.round(osrm.durationMin));
      } else {
        setRealDistanceKm(null); setRealDurationMin(null);
      }
      await renderMap(origin, withCoords, osrm?.geometry ?? null);
    })();
    return () => { cancelled = true; };
  }, [mode, stops, origin]);

  // ⭐ Capa de posiciones en vivo (mi GPS + otros usuarios), separada de la capa de la
  //    ruta para no redibujar todo el mapa ni mover el encuadre con cada actualización.
  useEffect(() => {
    const clear = () => {
      if (liveLayerRef.current && mapInstanceRef.current) {
        try { mapInstanceRef.current.removeLayer(liveLayerRef.current); } catch { /* noop */ }
      }
      liveLayerRef.current = null;
    };
    if (mode !== 'route' || (!myPos && Object.keys(others).length === 0)) { clear(); return; }
    let cancelled = false;
    (async () => {
      try {
        const L = await ensureLeaflet();
        if (cancelled || !mapInstanceRef.current) return;
        clear();
        const layer = L.layerGroup().addTo(mapInstanceRef.current);
        liveLayerRef.current = layer;
        if (myPos) {
          L.marker([myPos.lat, myPos.lng], { icon: liveDivIcon(L, 'Yo', true), zIndexOffset: 1000 }).addTo(layer);
        }
        Object.values(others).forEach((o: LiveUserPosition) => {
          L.marker([o.lat, o.lng], { icon: liveDivIcon(L, o.name, false), zIndexOffset: 900 })
            .bindPopup(escapeHtml(o.name))
            .addTo(layer);
        });
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [mode, myPos, others]);

  // Limpia la instancia del mapa al desmontar el componente
  useEffect(() => {
    return () => { try { mapInstanceRef.current?.remove(); mapInstanceRef.current = null; } catch { /* noop */ } };
  }, []);

  // ---------- enlaces a Google Maps ----------
  const mapsAllUrl = (): string => {
    if (stops.length === 0) return '#';
    const dest = encodeURIComponent(stops[stops.length - 1].address);
    const wps = stops.slice(0, -1).map(s => encodeURIComponent(s.address)).filter(Boolean).join('|');
    let url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${dest}`;
    if (origin) url += `&origin=${origin.lat},${origin.lng}`;
    if (wps) url += `&waypoints=${wps}`;
    return url;
  };
  const mapsStopUrl = (s: Stop): string =>
    `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(s.address)}`;

  const estimatedKm = Math.round(stops.reduce((a, s) => a + (s.legKm || 0), 0) * 10) / 10;
  const estimatedMin = stops.reduce((a, s) => a + (s.etaMin || 0), 0);
  // Distancia/tiempo reales de manejo (OSRM) cuando están disponibles; si no, estimado en línea recta.
  const displayKm = realDistanceKm ?? estimatedKm;
  const displayMin = realDurationMin ?? estimatedMin;
  const isRealRoute = realDistanceKm != null;
  const arrivedCount = stops.filter(s => s.arrived).length;
  const housesNotInRoute = pendingHouses.filter(h => !stops.some(s => s.houseId === h.id));

  return (
    <div className="fade-in route-view qcr-page">

      <header className="main-header qcr-header">
        <div className="qcr-header-title-wrap">
          <h1 className="qcr-title">
            <Route size={26} color="#4338ca" /> QC Route
          </h1>
          <p className="qcr-subtitle">Hoja de ruta para las casas con Quality Check pendiente</p>
        </div>
      </header>

      <button className="hamburger-btn qcr-hamburger-btn" onClick={onOpenMenu} aria-label="Open menu">
        <Menu size={24} />
      </button>

      {building && (
        <div className="qcr-building-banner">
          <Loader2 size={18} className="route-spin" /> {geoStatus || 'Procesando...'}
        </div>
      )}

      {/* Barra: rutas guardadas / nueva */}
      <div className="route-toolbar">
        <button className="route-btn ghost" onClick={() => setShowSaved(s => !s)}>
          <Building2 size={16} /> Rutas guardadas ({savedRoutes.length})
        </button>
        {mode === 'route' && <button className="route-btn soft" onClick={newRoute}><Plus size={16} /> Nueva ruta</button>}
        <div className="qcr-toolbar-spacer" />
        {mode === 'route' && currentRouteId && (
          <button className="route-btn ghost" onClick={() => shareRouteLink(currentRouteId, routeName.trim() || 'Ruta QC')} title="Compartir link para que otra persona siga esta ruta">
            <Share2 size={16} /> Compartir link
          </button>
        )}
        {mode === 'route' && (
          <a className="route-btn soft qcr-maps-link" href={mapsAllUrl()} target="_blank" rel="noopener noreferrer">
            <Navigation size={16} /> Abrir toda la ruta en Maps
          </a>
        )}
      </div>

      {/* Panel de rutas guardadas */}
      {showSaved && (
        <div className="qcr-saved-panel">
          {savedRoutes.length === 0 ? (
            <div className="qcr-saved-empty">No hay rutas guardadas todavía.</div>
          ) : savedRoutes.map(r => {
            const done = (r.stops || []).filter(s => s.arrived).length;
            return (
              <div key={r.id} className="qcr-saved-row">
                <div className="qcr-saved-info">
                  <div className="qcr-saved-name">{r.name}</div>
                  <div className="qcr-saved-meta">
                    {(r.stops || []).length} parada(s) · {done} visitada(s){r.createdAt ? ' · ' + new Date(r.createdAt).toLocaleDateString('es-MX') : ''}
                  </div>
                </div>
                <button className="route-btn ghost qcr-saved-open-btn" onClick={() => openSaved(r)}>Abrir</button>
                <button onClick={() => deleteSaved(r.id)} title="Eliminar" className="qcr-saved-delete-btn"><Trash2 size={16} /></button>
              </div>
            );
          })}
        </div>
      )}

      {/* ====== MODO SELECCIÓN ====== */}
      {mode === 'select' && (
        <>
          <div className="route-toolbar">
            <div className="route-search">
              <Search size={18} color="#9ca3af" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar dirección, cliente o equipo..." />
              {search && <button onClick={() => setSearch('')} className="qcr-clear-icon-btn"><X size={16} /></button>}
            </div>
            <button className="route-btn soft" onClick={selectAll}>Seleccionar todas</button>
            {selectedIds.length > 0 && <button className="route-btn soft" onClick={clearSel}>Limpiar ({selectedIds.length})</button>}
          </div>

          {loading ? (
            <div className="qcr-loading-row"><Loader2 size={20} className="route-spin" /> Cargando casas pendientes...</div>
          ) : filteredPending.length === 0 ? (
            <div className="qcr-empty-box">
              No hay casas con Quality Check pendiente.
            </div>
          ) : (
            <>
              <div className="route-grid">
                {filteredPending.map(h => {
                  const sel = selectedIds.includes(h.id);
                  return (
                    <div key={h.id} onClick={() => toggleSelect(h.id)} className={`qcr-select-card${sel ? ' selected' : ''}`}>
                      <div className={`qcr-select-checkbox${sel ? ' selected' : ''}`}>
                        {sel && <CheckCircle2 size={16} color="#fff" />}
                      </div>
                      <div className="qcr-select-body">
                        <div className="qcr-select-client">{getClientName(h.client)}</div>
                        <div className="qcr-select-address-row">
                          <MapPin size={14} color="#94a3b8" className="qcr-shrink-0" />
                          <span className="qcr-ellipsis">{h.address || '—'}</span>
                        </div>
                        <div className="qcr-select-team">{getTeamName(h)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="qcr-gen-panel">
                <div className="qcr-field-grow">
                  <label className="qcr-field-label">Nombre de la ruta</label>
                  <input value={routeName} onChange={e => setRouteName(e.target.value)} placeholder={`Ruta ${new Date().toLocaleDateString('es-MX')}`} className="qcr-input" />
                </div>
                <div className="qcr-field-speed">
                  <label className="qcr-field-label">Velocidad prom. (km/h)</label>
                  <input type="number" min={5} value={avgSpeed} onChange={e => setAvgSpeed(parseInt(e.target.value) || 40)} className="qcr-input" />
                </div>
                <button className="route-btn primary" onClick={generateRoute} disabled={building || selectedIds.length === 0}>
                  <LocateFixed size={16} /> Generar ruta ({selectedIds.length})
                </button>
              </div>
              <p className="qcr-gen-hint">
                La ruta parte de tu ubicación actual (se pedirá permiso de GPS) y ordena las paradas de la más cercana a la más lejana. Al generarla se calcula la ruta real de manejo (con mapa) cuando hay conexión; si no, se usa un estimado en línea recta. Usa "Abrir en Maps" para la navegación turn-by-turn.
              </p>
            </>
          )}
        </>
      )}

      {/* ====== MODO RUTA ====== */}
      {mode === 'route' && (
        <>
          {/* Resumen */}
          <div className="qcr-summary-grid">
            <div className="qcr-summary-box">
              <div className="qcr-summary-value">{stops.length}</div>
              <div className="qcr-summary-label">Paradas</div>
            </div>
            <div className="qcr-summary-box">
              <div className="qcr-summary-value arrived">{arrivedCount}</div>
              <div className="qcr-summary-label">Visitadas</div>
            </div>
            <div className="qcr-summary-box">
              <div className="qcr-summary-value">{displayKm}<span className="qcr-summary-unit"> km</span></div>
              <div className="qcr-summary-label">Distancia{isRealRoute ? ' real' : ' est.'}</div>
            </div>
            <div className="qcr-summary-box">
              <div className="qcr-summary-value time">{fmtMin(displayMin)}</div>
              <div className="qcr-summary-label">Tiempo{isRealRoute ? ' real' : ' est.'}</div>
            </div>
          </div>

          {/* Mapa con la ruta (real de manejo cuando hay conexión, o marcadores + línea recta) */}
          <div className="qcr-map" ref={mapElRef} />

          {/* Controles */}
          <div className="qcr-controls-panel">
            <div className="qcr-field-name">
              <label className="qcr-field-label">Nombre de la ruta</label>
              <input value={routeName} onChange={e => setRouteName(e.target.value)} className="qcr-input-sm" />
            </div>
            <div className="qcr-field-speed-sm">
              <label className="qcr-field-label">Vel. (km/h)</label>
              <input type="number" min={5} value={avgSpeed} onChange={e => changeSpeed(parseInt(e.target.value) || 40)} className="qcr-input-sm" />
            </div>
            <button className="route-btn soft" onClick={recalcFromLocation} disabled={building}><RefreshCw size={16} /> Recalcular desde mi ubicación</button>
            <button
              className={`route-btn ghost${tracking ? ' live' : ''}`}
              onClick={tracking ? stopTracking : startTracking}
              title={currentRouteId
                ? 'Comparte tu posición en esta ruta y ve la de otros usuarios en el mapa'
                : 'Guarda la ruta primero para que otros usuarios puedan ver tu posición'}
            >
              <Radio size={16} /> {tracking ? 'Detener GPS' : 'Seguir con GPS'}{othersCount > 0 ? ` · ${othersCount} en ruta` : ''}
            </button>
            <button className="route-btn primary" onClick={saveRoute} disabled={savingRoute}>
              {savingRoute ? <Loader2 size={16} className="route-spin" /> : <Save size={16} />} {currentRouteId ? 'Actualizar' : 'Guardar'} ruta
            </button>
          </div>

          {/* Agregar parada */}
          {housesNotInRoute.length > 0 && (
            <div className="qcr-add-stop-panel">
              <span className="qcr-add-stop-label"><Plus size={14} className="qcr-add-stop-icon" /> Agregar casa pendiente:</span>
              <select value={addPick} onChange={e => addStop(e.target.value)} className="qcr-add-stop-select">
                <option value="">Selecciona una casa...</option>
                {housesNotInRoute.map(h => <option key={h.id} value={h.id}>{getClientName(h.client)} — {h.address}</option>)}
              </select>
            </div>
          )}

          {/* Lista de paradas */}
          <div className="qcr-stops-list">
            {stops.map((s, i) => (
              <div key={s.houseId + i} className={`stop-card${s.arrived ? ' arrived' : ''}`}>
                <div className={`stop-num ${s.arrived ? 'done' : ''}`}>{s.arrived ? <CheckCircle2 size={18} /> : i + 1}</div>
                <div className="qcr-stop-body">
                  <div className={`qcr-stop-client${s.arrived ? ' arrived' : ''}`}>{s.client}</div>
                  <div className="qcr-stop-address-row">
                    <MapPin size={14} color="#94a3b8" className="qcr-shrink-0" />
                    <span className="qcr-ellipsis">{s.address || '—'}</span>
                  </div>
                  <div className="qcr-stop-meta-row">
                    {s.lat == null ? (
                      <span className="qcr-stop-no-location">Sin ubicación (no se pudo geolocalizar)</span>
                    ) : (
                      <>
                        <span className="qcr-stop-eta"><Clock size={13} /> {fmtMin(s.etaMin)} desde la anterior</span>
                        <span>{s.legKm} km</span>
                      </>
                    )}
                    {s.arrived && s.arrivedAt && <span className="qcr-stop-arrived-time">Llegada: {new Date(s.arrivedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>

                  <div className="qcr-stop-actions-row">
                    <button onClick={() => toggleArrived(i)} className={`qcr-arrive-btn${s.arrived ? ' arrived' : ''}`}>
                      {s.arrived ? <><Circle size={14} /> Marcar pendiente</> : <><CheckCircle2 size={14} /> Llegué</>}
                    </button>
                    <a href={mapsStopUrl(s)} target="_blank" rel="noopener noreferrer" className="qcr-navigate-link">
                      <ExternalLink size={14} /> Navegar
                    </a>
                  </div>
                </div>

                <div className="qcr-stop-order-col">
                  <button onClick={() => moveStop(i, -1)} disabled={i === 0} title="Subir" className="qcr-order-btn"><ArrowUp size={16} /></button>
                  <button onClick={() => moveStop(i, 1)} disabled={i === stops.length - 1} title="Bajar" className="qcr-order-btn"><ArrowDown size={16} /></button>
                  <button onClick={() => removeStop(i)} title="Quitar" className="qcr-remove-btn"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}