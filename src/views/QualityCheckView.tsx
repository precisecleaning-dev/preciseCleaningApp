import { useState, useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import {
  ClipboardCheck, X, Camera, MapPin, CalendarDays, User, Users, Edit2, Trash2,
  Upload, Printer, Loader2, Image as ImageIcon, Search, Check, Mail, AlertTriangle, Repeat,
  Save, Clock, WifiOff, Plus, StickyNote,
  Pencil, Undo2, Eraser, Circle as CircleShape, MoveUpRight, Menu, Route
} from 'lucide-react';
import type { Property, SystemUser, Place, Task, Status, Team, Customer } from '../types/index';
import { getRelationName } from '../utils/relations';
import { settingsService } from '../services/settingsService';
import { storageService } from '../services/storageService';
import { propertiesService } from '../services/propertiesService';
import { compressImage } from '../utils/imageCompression';
import { statusHistoryService } from '../services/statusHistoryService';
import { db } from '../config/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { isQualityCheckStatus, latestQCForHouse, housePassedQC, houseFailedQC } from '../utils/qcStatus';
import { isRecallText } from '../utils/recallStatus';
import { escapeHtml } from '../utils/escapeHtml';
import QCRouteDrawer, { type RouteDrawerHouse } from './QCRouteDrawer';
import './QualityCheckView.css';

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
  onOpenHouseEdit?: (house: Property) => void;   // ⭐ abre el FORMULARIO de edición en HousesView
}

// Genera un id único para previews locales (con fallback si crypto.randomUUID no existe)
const uid = () =>
  (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
    ? (crypto as any).randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

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

  return (
    <div className="qcv-pa-root">
      {/* Barra de herramientas */}
      <div className="qcv-pa-toolbar">
        <button className={`qcv-pa-tool-btn${tool === 'pen' ? ' active' : ''}`} onClick={() => setTool('pen')}><Pencil size={16} /> Lápiz</button>
        <button className={`qcv-pa-tool-btn${tool === 'circle' ? ' active' : ''}`} onClick={() => setTool('circle')}><CircleShape size={16} /> Círculo</button>
        <button className={`qcv-pa-tool-btn${tool === 'arrow' ? ' active' : ''}`} onClick={() => setTool('arrow')}><MoveUpRight size={16} /> Flecha</button>
        <div className="qcv-pa-color-group">
          {colors.map(col => (
            <button key={col} onClick={() => setColor(col)} aria-label={col}
              className={`qcv-pa-color-swatch${color === col ? ' selected' : ''}`} style={{ '--swatch-color': col } as CSSProperties} />
          ))}
        </div>
        <div className="qcv-pa-toolbar-actions">
          <button className="qcv-pa-tool-btn" onClick={undo}><Undo2 size={16} /> Deshacer</button>
          <button className="qcv-pa-tool-btn" onClick={clearAll}><Eraser size={16} /> Limpiar</button>
        </div>
      </div>

      {/* Lienzo */}
      <div className="qcv-pa-canvas-wrap">
        {loadError ? (
          <div className="qcv-pa-error">{loadError}</div>
        ) : !ready ? (
          <div className="qcv-pa-loading"><Loader2 size={20} className="spin-qc" /> Cargando imagen…</div>
        ) : (
          <canvas
            ref={canvasRef}
            className="qcv-pa-canvas"
            onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={endDraw} onMouseLeave={endDraw}
            onTouchStart={startDraw} onTouchMove={moveDraw} onTouchEnd={endDraw}
          />
        )}
      </div>

      {/* Acciones */}
      <div className="qcv-pa-actions">
        <button onClick={onCancel} disabled={saving} className="qcv-pa-cancel-btn">Cancelar</button>
        <button onClick={save} disabled={saving || !ready} className="qcv-pa-save-btn">
          {saving ? <Loader2 size={18} className="spin-qc" /> : <Check size={18} />} Guardar
        </button>
      </div>
    </div>
  );
}


