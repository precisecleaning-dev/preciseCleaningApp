import { useState, useEffect } from 'react';
import {
  Route, MapPin, Navigation, Save, Trash2, Loader2, ArrowUp, ArrowDown, X, Plus,
  Clock, LocateFixed, RefreshCw, CheckCircle2, Circle, Building2, ExternalLink, Search
} from 'lucide-react';
import type { Property, SystemUser } from '../types/index';
import { settingsService } from '../services/settingsService';
import { db } from '../config/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

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
    <div className="fade-in route-view" style={{ padding: '20px', boxSizing: 'border-box' }}>
      <style>{`
        .route-spin { animation: route-spin 1s linear infinite; }
        @keyframes route-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .route-view { overflow-x: hidden; max-width: 100%; }
        .route-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 12px; }
        .route-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 12px 14px; margin-bottom: 18px; box-shadow: 0 1px 3px rgba(15,23,42,0.05); }
        .route-search { display: flex; align-items: center; gap: 8px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 12px; padding: 0 14px; height: 44px; flex: 1; min-width: 220px; }
        .route-search input { flex: 1; border: none; outline: none; background: transparent; color: #111827; font-size: 0.92rem; min-width: 0; }
        .route-btn { display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 16px; border-radius: 12px; font-weight: 700; font-size: 0.88rem; cursor: pointer; border: 1px solid transparent; white-space: nowrap; }
        .route-btn.primary { background: #4338ca; color: #fff; }
        .route-btn.ghost { background: #eef2ff; color: #4338ca; border-color: #c7d2fe; }
        .route-btn.soft { background: #f1f5f9; color: #334155; border-color: #e2e8f0; }
        .route-btn:disabled { opacity: 0.6; cursor: wait; }
        .stop-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; display: flex; gap: 12px; align-items: stretch; }
        .stop-num { width: 34px; height: 34px; border-radius: 50%; background: #4338ca; color: #fff; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .stop-num.done { background: #16a34a; }
        @media (max-width: 820px) {
          .route-view { padding: 14px !important; }
          .route-toolbar { flex-direction: column; align-items: stretch; }
          .route-search { width: 100%; }
          .route-btn { width: 100%; justify-content: center; }
        }
      `}</style>

      <header className="main-header" style={{ marginBottom: '18px', paddingRight: '56px' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, color: '#111827', fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Route size={26} color="#4338ca" /> QC Route
          </h1>
          <p style={{ marginTop: '4px', color: '#6b7280' }}>Hoja de ruta para las casas con Quality Check pendiente</p>
        </div>
      </header>

      <button className="hamburger-btn" onClick={onOpenMenu} aria-label="Open menu" style={{ position: 'fixed', top: '16px', right: '16px', zIndex: 60, background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(15,23,42,0.12)' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      </button>

      {building && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#eef2ff', border: '1px solid #c7d2fe', color: '#4338ca', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px', fontWeight: 600 }}>
          <Loader2 size={18} className="route-spin" /> {geoStatus || 'Procesando...'}
        </div>
      )}

      {/* Barra: rutas guardadas / nueva */}
      <div className="route-toolbar">
        <button className="route-btn ghost" onClick={() => setShowSaved(s => !s)}>
          <Building2 size={16} /> Rutas guardadas ({savedRoutes.length})
        </button>
        {mode === 'route' && <button className="route-btn soft" onClick={newRoute}><Plus size={16} /> Nueva ruta</button>}
        <div style={{ flex: 1 }} />
        {mode === 'route' && (
          <a className="route-btn soft" href={mapsAllUrl()} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <Navigation size={16} /> Abrir toda la ruta en Maps
          </a>
        )}
      </div>

      {/* Panel de rutas guardadas */}
      {showSaved && (
        <div style={{ marginBottom: '18px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '14px' }}>
          {savedRoutes.length === 0 ? (
            <div style={{ color: '#94a3b8', fontStyle: 'italic', padding: '8px' }}>No hay rutas guardadas todavía.</div>
          ) : savedRoutes.map(r => {
            const done = (r.stops || []).filter(s => s.arrived).length;
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 8px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    {(r.stops || []).length} parada(s) · {done} visitada(s){r.createdAt ? ' · ' + new Date(r.createdAt).toLocaleDateString('es-MX') : ''}
                  </div>
                </div>
                <button className="route-btn ghost" style={{ height: '38px' }} onClick={() => openSaved(r)}>Abrir</button>
                <button onClick={() => deleteSaved(r.id)} title="Eliminar" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444', borderRadius: '10px', width: '38px', height: '38px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Trash2 size={16} /></button>
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
              {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={16} /></button>}
            </div>
            <button className="route-btn soft" onClick={selectAll}>Seleccionar todas</button>
            {selectedIds.length > 0 && <button className="route-btn soft" onClick={clearSel}>Limpiar ({selectedIds.length})</button>}
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}><Loader2 size={20} className="route-spin" /> Cargando casas pendientes...</div>
          ) : filteredPending.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#6b7280', fontStyle: 'italic', padding: '40px', background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
              No hay casas con Quality Check pendiente.
            </div>
          ) : (
            <>
              <div className="route-grid">
                {filteredPending.map(h => {
                  const sel = selectedIds.includes(h.id);
                  return (
                    <div key={h.id} onClick={() => toggleSelect(h.id)} style={{ cursor: 'pointer', background: sel ? '#eef2ff' : '#fff', border: `1px solid ${sel ? '#818cf8' : '#e5e7eb'}`, borderRadius: '14px', padding: '14px', display: 'flex', gap: '12px', alignItems: 'flex-start', boxShadow: sel ? '0 0 0 2px rgba(99,102,241,0.18)' : 'none' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '7px', border: `2px solid ${sel ? '#4f46e5' : '#cbd5e1'}`, background: sel ? '#4f46e5' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                        {sel && <CheckCircle2 size={16} color="#fff" />}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{getClientName(h.client)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#475569', marginTop: '4px' }}>
                          <MapPin size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.address || '—'}</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>{getTeamName(h)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: '18px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '16px', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Nombre de la ruta</label>
                  <input value={routeName} onChange={e => setRouteName(e.target.value)} placeholder={`Ruta ${new Date().toLocaleDateString('es-MX')}`} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px 14px', fontSize: '0.95rem', color: '#111827', backgroundColor: '#fff', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ width: '160px' }}>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Velocidad prom. (km/h)</label>
                  <input type="number" min={5} value={avgSpeed} onChange={e => setAvgSpeed(parseInt(e.target.value) || 40)} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px 14px', fontSize: '0.95rem', color: '#111827', backgroundColor: '#fff', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <button className="route-btn primary" onClick={generateRoute} disabled={building || selectedIds.length === 0}>
                  <LocateFixed size={16} /> Generar ruta ({selectedIds.length})
                </button>
              </div>
              <p style={{ marginTop: '10px', fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>{stops.length}</div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Paradas</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16a34a' }}>{arrivedCount}</div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Visitadas</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>{totalKm}<span style={{ fontSize: '0.8rem', color: '#94a3b8' }}> km</span></div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Distancia</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>{fmtMin(totalMin)}</div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Tiempo est.</div>
            </div>
          </div>

          {/* Controles */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '14px', marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Nombre de la ruta</label>
              <input value={routeName} onChange={e => setRouteName(e.target.value)} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '10px 12px', fontSize: '0.92rem', color: '#111827', backgroundColor: '#fff', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ width: '150px' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Vel. (km/h)</label>
              <input type="number" min={5} value={avgSpeed} onChange={e => changeSpeed(parseInt(e.target.value) || 40)} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '10px 12px', fontSize: '0.92rem', color: '#111827', backgroundColor: '#fff', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <button className="route-btn soft" onClick={recalcFromLocation} disabled={building}><RefreshCw size={16} /> Recalcular desde mi ubicación</button>
            <button className="route-btn primary" onClick={saveRoute} disabled={savingRoute}>
              {savingRoute ? <Loader2 size={16} className="route-spin" /> : <Save size={16} />} {currentRouteId ? 'Actualizar' : 'Guardar'} ruta
            </button>
          </div>

          {/* Agregar parada */}
          {housesNotInRoute.length > 0 && (
            <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}><Plus size={14} style={{ verticalAlign: 'middle' }} /> Agregar casa pendiente:</span>
              <select value={addPick} onChange={e => addStop(e.target.value)} style={{ flex: 1, minWidth: '200px', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '10px 12px', fontSize: '0.9rem', color: '#111827', backgroundColor: '#fff', outline: 'none' }}>
                <option value="">Selecciona una casa...</option>
                {housesNotInRoute.map(h => <option key={h.id} value={h.id}>{getClientName(h.client)} — {h.address}</option>)}
              </select>
            </div>
          )}

          {/* Lista de paradas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {stops.map((s, i) => (
              <div key={s.houseId + i} className="stop-card" style={{ background: s.arrived ? '#f0fdf4' : '#fff', borderColor: s.arrived ? '#bbf7d0' : '#e5e7eb' }}>
                <div className={`stop-num ${s.arrived ? 'done' : ''}`}>{s.arrived ? <CheckCircle2 size={18} /> : i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', textDecoration: s.arrived ? 'line-through' : 'none' }}>{s.client}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#475569', marginTop: '4px' }}>
                    <MapPin size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.address || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem', color: '#64748b', marginTop: '6px', flexWrap: 'wrap' }}>
                    {s.lat == null ? (
                      <span style={{ color: '#d97706', fontWeight: 600 }}>Sin ubicación (no se pudo geolocalizar)</span>
                    ) : (
                      <>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Clock size={13} /> {fmtMin(s.etaMin)} desde la anterior</span>
                        <span>{s.legKm} km</span>
                      </>
                    )}
                    {s.arrived && s.arrivedAt && <span style={{ color: '#16a34a', fontWeight: 600 }}>Llegada: {new Date(s.arrivedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                    <button onClick={() => toggleArrived(i)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '38px', padding: '0 14px', borderRadius: '10px', border: `1px solid ${s.arrived ? '#86efac' : '#16a34a'}`, background: s.arrived ? '#dcfce7' : '#16a34a', color: s.arrived ? '#166534' : '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                      {s.arrived ? <><Circle size={14} /> Marcar pendiente</> : <><CheckCircle2 size={14} /> Llegué</>}
                    </button>
                    <a href={mapsStopUrl(s)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '38px', padding: '0 14px', borderRadius: '10px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', textDecoration: 'none' }}>
                      <ExternalLink size={14} /> Navegar
                    </a>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0, justifyContent: 'center' }}>
                  <button onClick={() => moveStop(i, -1)} disabled={i === 0} title="Subir" style={{ width: '34px', height: '34px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', cursor: i === 0 ? 'not-allowed' : 'pointer', opacity: i === 0 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ArrowUp size={16} /></button>
                  <button onClick={() => moveStop(i, 1)} disabled={i === stops.length - 1} title="Bajar" style={{ width: '34px', height: '34px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', cursor: i === stops.length - 1 ? 'not-allowed' : 'pointer', opacity: i === stops.length - 1 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ArrowDown size={16} /></button>
                  <button onClick={() => removeStop(i)} title="Quitar" style={{ width: '34px', height: '34px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}