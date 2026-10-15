// src/features/quality-check/services/qcRoutes.ts
// Rutas de inspección guardadas (`qc_routes`): las arma el drawer de rutas de
// Quality Check y las lista la pestaña "Rutas". Antes cada vista llamaba a
// Firestore directo. Sin cambios de lógica.
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { COLLECTIONS } from '../../../lib/firebase/collections';
import type { LatLng } from '../../../utils/routing';
import type { LiveUserPosition } from '../../../utils/liveRoute';

export interface QcRouteStop {
  houseId: string;
  client: string;
  address: string;
  lat: number | null;
  lng: number | null;
  legKm?: number;
  etaMin?: number;
  arrived?: boolean;
  arrivedAt?: string | null;
}

export interface QcRouteDoc {
  id: string;
  name?: string;
  origin?: LatLng | null;
  avgSpeed?: number;
  stops?: QcRouteStop[];
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  live?: Record<string, LiveUserPosition>;
}

const col = () => collection(db, COLLECTIONS.qcRoutes);
const ref = (id: string) => doc(db, COLLECTIONS.qcRoutes, id);

export const qcRoutes = {
  /** Todas las rutas en vivo. Devuelve la función para dejar de escuchar. */
  listen: (onData: (routes: QcRouteDoc[]) => void, onError: (err: unknown) => void) =>
    onSnapshot(
      col(),
      (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as QcRouteDoc)),
      onError,
    ),
  /** Crea la ruta y devuelve su id. */
  create: async (data: Omit<QcRouteDoc, 'id'>) => (await addDoc(col(), data)).id,
  update: (id: string, data: Partial<Omit<QcRouteDoc, 'id'>>) => updateDoc(ref(id), data),
  remove: (id: string) => deleteDoc(ref(id)),
};
