/**
 * offlinePhotoQueue.ts
 * ------------------------------------------------------------------
 * Cola de subida de fotos OFFLINE basada en IndexedDB.
 *
 * Firebase Storage NO funciona sin conexión (a diferencia de Firestore,
 * que sí tiene persistencia offline). Por eso guardamos los blobs de las
 * fotos en IndexedDB cuando no hay internet y los subimos automáticamente
 * cuando vuelve la conexión.
 *
 * Las imágenes ya vienen comprimidas desde compressImage(), así que aquí
 * solo persistimos el Blob final + los metadatos necesarios para subirlo.
 * ------------------------------------------------------------------
 */

const DB_NAME = 'precise-cleaning-offline';
const DB_VERSION = 1;
const STORE = 'pending-photos';

export interface PendingPhoto {
  id: string;                 // id único (uuid/timestamp)
  propertyId: string;         // a qué propiedad pertenece
  clientName: string;         // para construir la ruta de Storage
  address: string;            // para construir la ruta de Storage
  type: 'before' | 'after';
  blob: Blob;                 // la imagen comprimida
  fileName: string;
  inReport: boolean;          // si debe incluirse en el PDF
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('propertyId', 'propertyId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

/** Genera un id corto y único para cada foto en cola. */
export function makePendingId(): string {
  return `pp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Añade varias fotos a la cola offline. */
export async function enqueuePhotos(photos: PendingPhoto[]): Promise<void> {
  if (photos.length === 0) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const store = tx(db, 'readwrite');
    photos.forEach(p => store.put(p));
    store.transaction.oncomplete = () => resolve();
    store.transaction.onerror = () => reject(store.transaction.error);
  });
  db.close();
}

/** Devuelve TODAS las fotos pendientes (todas las propiedades). */
export async function getAllPending(): Promise<PendingPhoto[]> {
  const db = await openDB();
  const result = await new Promise<PendingPhoto[]>((resolve, reject) => {
    const req = tx(db, 'readonly').getAll();
    req.onsuccess = () => resolve(req.result as PendingPhoto[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result.sort((a, b) => a.createdAt - b.createdAt);
}

/** Fotos pendientes de UNA propiedad concreta. */
export async function getPendingByProperty(propertyId: string): Promise<PendingPhoto[]> {
  if (!propertyId) return [];
  const db = await openDB();
  const result = await new Promise<PendingPhoto[]>((resolve, reject) => {
    const idx = tx(db, 'readonly').index('propertyId');
    const req = idx.getAll(propertyId);
    req.onsuccess = () => resolve(req.result as PendingPhoto[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result.sort((a, b) => a.createdAt - b.createdAt);
}

/** Borra una foto de la cola (tras subirla con éxito). */
export async function removePending(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const req = tx(db, 'readwrite').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
}

/** Número total de fotos en cola (para el badge del header). */
export async function countPending(): Promise<number> {
  const db = await openDB();
  const result = await new Promise<number>((resolve, reject) => {
    const req = tx(db, 'readonly').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}