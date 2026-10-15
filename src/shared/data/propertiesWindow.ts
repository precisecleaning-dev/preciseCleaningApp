// src/shared/data/propertiesWindow.ts
// ============================================================================
// ⭐ VENTANA DE 12 MESES para `properties` (decisión del usuario, 10/2026).
//
// Antes cada sesión nueva descargaba las ~3,600 casas completas. Ahora el
// listener global de App.tsx trae solo:
//   · las casas con Schedule Date de los últimos 12 meses o futuras;
//   · las que no tienen fecha y las que tienen la fecha en un formato viejo
//     sin corregir (con barras o guiones, guardada como texto): no se pueden
//     comparar por fecha, así que se traen siempre hasta que se corrijan con
//     "Revisar fechas" (features/houses/components/PropertyDateFixTool);
//   · las pendientes de cobro (Invoice Status "Needs Invoice", "Pending" o
//     vacío), de cualquier fecha, para que Invoices no pierda cobros.
// Lo demás llega al tocar "Ver todo el historial" (HistoryWindowNotice): a
// partir de ahí y durante esa sesión se escucha la colección completa.
//
// Cómo se consulta: CUATRO listeners de un solo campo cada uno, unidos por id
// en el cliente. Un único `or()` obligaría a Firestore a ordenar todo por
// `scheduleDate` y pediría un índice compuesto (invoiceStatus + scheduleDate)
// que el proyecto no tiene: sin él, la app se quedaba sin casas. Con consultas
// de un solo campo no hace falta ningún índice. Si alguna falla igual, se cae
// al listener de la colección completa (como antes) para no dejar la app vacía.
//
// Una casa que SALE de la ventana por una edición (p. ej. una factura vieja
// que se marca Paid) se conserva en pantalla hasta recargar: si no,
// desaparecería de golpe de la lista donde se la está editando. Para saber si
// salió o si la BORRARON se escucha ese documento suelto: Firestore entrega
// el cambio 'removed' con los datos VIEJOS, que todavía cumplían la ventana,
// así que mirarlos no alcanza (antes toda casa que salía se trataba como
// borrada y desaparecía). Mientras siga existiendo, se muestra en vivo.
//
// El corte de la ventana es el primer día del mes (no "hoy menos 12 meses"):
// así la consulta es idéntica todo el mes y la caché local de Firestore la
// reutiliza en cada sesión en vez de tratarla como una consulta nueva.
//
// Schedule Date se guarda AAAA-MM-DD; en pantalla SIEMPRE se muestra MM/DD/AAAA.
// ============================================================================
import { useSyncExternalStore } from 'react';
import {
  collection, doc, onSnapshot, query, where,
  type DocumentData, type QuerySnapshot,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Property } from '../../types/index';
import { incrementalMapper } from './incrementalSnapshot';

export const WINDOW_MONTHS = 12;

/** Invoice Status que mantienen una casa cargada aunque sea vieja (Invoices
 *  trata el vacío como "Pending" y compara sin mayúsculas). */
const UNPAID_INVOICE_STATUSES = [
  'Needs Invoice', 'Pending', '',
  'needs invoice', 'Needs invoice', 'NEEDS INVOICE', 'pending', 'PENDING',
];

// Fechas que no están en AAAA-MM-DD, por orden de texto:
//   · < "1900": vacío y casi todas las fechas con barras o guiones
//     ("03/15/2024", "1/5/2024", "15/03/2024", "12-01-2023");
//   · ["2-", "200"): las que empiezan con "2-", "2/", "20/" o "20-", que
//     quedarían por debajo del corte sin ser AAAA-MM-DD.
// Las que empiezan con "21"…"9" ya caen por encima del corte (se traen igual).
const BEFORE_ISO_DATES = '1900';
const LOW_TWO_FROM = '2-';
const LOW_TWO_TO = '200';

let fullHistory = false;
const listeners = new Set<() => void>();

const subscribeFlag = (notify: () => void) => {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
};
const getFlag = () => fullHistory;

/** ¿Se está mostrando todo el historial (sin ventana)? */
export function useFullHistory(): boolean {
  return useSyncExternalStore(subscribeFlag, getFlag);
}

/** Pasa a escuchar la colección completa durante el resto de la sesión. */
export function showFullHistory(): void {
  if (fullHistory) return;
  fullHistory = true;
  listeners.forEach((notify) => notify());
}

/** Primer día incluido en la ventana, como AAAA-MM-DD (hora local): el día 1
 *  del mes de hace 12 meses. */
