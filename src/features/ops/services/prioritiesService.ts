// src/features/ops/services/prioritiesService.ts
// ============================================================================
// user_priorities/{userId}: el top 3 de proyectos de cada gerente (el id del
// documento es el id del usuario). Las tareas y los proyectos tienen su
// service en src/services (userTasksService, taskProjectsService).
// ============================================================================
import { doc, setDoc, type DocumentReference } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { COLLECTIONS } from '../../../lib/firebase/collections';
import { typedConverter } from '../../../lib/firebase/typedConverter';
import type { UserPriorities } from '../../../types/index';

/** Top 3 de un gerente. */
export const prioritiesRef = (userId: string): DocumentReference<UserPriorities> =>
  doc(db, COLLECTIONS.userPriorities, userId).withConverter(typedConverter<UserPriorities>());

/** Guarda el top 3 de un gerente (máximo 3 proyectos, en orden). */
export async function setPriorities(userId: string, projectIds: string[]): Promise<void> {
  await setDoc(prioritiesRef(userId), {
    id: userId,
    projectIds: projectIds.filter(Boolean).slice(0, 3),
    updatedAt: new Date().toISOString(),
  });
}
