// src/services/settingsPlacesService.ts
// ============================================================================
// Colección `settings_places` (áreas del checklist de Quality Check). Tipo
// `Place` en src/types/index.ts.
//
//   create · update · delete · getAll · getOne · saveOrder
//
// La lista en pantalla llega en vivo por el store compartido
// (useLiveData('places')); getAll/getOne son lecturas únicas. Settings todavía
// escribe esta colección con settingsService (pendiente pasarlo a este service).
// ============================================================================
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, updateDoc,
  type CollectionReference, type DocumentReference, type UpdateData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS } from '../lib/firebase/collections';
import { typedConverter, type NewDoc } from '../lib/firebase/typedConverter';
import { commitOps } from '../shared/data/batchWrites';
import type { Place } from '../types/index';

const placesCol: CollectionReference<Place> =
  collection(db, COLLECTIONS.places).withConverter(typedConverter<Place>());

const placeRef = (placeId: string): DocumentReference<Place> =>
  doc(db, COLLECTIONS.places, placeId).withConverter(typedConverter<Place>());

export const settingsPlacesService = {
  /** Crea un área y devuelve su id. */
  async create(input: NewDoc<Place>): Promise<string> {
    const createdRef = await addDoc(placesCol, { ...input, id: '' });
    return createdRef.id;
  },

  update(placeId: string, patch: UpdateData<NewDoc<Place>>): Promise<void> {
    return updateDoc(placeRef(placeId), patch);
  },

  delete(placeId: string): Promise<void> {
    return deleteDoc(placeRef(placeId));
  },

  async getAll(): Promise<Place[]> {
    const snapshot = await getDocs(placesCol);
    return snapshot.docs.map((placeDoc) => placeDoc.data());
  },

  async getOne(placeId: string): Promise<Place | null> {
    const snapshot = await getDoc(placeRef(placeId));
    return snapshot.exists() ? snapshot.data() : null;
  },

  /** Guarda el orden manual de las áreas: `sortOrder` = su posición en
   *  `orderedPlaces`. Solo escribe las que cambian, todas en un batch. */
  async saveOrder(orderedPlaces: Place[]): Promise<void> {
    const changedPlaces = orderedPlaces
      .map((place, position) => ({ place, position }))
      .filter(({ place, position }) => place.sortOrder !== position);
    if (changedPlaces.length === 0) return;
    await commitOps(changedPlaces.map(({ place, position }) => (batch) => {
      batch.update(placeRef(place.id), { sortOrder: position });
    }));
  },
};