function windowStartIso(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - WINDOW_MONTHS, 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Escucha las casas (con o sin ventana) y entrega la lista unida.
 * `onData` recibe la lista completa cada vez que algo cambia.
 */
export function subscribeProperties(
  full: boolean,
  onData: (list: Property[]) => void,
  onError: (err: unknown) => void,
): () => void {
  const toProperty = (id: string, data: DocumentData) => ({ id, ...data }) as Property;
  const col = collection(db, 'properties');

  const fullListener = () => {
    const toList = incrementalMapper((d) => toProperty(d.id, d.data()));
    return onSnapshot(col, (snap) => onData(toList(snap)), onError);
  };

  if (full) return fullListener();

  const cutoff = windowStartIso();
  const queries = [
    query(col, where('scheduleDate', '>=', cutoff)),
    query(col, where('scheduleDate', '<', BEFORE_ISO_DATES)),
    query(col, where('scheduleDate', '>=', LOW_TWO_FROM), where('scheduleDate', '<', LOW_TWO_TO)),
    query(col, where('invoiceStatus', 'in', UNPAID_INVOICE_STATUSES)),
  ];
  const parts = queries.map(() => new Map<string, Property>());
  const arrived = queries.map(() => false);
  const kept = new Map<string, Property>(); // salieron de la ventana por una edición
  const keptUnsubs = new Map<string, () => void>(); // listener del documento suelto
  let fallbackUnsub: (() => void) | null = null;
  let stopped = false;
  let publishQueued = false;

  const publishNow = () => {
    publishQueued = false;
    if (stopped || fallbackUnsub) return; // ya manda el listener completo
    if (!arrived.every(Boolean)) return; // esperar el primer resultado de las cuatro
    const all = new Map<string, Property>(kept);
    parts.forEach((m) => m.forEach((p, id) => all.set(id, p)));
    onData([...all.values()]);
  };
  // Una escritura suele mover la casa en dos consultas a la vez (sale de una
  // y entra a otra): se publica UNA vez por tarea, no una por consulta.
  const publish = () => {
    if (publishQueued) return;
    publishQueued = true;
    queueMicrotask(publishNow);
  };

  const stopKeeping = (id: string) => {
    keptUnsubs.get(id)?.();
    keptUnsubs.delete(id);
    kept.delete(id);
  };

  // La casa dejó de cumplir las cuatro consultas: ¿salió de la ventana o la
  // borraron? Lo dice su documento. Mientras tanto se muestra con los últimos
  // datos conocidos para que no parpadee.
  const keepWatching = (id: string, last: Property) => {
    kept.set(id, last);
    if (keptUnsubs.has(id)) return;
    const unsub = onSnapshot(
      doc(db, 'properties', id),
      (snap) => {
        if (!keptUnsubs.has(id)) return;
        if (snap.exists()) kept.set(id, toProperty(id, snap.data()));
        else stopKeeping(id); // borrada
        publish();
      },
      (err) => {
        console.error('No se pudo seguir la casa fuera de la ventana:', err);
        stopKeeping(id);
        publish();
      },
    );
    keptUnsubs.set(id, unsub);
  };

  const handle = (i: number) => (snap: QuerySnapshot<DocumentData>) => {
    snap.docChanges().forEach((ch) => {
      const id = ch.doc.id;
      if (ch.type === 'removed') {
        parts[i].delete(id);
        const stillListed = parts.some((m) => m.has(id));
        if (!stillListed) keepWatching(id, toProperty(id, ch.doc.data()));
      } else {
        parts[i].set(id, toProperty(id, ch.doc.data()));
        stopKeeping(id); // volvió a entrar: la trae su consulta
      }
    });
    arrived[i] = true;
    publish();
  };

  const fallBackToFull = (err: unknown) => {
    if (stopped || fallbackUnsub) return;
    console.error('No se pudo abrir la ventana de casas; se carga la colección completa:', err);
    unsubs.forEach((u) => u());
    keptUnsubs.forEach((u) => u());
    keptUnsubs.clear();
    fallbackUnsub = fullListener();
  };

  const unsubs = queries.map((q, i) => onSnapshot(q, handle(i), fallBackToFull));

  return () => {
    stopped = true;
    unsubs.forEach((u) => u());
    keptUnsubs.forEach((u) => u());
    keptUnsubs.clear();
    fallbackUnsub?.();
  };
}

/** ¿Este registro (QC, nómina…) pertenece al historial oculto por la ventana?
 *  Sí cuando no se cargó todo, su casa no está cargada y su fecha es anterior
 *  al inicio de la ventana. Los registros recientes cuya casa no aparece
 *  siguen tratándose como "casa borrada", igual que antes. */
export function isHiddenByWindow(full: boolean, houseLoaded: boolean, recordTime: number): boolean {
  if (full || houseLoaded) return false;
  if (!recordTime || isNaN(recordTime)) return false;
  const [y, m, d] = windowStartIso().split('-').map(Number);
  return recordTime < new Date(y, m - 1, d).getTime();
}
