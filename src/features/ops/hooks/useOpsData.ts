// src/features/ops/hooks/useOpsData.ts
// ============================================================================
// Listeners del Task list, cada uno con la consulta más acotada posible:
//   · tareas ABIERTAS de una persona (assigneeUserIds contiene x y status ==
//     'open') o de todos (status == 'open'), y las abiertas que una persona
//     asignó (createdByUserId == x, pestaña "Assigned by") o las de un
//     proyecto (projectId == x, ventana del proyecto). Solo igualdades y
//     array-contains: no piden índice compuesto. Las hechas no se descargan
//     (su historial crece sin fin).
//     Las tareas de antes guardan una sola persona (assigneeUserId): la lista
//     de una persona escucha también ese formato y junta las dos respuestas.
//     Cuando no quede ninguna tarea vieja abierta, se puede quitar esa consulta.
//   · la tarea abierta en el panel (un documento, aunque ya esté hecha);
//     (con sus comentarios: van dentro, en comments[]);
//   · las tareas que esperan el visto bueno de una persona;
//   · las HECHAS (pestaña Done): no es un listener, se piden por páginas de
//     20 (getDocs, de la más reciente a la más vieja) solo con la pestaña
//     abierta, y se ve una página a la vez (Previous / Next).
// Cada hook devuelve también `error`: si el listener falla (reglas, permisos
// del rol) o no hay red y el caché no tiene nada, la vista muestra que no se
// pudieron cargar en vez de una lista vacía. Sin red Firestore NO da error:
// responde desde el caché persistente (fromCache); por eso se escucha también
// la metadata (includeMetadataChanges) y el error se quita solo al volver la red.
// Los proyectos son pocos y los usa toda la vista: van por el store compartido
// (useLiveData('taskProjects')).
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { onSnapshot, query, where, type Query, type SnapshotMetadata } from 'firebase/firestore';
import type {
  DoneTasksPage, DoneTasksResult, OpenTasksSource, StoredUserTask, TaskRelation, UserTask,
} from '../../../types/index';
import { LEGACY_ASSIGNEE_FIELD, userTaskRef, userTasksCol, userTasksService } from '../../../services/userTasksService';
import { isDeviceOffline } from '../../../shared/utils/connectivity';

export const ALL_USERS = '__all__';

const EMPTY_TASKS: UserTask[] = [];

/** Un error de cualquier tipo como Error (Firestore lanza FirestoreError, que lo es,
 *  pero un `throw` de otra cosa no). */
const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

/** Sin red y el dato salió del caché: "vacío" no es confiable (puede no estar en caché). */
const OFFLINE_LOAD_ERROR = new Error('Sin conexión: no se pudieron cargar las tareas.');
const isOfflineCacheOnly = (metadata: SnapshotMetadata) =>
  metadata.fromCache && typeof navigator !== 'undefined' && !navigator.onLine;
const LISTEN_WITH_METADATA = { includeMetadataChanges: true } as const;

/** Resultado de un listener junto con la clave (persona o tarea) a la que
 *  pertenece: si la clave cambia, el resultado viejo no se muestra. */
interface KeyedState<T> {
  key: string;
  value: T;
  error: Error | null;
}

/** Consultas de las tareas abiertas de `sourceId` (una persona o, con
 *  'project', un proyecto; con ALL_USERS: todas las abiertas). Las asignadas
 *  van en dos: la lista nueva y el formato viejo. */
function buildOpenTaskQueries(source: OpenTasksSource, sourceId: string): Query<UserTask, StoredUserTask>[] {
  const openStatusFilter = where('status', '==', 'open');
  if (source === 'project') return [query(userTasksCol, where('projectId', '==', sourceId), openStatusFilter)];
  if (sourceId === ALL_USERS) return [query(userTasksCol, openStatusFilter)];
  if (source === 'created') return [query(userTasksCol, where('createdByUserId', '==', sourceId), openStatusFilter)];
  return [
    query(userTasksCol, where('assigneeUserIds', 'array-contains', sourceId), openStatusFilter),
    query(userTasksCol, where(LEGACY_ASSIGNEE_FIELD, '==', sourceId), openStatusFilter),
  ];
}

