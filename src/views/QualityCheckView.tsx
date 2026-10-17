import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import {
  ClipboardCheck, X, Camera,
  Printer, Loader2, Check, Mail, Repeat, Send,
  WifiOff,
  Pencil, Undo2, Eraser, Circle as CircleShape, MoveUpRight, Route
} from 'lucide-react';
import type { Property, SystemUser, Place, QualityCheckRecord, QcFormData, QcHouseGroup, Role } from '../types/index';
import { getRelationName } from '../utils/relations';
// ⭐ Velocidad: pinta con el caché local de Firestore y refresca en 2º plano.
// ⭐ Mapeo correcto de clientes (el id legacy NO pisa al id real)
import { useLiveCollection } from '../shared/data/liveCollections';
import { useQcForHouses } from '../features/quality-check/useQcForHouses';
import { getCompanySettings } from '../services/companyService';
import { storageService } from '../services/storageService';
import { useLiveHouse } from '../features/houses/hooks/useLiveHouse';
import { compressImage } from '../utils/imageCompression';
import {
  addStatusChange, afterStatusHistoryWrite, changeHouseStatus, houseLogLabel, logStatusChange, statusNameOf,
} from '../features/houses/services/houseStatus';
import { useHouseTrash } from '../features/houses/hooks/useHouseTrash';
import DeleteHouseDialog from '../features/houses/components/DeleteHouseDialog';
import type { WriteBatch } from '../shared/data/batchWrites';
import { qualityChecks } from '../features/quality-check/services/qualityChecks';
import { isQualityCheckStatus, latestQCForHouse, housePassedQC, houseFailedQC } from '../utils/qcStatus';
import { isInvoiceStatus } from '../utils/invoiceEntry';
import { computeQCScore } from '../utils/qcScore';
import { sendMailAndConfirm, mailResultMessage } from '../utils/sendMail';
import { qualityCheckAllowedStatuses } from '../utils/statusFilters';
import { syncQCRecordWithStatus } from '../utils/qcRecordSync';
import StatusChangeModal from '../components/StatusChangeModal';
import { isRecallText } from '../utils/recallStatus';
import { escapeHtml } from '../utils/escapeHtml';
import { formatDate as formatDateMDY, formatTime, todayIso } from '../utils/dateFormat';
import HistoryWindowNotice from '../components/HistoryWindowNotice';
import { exportQCReportPDF, collectPlacesWithData as collectPlacesWithDataUtil } from '../utils/qcReportPdf';
import { prepareQCShare, type PreparedQCShare } from '../utils/shareQCReport';
import ShareReportSheet from '../components/ShareReportSheet';
import QCRouteDrawer, { type RouteDrawerHouse } from './QCRouteDrawer';
import QcCheckDrawer from '../features/quality-check/components/QcCheckDrawer';
import QcHouseCard from '../features/quality-check/components/QcHouseCard';
import QcHouseFilters from '../features/quality-check/components/QcHouseFilters';
import PeriodBar from '../components/PeriodBar';
import { useStoredPeriod } from '../shared/hooks/useStoredPeriod';
import { inPeriod, periodRange } from '../utils/periods';
import QcReportsBlock from '../features/quality-check/components/QcReportsBlock';
import QcPhotoGrid, { type QcPhotoItem } from '../features/quality-check/components/QcPhotoGrid';
import type { QcNoteItem } from '../features/quality-check/components/QcIncomingNotes';
import {
  GENERAL_SLOT, GENERAL_SLOT_NAME, OFFICE_SLOT, OFFICE_SLOT_NAME,
  type QcAnswer, type QcExtras, type QcSection, type QcSectionTask,
} from '../features/quality-check/qcForm';
import { settingsPlacesService } from '../services/settingsPlacesService';
import { settingsTasksService } from '../services/settingsTasksService';
import { logActivity } from '../services/activityLogService';
import { isActiveTask, sortPlacesByOrder } from '../utils/qcCatalog';
import './QualityCheckView.css';
import MenuButton from '../shared/components/MenuButton';

/** Reporte de quality_checks (tipo único en types/index.ts). */
type QCRecord = QualityCheckRecord;

// ⭐ Nombre de la base de datos local (IndexedDB) para la cola de fotos offline
const OFFLINE_DB = 'pc_qc_offline';
const OFFLINE_STORE = 'photos';

