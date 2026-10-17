// src/types/userTasks.ts
// ============================================================================
// Tipos de la colección `user_tasks` (Task list): una tarea por documento, con
// o sin proyecto. Los usa src/services/userTasksService.ts y todo el Task list.
// Se importan desde '../types/index' (index.ts los reexporta).
//
// Fechas como TEXTO: días AAAA-MM-DD (YmdDate) y fecha + hora ISO
// (IsoDateTime). Todo campo que guarda un usuario termina en UserId / UserName
// (UserIds / UserNames si guarda varios, como las personas asignadas).
// ============================================================================
import type { IsoDateTime, YmdDate } from './index';

/** Estado de una tarea. Las hechas no se descargan en la lista (solo las abiertas). */
export type UserTaskStatus = 'open' | 'done';

/** Cada cuánto se repite una tarea o un proyecto. */
export type RepeatFreq =
  | 'daily' //     todos los días
  | 'weekdays' //  de lunes a viernes
  | 'weekly' //    ciertos días de la semana (ver `days`)
  | 'monthly'; //  el mismo día de cada mes

/** Map `repeat` de una tarea. `null` = no se repite. (Los proyectos guardan
 *  solo la frecuencia: `repeat: RepeatFreq | null`.) */
export interface Repeat {
  freq: RepeatFreq; //                  frecuencia de la repetición
  days?: number[]; //                   solo con 'weekly': 0 = domingo … 6 = sábado
}

/** Estado del visto bueno de una tarea:
 *  draft = necesita OK pero aún no se envía · pending = esperando la respuesta ·
 *  approved = aprobada · changes_requested = pidieron cambios. */
export type UserTaskApprovalStatus = 'draft' | 'pending' | 'approved' | 'changes_requested';

/** Respuesta de quien da el visto bueno. */
export type ApprovalDecision = Extract<UserTaskApprovalStatus, 'approved' | 'changes_requested'>;

/** Map `approval` de una tarea (null = no necesita visto bueno). La tarea no se
 *  puede marcar hecha hasta que esté `approved`. */
export interface UserTaskApproval {
  status: UserTaskApprovalStatus; //    draft · pending · approved · changes_requested
  approverUserId: string; //            FK → system_users: quién da el OK
  approverUserName: string; //          copia del nombre de quien aprueba
  requestedByUserId: string | null; //  FK → system_users: quién la envió
  requestedAt: IsoDateTime | null; //   cuándo se envió (la última vez)
  decidedAt: IsoDateTime | null; //     cuándo aprobó o pidió cambios
  note: string; //                      cambios pedidos ("" si no hay)
}

/** Map de cada elemento de `attachments[]`. El archivo vive en Storage
 *  (user_tasks/{taskId}/…). Los proyectos no llevan archivos. */
export interface TaskAttachment {
  name: string; //                      nombre del archivo que se muestra
  url: string; //                       URL de descarga (para abrirlo o verlo)
  path: string; //                      ruta en Storage (para borrarlo)
  type: string; //                      tipo MIME: image/jpeg, application/pdf…
  size: number; //                      tamaño en bytes
}

/** Elemento de `comments[]` de una tarea o de un proyecto (sin archivos). Se
 *  identifica por autor + hora (no tiene id propio). `createdAt` es texto ISO:
 *  dentro de un arreglo Firestore no acepta serverTimestamp(). */
/** Elemento de `assignees[]`: una de las personas asignadas a la tarea. */
export interface TaskAssignee {
  userId: string; //                    FK → system_users: persona asignada
  userName: string; //                  copia de su nombre
}

export interface TaskComment {
  userId: string; //                    FK → system_users: quién comentó
  userName: string; //                  copia del nombre de quien comentó
  text: string; //                      texto del comentario
  createdAt: IsoDateTime; //            cuándo se comentó
}

/** user_tasks/{taskId} — Tareas (con o sin proyecto). */
export interface UserTask {
  id: string; //                        PK · id del documento
  title: string; //                     qué hay que hacer
  assignees: TaskAssignee[]; //         a quiénes se asignó (una o varias personas)
  dueDate: YmdDate; //                  día en que vence ('' = sin fecha)
  dueTime: string; //                   hora "HH:mm" (24 h) o "" si no tiene hora
  durationMinutes: number; //           duración estimada en minutos (2 h = 120; 0 = no aplica)
  priorityId: string | null; //         FK → settings_priorities (High, Medium…)
  projectId: string | null; //          FK → task_projects (null = "No project")
  projectTitle: string | null; //       copia del título del proyecto
  repeat: Repeat | null; //             repetición (null = no se repite)
  approval: UserTaskApproval | null; // visto bueno antes de terminarla (null = no hace falta)
  status: UserTaskStatus; //            open · done
  doneAt: IsoDateTime | null; //        cuándo se marcó hecha
  doneByUserId: string | null; //       FK → system_users: quién la marcó hecha
  comments: TaskComment[]; //           comentarios, del más viejo al más nuevo (arrayUnion)
  attachments: TaskAttachment[]; //     archivos (Storage: user_tasks/{id}/…)
  createdByUserId: string; //           FK → system_users: quién la asignó (no se edita)
  createdByUserName: string; //         copia del nombre de quien la asignó
  createdAt: IsoDateTime; //            cuándo se creó
}

/** Formato viejo de la persona asignada (hasta 10/2026 una tarea tenía una
 *  sola). Solo se lee: el service lo pasa a `assignees` y lo borra la próxima
 *  vez que se cambian las personas de esa tarea. */
export interface LegacyTaskAssignee {
  assigneeUserId?: string; //           FK → system_users: la única persona asignada
  assigneeUserName?: string; //         copia de su nombre
}

/** `approval` como puede estar guardado: hasta 10/2026 "pidieron cambios" se
 *  guardaba como 'changes' (el service lo lee como 'changes_requested'). */
export type StoredUserTaskApproval = Omit<UserTaskApproval, 'status'> & {
  status: UserTaskApprovalStatus | 'changes';
};

/** Cómo está guardada una tarea en Firestore: sin `id` (es el del documento),
 *  con `assigneeUserIds` (los ids de `assignees`, solo para la consulta
 *  array-contains; lo arma el service) y, si es vieja, con la persona y el
 *  visto bueno en el formato de antes. */
export type StoredUserTask = Omit<UserTask, 'id' | 'assignees' | 'approval'>
  & Partial<Pick<UserTask, 'assignees'>>
  & { approval: StoredUserTaskApproval | null; assigneeUserIds?: string[] }
  & LegacyTaskAssignee;

/** Persona a la que se le puede asignar una tarea. */
export interface AssignableUser {
  id: string;
  name: string;
  /** "Me" para quien está usando la app. */
  label: string;
}
