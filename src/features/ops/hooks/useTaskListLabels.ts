// src/features/ops/hooks/useTaskListLabels.ts
// Textos de cada fila del Task list: a quién está asignada ("Me, Sandy +1"),
// quién la asignó ("From Omar"), y el título y color de su proyecto. Usan los
// nombres en vivo (system_users y task_projects) y, si ya no existen, la copia
// guardada en la tarea.
import type { SystemUser, TaskProject, UserTask } from '../../../types/index';
import { getFirstName, namesSummary, projectHex } from '../opsOptions';
import { isOnlyAssignee, userName } from '../opsPermissions';

interface TaskListLabelsInput {
  users: SystemUser[];
  projectsById: ReadonlyMap<string, TaskProject>;
  /** Quien usa la app ("Me"). */
  currentUserId: string;
  /** La persona cuyas tareas se miran (su "From" no se muestra). */
  viewedUserId: string;
}

export const useTaskListLabels = ({ users, projectsById, currentUserId, viewedUserId }: TaskListLabelsInput) => {
  const getLiveUserName = (userId: string, savedName: string): string => {
    const user = users.find((systemUser) => systemUser.id === userId);
    return getFirstName(user ? userName(user) : savedName);
  };

  /** "Me, Sandy +1": las personas de la tarea, con su nombre en vivo si existe. */
  const getAssigneesLabel = (task: UserTask): string =>
    namesSummary(task.assignees.map((assignee) => (
      assignee.userId === currentUserId ? 'Me' : getLiveUserName(assignee.userId, assignee.userName)
    )));

  /** "From X": quién la asignó, si no se la asignó solo a sí mismo ni es la que se mira. */
  const getAssignedByName = (task: UserTask): string | null => {
    if (!task.createdByUserId || isOnlyAssignee(task, task.createdByUserId) || task.createdByUserId === viewedUserId) {
      return null;
    }
    if (task.createdByUserId === currentUserId) return 'Me';
    return getLiveUserName(task.createdByUserId, task.createdByUserName) || null;
  };

  const getProjectTitle = (task: UserTask): string | null =>
    (task.projectId ? projectsById.get(task.projectId)?.title ?? task.projectTitle : null);

  const getProjectColor = (task: UserTask): string =>
    projectHex(task.projectId ? projectsById.get(task.projectId) : null, task.projectId ?? '');

  return { getAssigneesLabel, getAssignedByName, getProjectTitle, getProjectColor };
};
