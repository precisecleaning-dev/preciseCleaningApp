import { useState, useEffect } from 'react';
import {
  Route, MapPin, Navigation, Save, Trash2, Loader2, ArrowUp, ArrowDown, X, Plus,
  Clock, LocateFixed, RefreshCw, CheckCircle2, Circle, Building2, ExternalLink, Search
} from 'lucide-react';
import type { Property, SystemUser } from '../types/index';
import { settingsService } from '../services/settingsService';
import { db } from '../config/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import './QCRouteView.css';

interface QCRouteViewProps {
  onOpenMenu: () => void;
  properties: Property[];
  currentUser?: SystemUser | null;
}

interface LatLng { lat: number; lng: number; }

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
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const haversineKm = (a: LatLng, b: LatLng): number => {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180;
  const la2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

const geoKey = (addr: string) => 'pc_geo_' + addr.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 120);
const readGeo = (addr: string): LatLng | null => {
  try { const r = localStorage.getItem(geoKey(addr)); return r ? JSON.parse(r) : null; } catch { return null; }
};
const writeGeo = (addr: string, v: LatLng) => {
  try { localStorage.setItem(geoKey(addr), JSON.stringify(v)); } catch { /* sin storage */ }
};

// Geocodificación gratuita (OpenStreetMap / Nominatim). Sin API key.
const geocodeAddress = async (addr: string): Promise<LatLng | null> => {
  if (!addr.trim()) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (e) {
    console.error('Error geocodificando dirección:', e);
  }
  return null;
};

const preCoords = (h: any): LatLng | null => {
  const lat = h?.lat ?? h?.latitude ?? h?.coords?.lat ?? h?.location?.lat;
  const lng = h?.lng ?? h?.lon ?? h?.longitude ?? h?.coords?.lng ?? h?.location?.lng;
  if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  return null;
};

const getCurrentLocation = (): Promise<LatLng> => new Promise((resolve, reject) => {
  if (!('geolocation' in navigator)) { reject(new Error('Geolocalización no disponible')); return; }
  navigator.geolocation.getCurrentPosition(
    pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    err => reject(err),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
  );
});

const fmtMin = (m: number): string => {
  if (!m || m <= 0) return '0 min';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h ? `${h} h ${mm} min` : `${mm} min`;
};

export default function QCRouteView({ onOpenMenu, properties, currentUser }: QCRouteViewProps) {
  const [statuses, setStatuses] = useState<any[]>([]);
  const [qcList, setQcList] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
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

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [statusesData, qcSnap, customersSnap, teamsData, routesSnap] = await Promise.all([
          settingsService.getAll('settings_statuses').catch(() => []),
          getDocs(collection(db, 'quality_checks')).catch(() => ({ docs: [] as any[] })),
          getDocs(collection(db, 'customers')).catch(() => ({ docs: [] as any[] })),
          settingsService.getAll('settings_teams').catch(() => []),
          getDocs(collection(db, 'qc_routes')).catch(() => ({ docs: [] as any[] })),
        ]);
        setStatuses(statusesData as any[]);
        setQcList(((qcSnap as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })));
        setCustomers(((customersSnap as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })));
        setTeams(teamsData as any[]);
        const routes = ((routesSnap as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() } as SavedRoute));
        routes.sort((a: SavedRoute, b: SavedRoute) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setSavedRoutes(routes);
      } catch (e) {
        console.error('Error cargando datos de ruta:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ---------- resolución de nombres (igual que Quality Check) ----------
  const getClientName = (idOrName?: string | null): string => {
    if (!idOrName) return 'Unknown';
    const safe = String(idOrName).toLowerCase().trim();
    const f = customers.find((c: any) => String(c.id).toLowerCase().trim() === safe || String(c.name).toLowerCase().trim() === safe);
    return f ? f.name : String(idOrName);
  };
  const getTeamName = (h?: Property | null): string => {
    const tid = (h as any)?.teamId;
    if (!tid) return 'Unassigned';
    const f = teams.find((t: any) => String(t.id) === String(tid) || String(t.name) === String(tid));
    return f ? f.name : 'Unassigned';
  };

  // ---------- casas con QC pendiente (misma lógica que Quality Check) ----------
  const isQualityCheckStatus = (h: Property): boolean => {
    const sid = (h as any).statusId;
    const st = statuses.find((s: any) => String(s.id) === String(sid) || String(s.name) === String(sid));
    const name = String(st?.name || sid || '').toLowerCase().trim();
    return name === 'qc' || name.includes('quality check') || name.includes('quality-check');
  };
  const latestQCForHouse = (houseId: string): any => {
    const recs = qcList.filter(q => q.houseId === houseId);
    if (recs.length === 0) return undefined;
    return recs.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  };
  const housePassedQC = (houseId: string): boolean => {
    const r = latestQCForHouse(houseId);
    return !!r && r.status === 'Finished' && r.result !== 'failed';
  };
  const houseFailedQC = (houseId: string): boolean => {
    const r = latestQCForHouse(houseId);
    return !!r && r.result === 'failed';
  };

  const pendingHouses = properties.filter(h => isQualityCheckStatus(h) && !housePassedQC(h.id) && !houseFailedQC(h.id));
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
      await updateDoc(doc(db, 'qc_routes', currentRouteId), { stops: arr, avgSpeed, updatedAt: new Date().toISOString() } as any);
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
      try { orig = await getCurrentLocation(); }
      catch { alert('No se pudo obtener tu ubicación (activa el permiso de ubicación). La ruta se generará igual, pero sin tu punto de partida.'); }
      setOrigin(orig);

      const located: Stop[] = [];
      for (let i = 0; i < chosen.length; i++) {
        const h = chosen[i];
        setGeoStatus(`Ubicando direcciones ${i + 1}/${chosen.length}...`);
        let coords = preCoords(h) || readGeo(h.address || '');
        if (!coords) {
          const g = await geocodeAddress(h.address || '');
          if (g) { coords = g; writeGeo(h.address || '', g); }
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
      try { orig = await getCurrentLocation(); setOrigin(orig); } catch { /* mantiene origen previo */ }
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
      let coords = preCoords(h) || readGeo(h.address || '');
      if (!coords) { const g = await geocodeAddress(h.address || ''); if (g) { coords = g; writeGeo(h.address || '', g); } }
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
        await updateDoc(doc(db, 'qc_routes', currentRouteId), { ...payload, updatedAt: new Date().toISOString() } as any);
        setSavedRoutes(prev => prev.map(r => r.id === currentRouteId ? { id: currentRouteId, ...payload } : r));
        alert('Ruta actualizada.');
      } else {
        const ref = await addDoc(collection(db, 'qc_routes'), payload as any);
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
    setMode('select'); setStops([]); setCurrentRouteId(null); setSelectedIds([]); setRouteName('');
  };

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

  const totalKm = Math.round(stops.reduce((a, s) => a + (s.legKm || 0), 0) * 10) / 10;
  const totalMin = stops.reduce((a, s) => a + (s.etaMin || 0), 0);
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
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
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
                La ruta parte de tu ubicación actual (se pedirá permiso de GPS) y ordena las paradas de la más cercana a la más lejana. Tiempos y distancias son estimados en línea recta; usa "Abrir en Maps" para la navegación real.
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
              <div className="qcr-summary-value">{totalKm}<span className="qcr-summary-unit"> km</span></div>
              <div className="qcr-summary-label">Distancia</div>
            </div>
            <div className="qcr-summary-box">
              <div className="qcr-summary-value time">{fmtMin(totalMin)}</div>
              <div className="qcr-summary-label">Tiempo est.</div>
            </div>
          </div>

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