/** Tareas abiertas de `sourceId` según su origen. Junta las respuestas de sus
 *  consultas (sin repetir: si una tarea sale en las dos, gana la primera) y
 *  marca `loaded` cuando respondieron todas. */
function useOpenTasksBySource(
  source: OpenTasksSource, sourceId: string | null,
): { tasks: UserTask[]; loaded: boolean; error: Error | null } {
  const [keyedTasks, setKeyedTasks] = useState<KeyedState<UserTask[]> | null>(null);
  useEffect(() => {
    if (!sourceId) return;
    const queries = buildOpenTaskQueries(source, sourceId);
    const resultsByQuery: (UserTask[] | null)[] = queries.map(() => null);
    const isOfflineCacheByQuery: boolean[] = queries.map(() => false);
    let firstError: Error | null = null;
    const publishMergedTasks = () => {
      if (resultsByQuery.includes(null)) return;
      const tasksById = new Map<string, UserTask>();
      resultsByQuery.flat().forEach((task) => {
        if (task && !tasksById.has(task.id)) tasksById.set(task.id, task);
      });
      const mergedTasks = [...tasksById.values()];
      const isOfflineWithoutTasks = mergedTasks.length === 0 && isOfflineCacheByQuery.every(Boolean);
      const error = firstError ?? (isOfflineWithoutTasks ? OFFLINE_LOAD_ERROR : null);
      setKeyedTasks({ key: `${source}:${sourceId}`, value: mergedTasks, error });
    };
    const unsubscribers = queries.map((taskQuery, index) => onSnapshot(
      taskQuery,
      LISTEN_WITH_METADATA,
      (snapshot) => {
        resultsByQuery[index] = snapshot.docs.map((taskDoc) => taskDoc.data());
        isOfflineCacheByQuery[index] = isOfflineCacheOnly(snapshot.metadata);
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
  }, [source, sourceId]);
  const currentTasks = keyedTasks?.key === `${source}:${sourceId}` ? keyedTasks : null;
  return {
    tasks: currentTasks?.value ?? EMPTY_TASKS,
    loaded: currentTasks !== null,
    error: currentTasks?.error ?? null,
  };
}

/** Tareas abiertas asignadas a `assigneeUserId`, sola o con más personas (o
 *  las de todos con ALL_USERS). */
export const useOpenTasks = (assigneeUserId: string | null) => useOpenTasksBySource('assigned', assigneeUserId);

/** Tareas abiertas que `userId` creó, asignadas a quien sea (incluso a sí mismo). */
export const useCreatedTasks = (userId: string | null) => useOpenTasksBySource('created', userId);

/** Tareas abiertas de un proyecto (de todas sus personas). Solo con Scope
 *  "All": con "Own" las reglas rechazan la consulta (no pueden comprobar que
 *  cada tarea es de la persona). */
export const useProjectOpenTasks = (projectId: string | null) => useOpenTasksBySource('project', projectId);

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
 *  false) o si se borró (`loaded` en true). Sin red y sin la tarea en caché es
 *  un error, no "borrada". */
export function useLiveTask(taskId: string | null): { task: UserTask | null; loaded: boolean; error: Error | null } {
  const [keyedTask, setKeyedTask] = useState<KeyedState<UserTask | null> | null>(null);
  useEffect(() => {
    if (!taskId) return;
    return onSnapshot(
      userTaskRef(taskId),
      LISTEN_WITH_METADATA,
      (snapshot) => {
        const isMissingOffline = !snapshot.exists() && isOfflineCacheOnly(snapshot.metadata);
        setKeyedTask({
          key: taskId,
          value: snapshot.exists() ? snapshot.data() : null,
          error: isMissingOffline ? OFFLINE_LOAD_ERROR : null,
        });
      },
      (error) => {
        console.error('Error escuchando la tarea:', error);
        setKeyedTask({ key: taskId, value: null, error });
      },
    );
  }, [taskId]);
  const currentTask = taskId && keyedTask?.key === taskId ? keyedTask : null;
  return { task: currentTask?.value ?? null, loaded: !!currentTask, error: currentTask?.error ?? null };
}

/** Páginas de tareas hechas ya leídas, con la clave (relación + persona) a la que pertenecen. */
interface DoneTasksPagesState {
  key: string;
  pages: DoneTasksPage[];
  /** Página que se está viendo (0 = la de las más recientes). */
  pageIndex: number;
  error: Error | null;
  /** No se pudo traer la página siguiente (se sigue viendo la actual). */
  nextPageError?: Error | null;
}

/** Tareas HECHAS de `userId` según la relación (ALL_USERS = las de todos), de
 *  20 en 20 por páginas: se ve UNA página a la vez (la primera = las 20 más
 *  recientes). Solo pide datos con `isDoneTabOpen` (la pestaña Done abierta) y
 *  vuelve a la primera página al cambiar de persona, de relación o con
 *  `reload()` (p. ej. después de reabrir una). Las páginas ya leídas no se
 *  vuelven a pedir al ir hacia atrás. Si falla la página siguiente, se queda
 *  en la actual y lo dice `nextPageError` (la pantalla lo muestra; sin alert). */
export function useDoneTasks(relation: TaskRelation, userId: string | null, isDoneTabOpen: boolean): DoneTasksResult {
  const [reloadCount, setReloadCount] = useState(0);
  const [donePages, setDonePages] = useState<DoneTasksPagesState | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const queryUserId = userId === ALL_USERS ? null : userId;
  const donePagesKey = `${relation}:${userId}:${reloadCount}`;

  // Primera página: se sincroniza con la consulta de la persona y la relación.
  useEffect(() => {
    if (!isDoneTabOpen || !userId) return;
    let isCancelled = false;
    const loadFirstPage = async () => {
      try {
        if (await isDeviceOffline()) throw OFFLINE_LOAD_ERROR;
        const firstPage = await userTasksService.getDonePage(relation, queryUserId, null);
        if (!isCancelled) setDonePages({ key: donePagesKey, pages: [firstPage], pageIndex: 0, error: null });
      } catch (error) {
        console.error('Error leyendo las tareas hechas:', error);
        if (!isCancelled) setDonePages({ key: donePagesKey, pages: [], pageIndex: 0, error: toError(error) });
      }
    };
    void loadFirstPage();
    return () => { isCancelled = true; };
  }, [isDoneTabOpen, relation, userId, queryUserId, donePagesKey]);

  const currentDonePages = donePages?.key === donePagesKey ? donePages : null;
  const currentPage = currentDonePages?.pages[currentDonePages.pageIndex] ?? null;
  const pageIndex = currentDonePages?.pageIndex ?? 0;
  const hasNextPage = !!currentDonePages
    && (pageIndex + 1 < currentDonePages.pages.length || !!currentPage?.hasMore);

  const goToNextPage = async () => {
    if (!currentDonePages || !currentPage || !hasNextPage || isLoadingPage) return;
    const nextPageIndex = pageIndex + 1;
    if (nextPageIndex < currentDonePages.pages.length) {
      setDonePages({ ...currentDonePages, pageIndex: nextPageIndex, nextPageError: null });
      return;
    }
    setIsLoadingPage(true);
    try {
      const nextPage = await userTasksService.getDonePage(relation, queryUserId, currentPage.cursor);
      setDonePages({
        ...currentDonePages, pages: [...currentDonePages.pages, nextPage], pageIndex: nextPageIndex, nextPageError: null,
      });
    } catch (error) {
      console.error('Error leyendo la página siguiente de tareas hechas:', error);
      setDonePages({ ...currentDonePages, nextPageError: toError(error) });
    } finally {
      setIsLoadingPage(false);
    }
  };

  const goToPreviousPage = () => {
    if (!currentDonePages || pageIndex === 0) return;
    setDonePages({ ...currentDonePages, pageIndex: pageIndex - 1, nextPageError: null });
  };

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  return {
    tasks: currentPage?.tasks ?? EMPTY_TASKS,
    pageNumber: pageIndex + 1,
    hasPreviousPage: pageIndex > 0,
    hasNextPage,
    isLoading: isDoneTabOpen && !!userId && currentDonePages === null,
    isLoadingPage,
    error: currentDonePages?.error ?? null,
    nextPageError: currentDonePages?.nextPageError ?? null,
    goToPreviousPage,
    goToNextPage: () => { void goToNextPage(); },
    reload,
  };
}
