// src/features/ops/hooks/useTaskListBadgeCount.ts
// Número del círculo de "Task List" en el menú: las tareas abiertas asignadas a
// la persona más las que esperan su visto bueno (sin contar dos veces una que
// esté en las dos). Las diarias de otro día no cuentan: aparecen el día que les
// toca. Usa los mismos listeners que el Task list (useOpsData): el
// SDK comparte las consultas iguales, así que abrir la vista no las duplica.
// userId null = no se cuenta (sin permiso de Task List o sin perfil).
import { todayIso } from '../../../utils/dateFormat';
import { isUpcomingDailyRepeat } from '../opsDates';
import { useApprovalQueue, useOpenTasks } from './useOpsData';

export const useTaskListBadgeCount = (userId: string | null): number => {
  const openTasks = useOpenTasks(userId);
  const approvalQueue = useApprovalQueue(userId);
  if (!userId) return 0;
  const todayIsoDate = todayIso();
  const pendingTaskIds = new Set([...openTasks.tasks, ...approvalQueue.tasks]
    .filter((task) => !isUpcomingDailyRepeat(task, todayIsoDate))
    .map((task) => task.id));
  return pendingTaskIds.size;
};