export default function QualityCheckView({ onOpenMenu, properties, houseToInspect, clearHouseToInspect, currentUser, onOpenHouseDetail, onOpenHouseEdit }: QualityCheckViewProps) {
  const [qcList, setQcList] = useState<QCRecord[]>([]);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState<Property | null>(null);
  const [editingQcId, setEditingQcId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Finished' | 'Recall'>('All');
  const [tableSearch, setTableSearch] = useState('');

  // ⭐ Ruta de inspección (drawer lateral): ids de casas agregadas + apertura del panel
  const [routeHouseIds, setRouteHouseIds] = useState<string[]>([]);
  const [routeDrawerOpen, setRouteDrawerOpen] = useState(false);

  // ⭐ EDITOR de foto (anotación estilo WhatsApp)
  const [annotate, setAnnotate] = useState<null | { placeId: string; index: number; url: string }>(null);
  const [savingAnnotation, setSavingAnnotation] = useState(false);

  const [places, setPlaces] = useState<Place[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  // ⭐ Catálogo de estados para detectar las casas en "Quality Check"
  const [statuses, setStatuses] = useState<Status[]>([]);
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

  // ⭐ Refs dinámicas para inputs file y camera (uno por cada place)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const cameraInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [qcData, setQcData] = useState<Record<string, any>>({});

  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoadingCatalogs(true);
      try {
        const [placesData, tasksData, teamsData, statusesData, customersSnap, qcSnap, companySnap] = await Promise.all([
          settingsService.getAll('settings_places').catch(() => []),
          settingsService.getAll('settings_tasks').catch(() => []),
          settingsService.getAll('settings_teams').catch(() => []),
          settingsService.getAll('settings_statuses').catch(() => []),
          getDocs(collection(db, 'customers')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'quality_checks')).catch(() => ({ docs: [] })),
          getDoc(doc(db, 'settings_company', 'main')).catch(() => null),
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

        const sortedPlaces = (placesData as Place[]).sort((a, b) => a.name.localeCompare(b.name));
        const sortedTasks = (tasksData as Task[]).sort((a, b) => a.name.localeCompare(b.name));

        setPlaces(sortedPlaces);
        setTasks(sortedTasks);
        setTeams(teamsData as Team[]);
        setStatuses(statusesData as Status[]);
        setCustomersList(((customersSnap as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() } as Customer)));

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
    return getRelationName(teams, house.teamId, 'Unassigned');
  };

  // ⭐ Resuelve el nombre del cliente desde la colección customers (id o nombre)
  const getClientName = (clientIdOrName?: string | null): string =>
    getRelationName(customersList, clientIdOrName, String(clientIdOrName || 'Unknown'));

  // ⭐ Ruta de inspección — agregar/quitar casas del drawer lateral
  const isHouseInRoute = (houseId: string): boolean => routeHouseIds.includes(houseId);
  const toggleRouteHouse = (house: Property) => {
    setRouteHouseIds(prev => prev.includes(house.id) ? prev.filter(id => id !== house.id) : [...prev, house.id]);
  };

  // ⭐ Coordenadas pre-guardadas si la casa las trae (campos aún no declarados en Property).
  //    Espejo de `preCoords` en QCRouteView.tsx — candidato a unificar en utils/routing.ts.
  type PropertyGeo = Property & {
    lat?: number; lng?: number; latitude?: number; longitude?: number;
    coords?: { lat?: number; lng?: number }; location?: { lat?: number; lng?: number };
  };
  const houseCoords = (h: Property): { lat: number | null; lng: number | null } => {
    const g = h as PropertyGeo;
    const lat = g.lat ?? g.latitude ?? g.coords?.lat ?? g.location?.lat;
    const lng = g.lng ?? g.longitude ?? g.coords?.lng ?? g.location?.lng;
    return (typeof lat === 'number' && typeof lng === 'number') ? { lat, lng } : { lat: null, lng: null };
  };

  // ⭐ Nota general de la casa — misma fuente que la tarjeta del Pipeline
  //    (PipelineBoardView.tsx): `note` de la app o `generalNotes` importado de AppSheet.
  //    Tipo extendido local porque `generalNotes` aún no está declarado en Property.
  type PropertyNotes = Property & { note?: string | null; generalNotes?: string | null };
  const houseNote = (h: Property): string => {
    const g = h as PropertyNotes;
    return String(g.note || g.generalNotes || '').trim();
  };

  // ⭐ Casas de la ruta con el nombre de cliente ya resuelto (entrada del drawer).
  //    Memoizado para que el drawer no re-sincronice/geocodifique en cada render del padre.
  const routeDrawerHouses = useMemo<RouteDrawerHouse[]>(() =>
    routeHouseIds
      .map(id => properties.find(p => p.id === id))
      .filter((h): h is Property => Boolean(h))
      .map(h => ({ id: h.id, client: getClientName(h.client), address: h.address || '', ...houseCoords(h) })),
    // getClientName/houseCoords se recrean por render pero solo dependen de customersList/properties.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routeHouseIds, properties, customersList]);

  // ⭐ Id del estado "Quality Check" (para regresar una casa cuando NO pasó)
  const getQualityCheckStatusId = (): string | null => {
    const st = statuses.find((s: any) => {
      const n = String(s.name || '').toLowerCase().trim();
      return n === 'qc' || n.includes('quality check') || n.includes('quality-check');
    });
    return st ? st.id : null;
  };

  // ⭐ Id del estado "Recall" (cuando un QC NO pasa, la casa pasa a Recall)
  const getRecallStatusId = (): string | null => {
    const st = statuses.find((s: any) => isRecallText(s.name));
    return st ? st.id : null;
  };

  // ⭐ Determina si una casa tiene estado "Recall" (resuelve id o nombre del status)
  const isRecallStatus = (house: Property): boolean => {
    const sid = (house as any).statusId;
    const st = statuses.find((s: any) => String(s.id) === String(sid) || String(s.name) === String(sid));
    return isRecallText(st?.name || sid);
  };

  // ⭐ Resuelve el nombre de un status a partir de id o nombre
  const resolveStatusName = (idOrName?: string | null): string => {
    if (!idOrName) return '';
    return getRelationName(statuses, idOrName, String(idOrName));
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
  const pendingQCHouses = properties.filter(h => isQualityCheckStatus(h.statusId, statuses) && !housePassedQC(h.id, qcList) && !houseFailedQC(h.id, qcList));

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
    const existing = latestQCForHouse(house.id, qcList);
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

  // ⭐ Datos de marca para el PDF y el correo (con respaldo a valores por defecto).
  //    name/address/logo se escapan acá porque terminan en HTML crudo (ventana de
  //    impresión y/o email); `email` se deja tal cual, se usa como dirección de envío,
  //    no se interpola en el HTML.
  const branding = {
    name: escapeHtml((companySettings.name || '').trim() || 'PRECISE CLEANING'),
    address: escapeHtml((companySettings.address || '').trim()),
    logo: escapeHtml((companySettings.logo || '').trim()),
    email: (companySettings.email || '').trim(),
  };
  const brandInitials = (branding.name || 'PC').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'PC';

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

      // Estos valores terminan en HTML crudo (ventana de impresión y/o email) — se
      // escapan porque incluyen texto libre (notas de inspector) y catálogos.
      const inspector = escapeHtml(inspectorName || 'Unknown');
      const displayDate = recordDate
        ? new Date(recordDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const date = displayDate;
      const clientName = escapeHtml(getClientName(house.client));
      const teamName = escapeHtml(teamNameOverride || getTeamNameForHouse(house));

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
                    <td>${escapeHtml(t.name)}</td>
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

        // pd.notes/pd.damage son texto libre que escribe el inspector — el punto de
        // mayor riesgo de todo este generador, se escapan sin excepción.
        const notesHtml = (pd.notes || pd.damage) ? `
          <div class="notes-block">
            ${pd.notes ? `<div><strong>Notes:</strong> ${escapeHtml(pd.notes)}</div>` : ''}
            ${pd.damage ? `<div style="margin-top: 8px; color: #b91c1c;"><strong>Damage:</strong> ${escapeHtml(pd.damage)}</div>` : ''}
          </div>
        ` : '';

        const placeName = escapeHtml(pd.place.name);
        const photosHtml = pd.photosBase64.length > 0 ? `
          <div class="photos-label">Photographic Evidence (${pd.photosBase64.length})</div>
          <div class="photo-grid">
            ${pd.photosBase64.map((src, idx) => `
              <figure class="photo-item">
                <div class="photo-frame"><img src="${src}" alt="QC photo ${idx + 1}" /></div>
                <figcaption class="photo-cap">${placeName} — Photo ${String(idx + 1).padStart(2, '0')}</figcaption>
              </figure>
            `).join('')}
          </div>
        ` : '';

        return `
          <section class="place-section">
            <div class="place-header">
              <h2>${placeName}</h2>
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
                <div class="info-item"><span class="info-k">Address</span><span class="info-v">${escapeHtml(house.address || '—')}</span></div>
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

      // 'noopener': corta el acceso de la ventana nueva a window.opener (defensa
      // adicional si algo lograra colarse pese al escapeHtml de arriba).
      const printWindow = window.open('', '_blank', 'noopener');
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

  // ⭐ Áreas disponibles (activas de la casa con tareas configuradas)
  const activePlaces = activePlacesFor(selectedHouse);
  const placeQuery = placeSearch.trim().toLowerCase();
  const availablePlaces = activePlaces.filter(p => tasks.some(t => t.placeId === p.id));
  const searchablePlaces = availablePlaces.filter(p => !placeQuery || p.name.toLowerCase().includes(placeQuery));
  const selectedRenderPlaces = availablePlaces.filter(p => selectedPlaceIds.includes(p.id));

  return (
    <div className="fade-in qc-view qcv-page">
      <header className="main-header qcv-header">
        <div className="qcv-header-title-wrap">
          <h1 className="qcv-header-title">Quality Check Reports</h1>
          <p className="qcv-header-subtitle">History and status of house inspections</p>
        </div>
      </header>

      {/* ⭐ Botón de menú: SIEMPRE fijo en la parte superior derecha */}
      <button className="hamburger-btn qcv-hamburger-btn" onClick={onOpenMenu} aria-label="Open menu">
        <Menu size={24} />
      </button>

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
            <button type="button" onClick={() => setTableSearch('')} aria-label="Limpiar búsqueda" className="qcv-clear-search-btn">
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
        <div className={`qcv-offline-banner${!isOnline ? ' offline' : ''}`}>
          {!isOnline ? <WifiOff size={16} /> : <Loader2 size={16} className="spin-qc" />}
          <span>
            {!isOnline ? 'Sin conexión. ' : ''}
            {pendingUploadCount > 0
              ? `${pendingUploadCount} foto(s) pendiente(s) de subir — se subirán automáticamente al recuperar señal.`
              : 'Reconectando…'}
          </span>
          {pendingUploadCount > 0 && isOnline && (
            <button onClick={() => processQueue()} className="qcv-retry-btn">Reintentar ahora</button>
          )}
        </div>
      )}

      {/* ⭐ CASAS PENDIENTES DE QUALITY CHECK (estado "Quality Check" en el pipeline) */}
      {!isLoadingCatalogs && showPendingBlock && filteredPendingHouses.length > 0 && (
        <div className="qcv-house-block pending">
          <div className="qcv-house-block-header">
            <div className="qcv-house-block-icon pending">
              <ClipboardCheck size={19} color="#2563eb" />
            </div>
            <div>
              <div className="qcv-house-block-title pending">Casas pendientes de Quality Check</div>
              <div className="qcv-house-block-sub">
                {filteredPendingHouses.length} casa(s) con estado "Quality Check" — Pending de inspección
              </div>
            </div>
          </div>

          <div className="qc-pending-grid">
            {filteredPendingHouses.map(house => {
              const failed = houseFailedQC(house.id, qcList);
              return (
                <div key={house.id} onClick={() => onOpenHouseDetail?.(house)} className={`qcv-house-card${failed ? ' failed' : ''}`}>
                  <div className="qcv-house-card-actions-row" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => onOpenHouseEdit?.(house)} title="Editar (formulario)" className="qcv-house-icon-btn"><Edit2 size={15} /></button>
                    <button type="button" onClick={() => handleDeleteHouse(house)} title="Eliminar casa" className="qcv-house-icon-btn delete"><Trash2 size={15} /></button>
                  </div>
                  <div className="qcv-house-card-title-row">
                    <div className="qcv-house-client-name">
                      {getClientName(house.client)}
                    </div>
                    {failed ? (
                      <span className="qcv-house-badge failed">
                        <AlertTriangle size={12} /> Did Not Pass
                      </span>
                    ) : (
                      <span className="qcv-house-badge pending-yellow">
                        Pending
                      </span>
                    )}
                  </div>
                  <div className="qcv-house-info-col">
                    <div className="qcv-house-info-row">
                      <MapPin size={16} color="#94a3b8" className="qcv-shrink-0" />
                      <span className="qcv-ellipsis">{house.address || '—'}</span>
                    </div>
                    <div className="qcv-house-info-row">
                      <Users size={16} color="#94a3b8" className="qcv-shrink-0" />
                      <span>{getTeamNameForHouse(house)}</span>
                    </div>
                    {houseNote(house) !== '' && (
                      <div className="qcv-house-note">
                        <StickyNote size={12} className="qcv-house-note-icon" />
                        <span className="qcv-house-note-text">{houseNote(house)}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openHouseStatusModal(house); }}
                      title="Cambiar status de la casa"
                      className="qcv-house-status-btn"
                    >
                      <span className="qcv-house-status-dot" style={{ '--dot-color': houseStatusInfo(house).color } as CSSProperties} />
                      {houseStatusInfo(house).name}
                      <Edit2 size={12} color="#94a3b8" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleRouteHouse(house); }}
                      title={isHouseInRoute(house.id) ? 'Quitar de la ruta' : 'Agregar a la ruta de inspección'}
                      className={`qcv-house-route-btn${isHouseInRoute(house.id) ? ' in-route' : ''}`}
                    >
                      {isHouseInRoute(house.id)
                        ? <><Check size={13} /> En ruta — quitar</>
                        : <><Route size={13} /> Agregar a ruta</>}
                    </button>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStartOrContinueQC(house); }}
                    disabled={isLoadingCatalogs}
                    className={`qcv-house-inspect-btn${failed ? ' failed' : ''}`}
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
        <div className="qcv-empty-note-box">
          No hay casas pendientes de Quality Check.
        </div>
      )}

      {/* ⭐ CASAS EN RECALL (estado "Recall" en el pipeline) — se muestran en la pestaña Recall/All */}
      {!isLoadingCatalogs && showRecallBlock && filteredRecallHouses.length > 0 && (
        <div className="qcv-house-block recall">
          <div className="qcv-house-block-header">
            <div className="qcv-house-block-icon recall">
              <Repeat size={19} color="#7c3aed" />
            </div>
            <div>
              <div className="qcv-house-block-title recall">Casas en Recall</div>
              <div className="qcv-house-block-sub">
                {filteredRecallHouses.length} casa(s) con estado "Recall" — para re-limpieza y re-inspección
              </div>
            </div>
          </div>

          <div className="qc-pending-grid">
            {filteredRecallHouses.map(house => (
              <div key={house.id} onClick={() => onOpenHouseDetail?.(house)} className="qcv-house-card recall">
                <div className="qcv-house-card-actions-row" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => onOpenHouseEdit?.(house)} title="Editar (formulario)" className="qcv-house-icon-btn"><Edit2 size={15} /></button>
                  <button type="button" onClick={() => handleDeleteHouse(house)} title="Eliminar casa" className="qcv-house-icon-btn delete"><Trash2 size={15} /></button>
                </div>
                <div className="qcv-house-card-title-row">
                  <div className="qcv-house-client-name">
                    {getClientName(house.client)}
                  </div>
                  <span className="qcv-house-badge recall">
                    <Repeat size={12} /> Recall
                  </span>
                </div>
                <div className="qcv-house-info-col">
                  <div className="qcv-house-info-row">
                    <MapPin size={16} color="#94a3b8" className="qcv-shrink-0" />
                    <span className="qcv-ellipsis">{house.address || '—'}</span>
                  </div>
                  <div className="qcv-house-info-row">
                    <Users size={16} color="#94a3b8" className="qcv-shrink-0" />
                    <span>{getTeamNameForHouse(house)}</span>
                  </div>
                  {houseNote(house) !== '' && (
                    <div className="qcv-house-note">
                      <StickyNote size={12} className="qcv-house-note-icon" />
                      <span className="qcv-house-note-text">{houseNote(house)}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openHouseStatusModal(house); }}
                    title="Cambiar status de la casa"
                    className="qcv-house-status-btn"
                  >
                    <span className="qcv-house-status-dot" style={{ '--dot-color': houseStatusInfo(house).color } as CSSProperties} />
                    {houseStatusInfo(house).name}
                    <Edit2 size={12} color="#94a3b8" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleRouteHouse(house); }}
                    title={isHouseInRoute(house.id) ? 'Quitar de la ruta' : 'Agregar a la ruta de inspección'}
                    className={`qcv-house-route-btn${isHouseInRoute(house.id) ? ' in-route' : ''}`}
                  >
                    {isHouseInRoute(house.id)
                      ? <><Check size={13} /> En ruta — quitar</>
                      : <><Route size={13} /> Agregar a ruta</>}
                  </button>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleStartOrContinueQC(house); }}
                  disabled={isLoadingCatalogs}
                  className="qcv-house-inspect-btn recall"
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
        <div className="qc-table-wrap qcv-table-wrap">
          <div className="qcv-table-scroll">
            <table className="qcv-table">
              <thead>
                <tr>
                  <th className="qcv-th">Estado</th>
                  <th className="qcv-th">Fecha</th>
                  <th className="qcv-th">Cliente y dirección</th>
                  <th className="qcv-th">Equipo</th>
                  <th className="qcv-th">Inspector</th>
                  <th className="qcv-th">Duración</th>
                  <th className="qcv-th">Notas</th>
                  <th className="qcv-th right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredQcList.length === 0 ? (
                  <tr>
                    <td className="qcv-td empty" colSpan={8}>
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
                      <td className="qcv-td">
                        <span className="qcv-badge" style={{ '--badge-bg': badge.bg, '--badge-fg': badge.fg } as CSSProperties}>
                          {cat === 'Recall' ? <Repeat size={12} /> : <Check size={12} />} {badge.label}
                        </span>
                      </td>
                      <td className="qcv-td">{formatDate(qc.date)}</td>
                      <td className="qcv-td">
                        <div className="qcv-client-name">{getClientName(qc.client)}</div>
                        <div className="qcv-client-address">{qc.address || '—'}</div>
                      </td>
                      <td className="qcv-td">{qc.team || getTeamNameForHouse(properties.find(p => p.id === qc.houseId))}</td>
                      <td className="qcv-td">{qc.inspector || 'Unknown'}</td>
                      <td className="qcv-td">
                        <div className="qcv-duration-row">
                          <Clock size={14} color="#94a3b8" /> {fmtDuration(recordDuration(qc))}
                        </div>
                        <div className="qcv-duration-time">{fmtTime(qc.checkInAt)} – {fmtTime(qc.checkOutAt)}</div>
                      </td>
                      <td className="qcv-td notes">
                        {notes.length === 0 ? (
                          <span className="qcv-notes-empty">—</span>
                        ) : (
                          <div className="qcv-notes-col">
                            {notes.slice(0, 3).map((n, i) => (
                              <div key={i} className="qcv-note-line">
                                <span className="qcv-note-area">{n.area}:</span>{' '}
                                {n.notes && <span>{n.notes}</span>}
                                {n.damage && <span className="qcv-note-damage">{n.notes ? ' · ' : ''}⚠ {n.damage}</span>}
                              </div>
                            ))}
                            {notes.length > 3 && <div className="qcv-notes-more">+{notes.length - 3} área(s) más…</div>}
                          </div>
                        )}
                      </td>
                      <td className="qcv-td actions">
                        <div className="qcv-row-actions">
                          <button onClick={() => handleExportFromTable(qc)} title="Exportar PDF" disabled={exportingForQcId === qc.id} className="qcv-row-icon-btn">
                            {exportingForQcId === qc.id ? <Loader2 size={16} className="spin-qc" /> : <Printer size={16} />}
                          </button>
                          <button onClick={() => openEmailForQC(qc)} title="Enviar por email" className="qcv-row-icon-btn email">
                            <Mail size={16} />
                          </button>
                          <button onClick={() => handleEditQC(qc)} title="Editar" className="qcv-row-icon-btn edit">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => qc.id && handleDeleteQC(qc.id)} title="Eliminar" className="qcv-row-icon-btn delete">
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
        <div className="qc-cards-wrap qcv-record-cards-wrap">
          {filteredQcList.length === 0 ? (
            <div className="qcv-record-empty">
              No hay registros de Quality Check para mostrar.
            </div>
          ) : filteredQcList.map(qc => {
            const cat = qcCategory(qc);
            const badge = cat === 'Recall'
              ? { bg: '#f3e8ff', fg: '#7c3aed', label: 'Recall' }
              : { bg: '#dcfce7', fg: '#166534', label: 'Finished' };
            const notes = collectNotesForCard(qc);
            return (
              <div key={qc.id} className="qcv-record-card">
                <div className="qcv-record-card-top">
                  <div>
                    <div className="qcv-client-name">{getClientName(qc.client)}</div>
                    <div className="qcv-client-address">{qc.address || '—'}</div>
                  </div>
                  <span className="qcv-badge card" style={{ '--badge-bg': badge.bg, '--badge-fg': badge.fg } as CSSProperties}>
                    {cat === 'Recall' ? <Repeat size={11} /> : <Check size={11} />} {badge.label}
                  </span>
                </div>
                <div className="qcv-record-meta-row">
                  <span className="qcv-record-meta-item"><CalendarDays size={14} color="#94a3b8" /> {formatDate(qc.date)}</span>
                  <span className="qcv-record-meta-item"><Users size={14} color="#94a3b8" /> {qc.team || getTeamNameForHouse(properties.find(p => p.id === qc.houseId))}</span>
                  <span className="qcv-record-meta-item"><User size={14} color="#94a3b8" /> {qc.inspector || 'Unknown'}</span>
                  <span className="qcv-record-meta-item"><Clock size={14} color="#94a3b8" /> {fmtDuration(recordDuration(qc))}</span>
                </div>
                {notes.length > 0 && (
                  <div className="qcv-record-notes-box">
                    <div className="qcv-record-notes-title">
                      <StickyNote size={13} color="#94a3b8" /> Notas
                    </div>
                    {notes.map((n, i) => (
                      <div key={i} className="qcv-record-note-line">
                        <span className="qcv-note-area">{n.area}:</span>{' '}
                        {n.notes && <span>{n.notes}</span>}
                        {n.damage && <span className="qcv-note-damage">{n.notes ? ' · ' : ''}⚠ {n.damage}</span>}
                      </div>
                    ))}
                  </div>
                )}
                <div className="qcv-record-actions-row">
                  <button onClick={() => handleExportFromTable(qc)} disabled={exportingForQcId === qc.id} className="qcv-record-action-btn">
                    {exportingForQcId === qc.id ? <Loader2 size={15} className="spin-qc" /> : <Printer size={15} />} PDF
                  </button>
                  <button onClick={() => openEmailForQC(qc)} className="qcv-record-action-btn email">
                    <Mail size={15} /> Email
                  </button>
                  <button onClick={() => handleEditQC(qc)} className="qcv-record-action-btn edit">
                    <Edit2 size={15} /> Editar
                  </button>
                  <button onClick={() => qc.id && handleDeleteQC(qc.id)} className="qcv-record-action-btn delete">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════ MODAL DE INSPECCIÓN (Quality Check) ═══════════ */}
      {isFormModalOpen && selectedHouse && (
        <div className="qc-overlay" onClick={handleCloseForm}>
          <div className="qc-modal" onClick={e => e.stopPropagation()}>
            <div className="qc-header">
              <div className="qcv-im-header-title-wrap">
                <h2 className="qc-title"><ClipboardCheck size={20} /> {editingQcId ? 'Editar' : 'Nuevo'} Quality Check</h2>
                <p className="qc-prop">{getClientName(selectedHouse.client)} · {selectedHouse.address || '—'}</p>
                <p className="qc-insp">
                  <User size={13} /> {currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown'}
                  {checkInAt && <> · <Clock size={13} /> Entrada {fmtTime(checkInAt)}</>}
                </p>
              </div>
              <div className="qcv-im-header-actions">
                <button onClick={handleExportFromModal} title="Exportar PDF" disabled={isExportingPDF} className="qcv-im-header-btn">
                  {isExportingPDF ? <Loader2 size={16} className="spin-qc" /> : <Printer size={16} />}<span className="qc-export-label">PDF</span>
                </button>
                <button onClick={openEmailForCurrent} title="Enviar por email" className="qcv-im-header-btn">
                  <Mail size={16} /><span className="qc-export-label">Email</span>
                </button>
                <button onClick={handleCloseForm} className="qcv-im-close-btn" aria-label="Cerrar"><X size={22} /></button>
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
                <div className="qcv-im-picker-title">
                  Áreas a inspeccionar ({selectedPlaceIds.length} seleccionada(s))
                </div>
                {searchablePlaces.length === 0 ? (
                  <div className="qcv-im-picker-empty">No hay áreas con tareas configuradas.</div>
                ) : (
                  <div className="qcv-im-chip-list">
                    {searchablePlaces.map(p => {
                      const sel = selectedPlaceIds.includes(p.id);
                      return (
                        <button key={p.id} className={`qc-chip${sel ? ' selected' : ''}`} onClick={() => togglePlaceSelection(p.id)}>
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
                    <h3 className="qcv-im-card-title">{p.name}</h3>

                    {placeTasks.map(t => {
                      const val = data.tasks?.[t.id];
                      return (
                        <div key={t.id} className="qcv-im-task-item">
                          <span className="qcv-im-task-name">{t.name}</span>
                          <div className="qcv-im-task-buttons">
                            <button className={`qc-toggle yes${val === 'Yes' ? ' active' : ''}`} onClick={() => setTaskValue(p.id, t.id, 'Yes')}>Yes</button>
                            <button className={`qc-toggle no${val === 'No' ? ' active' : ''}`} onClick={() => setTaskValue(p.id, t.id, 'No')}>No</button>
                          </div>
                        </div>
                      );
                    })}

                    <div className="qcv-im-extra-fields">
                      <label className="qcv-im-label">Score (calidad general)</label>
                      <div className="qcv-im-score-row">
                        {[1, 2, 3].map(n => (
                          <button key={n} className={`qc-toggle score${data.score === n ? ' active' : ''}`} onClick={() => setScoreValue(p.id, n)}>{n}</button>
                        ))}
                      </div>

                      <label className="qcv-im-label">Notas</label>
                      <textarea className="qcv-im-textarea" value={data.notes || ''} onChange={e => handleTextChange(p.id, 'notes', e.target.value)} placeholder="Observaciones del área..." />

                      <label className="qcv-im-label">Daños</label>
                      <textarea className="qcv-im-textarea" value={data.damage || ''} onChange={e => handleTextChange(p.id, 'damage', e.target.value)} placeholder="Daños encontrados (si aplica)..." />
                    </div>

                    {/* Fotos */}
                    <div className="qcv-im-photos-section">
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
                      <input ref={el => { cameraInputRefs.current[p.id] = el; }} type="file" accept="image/*" capture="environment" className="qcv-im-hidden-input" onChange={e => { handlePhotoUpload(p.id, p.name, e.target.files); e.target.value = ''; }} />
                      <input ref={el => { fileInputRefs.current[p.id] = el; }} type="file" accept="image/*" multiple className="qcv-im-hidden-input" onChange={e => { handlePhotoUpload(p.id, p.name, e.target.files); e.target.value = ''; }} />

                      {(savedPhotos.length > 0 || pending.length > 0 || queued.length > 0) && (
                        <div className="qc-photo-grid">
                          {savedPhotos.map((url, idx) => (
                            <div key={`s-${idx}`} className="qcv-im-photo-tile">
                              <img src={url} alt="" className="qcv-im-photo-img" />
                              {/* ⭐ Editar / dibujar sobre la foto (estilo WhatsApp) */}
                              <button onClick={() => setAnnotate({ placeId: p.id, index: idx, url })} title="Dibujar en la foto" className="qcv-im-photo-edit-btn">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => handleRemovePhoto(p.id, idx)} className="qcv-im-photo-remove-btn">
                                <X size={13} />
                              </button>
                            </div>
                          ))}
                          {pending.map(pp => (
                            <div key={`p-${pp.id}`} className="qcv-im-photo-tile pending">
                              <img src={pp.preview} alt="" className="qcv-im-photo-img" />
                              <div className="qcv-im-photo-pending-overlay">
                                <Loader2 size={20} color="#fff" className="spin-qc" />
                              </div>
                            </div>
                          ))}
                          {queued.map(qp => (
                            <div key={`q-${qp.id}`} className="qcv-im-photo-tile queued">
                              <img src={qp.preview} alt="" className="qcv-im-photo-img" />
                              <div className="qcv-im-photo-queued-badge">
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
                <div className="qcv-im-no-places">
                  Selecciona al menos un área arriba para comenzar la inspección.
                </div>
              )}
            </div>

            <div className="qc-savebar">
              <button className="qcv-im-btn-save" disabled={isSaving} onClick={() => handleSaveQC(false)}>
                {isSaving ? <Loader2 size={18} className="spin-qc" /> : <Save size={18} />} Guardar Todo
              </button>
              <button className="qcv-im-btn-fail" disabled={isSaving} onClick={() => handleSaveQC(true)}>
                <AlertTriangle size={18} /> DID NOT PASS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ CÁMARA EN RÁFAGA ═══════════ */}
      {cameraOpen && (
        <div className="qcv-cam-root">
          <div className="qcv-cam-header">
            <div className="qcv-cam-title">{cameraPlace?.name || 'Cámara'}</div>
            <button onClick={closeBurstCamera} className="qcv-cam-close-btn">
              <X size={18} /> Cerrar
            </button>
          </div>
          <div className="qcv-cam-viewport">
            {cameraError ? (
              <div className="qcv-cam-error">{cameraError}</div>
            ) : (
              <video ref={videoRef} playsInline muted className="qcv-cam-video" />
            )}
            {cameraShots.length > 0 && (
              <div className="qcv-cam-shots-strip">
                {cameraShots.map(sh => (
                  <img key={sh.id} src={sh.preview} alt="" className="qcv-cam-shot-thumb" />
                ))}
              </div>
            )}
          </div>
          {!cameraError && (
            <div className="qcv-cam-controls">
              <span className="qcv-cam-count">{cameraShots.length} foto(s)</span>
              <button onClick={captureBurst} disabled={capturing} className="qcv-cam-shutter-btn">
                {capturing ? <Loader2 size={26} className="spin-qc" color="#3b82f6" /> : <Camera size={28} color="#3b82f6" />}
              </button>
              <button onClick={closeBurstCamera} className="qcv-cam-done-btn">Listo</button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ MODAL: CAMBIAR STATUS DE LA CASA ═══════════ */}
      {statusModalHouse && (
        <div className="qc-overlay" onClick={() => setStatusModalHouse(null)}>
          <div onClick={e => e.stopPropagation()} className="qcv-sm-modal">
            <div className="qcv-sm-modal-header">
              <h3 className="qcv-sm-modal-title">Cambiar status</h3>
              <button onClick={() => setStatusModalHouse(null)} className="qcv-sm-close-btn"><X size={20} /></button>
            </div>
            <div className="qcv-sm-modal-body">
              <div className="qcv-house-name">{getClientName(statusModalHouse.client)}</div>
              <div className="qcv-house-address">{statusModalHouse.address || '—'}</div>
              <label className="qcv-sm-field-label">Nuevo status</label>
              <select value={statusModalSelected} onChange={e => setStatusModalSelected(e.target.value)} className="qcv-sm-select">
                <option value="">— Selecciona —</option>
                {statuses.map(st => (
                  <option key={st.id} value={st.id}>{st.name}</option>
                ))}
              </select>
            </div>
            <div className="qcv-sm-modal-footer">
              <button onClick={() => setStatusModalHouse(null)} className="qcv-sm-btn-cancel">Cancelar</button>
              <button onClick={applyHouseStatusChange} disabled={savingStatus || !statusModalSelected} className="qcv-sm-btn-primary">
                {savingStatus ? <Loader2 size={16} className="spin-qc" /> : <Save size={16} />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ MODAL: EMAIL ═══════════ */}
      {emailModalOpen && emailCtx && (
        <div className="qc-overlay" onClick={() => setEmailModalOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="qcv-sm-modal wide">
            <div className="qcv-sm-modal-header green">
              <h3 className="qcv-sm-modal-title with-icon"><Mail size={18} /> Enviar reporte</h3>
              <button onClick={() => setEmailModalOpen(false)} className="qcv-sm-close-btn"><X size={20} /></button>
            </div>
            <div className="qcv-sm-modal-body">
              <label className="qcv-sm-field-label">Para</label>
              <input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} className="qcv-sm-input mb" />
              <div className="qcv-email-subject"><strong>Asunto:</strong> {emailCtx.subject}</div>
              <div className="qcv-email-body-preview">{emailCtx.body}</div>
              <p className="qcv-email-hint">Se abrirá el PDF para guardar/adjuntar y luego tu cliente de correo.</p>
            </div>
            <div className="qcv-sm-modal-footer">
              <button onClick={() => setEmailModalOpen(false)} className="qcv-sm-btn-cancel">Cancelar</button>
              <button onClick={sendEmail} className="qcv-sm-btn-primary green">
                <Mail size={16} /> Continuar
              </button>
            </div>
          </div>
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

      {/* ⭐ RUTA DE INSPECCIÓN: botón flotante + drawer lateral con mapa numerado */}
      {routeHouseIds.length > 0 && !routeDrawerOpen && (
        <button type="button" className="qcv-route-fab" onClick={() => setRouteDrawerOpen(true)}>
          <Route size={17} /> Ver ruta ({routeHouseIds.length})
        </button>
      )}
      <QCRouteDrawer
        open={routeDrawerOpen}
        onClose={() => setRouteDrawerOpen(false)}
        houses={routeDrawerHouses}
        onRemove={(houseId: string) => setRouteHouseIds(prev => prev.filter(id => id !== houseId))}
        currentUser={currentUser}
      />

    </div>
  );
}