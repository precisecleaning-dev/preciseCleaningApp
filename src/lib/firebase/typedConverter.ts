// src/lib/firebase/typedConverter.ts
// ============================================================================
// Converter de Firestore para tipar una colección UNA vez (withConverter). El
// `id` del modelo es el id del documento: se lee de ahí y no se guarda como
// campo. Lo usan los services de user_tasks, task_projects y user_priorities.
// ============================================================================
import type {
  DocumentData, FirestoreDataConverter, PartialWithFieldValue, QueryDocumentSnapshot,
} from 'firebase/firestore';

/** Datos para crear un documento: todo menos el id (lo pone Firestore). */
export type NewDoc<T extends { id: string }> = Omit<T, 'id'>;

export function typedConverter<T extends { id: string }>(): FirestoreDataConverter<T> {
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
