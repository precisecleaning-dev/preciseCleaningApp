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
// Cada hook devuelve también `error`: si el listener falla (reglas, permisos
// del rol, sin red), la vista muestra que no se pudieron cargar en vez de una
// lista vacía.
// Los proyectos son pocos y los usa toda la vista: van por el store compartido
// (useLiveData('taskProjects')).
// ============================================================================
import { useEffect, useState } from 'react';
import { onSnapshot, query, where, type Query } from 'firebase/firestore';
import type { StoredUserTask, UserPriorities, UserTask } from '../../../types/index';
import { LEGACY_ASSIGNEE_FIELD, userTaskRef, userTasksCol } from '../../../services/userTasksService';
import { prioritiesRef } from '../services/prioritiesService';

export const ALL_USERS = '__all__';

const EMPTY_TASKS: UserTask[] = [];
const EMPTY_PROJECT_IDS: string[] = [];

/** Resultado de un listener junto con la clave (persona o tarea) a la que
 *  pertenece: si la clave cambia, el resultado viejo no se muestra. */
interface KeyedState<T> {
  key: string;
  value: T;
  error: Error | null;
}

/** Relación de una persona con las tareas: las que tiene asignadas o las que asignó. */
type TaskRelation = 'assigned' | 'created';

/** Consultas de las tareas abiertas de `userId` (con ALL_USERS: todas las
 *  abiertas). Las asignadas van en dos: la lista nueva y el formato viejo. */
function buildOpenTaskQueries(relation: TaskRelation, userId: string): Query<UserTask, StoredUserTask>[] {
  const openStatusFilter = where('status', '==', 'open');
  if (userId === ALL_USERS) return [query(userTasksCol, openStatusFilter)];
  if (relation === 'created') return [query(userTasksCol, where('createdByUserId', '==', userId), openStatusFilter)];
  return [
    query(userTasksCol, where('assigneeUserIds', 'array-contains', userId), openStatusFilter),
    query(userTasksCol, where(LEGACY_ASSIGNEE_FIELD, '==', userId), openStatusFilter),
  ];
}

/** Tareas abiertas de `userId` según la relación. Junta las respuestas de sus
 *  consultas (sin repetir: si una tarea sale en las dos, gana la primera) y
 *  marca `loaded` cuando respondieron todas. */
function useOpenTasksByRelation(
  relation: TaskRelation, userId: string | null,
): { tasks: UserTask[]; loaded: boolean; error: Error | null } {
  const [keyedTasks, setKeyedTasks] = useState<KeyedState<UserTask[]> | null>(null);
  useEffect(() => {
    if (!userId) return;
    const queries = buildOpenTaskQueries(relation, userId);
    const resultsByQuery: (UserTask[] | null)[] = queries.map(() => null);
    let firstError: Error | null = null;
    const publishMergedTasks = () => {
      if (resultsByQuery.includes(null)) return;
      const tasksById = new Map<string, UserTask>();
      resultsByQuery.flat().forEach((task) => {
        if (task && !tasksById.has(task.id)) tasksById.set(task.id, task);
      });
      setKeyedTasks({ key: `${relation}:${userId}`, value: [...tasksById.values()], error: firstError });
    };
    const unsubscribers = queries.map((taskQuery, index) => onSnapshot(
      taskQuery,
      (snapshot) => {
        resultsByQuery[index] = snapshot.docs.map((taskDoc) => taskDoc.data());
        publishMergedTasks();
      },
      (error) => {
        console.error('Error escuchando las tareas:', error);
        firstError = firstError ?? error;
        resultsByQuery[index] = [];
        publishMergedTasks();
      },
    ));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [relation, userId]);
  const currentTasks = keyedTasks?.key === `${relation}:${userId}` ? keyedTasks : null;
  return {
    tasks: currentTasks?.value ?? EMPTY_TASKS,
    loaded: currentTasks !== null,
    error: currentTasks?.error ?? null,
  };
}

/** Tareas abiertas asignadas a `assigneeUserId`, sola o con más personas (o
 *  las de todos con ALL_USERS). */
export const useOpenTasks = (assigneeUserId: string | null) => useOpenTasksByRelation('assigned', assigneeUserId);

/** Tareas abiertas que `userId` creó, asignadas a quien sea (incluso a sí mismo). */
export const useCreatedTasks = (userId: string | null) => useOpenTasksByRelation('created', userId);

/** Tareas abiertas que esperan el visto bueno de `userId` (de cualquier persona).
 *  Solo igualdades sobre campos del map `approval`: sin índice compuesto. */
export function useApprovalQueue(userId: string | null): { tasks: UserTask[]; error: Error | null } {
  const [keyedQueue, setKeyedQueue] = useState<KeyedState<UserTask[]> | null>(null);
  useEffect(() => {
    if (!userId || userId === ALL_USERS) return;
    return onSnapshot(
      query(userTasksCol, where('approval.approverUserId', '==', userId), where('approval.status', '==', 'pending')),
      (snapshot) => setKeyedQueue({
        key: userId,
        value: snapshot.docs.map((taskDoc) => taskDoc.data()).filter((task) => task.status === 'open'),
        error: null,
      }),
      (error) => {
        console.error('Error escuchando las aprobaciones:', error);
        setKeyedQueue({ key: userId, value: EMPTY_TASKS, error });
      },
    );
  }, [userId]);
  const currentQueue = userId && keyedQueue?.key === userId ? keyedQueue : null;
  return { tasks: currentQueue?.value ?? EMPTY_TASKS, error: currentQueue?.error ?? null };
}

/** Una tarea en vivo (la del panel). `task` es null mientras carga (`loaded` en
 *  false) o si se borró (`loaded` en true). */
export function useLiveTask(taskId: string | null): { task: UserTask | null; loaded: boolean; error: Error | null } {
  const [keyedTask, setKeyedTask] = useState<KeyedState<UserTask | null> | null>(null);
  useEffect(() => {
    if (!taskId) return;
    return onSnapshot(
      userTaskRef(taskId),
      (snapshot) => setKeyedTask({ key: taskId, value: snapshot.exists() ? snapshot.data() : null, error: null }),
      (error) => {
        console.error('Error escuchando la tarea:', error);
        setKeyedTask({ key: taskId, value: null, error });
      },
    );
  }, [taskId]);
  const currentTask = taskId && keyedTask?.key === taskId ? keyedTask : null;
  return { task: currentTask?.value ?? null, loaded: !!currentTask, error: currentTask?.error ?? null };
}

/** Top 3 de una persona (ids de proyectos, en orden). */
export function useTopProjectIds(userId: string | null): { projectIds: string[]; error: Error | null } {
  const [keyedPriorities, setKeyedPriorities] = useState<KeyedState<UserPriorities | null> | null>(null);
  useEffect(() => {
    if (!userId || userId === ALL_USERS) return;
    return onSnapshot(
      prioritiesRef(userId),
      (snapshot) => setKeyedPriorities({ key: userId, value: snapshot.exists() ? snapshot.data() : null, error: null }),
      (error) => {
        console.error('Error escuchando el top 3:', error);
        setKeyedPriorities({ key: userId, value: null, error });
      },
    );
  }, [userId]);
  const currentPriorities = userId && keyedPriorities?.key === userId ? keyedPriorities : null;
  return {
    projectIds: currentPriorities?.value?.projectIds ?? EMPTY_PROJECT_IDS,
    error: currentPriorities?.error ?? null,
  };
}
