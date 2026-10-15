// src/features/ops/hooks/useOpsData.ts
// ============================================================================
// Listeners del Task list, cada uno con la consulta más acotada posible:
//   · tareas ABIERTAS de una persona (assigneeUserId == x y status == 'open') o de
//     todos (status == 'open'), y las abiertas que una persona asignó
//     (createdByUserId == x, pestaña "Assigned by"). Solo filtros de igualdad:
//     no piden índice compuesto. Las hechas no se descargan (su historial
//     crece sin fin).
//   · la tarea abierta en el panel (un documento, aunque ya esté hecha);
//     (con sus comentarios: van dentro, en comments[]);
//   · el top 3 de una persona (un documento);
//   · las tareas que esperan el visto bueno de una persona.
// Los proyectos son pocos y los usa toda la vista: van por el store compartido
// (useLiveData('taskProjects')).
// ============================================================================
import { useEffect, useState } from 'react';
import { onSnapshot, query, where } from 'firebase/firestore';
import type { OpsPriorities, UserTask } from '../../../types/index';
import { userTaskRef, userTasksCol } from '../../../services/userTasksService';
import { prioritiesRef } from '../services/prioritiesService';

export const EVERYONE = '__all__';

interface Keyed<T> {
  key: string;
  value: T;
}

/** Tareas abiertas con `field == userId` (con EVERYONE: todas las abiertas). */
function useOpenTasksWhere(
  field: 'assigneeUserId' | 'createdByUserId', userId: string | null,
): { tasks: UserTask[]; loaded: boolean } {
  const [state, setState] = useState<Keyed<UserTask[]> | null>(null);
  useEffect(() => {
    if (!userId) return;
    const q = userId === EVERYONE
      ? query(userTasksCol, where('status', '==', 'open'))
      : query(userTasksCol, where(field, '==', userId), where('status', '==', 'open'));
    return onSnapshot(
      q,
      (snap) => setState({ key: userId, value: snap.docs.map((d) => d.data()) }),
      (err) => {
        console.error('Error escuchando las tareas:', err);
        setState({ key: userId, value: [] });
      },
    );
  }, [field, userId]);
  const current = state && state.key === userId ? state.value : null;
  return { tasks: current ?? NO_TASKS, loaded: current !== null };
}

/** Tareas abiertas de `assigneeUserId` (o de todos con EVERYONE). */
export const useOpenTasks = (assigneeUserId: string | null) => useOpenTasksWhere('assigneeUserId', assigneeUserId);

/** Tareas abiertas que `userId` creó, asignadas a quien sea (incluso a sí mismo). */
export const useCreatedTasks = (userId: string | null) => useOpenTasksWhere('createdByUserId', userId);

const NO_TASKS: UserTask[] = [];

/** Tareas que esperan el visto bueno de `userId` (de cualquier persona).
 *  Solo igualdades sobre campos del map `approval`: sin índice compuesto. */
export function useApprovalQueue(userId: string | null): UserTask[] {
  const [state, setState] = useState<Keyed<UserTask[]> | null>(null);
  useEffect(() => {
    if (!userId || userId === EVERYONE) return;
    return onSnapshot(
      query(userTasksCol, where('approval.approverUserId', '==', userId), where('approval.status', '==', 'pending')),
      (snap) => setState({ key: userId, value: snap.docs.map((d) => d.data()).filter((t) => t.status === 'open') }),
      (err) => console.error('Error escuchando las aprobaciones:', err),
    );
  }, [userId]);
  return userId && state?.key === userId ? state.value : NO_TASKS;
}

/** Una tarea en vivo (la del panel). null mientras carga o si se borró. */
export function useOpsTask(taskId: string | null): UserTask | null {
  const [state, setState] = useState<Keyed<UserTask | null> | null>(null);
  useEffect(() => {
    if (!taskId) return;
    return onSnapshot(
      userTaskRef(taskId),
      (snap) => setState({ key: taskId, value: snap.exists() ? snap.data() : null }),
      (err) => console.error('Error escuchando la tarea:', err),
    );
  }, [taskId]);
  return taskId && state?.key === taskId ? state.value : null;
}

/** Top 3 de una persona (ids de proyectos, en orden). */
export function usePriorities(userId: string | null): string[] {
  const [state, setState] = useState<Keyed<OpsPriorities | null> | null>(null);
  useEffect(() => {
    if (!userId || userId === EVERYONE) return;
    return onSnapshot(
      prioritiesRef(userId),
      (snap) => setState({ key: userId, value: snap.exists() ? snap.data() : null }),
      (err) => console.error('Error escuchando el top 3:', err),
    );
  }, [userId]);
  return (userId && state?.key === userId && state.value?.projectIds) || NO_IDS;
}

const NO_IDS: string[] = [];
