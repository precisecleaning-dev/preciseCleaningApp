// src/types/taskProjects.ts
// ============================================================================
// Tipos de la colección `task_projects` (Task list): proyectos que agrupan
// tareas de user_tasks. Los usa src/services/taskProjectsService.ts.
// Se importan desde '../types/index' (index.ts los reexporta).
//
// El proyecto NO guarda la lista de sus tareas: cada tarea guarda su
// `projectId` y se piden con where('projectId', '==', id).
// ============================================================================
import type { IsoDateTime, YmdDate } from './index';
import type { RepeatFreq, TaskComment } from './userTasks';

/** Estado de un proyecto. */
export type TaskProjectStatus = 'active' | 'done' | 'archived';

/** task_projects/{projectId} — Proyectos (agrupan tareas de user_tasks). */
export interface TaskProject {
  id: string; //                        PK · id del documento
  title: string; //                     nombre del proyecto
  description: string; //               objetivo o descripción corta
  ownerUserId: string; //               FK → system_users: responsable
  ownerUserName: string; //             copia del nombre del responsable
  teamId: string | null; //             FK → settings_teams (null = sin equipo)
  startDate: YmdDate; //                fecha de inicio ('' = sin fecha)
  dueDate: YmdDate; //                  fecha límite ('' = sin fecha)
  repeat: RepeatFreq | null; //         cada cuánto se repite (null = no se repite)
  color: string | null; //              nombre del color (lista en opsOptions); null = automático
  status: TaskProjectStatus; //         active · done · archived
  taskCount: number; //                 tareas del proyecto (increment())
  doneCount: number; //                 tareas hechas (increment())
  openMinutes: number; //               minutos de tareas abiertas (increment())
  comments: TaskComment[]; //           comentarios (arrayUnion), sin archivos
  doneAt: IsoDateTime | null; //        cuándo pasó a Done (null = no está hecho)
  createdByUserId: string; //           FK → system_users: quién lo creó
  createdAt: IsoDateTime; //            cuándo se creó
}
