// src/features/ops/services/opsRefs.ts
// ============================================================================
// Task list de gerentes — rutas y referencias TIPADAS de Firestore.
//
//   user_priorities/{userId}           Top 3 de proyectos de cada gerente
//   task_projects/{projectId}          Proyectos (comentarios dentro, comments[])
//   user_tasks/{taskId}                Tareas de un usuario (con o sin proyecto)
//       comments[]                     comentarios dentro de la tarea (arreglo)
//   Storage: user_tasks/{id}/…   (archivos adjuntos de las tareas)
//   (Antes ops_priorities, ops_projects y ops_tasks; nombres en COLLECTIONS.)
//
// Cada colección se tipa UNA vez aquí con withConverter: el resto del código
// recibe OpsTask / OpsProject… sin casts. Tipos en src/types/index.ts.
// ============================================================================
import {
  collection,
  doc,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type FirestoreDataConverter,
  type PartialWithFieldValue,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { COLLECTIONS } from '../../../lib/firebase/collections';
import type {
  OpsPriorities, OpsProject, OpsTask,
} from '../../../types/index';

/** Datos para crear un documento: todo menos el id (lo pone Firestore). */
export type NewDoc<T extends { id: string }> = Omit<T, 'id'>;

/** Carpeta de Storage de los adjuntos de una tarea. La hora va delante para
 *  que dos archivos con el mismo nombre no se pisen. (Los proyectos no llevan
 *  archivos.) */
export const opsTaskFilePath = (taskId: string, fileName: string) =>
  `${COLLECTIONS.userTasks}/${taskId}/${Date.now()}-${fileName}`;

// El `id` es el del documento: se lee de ahí y no se guarda como campo.
function converter<T extends { id: string }>(): FirestoreDataConverter<T> {
  return {
    toFirestore(model: PartialWithFieldValue<T>): DocumentData {
      const { id: _id, ...data } = model as PartialWithFieldValue<T> & { id?: unknown };
      return data;
    },
    fromFirestore(snap: QueryDocumentSnapshot): T {
      return { ...snap.data(), id: snap.id } as T;
    },
  };
}

/** Top 3 de un gerente: el id del documento es el id del usuario. */
export const opsPrioritiesRef = (userId: string): DocumentReference<OpsPriorities> =>
  doc(db, COLLECTIONS.userPriorities, userId).withConverter(converter<OpsPriorities>());

export const opsProjectsCol: CollectionReference<OpsProject> =
  collection(db, COLLECTIONS.taskProjects).withConverter(converter<OpsProject>());

export const opsProjectRef = (projectId: string): DocumentReference<OpsProject> =>
  doc(db, COLLECTIONS.taskProjects, projectId).withConverter(converter<OpsProject>());

export const opsTasksCol: CollectionReference<OpsTask> =
  collection(db, COLLECTIONS.userTasks).withConverter(converter<OpsTask>());

export const opsTaskRef = (taskId: string): DocumentReference<OpsTask> =>
  doc(db, COLLECTIONS.userTasks, taskId).withConverter(converter<OpsTask>());


