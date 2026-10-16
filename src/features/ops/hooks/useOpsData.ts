// src/features/ops/hooks/useOpsData.ts
// ============================================================================
// Listeners del Task list, cada uno con la consulta más acotada posible:
//   · tareas ABIERTAS de una persona (assigneeUserIds contiene x y status ==
//     'open') o de todos (status == 'open'), y las abiertas que una persona
//     asignó (createdByUserId == x, pestaña "Assigned by"). Solo igualdades y
//     array-contains: no piden índice compuesto. Las hechas no se descargan
//     (su historial crece sin fin).
//     Las tareas de antes guardan una sola persona (assigneeUserId): la lista
//     de una persona escucha también ese formato y junta las dos respuestas.
//     Cuando no quede ninguna tarea vieja abierta, se puede quitar esa consulta.
//   · la tarea abierta en el panel (un documento, aunque ya esté hecha);
//     (con sus comentarios: van dentro, en comments[]);
//   · el top 3 de una persona (un documento);
//   · las tareas que esperan el visto bueno de una persona.
// Los proyectos son pocos y los usa toda la vista: van por el store compartido
// (useLiveData('taskProjects')).
// ============================================================================
import { useEffect, useState } from 'react';
import { onSnapshot, query, where, type Query } from 'firebase/firestore';
import type { OpsPriorities, StoredUserTask, UserTask } from '../../../types/index';
import { LEGACY_ASSIGNEE_FIELD, userTaskRef, userTasksCol } from '../../../services/userTasksService';
import { prioritiesRef } from '../services/prioritiesService';

export const EVERYONE = '__all__';

interface Keyed<T> {
  key: string;
  value: T;
}

/** De qué lado se miran las tareas de una persona: las que tiene asignadas o
 *  las que asignó. */
type OpenTasksSide = 'assigned' | 'created';

/** Consultas de las tareas abiertas de `userId` (con EVERYONE: todas las
 *  abiertas). Las asignadas van en dos: la lista nueva y el formato viejo. */
function openTaskQueries(side: OpenTasksSide, userId: string): Query<UserTask, StoredUserTask>[] {
  const isOpen = where('status', '==', 'open');
  if (userId === EVERYONE) return [query(userTasksCol, isOpen)];
  if (side === 'created') return [query(userTasksCol, where('createdByUserId', '==', userId), isOpen)];
  return [
    query(userTasksCol, where('assigneeUserIds', 'array-contains', userId), isOpen),
    query(userTasksCol, where(LEGACY_ASSIGNEE_FIELD, '==', userId), isOpen),
  ];
}

/** Tareas abiertas de un lado de `userId`. Junta las respuestas de sus
 *  consultas (sin repetir: si una tarea sale en las dos, gana la primera) y
 *  marca `loaded` cuando respondieron todas. */
function useOpenTasksOf(side: OpenTasksSide, userId: string | null): { tasks: UserTask[]; loaded: boolean } {
  const [state, setState] = useState<Keyed<UserTask[]> | null>(null);
  useEffect(() => {
    if (!userId) return;
    const queries = openTaskQueries(side, userId);
    const results: (UserTask[] | null)[] = queries.map(() => null);
    const publish = () => {
      if (results.includes(null)) return;
      const tasksById = new Map<string, UserTask>();
      results.flat().forEach((task) => {
        if (task && !tasksById.has(task.id)) tasksById.set(task.id, task);
      });
      setState({ key: `${side}:${userId}`, value: [...tasksById.values()] });
    };
    const unsubscribers = queries.map((taskQuery, index) => onSnapshot(
      taskQuery,
      (snap) => {
        results[index] = snap.docs.map((d) => d.data());
        publish();
      },
      (err) => {
        console.error('Error escuchando las tareas:', err);
        results[index] = [];
        publish();
      },
    ));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [side, userId]);
  const current = state && state.key === `${side}:${userId}` ? state.value : null;
  return { tasks: current ?? NO_TASKS, loaded: current !== null };
}

/** Tareas abiertas asignadas a `assigneeUserId`, sola o con más personas (o
 *  las de todos con EVERYONE). */
export const useOpenTasks = (assigneeUserId: string | null) => useOpenTasksOf('assigned', assigneeUserId);

/** Tareas abiertas que `userId` creó, asignadas a quien sea (incluso a sí mismo). */
export const useCreatedTasks = (userId: string | null) => useOpenTasksOf('created', userId);

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
