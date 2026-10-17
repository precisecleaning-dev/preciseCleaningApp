// src/services/settingsTasksService.ts
// ============================================================================
// Colección `settings_tasks` (tareas de cada área del checklist de Quality
// Check). Tipo `Task` en src/types/index.ts.
//
//   create · update · delete · getAll · getOne · archive
//
// Quitar una tarea desde el panel de QC la ARCHIVA (`archived: true`) en vez de
// borrarla: los reportes viejos guardan las respuestas por id de tarea y el PDF
// necesita su nombre. Settings todavía escribe esta colección con
// settingsService (pendiente pasarlo a este service).
// ============================================================================
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, updateDoc,
  type CollectionReference, type DocumentReference, type UpdateData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS } from '../lib/firebase/collections';
import { typedConverter, type NewDoc } from '../lib/firebase/typedConverter';
import type { Task } from '../types/index';

/** Largo máximo del nombre de una tarea del checklist. */
export const MAX_CHECKLIST_TASK_NAME_LENGTH = 120;

const tasksCol: CollectionReference<Task> =
  collection(db, COLLECTIONS.tasks).withConverter(typedConverter<Task>());

const taskRef = (taskId: string): DocumentReference<Task> =>
  doc(db, COLLECTIONS.tasks, taskId).withConverter(typedConverter<Task>());

/** Nombre limpio y válido (lanza si queda vacío o es muy largo). */
const toValidTaskName = (name: string): string => {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('La tarea necesita un nombre.');
  if (trimmedName.length > MAX_CHECKLIST_TASK_NAME_LENGTH) {
    throw new Error(`El nombre no puede pasar de ${MAX_CHECKLIST_TASK_NAME_LENGTH} caracteres.`);
  }
  return trimmedName;
};

export const settingsTasksService = {
  /** Crea una tarea activa en el área `placeId` y devuelve su id. */
  async create(input: Pick<Task, 'placeId' | 'name'>): Promise<string> {
    const createdRef = await addDoc(tasksCol, {
      id: '', placeId: input.placeId, name: toValidTaskName(input.name), archived: false,
    });
    return createdRef.id;
  },

  update(taskId: string, patch: UpdateData<NewDoc<Task>>): Promise<void> {
    return updateDoc(taskRef(taskId), patch);
  },

  rename(taskId: string, name: string): Promise<void> {
    return updateDoc(taskRef(taskId), { name: toValidTaskName(name) });
  },

  /** La quita del checklist sin borrarla (ver arriba). */
  archive(taskId: string): Promise<void> {
    return updateDoc(taskRef(taskId), { archived: true });
  },

  delete(taskId: string): Promise<void> {
    return deleteDoc(taskRef(taskId));
  },

  async getAll(): Promise<Task[]> {
    const snapshot = await getDocs(tasksCol);
    return snapshot.docs.map((taskDoc) => taskDoc.data());
  },

  async getOne(taskId: string): Promise<Task | null> {
    const snapshot = await getDoc(taskRef(taskId));
    return snapshot.exists() ? snapshot.data() : null;
  },
};
