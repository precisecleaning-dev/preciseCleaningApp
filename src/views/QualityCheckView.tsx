import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ClipboardCheck, X, Camera, MapPin, CalendarDays, Activity, User, Users, Edit2, Trash2,
  Upload, Printer, Loader2, Image as ImageIcon, Search, Check, Mail, AlertTriangle, Repeat,
  Building2, Save, Clock, WifiOff, Route as RouteIcon, ArrowUp, ArrowDown, Plus, StickyNote,
  Navigation, Pencil, Undo2, Eraser, Circle as CircleShape, MoveUpRight, Timer
} from 'lucide-react';
import type { Property, SystemUser, Place, Task } from '../types/index';
import { settingsService } from '../services/settingsService';
import { storageService } from '../services/storageService';
import { propertiesService } from '../services/propertiesService';
import { compressImage } from '../utils/imageCompression';
import { statusHistoryService } from '../services/statusHistoryService';
import { db } from '../config/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

interface QCRecord {
  id?: string;
  houseId: string;
  date: string;
  address: string;
  client: string;
  team?: string;
  status: 'Finished' | 'Pending';
  result?: 'passed' | 'failed' | null;
  inspector?: string;
  // ⭐ Tiempos de la inspección
  checkInAt?: string | null;      // hora de entrada (ISO)
  checkOutAt?: string | null;     // hora de salida (ISO) — se sella al guardar / mandar a recall
  durationMinutes?: number | null; // minutos totales (salida - entrada)
  selectedPlaces?: string[];
  qcData?: any;
}

// ⭐ Elemento de la RUTA de inspección (una parada por casa, en orden)
interface RouteItem {
  houseId: string;
  client: string;
  address: string;
  team?: string;
  lat?: number;
  lng?: number;
}

// ⭐ Nombre de la base de datos local (IndexedDB) para la cola de fotos offline
const OFFLINE_DB = 'pc_qc_offline';
const OFFLINE_STORE = 'photos';

