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
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import type { IsoDateTime, YmdDate } from './index';

/** Estado de una tarea. La lista descarga solo las abiertas; las hechas se piden
 *  por páginas en la pestaña Done (userTasksService.getDonePage). */
export type UserTaskStatus = 'open' | 'done';

/** Cada cuánto se repite una tarea o un proyecto. */
export type RepeatFreq =
  | 'daily' //     "Every day"
  | 'weekdays' //  de lunes a viernes (viejo: se lee "Every day except Sat, Sun")
  | 'weekly' //    "Every day except": los días que SÍ tocan van en `days`
  | 'monthly'; //  el mismo día de cada mes (viejo: ya no se elige)

/** Map `repeat` de una tarea. `null` = no se repite. (Los proyectos guardan
 *  solo la frecuencia: `repeat: RepeatFreq | null`.) */
export interface Repeat {
  freq: RepeatFreq; //                  frecuencia de la repetición
  days?: number[]; //                   solo con 'weekly': días en que toca, 0 = domingo … 6 = sábado
  timesLeft?: number | null; //         viejo "After N times": veces que falta, contando esta (null o sin campo = siempre)
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

/** Archivo elegido en el formulario de nueva tarea (no se guarda en Firestore):
 *  se sube cuando la tarea ya existe. `preview` es su tarjeta mientras tanto,
 *  con `url` = vista previa local (blob:) y `path` = id local. */
export interface PendingTaskFile {
  file: File;
  preview: TaskAttachment;
}

/** Elemento de `comments[]` de una tarea o de un proyecto (sin archivos). Se
 *  identifica por autor + hora (no tiene id propio). `createdAt` es texto ISO:
 *  dentro de un arreglo Firestore no acepta serverTimestamp(). */
/** Comentario escrito en el formulario de nueva tarea, antes de que la tarea
 *  exista: su texto y la hora en que se escribió. El autor siempre es quien
 *  crea la tarea (lo pone userTasksService.create). */
export type InitialComment = Pick<TaskComment, 'text' | 'createdAt'>;

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
/** Quién hace un cambio o a quién se le pide algo (id + nombre del usuario). */
export interface Actor {
  id: string;
  name: string;
}

export interface AssignableUser {
  id: string;
  name: string;
  /** "Me" para quien está usando la app. */
  label: string;
}

/** Relación de una persona con las tareas: las que tiene asignadas o las que asignó. */
export type TaskRelation = 'assigned' | 'created';

/** Pestaña de arriba del Task list: las que le asignaron a la persona o las que ella asignó a otros. */
export type AssignmentTab = 'assignedTo' | 'assignedBy';

/** De dónde salen las tareas abiertas de un listener: de una persona (las que
 *  tiene asignadas o las que creó) o de un proyecto (todas las de ese proyecto). */
export type OpenTasksSource = TaskRelation | 'project';

/** Marca para pedir la página siguiente de las tareas hechas (último documento leído). */
export type DoneTasksCursor = QueryDocumentSnapshot<UserTask, StoredUserTask>;

/** Una página de tareas hechas, de la más reciente (doneAt) a la más vieja. */
export interface DoneTasksPage {
  tasks: UserTask[];
  cursor: DoneTasksCursor | null;
  hasMore: boolean;
}

/** Lo que devuelve useDoneTasks: la página de hechas que se ve y cómo moverse. */
export interface DoneTasksResult {
  tasks: UserTask[]; //                 tareas de la página que se ve
  pageNumber: number; //                1 = las 20 más recientes
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  isLoading: boolean; //                primera página en camino
  isLoadingPage: boolean; //            página siguiente en camino
  error: Error | null; //               no se pudo leer la primera página (con su `code` de Firestore)
  nextPageError: Error | null; //       no se pudo leer la página siguiente (se sigue viendo la actual)
  goToPreviousPage: () => void;
  goToNextPage: () => void;
  reload: () => void; //                vuelve a pedir desde la primera página
}

/** Pestaña de la lista del Task list: por vencimiento (overdue, daily = hoy y
 *  las diarias de hoy, week, later, nodate), las que esperan un visto bueno
 *  (approval), todas las abiertas (all) y las hechas (done). */
export type TaskListTabId = 'overdue' | 'daily' | 'approval' | 'week' | 'later' | 'nodate' | 'all' | 'done';

/** Documento app_settings/task_list_tabs: orden de las pestañas, el mismo para
 *  todos. Lo cambia quien tiene Edit en Task List. */
export interface TaskListTabsSettings {
  tabOrder: TaskListTabId[]; //         pestañas en el orden en que se muestran
  updatedAt: string; //                 ISO del último cambio
  updatedByUserId: string; //           quién lo cambió
  updatedByUserName: string;
}
