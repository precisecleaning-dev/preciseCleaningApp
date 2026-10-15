// src/shared/data/liveCollections.ts
// ============================================================================
// ⭐ STORE DE COLECCIONES EN VIVO — un solo listener por colección para toda la app.
//
// Antes cada vista abría sus propios `onSnapshot` (o hacía `getDocs` completos al
// montarse) de los mismos catálogos: statuses y teams se escuchaban en ~10 lugares,
// customers en 9, quality_checks en 4… Al cambiar de vista se cerraban y al volver
// se abrían otra vez; pasados 30 minutos, Firestore cobra un listener reabierto
// como una consulta completa nueva, y cada `getDocs` sin filtro cobra TODOS los
// documentos en cada visita.
//
// Ahora:
//   · `useLiveCollection('teams')` entrega los datos y se suscribe al store.
//   · El primer componente que pide una colección abre UN listener; los demás
//     comparten el mismo resultado (mismo arreglo, mismo render).
//   · Cuando el último componente se desmonta, el listener sigue abierto
//     KEEP_ALIVE_MS más: navegar entre vistas no vuelve a descargar nada.
//   · Los datos se tipan y se mapean UNA vez aquí (incluido `mapCustomerDoc`).
//
// Para una colección nueva: agrégala a SOURCES con su ruta, su tipo y su mapeo.
// ============================================================================
import { useCallback, useSyncExternalStore } from 'react';
import { collection, onSnapshot, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { COLLECTIONS } from '../../lib/firebase/collections';
import type {
  Business, CategoryExpense, Customer, TaskProject, PaymentMethod, PayrollRecord, Priority, Product, Responsable, Role,
  Service, Status, SystemUser, Task, Tax, Team, Place,
} from '../../types/index';
import { mapCustomerDoc } from '../../utils/customerDocs';
import { incrementalMapper } from './incrementalSnapshot';
import type { QcRecordLite } from '../../types/index';

/** Cuánto sigue abierto un listener después de que ninguna vista lo usa. */
const KEEP_ALIVE_MS = 15 * 60 * 1000;

/** Servicio cobrado de una casa (`billing_services`). */
interface BillingServiceDoc {
  id: string;
  propertyId: string;
  total: number;
  [key: string]: unknown;
}

type Doc = QueryDocumentSnapshot<DocumentData>;
const withId = <T,>(d: Doc): T => ({ id: d.id, ...d.data() }) as T;

interface Source<T> {
  path: string;
  map: (d: Doc) => T;
}
const src = <T,>(path: string, map: (d: Doc) => T = withId<T>): Source<T> => ({ path, map });

const SOURCES = {
  statuses: src<Status>(COLLECTIONS.statuses),
  teams: src<Team>(COLLECTIONS.teams),
  priorities: src<Priority>(COLLECTIONS.priorities),
  services: src<Service>(COLLECTIONS.services),
  products: src<Product & { color?: string }>(COLLECTIONS.products),
  taxes: src<Tax>(COLLECTIONS.taxes),
  places: src<Place>(COLLECTIONS.places),
  tasks: src<Task>(COLLECTIONS.tasks),
  roles: src<Role>(COLLECTIONS.roles),
  users: src<SystemUser>(COLLECTIONS.systemUsers),
  customers: src<Customer>(COLLECTIONS.customers, mapCustomerDoc),
  qualityChecks: src<QcRecordLite>(COLLECTIONS.qualityChecks),
  billingServices: src<BillingServiceDoc>(COLLECTIONS.billingServices),
  payroll: src<PayrollRecord>(COLLECTIONS.payroll),
  // Proyectos del Task list (pocos; los usa toda la vista de tareas).
  taskProjects: src<TaskProject>(COLLECTIONS.taskProjects),
  // Catálogos que solo usa Settings (el listener se abre al entrar ahí).
  categories: src<CategoryExpense>(COLLECTIONS.categories),
  responsables: src<Responsable>(COLLECTIONS.responsables),
  paymentMethods: src<PaymentMethod>(COLLECTIONS.paymentMethods),
  businesses: src<Business>(COLLECTIONS.businesses),
};

type LiveKey = keyof typeof SOURCES;
type ItemOf<K extends LiveKey> = (typeof SOURCES)[K] extends Source<infer T> ? T : never;

interface LiveSnapshot<T> {
  data: T[];
  /** true cuando llegó el primer resultado (o falló: no se bloquea la vista). */
  loaded: boolean;
}

interface Entry {
  snapshot: LiveSnapshot<unknown>;
  subscribers: Set<() => void>;
  unsub: (() => void) | null;
  closeTimer: ReturnType<typeof setTimeout> | null;
  /** Reintento programado tras un error del listener. */
  retryTimer: ReturnType<typeof setTimeout> | null;
  /** Errores seguidos (para espaciar los reintentos). */
  failures: number;
}

/** Espera antes de reabrir un listener que falló: 2 s, 4 s, 8 s… hasta 60 s. */
const retryDelay = (failures: number) => Math.min(60_000, 2_000 * 2 ** Math.max(0, failures - 1));
/** Reintentos seguidos como máximo (≈2 min): un rol SIN permiso de lectura
 *  no debe quedar reintentando para siempre. Se reinicia al volver a pedirla. */
const MAX_RETRIES = 6;

const EMPTY: LiveSnapshot<never> = { data: [], loaded: false };
const entries = new Map<LiveKey, Entry>();

function entryFor(key: LiveKey): Entry {
  let e = entries.get(key);
  if (!e) {
    e = { snapshot: EMPTY, subscribers: new Set(), unsub: null, closeTimer: null, retryTimer: null, failures: 0 };
    entries.set(key, e);
  }
  return e;
}

function publish(e: Entry, snapshot: LiveSnapshot<unknown>) {
  e.snapshot = snapshot;
  e.subscribers.forEach((notify) => notify());
}

function clearRetry(e: Entry) {
  if (e.retryTimer) clearTimeout(e.retryTimer);
  e.retryTimer = null;
}

function open(key: LiveKey, e: Entry) {
  if (e.unsub || e.retryTimer) return;
  const source = SOURCES[key] as Source<unknown>;
  // ⭐ Solo se mapean los documentos que cambiaron; los demás conservan su
  //    objeto (ver incrementalSnapshot.ts).
  const toList = incrementalMapper(source.map);
  e.unsub = onSnapshot(
    collection(db, source.path),
    (snap) => {
      e.failures = 0;
      publish(e, { data: toList(snap), loaded: true });
    },
    (err) => {
      console.error(`Error escuchando ${source.path}:`, err);
      // Un listener con error ya no recibe nada. Antes se quedaba así hasta
      // que otra vista lo pidiera (había que recargar para ver datos nuevos):
      // ahora, si alguien lo sigue usando, se reabre solo, cada vez más
      // espaciado (p. ej. permisos que todavía no llegaban al iniciar sesión).
      e.unsub = null;
      e.failures += 1;
      publish(e, { data: e.snapshot.data, loaded: true });
      if (e.subscribers.size > 0 && e.failures <= MAX_RETRIES) {
        e.retryTimer = setTimeout(() => {
          e.retryTimer = null;
          if (e.subscribers.size > 0) open(key, e);
        }, retryDelay(e.failures));
      }
    },
  );
}

function subscribe(key: LiveKey, notify: () => void): () => void {
  const e = entryFor(key);
  if (e.closeTimer) {
    clearTimeout(e.closeTimer);
    e.closeTimer = null;
  }
  e.subscribers.add(notify);
  if (!e.unsub && !e.retryTimer) e.failures = 0; // intento nuevo: reintentos completos
  open(key, e);
  return () => {
    e.subscribers.delete(notify);
    if (e.subscribers.size === 0 && !e.closeTimer) {
      e.closeTimer = setTimeout(() => {
        e.closeTimer = null;
        if (e.subscribers.size > 0) return;
        clearRetry(e);
        e.unsub?.();
        e.unsub = null;
      }, KEEP_ALIVE_MS);
    }
  };
}

/**
 * Cierra todos los listeners y vacía los datos. Se llama al cerrar sesión: el
 * siguiente usuario del mismo equipo no debe ver, ni por un instante, los datos
 * del anterior, y los listeners viejos ya no tendrían permiso.
 */
export function resetLiveCollections(): void {
  entries.forEach((e) => {
    if (e.closeTimer) clearTimeout(e.closeTimer);
    e.closeTimer = null;
    clearRetry(e);
    e.failures = 0;
    e.unsub?.();
    e.unsub = null;
    publish(e, EMPTY);
    // Si alguna vista sigue montada, se vuelve a abrir con la sesión nueva.
  });
}

const noopUnsubscribe = () => () => {};

/**
 * Datos en vivo de una colección compartida. Con `enabled = false` no abre el
 * listener (p. ej. HousesView en modo `modals-only` que no necesita finanzas).
 */
export function useLiveCollection<K extends LiveKey>(key: K, enabled = true): LiveSnapshot<ItemOf<K>> {
  const sub = useCallback((notify: () => void) => subscribe(key, notify), [key]);
  const get = useCallback(() => entryFor(key).snapshot as LiveSnapshot<ItemOf<K>>, [key]);
  const getEmpty = useCallback(() => EMPTY as LiveSnapshot<ItemOf<K>>, []);
  return useSyncExternalStore(enabled ? sub : noopUnsubscribe, enabled ? get : getEmpty);
}

/** Atajo cuando solo interesa el arreglo. */
export function useLiveData<K extends LiveKey>(key: K, enabled = true): ItemOf<K>[] {
  return useLiveCollection(key, enabled).data;
}
