// src/features/ops/hooks/useHomeTasks.ts
// Tareas pendientes del Task list (user_tasks abiertas) para las vistas Owner
// y Manager, con el Scope de Roles → Task List: "All" trae las de todos y
// "Own" solo las propias. Marcar hecha, borrar y crear pasan por las mismas
// acciones del Task list (contadores del proyecto, repeticiones, visto bueno).
import { useMemo } from 'react';
import type { Role, SystemUser } from '../../../types/index';
import { useLiveCollection } from '../../../shared/data/liveCollections';
import { canViewTaskList, taskListRights, userName } from '../opsPermissions';
import { EVERYONE, useOpenTasks } from './useOpsData';
import { useTaskActions } from './useTaskActions';

export function useHomeTasks(me: SystemUser | null, role: Role | null | undefined, isSuperAdmin: boolean) {
  const canView = canViewTaskList(role, isSuperAdmin);
  const rights = taskListRights(role, isSuperAdmin);
  const meId = me?.id || '';
  const source = canView && meId ? (rights.seesAll ? EVERYONE : meId) : null;
  const { tasks, loaded } = useOpenTasks(source);
  // Los proyectos hacen falta para ajustar sus contadores al marcar o borrar.
  const { data: projects } = useLiveCollection('taskProjects', canView);
  const known = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);
  const actions = useTaskActions({ id: meId, name: userName(me) }, known);
  // Primero las que vencen antes (sin fecha al final), luego por hora y título.
  const sorted = useMemo(
    () => [...tasks].sort((a, b) =>
      (a.dueDate || '9').localeCompare(b.dueDate || '9')
      || (a.dueTime || '99').localeCompare(b.dueTime || '99')
      || a.title.localeCompare(b.title)),
    [tasks],
  );
  return { canView, rights, tasks: sorted, loaded, actions };
}
