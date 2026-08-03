import { collection, addDoc, query, orderBy, limit, getDocs, startAfter, where, Timestamp, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '../config/firebase';

/* ------------------------------------------------------------------
   activityLogService.ts — Bitacora de actividad de la app

   Escribe un documento en `activity_logs` por cada accion relevante:
   alta, edicion (con los campos que cambiaron), borrado, cambio de
   status, sincronizacion con Google Calendar, subida de fotos, etc.

   LIMITACION IMPORTANTE: esto registra desde el cliente, o sea que solo
   queda constancia de lo que pasa por las pantallas instrumentadas. Un
   cambio hecho directo en la consola de Firebase, desde un script o
   desde una pantalla todavia no instrumentada NO aparece aqui. Para una
   bitacora realmente a prueba de huecos hace falta un trigger de Cloud
   Functions sobre la coleccion (onDocumentWritten), que ve todos los
   cambios sin importar de donde vengan.
   ------------------------------------------------------------------ */

export type LogAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'status_change'
  | 'calendar_sync'
  | 'photo_upload'
  | 'login'
  | 'export';

export interface LogFieldChange {
  field: string;
  before: string;
  after: string;
}

export interface ActivityLogEntry {
  id: string;
  /** Fecha ISO del evento */
  at: string;
  /** Quien lo hizo */
  userId: string;
  userName: string;
  /** Que hizo */
  action: LogAction;
  /** Sobre que modulo/coleccion */
  module: string;
  /** Id del documento afectado */
  targetId?: string;
  /** Texto legible del objetivo (cliente, direccion...) para no tener que abrirlo */
  targetLabel?: string;
  /** Campos que cambiaron (solo en update) */
  changes?: LogFieldChange[];
  /** Detalle libre para acciones que no son un diff */
  detail?: string;
}

/** Campos que nunca se comparan: ruido o demasiado pesados para la bitacora. */
const IGNORED_FIELDS = new Set([
  'id',
  'beforePhotos',
  'afterPhotos',
  'beforePhotosExcluded',
  'afterPhotosExcluded',
  'updatedAt',
  'createdAt',
  'description',
]);

/** Convierte cualquier valor a algo corto y legible en la bitacora. */
const toText = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.length === 0 ? '' : `${v.length} elemento(s)`;
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 120);
  const s = String(v);
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
};

/**
 * Compara dos versiones de un documento y devuelve solo lo que cambio.
 * Se usa para que la bitacora diga "Team: 6 -> 10" en vez de "se edito".
 */
export const diffObjects = (
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): LogFieldChange[] => {
  const a = before || {};
  const b = after || {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changes: LogFieldChange[] = [];
  keys.forEach((k) => {
    if (IGNORED_FIELDS.has(k)) return;
    const av = toText(a[k]);
    const bv = toText(b[k]);
    if (av !== bv) changes.push({ field: k, before: av, after: bv });
  });
  return changes;
};

interface LogInput {
  action: LogAction;
  module: string;
  user?: { id?: string; firstName?: string; lastName?: string; name?: string } | null;
  targetId?: string;
  targetLabel?: string;
  changes?: LogFieldChange[];
  detail?: string;
}

const userLabel = (u: LogInput['user']): string => {
  if (!u) return 'Desconocido';
  const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return full || u.name || u.id || 'Desconocido';
};

/**
 * Registra un evento. NUNCA lanza: si la bitacora falla, la accion del
 * usuario ya ocurrio y no tiene sentido romperle la pantalla por eso.
 */
export const logActivity = async (input: LogInput): Promise<void> => {
  try {
    // Un update sin campos cambiados no aporta nada: no se guarda.
    if (input.action === 'update' && input.changes && input.changes.length === 0) return;

    await addDoc(collection(db, 'activity_logs'), {
      at: new Date().toISOString(),
      ts: Timestamp.now(),
      userId: input.user?.id || '',
      userName: userLabel(input.user),
      action: input.action,
      module: input.module,
      targetId: input.targetId || '',
      targetLabel: input.targetLabel || '',
      changes: input.changes || [],
      detail: input.detail || '',
    });
  } catch (error) {
    console.error('activity_logs: no se pudo registrar el evento', error);
  }
};

export interface LogPage {
  entries: ActivityLogEntry[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

/**
 * Trae la bitacora paginada, mas reciente primero.
 * Se pagina en el SERVIDOR: la coleccion crece sin limite y traerla
 * completa seria el mismo error que ya arreglamos en Overview.
 */
export const fetchLogs = async (opts: {
  pageSize?: number;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
  userId?: string;
  action?: LogAction | 'all';
}): Promise<LogPage> => {
  const pageSize = opts.pageSize || 50;
  const parts = [];
  if (opts.userId && opts.userId !== 'all') parts.push(where('userId', '==', opts.userId));
  if (opts.action && opts.action !== 'all') parts.push(where('action', '==', opts.action));

  let q = query(collection(db, 'activity_logs'), ...parts, orderBy('ts', 'desc'), limit(pageSize + 1));
  if (opts.cursor) {
    q = query(collection(db, 'activity_logs'), ...parts, orderBy('ts', 'desc'), startAfter(opts.cursor), limit(pageSize + 1));
  }

  const snap = await getDocs(q);
  const docs = snap.docs;
  const hasMore = docs.length > pageSize;
  const page = hasMore ? docs.slice(0, pageSize) : docs;

  return {
    entries: page.map((d) => ({ id: d.id, ...d.data() })) as ActivityLogEntry[],
    cursor: page.length > 0 ? page[page.length - 1] : null,
    hasMore,
  };
};