// ⭐ Helpers de IndexedDB (cola de fotos sin conexión). Autocontenidos: no dependen
//    de ningún servicio externo. Cada entrada guarda el blob comprimido + contexto.
interface OfflinePhotoEntry {
  id: string;
  houseId: string;
  placeId: string;
  placeName: string;
  address: string;
  blob: Blob;
  qcDocId: string | null;
  createdAt: number;
}

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
async function offlinePut(entry: OfflinePhotoEntry): Promise<void> {
  const database = await openOfflineDB();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(OFFLINE_STORE, 'readwrite');
    tx.objectStore(OFFLINE_STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  database.close();
}
async function offlineGetAll(): Promise<OfflinePhotoEntry[]> {
  const database = await openOfflineDB();
  const out = await new Promise<OfflinePhotoEntry[]>((resolve, reject) => {
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
  // ⭐ Permisos 'Office Notes' (información interna que no debe ver el campo) y
  //    'QC Checklist Setup' ("Edit checklist" en el panel).
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
  onOpenHouseDetail?: (house: Property) => void; // ⭐ abre el detalle en HousesView
  onOpenHouseEdit?: (house: Property) => void;   // ⭐ abre el FORMULARIO de edición en HousesView
}

// Destino del email si la empresa no tiene correo configurado (el que ya usaba la vista).
const DEFAULT_EMAIL_TO = 'jesuslevinole@gmail.com';

// Clave de la cola de fotos sin conexión: casa + área.
const queueKey = (houseId: string, placeId: string) => `${houseId}|${placeId}`;

// Genera un id único para previews locales (con fallback si crypto.randomUUID no existe)
const uid = (): string =>
  (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// ─────────────────────────────────────────────────────────────
// ⭐ EDITOR DE FOTO (estilo WhatsApp): dibujar lápiz / círculo / flecha
//    sobre una foto ya tomada, elegir color, deshacer y guardar.
// ─────────────────────────────────────────────────────────────
interface Pt { x: number; y: number }
type Stroke =
  | { tool: 'pen'; color: string; size: number; points: Pt[] }
  | { tool: 'circle' | 'arrow'; color: string; size: number; start: Pt; end: Pt };
type DrawEvent = React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>;

function PhotoAnnotator({ imageUrl, saving, onCancel, onSave }: {
  imageUrl: string; saving: boolean; onCancel: () => void; onSave: (blob: Blob) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef<Stroke | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [tool, setTool] = useState<'pen' | 'circle' | 'arrow'>('pen');
  const [color, setColor] = useState('#ef4444');
  const [strokes, setStrokes] = useState<Stroke[]>([]);

  const colors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#000000', '#ffffff'];
  const LINE = 6;

  const redraw = (all: Stroke[]) => {
    const c = canvasRef.current, img = imgRef.current;
    if (!c || !img) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const drawOne = (st: Stroke) => {
      ctx.strokeStyle = st.color; ctx.fillStyle = st.color; ctx.lineWidth = st.size || LINE;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (st.tool === 'pen') {
        ctx.beginPath();
        (st.points || []).forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
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

  const ptFromEvent = (e: DrawEvent): Pt => {
    const c = canvasRef.current!; const rect = c.getBoundingClientRect();
    const src = 'touches' in e ? e.touches[0] : e;
    const clientX = src.clientX;
    const clientY = src.clientY;
    return { x: (clientX - rect.left) * (c.width / rect.width), y: (clientY - rect.top) * (c.height / rect.height) };
  };

  const startDraw = (e: DrawEvent) => {
    if (!ready) return;
    e.preventDefault();
    const p = ptFromEvent(e);
    if (tool === 'pen') drawingRef.current = { tool, color, size: LINE, points: [p] };
    else drawingRef.current = { tool, color, size: LINE, start: p, end: p };
    redraw(strokes);
  };
  const moveDraw = (e: DrawEvent) => {
    const cur = drawingRef.current;
    if (!cur) return;
    e.preventDefault();
    const p = ptFromEvent(e);
    if (cur.tool === 'pen') cur.points.push(p);
    else cur.end = p;
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
        } catch { /* sin CORS: se usa la URL original */ }
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


const QualityCheckView = ({ onOpenMenu, properties, houseToInspect, clearHouseToInspect, currentUser, activeRole, isSuperAdmin, onOpenHouseDetail, onOpenHouseEdit }: QualityCheckViewProps) => {
  // ⭐ Reportes de QC y catálogos del store compartido (un listener por
  //    colección para toda la app). Antes: getDocsCacheFirst de quality_checks
  //    y customers, que pintaba del caché pero SIEMPRE repetía la lectura
  //    completa en el servidor al abrir la vista, más 4 getDocs de catálogos.
  //    Guardar/borrar ya no toca la lista a mano: el listener la actualiza.
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  // ⭐ La casa abierta se muestra EN VIVO (useLiveHouse): notas, fotos y
  //    status que cambian en otra vista o equipo aparecen en el panel sin
  //    cerrarlo.
  const [openedHouse, setSelectedHouse] = useState<Property | null>(null);
  const selectedHouse = useLiveHouse(openedHouse, properties);
  // ⭐ PERF: casa por id en O(1). La lista de registros buscaba su casa con
  //    properties.find en cada render (registros × ~3,600 casas).
  const propById = useMemo(() => new Map(properties.map(p => [p.id, p] as const)), [properties]);
  const [editingQcId, setEditingQcId] = useState<string | null>(null);
  // ⭐ Solo Pending y Recall en esta vista: los QC terminados se consultan en la
  //    pestaña "Reportes" del hub (decisión de producto).
  const [statusFilter, setStatusFilter] = useState<QcHouseGroup>('All');
  // ⭐ Periodo de las casas pendientes y en Recall (por Schedule Date). Arranca
  //    en "Year" para no esconder pendientes viejas; se recuerda por navegador.
  const [housesPeriod, setHousesPeriod] = useStoredPeriod('pc.qc.houses.period', 'year');
  const housesPeriodRange = useMemo(() => periodRange(housesPeriod), [housesPeriod]);
  const [tableSearch, setTableSearch] = useState('');

  // ⭐ Ruta de inspección (drawer lateral): ids de casas agregadas + apertura del panel
  const [routeHouseIds, setRouteHouseIds] = useState<string[]>([]);
  const [routeDrawerOpen, setRouteDrawerOpen] = useState(false);

  // ⭐ EDITOR de foto (anotación estilo WhatsApp)
  const [annotate, setAnnotate] = useState<null | { placeId: string; index: number; url: string }>(null);
  const [savingAnnotation, setSavingAnnotation] = useState(false);

  const placesLive = useLiveCollection('places');
  const tasksLive = useLiveCollection('tasks');
  const teamsLive = useLiveCollection('teams');
  const customersLive = useLiveCollection('customers');
  // ⭐ Catálogo de estados para detectar las casas en "Quality Check"
  const statusesLive = useLiveCollection('statuses');
  // Áreas en su orden manual (sortOrder; las que no tienen, al final por nombre).
  const places = useMemo(() => sortPlacesByOrder(placesLive.data), [placesLive.data]);
  const tasks = useMemo(() => [...tasksLive.data].sort((a, b) => a.name.localeCompare(b.name)), [tasksLive.data]);
  const teams = teamsLive.data;
  const customersList = customersLive.data;
  const statuses = statusesLive.data;
  // ⭐ ¿La casa está en Recall? (por id o nombre del status)
  const isRecallStatus = (house: Property): boolean => {
    const sid = house.statusId;
    const st = statuses.find((s) => String(s.id) === String(sid) || String(s.name) === String(sid));
    return isRecallText(st?.name || sid);
  };
  // ⭐ Solo los reportes de las casas que esta pantalla muestra (en Quality
  //    Check o Recall). Antes se bajaba la colección completa de quality_checks;
  //    los terminados de otras casas se consultan en QC Reports y QC Dashboard.
  const qcLive = useQcForHouses<QCRecord>(
    properties.filter((h) => isQualityCheckStatus(h.statusId, statuses) || isRecallStatus(h)).map((h) => h.id),
  );
  const qcList = useMemo(
    () => [...qcLive.data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [qcLive.data],
  );
  const isLoadingCatalogs = !placesLive.loaded || !tasksLive.loaded || !teamsLive.loaded
    || !customersLive.loaded || !statusesLive.loaded || !qcLive.loaded;
  const [isSaving, setIsSaving] = useState(false);

  // ⭐ Cambio de status de una casa DESDE esta vista (modal)
  const [statusModalHouse, setStatusModalHouse] = useState<Property | null>(null);
  // ⭐ El modal compartido maneja su propia seleccion y confirmacion, asi que ya
  //    no hacen falta los estados intermedios que necesitaba el <select> anterior.
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
  //    La clave es casa + área (queueKey): con el panel nuevo casi todas las fotos
  //    van al área "General", y sin la casa en la clave una foto en cola de una
  //    casa aparecía en el panel de otra.
  const [queuedByPlace, setQueuedByPlace] = useState<Record<string, { id: string; preview: string }[]>>({});
  const [pendingUploadCount, setPendingUploadCount] = useState(0);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const processingRef = useRef(false);
  const selectedHouseRef = useRef<Property | null>(null);

  // ⭐ Exportar PDF
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // ⭐ Previews locales mientras las fotos se suben en segundo plano (UX instantáneo)
  const [pendingPhotos, setPendingPhotos] = useState<Record<string, { id: string; preview: string }[]>>({});

  // ⭐ Hay trabajo sin guardar (para avisar antes de cerrar el panel).
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  // ⭐ Campos del panel nuevo que no son del checklist (inspector, fecha,
  //    resultado, notas para el cliente…). Ver features/quality-check/qcForm.ts.
  const [qcExtras, setQcExtras] = useState<QcExtras>({
    inspectorId: '', inspectorName: '', date: '', clientNotes: '', notifyManager: false, outcome: null, reclean: true,
  });
  const usersLive = useLiveCollection('users');

  // ⭐ Envío por email
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(DEFAULT_EMAIL_TO);
  const [emailCtx, setEmailCtx] = useState<{ subject: string; body: string } | null>(null);
  const [emailExport, setEmailExport] = useState<null | (() => Promise<void> | void)>(null);

  // ⭐ Configuración de la empresa (logo, nombre, dirección y email destino).
  //    El email destino recibe automáticamente el reporte al guardar un QC.
  type CompanyConfig = { name: string; address: string; logo: string; email: string; autoSend: boolean };
  const [companySettings, setCompanySettings] = useState<CompanyConfig>({ name: '', address: '', logo: '', email: '', autoSend: true });

  const [qcData, setQcData] = useState<QcFormData>({});

  // ⭐ Configuración de empresa (logo, correo, envío automático).
  useEffect(() => {
    let alive = true;
    getCompanySettings()
      .then((c) => {
        if (!alive) return;
        setCompanySettings({
          name: c.name || '',
          address: c.address || '',
          logo: c.logo || '',
          email: c.email || '',
          autoSend: c.autoSend !== false,
        });
      })
      .catch(() => { /* valores por defecto */ });
    return () => { alive = false; };
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
        const k = queueKey(e.houseId, e.placeId);
        (map[k] = map[k] || []).push({ id: e.id, preview: URL.createObjectURL(e.blob) });
      }
      setQueuedByPlace(map);
      setPendingUploadCount(all.length);
    } catch (e) { console.error('No se pudieron reconstruir las previews offline:', e); }
  };

  // ⭐ Añade una URL de foto ya subida al documento QC guardado (parchado post-subida).
  const attachUrlToQcDoc = (qcDocId: string, placeId: string, url: string) =>
    qualityChecks.patchPlacePhotos(qcDocId, placeId, (photos) => {
      if (!photos.includes(url)) photos.push(url);
      return photos;
    });

  // ⭐ Guarda una foto en la cola offline (con su preview persistente).
  const queuePhoto = async (ctx: { id: string; houseId: string; placeId: string; placeName: string; address: string; blob: Blob }) => {
    const qcDocId = savedQcDocByHouse.current[ctx.houseId] || null;
    await offlinePut({ ...ctx, qcDocId, createdAt: Date.now() });
    const preview = URL.createObjectURL(ctx.blob);
    const k = queueKey(ctx.houseId, ctx.placeId);
    setQueuedByPlace(prev => ({ ...prev, [k]: [...(prev[k] || []), { id: ctx.id, preview }] }));
    await refreshPendingCount();
  };

  // ⭐ Anexa URLs de fotos a un area SIN repetir.
  //    Segunda linea de defensa: la causa real de las fotos repetidas estaba en
  //    storageService (nombres de archivo que colisionaban), pero hay tres rutas
  //    distintas que anexan fotos — subida directa, camara rafaga y cola offline —
  //    y un reintento de la cola puede volver a anexar una URL ya presente.
  //    Filtrar aqui garantiza que el reporte nunca muestre la misma foto dos veces.
  const appendPhotos = (placeId: string, urls: string[]) => {
    setQcData(prev => {
      const place = prev[placeId] || {};
      const current: string[] = (place.photos || []) as string[];
      const merged = [...current];
      urls.forEach(u => { if (u && !merged.includes(u)) merged.push(u); });
      return { ...prev, [placeId]: { ...place, photos: merged } };
    });
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
            appendPhotos(entry.placeId, [url]);
          }
          await offlineDelete(entry.id);
          const k = queueKey(entry.houseId, entry.placeId);
          setQueuedByPlace(prev => ({ ...prev, [k]: (prev[k] || []).filter(p => p.id !== entry.id) }));
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

  // ⭐ Borrar la casa = mandarla a la papelera con motivo obligatorio, junto con
  //    sus pagos y servicios (antes se destruía con deleteDoc y la nómina quedaba
  //    huérfana). Mismo flujo que Houses: features/houses/hooks/useHouseTrash.ts.
  const houseTrash = useHouseTrash({
    actor: currentUser,
    module: 'Quality Check',
    labelOf: (h) => houseLogLabel(getClientName(h.client), h.address),
    liveOf: (id) => propById.get(id),
  });

  // ⭐ Ruta de inspección — agregar/quitar casas del drawer lateral
  const isHouseInRoute = (houseId: string): boolean => routeHouseIds.includes(houseId);
  const toggleRouteHouse = (house: Property) => {
    setRouteHouseIds(prev => prev.includes(house.id) ? prev.filter(id => id !== house.id) : [...prev, house.id]);
  };

  // ⭐ Coordenadas pre-guardadas si la casa las trae (campos aún no declarados en Property).
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
  type PropertyNotes = Property & { note?: string | null; generalNotes?: string | null; officeNote?: string | null };
  const houseNote = (h: Property): string => {
    const g = h as PropertyNotes;
    return String(g.note || g.generalNotes || '').trim();
  };

  // ⭐ NOTAS DE OFICINA en las tarjetas de QC: solo para roles con el permiso
  //    'Office Notes' (mismo criterio que el detalle de Houses) o super admin.
  const canSeeOfficeNotes =
    !!isSuperAdmin ||
    !!activeRole?.permissions?.find((p) => p.module === 'Office Notes')?.canView;
  // ⭐ Tabla de reportes terminados (antes la vista "Quality Check Reports" del
  //    menú): permiso "Quality Check Reports"; si el rol no lo declara, la ve
  //    quien entra a Quality Check (mismo criterio que tenía el menú).
  const qcReportsPermission = activeRole?.permissions?.find((permission) => permission.module === 'Quality Check Reports');
  const canSeeQcReports = !!isSuperAdmin || (qcReportsPermission ? !!qcReportsPermission.canView : true);

  // ⭐ "Edit checklist" en el panel (módulo "QC Checklist Setup" de Roles):
  //    Add = agregar tareas · Edit = renombrarlas y ordenar las áreas · Delete = quitarlas.
  const checklistSetupPermission = activeRole?.permissions?.find((permission) => permission.module === 'QC Checklist Setup');
  const canAddChecklistTasks = !!isSuperAdmin || !!checklistSetupPermission?.canAdd;
  const canEditChecklistTasks = !!isSuperAdmin || !!checklistSetupPermission?.canEdit;
  const canRemoveChecklistTasks = !!isSuperAdmin || !!checklistSetupPermission?.canDelete;
  const houseOfficeNote = (h: Property): string =>
    String((h as PropertyNotes).officeNote || '').trim();

  // ⭐ Casas de la ruta con el nombre de cliente ya resuelto (entrada del drawer).
  //    Memoizado para que el drawer no re-sincronice/geocodifique en cada render del padre.
  const routeDrawerHouses = useMemo<RouteDrawerHouse[]>(() =>
    routeHouseIds
      .map(id => propById.get(id))
      .filter((h): h is Property => Boolean(h))
      .map(h => ({ id: h.id, client: getClientName(h.client), address: h.address || '', ...houseCoords(h) })),
    // getClientName/houseCoords se recrean por render pero solo dependen de customersList/properties.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routeHouseIds, propById, customersList]);

  // ⭐ Id del estado "Quality Check" (para regresar una casa cuando NO pasó)
  const getQualityCheckStatusId = (): string | null => {
    const st = statuses.find((s) => {
      const n = String(s.name || '').toLowerCase().trim();
      return n === 'qc' || n.includes('quality check') || n.includes('quality-check');
    });
    return st ? st.id : null;
  };

  // ⭐ Id del estado "Recall" (cuando un QC NO pasa, la casa pasa a Recall)
  const getRecallStatusId = (): string | null => {
    const st = statuses.find((s) => isRecallText(s.name));
    return st ? st.id : null;
  };

  // ⭐ Determina si una casa tiene estado "Recall" (resuelve id o nombre del status)
  // ⭐ Info del status actual de una casa (para el chip): nombre + color
  const houseStatusInfo = (house: Property) => {
    const sid = house.statusId;
    const st = statuses.find((x) => String(x.id) === String(sid) || String(x.name) === String(sid));
    return { id: st?.id ?? sid ?? '', name: st?.name || (sid ? String(sid) : 'Sin estado'), color: st?.color || '#94a3b8' };
  };

  // ⭐ Estados que ESTA vista permite asignar (ver src/utils/statusFilters.ts).
  const allowedStatuses = qualityCheckAllowedStatuses(statuses);

  // ⭐ Abrir el modal de cambio de status para una casa
  const openHouseStatusModal = (house: Property) => {
    setStatusModalHouse(house);
  };

  // ⭐ Aplicar el cambio de status: actualiza 'properties' en Firestore y registra
  //    la transición en el historial. Como 'properties' es tiempo real (listener
  //    global en App.tsx), las tarjetas de esta vista se reacomodan solas.
  //    ⭐ Recibe el id elegido: el modal compartido ya confirma con "Aceptar",
  //    asi que no hace falta un estado intermedio de seleccion.
  const applyHouseStatusChange = async (newStatusId: string) => {
    if (!statusModalHouse || !newStatusId) return;
    // Versión en vivo de la casa: el historial debe partir del status actual,
    // no del que tenía cuando se abrió el modal.
    const house = propById.get(statusModalHouse.id) ?? statusModalHouse;
    const prevStatusId = house.statusId;
    if (String(newStatusId) === String(prevStatusId)) { setStatusModalHouse(null); return; }
    setSavingStatus(true);
    try {
      // ⭐ Casa + status_history en un batch (todo o nada) y bitácora después.
      //    Si el destino es "Invoice" se estampa sentToInvoiceAt para que la casa
      //    quede ARRIBA en Invoices (features/houses/services/houseStatus.ts).
      await changeHouseStatus(house, newStatusId, {
        statuses,
        actor: currentUser,
        source: 'quality_check',
        module: 'Quality Check',
        label: houseLogLabel(getClientName(house.client), house.address),
      });

      // ⭐ Misma sincronizacion que en Quality Check Reports, en sentido inverso:
      //    el estado de la casa manda sobre el resultado del reporte, para que
      //    ambas vistas cuenten lo mismo. Ver src/utils/qcRecordSync.ts.
      await syncQCRecordWithStatus(house.id, statuses, newStatusId);
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
      const placeName = getSlotName(annotate.placeId);
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
      const savedDocId = editingQcId || savedQcDocByHouse.current[selectedHouse.id] || '';
      if (savedDocId) {
        try {
          await qualityChecks.patchPlacePhotos(savedDocId, annotate.placeId, (photos) => {
            if (photos[annotate.index] !== undefined) photos[annotate.index] = newUrl;
            else photos.push(newUrl);
            return photos;
          });
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

  // ⭐ Fecha en formato MM/DD/YYYY (utils/dateFormat; '-' si no hay fecha)
  const formatDate = (dateString: string) => formatDateMDY(dateString) || '-';

  // ⭐ Hora legible (hh:mm am/pm) a partir de un ISO
  const fmtTime = (iso?: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return formatTime(d);
  };

  // ⭐ PENDING = casas en estado "Quality Check" que aún esperan inspección
  //    (sin QC aprobado y sin QC reprobado: las reprobadas viven en Recall).
  // ⭐ Dentro del periodo elegido (Schedule Date). Una casa SIN fecha se sigue
  //    mostrando: si no, una pendiente sin agendar desaparecería de la vista.
  const isHouseInPeriod = (house: Property) => !house.scheduleDate || inPeriod(house.scheduleDate, housesPeriodRange);
  const pendingQCHouses = properties.filter(h => isQualityCheckStatus(h.statusId, statuses) && !housePassedQC(h.id, qcList) && !houseFailedQC(h.id, qcList) && isHouseInPeriod(h));

  // ⭐ RECALL = casas en estado "Recall" en el pipeline (aunque no tengan un QC
  //    "RECALL" registrado: muchas llegan a Recall por cambio de status).
  const recallHouses = properties.filter(h => isRecallStatus(h) && isHouseInPeriod(h));

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

  // ⭐ Conteos de las pestañas (coherentes con lo que se ve):
  //    Pending = casas esperando inspección · Recall = casas en estado "Recall".
  //    ⭐ Las casas con su Quality Check TERMINADO ya no se muestran en esta
  //    vista (pedido de Omar, 10/2026): sus reportes están en Quality Check
  //    Reports (PDF y Email).
  //    ⭐ La pestaña Recall cuenta exactamente lo que muestra: las CASAS en
  //    estado Recall. Los registros reprobados ya no se listan como tarjetas
  //    (duplicaban a las casas), así que tampoco suman al total.
  const recallTotal = recallHouses.length;

  // ⭐ Copia al portapapeles SOLO las direcciones de las casas EN QC (la sección
  //    "Casas pendientes de Quality Check"), sin recalls. Respeta el buscador.
  //    Es el insumo del flujo "copiar → reordenar con IA → pegar orden" del drawer.
  const copyQCAddresses = async () => {
    const houses = filteredPendingHouses;
    if (houses.length === 0) { alert('No hay casas en Quality Check para copiar.'); return; }
    const txt = houses.map((h, i) => `${i + 1}. ${h.address || getClientName(h.client)}`).join('\n');
    try {
      await navigator.clipboard.writeText(txt);
      alert(`${houses.length} dirección(es) copiadas al portapapeles.`);
    } catch {
      window.prompt('Copia las direcciones:', txt);
    }
  };
  const groupCounts = {
    All: pendingQCHouses.length + recallTotal,
    Pending: pendingQCHouses.length,
    Recall: recallTotal,
  };

  // ⭐ ¿Mostrar cada bloque según la pestaña activa?
  const showPendingBlock = statusFilter === 'All' || statusFilter === 'Pending';
  const showRecallBlock = statusFilter === 'All' || statusFilter === 'Recall';

  // ⭐ Áreas activas para una casa: si la casa tiene áreas marcadas (qcPlaces),
  //    solo esas; si no marcó ninguna, se muestran todas (compatibilidad).
  const activePlacesFor = (house: Property | null): Place[] => {
    const ids = house?.qcPlaces;
    if (Array.isArray(ids) && ids.length > 0) return places.filter(p => ids.includes(p.id));
    return places;
  };

  // ⭐ Fecha guardada (AAAA-MM-DD o formato viejo con barras) → AAAA-MM-DD.
  //    Si no se puede leer se conserva tal cual (DateInput la muestra igual).
  const isoFromAnyDate = (value?: string | null): string => {
    const v = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const m = formatDateMDY(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[1]}-${m[2]}` : v;
  };

  // ⭐ Nombre completo del usuario actual (inspector por defecto).
  const myName = currentUser ? `${currentUser.firstName} ${currentUser.lastName}`.trim() : 'Unknown';

  // ⭐ qcData siempre trae un objeto por área y las dos áreas internas del panel
  //    (fotos generales + notas para el equipo, y fotos de oficina).
  const withSlots = (data: QcFormData): QcFormData => {
    const out: QcFormData = { ...data };
    places.forEach(p => {
      if (!out[p.id]) out[p.id] = { tasks: {}, corrections: '', score: null, notes: '', damage: '', photos: [] };
      else if (!Array.isArray(out[p.id].photos)) out[p.id] = { ...out[p.id], photos: [] }; // registros viejos
    });
    [GENERAL_SLOT, OFFICE_SLOT].forEach(slot => {
      const cur = out[slot] || {};
      out[slot] = { ...cur, notes: cur.notes || '', photos: Array.isArray(cur.photos) ? cur.photos : [] };
    });
    return out;
  };

  const handleOpenForm = (house: Property) => {
    // QC nuevo: las fotos que terminen después no deben ir a un reporte anterior.
    delete savedQcDocByHouse.current[house.id];
    setSelectedHouse(house);
    setEditingQcId(null);
    setPendingPhotos({});
    setCheckInAt(new Date().toISOString()); // ⭐ hora de entrada
    setQcData(withSlots({}));
    setQcExtras({
      inspectorId: currentUser?.id || '', inspectorName: myName, date: todayIso(),
      clientNotes: '', notifyManager: false, outcome: null, reclean: true,
    });
    // ⭐ Estado limpio de guardado: el pie no debe heredar el aviso de "cambios
    //    sin guardar" ni la hora de guardado de la inspeccion anterior.
    setHasUnsavedChanges(false);
    setLastSavedAt(null);
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
    const house = (propById.get(qc.houseId) || { id: qc.houseId, address: qc.address, client: qc.client }) as Property;
    if (qc.id) savedQcDocByHouse.current[house.id] = qc.id;
    setSelectedHouse(house);
    setEditingQcId(qc.id as string);
    setPendingPhotos({});
    setCheckInAt(qc.checkInAt || new Date().toISOString()); // ⭐ conservar entrada previa
    setQcData(withSlots(qc.qcData || {}));
    setQcExtras({
      inspectorId: qc.inspectorId || (qc.inspector === myName ? currentUser?.id || '' : ''),
      inspectorName: qc.inspector || myName,
      date: isoFromAnyDate(qc.date) || todayIso(),
      clientNotes: qc.clientNotes || '',
      notifyManager: !!qc.notifyManager,
      // Un QC que no pasó se reabre para re-inspeccionar: el resultado se elige de nuevo.
      outcome: null,
      reclean: qc.reclean !== false,
    });
    setHasUnsavedChanges(false);
    setLastSavedAt(null);
    setIsFormModalOpen(true);
  };

  // ⭐ Cierre REAL del panel. No pregunta nada: lo usan "Save QC" (con resultado)
  //    y el cierre con confirmacion.
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
    setHasUnsavedChanges(false);
    setLastSavedAt(null);
  };

  // ⭐ Salida por Cancel, la X, el fondo o Escape: SIEMPRE confirma, para que un
  //    toque accidental no descarte una inspeccion a medio llenar.
  const handleRequestCloseForm = () => {
    const msg = hasUnsavedChanges
      ? '⚠ Tienes cambios SIN GUARDAR en esta inspeccion.\n\n¿Cerrar de todos modos? Se perderan los cambios no guardados.'
      : '¿Cerrar esta inspeccion?';
    if (!window.confirm(msg)) return;
    handleCloseForm();
  };

  // ⭐ Ref con el contexto vivo para el listener de teclado: evita re-suscribir
  //    el efecto en cada render y siempre lee el estado mas reciente.
  const escCtxRef = useRef({ cameraOpen: false, requestClose: () => { } });
  escCtxRef.current = { cameraOpen, requestClose: handleRequestCloseForm };

  // ⭐ Mientras la inspeccion esta abierta:
  //    1) Se BLOQUEA el scroll del fondo (el panel vive en un portal sobre <body>).
  //    2) Escape pide cerrar (con la misma confirmacion que la X). Si la camara
  //       rafaga esta abierta, Escape no cierra el formulario.
  useEffect(() => {
    if (!isFormModalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (escCtxRef.current.cameraOpen) return;
      escCtxRef.current.requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isFormModalOpen]);

  // ⭐ Punto 7: marcar que las correcciones de un Recall ya fueron hechas.
  //    Queda registrado quién y cuándo; visible como chip verde en la fila/tarjeta.
  const handleCorrectionsDone = async (qc: QCRecord) => {
    if (!qc.id) return;
    if (!window.confirm('¿Marcar que las correcciones de este Recall ya fueron hechas?')) return;
    const by = currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown';
    const at = new Date().toISOString();
    try {
      await qualityChecks.markCorrectionsDone(qc.id as string, at, by);
    } catch (e) {
      console.error('Error marcando correcciones:', e);
      alert('No se pudieron marcar las correcciones.');
    }
  };

  // ⭐ Agrega al batch del QC el movimiento de la casa (status + status_history)
  //    y, en la misma escritura de la casa, los campos extra (retener o liberar
  //    la factura). Devuelve true si el status cambió.
  const addHouseMoveAfterQC = (
    batch: WriteBatch, house: Property, targetStatusId: string | null, extra: Partial<Property>, reason?: string,
  ): boolean =>
    addStatusChange(batch, house, targetStatusId, {
      statuses,
      actor: currentUser,
      source: 'quality_check',
      ...(reason ? { reason } : {}),
    }, extra);

  // ⭐ "Save QC". Sin resultado elegido guarda el avance y deja el panel
  //    abierto (lo que antes hacía "Done"). Con resultado TERMINA la inspección:
  //    · Invoice → aprobado (lo que antes hacía "Save All"): la casa pasa a
  //      "Quality Check" y, si tenía la factura retenida, se libera.
  //    · RECALL  → no pasó. Con "Create re-clean job" la casa pasa a Recall para
  //      que el equipo la corrija y la factura queda retenida hasta que un QC
  //      pase; sin esa marca solo queda registrado (la casa va a "Quality Check").
  //    · "Notify property manager" abre el email con el reporte al terminar.
  const handleSaveQC = async () => {
    if (!selectedHouse) return;
    const editing = editingQcId ? qcList.find(q => q.id === editingQcId) : undefined;
    // Editar un reporte YA terminado sin elegir resultado (p. ej. para corregir
    // una foto) conserva su estado y resultado, y no mueve la casa.
    const keepFinished = qcExtras.outcome === null && editing?.status === 'Finished';
    const outcome = keepFinished ? (editing?.outcome ?? null) : qcExtras.outcome;
    const forceFail = !keepFinished && outcome === 'recall';
    const isFinishing = !keepFinished && outcome !== null;
    const reclean = forceFail && qcExtras.reclean;

    if (isFinishing && Object.values(pendingPhotos).some(list => list.length > 0)) {
      alert('Espera a que terminen de subir las fotos antes de terminar la inspección.');
      return;
    }

    if (isFinishing && outcome === 'invoice' && !window.confirm('¿Terminar la inspección como APROBADA (Invoice)? Se cerrará el panel.')) return;
    if (forceFail) {
      const ok = window.confirm(reclean
        ? '¿Marcar este Quality Check como "RECALL"? La casa pasará a Recall para que el equipo la corrija, y la factura quedará retenida hasta que un QC pase.\n\nSe cerrará el panel.'
        : '¿Marcar este Quality Check como "RECALL" sin crear re-clean? Quedará registrado como no aprobado y la casa no pasará a Recall.\n\nSe cerrará el panel.');
      if (!ok) return;
    }

    setIsSaving(true);

    // Sin resultado elegido la inspección sigue abierta (Pending), aunque todo
    // esté respondido: se termina solo con Invoice o RECALL.
    const finalStatus: 'Pending' | 'Finished' = (isFinishing || keepFinished) ? 'Finished' : 'Pending';
    const finalResult: 'passed' | 'failed' | null = keepFinished
      ? (editing?.result ?? 'passed')
      : forceFail ? 'failed' : (finalStatus === 'Finished' ? 'passed' : null);

    // ⭐ Sellar la SALIDA y calcular la duración total de la inspección.
    const nowIso = new Date().toISOString();
    const startIso = checkInAt || editing?.checkInAt || nowIso;
    const durationMinutes = (() => {
      const a = new Date(startIso).getTime();
      const b = new Date(nowIso).getTime();
      return (!isNaN(a) && !isNaN(b) && b >= a) ? Math.round((b - a) / 60000) : null;
    })();

    // ⭐ Punto 8: por cada área, registrar en sus notas QUÉ tareas se marcaron "No"
    //    (sale en el PDF). Marcador propio para no duplicarse al re-guardar.
    const NO_MARKER = '⚠ Marcado "No": ';
    const qcDataWithNoNotes: QcFormData = { ...qcData };
    qcSections.forEach(s => {
      const entry = qcDataWithNoNotes[s.id];
      if (!entry) return;
      const noNames = s.tasks.filter(t => entry.tasks?.[t.id] === 'No').map(t => t.name);
      const baseNotes = String(entry.notes || '')
        .split('\n')
        .filter(line => !line.startsWith(NO_MARKER))
        .join('\n')
        .trim();
      const autoLine = noNames.length > 0 ? `${NO_MARKER}${noNames.join(', ')}` : '';
      qcDataWithNoNotes[s.id] = { ...entry, notes: [baseNotes, autoLine].filter(Boolean).join('\n') };
    });

    // ⭐ Resultado (%) con el util compartido: el mismo número que sale en el PDF.
    const qcScore = computeQCScore(qcDataWithNoNotes, tasks);
    const inspectorName = qcExtras.inspectorName || myName;
    const teamName = editing?.team || getTeamNameForHouse(selectedHouse);
    const recordDate = qcExtras.date || editing?.date || todayIso();

    const recordData = {
      houseId: selectedHouse.id,
      date: recordDate,
      address: selectedHouse.address,
      client: selectedHouse.client,
      team: teamName,
      status: finalStatus,
      result: finalResult,
      inspector: inspectorName,
      inspectorId: qcExtras.inspectorId || '',
      checkInAt: startIso,
      checkOutAt: nowIso,
      durationMinutes,
      // Áreas con al menos una respuesta (las vistas viejas leen este campo).
      selectedPlaces: qcSections.filter(s => Object.keys(qcData[s.id]?.tasks || {}).length > 0).map(s => s.id),
      qcData: qcDataWithNoNotes,
      passRate: qcScore.passRate,
      passRateAnswered: qcScore.totalAnswered,
      passRateVerdict: qcScore.verdict,
      clientNotes: qcExtras.clientNotes,
      notifyManager: qcExtras.notifyManager,
      outcome,
      reclean,
      // ⭐ Punto 9 (pestaña Reportes): sello de creación para medir la demora entre
      //    crear el registro y abrir la inspección (checkInAt - createdAt).
      createdAt: editing ? (editing as QCRecord & { createdAt?: string }).createdAt || startIso : nowIso,
    };

    try {
      // ⭐ TODO O NADA: el reporte, el status de la casa (con la factura
      //    retenida o liberada en la misma escritura) y su status_history viajan
      //    en UN batch. Antes eran escrituras sueltas: si fallaba la de la casa,
      //    el aviso decía "La casa pasó a Recall" sin que hubiera pasado y la
      //    factura quedaba sin retener. El id del reporte nuevo se genera aquí.
      const { batch, id: savedId } = qualityChecks.saveBatch(editingQcId, recordData);

      // ⭐ Status de la casa y factura retenida, según el resultado.
      const recallReason = 'No pasó Quality Check';
      let movedTo: string | null = null;
      if (reclean) {
        const target = getRecallStatusId() || getQualityCheckStatusId();
        if (addHouseMoveAfterQC(batch, selectedHouse, target,
          { invoiceHold: true, invoiceHoldAt: nowIso, invoiceHoldBy: inspectorName }, recallReason)) {
          movedTo = target;
        }
      } else if (isFinishing) {
        // La casa va a "Quality Check", salvo que ya esté en Invoice: aprobar el
        // QC nunca la regresa. Invoice libera la factura retenida (se mira la
        // casa cargada; si no está cargada por la ventana de 12 meses, se escribe
        // igual para no dejarla retenida).
        const fresh = propById.get(selectedHouse.id);
        const alreadyInvoiced = isInvoiceStatus(statuses, (fresh || selectedHouse).statusId);
        const releaseHold = outcome === 'invoice' && (!fresh || !!fresh.invoiceHold);
        const target = alreadyInvoiced ? null : getQualityCheckStatusId();
        if (addHouseMoveAfterQC(batch, selectedHouse, target, releaseHold ? { invoiceHold: false } : {})) {
          movedTo = target;
        }
      }
      // ⭐ NO se espera al servidor (H-07): el batch se aplica al instante en el
      //    teléfono (Firestore lo muestra en todas las listas) y se sube solo,
      //    también cuando vuelve la señal. Si el servidor lo rechaza, Firestore
      //    deshace el cambio local y se avisa. El correo sale DESPUÉS de que el
      //    servidor confirma, en segundo plano: el inspector ya no espera.
      const label = houseLogLabel(getClientName(selectedHouse.client), selectedHouse.address);
      const house = selectedHouse;
      const sendEmail = isFinishing && companySettings.autoSend && !!branding.email;
      batch.commit().then(
        async () => {
          if (movedTo) {
            afterStatusHistoryWrite();
            logStatusChange(house, movedTo, {
              statuses, actor: currentUser, source: 'quality_check', module: 'Quality Check', label,
              ...(reclean ? { reason: recallReason } : {}),
            });
          }
          if (!sendEmail) return;
          try {
            const res = await sendQCByEmail(house, qcDataWithNoNotes, inspectorName, recordDate, teamName);
            if (res && (res.status === 'error' || res.status === 'no-extension')) alert(`Quality Check de ${label}:\n${mailResultMessage(res, branding.email)}`);
          } catch (e) {
            console.error('No se pudo enviar el email automático:', e);
            alert(`Quality Check de ${label}: no se pudo encolar el reporte por email.`);
          }
        },
        (error: unknown) => {
          console.error('Error saving Quality Check:', error);
          const code = (error as { code?: string } | null)?.code || 'desconocido';
          alert(`No se guardó el Quality Check de ${label}: no se escribió nada (ni el reporte ni el status de la casa). Vuelve a abrirlo e inténtalo de nuevo.\n\nCódigo: ${code}`);
        },
      );

      // ⭐ Vincular este reporte a las fotos que quedaron en cola offline para esta
      //    casa, así el uploader las adjunta al documento cuando vuelva la señal.
      savedQcDocByHouse.current[house.id] = savedId;
      offlineSetDocIdForHouse(house.id, savedId).catch((e) => console.error(e)).finally(processQueue);

      // Un segundo "Save QC" ACTUALIZA este documento en vez de crear un duplicado.
      if (!editingQcId) setEditingQcId(savedId);
      setHasUnsavedChanges(false);
      setLastSavedAt(fmtTime(nowIso));

      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const movedName = movedTo ? statusNameOf(statuses, movedTo) : '';
      const emailNote = isFinishing && companySettings.autoSend && !branding.email
        ? '\n📧 Configura el email de la empresa para el envío automático (botón "Empresa").'
        : '';
      alert((keepFinished
        ? '✅ Cambios guardados.'
        : forceFail
        ? (reclean
          ? `⚠️ Quality Check marcado como RECALL. ${movedName ? `La casa pasó a ${movedName}` : 'La casa se quedó en su status actual'} y la factura quedó retenida hasta que un QC pase.`
          : '⚠️ Quality Check marcado como RECALL (sin re-clean).')
        : outcome === 'invoice'
          ? '✅ Quality Check aprobado.'
          : '✅ Avance guardado. Elige Invoice o RECALL en "Result" para terminar la inspección.')
        + (offline ? '\n\n📶 Sin señal: quedó guardado en este teléfono y se sube solo al volver la conexión.' : '')
        + emailNote);

      if (isFinishing) {
        handleCloseForm();
        if (qcExtras.notifyManager && canSeeOfficeNotes) {
          openNotifyManagerEmail(house, qcDataWithNoNotes, inspectorName, recordDate, teamName, qcExtras.clientNotes);
        }
      }
    } catch (error) {
      // Solo errores al ARMAR el batch (datos inválidos): no se escribió nada.
      console.error("Error saving Quality Check:", error);
      alert('No se guardó el Quality Check: no se escribió nada. Inténtalo de nuevo.');
    } finally {
      setIsSaving(false);
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
      const asFile = file instanceof File ? file : new File([file], `qc_${id}.jpg`, { type: file.type || 'image/jpeg' });
      // Optimizador: 1600px máx, calidad 0.8, objetivo ~0.6MB (buen balance peso/calidad)
      let compressed: File = asFile;
      try { compressed = await compressImage(asFile, { quality: 0.8, maxWidth: 1600, maxSizeMB: 0.6 }); }
      catch { compressed = asFile; }

      const online = typeof navigator === 'undefined' ? true : navigator.onLine;
      if (online) {
        try {
          const urls = await storageService.uploadQualityCheckPhotos([compressed], house.address, placeName);
          if (selectedHouseRef.current?.id === house.id) {
            appendPhotos(placeId, urls);
          } else {
            // El panel se cerró (o se abrió otra casa) mientras subía: va directo
            // al reporte ya guardado de ESTA casa, nunca al formulario abierto.
            const docId = savedQcDocByHouse.current[house.id];
            if (docId) for (const u of urls) await attachUrlToQcDoc(docId, placeId, u);
          }
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
    cameraShots.forEach(sh => { try { URL.revokeObjectURL(sh.preview); } catch { /* ya liberada */ } });
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
          setCameraError('Este navegador no permite la cámara dentro de la app. Usa "Galería".');
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
        setCameraError('No se pudo acceder a la cámara. Revisa los permisos o usa "Galería".');
      }
    })();
    return () => {
      cancelled = true;
      const st = streamRef.current;
      if (st) { st.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    };
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

  // ⭐ El generador del PDF vive ahora en src/utils/qcReportPdf.ts (compartido con
  //    la pestaña Reportes). Estos wrappers solo aportan el contexto de esta vista.
  const collectPlacesWithData = (qcDataObj: QcFormData) => collectPlacesWithDataUtil(places, qcDataObj);

  const buildAndExportQCPDF = async (
    house: Property,
    qcDataObj: QcFormData,
    inspectorName: string,
    recordDate?: string,
    setLoading?: (loading: boolean) => void,
    teamNameOverride?: string,
    options?: { returnHtml?: boolean }
  ): Promise<string | void> => {
    return exportQCReportPDF({
      house: { address: house.address || '' },
      clientName: getClientName(house.client),
      teamName: teamNameOverride || getTeamNameForHouse(house),
      qcData: qcDataObj,
      inspectorName,
      recordDate,
      places,
      tasks,
      branding,
      setLoading,
      returnHtml: options?.returnHtml === true,
    });
  };

  // ⭐ ENVIAR POR WHATSAPP. Reutiliza el MISMO HTML que produce el PDF
  //    (returnHtml), asi el reporte que se comparte es identico al que se
  //    imprime: una sola maquetacion que mantener.
  const [isSharing, setIsSharing] = useState(false);

  // ⭐ PASO 1 de 2. Solo GENERA el PDF y abre la hoja "Reporte listo".
  //    NO llama aquí a navigator.share: tras el await la activación por gesto
  //    de iOS ya expiró y la llamada falla en silencio (era la causa de que el
  //    botón no hiciera nada). El envío real ocurre con el segundo toque, ya
  //    dentro de ShareReportSheet.
  const [shareReady, setShareReady] = useState<PreparedQCShare | null>(null);
  const [shareClient, setShareClient] = useState('');

  const handleShareWhatsApp = async (
    house: Property,
    qcDataObj: QcFormData,
    inspectorName: string,
    dateStr?: string,
    teamNameOverride?: string,
    failed?: boolean,
  ) => {
    if (collectPlacesWithData(qcDataObj).length === 0) {
      alert('Esta inspección no tiene tareas evaluadas, notas ni fotos: no hay nada que enviar.');
      return;
    }
    setIsSharing(true);
    try {
      const html = await buildAndExportQCPDF(
        house, qcDataObj, inspectorName, dateStr, undefined, teamNameOverride, { returnHtml: true },
      );
      if (!html || typeof html !== 'string') {
        alert('No se pudo generar el reporte.');
        return;
      }
      const score = computeQCScore(qcDataObj, tasks);
      const clientName = getClientName(house.client);
      const prepared = await prepareQCShare(html, {
        clientName,
        address: house.address || '',
        date: dateStr,
        inspectorName,
        teamName: teamNameOverride || getTeamNameForHouse(house),
        passRate: score.hasData ? score.passRate : null,
        failed,
      });
      setShareClient(clientName);
      setShareReady(prepared);
    } catch (e) {
      console.error('Error preparando el reporte para compartir:', e);
      alert('No se pudo generar el PDF del reporte. Revisa la consola.');
    } finally {
      setIsSharing(false);
    }
  };

  // ⭐ Enviar automáticamente el reporte al email de la empresa.
  //    Escribe en la colección "mail" (extensión Firebase "Trigger Email").
  //    ⭐ Devuelve el resultado REAL del envio. Escribir en `mail` solo ENCOLA;
  //       quien despacha es la extension Trigger Email. Si no esta instalada, el
  //       documento se guarda igual y antes se anunciaba "enviado" sin que
  //       saliera ningun correo. Ver src/utils/sendMail.ts.
  const sendQCByEmail = async (house: Property, qcDataObj: QcFormData, inspector: string, dateStr?: string, teamNameOverride?: string) => {
    const to = branding.email;
    if (!to) return null;
    if (collectPlacesWithData(qcDataObj).length === 0) return null;
    const html = await buildAndExportQCPDF(house, qcDataObj, inspector, dateStr, undefined, teamNameOverride, { returnHtml: true });
    if (!html || typeof html !== 'string') return null;
    const { subject } = buildEmail(house, qcDataObj, inspector, dateStr, teamNameOverride);
    return sendMailAndConfirm(to, subject, html);
  };

  const handleExportFromModal = async () => {
    if (!selectedHouse) return;
    await buildAndExportQCPDF(selectedHouse, qcData, qcExtras.inspectorName || myName, qcExtras.date || undefined, setIsExportingPDF);
  };

  // ⭐ Resumen rápido (para el cuerpo del email)
  const qcSummary = (qcDataObj: QcFormData) => {
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
  const buildEmail = (house: Property, qcDataObj: QcFormData, inspector: string, dateStr?: string, teamNameOverride?: string, clientNotes?: string) => {
    const clientName = getClientName(house.client);
    const team = teamNameOverride || getTeamNameForHouse(house);
    const niceDate = formatDate(dateStr || todayIso());
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
      ...(clientNotes && clientNotes.trim() ? ['', 'Notes:', clientNotes.trim()] : []),
      '',
      'The full report, including task results and photographic evidence, is attached as a PDF.',
      '',
      'Best regards,',
      'Precise Cleaning',
    ].join('\r\n');
    return { subject, body };
  };

  const openEmailForCurrent = () => {
    if (!selectedHouse) return;
    setEmailTo(branding.email || DEFAULT_EMAIL_TO);
    const inspector = qcExtras.inspectorName || myName;
    const dateStr = qcExtras.date || todayIso();
    setEmailCtx(buildEmail(selectedHouse, qcData, inspector, dateStr, undefined, canSeeOfficeNotes ? qcExtras.clientNotes : ''));
    setEmailExport(() => () => handleExportFromModal());
    setEmailModalOpen(true);
  };

  // ⭐ "Notify property manager": al terminar el QC abre el email al cliente
  //    (su correo en Customers; si no tiene, el de la empresa) con el resumen,
  //    las "Notes for client" y el PDF para adjuntar.
  const openNotifyManagerEmail = (
    house: Property, qcDataObj: QcFormData, inspector: string, dateStr: string, teamName: string, clientNotes: string,
  ) => {
    const c = String(house.client || '');
    const customer = customersList.find(x => x.id === c || x.legacyId === c || x.name === c);
    setEmailTo(String(customer?.email || '').trim() || branding.email || DEFAULT_EMAIL_TO);
    setEmailCtx(buildEmail(house, qcDataObj, inspector, dateStr, teamName, clientNotes));
    setEmailExport(() => () => buildAndExportQCPDF(house, qcDataObj, inspector, dateStr, undefined, teamName).then(() => undefined));
    setEmailModalOpen(true);
  };

  const sendEmail = () => {
    if (!emailCtx) return;
    const to = emailTo.trim();
    if (!to) { alert('Ingresa un correo de destino.'); return; }

    // ⭐ ARREGLO: antes esto hacia `await emailExport()` ANTES del mailto.
    //    Ese export abre una ventana con window.open, que en iOS se bloquea
    //    como popup y ademas consume la activacion por gesto: cuando llegaba
    //    el `location.href = mailto:` el navegador ya no lo obedecia y no
    //    pasaba nada. Ahora el mailto se dispara PRIMERO y de forma sincrona,
    //    que es lo unico que el usuario pidio con este boton.
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(emailCtx.subject)}&body=${encodeURIComponent(emailCtx.body)}`;
    window.location.href = mailto;
    setEmailModalOpen(false);

    // El PDF se genera despues, sin bloquear la apertura del correo. Si el
    // usuario quiere adjuntarlo, lo tendra descargado al volver.
    if (emailExport) {
      setTimeout(() => {
        Promise.resolve(emailExport()).catch(e => console.error('Error generando el PDF adjunto:', e));
      }, 800);
    }
  };

  // ⭐ Pass / Fail de una tarea (null = sin responder).
  const setTaskValue = (placeId: string, taskId: string, value: QcAnswer | null) => {
    setQcData(prev => {
      const place = prev[placeId] || { tasks: {} };
      const nextTasks = { ...(place.tasks || {}) };
      if (value) nextTasks[taskId] = value; else delete nextTasks[taskId];
      return { ...prev, [placeId]: { ...place, tasks: nextTasks } };
    });
    setHasUnsavedChanges(true);
  };

  // ⭐ "Notes for the team": se guardan como las notas del área General.
  const setTeamNotes = (value: string) => {
    setQcData(prev => ({ ...prev, [GENERAL_SLOT]: { ...(prev[GENERAL_SLOT] || {}), notes: value } }));
    setHasUnsavedChanges(true);
  };

  const updateExtras = (patch: Partial<QcExtras>) => {
    setQcExtras(prev => ({ ...prev, ...patch }));
    setHasUnsavedChanges(true);
  };

  // ⭐ Secciones del checklist: las áreas activas de la casa (en su orden manual)
  //    que tienen tareas sin archivar. Las archivadas siguen en `tasks` para que
  //    el puntaje y el PDF de los reportes viejos las encuentren por id.
  const qcSections: QcSection[] = activePlacesFor(selectedHouse)
    .map((place) => ({
      id: place.id,
      name: place.name,
      tasks: tasks
        .filter((task) => task.placeId === place.id && isActiveTask(task))
        .map((task) => ({ id: task.id, name: task.name })),
    }))
    .filter((section) => section.tasks.length > 0);

  // ⭐ "Edit checklist": cambian el catálogo (Settings → Places / Tasks), así
  //    que valen para todas las casas. El listener del store muestra el cambio.
  const handleMoveChecklistSection = async (section: QcSection, positionOffset: -1 | 1) => {
    const visibleSectionIds = qcSections.map((visibleSection) => visibleSection.id);
    const neighborSectionId = visibleSectionIds[visibleSectionIds.indexOf(section.id) + positionOffset];
    if (!neighborSectionId) return;
    // Se intercambia con el área de al lado que se ve en esta casa, dentro del
    // orden completo de todas las áreas.
    const reorderedPlaces = [...places];
    const sectionPosition = reorderedPlaces.findIndex((place) => place.id === section.id);
    const neighborPosition = reorderedPlaces.findIndex((place) => place.id === neighborSectionId);
    [reorderedPlaces[sectionPosition], reorderedPlaces[neighborPosition]] =
      [reorderedPlaces[neighborPosition], reorderedPlaces[sectionPosition]];
    try {
      await settingsPlacesService.saveOrder(reorderedPlaces);
      void logActivity({
        action: 'update', module: 'Quality Check', user: currentUser, targetId: section.id, targetLabel: section.name,
        detail: `Área movida ${positionOffset < 0 ? 'arriba' : 'abajo'} en el checklist`,
      });
    } catch (error) {
      console.error('Error ordenando las áreas del checklist:', error);
      alert('No se pudo cambiar el orden de las áreas. Inténtalo de nuevo.');
    }
  };

  const handleAddChecklistTask = async (section: QcSection, taskName: string) => {
    try {
      const newTaskId = await settingsTasksService.create({ placeId: section.id, name: taskName });
      void logActivity({
        action: 'create', module: 'Quality Check', user: currentUser, targetId: newTaskId,
        targetLabel: `${section.name} · ${taskName}`, detail: 'Tarea agregada al checklist',
      });
    } catch (error) {
      console.error('Error agregando la tarea al checklist:', error);
      alert('No se pudo agregar la tarea. Inténtalo de nuevo.');
    }
  };

  const handleRenameChecklistTask = async (section: QcSection, task: QcSectionTask, name: string) => {
    try {
      await settingsTasksService.rename(task.id, name);
      void logActivity({
        action: 'update', module: 'Quality Check', user: currentUser, targetId: task.id,
        targetLabel: `${section.name} · ${name}`, changes: [{ field: 'name', before: task.name, after: name }],
      });
    } catch (error) {
      console.error('Error renombrando la tarea del checklist:', error);
      alert('No se pudo cambiar el nombre de la tarea. Inténtalo de nuevo.');
    }
  };

  const handleRemoveChecklistTask = async (section: QcSection, task: QcSectionTask) => {
    if (!window.confirm(`¿Quitar "${task.name}" del checklist de ${section.name}?\n\nYa no saldrá en las inspecciones nuevas de ninguna casa; los reportes anteriores la siguen mostrando.`)) return;
    try {
      await settingsTasksService.archive(task.id);
      void logActivity({
        action: 'update', module: 'Quality Check', user: currentUser, targetId: task.id,
        targetLabel: `${section.name} · ${task.name}`, detail: 'Tarea quitada del checklist (archivada)',
      });
    } catch (error) {
      console.error('Error quitando la tarea del checklist:', error);
      alert('No se pudo quitar la tarea. Inténtalo de nuevo.');
    }
  };

  // ⭐ Inspectores: usuarios activos (más el actual, aunque su perfil esté incompleto).
  const inspectorOptions = useMemo(() => {
    const list = usersLive.data
      .filter(u => u.status !== 'Inactive')
      .map(u => ({ id: u.id, name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (currentUser?.id && !list.some(u => u.id === currentUser.id)) list.unshift({ id: currentUser.id, name: myName });
    return list;
  }, [usersLive.data, currentUser?.id, myName]);

  // ⭐ Notas que el inspector lee antes de empezar (historial de notas de la casa).
  const authorName = (email: string) => {
    const u = usersLive.data.find(x => String(x.email || '').toLowerCase() === String(email || '').toLowerCase());
    const full = u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '';
    return full || String(email || '?').split('@')[0];
  };
  const noteItems = (house: Property, field: 'note' | 'officeNote' | 'employeeNote'): QcNoteItem[] => {
    const items = (house.notesHistory || [])
      .filter(e => e.field === field && String(e.text || '').trim() !== '')
      .map((e, i) => ({ key: `${field}-${i}-${e.at}`, text: e.text, author: authorName(e.user), at: e.at }));
    const g = house as PropertyNotes;
    const current = String((field === 'note' ? g.note || g.generalNotes : g[field]) || '').trim();
    if (items.length === 0 && current) items.push({ key: `${field}-legacy`, text: current, author: 'Nota anterior', at: '' });
    return items;
  };

  // ⭐ Fotos del panel. Cada área del checklist (Porch, Rooms…) tiene las suyas
  //    debajo de sus tareas (`qcData[placeId].photos`, como siempre: así salen en
  //    el PDF por área). "Other photos" muestra las del área General y las de
  //    áreas que ya no salen en el checklist (inspecciones viejas), para no perderlas.
  const getSavedPhotoItems = (photoSlots: string[]): QcPhotoItem[] =>
    photoSlots.flatMap(photoSlot => ((qcData[photoSlot]?.photos ?? []) as string[])
      .map((url, index) => ({ key: `${photoSlot}-${url}`, url, slot: photoSlot, index })));
  const checklistSectionIds = new Set(qcSections.map(section => section.id));
  const generalPhotoSlots = [
    GENERAL_SLOT,
    ...places.map(place => place.id).filter(placeId => !checklistSectionIds.has(placeId)),
  ];
  const getSlotName = (photoSlot: string) => {
    if (photoSlot === GENERAL_SLOT) return GENERAL_SLOT_NAME;
    if (photoSlot === OFFICE_SLOT) return OFFICE_SLOT_NAME;
    return places.find(place => place.id === photoSlot)?.name ?? photoSlot;
  };
  const renderPhotoGrid = (slot: string, shownSlots: string[], tone: 'plain' | 'card') => (
    <QcPhotoGrid
      tone={tone}
      saved={getSavedPhotoItems(shownSlots)}
      pending={shownSlots.flatMap(photoSlot => pendingPhotos[photoSlot] ?? [])}
      queued={shownSlots.flatMap(photoSlot => queuedByPlace[queueKey(selectedHouse?.id ?? '', photoSlot)] ?? [])}
      onCamera={() => openBurstCamera({ id: slot, name: getSlotName(slot) })}
      onPickFiles={(files) => handlePhotoUpload(slot, getSlotName(slot), files)}
      onRemove={(item) => handleRemovePhoto(item.slot, item.index)}
      onAnnotate={(item) => setAnnotate({ placeId: item.slot, index: item.index, url: item.url })}
    />
  );
  const renderSectionPhotos = (section: QcSection) => renderPhotoGrid(section.id, [section.id], 'plain');

  // ⭐ Tarjetas de casa (pendientes y Recall): datos y acciones comunes.
  /** Último reporte que NO pasó de una casa (las correcciones de Recall se marcan ahí). */
  const getLatestFailedReport = (house: Property): QCRecord | undefined => [...qcList]
    .filter((report) => report.houseId === house.id && report.status === 'Finished' && report.result === 'failed')
    .sort((firstReport, secondReport) => String(secondReport.date ?? '').localeCompare(String(firstReport.date ?? '')))[0];

  const handleMarkCorrectionsDone = (house: Property) => {
    const latestFailedReport = getLatestFailedReport(house);
    if (latestFailedReport) void handleCorrectionsDone(latestFailedReport);
  };

  const getHouseCardProps = (house: Property) => {
    const houseStatus = houseStatusInfo(house);
    return {
      house,
      clientName: getClientName(house.client),
      teamName: getTeamNameForHouse(house),
      houseNote: houseNote(house),
      officeNote: canSeeOfficeNotes ? houseOfficeNote(house) : '',
      statusName: houseStatus.name,
      statusColor: houseStatus.color,
      isInRoute: isHouseInRoute(house.id),
      isInspectDisabled: isLoadingCatalogs,
      onOpenDetail: (openedHouse: Property) => onOpenHouseDetail?.(openedHouse),
      onChangeStatus: openHouseStatusModal,
      onToggleRoute: toggleRouteHouse,
      onInspect: handleStartOrContinueQC,
      onEdit: (editedHouse: Property) => onOpenHouseEdit?.(editedHouse),
      onDelete: (deletedHouse: Property) => houseTrash.request(deletedHouse),
      onMarkCorrectionsDone: handleMarkCorrectionsDone,
    };
  };

  return (
    <div className="fade-in qc-view qcv-page">
      <header className="main-header qcv-header">
        <div className="view-header-title-group">
          <MenuButton onClick={onOpenMenu} />
          <div className="qcv-header-title-wrap">
            <h1 className="qcv-header-title">Quality Check Reports</h1>
            <p className="qcv-header-subtitle">History and status of house inspections</p>
          </div>
        </div>
      </header>
      <HistoryWindowNotice />

      {/* ⭐ Periodo (Schedule Date) con el buscador, "Copiar direcciones" y
          All / Pending / Recall dentro de la misma barra. */}
      <div className="qcv-period">
        <PeriodBar period={housesPeriod} onChange={setHousesPeriod}>
          <QcHouseFilters
            searchText={tableSearch}
            selectedGroup={statusFilter}
            houseCountByGroup={groupCounts}
            onSearchTextChange={setTableSearch}
            onSelectGroup={setStatusFilter}
            onCopyAddresses={copyQCAddresses}
          />
        </PeriodBar>
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
            {filteredPendingHouses.map((house) => (
              <QcHouseCard
                key={house.id}
                {...getHouseCardProps(house)}
                variant={houseFailedQC(house.id, qcList) ? 'failed' : 'pending'}
                corrections={null}
              />
            ))}
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
            {filteredRecallHouses.map((house) => {
              const latestFailedReport = getLatestFailedReport(house);
              return (
                <QcHouseCard
                  key={house.id}
                  {...getHouseCardProps(house)}
                  variant="recall"
                  corrections={latestFailedReport
                    ? { doneAt: latestFailedReport.correctionsDoneAt ?? null, doneBy: latestFailedReport.correctionsDoneBy ?? null }
                    : null}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ⭐ QUALITY CHECK REPORTS: inspecciones terminadas, debajo de Recall.
          Se abre a pedido (carga todos los reportes solo al abrirse). */}
      {!isLoadingCatalogs && canSeeQcReports && (
        <QcReportsBlock
          properties={properties}
          currentUser={currentUser}
          activeRole={activeRole}
          isSuperAdmin={isSuperAdmin}
        />
      )}

      {/* ═══════════ PANEL DE INSPECCIÓN (Quality Check) ═══════════ */}
      {/* ⭐ createPortal(document.body): si algún ancestro crea un bloque
          contenedor (transform de una animación, etc.) un position:fixed se
          degrada; en <body> el panel queda siempre al frente del viewport. */}
      {isFormModalOpen && selectedHouse && createPortal(
        <div className="qcd-overlay" onClick={handleRequestCloseForm}>
          <div className="qcd-stop" onClick={e => e.stopPropagation()}>
            <QcCheckDrawer
              address={selectedHouse.address || ''}
              subtitle={[
                getClientName(selectedHouse.client),
                formatDateMDY(selectedHouse.scheduleDate),
                getTeamNameForHouse(selectedHouse),
              ].filter(x => x && x !== '—').join(' · ')}
              headerActions={(
                <>
                  <button type="button" onClick={handleExportFromModal} title="Exportar PDF" aria-label="Exportar PDF" disabled={isExportingPDF} className="qcd-icon-btn">
                    {isExportingPDF ? <Loader2 size={16} className="spin-qc" /> : <Printer size={16} />}
                  </button>
                  {/* ⭐ WhatsApp: en movil abre la hoja del sistema con el PDF ya
                      adjunto; en escritorio descarga el PDF y abre WhatsApp Web. */}
                  <button
                    type="button"
                    onClick={() => handleShareWhatsApp(selectedHouse, qcData, qcExtras.inspectorName || myName, qcExtras.date)}
                    title="Enviar por WhatsApp"
                    aria-label="Enviar por WhatsApp"
                    disabled={isSharing}
                    className="qcd-icon-btn whatsapp"
                  >
                    {isSharing ? <Loader2 size={16} className="spin-qc" /> : <Send size={16} />}
                  </button>
                  <button type="button" onClick={openEmailForCurrent} title="Enviar por email" aria-label="Enviar por email" className="qcd-icon-btn">
                    <Mail size={16} />
                  </button>
                </>
              )}
              onClose={handleRequestCloseForm}
              officeNotes={[
                ...noteItems(selectedHouse, 'note'),
                ...(canSeeOfficeNotes ? noteItems(selectedHouse, 'officeNote') : []),
              ].sort((x, y) => String(x.at).localeCompare(String(y.at)))}
              cleanerNotes={noteItems(selectedHouse, 'employeeNote')}
              teamName={getTeamNameForHouse(selectedHouse) === 'Unassigned' ? '' : getTeamNameForHouse(selectedHouse)}
              cleanerPhotos={[...(selectedHouse.afterPhotos || []), ...(selectedHouse.beforePhotos || [])]}
              inspectors={inspectorOptions}
              extras={qcExtras}
              onExtras={updateExtras}
              sections={qcSections}
              answers={Object.fromEntries(qcSections.map(sec => [sec.id, qcData[sec.id]?.tasks]))}
              onAnswer={setTaskValue}
              renderSectionPhotos={renderSectionPhotos}
              canAddChecklistTasks={canAddChecklistTasks}
              canEditChecklistTasks={canEditChecklistTasks}
              canRemoveChecklistTasks={canRemoveChecklistTasks}
              onMoveChecklistSection={handleMoveChecklistSection}
              onAddChecklistTask={handleAddChecklistTask}
              onRenameChecklistTask={handleRenameChecklistTask}
              onRemoveChecklistTask={handleRemoveChecklistTask}
              generalPhotos={renderPhotoGrid(GENERAL_SLOT, generalPhotoSlots, 'plain')}
              officePhotos={renderPhotoGrid(OFFICE_SLOT, [OFFICE_SLOT], 'card')}
              showOffice={canSeeOfficeNotes}
              teamNotes={String(qcData[GENERAL_SLOT]?.notes || '')}
              onTeamNotes={setTeamNotes}
              saving={isSaving}
              saveState={hasUnsavedChanges
                ? <span className="dirty">Cambios sin guardar</span>
                : lastSavedAt
                  ? <span className="ok"><Check size={13} /> Guardado {lastSavedAt}</span>
                  : null}
              onSave={handleSaveQC}
            />
          </div>
        </div>,
        document.body,
      )}

      {/* ═══════════ CÁMARA EN RÁFAGA ═══════════ */}
      {/* ⭐ Tambien en portal: es pantalla completa (fixed) y sufre el mismo
          problema de bloque contenedor que el modal de inspeccion. */}
      {cameraOpen && createPortal(
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
        </div>,
        document.body,
      )}

      {/* ═══════════ MODAL: CAMBIAR STATUS DE LA CASA ═══════════ */}
      {/* ⭐ Ahora usa el MISMO modal (grid de estados con colores) que Houses,
          Pipeline e Invoices, en vez de un <select> propio. La lista se limita a
          los cuatro estados que tienen sentido en el flujo de calidad. */}
      {/* ⭐ PASO 2 de 2: aqui el envio lo dispara un toque NUEVO del usuario, con
          activacion por gesto fresca, que es lo que iOS exige. */}
      {shareReady && (
        <ShareReportSheet
          prepared={shareReady}
          clientName={shareClient}
          onClose={() => setShareReady(null)}
        />
      )}

      {/* ⭐ Borrar con motivo → papelera (mismo diálogo que Houses) */}
      {houseTrash.target && (
        <DeleteHouseDialog
          label={houseTrash.label}
          busy={houseTrash.busy}
          onCancel={houseTrash.cancel}
          onConfirm={(reason) => void houseTrash.confirm(reason)}
        />
      )}

      {statusModalHouse && (
        <StatusChangeModal
          config={{
            currentId: String(houseStatusInfo(statusModalHouse).id || ''),
            onSelect: (id: string) => { if (!savingStatus) applyHouseStatusChange(id); },
            title: getClientName(statusModalHouse.client),
            subtitle: statusModalHouse.address || undefined,
          }}
          statuses={allowedStatuses}
          note='Desde Quality Check una casa solo puede moverse a "In Progress", "Quality Check", "Recall" o "Invoice".'
          onClose={() => setStatusModalHouse(null)}
        />
      )}

      {/* ═══════════ MODAL: EMAIL ═══════════ */}
      {emailModalOpen && emailCtx && createPortal(
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
        </div>,
        document.body,
      )}

      {/* ═══════════ EDITOR DE FOTO (dibujar estilo WhatsApp) ═══════════ */}
      {/* ⭐ En portal: es pantalla completa (fixed) y se abre desde dentro del
          modal de inspeccion, que ahora tambien vive en <body>. */}
      {annotate && createPortal(
        <PhotoAnnotator
          imageUrl={annotate.url}
          saving={savingAnnotation}
          onCancel={() => setAnnotate(null)}
          onSave={handleSaveAnnotation}
        />,
        document.body,
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
};

export default QualityCheckView;
