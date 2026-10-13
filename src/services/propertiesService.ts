// src/services/propertiesService.ts
import {
  collection, addDoc, updateDoc, deleteDoc, doc, arrayRemove, arrayUnion, type WriteBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase'; // Conexión a la base de datos
import type { Property } from '../types/index';

const COLLECTION_NAME = 'properties';

/** Campos de arreglo de una casa que se cambian de forma atómica. */
export type PropertyArrayField =
  | 'assignedWorkers'
  | 'beforePhotos'
  | 'afterPhotos'
  | 'beforePhotosExcluded'
  | 'afterPhotosExcluded'
  | 'notesHistory';

/** Valores que se agregan o quitan de cada campo de arreglo. */
export type PropertyArrayChange = Partial<Record<PropertyArrayField, readonly unknown[]>>;

// ⭐ arrayUnion / arrayRemove en vez de leer-modificar-escribir: antes se
//    reescribía el arreglo completo con la copia que tenía la pantalla, y si
//    otra persona había agregado una foto o un trabajador mientras tanto, se
//    perdía. Firestore no acepta unir y quitar en el MISMO campo dentro de una
//    sola actualización: por eso son dos operaciones (primero quitar, luego
//    agregar) que viajan en el mismo batch.
function arrayUpdates(change: PropertyArrayChange, op: typeof arrayUnion): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  (Object.keys(change) as PropertyArrayField[]).forEach((field) => {
    const values = change[field];
    if (values && values.length > 0) out[field] = op(...values);
  });
  return out;
}

// IMPORTANTE: Aquí se exporta explícitamente 'propertiesService' que HousesView está buscando
export const propertiesService = {
  // La lista de casas la mantiene el listener global de App.tsx.

  // 2. Crear un nuevo trabajo
  async create(property: Omit<Property, 'id'>): Promise<string> {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), property);
    return docRef.id; // Retorna el ID autogenerado por Firebase
  },

  // 3. Actualizar un trabajo existente
  async update(id: string, propertyData: Partial<Property>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, propertyData);
  },

  /**
   * Agrega al batch los cambios de arreglos (quitar y luego agregar) y,
   * opcionalmente, otros campos normales. No hace nada si no hay cambios.
   */
  batchArrayChange(
    batch: WriteBatch,
    id: string,
    { add = {}, remove = {}, fields = {} }: { add?: PropertyArrayChange; remove?: PropertyArrayChange; fields?: Partial<Property> },
  ): void {
    const ref = doc(db, COLLECTION_NAME, id);
    const removals = arrayUpdates(remove, arrayRemove);
    const additions = { ...fields, ...arrayUpdates(add, arrayUnion) };
    if (Object.keys(removals).length > 0) batch.update(ref, removals);
    if (Object.keys(additions).length > 0) batch.update(ref, additions);
  },

  /** Agrega o quita valores de un arreglo con una sola escritura. */
  async arrayChange(id: string, mode: 'add' | 'remove', change: PropertyArrayChange, fields: Partial<Property> = {}): Promise<void> {
    const values = arrayUpdates(change, mode === 'add' ? arrayUnion : arrayRemove);
    await updateDoc(doc(db, COLLECTION_NAME, id), { ...fields, ...values });
  },

  // 4. Eliminar un trabajo
  async delete(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  }
};