// ⭐ Helpers de IndexedDB (cola de fotos sin conexión). Autocontenidos: no dependen
//    de ningún servicio externo. Cada entrada guarda el blob comprimido + contexto.
function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(OFFLINE_DB, 1);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(OFFLINE_STORE)) {
          database.createObjectStore(OFFLINE_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}
async function offlinePut(entry: any): Promise<void> {
  const database = await openOfflineDB();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(OFFLINE_STORE, 'readwrite');
    tx.objectStore(OFFLINE_STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  database.close();
}
async function offlineGetAll(): Promise<any[]> {
  const database = await openOfflineDB();
  const out = await new Promise<any[]>((resolve, reject) => {
    const tx = database.transaction(OFFLINE_STORE, 'readonly');
    const req = tx.objectStore(OFFLINE_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  database.close();
  return out;
}
async function offlineDelete(id: string): Promise<void> {
  const database = await openOfflineDB();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(OFFLINE_STORE, 'readwrite');
    tx.objectStore(OFFLINE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  database.close();
}
async function offlineSetDocIdForHouse(houseId: string, qcDocId: string): Promise<void> {
  const all = await offlineGetAll();
  for (const e of all) {
    if (e.houseId === houseId && !e.qcDocId) {
      e.qcDocId = qcDocId;
      await offlinePut(e);
    }
  }
}

interface QualityCheckViewProps {
  onOpenMenu: () => void;
  properties: Property[]; 
  houseToInspect: Property | null;
  clearHouseToInspect: () => void;
  currentUser?: SystemUser | null;
  onOpenHouseDetail?: (house: Property) => void; // ⭐ abre el detalle en HousesView
}

// Genera un id único para previews locales (con fallback si crypto.randomUUID no existe)
const uid = () =>
  (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
    ? (crypto as any).randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// ─────────────────────────────────────────────────────────────
// ⭐ PLANIFICADOR DE RUTAS: helpers de mapa (Leaflet + OpenStreetMap),
//    geocodificación (Nominatim) y ruteo real de manejo (OSRM). Todo es
//    gratuito y sin API key; se carga bajo demanda desde CDN.
// ─────────────────────────────────────────────────────────────

// Minutos estimados de inspección por casa (para el tiempo total de la ruta)
const INSPECTION_MIN_PER_STOP = 20;

// Carga Leaflet (mapa) desde CDN una sola vez y devuelve window.L
let leafletPromise: Promise<any> | null = null;
function ensureLeaflet(): Promise<any> {
  if (typeof window !== 'undefined' && (window as any).L) return Promise.resolve((window as any).L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    try {
      const cssId = 'leaflet-css';
      if (!document.getElementById(cssId)) {
        const link = document.createElement('link');
        link.id = cssId;
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      const scriptId = 'leaflet-js';
      const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve((window as any).L));
        return;
      }
      const s = document.createElement('script');
      s.id = scriptId;
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.async = true;
      s.onload = () => resolve((window as any).L);
      s.onerror = () => reject(new Error('No se pudo cargar el mapa (Leaflet).'));
      document.body.appendChild(s);
    } catch (e) { reject(e); }
  });
  return leafletPromise;
}

// Distancia en km entre dos coordenadas (fórmula de Haversine)
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Geocodifica una dirección con Nominatim (OpenStreetMap). Cachea en localStorage.
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const clean = (address || '').trim();
  if (!clean) return null;
  const key = 'geo_v1__' + clean.toLowerCase();
  try {
    const cached = localStorage.getItem(key);
    if (cached) { const j = JSON.parse(cached); if (j && typeof j.lat === 'number') return j; }
  } catch {}
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(clean);
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    const arr = await res.json();
    if (Array.isArray(arr) && arr.length > 0) {
      const p = { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
      try { localStorage.setItem(key, JSON.stringify(p)); } catch {}
      return p;
    }
  } catch (e) { console.warn('Geocode falló:', clean, e); }
  return null;
}

// Pide a OSRM (servidor demo) la ruta de manejo por los puntos en orden.
// Devuelve distancia (km), duración (min) y geometría (GeoJSON LineString).
async function fetchOSRMRoute(points: { lat: number; lng: number }[]): Promise<{ distanceKm: number; durationMin: number; geometry: any } | null> {
  if (points.length < 2) return null;
  const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const r = data && data.routes && data.routes[0];
    if (!r) return null;
    return { distanceKm: r.distance / 1000, durationMin: r.duration / 60, geometry: r.geometry };
  } catch (e) { console.warn('OSRM falló:', e); return null; }
}

// Ordena por "vecino más cercano" empezando desde 'start' (heurística de ruta)
function nearestNeighborOrder(start: { lat: number; lng: number }, items: any[]): any[] {
  const remaining = items.slice();
  const ordered: any[] = [];
  let cur = start;
  while (remaining.length) {
    let bestIdx = 0, bestD = Infinity;
    remaining.forEach((it, i) => { const d = haversineKm(cur, it); if (d < bestD) { bestD = d; bestIdx = i; } });
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    cur = next;
  }
  return ordered;
}

// Obtiene la ubicación actual del dispositivo (GPS del navegador)
function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { reject(new Error('Geolocalización no disponible en este dispositivo.')); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}

// Formatea minutos a "Xh Ym"
function fmtMinutes(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h ${r}m` : `${r}m`;
}

// ─────────────────────────────────────────────────────────────
// ⭐ EDITOR DE FOTO (estilo WhatsApp): dibujar lápiz / círculo / flecha
//    sobre una foto ya tomada, elegir color, deshacer y guardar.
// ─────────────────────────────────────────────────────────────
function PhotoAnnotator({ imageUrl, saving, onCancel, onSave }: {
  imageUrl: string; saving: boolean; onCancel: () => void; onSave: (blob: Blob) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [tool, setTool] = useState<'pen' | 'circle' | 'arrow'>('pen');
  const [color, setColor] = useState('#ef4444');
  const [strokes, setStrokes] = useState<any[]>([]);

  const colors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#000000', '#ffffff'];
  const LINE = 6;

  const redraw = (all: any[]) => {
    const c = canvasRef.current, img = imgRef.current;
    if (!c || !img) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const drawOne = (st: any) => {
      ctx.strokeStyle = st.color; ctx.fillStyle = st.color; ctx.lineWidth = st.size || LINE;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (st.tool === 'pen') {
        ctx.beginPath();
        (st.points || []).forEach((p: any, i: number) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
        ctx.stroke();
      } else if (st.tool === 'circle') {
        const cx = (st.start.x + st.end.x) / 2, cy = (st.start.y + st.end.y) / 2;
        const rx = Math.abs(st.end.x - st.start.x) / 2, ry = Math.abs(st.end.y - st.start.y) / 2;
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (st.tool === 'arrow') {
        const { start, end } = st;
        ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
        const ang = Math.atan2(end.y - start.y, end.x - start.x); const head = 16 + (st.size || LINE);
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - head * Math.cos(ang - Math.PI / 6), end.y - head * Math.sin(ang - Math.PI / 6));
        ctx.lineTo(end.x - head * Math.cos(ang + Math.PI / 6), end.y - head * Math.sin(ang + Math.PI / 6));
        ctx.closePath(); ctx.fill();
      }
    };
    all.forEach(drawOne);
    if (drawingRef.current) drawOne(drawingRef.current);
  };

  const ptFromEvent = (e: any) => {
    const c = canvasRef.current!; const rect = c.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * (c.width / rect.width), y: (clientY - rect.top) * (c.height / rect.height) };
  };

  const startDraw = (e: any) => {
    if (!ready) return;
    e.preventDefault();
    const p = ptFromEvent(e);
    if (tool === 'pen') drawingRef.current = { tool, color, size: LINE, points: [p] };
    else drawingRef.current = { tool, color, size: LINE, start: p, end: p };
    redraw(strokes);
  };
  const moveDraw = (e: any) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const p = ptFromEvent(e);
    if (tool === 'pen') drawingRef.current.points.push(p);
    else drawingRef.current.end = p;
    redraw(strokes);
  };
  const endDraw = () => {
    if (!drawingRef.current) return;
    const st = drawingRef.current; drawingRef.current = null;
    setStrokes(prev => { const nx = [...prev, st]; redraw(nx); return nx; });
  };

  const undo = () => setStrokes(prev => { const nx = prev.slice(0, -1); redraw(nx); return nx; });
  const clearAll = () => { setStrokes([]); redraw([]); };
  const save = () => { const c = canvasRef.current; if (!c) return; c.toBlob(b => { if (b) onSave(b); }, 'image/jpeg', 0.9); };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let src = imageUrl;
        try {
          const r = await fetch(imageUrl, { mode: 'cors' });
          if (r.ok) { const b = await r.blob(); src = URL.createObjectURL(b); }
        } catch {}
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (cancelled) return;
          const maxDim = 1280;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          imgRef.current = img;
          const c = canvasRef.current;
          if (c) { c.width = w; c.height = h; }
          setReady(true);
          redraw([]);
        };
        img.onerror = () => setLoadError('No se pudo cargar la imagen para editar.');
        img.src = src;
      } catch { setLoadError('No se pudo cargar la imagen para editar.'); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  const toolBtn = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '10px',
    border: active ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.25)',
    background: active ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.08)', color: '#fff',
    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer'
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b0f19', zIndex: 1600, display: 'flex', flexDirection: 'column' }}>
      {/* Barra de herramientas */}
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', background: 'rgba(0,0,0,0.55)' }}>
        <button style={toolBtn(tool === 'pen')} onClick={() => setTool('pen')}><Pencil size={16} /> Lápiz</button>
        <button style={toolBtn(tool === 'circle')} onClick={() => setTool('circle')}><CircleShape size={16} /> Círculo</button>
        <button style={toolBtn(tool === 'arrow')} onClick={() => setTool('arrow')}><MoveUpRight size={16} /> Flecha</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '4px' }}>
          {colors.map(col => (
            <button key={col} onClick={() => setColor(col)} aria-label={col}
              style={{ width: '26px', height: '26px', borderRadius: '50%', background: col, cursor: 'pointer', border: color === col ? '3px solid #fff' : '2px solid rgba(255,255,255,0.35)' }} />
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button style={toolBtn(false)} onClick={undo}><Undo2 size={16} /> Deshacer</button>
          <button style={toolBtn(false)} onClick={clearAll}><Eraser size={16} /> Limpiar</button>
        </div>
      </div>

      {/* Lienzo */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '10px' }}>
        {loadError ? (
          <div style={{ color: '#fca5a5', textAlign: 'center', padding: '24px' }}>{loadError}</div>
        ) : !ready ? (
          <div style={{ color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '10px' }}><Loader2 size={20} className="spin-qc" /> Cargando imagen…</div>
        ) : (
          <canvas
            ref={canvasRef}
            style={{ maxWidth: '100%', maxHeight: '100%', touchAction: 'none', borderRadius: '10px', boxShadow: '0 6px 30px rgba(0,0,0,0.5)', cursor: 'crosshair' }}
            onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={endDraw} onMouseLeave={endDraw}
            onTouchStart={startDraw} onTouchMove={moveDraw} onTouchEnd={endDraw}
          />
        )}
      </div>

      {/* Acciones */}
      <div style={{ padding: '14px', display: 'flex', gap: '12px', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', paddingBottom: 'calc(14px + env(safe-area-inset-bottom, 0px))' }}>
        <button onClick={onCancel} disabled={saving} style={{ padding: '12px 22px', borderRadius: '30px', border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
        <button onClick={save} disabled={saving || !ready} style={{ padding: '12px 32px', borderRadius: '30px', border: 'none', background: '#22c55e', color: '#fff', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          {saving ? <Loader2 size={18} className="spin-qc" /> : <Check size={18} />} Guardar
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ⭐ DASHBOARD DE REPORTES (pestaña "Reportes"): KPIs y analítica
//    calculada a partir de los Quality Checks reales (qcList).
// ─────────────────────────────────────────────────────────────
function QCReportsDashboard({
  qcList, tasks, places,
}: {
  qcList: any[]; tasks: any[]; places: any[];
}) {
  const stats = useMemo(() => {
    const taskName = (id: string) => tasks.find((t: any) => String(t.id) === String(id))?.name || 'Tarea';
    const placeName = (id: string) => places.find((p: any) => String(p.id) === String(id))?.name || 'Área';

    const finished = qcList.filter(q => q.status === 'Finished');
    const recalls = qcList.filter(q => q.result === 'failed');
    const totalReports = qcList.length;
    const finishedCount = finished.length;
    const passedFirst = finished.filter(q => q.result !== 'failed').length;
    const recallCount = recalls.length;
    const recallRate = finishedCount ? (recallCount / finishedCount) * 100 : 0;

    const qcPass = (q: any) => {
      let yes = 0, no = 0;
      const data = q.qcData || {};
      Object.keys(data).forEach(pid => {
        const t = (data[pid] && data[pid].tasks) || {};
        Object.values(t).forEach((v: any) => { if (v === 'Yes') yes++; else if (v === 'No') no++; });
      });
      const total = yes + no;
      return { yes, no, rate: total ? (yes / total) * 100 : null };
    };

    const rates: number[] = [];
    finished.forEach(q => { const r = qcPass(q).rate; if (r != null) rates.push(r); });
    const qualityScore = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;

    const issuesByTask: Record<string, number> = {};
    const issuesByRoom: Record<string, number> = {};
    qcList.forEach(q => {
      const data = q.qcData || {};
      Object.keys(data).forEach(pid => {
        const t = (data[pid] && data[pid].tasks) || {};
        Object.keys(t).forEach(tid => {
          if (t[tid] === 'No') {
            const tn = taskName(tid);
            issuesByTask[tn] = (issuesByTask[tn] || 0) + 1;
            const pn = placeName(pid);
            issuesByRoom[pn] = (issuesByRoom[pn] || 0) + 1;
          }
        });
      });
    });
    const topIssues = Object.entries(issuesByTask).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const roomHeat = Object.entries(issuesByRoom).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const teamMap: Record<string, { homes: number; passSum: number; passN: number; recalls: number }> = {};
    finished.forEach(q => {
      const tn = q.team || '—';
      const m = teamMap[tn] = teamMap[tn] || { homes: 0, passSum: 0, passN: 0, recalls: 0 };
      m.homes++;
      const r = qcPass(q).rate; if (r != null) { m.passSum += r; m.passN++; }
      if (q.result === 'failed') m.recalls++;
    });
    const teamPerf = Object.entries(teamMap)
      .map(([team, m]) => ({ team, homes: m.homes, pass: m.passN ? m.passSum / m.passN : null, recalls: m.recalls }))
      .sort((a, b) => (b.pass ?? 0) - (a.pass ?? 0));

    const inspMap: Record<string, { n: number; passSum: number; passN: number; recalls: number }> = {};
    finished.forEach(q => {
      const name = q.inspector || 'Unknown';
      const m = inspMap[name] = inspMap[name] || { n: 0, passSum: 0, passN: 0, recalls: 0 };
      m.n++;
      const r = qcPass(q).rate; if (r != null) { m.passSum += r; m.passN++; }
      if (q.result === 'failed') m.recalls++;
    });
    const inspectors = Object.entries(inspMap)
      .map(([name, m]) => ({ name, n: m.n, pass: m.passN ? m.passSum / m.passN : null, recalls: m.recalls }))
      .sort((a, b) => (b.pass ?? 0) - (a.pass ?? 0)).slice(0, 8);

    const byMonth: Record<string, { finished: number; recalls: number }> = {};
    qcList.forEach(q => {
      const k = (q.date || '').slice(0, 7); // YYYY-MM
      if (!k) return;
      const m = byMonth[k] = byMonth[k] || { finished: 0, recalls: 0 };
      if (q.status === 'Finished') m.finished++;
      if (q.result === 'failed') m.recalls++;
    });
    const months = Object.keys(byMonth).sort().slice(-6).map(k => ({
      key: k, finished: byMonth[k].finished, recalls: byMonth[k].recalls,
      rate: byMonth[k].finished ? (byMonth[k].recalls / byMonth[k].finished) * 100 : 0,
    }));

    return { totalReports, finishedCount, passedFirst, recallCount, recallRate, qualityScore, topIssues, roomHeat, teamPerf, inspectors, months };
  }, [qcList, tasks, places]);

  const monthLabel = (k: string) => {
    const [y, m] = k.split('-');
    const names = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${names[Number(m) - 1] || m} ${String(y).slice(2)}`;
  };

  // Color del mapa de calor (rojo = más problemas, verde = menos)
  const heatColor = (val: number, max: number) => {
    if (max <= 0) return { bg: '#dcfce7', fg: '#166534' };
    const r = val / max;
    if (r >= 0.75) return { bg: '#fecaca', fg: '#991b1b' };
    if (r >= 0.5) return { bg: '#fed7aa', fg: '#9a3412' };
    if (r >= 0.25) return { bg: '#fef08a', fg: '#854d0e' };
    return { bg: '#dcfce7', fg: '#166534' };
  };

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '18px', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' };
  const cardTitle: React.CSSProperties = { margin: '0 0 14px 0', fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' };

  const maxIssue = stats.topIssues.length ? stats.topIssues[0][1] : 0;
  const maxRoom = stats.roomHeat.length ? stats.roomHeat[0][1] : 0;
  const maxMonth = Math.max(1, ...stats.months.map(m => m.recalls));

  const kpis = [
    { label: 'Quality Score', value: `${stats.qualityScore.toFixed(1)}%`, color: '#059669', bg: '#ecfdf5' },
    { label: 'Pasaron a la 1ª', value: String(stats.passedFirst), color: '#2563eb', bg: '#eff6ff' },
    { label: 'Recalls', value: String(stats.recallCount), color: '#dc2626', bg: '#fef2f2' },
    { label: 'Tasa de Recall', value: `${stats.recallRate.toFixed(1)}%`, color: '#b45309', bg: '#fffbeb' },
    { label: 'Inspecciones (Finished)', value: String(stats.finishedCount), color: '#4338ca', bg: '#eef2ff' },
    { label: 'Reportes totales', value: String(stats.totalReports), color: '#0f172a', bg: '#f1f5f9' },
  ];

  if (stats.totalReports === 0) {
    return (
      <div style={{ ...card, textAlign: 'center', color: '#6b7280', fontStyle: 'italic', padding: '40px' }}>
        Aún no hay Quality Checks registrados. Cuando completes inspecciones, aquí verás los indicadores y reportes.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: '14px' }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...card, padding: '16px 18px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
              <span style={{ fontSize: '1.9rem', fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</span>
              <span style={{ width: '34px', height: '34px', borderRadius: '10px', background: k.bg, marginLeft: 'auto', flexShrink: 0 }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: '18px', alignItems: 'start' }}>

        {/* Problemas más comunes */}
        <div style={card}>
          <h3 style={cardTitle}>Problemas más comunes (tareas reprobadas)</h3>
          {stats.topIssues.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic' }}>Sin tareas reprobadas todavía.</div>
          ) : stats.topIssues.map(([name, count]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <span style={{ width: '38%', fontSize: '0.82rem', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
              <div style={{ flex: 1, height: '10px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: `${maxIssue ? (count / maxIssue) * 100 : 0}%`, height: '100%', background: 'linear-gradient(90deg,#60a5fa,#2563eb)', borderRadius: '999px' }} />
              </div>
              <span style={{ width: '30px', textAlign: 'right', fontSize: '0.82rem', fontWeight: 800, color: '#0f172a' }}>{count}</span>
            </div>
          ))}
        </div>

        {/* Mapa de calor por área */}
        <div style={card}>
          <h3 style={cardTitle}>Mapa de calor por área (por recalls/problemas)</h3>
          {stats.roomHeat.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic' }}>Sin datos por área todavía.</div>
          ) : stats.roomHeat.map(([name, count]) => {
            const c = heatColor(count, maxRoom);
            return (
              <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '9px 12px', borderRadius: '9px', background: c.bg, marginBottom: '7px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: c.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 900, color: c.fg, flexShrink: 0 }}>{count}</span>
              </div>
            );
          })}
        </div>

        {/* Desempeño por equipo */}
        <div style={card}>
          <h3 style={cardTitle}>Desempeño por equipo</h3>
          {stats.teamPerf.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic' }}>Sin inspecciones finalizadas.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '360px' }}>
                <thead>
                  <tr>
                    {['Equipo', 'Casas', 'Pass %', 'Recalls'].map((h, i) => (
                      <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '6px 10px', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.teamPerf.map(t => (
                    <tr key={t.team} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '9px 10px', fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{t.team}</td>
                      <td style={{ padding: '9px 10px', fontSize: '0.85rem', color: '#475569', textAlign: 'right' }}>{t.homes}</td>
                      <td style={{ padding: '9px 10px', fontSize: '0.85rem', fontWeight: 700, textAlign: 'right', color: t.pass == null ? '#94a3b8' : t.pass >= 90 ? '#059669' : t.pass >= 75 ? '#b45309' : '#dc2626' }}>{t.pass == null ? '—' : `${t.pass.toFixed(0)}%`}</td>
                      <td style={{ padding: '9px 10px', fontSize: '0.85rem', textAlign: 'right', color: t.recalls > 0 ? '#dc2626' : '#94a3b8', fontWeight: t.recalls > 0 ? 700 : 400 }}>{t.recalls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Ranking de inspectores */}
        <div style={card}>
          <h3 style={cardTitle}>Ranking de inspectores</h3>
          {stats.inspectors.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic' }}>Sin inspecciones finalizadas.</div>
          ) : stats.inspectors.map((ins, idx) => (
            <div key={ins.name} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: idx === 0 ? '#fde68a' : idx === 1 ? '#e2e8f0' : idx === 2 ? '#fed7aa' : '#f1f5f9', color: '#334155', fontSize: '0.72rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}</span>
              <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ins.name}</span>
              {ins.recalls > 0 && <span style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 700 }}>{ins.recalls} recall(s)</span>}
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: ins.pass == null ? '#94a3b8' : ins.pass >= 90 ? '#059669' : '#b45309', flexShrink: 0 }}>{ins.pass == null ? '—' : `${ins.pass.toFixed(1)}%`}</span>
            </div>
          ))}
        </div>

        {/* Tendencia de recalls por mes */}
        <div style={{ ...card, gridColumn: '1 / -1' }}>
          <h3 style={cardTitle}>Tendencia de recalls (últimos meses)</h3>
          {stats.months.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic' }}>Sin datos por mes todavía.</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '14px', height: '160px', padding: '10px 4px 0' }}>
              {stats.months.map(m => (
                <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#dc2626' }}>{m.recalls}</div>
                  <div title={`${m.recalls} recalls de ${m.finished} inspecciones · ${m.rate.toFixed(1)}%`}
                    style={{ width: '100%', maxWidth: '48px', height: `${(m.recalls / maxMonth) * 100}%`, minHeight: '4px', background: 'linear-gradient(180deg,#f87171,#dc2626)', borderRadius: '8px 8px 0 0' }} />
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>{monthLabel(m.key)}</div>
                  <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>{m.rate.toFixed(0)}%</div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default function QualityCheckView({ onOpenMenu, properties, houseToInspect, clearHouseToInspect, currentUser, onOpenHouseDetail }: QualityCheckViewProps) {
  const [qcList, setQcList] = useState<QCRecord[]>([]);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState<Property | null>(null);
  const [editingQcId, setEditingQcId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Finished' | 'Recall'>('All');
  const [tableSearch, setTableSearch] = useState('');
  // ⭐ Pestaña principal: Inspecciones (lista/pendientes) vs Reportes (dashboard)
  const [mainTab, setMainTab] = useState<'inspections' | 'reports'>('inspections');

  // ⭐ RUTA de inspección: lista ordenada de casas + estado del panel lateral
  const [routeItems, setRouteItems] = useState<RouteItem[]>([]);
  const [routeDrawerOpen, setRouteDrawerOpen] = useState(false);

  // ⭐ PLANIFICADOR de ruta: ubicación actual, plan calculado, mapa
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [routePlanning, setRoutePlanning] = useState(false);
  const [routePlanError, setRoutePlanError] = useState('');
  const [routePlan, setRoutePlan] = useState<null | { totalDistanceKm: number; totalDriveMin: number; totalStopMin: number; totalMin: number; ordered: RouteItem[] }>(null);
  const mapRef = useRef<any>(null);
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapLayerRef = useRef<any>(null);
  const routeGeometryRef = useRef<any>(null);

  // ⭐ EDITOR de foto (anotación estilo WhatsApp)
  const [annotate, setAnnotate] = useState<null | { placeId: string; index: number; url: string }>(null);
  const [savingAnnotation, setSavingAnnotation] = useState(false);

  const [places, setPlaces] = useState<Place[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [customersList, setCustomersList] = useState<any[]>([]);
  // ⭐ Catálogo de estados para detectar las casas en "Quality Check"
  const [statuses, setStatuses] = useState<any[]>([]);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // ⭐ Cambio de status de una casa DESDE esta vista (modal)
  const [statusModalHouse, setStatusModalHouse] = useState<Property | null>(null);
  const [statusModalSelected, setStatusModalSelected] = useState<string>('');
  const [savingStatus, setSavingStatus] = useState(false);

  // ⭐ Hora de ENTRADA a la inspección (se sella al abrir el formulario)
  const [checkInAt, setCheckInAt] = useState<string | null>(null);

  // ⭐ Cámara en modo RÁFAGA (se mantiene abierta para tomar varias fotos seguidas)
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraPlace, setCameraPlace] = useState<{ id: string; name: string } | null>(null);
  const [cameraShots, setCameraShots] = useState<{ id: string; preview: string }[]>([]);
  const [cameraError, setCameraError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ⭐ Fotos en cola OFFLINE (sin conexión): previews persistentes por área + contador
  const [queuedByPlace, setQueuedByPlace] = useState<Record<string, { id: string; preview: string }[]>>({});
  const [pendingUploadCount, setPendingUploadCount] = useState(0);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const processingRef = useRef(false);
  const selectedHouseRef = useRef<Property | null>(null);

  // ⭐ Exportar PDF
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [exportingForQcId, setExportingForQcId] = useState<string | null>(null);

  // ⭐ Previews locales mientras las fotos se suben en segundo plano (UX instantáneo)
  const [pendingPhotos, setPendingPhotos] = useState<Record<string, { id: string; preview: string }[]>>({});

  // ⭐ Buscador de áreas dentro del modal
  const [placeSearch, setPlaceSearch] = useState('');

  // ⭐ Áreas seleccionadas para inspeccionar en el modal
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);

  // ⭐ Envío por email
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('jesuslevinole@gmail.com');
  const [emailCtx, setEmailCtx] = useState<{ subject: string; body: string } | null>(null);
  const [emailExport, setEmailExport] = useState<null | (() => Promise<void> | void)>(null);

  // ⭐ Configuración de la empresa (logo, nombre, dirección y email destino).
  //    El email destino recibe automáticamente el reporte al guardar un QC.
  type CompanyConfig = { name: string; address: string; logo: string; email: string; autoSend: boolean };
  const [companySettings, setCompanySettings] = useState<CompanyConfig>({ name: '', address: '', logo: '', email: '', autoSend: true });
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [companyDraft, setCompanyDraft] = useState<CompanyConfig>({ name: '', address: '', logo: '', email: '', autoSend: true });
  const [savingCompany, setSavingCompany] = useState(false);
  const companyLogoInputRef = useRef<HTMLInputElement | null>(null);

  // ⭐ Refs dinámicas para inputs file y camera (uno por cada place)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const cameraInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [qcData, setQcData] = useState<Record<string, any>>({});

  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoadingCatalogs(true);
      try {
        const [placesData, tasksData, teamsData, statusesData, customersSnap, qcSnap, companySnap, routeSnap] = await Promise.all([
          settingsService.getAll('settings_places').catch(() => []),
          settingsService.getAll('settings_tasks').catch(() => []),
          settingsService.getAll('settings_teams').catch(() => []),
          settingsService.getAll('settings_statuses').catch(() => []),
          getDocs(collection(db, 'customers')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'quality_checks')).catch(() => ({ docs: [] })),
          getDoc(doc(db, 'settings_company', 'main')).catch(() => null),
          getDoc(doc(db, 'settings_qc_route', 'current')).catch(() => null)
        ]);

        // ⭐ Cargar configuración de empresa (si existe)
        const cData = (companySnap && (companySnap as any).exists && (companySnap as any).exists()) ? (companySnap as any).data() : null;
        if (cData) {
          setCompanySettings({
            name: cData.name || '',
            address: cData.address || '',
            logo: cData.logo || '',
            email: cData.email || '',
            autoSend: cData.autoSend !== false,
          });
        }

        // ⭐ Cargar la RUTA de inspección guardada (si existe)
        const rData = (routeSnap && (routeSnap as any).exists && (routeSnap as any).exists()) ? (routeSnap as any).data() : null;
        if (rData && Array.isArray(rData.items)) {
          setRouteItems(rData.items as RouteItem[]);
        }

        const sortedPlaces = (placesData as Place[]).sort((a, b) => a.name.localeCompare(b.name));
        const sortedTasks = (tasksData as Task[]).sort((a, b) => a.name.localeCompare(b.name));

        setPlaces(sortedPlaces);
        setTasks(sortedTasks);
        setTeams(teamsData as any[]);
        setStatuses(statusesData as any[]);
        setCustomersList(((customersSnap as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })));

        const docsArray = (qcSnap as any).docs || [];
        const loadedQCs: QCRecord[] = docsArray.map((document: any) => ({ 
          id: document.id, 
          ...document.data() 
        } as QCRecord));

        loadedQCs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setQcList(loadedQCs);
      } catch (error) {
        console.error("Error loading QC data:", error);
      } finally {
        setIsLoadingCatalogs(false);
      }
    };
    fetchAllData();
  }, []);

  useEffect(() => {
    if (houseToInspect && !isLoadingCatalogs) {
      handleOpenForm(houseToInspect);
      clearHouseToInspect();
    }
  }, [houseToInspect, isLoadingCatalogs]);

  // ⭐ Mantener una referencia viva de la casa abierta (para el procesador async de la cola)
  useEffect(() => { selectedHouseRef.current = selectedHouse; }, [selectedHouse]);

  // ⭐ Mapa houseId -> id del reporte QC ya guardado en esta sesión (para poder
  //    "parchar" las fotos que se suben después, cuando vuelve la conexión).
  const savedQcDocByHouse = useRef<Record<string, string>>({});

  // ⭐ Refresca el contador de fotos pendientes de subir (leyendo la cola).
  const refreshPendingCount = async () => {
    try { const all = await offlineGetAll(); setPendingUploadCount(all.length); }
    catch (e) { console.error('No se pudo leer la cola offline:', e); }
  };

  // ⭐ Reconstruye las previews de las fotos en cola (al montar / recargar).
  const rebuildQueuedPreviews = async () => {
    try {
      const all = await offlineGetAll();
      const map: Record<string, { id: string; preview: string }[]> = {};
      for (const e of all) {
        if (!e.blob) continue;
        (map[e.placeId] = map[e.placeId] || []).push({ id: e.id, preview: URL.createObjectURL(e.blob) });
      }
      setQueuedByPlace(map);
      setPendingUploadCount(all.length);
    } catch (e) { console.error('No se pudieron reconstruir las previews offline:', e); }
  };

  // ⭐ Añade una URL de foto ya subida al documento QC guardado (parchado post-subida).
  const attachUrlToQcDoc = async (qcDocId: string, placeId: string, url: string) => {
    const ref = doc(db, 'quality_checks', qcDocId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data: any = snap.data() || {};
    const qc = { ...(data.qcData || {}) };
    const place = { ...(qc[placeId] || {}) };
    const photos = Array.isArray(place.photos) ? place.photos.slice() : [];
    if (!photos.includes(url)) photos.push(url);
    place.photos = photos;
    qc[placeId] = place;
    await updateDoc(ref, { qcData: qc });
  };

  // ⭐ Guarda una foto en la cola offline (con su preview persistente).
  const queuePhoto = async (ctx: { id: string; houseId: string; placeId: string; placeName: string; address: string; blob: Blob }) => {
    const qcDocId = savedQcDocByHouse.current[ctx.houseId] || null;
    await offlinePut({ ...ctx, qcDocId, createdAt: Date.now() });
    const preview = URL.createObjectURL(ctx.blob);
    setQueuedByPlace(prev => ({ ...prev, [ctx.placeId]: [...(prev[ctx.placeId] || []), { id: ctx.id, preview }] }));
    await refreshPendingCount();
  };

  // ⭐ Procesa la cola: sube cada foto pendiente; al lograrlo la adjunta al reporte
  //    (en memoria si está abierto, y al documento guardado si ya existe).
  const processQueue = async () => {
    if (processingRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    processingRef.current = true;
    try {
      const all = await offlineGetAll();
      for (const entry of all) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) break;
        try {
          const file = new File([entry.blob], `qc_${entry.id}.jpg`, { type: (entry.blob && entry.blob.type) || 'image/jpeg' });
          const urls = await storageService.uploadQualityCheckPhotos([file], entry.address, entry.placeName);
          const url = urls && urls[0];
          if (!url) continue;
          if (entry.qcDocId) {
            try { await attachUrlToQcDoc(entry.qcDocId, entry.placeId, url); }
            catch (e) { console.error('No se pudo parchar el reporte con la foto:', e); }
          }
          if (selectedHouseRef.current && selectedHouseRef.current.id === entry.houseId) {
            setQcData(prev => ({ ...prev, [entry.placeId]: { ...(prev[entry.placeId] || {}), photos: [...((prev[entry.placeId] || {}).photos || []), url] } }));
          }
          await offlineDelete(entry.id);
          setQueuedByPlace(prev => ({ ...prev, [entry.placeId]: (prev[entry.placeId] || []).filter(p => p.id !== entry.id) }));
        } catch (e) {
          console.warn('Foto sigue pendiente (se reintentará):', entry.id, e);
        }
      }
    } finally {
      processingRef.current = false;
      await refreshPendingCount();
    }
  };

  // ⭐ Al montar: reconstruir cola + escuchar conexión + reintentar cada 20s.
  useEffect(() => {
    (async () => { await rebuildQueuedPreviews(); processQueue(); })();
    const onOnline = () => { setIsOnline(true); processQueue(); };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const interval = setInterval(() => { if (typeof navigator === 'undefined' || navigator.onLine) processQueue(); }, 20000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⭐ Resuelve el nombre del equipo asociado a una casa (teamId puede ser id o nombre)
  const getTeamNameForHouse = (house?: Property | null): string => {
    if (!house) return '—';
    const tid = (house as any).teamId;
    if (!tid) return 'Unassigned';
    const found = teams.find((t: any) => String(t.id) === String(tid) || String(t.name) === String(tid));
    return found ? found.name : 'Unassigned';
  };

  // ⭐ Resuelve el nombre del cliente desde la colección customers (id o nombre)
  const getClientName = (clientIdOrName?: string | null): string => {
    if (!clientIdOrName) return 'Unknown';
    const safe = String(clientIdOrName).toLowerCase().trim();
    const found = customersList.find((c: any) => String(c.id).toLowerCase().trim() === safe || String(c.name).toLowerCase().trim() === safe);
    return found ? found.name : String(clientIdOrName);
  };

  // ⭐ Determina si una casa tiene estado "Quality Check" (resuelve id o nombre del status)
  const isQualityCheckStatus = (house: Property): boolean => {
    const sid = (house as any).statusId;
    const st = statuses.find((s: any) => String(s.id) === String(sid) || String(s.name) === String(sid));
    const name = String(st?.name || sid || '').toLowerCase().trim();
    return name === 'qc' || name.includes('quality check') || name.includes('quality-check');
  };

  // ⭐ Id del estado "Quality Check" (para regresar una casa cuando NO pasó)
  const getQualityCheckStatusId = (): string | null => {
    const st = statuses.find((s: any) => {
      const n = String(s.name || '').toLowerCase().trim();
      return n === 'qc' || n.includes('quality check') || n.includes('quality-check');
    });
    return st ? st.id : null;
  };

  // ⭐ Pistas de texto para reconocer un estado de "Recall"
  const RECALL_HINTS = ['recall', 're-call', 're call', 'recleaning', 're-clean', 'callback', 'call back'];

  // ⭐ Id del estado "Recall" (cuando un QC NO pasa, la casa pasa a Recall)
  const getRecallStatusId = (): string | null => {
    const st = statuses.find((s: any) => {
      const n = String(s.name || '').toLowerCase().trim();
      return RECALL_HINTS.some(h => n.includes(h));
    });
    return st ? st.id : null;
  };

  // ⭐ Determina si una casa tiene estado "Recall" (resuelve id o nombre del status)
  const isRecallStatus = (house: Property): boolean => {
    const sid = (house as any).statusId;
    const st = statuses.find((s: any) => String(s.id) === String(sid) || String(s.name) === String(sid));
    const name = String(st?.name || sid || '').toLowerCase().trim();
    return RECALL_HINTS.some(h => name.includes(h));
  };

  // ⭐ Resuelve el nombre de un status a partir de id o nombre
  const resolveStatusName = (idOrName?: string | null): string => {
    if (!idOrName) return '';
    const safe = String(idOrName).toLowerCase().trim();
    const f = statuses.find((s: any) => String(s.id).toLowerCase().trim() === safe || String(s.name).toLowerCase().trim() === safe);
    return f ? f.name : String(idOrName);
  };

  // ⭐ Info del status actual de una casa (para el chip): nombre + color
  const houseStatusInfo = (house: Property) => {
    const sid = (house as any).statusId;
    const st = statuses.find((x: any) => String(x.id) === String(sid) || String(x.name) === String(sid));
    return { id: st?.id ?? sid ?? '', name: st?.name || (sid ? String(sid) : 'Sin estado'), color: st?.color || '#94a3b8' };
  };

  // ⭐ Abrir el modal de cambio de status para una casa
  const openHouseStatusModal = (house: Property) => {
    const info = houseStatusInfo(house);
    setStatusModalHouse(house);
    setStatusModalSelected(String(info.id || ''));
  };

  // ⭐ Aplicar el cambio de status: actualiza 'properties' en Firestore y registra
  //    la transición en el historial. Como 'properties' es tiempo real (listener
  //    global en App.tsx), las tarjetas de esta vista se reacomodan solas.
  const applyHouseStatusChange = async () => {
    if (!statusModalHouse || !statusModalSelected) return;
    const house = statusModalHouse;
    const prevStatusId = (house as any).statusId;
    if (String(statusModalSelected) === String(prevStatusId)) { setStatusModalHouse(null); return; }
    setSavingStatus(true);
    try {
      await updateDoc(doc(db, 'properties', house.id), { statusId: statusModalSelected });
      try {
        await statusHistoryService.log({
          propertyId: house.id,
          fromStatusId: prevStatusId || null,
          fromStatusName: resolveStatusName(prevStatusId) || null,
          toStatusId: statusModalSelected,
          toStatusName: resolveStatusName(statusModalSelected) || null,
          changedBy: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown',
          source: 'quality_check',
        } as any);
      } catch (e) { console.error('No se pudo registrar el historial de status:', e); }
      setStatusModalHouse(null);
    } catch (e) {
      console.error('Error cambiando status:', e);
      alert('No se pudo cambiar el status de la casa.');
    } finally {
      setSavingStatus(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // ⭐ RUTA DE INSPECCIÓN: agregar / quitar / reordenar paradas.
  //    Se guarda en Firestore (settings_qc_route/current) para que
  //    persista entre sesiones y dispositivos.
  // ─────────────────────────────────────────────────────────────
  const persistRoute = async (items: RouteItem[]) => {
    setRouteItems(items);
    try {
      await setDoc(doc(db, 'settings_qc_route', 'current'), { items, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (e) { console.error('No se pudo guardar la ruta:', e); }
  };
  const isInRoute = (houseId: string) => routeItems.some(r => r.houseId === houseId);
  const addToRoute = (house: Property) => {
    if (isInRoute(house.id)) return;
    const item: RouteItem = { houseId: house.id, client: getClientName(house.client), address: house.address || '', team: getTeamNameForHouse(house) };
    persistRoute([...routeItems, item]);
  };
  const removeFromRoute = (houseId: string) => persistRoute(routeItems.filter(r => r.houseId !== houseId));
  const moveRouteItem = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= routeItems.length) return;
    const copy = routeItems.slice();
    const [m] = copy.splice(index, 1);
    copy.splice(target, 0, m);
    persistRoute(copy);
  };
  const clearRoute = () => { if (window.confirm('¿Vaciar toda la ruta?')) { persistRoute([]); setRoutePlan(null); routeGeometryRef.current = null; } };

  // ─────────────────────────────────────────────────────────────
  // ⭐ PLANIFICADOR: toma la ubicación actual, ubica cada casa, ordena
  //    por cercanía, pide la ruta real de manejo (OSRM), calcula el
  //    tiempo estimado y la dibuja en el mapa.
  // ─────────────────────────────────────────────────────────────
  const renderRouteMap = async (loc: { lat: number; lng: number }, ordered: any[], geometry: any) => {
    try {
      const L = await ensureLeaflet();
      if (!mapElRef.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(mapElRef.current, { zoomControl: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapRef.current);
      }
      const map = mapRef.current;
      if (mapLayerRef.current) { try { map.removeLayer(mapLayerRef.current); } catch {} }
      const group = L.layerGroup().addTo(map);
      mapLayerRef.current = group;

      // Marcador de la ubicación actual
      L.circleMarker([loc.lat, loc.lng], { radius: 8, color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 1, weight: 3 }).bindPopup('Tu ubicación').addTo(group);

      // Marcadores numerados de las casas (en el orden de la ruta)
      const bounds: any[] = [[loc.lat, loc.lng]];
      ordered.forEach((o: any, i: number) => {
        const icon = L.divIcon({
          className: '',
          html: `<div style="background:#4338ca;color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)">${i + 1}</div>`,
          iconSize: [26, 26], iconAnchor: [13, 13],
        });
        L.marker([o.lat, o.lng], { icon }).bindPopup(`<b>${i + 1}. ${o.client || ''}</b><br/>${o.address || ''}`).addTo(group);
        bounds.push([o.lat, o.lng]);
      });

      // Línea de la ruta (real si hay OSRM; si no, línea recta punteada)
      if (geometry && geometry.coordinates) {
        const latlngs = geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
        L.polyline(latlngs, { color: '#4338ca', weight: 4, opacity: 0.85 }).addTo(group);
      } else {
        const latlngs = [[loc.lat, loc.lng], ...ordered.map((o: any) => [o.lat, o.lng])];
        L.polyline(latlngs, { color: '#4338ca', weight: 4, opacity: 0.6, dashArray: '6 8' }).addTo(group);
      }

      try { map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 }); } catch {}
      setTimeout(() => { try { map.invalidateSize(); } catch {} }, 200);
    } catch (e) { console.error('No se pudo dibujar el mapa:', e); }
  };

  const optimizeRoute = async () => {
    if (routeItems.length === 0) { setRoutePlanError('Agrega casas a la ruta primero.'); return; }
    setRoutePlanning(true);
    setRoutePlanError('');
    try {
      // 1) Ubicación actual (GPS)
      let loc = userLocation;
      if (!loc) { loc = await getCurrentPosition(); setUserLocation(loc); }

      // 2) Coordenadas de cada casa (usa guardadas o geocodifica la dirección)
      const withCoords: any[] = [];
      const missing: string[] = [];
      for (const it of routeItems) {
        let lat = it.lat, lng = it.lng;
        if (lat == null || lng == null) {
          const g = it.address ? await geocodeAddress(it.address) : null;
          if (g) { lat = g.lat; lng = g.lng; }
        }
        if (lat != null && lng != null) withCoords.push({ ...it, lat, lng });
        else missing.push(it.client || it.address || 'casa');
      }
      if (withCoords.length === 0) {
        setRoutePlanError('No se pudieron ubicar las direcciones en el mapa. Revisa que estén completas.');
        setRoutePlanning(false);
        return;
      }

      // 3) Orden por vecino más cercano desde tu ubicación
      const ordered = nearestNeighborOrder(loc, withCoords);

      // 4) Ruta real de manejo por [ubicación, ...casas]
      const waypoints = [loc, ...ordered.map((o: any) => ({ lat: o.lat, lng: o.lng }))];
      const osrm = await fetchOSRMRoute(waypoints);

      let totalDistanceKm = 0, totalDriveMin = 0;
      routeGeometryRef.current = null;
      if (osrm) {
        totalDistanceKm = osrm.distanceKm; totalDriveMin = osrm.durationMin; routeGeometryRef.current = osrm.geometry;
      } else {
        // Respaldo: estimar por línea recta (~40 km/h promedio urbano)
        let prev = loc;
        for (const o of ordered) { totalDistanceKm += haversineKm(prev, o); prev = o; }
        totalDriveMin = (totalDistanceKm / 40) * 60;
      }

      const totalStopMin = ordered.length * INSPECTION_MIN_PER_STOP;
      const totalMin = totalDriveMin + totalStopMin;

      // 5) Guardar el nuevo orden (con coordenadas) en la ruta
      const newItems: RouteItem[] = ordered.map((o: any) => ({ houseId: o.houseId, client: o.client, address: o.address, team: o.team, lat: o.lat, lng: o.lng }));
      persistRoute(newItems);

      setRoutePlan({ totalDistanceKm, totalDriveMin, totalStopMin, totalMin, ordered: newItems });
      setRoutePlanError(missing.length ? `No se ubicaron en el mapa: ${missing.join(', ')}.` : '');

      // 6) Dibujar en el mapa
      await renderRouteMap(loc, ordered, routeGeometryRef.current);
    } catch (e: any) {
      console.error('Error planificando ruta:', e);
      const denied = e && (e.code === 1 || String(e.message || '').toLowerCase().includes('denied'));
      setRoutePlanError(denied ? 'Permiso de ubicación denegado. Actívalo en el navegador para planificar la ruta.' : (e?.message || 'No se pudo planificar la ruta.'));
    } finally {
      setRoutePlanning(false);
    }
  };

  // Cierra el panel lateral y libera el mapa (evita fugas al desmontar el contenedor)
  const closeRouteDrawer = () => {
    try { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; mapLayerRef.current = null; } } catch {}
    setRouteDrawerOpen(false);
  };

  // Al abrir el panel: si ya hay un plan calculado, re-dibuja el mapa
  useEffect(() => {
    if (routeDrawerOpen && routePlan && userLocation) {
      const ordered = (routePlan.ordered || []).filter((o: any) => o.lat != null && o.lng != null);
      if (ordered.length) setTimeout(() => renderRouteMap(userLocation, ordered, routeGeometryRef.current), 80);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeDrawerOpen]);

  // ⭐ Guarda la foto anotada: sube la nueva versión, reemplaza la URL en el
  //    reporte y borra la anterior de Storage.
  const handleSaveAnnotation = async (blob: Blob) => {
    if (!annotate || !selectedHouse) return;
    setSavingAnnotation(true);
    try {
      const placeName = places.find(p => p.id === annotate.placeId)?.name || annotate.placeId;
      const file = new File([blob], `qc_annotated_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const urls = await storageService.uploadQualityCheckPhotos([file], selectedHouse.address, placeName);
      const newUrl = urls && urls[0];
      if (!newUrl) throw new Error('sin url');
      const oldUrl = ((qcData[annotate.placeId] && qcData[annotate.placeId].photos) || [])[annotate.index];

      setQcData(prev => {
        const photos = (((prev[annotate.placeId] && prev[annotate.placeId].photos) || []) as string[]).slice();
        photos[annotate.index] = newUrl;
        return { ...prev, [annotate.placeId]: { ...(prev[annotate.placeId] || {}), photos } };
      });

      // Si el reporte ya está guardado, parcha el documento con la nueva URL
      const savedDocId = savedQcDocByHouse.current[selectedHouse.id] || (editingQcId || '');
      if (savedDocId) {
        try {
          const ref = doc(db, 'quality_checks', savedDocId);
          const snap = await getDoc(ref);
          if (snap.exists()) {
            const data: any = snap.data() || {};
            const qc = { ...(data.qcData || {}) };
            const place = { ...(qc[annotate.placeId] || {}) };
            const photos = Array.isArray(place.photos) ? place.photos.slice() : [];
            if (photos[annotate.index] !== undefined) photos[annotate.index] = newUrl;
            else photos.push(newUrl);
            place.photos = photos;
            qc[annotate.placeId] = place;
            await updateDoc(ref, { qcData: qc });
          }
        } catch (e) { console.error('No se pudo parchar el reporte con la foto editada:', e); }
      }

      if (oldUrl && String(oldUrl).startsWith('http')) {
        try { await storageService.deletePhotoByUrl(oldUrl); } catch (e) { console.error(e); }
      }
      setAnnotate(null);
    } catch (e) {
      console.error('No se pudo guardar la anotación:', e);
      alert('No se pudo guardar la foto editada. Intenta de nuevo.');
    } finally {
      setSavingAnnotation(false);
    }
  };

  // ⭐ Clasifica un QC en uno de los tres grupos:
  //    - Recall:   se presionó "DID NOT PASS" (result === 'failed')
  //    - Finished: inspección terminada y guardada con "Guardar Todo" (pasó)
  //    - Pending:  llegó a Quality Check y aún no se completa la inspección
  const qcCategory = (qc: QCRecord): 'Pending' | 'Finished' | 'Recall' => {
    if (qc.result === 'failed') return 'Recall';
    if (qc.status === 'Finished') return 'Finished';
    return 'Pending';
  };

  // ⭐ Reúne las notas y daños capturados por área (para mostrarlos en la tarjeta del QC)
  const collectNotesForCard = (qc: QCRecord): { area: string; notes: string; damage: string }[] => {
    const data = (qc.qcData as Record<string, any>) || {};
    const out: { area: string; notes: string; damage: string }[] = [];
    places.forEach(p => {
      const d = data[p.id];
      if (!d) return;
      const notes = (d.notes || '').trim();
      const damage = (d.damage || '').trim();
      if (notes || damage) out.push({ area: p.name, notes, damage });
    });
    return out;
  };

  // ⭐ Último reporte de QC registrado para una casa
  const latestQCForHouse = (houseId: string): QCRecord | undefined => {
    const recs = qcList.filter(q => q.houseId === houseId);
    if (recs.length === 0) return undefined;
    return recs.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  };

  // ⭐ ¿El último QC de la casa NO pasó?
  const houseFailedQC = (houseId: string): boolean => {
    const r = latestQCForHouse(houseId);
    return !!r && r.result === 'failed';
  };

  // ⭐ ¿El último QC de la casa ya pasó (Finished y no fallido)? -> sale de pendientes
  const housePassedQC = (houseId: string): boolean => {
    const r = latestQCForHouse(houseId);
    return !!r && r.status === 'Finished' && r.result !== 'failed';
  };

  // ⭐ Fecha en formato mm/dd/YYYY
  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const [year, month, day] = dateString.split('-');
    if (!year || !month || !day) return dateString;
    return `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
  };

  // ⭐ Hora legible (hh:mm am/pm) a partir de un ISO
  const fmtTime = (iso?: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  // ⭐ Duración legible a partir de minutos
  const fmtDuration = (mins?: number | null): string => {
    if (mins == null || isNaN(Number(mins))) return '—';
    const m = Math.max(0, Math.round(Number(mins)));
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h ? `${h}h ${r}m` : `${r}m`;
  };

  // ⭐ Duración de un registro (usa durationMinutes; si no, la calcula de los ISO)
  const recordDuration = (qc: QCRecord): number | null => {
    if (qc.durationMinutes != null) return Number(qc.durationMinutes);
    if (qc.checkInAt && qc.checkOutAt) {
      const a = new Date(qc.checkInAt).getTime();
      const b = new Date(qc.checkOutAt).getTime();
      if (!isNaN(a) && !isNaN(b) && b >= a) return Math.round((b - a) / 60000);
    }
    return null;
  };

  // ⭐ PENDING = casas en estado "Quality Check" que aún esperan inspección
  //    (sin QC aprobado y sin QC reprobado: las reprobadas viven en Recall).
  const pendingQCHouses = properties.filter(h => isQualityCheckStatus(h) && !housePassedQC(h.id) && !houseFailedQC(h.id));

  // ⭐ RECALL = casas en estado "Recall" en el pipeline (aunque no tengan un QC
  //    "DID NOT PASS" registrado: muchas llegan a Recall por cambio de status).
  const recallHouses = properties.filter(h => isRecallStatus(h));

  // ⭐ ¿La casa/registro coincide con la búsqueda?
  const matchesSearch = (text: string[]) => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return true;
    return text.filter(Boolean).join(' ').toLowerCase().includes(q);
  };

  // ⭐ Casas pendientes ya filtradas por el buscador
  const filteredPendingHouses = pendingQCHouses.filter(h =>
    matchesSearch([h.address, getClientName(h.client), getTeamNameForHouse(h), String(h.client)])
  );

  // ⭐ Casas en Recall ya filtradas por el buscador
  const filteredRecallHouses = recallHouses.filter(h =>
    matchesSearch([h.address, getClientName(h.client), getTeamNameForHouse(h), String(h.client)])
  );

  // ⭐ Registros para la TABLA inferior: SOLO Finished y Recall.
  //    (Las Pending no se listan aquí: se muestran como tarjetas de "casas
  //    pendientes". Así cada pestaña filtra exactamente lo que indica su nombre.)
  const filteredQcList = qcList.filter(qc => {
    const cat = qcCategory(qc);
    if (cat === 'Pending') return false; // las pendientes van en las tarjetas de arriba
    if (statusFilter === 'Pending') return false; // en la pestaña Pending la tabla se oculta
    if (statusFilter === 'Finished' && cat !== 'Finished') return false;
    if (statusFilter === 'Recall' && cat !== 'Recall') return false;
    return matchesSearch([qc.status, cat, qc.result === 'failed' ? 'did not pass recall' : '', formatDate(qc.date), qc.date, qc.address, qc.client, getClientName(qc.client), qc.team || getTeamNameForHouse(properties.find(p => p.id === qc.houseId)), qc.inspector || '']);
  });

  // ⭐ Conteos de las pestañas (coherentes con lo que se ve):
  //    Pending = casas esperando inspección · Finished = registros de QC ·
  //    Recall = casas actualmente en estado "Recall" (+ registros DID NOT PASS).
  const finishedCount = qcList.filter(q => qcCategory(q) === 'Finished').length;
  const recallRecordsCount = qcList.filter(q => qcCategory(q) === 'Recall').length;
  const recallTotal = recallHouses.length + recallRecordsCount;
  const groupCounts = {
    All: pendingQCHouses.length + finishedCount + recallTotal,
    Pending: pendingQCHouses.length,
    Finished: finishedCount,
    Recall: recallTotal,
  };

  // ⭐ ¿Mostrar cada bloque según la pestaña activa?
  const showPendingBlock = statusFilter === 'All' || statusFilter === 'Pending';
  const showRecallBlock = statusFilter === 'All' || statusFilter === 'Recall';
  const showRecordsTable = statusFilter !== 'Pending';

  // ⭐ Áreas activas para una casa: si la casa tiene áreas marcadas (qcPlaces),
  //    solo esas; si no marcó ninguna, se muestran todas (compatibilidad).
  const activePlacesFor = (house: Property | null): Place[] => {
    const ids = (house as any)?.qcPlaces as string[] | undefined;
    if (Array.isArray(ids) && ids.length > 0) return places.filter(p => ids.includes(p.id));
    return places;
  };

  const handleOpenForm = (house: Property) => {
    setSelectedHouse(house);
    setEditingQcId(null);
    setPendingPhotos({});
    setPlaceSearch('');
    setSelectedPlaceIds([]);
    setCheckInAt(new Date().toISOString()); // ⭐ hora de entrada
    
    const initialData: any = {};
    places.forEach(p => {
      initialData[p.id] = { tasks: {}, corrections: '', score: null, notes: '', damage: '', photos: [] };
    });
    setQcData(initialData);
    setIsFormModalOpen(true);
  };

  // ⭐ Abrir QC para una casa pendiente: si ya existe un reporte abierto (Pending o
  //    que NO pasó), se edita ese; de lo contrario se crea uno nuevo. Evita duplicados.
  const handleStartOrContinueQC = (house: Property) => {
    const existing = latestQCForHouse(house.id);
    if (existing && (existing.status === 'Pending' || existing.result === 'failed')) {
      handleEditQC(existing);
    } else {
      handleOpenForm(house);
    }
  };

  const handleEditQC = (qc: QCRecord) => {
    // Si la propiedad no está en el listado, usamos los datos guardados en el reporte.
    const house = (properties.find(p => p.id === qc.houseId) || { id: qc.houseId, address: qc.address, client: qc.client }) as Property;
    setSelectedHouse(house);
    setEditingQcId(qc.id as string);
    setPendingPhotos({});
    setPlaceSearch('');
    setCheckInAt(qc.checkInAt || new Date().toISOString()); // ⭐ conservar entrada previa
    
    const loadedData: any = qc.qcData || {};
    places.forEach(p => {
      if (!loadedData[p.id]) {
        loadedData[p.id] = { tasks: {}, corrections: '', score: null, notes: '', damage: '', photos: [] };
      } else if (!Array.isArray(loadedData[p.id].photos)) {
        // ⭐ Asegurar que photos sea siempre un array (compatibilidad con registros viejos)
        loadedData[p.id].photos = [];
      }
    });
    
    setQcData(loadedData);

    // ⭐ Restaurar áreas seleccionadas: usa las guardadas o, si no hay, deriva las que tengan datos
    const derived = places
      .filter(p => {
        const d = loadedData[p.id];
        if (!d) return false;
        return Object.keys(d.tasks || {}).length > 0
          || (d.photos || []).length > 0
          || (d.notes || '').trim().length > 0
          || (d.damage || '').trim().length > 0
          || d.score != null
          || (d.corrections || '').trim().length > 0;
      })
      .map(p => p.id);
    setSelectedPlaceIds(qc.selectedPlaces && qc.selectedPlaces.length ? qc.selectedPlaces : derived);

    setIsFormModalOpen(true);
  };

  const handleCloseForm = () => {
    // Si la cámara ráfaga quedó abierta, apagar el stream.
    const st = streamRef.current;
    if (st) { st.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setCameraOpen(false);
    setCameraPlace(null);
    setCameraShots([]);
    setCheckInAt(null);
    setIsFormModalOpen(false);
    setSelectedHouse(null);
    setEditingQcId(null);
    setPendingPhotos({});
    setPlaceSearch('');
    setSelectedPlaceIds([]);
  };

  const togglePlaceSelection = (placeId: string) => {
    setSelectedPlaceIds(prev => prev.includes(placeId) ? prev.filter(x => x !== placeId) : [...prev, placeId]);
  };

  // ⭐ Guardar QC. forceFail = true -> "DID NOT PASS": queda Finished+failed (grupo
  //    "Recall" en esta vista) y la casa pasa al estado "Recall" en el pipeline,
  //    apareciendo también en la vista de Recalls para que el equipo la corrija.
  const handleSaveQC = async (forceFail = false) => {
    if (!selectedHouse) return;

    if (forceFail) {
      const ok = window.confirm('¿Marcar este Quality Check como "DID NOT PASS"? La casa pasará a Recall para que el equipo la corrija y se vuelva a inspeccionar, y aparecerá en la vista de Recalls.');
      if (!ok) return;
    }

    setIsSaving(true);

    // Solo se consideran las áreas SELECCIONADAS para decidir si está completo.
    const activePlaces = activePlacesFor(selectedHouse).filter(p => selectedPlaceIds.includes(p.id));
    let isPending = activePlaces.length === 0;
    activePlaces.forEach(p => {
      const placeTasks = tasks.filter(t => t.placeId === p.id);
      placeTasks.forEach(t => {
        if (!qcData[p.id]?.tasks[t.id]) isPending = true;
      });
    });

    const finalStatus: 'Pending' | 'Finished' = forceFail ? 'Finished' : (isPending ? 'Pending' : 'Finished');
    const finalResult: 'passed' | 'failed' | null = forceFail ? 'failed' : (isPending ? null : 'passed');

    // ⭐ Sellar la SALIDA y calcular la duración total de la inspección.
    const nowIso = new Date().toISOString();
    const startIso = checkInAt
      || (editingQcId ? (qcList.find(q => q.id === editingQcId)?.checkInAt || null) : null)
      || nowIso;
    const durationMinutes = (() => {
      const a = new Date(startIso).getTime();
      const b = new Date(nowIso).getTime();
      return (!isNaN(a) && !isNaN(b) && b >= a) ? Math.round((b - a) / 60000) : null;
    })();

    const recordData: any = {
      houseId: selectedHouse.id,
      date: editingQcId ? (qcList.find(q => q.id === editingQcId)?.date || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0],
      address: selectedHouse.address,
      client: selectedHouse.client,
      team: (editingQcId && qcList.find(q => q.id === editingQcId)?.team) || getTeamNameForHouse(selectedHouse),
      status: finalStatus,
      result: finalResult,
      inspector: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown',
      checkInAt: startIso,
      checkOutAt: nowIso,
      durationMinutes: durationMinutes,
      selectedPlaces: selectedPlaceIds,
      qcData: qcData
    };

    try {
      let savedId = editingQcId || '';
      if (editingQcId) {
        await updateDoc(doc(db, 'quality_checks', editingQcId), recordData);
        setQcList(prev => prev.map(qc => qc.id === editingQcId ? { id: editingQcId, ...recordData } as QCRecord : qc));
      } else {
        const docRef = await addDoc(collection(db, 'quality_checks'), recordData);
        savedId = docRef.id;
        setQcList(prev => [{ id: docRef.id, ...recordData } as QCRecord, ...prev]);
      }

      // ⭐ Vincular este reporte a las fotos que quedaron en cola offline para esta
      //    casa, así el uploader las adjunta al documento cuando vuelva la señal.
      if (savedId && selectedHouse) {
        savedQcDocByHouse.current[selectedHouse.id] = savedId;
        try { await offlineSetDocIdForHouse(selectedHouse.id, savedId); } catch (e) { console.error(e); }
        processQueue();
      }

      // ⭐ Si NO pasó, mover la casa a "Recall" (con registro en status_history para
      //    que aparezca en la vista de Recalls con su fecha de entrada). Si no existe
      //    un status "Recall", como respaldo se deja en "Quality Check".
      if (forceFail) {
        const prevStatusId = (selectedHouse as any).statusId;
        const recallStatusId = getRecallStatusId();
        const targetStatusId = recallStatusId || getQualityCheckStatusId();
        if (targetStatusId) {
          try {
            await updateDoc(doc(db, 'properties', selectedHouse.id), { statusId: targetStatusId });
          } catch (e) { console.error('No se pudo actualizar el estado de la casa:', e); }
        }
        // Registrar la transición a Recall en el histórico (origen: Quality Check)
        if (recallStatusId) {
          try {
            await statusHistoryService.log({
              propertyId: selectedHouse.id,
              fromStatusId: prevStatusId || null,
              fromStatusName: resolveStatusName(prevStatusId) || null,
              toStatusId: recallStatusId,
              toStatusName: resolveStatusName(recallStatusId) || 'Recall',
              changedBy: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown',
              source: 'quality_check',
              reason: 'No pasó Quality Check',
            } as any);
          } catch (e) { console.error('No se pudo registrar el historial de status:', e); }
        }
      }

      // ⭐ ENVÍO AUTOMÁTICO: cuando el QC queda Finished (pasó o no pasó), si hay
      //    email de empresa configurado y el envío automático está activado, se
      //    manda el reporte al correo de la empresa.
      let emailNote = '';
      if (finalStatus === 'Finished' && companySettings.autoSend && branding.email) {
        try {
          const sent = await sendQCByEmail(selectedHouse, qcData, recordData.inspector, recordData.date, recordData.team);
          if (sent) emailNote = `\n📧 Reporte enviado automáticamente a ${branding.email}.`;
        } catch (e) {
          console.error('No se pudo enviar el email automático:', e);
        }
      } else if (finalStatus === 'Finished' && companySettings.autoSend && !branding.email) {
        emailNote = '\n📧 Configura el email de la empresa para el envío automático (botón "Empresa").';
      }

      alert((forceFail
        ? '⚠️ Quality Check marcado como DID NOT PASS. La casa pasó a Recall y aparecerá en la vista de Recalls para corregirse.'
        : '✅ Quality Check Saved Successfully!') + emailNote);
      handleCloseForm();
    } catch (error) {
      console.error("Error saving Quality Check:", error);
      alert("Error trying to save the record.");
    } finally {
      setIsSaving(false);
    }
  };

  // ⭐ Eliminar la casa (misma acción que en HousesView).
  const handleDeleteHouse = async (house: Property) => {
    if (!window.confirm(`¿Eliminar la casa de ${getClientName(house.client)}? Esta acción no se puede deshacer.`)) return;
    try {
      await propertiesService.delete(house.id);
    } catch (e) {
      console.error('Error eliminando casa:', e);
      alert('No se pudo eliminar la casa.');
    }
  };

  const handleDeleteQC = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this Quality Check report? This cannot be undone.")) return;
    
    try {
      await deleteDoc(doc(db, 'quality_checks', id));
      setQcList(prev => prev.filter(qc => qc.id !== id));
    } catch (error) {
      console.error("Error deleting Quality Check:", error);
      alert("Error trying to delete the record.");
    }
  };

  // ⭐ Procesa UNA foto: preview instantáneo → optimiza (baja peso conservando
  //    calidad) → sube si hay conexión; si no hay o falla, la guarda OFFLINE en
  //    IndexedDB para subirla automáticamente cuando vuelva la señal.
  const ingestOne = async (placeId: string, placeName: string, file: File | Blob) => {
    const house = selectedHouse;
    if (!house) return;
    const id = uid();
    const preview = URL.createObjectURL(file);
    setPendingPhotos(prev => ({ ...prev, [placeId]: [...(prev[placeId] || []), { id, preview }] }));
    try {
      const asFile = file instanceof File ? file : new File([file], `qc_${id}.jpg`, { type: (file as any).type || 'image/jpeg' });
      // Optimizador: 1600px máx, calidad 0.8, objetivo ~0.6MB (buen balance peso/calidad)
      let compressed: any = asFile;
      try { compressed = await compressImage(asFile, { quality: 0.8, maxWidth: 1600, maxSizeMB: 0.6 }); }
      catch { compressed = asFile; }

      const online = typeof navigator === 'undefined' ? true : navigator.onLine;
      if (online) {
        try {
          const urls = await storageService.uploadQualityCheckPhotos([compressed], house.address, placeName);
          setQcData(prev => ({ ...prev, [placeId]: { ...(prev[placeId] || {}), photos: [...((prev[placeId] || {}).photos || []), ...urls] } }));
        } catch (upErr) {
          console.warn('Subida falló, se guarda offline para reintentar:', upErr);
          await queuePhoto({ id, houseId: house.id, placeId, placeName, address: house.address, blob: compressed });
        }
      } else {
        await queuePhoto({ id, houseId: house.id, placeId, placeName, address: house.address, blob: compressed });
      }
    } catch (error) {
      console.error('Error procesando foto:', error);
    } finally {
      setPendingPhotos(prev => ({ ...prev, [placeId]: (prev[placeId] || []).filter(p => p.id !== id) }));
      URL.revokeObjectURL(preview);
    }
  };

  // ⭐ Carga desde <input file> (cámara nativa de 1 foto o galería múltiple).
  //    Cada foto se procesa en paralelo en segundo plano (rápido, sin bloquear).
  const handlePhotoUpload = (placeId: string, placeName: string, files: FileList | null) => {
    if (!files || files.length === 0 || !selectedHouse) return;
    Array.from(files).forEach(f => { void ingestOne(placeId, placeName, f); });
  };

  // ⭐ Abrir la cámara en modo RÁFAGA para un área (se mantiene abierta).
  const openBurstCamera = (place: Place) => {
    if (!selectedHouse) return;
    setCameraPlace({ id: place.id, name: place.name });
    setCameraShots([]);
    setCameraError('');
    setCameraOpen(true);
  };

  // ⭐ Cerrar la cámara ráfaga (detiene el stream y limpia previews de la sesión).
  const closeBurstCamera = () => {
    const st = streamRef.current;
    if (st) { st.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    cameraShots.forEach(sh => { try { URL.revokeObjectURL(sh.preview); } catch {} });
    setCameraShots([]);
    setCameraOpen(false);
    setCameraPlace(null);
  };

  // ⭐ Disparo: captura el frame actual del video, lo procesa en segundo plano
  //    y DEJA la cámara abierta para seguir tomando fotos (ráfaga).
  const captureBurst = async () => {
    const video = videoRef.current;
    const place = cameraPlace;
    if (!video || !place || !selectedHouse) return;
    setCapturing(true);
    try {
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      const maxDim = 1600;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob: Blob | null = await new Promise(res => canvas.toBlob(b => res(b), 'image/jpeg', 0.9));
      if (!blob) return;
      const shotId = uid();
      const preview = URL.createObjectURL(blob);
      setCameraShots(prev => [{ id: shotId, preview }, ...prev]);
      void ingestOne(place.id, place.name, blob);
    } catch (e) {
      console.error('Error capturando foto:', e);
    } finally {
      setCapturing(false);
    }
  };

  // ⭐ Enciende/apaga el stream de la cámara según se abra/cierre el overlay.
  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setCameraError('Este navegador no permite la cámara dentro de la app. Usa "Tomar foto" o "Galería".');
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try { await videoRef.current.play(); } catch { /* autoplay */ }
        }
      } catch (e) {
        console.error('getUserMedia error:', e);
        setCameraError('No se pudo acceder a la cámara. Revisa los permisos o usa "Tomar foto" / "Galería".');
      }
    })();
    return () => {
      cancelled = true;
      const st = streamRef.current;
      if (st) { st.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen, cameraPlace]);

  // ⭐ Eliminar foto del estado (también la borra de Storage)
  const handleRemovePhoto = async (placeId: string, index: number) => {
    if (!window.confirm('¿Eliminar esta foto?')) return;

    const photos = qcData[placeId]?.photos || [];
    const urlToDelete = photos[index];

    setQcData(prev => ({
      ...prev,
      [placeId]: {
        ...prev[placeId],
        photos: photos.filter((_: string, i: number) => i !== index)
      }
    }));

    if (urlToDelete?.startsWith('http')) {
      await storageService.deletePhotoByUrl(urlToDelete);
    }
  };

  // ⭐ Datos de marca para el PDF y el correo (con respaldo a valores por defecto)
  const branding = {
    name: (companySettings.name || '').trim() || 'PRECISE CLEANING',
    address: (companySettings.address || '').trim(),
    logo: (companySettings.logo || '').trim(),
    email: (companySettings.email || '').trim(),
  };
  const brandInitials = (branding.name || 'PC').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'PC';

  // ⭐ Subir/optimizar el logo de la empresa y guardarlo como base64 (autocontenido)
  const handleCompanyLogoUpload = async (file?: File | null) => {
    if (!file) return;
    const toDataUrl = (blob: Blob) => new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
    try {
      const compressed = await compressImage(file, { quality: 0.85, maxWidth: 400, maxSizeMB: 0.2 });
      const dataUrl = await toDataUrl(compressed);
      setCompanyDraft(prev => ({ ...prev, logo: dataUrl }));
    } catch {
      const dataUrl = await toDataUrl(file);
      setCompanyDraft(prev => ({ ...prev, logo: dataUrl }));
    }
  };

  // ⭐ Guardar la configuración de empresa en Firestore (settings_company/main)
  const saveCompanySettings = async () => {
    setSavingCompany(true);
    try {
      const clean: CompanyConfig = {
        name: (companyDraft.name || '').trim(),
        address: (companyDraft.address || '').trim(),
        logo: companyDraft.logo || '',
        email: (companyDraft.email || '').trim(),
        autoSend: companyDraft.autoSend !== false,
      };
      await setDoc(doc(db, 'settings_company', 'main'), clean, { merge: true });
      setCompanySettings(clean);
      setCompanyModalOpen(false);
    } catch (e) {
      console.error('Error guardando configuración de empresa:', e);
      alert('No se pudo guardar la configuración de la empresa.');
    } finally {
      setSavingCompany(false);
    }
  };

  // ⭐ Reúne las áreas que tienen datos (tareas, notas o fotos) para el reporte
  const collectPlacesWithData = (qcDataObj: Record<string, any>) => {
    const out: { place: Place; photos: string[]; tasksData: any; notes: string; damage: string; score: any; corrections: string }[] = [];
    places.forEach(p => {
      const data = qcDataObj[p.id];
      if (!data) return;
      const hasPhotos = (data.photos || []).length > 0;
      const hasTasks = Object.keys(data.tasks || {}).length > 0;
      const hasNotes = (data.notes || data.damage || '').trim().length > 0;
      if (hasPhotos || hasTasks || hasNotes) {
        out.push({
          place: p,
          photos: data.photos || [],
          tasksData: data.tasks || {},
          notes: data.notes || '',
          damage: data.damage || '',
          score: data.score,
          corrections: data.corrections,
        });
      }
    });
    return out;
  };

  // ⭐ Enviar automáticamente el reporte al email de la empresa.
  //    Escribe en la colección "mail" (extensión Firebase "Trigger Email").
  const sendQCByEmail = async (house: Property, qcDataObj: Record<string, any>, inspector: string, dateStr?: string, teamNameOverride?: string): Promise<boolean> => {
    const to = branding.email;
    if (!to) return false;
    if (collectPlacesWithData(qcDataObj).length === 0) return false;
    const html = await buildAndExportQCPDF(house, qcDataObj, inspector, dateStr, undefined, teamNameOverride, { returnHtml: true });
    if (!html || typeof html !== 'string') return false;
    const { subject } = buildEmail(house, qcDataObj, inspector, dateStr, teamNameOverride);
    await addDoc(collection(db, 'mail'), { to, message: { subject, html } });
    return true;
  };

  // ⭐ Generar PDF profesional del Quality Check.
  const buildAndExportQCPDF = async (
    house: Property,
    qcDataObj: Record<string, any>,
    inspectorName: string,
    recordDate?: string,
    setLoading?: (loading: boolean) => void,
    teamNameOverride?: string,
    options?: { returnHtml?: boolean }
  ): Promise<string | void> => {
    const returnHtml = options?.returnHtml === true;
    const placesWithData = collectPlacesWithData(qcDataObj);

    if (placesWithData.length === 0) {
      if (!returnHtml) alert('No hay datos para exportar. Este Quality Check no tiene tareas evaluadas, notas ni fotos.');
      return;
    }

    if (setLoading) setLoading(true);

    try {
      // Para el correo se usan las URLs directas (más liviano); para el PDF se
      // convierten a base64 para que se impriman aunque no haya conexión.
      const placesWithBase64 = returnHtml
        ? placesWithData.map((pd) => ({ ...pd, photosBase64: pd.photos }))
        : await Promise.all(
          placesWithData.map(async (pd) => ({
            ...pd,
            photosBase64: await Promise.all(
              pd.photos.map(async (url) => {
                try {
                  const response = await fetch(url, { mode: 'cors' });
                  // Si la descarga no es válida, usamos la URL real (carga directa en <img>)
                  if (!response.ok) return url;
                  const blob = await response.blob();
                  if (!blob || blob.size === 0 || (blob.type && !blob.type.startsWith('image/'))) return url;
                  return await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve((reader.result as string) || url);
                    reader.onerror = () => resolve(url);
                    reader.readAsDataURL(blob);
                  });
                } catch (err) {
                  console.error('Error loading image, using direct URL:', err);
                  return url;
                }
              })
            )
          }))
        );

      const inspector = inspectorName || 'Unknown';
      const displayDate = recordDate 
        ? new Date(recordDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const date = displayDate;
      const clientName = getClientName(house.client);
      const teamName = teamNameOverride || getTeamNameForHouse(house);

      // Resumen general del reporte
      const scoredVals = placesWithData.map(p => p.score).filter((v): v is number => typeof v === 'number' && v > 0);
      const avgScore = scoredVals.length ? (scoredVals.reduce((a, b) => a + b, 0) / scoredVals.length) : 0;
      let yesCount = 0, noCount = 0;
      placesWithData.forEach(pd => {
        const ptasks = tasks.filter(t => t.placeId === pd.place.id);
        ptasks.forEach(t => {
          const v = pd.tasksData[t.id];
          if (v === 'Yes') yesCount++;
          else if (v === 'No') noCount++;
        });
      });
      const totalAnswered = yesCount + noCount;
      const passRate = totalAnswered ? Math.round((yesCount / totalAnswered) * 100) : 0;
      const hasData = totalAnswered > 0;
      const verdict = !hasData ? 'Inspection Recorded' : passRate >= 90 ? 'Excellent Result' : passRate >= 75 ? 'Satisfactory' : 'Needs Attention';
      const verdictClass = !hasData ? 'mid' : passRate >= 90 ? 'pass' : passRate >= 75 ? 'mid' : 'low';

      const placeSections = placesWithBase64.map(pd => {
        const placeTasks = tasks.filter(t => t.placeId === pd.place.id);
        const tasksHtml = placeTasks.length > 0 ? `
          <table class="tasks-table">
            <thead>
              <tr><th>Task</th><th>Result</th></tr>
            </thead>
            <tbody>
              ${placeTasks.map(t => {
                const val = pd.tasksData[t.id];
                const cls = val === 'Yes' ? 'yes' : val === 'No' ? 'no' : 'na';
                return `
                  <tr>
                    <td>${t.name}</td>
                    <td style="text-align:right;"><span class="result-pill ${cls}">${val || 'N/A'}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        ` : '';

        const scoreHtml = pd.score ? `
          <div class="score-badge score-${pd.score}">
            Score: ${pd.score}/3
          </div>
        ` : '';

        const notesHtml = (pd.notes || pd.damage) ? `
          <div class="notes-block">
            ${pd.notes ? `<div><strong>Notes:</strong> ${pd.notes}</div>` : ''}
            ${pd.damage ? `<div style="margin-top: 8px; color: #b91c1c;"><strong>Damage:</strong> ${pd.damage}</div>` : ''}
          </div>
        ` : '';

        const photosHtml = pd.photosBase64.length > 0 ? `
          <div class="photos-label">Photographic Evidence (${pd.photosBase64.length})</div>
          <div class="photo-grid">
            ${pd.photosBase64.map((src, idx) => `
              <figure class="photo-item">
                <div class="photo-frame"><img src="${src}" alt="QC photo ${idx + 1}" /></div>
                <figcaption class="photo-cap">${pd.place.name} — Photo ${String(idx + 1).padStart(2, '0')}</figcaption>
              </figure>
            `).join('')}
          </div>
        ` : '';

        return `
          <section class="place-section">
            <div class="place-header">
              <h2>${pd.place.name}</h2>
              ${scoreHtml}
            </div>
            <div class="place-body">
              ${tasksHtml || '<div style="color:#94a3b8;font-size:13px;margin-bottom:8px;">No tasks evaluated for this area.</div>'}
              ${notesHtml}
              ${photosHtml}
            </div>
          </section>
        `;
      }).join('');

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8" />
            <title>Quality Check Report - ${clientName}</title>
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background-color: #eef2f7;
                padding: 24px;
                color: #1e293b;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .container {
                max-width: 1000px;
                margin: 0 auto;
                background: #ffffff;
                border-radius: 16px;
                padding: 48px;
                box-shadow: 0 10px 30px rgba(15,23,42,0.08);
                border-top: 6px solid #1e40af;
              }
              .brandbar {
                display: flex; justify-content: space-between; align-items: center;
                padding-bottom: 20px; border-bottom: 1px solid #e2e8f0;
              }
              .brand { display: flex; align-items: center; gap: 14px; }
              .brand-logo {
                width: 46px; height: 46px; border-radius: 12px;
                background: linear-gradient(135deg, #1e40af, #3b82f6);
                color: #fff; font-weight: 800; font-size: 16px; letter-spacing: 1px;
                display: flex; align-items: center; justify-content: center;
              }
              .logo-text { font-size: 20px; font-weight: 800; color: #1e3a8a; letter-spacing: 2px; line-height: 1; }
              .logo-subtitle { font-size: 10px; font-weight: 600; color: #64748b; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px; }
              .doc-tag {
                font-size: 11px; font-weight: 700; color: #1e40af; text-transform: uppercase; letter-spacing: 1px;
                background: #eff6ff; border: 1px solid #bfdbfe; padding: 8px 14px; border-radius: 20px;
              }
              h1.report-title { text-align: center; font-size: 34px; font-weight: 800; color: #0f172a; margin: 36px 0 6px 0; }
              .report-sub { text-align: center; font-size: 13px; color: #94a3b8; margin-bottom: 32px; }
              .info-grid {
                display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px;
                background: #e2e8f0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 24px;
              }
              .info-item { background: #f8fafc; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
              .info-k { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.6px; }
              .info-v { font-size: 14px; font-weight: 700; color: #0f172a; word-break: break-word; }
              .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 40px; }
              .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; text-align: center; }
              .summary-num { font-size: 26px; font-weight: 800; color: #0f172a; line-height: 1; }
              .summary-num.ok { color: #047857; }
              .summary-num.bad { color: #b91c1c; }
              .summary-sm { font-size: 13px; font-weight: 700; color: #94a3b8; }
              .summary-lbl { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; margin-top: 8px; }
              .place-section { margin-bottom: 32px; page-break-inside: avoid; }
              .place-header {
                display: flex; justify-content: space-between; align-items: center;
                padding: 12px 18px; background: #1e40af; border-radius: 10px 10px 0 0;
              }
              .place-header h2 { font-size: 17px; font-weight: 700; color: #ffffff; }
              .place-body { border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px; padding: 18px; }
              .score-badge { padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; }
              .score-1 { background: #fee2e2; color: #991b1b; }
              .score-2 { background: #fef3c7; color: #854d0e; }
              .score-3 { background: #d1fae5; color: #065f46; }
              .tasks-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
              .tasks-table th {
                background: #f8fafc; color: #64748b; font-weight: 700; text-align: left;
                padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;
              }
              .tasks-table th:last-child { text-align: right; }
              .tasks-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; }
              .tasks-table tr:last-child td { border-bottom: none; }
              .result-pill { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; }
              .result-pill.yes { background: #d1fae5; color: #047857; }
              .result-pill.no { background: #fee2e2; color: #b91c1c; }
              .result-pill.na { background: #f1f5f9; color: #94a3b8; }
              .notes-block { background: #f8fafc; padding: 14px 16px; border-left: 3px solid #1e40af; border-radius: 6px; font-size: 13px; color: #334155; margin-bottom: 16px; }
              .photos-label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 10px; }
              .photo-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
              .photo-item { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #ffffff; page-break-inside: avoid; }
              .photo-frame { width: 100%; height: 240px; background: #f1f5f9; }
              .photo-item img { width: 100%; height: 240px; object-fit: cover; display: block; }
              .photo-cap { font-size: 10px; font-weight: 600; color: #64748b; padding: 8px 10px; background: #f8fafc; border-top: 1px solid #eef2f7; text-transform: uppercase; letter-spacing: 0.4px; }
              .result-banner { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; border-radius: 12px; margin-bottom: 32px; }
              .result-banner.pass { background: #ecfdf5; border: 1px solid #a7f3d0; }
              .result-banner.mid { background: #fffbeb; border: 1px solid #fde68a; }
              .result-banner.low { background: #fef2f2; border: 1px solid #fecaca; }
              .rb-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; }
              .rb-verdict { font-size: 22px; font-weight: 800; margin-top: 4px; }
              .result-banner.pass .rb-verdict { color: #047857; }
              .result-banner.mid .rb-verdict { color: #b45309; }
              .result-banner.low .rb-verdict { color: #b91c1c; }
              .rb-score { text-align: right; }
              .rb-pct { font-size: 30px; font-weight: 900; color: #0f172a; line-height: 1; }
              .rb-pct-lbl { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; margin-top: 4px; }
              .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; }
              @media print {
                @page { margin: 12mm; size: A4; }
                body { background: #ffffff; padding: 0; }
                .container { box-shadow: none; border-radius: 0; padding: 0; max-width: 100%; border-top: none; }
                .place-section, .photo-item, .summary-card, .info-item { break-inside: avoid; }
              }
            </style>
          </head>
          <body>
            <div class="container">

              <div class="brandbar">
                <div class="brand">
                  ${branding.logo
        ? `<img src="${branding.logo}" alt="logo" style="width:46px;height:46px;border-radius:12px;object-fit:contain;background:#fff;border:1px solid #e2e8f0;" />`
        : `<div class="brand-logo">${brandInitials}</div>`}
                  <div>
                    <div class="logo-text">${branding.name}</div>
                    <div class="logo-subtitle">${branding.address || 'Professional Cleaning Services'}</div>
                  </div>
                </div>
                <div class="doc-tag">Quality Check Report</div>
              </div>

              <h1 class="report-title">Quality Check Report</h1>
              <div class="report-sub">Detailed inspection summary &amp; photographic evidence</div>

              <div class="result-banner ${verdictClass}">
                <div>
                  <div class="rb-label">Overall Assessment</div>
                  <div class="rb-verdict">${verdict}</div>
                </div>
                <div class="rb-score">
                  <div class="rb-pct">${hasData ? passRate + '%' : '—'}</div>
                  <div class="rb-pct-lbl">Tasks Passed</div>
                </div>
              </div>

              <div class="info-grid">
                <div class="info-item"><span class="info-k">Client</span><span class="info-v">${clientName}</span></div>
                <div class="info-item"><span class="info-k">Address</span><span class="info-v">${house.address || '—'}</span></div>
                <div class="info-item"><span class="info-k">Team</span><span class="info-v">${teamName}</span></div>
                <div class="info-item"><span class="info-k">Inspector</span><span class="info-v">${inspector}</span></div>
                <div class="info-item"><span class="info-k">Date</span><span class="info-v">${date}</span></div>
                <div class="info-item"><span class="info-k">Areas Inspected</span><span class="info-v">${placesWithBase64.length}</span></div>
              </div>

              <div class="summary">
                <div class="summary-card">
                  <div class="summary-num">${passRate}%</div>
                  <div class="summary-lbl">Pass Rate</div>
                </div>
                <div class="summary-card">
                  <div class="summary-num ok">${yesCount}</div>
                  <div class="summary-lbl">Passed Tasks</div>
                </div>
                <div class="summary-card">
                  <div class="summary-num bad">${noCount}</div>
                  <div class="summary-lbl">Failed Tasks</div>
                </div>
                <div class="summary-card">
                  <div class="summary-num">${avgScore ? avgScore.toFixed(1) : '—'}<span class="summary-sm">${avgScore ? ' /3' : ''}</span></div>
                  <div class="summary-lbl">Avg. Score</div>
                </div>
              </div>

              ${placeSections}

              <div class="footer">
                ${branding.name}${branding.address ? ' • ' + branding.address : ''} • Generated on ${date}
              </div>
            </div>
            <script>
              window.addEventListener('load', function() {
                var images = document.querySelectorAll('img');
                if (images.length === 0) { setTimeout(function(){ window.print(); }, 300); return; }
                var loaded = 0;
                var done = function(){ loaded++; if (loaded >= images.length) setTimeout(function(){ window.print(); }, 500); };
                images.forEach(function(img){ if (img.complete) done(); else { img.addEventListener('load', done); img.addEventListener('error', done); } });
              });
            </script>
          </body>
        </html>
      `;

      // Para el correo: devolvemos el HTML en lugar de abrir la ventana de impresión.
      if (returnHtml) return html;

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Por favor permite las ventanas emergentes (pop-ups) para generar el PDF.');
        return;
      }
      printWindow.document.write(html);
      printWindow.document.close();
    } catch (error) {
      console.error('Error generating Quality Check PDF:', error);
      alert('Error generando el PDF. Revisa la consola.');
    } finally {
      if (setLoading) setLoading(false);
    }
  };

  const handleExportFromModal = async () => {
    if (!selectedHouse) return;
    const inspector = currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown';
    await buildAndExportQCPDF(selectedHouse, qcData, inspector, undefined, setIsExportingPDF);
  };

  const handleExportFromTable = async (qc: QCRecord) => {
    // Si la propiedad no está en el listado, reconstruimos lo necesario desde el propio reporte.
    const house = (properties.find(p => p.id === qc.houseId) || { id: qc.houseId, address: qc.address, client: qc.client }) as Property;
    const inspector = qc.inspector || 'Unknown';
    const recordQcData = (qc.qcData as Record<string, any>) || {};
    
    setExportingForQcId(qc.id as string);
    try {
      await buildAndExportQCPDF(house, recordQcData, inspector, qc.date, undefined, qc.team);
    } finally {
      setExportingForQcId(null);
    }
  };

  // ⭐ Resumen rápido (para el cuerpo del email)
  const qcSummary = (qcDataObj: Record<string, any>) => {
    let yes = 0, no = 0;
    places.forEach(p => {
      const d = qcDataObj[p.id];
      if (!d) return;
      tasks.filter(t => t.placeId === p.id).forEach(t => {
        const v = d.tasks?.[t.id];
        if (v === 'Yes') yes++; else if (v === 'No') no++;
      });
    });
    const total = yes + no;
    const passRate = total ? Math.round((yes / total) * 100) : 0;
    const hasData = total > 0;
    const verdict = !hasData ? 'Inspection Recorded' : passRate >= 90 ? 'Excellent Result' : passRate >= 75 ? 'Satisfactory' : 'Needs Attention';
    return { passRate, hasData, verdict };
  };

  // ⭐ Construye asunto + cuerpo (en inglés) del correo
  const buildEmail = (house: Property, qcDataObj: Record<string, any>, inspector: string, dateStr?: string, teamNameOverride?: string) => {
    const clientName = getClientName(house.client);
    const team = teamNameOverride || getTeamNameForHouse(house);
    const niceDate = formatDate(dateStr || new Date().toISOString().split('T')[0]);
    const { passRate, hasData, verdict } = qcSummary(qcDataObj);
    const subject = `Quality Check Report - ${clientName} (${niceDate})`;
    const body = [
      'Hello,',
      '',
      'Please find the Quality Check report for the property detailed below.',
      '',
      `Client: ${clientName}`,
      `Address: ${house.address || '-'}`,
      `Team: ${team}`,
      `Inspector: ${inspector || 'Unknown'}`,
      `Date: ${niceDate}`,
      `Overall result: ${verdict}${hasData ? ` (${passRate}% of tasks passed)` : ''}`,
      '',
      'The full report, including task results and photographic evidence, is attached as a PDF.',
      '',
      'Best regards,',
      'Precise Cleaning',
    ].join('\r\n');
    return { subject, body };
  };

  const openEmailForQC = (qc: QCRecord) => {
    const house = (properties.find(p => p.id === qc.houseId) || { id: qc.houseId, address: qc.address, client: qc.client }) as Property;
    if (branding.email) setEmailTo(branding.email);
    setEmailCtx(buildEmail(house, (qc.qcData as Record<string, any>) || {}, qc.inspector || 'Unknown', qc.date, qc.team));
    setEmailExport(() => () => handleExportFromTable(qc));
    setEmailModalOpen(true);
  };

  const openEmailForCurrent = () => {
    if (!selectedHouse) return;
    if (branding.email) setEmailTo(branding.email);
    const inspector = currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown';
    const dateStr = editingQcId ? (qcList.find(q => q.id === editingQcId)?.date) : new Date().toISOString().split('T')[0];
    setEmailCtx(buildEmail(selectedHouse, qcData, inspector, dateStr));
    setEmailExport(() => () => handleExportFromModal());
    setEmailModalOpen(true);
  };

  const sendEmail = async () => {
    if (!emailCtx) return;
    const to = emailTo.trim();
    if (!to) { alert('Ingresa un correo de destino.'); return; }
    // Abrir el PDF primero para que el usuario lo guarde y lo adjunte
    try { if (emailExport) await emailExport(); } catch (e) { console.error(e); }
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(emailCtx.subject)}&body=${encodeURIComponent(emailCtx.body)}`;
    window.location.href = mailto;
    setEmailModalOpen(false);
  };

  const setTaskValue = (placeId: string, taskId: string, value: 'Yes' | 'No') => {
    setQcData(prev => ({
      ...prev, [placeId]: { ...prev[placeId], tasks: { ...prev[placeId].tasks, [taskId]: value } }
    }));
  };

  const setScoreValue = (placeId: string, value: number) => {
    setQcData(prev => ({ ...prev, [placeId]: { ...prev[placeId], score: value } }));
  };

  const handleTextChange = (placeId: string, field: 'notes' | 'damage', value: string) => {
    setQcData(prev => ({ ...prev, [placeId]: { ...prev[placeId], [field]: value } }));
  };

  const s = {
    th: { backgroundColor: '#f9fafb', padding: '12px 16px', color: '#6b7280', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb', textAlign: 'left' as const },
    td: { padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#111827', fontSize: '0.95rem' },
    closeBtn: { background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
    routeIconBtn: { background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569', borderRadius: '7px', width: '30px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' } as React.CSSProperties,
    cardTitle: { color: '#3b82f6', fontSize: '1.1rem', borderBottom: '2px solid #3b82f6', paddingBottom: '8px', marginTop: 0, fontWeight: 600 },
    taskItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid #eee' },
    // Las funciones de botón solo devuelven color dinámico; el tamaño/padding lo da la clase .qc-toggle
    btnYes: (active: boolean) => ({ border: active ? '1px solid #22c55e' : '1px solid #e1e4e8', backgroundColor: active ? '#22c55e' : 'white', color: active ? 'white' : '#111827' }),
    btnNo: (active: boolean) => ({ border: active ? '1px solid #ef4444' : '1px solid #e1e4e8', backgroundColor: active ? '#ef4444' : 'white', color: active ? 'white' : '#111827' }),
    btnScore: (active: boolean) => ({ border: active ? '1px solid #3b82f6' : '1px solid #e1e4e8', backgroundColor: active ? '#3b82f6' : 'white', color: active ? 'white' : '#111827' }),
    extraFields: { marginTop: '15px', backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px dashed #ccc' },
    labelQC: { display: 'block', fontWeight: 'bold' as const, fontSize: '11px', margin: '10px 0 5px', color: '#555', textTransform: 'uppercase' as const },
    textareaQC: { width: '100%', height: '60px', border: '1px solid #e1e4e8', borderRadius: '6px', padding: '10px', boxSizing: 'border-box' as const, outline: 'none', fontFamily: 'inherit', backgroundColor: '#ffffff', color: '#111827', fontSize: '0.9rem', resize: 'vertical' as const },
    btnSaveQC: { backgroundColor: '#22c55e', color: 'white', padding: '15px 50px', border: 'none', borderRadius: '30px', fontWeight: 'bold' as const, cursor: 'pointer', fontSize: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: isSaving ? 0.7 : 1 },
    btnFailQC: { backgroundColor: '#ef4444', color: 'white', padding: '15px 40px', border: 'none', borderRadius: '30px', fontWeight: 'bold' as const, cursor: 'pointer', fontSize: '16px', boxShadow: '0 4px 6px rgba(239,68,68,0.25)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: isSaving ? 0.7 : 1 },
    pillBtn: (active: boolean) => ({ padding: '6px 16px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: active ? '#3b82f6' : '#f1f5f9', color: active ? 'white' : '#64748b', transition: 'all 0.2s' })
  };

  // ⭐ Áreas disponibles (activas de la casa con tareas configuradas)
  const activePlaces = activePlacesFor(selectedHouse);
  const placeQuery = placeSearch.trim().toLowerCase();
  const availablePlaces = activePlaces.filter(p => tasks.some(t => t.placeId === p.id));
  const searchablePlaces = availablePlaces.filter(p => !placeQuery || p.name.toLowerCase().includes(placeQuery));
  const selectedRenderPlaces = availablePlaces.filter(p => selectedPlaceIds.includes(p.id));

  return (
    <div className="fade-in qc-view" style={{ padding: '20px', boxSizing: 'border-box' }}>
      <style>{`
        .spin-qc { animation: spin-qc 1s linear infinite; }
        @keyframes spin-qc { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* Por defecto (escritorio): tabla visible, tarjetas ocultas */
        .qc-cards-wrap { display: none; }
        .qc-view { overflow-x: hidden; max-width: 100%; }

        /* ===== MODAL RESPONSIVE: 80% en escritorio / pantalla completa nativa en móvil ===== */
        .qc-overlay {
          position: fixed; inset: 0;
          background-color: rgba(15, 23, 42, 0.5);
          backdrop-filter: blur(3px);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 24px; box-sizing: border-box; overflow: hidden;
        }
        .qc-modal {
          background-color: #eaeff2;
          width: 80vw; max-width: 1400px;
          height: 82vh;
          border-radius: 16px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
          display: flex; flex-direction: column; overflow: hidden;
        }
        .qc-header {
          background-color: #3b82f6; color: #fff;
          padding: 18px 20px;
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 12px; flex-shrink: 0;
        }
        .qc-title { margin: 0; font-size: 1.3rem; display: flex; align-items: center; gap: 8px; }
        .qc-prop { margin: 8px 0 0; font-size: 0.95rem; opacity: 0.9; }
        .qc-insp { margin: 4px 0 0; font-size: 0.85rem; opacity: 0.8; display: flex; align-items: center; gap: 4px; }

        /* ===== Buscador de áreas ===== */
        .qc-search-bar { flex-shrink: 0; padding: 12px 20px; background: #eaeff2; border-bottom: 1px solid #d8dee4; }
        .qc-search { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 0 12px; height: 44px; }
        .qc-search input { flex: 1; border: none; outline: none; background: transparent; color: #111827; font-size: 0.95rem; height: 100%; min-width: 0; }
        .qc-search button { background: none; border: none; color: #94a3b8; cursor: pointer; display: flex; align-items: center; padding: 4px; }

        .qc-body {
          padding: 20px; overflow-y: auto; -webkit-overflow-scrolling: touch;
          display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
          gap: 20px; flex: 1; align-content: start;
        }
        .qc-savebar {
          padding: 14px; display: flex; gap: 12px; justify-content: center; align-items: center; flex-wrap: wrap;
          border-top: 3px solid #22c55e; background-color: #fff;
          flex-shrink: 0;
          padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px));
        }
        .qc-savebar button { box-sizing: border-box; }

        .qc-card { background: #fff; border-radius: 10px; border: 1px solid #e1e4e8; padding: 20px; }

        .qc-toggle {
          padding: 8px 16px; border-radius: 6px; cursor: pointer;
          font-weight: 700; font-size: 0.9rem; transition: all 0.2s;
          min-width: 52px; -webkit-tap-highlight-color: transparent;
        }

        .qc-photo-actions { display: flex; gap: 8px; margin-bottom: 12px; }
        .qc-photo-btn {
          flex: 1; min-height: 46px; padding: 10px 12px; border-radius: 8px;
          font-weight: 600; font-size: 0.85rem; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          background: #fff; color: #2563eb; border: 1px solid #bfdbfe;
          -webkit-tap-highlight-color: transparent;
        }
        .qc-photo-btn-primary { background: #2563eb; color: #fff; border-color: #2563eb; }

        .qc-photo-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
          gap: 8px; margin-bottom: 12px;
        }

        /* ===== Selector de áreas (chips) ===== */
        .qc-picker { grid-column: 1 / -1; background: #fff; border: 1px solid #e1e4e8; border-radius: 10px; padding: 16px; }
        .qc-chip {
          padding: 8px 14px; border-radius: 20px; font-weight: 600; font-size: 0.85rem; cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s;
          -webkit-tap-highlight-color: transparent;
        }

        /* ===== Casas pendientes de Quality Check ===== */
        .qc-pending-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 12px; }

        /* ===== Vista lateral de RUTA de inspección ===== */
        .qc-route-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); z-index: 1400; display: flex; justify-content: flex-end; }
        .qc-route-drawer { width: 480px; max-width: 92vw; height: 100%; background: #fff; box-shadow: -8px 0 30px rgba(0,0,0,0.18); display: flex; flex-direction: column; animation: qc-slide-in 0.22s ease; }
        @keyframes qc-slide-in { from { transform: translateX(40px); opacity: 0.3; } to { transform: translateX(0); opacity: 1; } }
        .qc-route-item { display: flex; align-items: center; gap: 10px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; }
        .qc-route-map { width: 100%; height: 260px; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; background: #eaeff2; }
        .qc-route-map .leaflet-container { height: 100%; width: 100%; }

        /* ===== Barra de herramientas: buscador + pestañas juntos en una tarjeta ===== */
        .qc-toolbar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 14px; flex-wrap: wrap;
          background: #ffffff; border: 1px solid #e5e7eb; border-radius: 14px;
          padding: 12px 14px; margin-bottom: 20px;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
        }

        /* ===== Buscador de la tabla ===== */
        .qc-table-search { display: flex; align-items: center; gap: 8px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 12px; padding: 0 14px; height: 44px; flex: 1; min-width: 240px; transition: border-color 0.15s, box-shadow 0.15s; }
        .qc-table-search:focus-within { border-color: #93c5fd; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12); background: #ffffff; }
        .qc-table-search input { flex: 1; border: none; outline: none; background: transparent; color: #111827; font-size: 0.92rem; min-width: 0; }
        .qc-table-search button:hover { color: #475569; }

        /* ===== Pestañas de estado (control segmentado) ===== */
        .qc-status-pills { display: inline-flex; background: #f1f5f9; border: 1px solid #e5e7eb; border-radius: 12px; padding: 4px; gap: 2px; flex-shrink: 0; }
        .qc-tab {
          border: none; background: transparent; cursor: pointer;
          padding: 9px 20px; border-radius: 9px;
          font-weight: 600; font-size: 0.85rem; color: #64748b;
          transition: all 0.15s; white-space: nowrap;
          -webkit-tap-highlight-color: transparent;
        }
        .qc-tab:hover { color: #1e3a8a; }
        .qc-tab.active { background: #ffffff; color: #1d4ed8; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1); }
        .qc-tab-recall { color: #7c3aed; }
        .qc-tab-recall:hover { color: #6d28d9; }
        .qc-tab-recall.active { color: #6d28d9; box-shadow: 0 1px 2px rgba(124, 58, 237, 0.18); }

        /* ===== MÓVIL: tarjetas + modal nativo ===== */
        @media (max-width: 820px) {
          html, body { overflow-x: hidden; max-width: 100%; }
          .qc-view { padding: 14px !important; }

          /* Título más compacto, estilo Pipeline */
          .qc-view .main-header h1 { font-size: 1.6rem !important; }

          /* Ocultar tabla y mostrar tarjetas */
          .qc-table-wrap { display: none !important; }
          .qc-cards-wrap { display: flex !important; }

          .qc-toolbar { flex-direction: column; align-items: stretch; padding: 12px; }
          .qc-table-search { width: 100%; height: 50px; }
          .qc-status-pills { width: 100%; }
          .qc-status-pills button { flex: 1; padding: 11px 12px; }
        }

        @media (max-width: 768px) {
          .qc-overlay { padding: 0; }
          .qc-modal {
            width: 100vw; max-width: none;
            height: 100vh; height: 100dvh;
            border-radius: 0;
          }
          .qc-header { padding: 14px 16px; }
          .qc-title { font-size: 1.05rem; }
          .qc-prop { font-size: 0.8rem; }
          .qc-insp { font-size: 0.72rem; }
          .qc-export-label { display: none; }
          .qc-search-bar { padding: 10px 12px; }
          .qc-search { height: 46px; }
          .qc-body { grid-template-columns: 1fr; padding: 12px; gap: 14px; }
          .qc-card { padding: 14px; }
          .qc-toggle { padding: 12px 16px; font-size: 0.95rem; min-width: 60px; }
          .qc-photo-btn { min-height: 54px; font-size: 0.95rem; }
          .qc-photo-btn-primary { flex: 1.5; }
          .qc-photo-grid { grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); }
          .qc-savebar button { width: 100%; }
          .qc-chip { padding: 10px 16px; font-size: 0.95rem; }
          .qc-route-drawer { width: 100vw; max-width: 100vw; }
        }

        @media (max-width: 480px) {
          .qc-view { padding: 10px !important; }
        }
      `}</style>

      <header className="main-header" style={{ marginBottom: '18px', paddingRight: '56px' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, color: '#111827', fontSize: '2rem' }}>Quality Check Reports</h1>
          <p style={{ marginTop: '4px', color: '#6b7280' }}>History and status of house inspections</p>
        </div>
      </header>

      {/* ⭐ Botón de menú: SIEMPRE fijo en la parte superior derecha */}
      <button className="hamburger-btn" onClick={onOpenMenu} aria-label="Open menu" style={{ position: 'fixed', top: '16px', right: '16px', zIndex: 60, background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(15,23,42,0.12)' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      </button>

      {/* ⭐ PESTAÑAS PRINCIPALES: Inspecciones | Route | Reportes */}
      <div style={{ display: 'inline-flex', background: '#f1f5f9', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '4px', gap: '2px', marginBottom: '18px' }}>
        <button
          type="button"
          onClick={() => setMainTab('inspections')}
          style={{ border: 'none', cursor: 'pointer', padding: '10px 22px', borderRadius: '9px', fontWeight: 700, fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', gap: '7px', transition: 'all 0.15s', background: mainTab === 'inspections' ? '#ffffff' : 'transparent', color: mainTab === 'inspections' ? '#1d4ed8' : '#64748b', boxShadow: mainTab === 'inspections' ? '0 1px 2px rgba(15,23,42,0.1)' : 'none' }}
        >
          <ClipboardCheck size={16} /> Inspecciones
        </button>
        <button
          type="button"
          onClick={() => setRouteDrawerOpen(true)}
          title="Abrir la ruta de inspección"
          style={{ border: 'none', cursor: 'pointer', padding: '10px 22px', borderRadius: '9px', fontWeight: 700, fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', gap: '7px', transition: 'all 0.15s', background: 'transparent', color: '#4338ca' }}
        >
          <RouteIcon size={16} /> Route{routeItems.length ? ` (${routeItems.length})` : ''}
        </button>
        <button
          type="button"
          onClick={() => setMainTab('reports')}
          style={{ border: 'none', cursor: 'pointer', padding: '10px 22px', borderRadius: '9px', fontWeight: 700, fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', gap: '7px', transition: 'all 0.15s', background: mainTab === 'reports' ? '#ffffff' : 'transparent', color: mainTab === 'reports' ? '#1d4ed8' : '#64748b', boxShadow: mainTab === 'reports' ? '0 1px 2px rgba(15,23,42,0.1)' : 'none' }}
        >
          <Activity size={16} /> Reportes
        </button>
      </div>

      {mainTab === 'reports' ? (
        <QCReportsDashboard qcList={qcList} tasks={tasks} places={places} />
      ) : (
      <>
      {/* ⭐ Buscador global + pestañas de estado (juntos, ARRIBA del todo) */}
      <div className="qc-toolbar">
        <div className="qc-table-search">
          <Search size={18} color="#9ca3af" />
          <input
            type="text"
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            placeholder="Buscar por estado, fecha, dirección, cliente, equipo..."
          />
          {tableSearch && (
            <button type="button" onClick={() => setTableSearch('')} aria-label="Limpiar búsqueda" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}>
              <X size={16} />
            </button>
          )}
        </div>
        <div className="qc-status-pills">
          <button className={`qc-tab ${statusFilter === 'All' ? 'active' : ''}`} onClick={() => setStatusFilter('All')}>All ({groupCounts.All})</button>
          <button className={`qc-tab ${statusFilter === 'Pending' ? 'active' : ''}`} onClick={() => setStatusFilter('Pending')}>Pending ({groupCounts.Pending})</button>
          <button className={`qc-tab ${statusFilter === 'Finished' ? 'active' : ''}`} onClick={() => setStatusFilter('Finished')}>Finished ({groupCounts.Finished})</button>
          <button className={`qc-tab qc-tab-recall ${statusFilter === 'Recall' ? 'active' : ''}`} onClick={() => setStatusFilter('Recall')}>Recall ({groupCounts.Recall})</button>
        </div>
      </div>

      {/* ⭐ Aviso de conexión / fotos pendientes de subir */}
      {(!isOnline || pendingUploadCount > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', padding: '10px 14px', borderRadius: '12px', background: !isOnline ? '#fffbeb' : '#eff6ff', border: `1px solid ${!isOnline ? '#fcd34d' : '#bfdbfe'}`, color: !isOnline ? '#92400e' : '#1e40af', fontSize: '0.85rem', fontWeight: 600 }}>
          {!isOnline ? <WifiOff size={16} /> : <Loader2 size={16} className="spin-qc" />}
          <span>
            {!isOnline ? 'Sin conexión. ' : ''}
            {pendingUploadCount > 0
              ? `${pendingUploadCount} foto(s) pendiente(s) de subir — se subirán automáticamente al recuperar señal.`
              : 'Reconectando…'}
          </span>
          {pendingUploadCount > 0 && isOnline && (
            <button onClick={() => processQueue()} style={{ marginLeft: 'auto', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>Reintentar ahora</button>
          )}
        </div>
      )}

      {/* ⭐ CASAS PENDIENTES DE QUALITY CHECK (estado "Quality Check" en el pipeline) */}
      {!isLoadingCatalogs && showPendingBlock && filteredPendingHouses.length > 0 && (
        <div style={{ marginBottom: '20px', background: 'linear-gradient(135deg, #eff6ff, #ffffff)', border: '1px solid #bfdbfe', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ClipboardCheck size={19} color="#2563eb" />
            </div>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1e3a8a' }}>Casas pendientes de Quality Check</div>
              <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 500 }}>
                {filteredPendingHouses.length} casa(s) con estado "Quality Check" — Pending de inspección
              </div>
            </div>
          </div>

          <div className="qc-pending-grid">
            {filteredPendingHouses.map(house => {
              const failed = houseFailedQC(house.id);
              return (
                <div key={house.id} onClick={() => onOpenHouseDetail?.(house)} style={{ background: failed ? '#fff5f5' : '#ffffff', border: `1px solid ${failed ? '#fca5a5' : '#e2e8f0'}`, borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: failed ? '0 0 0 2px rgba(239,68,68,0.12)' : 'none', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginBottom: '-4px' }} onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => onOpenHouseDetail?.(house)} title="Editar / ver detalle" style={{ border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: '7px', padding: '5px', cursor: 'pointer', color: '#2563eb', display: 'flex' }}><Edit2 size={15} /></button>
                    <button type="button" onClick={() => handleDeleteHouse(house)} title="Eliminar casa" style={{ border: '1px solid #fecaca', background: '#fef2f2', borderRadius: '7px', padding: '5px', cursor: 'pointer', color: '#dc2626', display: 'flex' }}><Trash2 size={15} /></button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.05rem', lineHeight: 1.25 }}>
                      {getClientName(house.client)}
                    </div>
                    {failed ? (
                      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#ef4444', color: '#fff', padding: '4px 10px', borderRadius: '10px', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        <AlertTriangle size={12} /> Did Not Pass
                      </span>
                    ) : (
                      <span style={{ flexShrink: 0, backgroundColor: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '10px', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Pending
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', color: '#475569' }}>
                      <MapPin size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{house.address || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', color: '#475569' }}>
                      <Users size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
                      <span>{getTeamNameForHouse(house)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openHouseStatusModal(house); }}
                      title="Cambiar status de la casa"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-start', padding: '5px 12px', borderRadius: '999px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#334155', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: houseStatusInfo(house).color, flexShrink: 0 }} />
                      {houseStatusInfo(house).name}
                      <Edit2 size={12} color="#94a3b8" />
                    </button>
                  </div>
                  {/* ⭐ Agregar esta casa a la RUTA de inspección */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); addToRoute(house); }}
                    disabled={isInRoute(house.id)}
                    style={{ height: '40px', borderRadius: '10px', background: isInRoute(house.id) ? '#ecfdf5' : '#eef2ff', border: `1px solid ${isInRoute(house.id) ? '#a7f3d0' : '#c7d2fe'}`, color: isInRoute(house.id) ? '#059669' : '#4338ca', fontWeight: 700, fontSize: '0.85rem', cursor: isInRoute(house.id) ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
                  >
                    {isInRoute(house.id) ? <><Check size={15} /> En ruta</> : <><Plus size={15} /> Agregar a ruta</>}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStartOrContinueQC(house); }}
                    disabled={isLoadingCatalogs}
                    style={{ marginTop: '2px', height: '46px', borderRadius: '11px', background: failed ? '#ef4444' : '#3b82f6', border: 'none', color: '#fff', fontWeight: 600, fontSize: '0.92rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <ClipboardCheck size={17} /> {failed ? 'Revisar / Corregir QC' : 'Iniciar inspección'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mensaje cuando la pestaña Pending no tiene casas pendientes */}
      {!isLoadingCatalogs && statusFilter === 'Pending' && filteredPendingHouses.length === 0 && (
        <div style={{ textAlign: 'center', color: '#6b7280', fontStyle: 'italic', padding: '30px', background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          No hay casas pendientes de Quality Check.
        </div>
      )}

      {/* ⭐ CASAS EN RECALL (estado "Recall" en el pipeline) — se muestran en la pestaña Recall/All */}
      {!isLoadingCatalogs && showRecallBlock && filteredRecallHouses.length > 0 && (
        <div style={{ marginBottom: '20px', background: 'linear-gradient(135deg, #f5f3ff, #ffffff)', border: '1px solid #ddd6fe', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Repeat size={19} color="#7c3aed" />
            </div>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#6d28d9' }}>Casas en Recall</div>
              <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 500 }}>
                {filteredRecallHouses.length} casa(s) con estado "Recall" — para re-limpieza y re-inspección
              </div>
            </div>
          </div>

          <div className="qc-pending-grid">
            {filteredRecallHouses.map(house => (
              <div key={house.id} onClick={() => onOpenHouseDetail?.(house)} style={{ background: '#fdfcff', border: '1px solid #ddd6fe', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginBottom: '-4px' }} onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => onOpenHouseDetail?.(house)} title="Editar / ver detalle" style={{ border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: '7px', padding: '5px', cursor: 'pointer', color: '#2563eb', display: 'flex' }}><Edit2 size={15} /></button>
                  <button type="button" onClick={() => handleDeleteHouse(house)} title="Eliminar casa" style={{ border: '1px solid #fecaca', background: '#fef2f2', borderRadius: '7px', padding: '5px', cursor: 'pointer', color: '#dc2626', display: 'flex' }}><Trash2 size={15} /></button>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.05rem', lineHeight: 1.25 }}>
                    {getClientName(house.client)}
                  </div>
                  <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#7c3aed', color: '#fff', padding: '4px 10px', borderRadius: '10px', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <Repeat size={12} /> Recall
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', color: '#475569' }}>
                    <MapPin size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{house.address || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', color: '#475569' }}>
                    <Users size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
                    <span>{getTeamNameForHouse(house)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openHouseStatusModal(house); }}
                    title="Cambiar status de la casa"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-start', padding: '5px 12px', borderRadius: '999px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#334155', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: houseStatusInfo(house).color, flexShrink: 0 }} />
                    {houseStatusInfo(house).name}
                    <Edit2 size={12} color="#94a3b8" />
                  </button>
                </div>
                {/* ⭐ Agregar esta casa a la RUTA */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); addToRoute(house); }}
                  disabled={isInRoute(house.id)}
                  style={{ height: '40px', borderRadius: '10px', background: isInRoute(house.id) ? '#ecfdf5' : '#eef2ff', border: `1px solid ${isInRoute(house.id) ? '#a7f3d0' : '#c7d2fe'}`, color: isInRoute(house.id) ? '#059669' : '#4338ca', fontWeight: 700, fontSize: '0.85rem', cursor: isInRoute(house.id) ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
                >
                  {isInRoute(house.id) ? <><Check size={15} /> En ruta</> : <><Plus size={15} /> Agregar a ruta</>}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleStartOrContinueQC(house); }}
                  disabled={isLoadingCatalogs}
                  style={{ height: '46px', borderRadius: '11px', background: '#7c3aed', border: 'none', color: '#fff', fontWeight: 600, fontSize: '0.92rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <ClipboardCheck size={17} /> Re-inspeccionar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== TABLA DE REGISTROS (escritorio) — Finished + Recall ===== */}
      {showRecordsTable && (
        <div className="qc-table-wrap" style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
              <thead>
                <tr>
                  <th style={s.th}>Estado</th>
                  <th style={s.th}>Fecha</th>
                  <th style={s.th}>Cliente y dirección</th>
                  <th style={s.th}>Equipo</th>
                  <th style={s.th}>Inspector</th>
                  <th style={s.th}>Duración</th>
                  <th style={s.th}>Notas</th>
                  <th style={{ ...s.th, textAlign: 'right' as const }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredQcList.length === 0 ? (
                  <tr>
                    <td style={{ ...s.td, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', padding: '30px' }} colSpan={8}>
                      No hay registros de Quality Check para mostrar.
                    </td>
                  </tr>
                ) : filteredQcList.map(qc => {
                  const cat = qcCategory(qc);
                  const badge = cat === 'Recall'
                    ? { bg: '#f3e8ff', fg: '#7c3aed', label: 'Recall' }
                    : { bg: '#dcfce7', fg: '#166534', label: 'Finished' };
                  const notes = collectNotesForCard(qc);
                  return (
                    <tr key={qc.id}>
                      <td style={s.td}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: badge.bg, color: badge.fg, padding: '4px 10px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          {cat === 'Recall' ? <Repeat size={12} /> : <Check size={12} />} {badge.label}
                        </span>
                      </td>
                      <td style={s.td}>{formatDate(qc.date)}</td>
                      <td style={s.td}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{getClientName(qc.client)}</div>
                        <div style={{ fontSize: '0.82rem', color: '#64748b' }}>{qc.address || '—'}</div>
                      </td>
                      <td style={s.td}>{qc.team || getTeamNameForHouse(properties.find(p => p.id === qc.houseId))}</td>
                      <td style={s.td}>{qc.inspector || 'Unknown'}</td>
                      <td style={s.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#475569' }}>
                          <Clock size={14} color="#94a3b8" /> {fmtDuration(recordDuration(qc))}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{fmtTime(qc.checkInAt)} – {fmtTime(qc.checkOutAt)}</div>
                      </td>
                      <td style={{ ...s.td, maxWidth: '260px' }}>
                        {notes.length === 0 ? (
                          <span style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>—</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {notes.slice(0, 3).map((n, i) => (
                              <div key={i} style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.3 }}>
                                <span style={{ fontWeight: 700, color: '#334155' }}>{n.area}:</span>{' '}
                                {n.notes && <span>{n.notes}</span>}
                                {n.damage && <span style={{ color: '#b91c1c' }}>{n.notes ? ' · ' : ''}⚠ {n.damage}</span>}
                              </div>
                            ))}
                            {notes.length > 3 && <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>+{notes.length - 3} área(s) más…</div>}
                          </div>
                        )}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right' as const, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button onClick={() => handleExportFromTable(qc)} title="Exportar PDF" disabled={exportingForQcId === qc.id} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', borderRadius: '8px', width: '34px', height: '34px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            {exportingForQcId === qc.id ? <Loader2 size={16} className="spin-qc" /> : <Printer size={16} />}
                          </button>
                          <button onClick={() => openEmailForQC(qc)} title="Enviar por email" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', borderRadius: '8px', width: '34px', height: '34px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <Mail size={16} />
                          </button>
                          <button onClick={() => handleEditQC(qc)} title="Editar" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', borderRadius: '8px', width: '34px', height: '34px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => qc.id && handleDeleteQC(qc.id)} title="Eliminar" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '8px', width: '34px', height: '34px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== TARJETAS DE REGISTROS (móvil) — Finished + Recall ===== */}
      {showRecordsTable && (
        <div className="qc-cards-wrap" style={{ flexDirection: 'column', gap: '12px' }}>
          {filteredQcList.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', padding: '24px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
              No hay registros de Quality Check para mostrar.
            </div>
          ) : filteredQcList.map(qc => {
            const cat = qcCategory(qc);
            const badge = cat === 'Recall'
              ? { bg: '#f3e8ff', fg: '#7c3aed', label: 'Recall' }
              : { bg: '#dcfce7', fg: '#166534', label: 'Finished' };
            const notes = collectNotesForCard(qc);
            return (
              <div key={qc.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>{getClientName(qc.client)}</div>
                    <div style={{ fontSize: '0.82rem', color: '#64748b' }}>{qc.address || '—'}</div>
                  </div>
                  <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '5px', background: badge.bg, color: badge.fg, padding: '4px 10px', borderRadius: '10px', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase' }}>
                    {cat === 'Recall' ? <Repeat size={11} /> : <Check size={11} />} {badge.label}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '0.82rem', color: '#475569' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CalendarDays size={14} color="#94a3b8" /> {formatDate(qc.date)}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Users size={14} color="#94a3b8" /> {qc.team || getTeamNameForHouse(properties.find(p => p.id === qc.houseId))}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><User size={14} color="#94a3b8" /> {qc.inspector || 'Unknown'}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Clock size={14} color="#94a3b8" /> {fmtDuration(recordDuration(qc))}</span>
                </div>
                {notes.length > 0 && (
                  <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: '9px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <StickyNote size={13} color="#94a3b8" /> Notas
                    </div>
                    {notes.map((n, i) => (
                      <div key={i} style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.35 }}>
                        <span style={{ fontWeight: 700, color: '#334155' }}>{n.area}:</span>{' '}
                        {n.notes && <span>{n.notes}</span>}
                        {n.damage && <span style={{ color: '#b91c1c' }}>{n.notes ? ' · ' : ''}⚠ {n.damage}</span>}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => handleExportFromTable(qc)} disabled={exportingForQcId === qc.id} style={{ flex: 1, minHeight: '42px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', borderRadius: '9px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    {exportingForQcId === qc.id ? <Loader2 size={15} className="spin-qc" /> : <Printer size={15} />} PDF
                  </button>
                  <button onClick={() => openEmailForQC(qc)} style={{ flex: 1, minHeight: '42px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', borderRadius: '9px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Mail size={15} /> Email
                  </button>
                  <button onClick={() => handleEditQC(qc)} style={{ flex: 1, minHeight: '42px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', borderRadius: '9px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Edit2 size={15} /> Editar
                  </button>
                  <button onClick={() => qc.id && handleDeleteQC(qc.id)} style={{ minHeight: '42px', width: '46px', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '9px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      </>
      )}

      {/* ═══════════ MODAL DE INSPECCIÓN (Quality Check) ═══════════ */}
      {isFormModalOpen && selectedHouse && (
        <div className="qc-overlay" onClick={handleCloseForm}>
          <div className="qc-modal" onClick={e => e.stopPropagation()}>
            <div className="qc-header">
              <div style={{ minWidth: 0 }}>
                <h2 className="qc-title"><ClipboardCheck size={20} /> {editingQcId ? 'Editar' : 'Nuevo'} Quality Check</h2>
                <p className="qc-prop">{getClientName(selectedHouse.client)} · {selectedHouse.address || '—'}</p>
                <p className="qc-insp">
                  <User size={13} /> {currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown'}
                  {checkInAt && <> · <Clock size={13} /> Entrada {fmtTime(checkInAt)}</>}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <button onClick={handleExportFromModal} title="Exportar PDF" disabled={isExportingPDF} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.35)', color: '#fff', borderRadius: '9px', padding: '8px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.82rem' }}>
                  {isExportingPDF ? <Loader2 size={16} className="spin-qc" /> : <Printer size={16} />}<span className="qc-export-label">PDF</span>
                </button>
                <button onClick={openEmailForCurrent} title="Enviar por email" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.35)', color: '#fff', borderRadius: '9px', padding: '8px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.82rem' }}>
                  <Mail size={16} /><span className="qc-export-label">Email</span>
                </button>
                <button onClick={handleCloseForm} style={s.closeBtn} aria-label="Cerrar"><X size={22} /></button>
              </div>
            </div>

            <div className="qc-search-bar">
              <div className="qc-search">
                <Search size={18} color="#94a3b8" />
                <input type="text" value={placeSearch} onChange={e => setPlaceSearch(e.target.value)} placeholder="Buscar área para inspeccionar..." />
                {placeSearch && <button onClick={() => setPlaceSearch('')} aria-label="Limpiar"><X size={16} /></button>}
              </div>
            </div>

            <div className="qc-body">
              {/* Selector de áreas (chips) */}
              <div className="qc-picker">
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
                  Áreas a inspeccionar ({selectedPlaceIds.length} seleccionada(s))
                </div>
                {searchablePlaces.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>No hay áreas con tareas configuradas.</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {searchablePlaces.map(p => {
                      const sel = selectedPlaceIds.includes(p.id);
                      return (
                        <button key={p.id} className="qc-chip" onClick={() => togglePlaceSelection(p.id)}
                          style={{ background: sel ? '#3b82f6' : '#fff', color: sel ? '#fff' : '#334155', border: `1px solid ${sel ? '#3b82f6' : '#e1e4e8'}` }}>
                          {sel ? <Check size={14} /> : <Plus size={14} />} {p.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tarjetas por área seleccionada */}
              {selectedRenderPlaces.map(p => {
                const placeTasks = tasks.filter(t => t.placeId === p.id);
                const data = qcData[p.id] || { tasks: {}, notes: '', damage: '', score: null, photos: [] };
                const savedPhotos: string[] = data.photos || [];
                const pending = pendingPhotos[p.id] || [];
                const queued = queuedByPlace[p.id] || [];
                return (
                  <div key={p.id} className="qc-card">
                    <h3 style={s.cardTitle}>{p.name}</h3>

                    {placeTasks.map(t => {
                      const val = data.tasks?.[t.id];
                      return (
                        <div key={t.id} style={s.taskItem}>
                          <span style={{ fontSize: '0.92rem', color: '#111827' }}>{t.name}</span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="qc-toggle" style={s.btnYes(val === 'Yes')} onClick={() => setTaskValue(p.id, t.id, 'Yes')}>Yes</button>
                            <button className="qc-toggle" style={s.btnNo(val === 'No')} onClick={() => setTaskValue(p.id, t.id, 'No')}>No</button>
                          </div>
                        </div>
                      );
                    })}

                    <div style={s.extraFields}>
                      <label style={s.labelQC}>Score (calidad general)</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {[1, 2, 3].map(n => (
                          <button key={n} className="qc-toggle" style={s.btnScore(data.score === n)} onClick={() => setScoreValue(p.id, n)}>{n}</button>
                        ))}
                      </div>

                      <label style={s.labelQC}>Notas</label>
                      <textarea style={s.textareaQC} value={data.notes || ''} onChange={e => handleTextChange(p.id, 'notes', e.target.value)} placeholder="Observaciones del área..." />

                      <label style={s.labelQC}>Daños</label>
                      <textarea style={s.textareaQC} value={data.damage || ''} onChange={e => handleTextChange(p.id, 'damage', e.target.value)} placeholder="Daños encontrados (si aplica)..." />
                    </div>

                    {/* Fotos */}
                    <div style={{ marginTop: '14px' }}>
                      <div className="qc-photo-actions">
                        <button className="qc-photo-btn qc-photo-btn-primary" onClick={() => openBurstCamera(p)}>
                          <Camera size={16} /> Cámara
                        </button>
                        <button className="qc-photo-btn" onClick={() => cameraInputRefs.current[p.id]?.click()}>
                          <ImageIcon size={16} /> Tomar foto
                        </button>
                        <button className="qc-photo-btn" onClick={() => fileInputRefs.current[p.id]?.click()}>
                          <Upload size={16} /> Galería
                        </button>
                      </div>
                      <input ref={el => { cameraInputRefs.current[p.id] = el; }} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { handlePhotoUpload(p.id, p.name, e.target.files); e.target.value = ''; }} />
                      <input ref={el => { fileInputRefs.current[p.id] = el; }} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { handlePhotoUpload(p.id, p.name, e.target.files); e.target.value = ''; }} />

                      {(savedPhotos.length > 0 || pending.length > 0 || queued.length > 0) && (
                        <div className="qc-photo-grid">
                          {savedPhotos.map((url, idx) => (
                            <div key={`s-${idx}`} style={{ position: 'relative', aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e1e4e8' }}>
                              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              {/* ⭐ Editar / dibujar sobre la foto (estilo WhatsApp) */}
                              <button onClick={() => setAnnotate({ placeId: p.id, index: idx, url })} title="Dibujar en la foto" style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(37,99,235,0.92)', color: '#fff', border: 'none', borderRadius: '7px', width: '24px', height: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => handleRemovePhoto(p.id, idx)} style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(220,38,38,0.9)', color: '#fff', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={13} />
                              </button>
                            </div>
                          ))}
                          {pending.map(pp => (
                            <div key={`p-${pp.id}`} style={{ position: 'relative', aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e1e4e8', opacity: 0.7 }}>
                              <img src={pp.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)' }}>
                                <Loader2 size={20} color="#fff" className="spin-qc" />
                              </div>
                            </div>
                          ))}
                          {queued.map(qp => (
                            <div key={`q-${qp.id}`} style={{ position: 'relative', aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', border: '1px solid #fcd34d' }}>
                              <img src={qp.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              <div style={{ position: 'absolute', bottom: '4px', left: '4px', background: 'rgba(180,83,9,0.9)', color: '#fff', borderRadius: '6px', padding: '2px 6px', fontSize: '0.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <WifiOff size={10} /> En cola
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {selectedRenderPlaces.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', padding: '30px' }}>
                  Selecciona al menos un área arriba para comenzar la inspección.
                </div>
              )}
            </div>

            <div className="qc-savebar">
              <button style={s.btnSaveQC} disabled={isSaving} onClick={() => handleSaveQC(false)}>
                {isSaving ? <Loader2 size={18} className="spin-qc" /> : <Save size={18} />} Guardar Todo
              </button>
              <button style={s.btnFailQC} disabled={isSaving} onClick={() => handleSaveQC(true)}>
                <AlertTriangle size={18} /> DID NOT PASS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ CÁMARA EN RÁFAGA ═══════════ */}
      {cameraOpen && (
        <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 1200, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
            <div style={{ fontWeight: 700 }}>{cameraPlace?.name || 'Cámara'}</div>
            <button onClick={closeBurstCamera} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <X size={18} /> Cerrar
            </button>
          </div>
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {cameraError ? (
              <div style={{ color: '#fca5a5', textAlign: 'center', padding: '24px', maxWidth: '440px' }}>{cameraError}</div>
            ) : (
              <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
            {cameraShots.length > 0 && (
              <div style={{ position: 'absolute', bottom: '12px', left: '12px', right: '12px', display: 'flex', gap: '8px', overflowX: 'auto' }}>
                {cameraShots.map(sh => (
                  <img key={sh.id} src={sh.preview} alt="" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #fff', flexShrink: 0 }} />
                ))}
              </div>
            )}
          </div>
          {!cameraError && (
            <div style={{ padding: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', background: 'rgba(0,0,0,0.6)' }}>
              <span style={{ color: '#fff', fontSize: '0.85rem' }}>{cameraShots.length} foto(s)</span>
              <button onClick={captureBurst} disabled={capturing} style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#fff', border: '4px solid #3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {capturing ? <Loader2 size={26} className="spin-qc" color="#3b82f6" /> : <Camera size={28} color="#3b82f6" />}
              </button>
              <button onClick={closeBurstCamera} style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: '10px', padding: '12px 18px', fontWeight: 700, cursor: 'pointer' }}>Listo</button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ MODAL: CAMBIAR STATUS DE LA CASA ═══════════ */}
      {statusModalHouse && (
        <div className="qc-overlay" onClick={() => setStatusModalHouse(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', width: 'min(460px, 92vw)', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
            <div style={{ background: '#3b82f6', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Cambiar status</h3>
              <button onClick={() => setStatusModalHouse(null)} style={s.closeBtn}><X size={20} /></button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>{getClientName(statusModalHouse.client)}</div>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '16px' }}>{statusModalHouse.address || '—'}</div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Nuevo status</label>
              <select value={statusModalSelected} onChange={e => setStatusModalSelected(e.target.value)} style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.95rem', background: '#fff', color: '#111827' }}>
                <option value="">— Selecciona —</option>
                {statuses.map((st: any) => (
                  <option key={st.id} value={st.id}>{st.name}</option>
                ))}
              </select>
            </div>
            <div style={{ padding: '0 20px 20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setStatusModalHouse(null)} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={applyHouseStatusChange} disabled={savingStatus || !statusModalSelected} style={{ padding: '10px 18px', borderRadius: '10px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                {savingStatus ? <Loader2 size={16} className="spin-qc" /> : <Save size={16} />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ MODAL: EMAIL ═══════════ */}
      {emailModalOpen && emailCtx && (
        <div className="qc-overlay" onClick={() => setEmailModalOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', width: 'min(520px, 92vw)', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
            <div style={{ background: '#16a34a', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}><Mail size={18} /> Enviar reporte</h3>
              <button onClick={() => setEmailModalOpen(false)} style={s.closeBtn}><X size={20} /></button>
            </div>
            <div style={{ padding: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Para</label>
              <input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.95rem', boxSizing: 'border-box', marginBottom: '14px' }} />
              <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '6px' }}><strong>Asunto:</strong> {emailCtx.subject}</div>
              <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: '10px', padding: '12px', fontSize: '0.82rem', color: '#475569', whiteSpace: 'pre-wrap', maxHeight: '180px', overflowY: 'auto' }}>{emailCtx.body}</div>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '10px' }}>Se abrirá el PDF para guardar/adjuntar y luego tu cliente de correo.</p>
            </div>
            <div style={{ padding: '0 20px 20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setEmailModalOpen(false)} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={sendEmail} style={{ padding: '10px 18px', borderRadius: '10px', border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                <Mail size={16} /> Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ MODAL: CONFIGURACIÓN DE EMPRESA (latente, sin botón de acceso) ═══════════ */}
      {companyModalOpen && (
        <div className="qc-overlay" onClick={() => setCompanyModalOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', width: 'min(520px, 92vw)', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
            <div style={{ background: '#3b82f6', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}><Building2 size={18} /> Empresa</h3>
              <button onClick={() => setCompanyModalOpen(false)} style={s.closeBtn}><X size={20} /></button>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Nombre</label>
                <input type="text" value={companyDraft.name} onChange={e => setCompanyDraft(prev => ({ ...prev, name: e.target.value }))} style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Dirección</label>
                <input type="text" value={companyDraft.address} onChange={e => setCompanyDraft(prev => ({ ...prev, address: e.target.value }))} style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Email destino</label>
                <input type="email" value={companyDraft.email} onChange={e => setCompanyDraft(prev => ({ ...prev, email: e.target.value }))} style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input id="qc-autosend" type="checkbox" checked={companyDraft.autoSend} onChange={e => setCompanyDraft(prev => ({ ...prev, autoSend: e.target.checked }))} />
                <label htmlFor="qc-autosend" style={{ fontSize: '0.88rem', color: '#334155' }}>Enviar reporte automáticamente al guardar</label>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Logo</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {companyDraft.logo && <img src={companyDraft.logo} alt="logo" style={{ width: '48px', height: '48px', borderRadius: '10px', objectFit: 'contain', border: '1px solid #e2e8f0' }} />}
                  <input ref={companyLogoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleCompanyLogoUpload(e.target.files?.[0])} />
                  <button onClick={() => companyLogoInputRef.current?.click()} style={{ padding: '9px 14px', borderRadius: '9px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Upload size={15} /> Subir logo
                  </button>
                </div>
              </div>
            </div>
            <div style={{ padding: '0 20px 20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setCompanyModalOpen(false)} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={saveCompanySettings} disabled={savingCompany} style={{ padding: '10px 18px', borderRadius: '10px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                {savingCompany ? <Loader2 size={16} className="spin-qc" /> : <Save size={16} />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ VISTA LATERAL: RUTA DE INSPECCIÓN + PLANIFICADOR + MAPA ═══════════ */}
      {routeDrawerOpen && (
        <div className="qc-route-overlay" onClick={closeRouteDrawer}>
          <aside className="qc-route-drawer" onClick={e => e.stopPropagation()}>
            <div style={{ background: '#4338ca', color: '#fff', padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RouteIcon size={19} /> Ruta de inspección
                {routeItems.length > 0 && <span style={{ background: 'rgba(255,255,255,0.22)', borderRadius: '999px', padding: '2px 10px', fontSize: '0.78rem' }}>{routeItems.length}</span>}
              </h3>
              <button onClick={closeRouteDrawer} style={s.closeBtn} aria-label="Cerrar"><X size={22} /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

              {/* ⭐ PLANIFICADOR: botón + mapa + resumen de tiempo */}
              {routeItems.length > 0 && (
                <>
                  <button
                    onClick={optimizeRoute}
                    disabled={routePlanning}
                    style={{ height: '46px', borderRadius: '11px', border: 'none', background: '#4338ca', color: '#fff', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    {routePlanning ? <><Loader2 size={18} className="spin-qc" /> Calculando ruta…</> : <><Navigation size={18} /> {routePlan ? 'Recalcular ruta' : 'Planificar ruta desde mi ubicación'}</>}
                  </button>

                  {routePlanError && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: '10px', padding: '10px 12px', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertTriangle size={15} /> {routePlanError}
                    </div>
                  )}

                  {/* Mapa (se dibuja al planificar) */}
                  <div className="qc-route-map" ref={mapElRef} style={{ display: routePlan ? 'block' : 'none' }} />

                  {/* Resumen de tiempo/distancia */}
                  {routePlan && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                      <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase' }}>Total</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#3730a3', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}><Timer size={15} /> {fmtMinutes(routePlan.totalMin)}</div>
                      </div>
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Manejo</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a' }}>{fmtMinutes(routePlan.totalDriveMin)}</div>
                        <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>{routePlan.totalDistanceKm.toFixed(1)} km</div>
                      </div>
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Inspección</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a' }}>{fmtMinutes(routePlan.totalStopMin)}</div>
                        <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>{INSPECTION_MIN_PER_STOP}m × casa</div>
                      </div>
                    </div>
                  )}

                  <div style={{ height: '1px', background: '#eef2f7', margin: '2px 0' }} />
                </>
              )}

              {/* Lista ordenada de paradas */}
              {routeItems.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 16px' }}>
                  <RouteIcon size={40} color="#c7d2fe" style={{ marginBottom: '12px' }} />
                  <div style={{ fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>Ruta vacía</div>
                  <div style={{ fontSize: '0.85rem' }}>Agrega casas con el botón "Agregar a ruta" en las tarjetas.</div>
                </div>
              ) : routeItems.map((item, idx) => (
                <div key={item.houseId} className="qc-route-item">
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#eef2ff', color: '#4338ca', fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.92rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.client}</div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <MapPin size={12} color="#94a3b8" /> <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.address || '—'}</span>
                    </div>
                    {item.team && <div style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}><Users size={11} /> {item.team}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                    <button onClick={() => moveRouteItem(idx, -1)} disabled={idx === 0} style={{ ...s.routeIconBtn, opacity: idx === 0 ? 0.4 : 1 }} title="Subir"><ArrowUp size={14} /></button>
                    <button onClick={() => moveRouteItem(idx, 1)} disabled={idx === routeItems.length - 1} style={{ ...s.routeIconBtn, opacity: idx === routeItems.length - 1 ? 0.4 : 1 }} title="Bajar"><ArrowDown size={14} /></button>
                  </div>
                  <button onClick={() => removeFromRoute(item.houseId)} style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }} title="Quitar de la ruta"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>

            {routeItems.length > 0 && (
              <div style={{ padding: '14px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px', flexShrink: 0 }}>
                <button onClick={clearRoute} style={{ flex: 1, padding: '11px', borderRadius: '10px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
                  <Trash2 size={16} /> Vaciar ruta
                </button>
                <button onClick={closeRouteDrawer} style={{ flex: 1, padding: '11px', borderRadius: '10px', border: 'none', background: '#4338ca', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  Cerrar
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* ═══════════ EDITOR DE FOTO (dibujar estilo WhatsApp) ═══════════ */}
      {annotate && (
        <PhotoAnnotator
          imageUrl={annotate.url}
          saving={savingAnnotation}
          onCancel={() => setAnnotate(null)}
          onSave={handleSaveAnnotation}
        />
      )}

    </div>
  );
}