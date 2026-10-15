// src/services/propertiesService.ts
import {
  collection, addDoc, updateDoc, doc, arrayRemove, arrayUnion, runTransaction, type WriteBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase'; // Conexión a la base de datos
import type { NoteHistoryEntry, Property } from '../types/index';

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

  /** Agrega al batch una actualización de la casa (para escribirla junto con
   *  otros documentos relacionados, p. ej. su status_history). */
  batchUpdate(batch: WriteBatch, id: string, propertyData: Partial<Property>): void {
    batch.update(doc(db, COLLECTION_NAME, id), propertyData);
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

  /**
   * ⭐ Corrige el texto de UN mensaje de las notas (Office, General, Employee).
   *    Transacción: lee la casa, cambia esa entrada del historial (por autor y
   *    hora) y rehace el texto acumulado del campo. Si el campo tenía texto
   *    viejo antes del historial (notas de AppSheet), ese principio se conserva.
   *    `message` = { user, at } de la entrada; sin `at` es la "Nota anterior"
   *    (texto sin historial): se reemplaza el campo y queda una entrada
   *    'edited' con el texto completo, como hacían las ediciones antiguas.
   */
  async editNoteMessage(
    id: string,
    field: NoteHistoryEntry['field'],
    message: { user: string; at: string },
    text: string,
    editorEmail: string,
  ): Promise<void> {
    const ref = doc(db, COLLECTION_NAME, id);
    const now = new Date().toISOString();
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('La casa ya no existe.');
      const data = snap.data() as Partial<Property>;
      const history = data.notesHistory || [];
      const current = String(data[field] || '');

      if (!message.at) {
        const entry: NoteHistoryEntry = { field, text, user: editorEmail, at: now, action: 'edited' };
        tx.update(ref, { [field]: text, notesHistory: [...history, entry] });
        return;
      }

      const idx = history.findIndex((e) => e.field === field && e.user === message.user && e.at === message.at);
      if (idx < 0) throw new Error('Ese mensaje ya no existe (¿lo borraron o cambió?).');
      const next = history.map((e, i) => (i === idx ? { ...e, text, editedAt: now, editedBy: editorEmail } : e));

      const joined = (list: NoteHistoryEntry[]) =>
        list.filter((e) => e.field === field && String(e.text || '').trim() !== '').map((e) => e.text).join('\n');
      const before = joined(history);
      const after = joined(next);
      let fieldText = current;
      if (before && current.endsWith(before)) {
        fieldText = current.slice(0, current.length - before.length) + after;
      } else {
        const old = history[idx].text;
        const at = old ? current.lastIndexOf(old) : -1;
        if (at >= 0) fieldText = current.slice(0, at) + text + current.slice(at + old.length);
      }
      tx.update(ref, { notesHistory: next, [field]: fieldText });
    });
  },

  // ⭐ No hay `delete`: una casa se borra MANDÁNDOLA A LA PAPELERA con sus
  //    pagos y servicios (features/houses/services/houseTrash.ts). El borrado
  //    definitivo solo existe dentro de Recycle Bin (trashService).
};
