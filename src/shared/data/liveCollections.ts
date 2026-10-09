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
import type {
  Business, CategoryExpense, Customer, PaymentMethod, PayrollRecord, Priority, Product, Responsable, Role,
  Service, Status, SystemUser, Task, Tax, Team, Place,
} from '../../types/index';
import { mapCustomerDoc } from '../../utils/customerDocs';
import type { QcRecordLite } from '../../utils/qcDashboard';

/** Cuánto sigue abierto un listener después de que ninguna vista lo usa. */
const KEEP_ALIVE_MS = 15 * 60 * 1000;

/** Servicio cobrado de una casa (`billing_services`). */
export interface BillingServiceDoc {
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
  statuses: src<Status>('settings_statuses'),
  teams: src<Team>('settings_teams'),
  priorities: src<Priority>('settings_priorities'),
  services: src<Service>('settings_services'),
  products: src<Product & { color?: string }>('settings_products'),
  taxes: src<Tax>('settings_tax'),
  places: src<Place>('settings_places'),
  tasks: src<Task>('settings_tasks'),
  roles: src<Role>('settings_roles'),
  users: src<SystemUser>('system_users'),
  customers: src<Customer>('customers', mapCustomerDoc),
  qualityChecks: src<QcRecordLite>('quality_checks'),
  billingServices: src<BillingServiceDoc>('billing_services'),
  payroll: src<PayrollRecord>('payroll'),
  // Catálogos que solo usa Settings (el listener se abre al entrar ahí).
  categories: src<CategoryExpense>('settings_categories'),
  responsables: src<Responsable>('settings_responsables'),
  paymentMethods: src<PaymentMethod>('settings_payment_methods'),
  businesses: src<Business>('settings_businesses'),
};

export type LiveKey = keyof typeof SOURCES;
type ItemOf<K extends LiveKey> = (typeof SOURCES)[K] extends Source<infer T> ? T : never;

export interface LiveSnapshot<T> {
  data: T[];
  /** true cuando llegó el primer resultado (o falló: no se bloquea la vista). */
  loaded: boolean;
}

interface Entry {
  snapshot: LiveSnapshot<unknown>;
  subscribers: Set<() => void>;
  unsub: (() => void) | null;
  closeTimer: ReturnType<typeof setTimeout> | null;
}

const EMPTY: LiveSnapshot<never> = { data: [], loaded: false };
const entries = new Map<LiveKey, Entry>();

function entryFor(key: LiveKey): Entry {
  let e = entries.get(key);
  if (!e) {
    e = { snapshot: EMPTY, subscribers: new Set(), unsub: null, closeTimer: null };
    entries.set(key, e);
  }
  return e;
}

function publish(e: Entry, snapshot: LiveSnapshot<unknown>) {
  e.snapshot = snapshot;
  e.subscribers.forEach((notify) => notify());
}

function open(key: LiveKey, e: Entry) {
  if (e.unsub) return;
  const source = SOURCES[key] as Source<unknown>;
  e.unsub = onSnapshot(
    collection(db, source.path),
    (snap) => publish(e, { data: snap.docs.map(source.map), loaded: true }),
    (err) => {
      console.error(`Error escuchando ${source.path}:`, err);
      // Un listener con error ya no recibe nada: se descarta para que el
      // próximo componente que lo pida lo vuelva a abrir.
      e.unsub = null;
      publish(e, { data: e.snapshot.data, loaded: true });
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
  open(key, e);
  return () => {
    e.subscribers.delete(notify);
    if (e.subscribers.size === 0 && !e.closeTimer) {
      e.closeTimer = setTimeout(() => {
        e.closeTimer = null;
        if (e.subscribers.size > 0) return;
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
