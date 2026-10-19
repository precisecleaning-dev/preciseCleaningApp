// src/features/ops/taskListTabs.ts
// ============================================================================
// Pestañas de la lista del Task list: nombres, orden de fábrica, el orden que
// guardó quien edita Task List (app_settings/task_list_tabs) y qué tareas van
// en cada una:
//   · Overdue, Daily (vencen hoy, también las diarias), This week, Later,
//     No date: por vencimiento (taskSectionOf). Una diaria de otro día no
//     sale hasta su día.
//   · Needs Approval: las que yo tengo que aprobar y las de la lista que
//     esperan un OK (por enviar, enviadas o con cambios pedidos).
//   · ALL: todas las abiertas de la lista, de la más reciente a la más vieja.
//   · Done: las hechas (se piden por páginas; DoneTaskList).
// En todas, la más reciente arriba (fecha y hora de creación, pedido de Omar
// 10/2026); en Done, por cuándo se hizo.
// ============================================================================
import type { TaskListTabId, UserTask, YmdDate } from '../../types/index';
import { todayIso } from '../../utils/dateFormat';
import { compareByNewest, taskSectionOf } from './opsDates';
import { isAwaitingApproval } from './opsPermissions';

/** Pestañas con tareas abiertas (todas menos Done). */
export type OpenTaskTabId = Exclude<TaskListTabId, 'done'>;

export const TASK_LIST_TAB_LABEL: Record<TaskListTabId, string> = {
  overdue: 'Overdue',
  daily: 'Daily',
  approval: 'Needs Approval',
  week: 'This week',
  later: 'Later',
  nodate: 'No date',
  all: 'ALL',
  done: 'Done',
};

/** ALL va SIEMPRE primero, se elija el orden que se elija (pedido de Omar, 10/2026). */
export const FIRST_TAB: TaskListTabId = 'all';

/** Orden de fábrica: ALL, luego las vencidas, las de hoy y las que esperan un OK. */
export const DEFAULT_TAB_ORDER: TaskListTabId[] = ['all', 'overdue', 'daily', 'approval', 'week', 'later', 'nodate', 'done'];

/** Se ven aunque no tengan tareas (las demás solo con tareas). */
const ALWAYS_VISIBLE_TABS: TaskListTabId[] = ['all', 'done'];

const isTaskListTabId = (value: unknown): value is TaskListTabId =>
  DEFAULT_TAB_ORDER.includes(value as TaskListTabId);

/** El orden guardado con ALL primero, sin pestañas desconocidas ni repetidas;
 *  las que falten (p. ej. una pestaña nueva) van al final en el orden de fábrica. */
export const normalizeTabOrder = (savedTabOrder: readonly unknown[] | null | undefined): TaskListTabId[] => {
  const knownTabs = (savedTabOrder ?? []).filter(isTaskListTabId).filter((tabId) => tabId !== FIRST_TAB);
  const uniqueTabs = [FIRST_TAB, ...new Set(knownTabs)];
  return [...uniqueTabs, ...DEFAULT_TAB_ORDER.filter((tabId) => !uniqueTabs.includes(tabId))];
};

/** Tareas de cada pestaña abierta, de la más reciente a la más vieja. `tasksToApprove` son las que
 *  esperan MI visto bueno (van solo en Needs Approval). */
export const groupTasksByTab = (
  listTasks: UserTask[], tasksToApprove: UserTask[], today: YmdDate = todayIso(),
): Record<OpenTaskTabId, UserTask[]> => {
  const tasksByTab: Record<OpenTaskTabId, UserTask[]> = {
    overdue: [], daily: [], approval: [], week: [], later: [], nodate: [], all: [],
  };
  const tasksToApproveIds = new Set(tasksToApprove.map((task) => task.id));
  listTasks.forEach((task) => {
    const section = taskSectionOf(task, today);
    if (!section) return;
    tasksByTab[section].push(task);
    if (isAwaitingApproval(task) && !tasksToApproveIds.has(task.id)) tasksByTab.approval.push(task);
  });
  tasksByTab.approval.push(...tasksToApprove);
  tasksByTab.all = [...listTasks];
  Object.values(tasksByTab).forEach((tabTasks) => tabTasks.sort(compareByNewest));
  return tasksByTab;
};

/** Pestañas que se muestran, en el orden elegido, con su total (null = Done:
 *  sin total, se pide por páginas). */
export const visibleTabsOf = (
  tabOrder: TaskListTabId[], tasksByTab: Record<OpenTaskTabId, UserTask[]>,
): { tabId: TaskListTabId; taskCount: number | null }[] =>
  tabOrder
    .map((tabId) => ({ tabId, taskCount: tabId === 'done' ? null : tasksByTab[tabId].length }))
    .filter(({ tabId, taskCount }) => ALWAYS_VISIBLE_TABS.includes(tabId) || (taskCount ?? 0) > 0);

/** Todas las abiertas de un proyecto, la más reciente arriba (la ventana del
 *  proyecto). Incluye las diarias de otro día: son tareas del proyecto aunque
 *  todavía no salgan en las pendientes (si no, "4/5 done" decía "no pending tasks"). */
export const projectTasksByNewest = (tasks: UserTask[]): UserTask[] => [...tasks].sort(compareByNewest);

/** Las que vencen `isoDate` (filtro por un día del calendario), la más reciente arriba. */
export const tasksDueOn = (tasks: UserTask[], isoDate: YmdDate): UserTask[] =>
  tasks.filter((task) => task.dueDate === isoDate).sort(compareByNewest);
