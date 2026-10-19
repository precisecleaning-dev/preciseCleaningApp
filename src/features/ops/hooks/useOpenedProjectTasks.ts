// src/features/ops/hooks/useOpenedProjectTasks.ts
// Tareas de la ventana de un proyecto (clic en su tarjeta de "My projects" o
// en la lista de Projects). Con Scope "All" escucha TODAS sus abiertas
// (projectId == x); con "Own" las reglas no dejan pedirlas, así que usa las que
// la persona ya tiene cargadas. Van de la más reciente a la más vieja.
import type { TaskProject, UserTask } from '../../../types/index';
import { projectTasksByNewest } from '../taskListTabs';
import { useProjectOpenTasks } from './useOpsData';

interface OpenedProjectTasksInput {
  openedProjectId: string | null;
  projectsById: ReadonlyMap<string, TaskProject>;
  /** Scope "All" (taskListRights().seesAll): puede pedir las tareas de todos. */
  canQueryAllTasks: boolean;
  /** Tareas abiertas ya cargadas en la vista (para Scope "Own"). */
  loadedOpenTasks: { tasks: UserTask[]; loaded: boolean; error: Error | null };
}

export const useOpenedProjectTasks = ({
  openedProjectId, projectsById, canQueryAllTasks, loadedOpenTasks,
}: OpenedProjectTasksInput) => {
  const projectOpenTasksResult = useProjectOpenTasks(canQueryAllTasks ? openedProjectId : null);
  const openedProject = openedProjectId ? projectsById.get(openedProjectId) ?? null : null;
  const openedProjectTasksResult = canQueryAllTasks
    ? projectOpenTasksResult
    : { ...loadedOpenTasks, tasks: loadedOpenTasks.tasks.filter((task) => task.projectId === openedProjectId) };
  return {
    openedProject,
    openedProjectTasks: projectTasksByNewest(openedProjectTasksResult.tasks),
    isLoading: !openedProjectTasksResult.loaded,
    hasLoadError: !!openedProjectTasksResult.error,
  };
};
