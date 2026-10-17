// src/features/ops/opsPermissions.ts
// ============================================================================
// Permisos del Task list (módulo "Task List" en Roles & Permissions).
//
// · Ver la vista: canView del módulo. Un rol que todavía NO declara el módulo
//   (roles guardados antes de que existiera) hereda de "Manager" u "Owner":
//   así los gerentes lo ven desde el primer día sin reconfigurar roles.
// · Todos los que la ven pueden agregar tareas, marcarlas, comentar y adjuntar,
//   y editar las tareas que les asignaron o que crearon.
// · canEdit: editar cualquier tarea, crear y editar proyectos y el top 3 de
//   cualquier gerente (cada quien siempre puede cambiar el suyo).
// · canDelete: borrar tareas y proyectos.
// · scope: "All" ve las tareas de todos (selector de persona y "Everyone");
//   "Own" solo las suyas (las que tiene asignadas, las que asignó a otros y
//   las que esperan su OK).
//   Rige también en Owner y Manager. Un rol que no declara el módulo ve todas,
//   como antes. Las reglas propuestas (security/) aplican lo mismo.
// ============================================================================
import type { AssignableUser, Permission, Role, SystemUser, TaskAssignee, UserTask } from '../../types/index';

const TASK_LIST_MODULE = 'Task List';

const perm = (role: Role | null | undefined, module: string): Permission | undefined =>
  role?.permissions?.find((p) => p.module === module);

/** ¿Este rol puede abrir el Task list? */
export function canViewTaskList(role: Role | null | undefined, isSuperAdmin: boolean): boolean {
  if (isSuperAdmin) return true;
  if (!role) return false;
  const declared = perm(role, TASK_LIST_MODULE);
  if (declared) return !!declared.canView;
  return !!perm(role, 'Manager')?.canView || !!perm(role, 'Owner')?.canView;
}

interface TaskListRights {
  canEdit: boolean;
  canDelete: boolean;
  /** Scope "All" del módulo: ve las tareas de todos (con "Own", solo las suyas). */
  seesAll: boolean;
}

export function taskListRights(role: Role | null | undefined, isSuperAdmin: boolean): TaskListRights {
  if (isSuperAdmin) return { canEdit: true, canDelete: true, seesAll: true };
  const declared = perm(role, TASK_LIST_MODULE);
  if (declared) {
    return { canEdit: !!declared.canEdit, canDelete: !!declared.canDelete, seesAll: declared.scope !== 'Own' };
  }
  const legacy = canViewTaskList(role, false);
  return { canEdit: legacy, canDelete: legacy, seesAll: true };
}

/** ¿A este usuario se le pueden asignar tareas? (los que tienen la vista). */
function isTaskListUser(user: SystemUser, roles: Role[]): boolean {
  if (user.status === 'Inactive') return false;
  const role = roles.find((r) => r.id === user.roleId);
  if (!role) return false;
  return role.name === 'Administrator' || canViewTaskList(role, false);
}

/** ¿`userId` es una de las personas asignadas a la tarea? */
export const isAssignee = (task: Pick<UserTask, 'assignees'>, userId: string): boolean =>
  task.assignees.some((assignee) => assignee.userId === userId);

/** ¿Tiene visto bueno y todavía no está aprobada? Así no se puede marcar hecha. */
export const isAwaitingApproval = (task: Pick<UserTask, 'approval'>): boolean =>
  !!task.approval && task.approval.status !== 'approved';

/** ¿La tarea es solo de `userId`? (p. ej. alguien que se la asignó a sí mismo). */
export const isOnlyAssignee = (task: Pick<UserTask, 'assignees'>, userId: string): boolean =>
  task.assignees.length === 1 && task.assignees[0].userId === userId;

/** ¿Puede cambiar a quiénes está asignada la tarea? Quien la asignó, sí. A
 *  quien se la asignó otra persona, no (aunque su rol tenga Edit). Con Edit
 *  también se pueden reasignar las tareas de los demás. Las reglas propuestas
 *  aplican lo mismo. */
export function canReassignTask(
  task: Pick<UserTask, 'createdByUserId' | 'assignees'>, meId: string, rights: TaskListRights,
): boolean {
  if (task.createdByUserId === meId) return true;
  return rights.canEdit && !isAssignee(task, meId);
}

/** Un usuario de la lista de "Assign to" como persona asignada de una tarea. */
export const toTaskAssignee = (user: AssignableUser): TaskAssignee => ({ userId: user.id, userName: user.name });

/** "Assign to": usuarios activos de system_users cuyo rol puede abrir Task
 *  List (más uno mismo), con "Me" primero y los demás por nombre. */
export function assignablePeople(users: SystemUser[], roles: Role[], meId: string, meName: string): AssignableUser[] {
  const list = users
    .filter((u) => u.id === meId || isTaskListUser(u, roles))
    .map((u) => ({ id: u.id, name: userName(u), label: u.id === meId ? 'Me' : userName(u) }));
  if (meId && !list.some((p) => p.id === meId)) list.push({ id: meId, name: meName, label: 'Me' });
  return list.sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : a.name.localeCompare(b.name)));
}

export function userName(user: Pick<SystemUser, 'firstName' | 'lastName' | 'email'> | null | undefined): string {
  if (!user) return '';
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || '';
}
