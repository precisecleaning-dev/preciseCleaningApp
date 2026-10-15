// src/features/ops/services/opsTasksService.ts
// ============================================================================
// Escrituras del Task list. Cada acción viaja en UN writeBatch (todo o nada):
// la tarea y los contadores de su proyecto (taskCount, doneCount, openMinutes)
// se actualizan juntos con increment(), sin leer-modificar-escribir. Los
// comentarios viven dentro de la tarea (comments[], arrayUnion): comentar o
// dar el visto bueno es UNA escritura de la tarea.
//
// Los contadores solo se tocan si el proyecto existe (`known`): un proyecto
// borrado haría fallar el batch completo.
// ============================================================================
import {
  arrayRemove, arrayUnion, deleteDoc, doc, increment, setDoc, updateDoc, writeBatch,
  type UpdateData, type WriteBatch,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db } from '../../../config/firebase';
import { storage } from '../../../config/storage';
import type {
  OpsApproval, OpsAttachment, OpsProject, OpsTask, OpsComment, Repeat, YmdDate,
} from '../../../types/index';
import { compressImage } from '../../../utils/imageCompression';
import { nextOccurrence } from '../opsDates';
import {
  opsPrioritiesRef, opsProjectRef, opsProjectsCol, opsTaskFilePath,
  opsTaskRef, opsTasksCol, type NewDoc,
} from './opsRefs';

export interface Actor {
  id: string;
  name: string;
}

/** Ids de los proyectos que existen (lista en vivo). */
export type KnownProjects = ReadonlySet<string>;

const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Contadores del proyecto
// ---------------------------------------------------------------------------
interface CounterDelta {
  taskCount?: number;
  doneCount?: number;
  openMinutes?: number;
}

function bumpProject(batch: WriteBatch, projectId: string | null, delta: CounterDelta, known: KnownProjects) {
  if (!projectId || !known.has(projectId)) return;
  const data: UpdateData<OpsProject> = {};
  if (delta.taskCount) data.taskCount = increment(delta.taskCount);
  if (delta.doneCount) data.doneCount = increment(delta.doneCount);
  if (delta.openMinutes) data.openMinutes = increment(delta.openMinutes);
  if (Object.keys(data).length > 0) batch.update(opsProjectRef(projectId), data);
}

/** Lo que una tarea aporta a los contadores de su proyecto. */
const contribution = (t: Pick<OpsTask, 'status' | 'durationMinutes'>): Required<CounterDelta> => ({
  taskCount: 1,
  doneCount: t.status === 'done' ? 1 : 0,
  openMinutes: t.status === 'open' ? Number(t.durationMinutes) || 0 : 0,
});

const negate = (d: Required<CounterDelta>): Required<CounterDelta> => ({
  taskCount: -d.taskCount,
  doneCount: -d.doneCount,
  openMinutes: -d.openMinutes,
});

// ---------------------------------------------------------------------------
// Tareas
// ---------------------------------------------------------------------------
export interface TaskInput {
  title: string;
  assigneeUserId: string;
  assigneeUserName: string;
  dueDate: YmdDate;
  dueTime: string;
  durationMinutes: number;
  priorityId: string | null;
  projectId: string | null;
  projectTitle: string | null;
  repeat: Repeat | null;
  approval: OpsApproval | null;
}

/** Visto bueno "por enviar" con quien lo debe dar (casilla "Needs OK"). */
export const draftApproval = (approverUserId: string, approverUserName: string): OpsApproval => ({
  status: 'draft',
  approverUserId,
  approverUserName,
  requestedByUserId: null,
  requestedAt: null,
  decidedAt: null,
  note: '',
});

function newTaskData(input: TaskInput, actor: Actor): NewDoc<OpsTask> {
  return {
    ...input,
    status: 'open',
    doneAt: null,
    doneByUserId: null,
    comments: [],
    attachments: [],
    createdByUserId: actor.id,
    createdByUserName: actor.name,
    createdAt: nowIso(),
  };
}

export async function createTask(input: TaskInput, actor: Actor, known: KnownProjects): Promise<string> {
  const taskRef = doc(opsTasksCol);
  const batch = writeBatch(db);
  batch.set(taskRef, { ...newTaskData(input, actor), id: taskRef.id });
  bumpProject(batch, input.projectId, contribution({ status: 'open', durationMinutes: input.durationMinutes }), known);
  await batch.commit();
  return taskRef.id;
}

/** Campos que se editan desde el panel de la tarea. */
export type TaskPatch = Partial<Pick<OpsTask,
  'title' | 'assigneeUserId' | 'assigneeUserName' | 'dueDate' | 'dueTime' | 'durationMinutes'
  | 'priorityId' | 'projectId' | 'projectTitle' | 'repeat'>>;

/** Guarda solo los campos cambiados y ajusta los contadores si cambió el
 *  proyecto o la duración. `task` es la versión en vivo. */
export async function updateTask(task: OpsTask, patch: TaskPatch, known: KnownProjects): Promise<void> {
  const batch = writeBatch(db);
  batch.update(opsTaskRef(task.id), patch as UpdateData<OpsTask>);
  const before = contribution(task);
  const after = contribution({ status: task.status, durationMinutes: patch.durationMinutes ?? task.durationMinutes });
  const nextProject = patch.projectId !== undefined ? patch.projectId : task.projectId;
  if (nextProject !== task.projectId) {
    bumpProject(batch, task.projectId, negate(before), known);
    bumpProject(batch, nextProject, after, known);
  } else if (after.openMinutes !== before.openMinutes) {
    bumpProject(batch, task.projectId, { openMinutes: after.openMinutes - before.openMinutes }, known);
  }
  await batch.commit();
}

/**
 * Marca la tarea hecha. Si se repite, crea la siguiente en el MISMO batch
 * (misma serie, nueva fecha) y devuelve su id para poder deshacer.
 */
export async function completeTask(task: OpsTask, actor: Actor, known: KnownProjects): Promise<string | null> {
  const batch = writeBatch(db);
  batch.update(opsTaskRef(task.id), { status: 'done', doneAt: nowIso(), doneByUserId: actor.id });
  bumpProject(batch, task.projectId, { doneCount: 1, openMinutes: -(Number(task.durationMinutes) || 0) }, known);
  let nextId: string | null = null;
  if (task.repeat) {
    const nextRef = doc(opsTasksCol);
    nextId = nextRef.id;
    const input: TaskInput = {
      title: task.title,
      assigneeUserId: task.assigneeUserId,
      assigneeUserName: task.assigneeUserName,
      dueDate: nextOccurrence(task.repeat, task.dueDate),
      dueTime: task.dueTime,
      durationMinutes: task.durationMinutes,
      priorityId: task.priorityId ?? null,
      projectId: task.projectId,
      projectTitle: task.projectTitle,
      repeat: task.repeat,
      // La repetición también necesita su visto bueno (vuelve a "por enviar").
      approval: task.approval ? draftApproval(task.approval.approverUserId, task.approval.approverUserName) : null,
    };
    batch.set(nextRef, { ...newTaskData(input, actor), id: nextRef.id });
    bumpProject(batch, task.projectId, contribution({ status: 'open', durationMinutes: task.durationMinutes }), known);
  }
  await batch.commit();
  return nextId;
}

/** Vuelve a abrir una tarea hecha. Con `undoNextId` (botón "Undo" justo
 *  después de completarla) borra también la repetición que se había creado. */
export async function reopenTask(task: OpsTask, known: KnownProjects, undoNextId: string | null = null): Promise<void> {
  const batch = writeBatch(db);
  batch.update(opsTaskRef(task.id), { status: 'open', doneAt: null, doneByUserId: null });
  bumpProject(batch, task.projectId, { doneCount: -1, openMinutes: Number(task.durationMinutes) || 0 }, known);
  if (undoNextId) {
    batch.delete(opsTaskRef(undoNextId));
    bumpProject(batch, task.projectId, negate(contribution({ status: 'open', durationMinutes: task.durationMinutes })), known);
  }
  await batch.commit();
}

/** Borra la tarea (con sus comentarios, que viven dentro) y sus archivos. */
export async function deleteTask(task: OpsTask, known: KnownProjects): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(opsTaskRef(task.id));
  bumpProject(batch, task.projectId, negate(contribution(task)), known);
  await batch.commit();
  await Promise.all((task.attachments || []).map((a) => removeStoredFile(a.path)));
}

// ---------------------------------------------------------------------------
// Visto bueno (approval)
// ---------------------------------------------------------------------------
/** Un comentario nuevo de `actor`. Va a `comments[]` con arrayUnion: dos
 *  personas que comentan a la vez no se pisan (la hora los distingue). */
const commentEntry = (text: string, actor: Actor): OpsComment => ({
  userId: actor.id,
  userName: actor.name,
  text,
  createdAt: nowIso(),
});

/** Envía (o reenvía) la tarea a `approver` para su OK. */
export async function requestApproval(task: OpsTask, approver: Actor, actor: Actor): Promise<void> {
  const approval: OpsApproval = {
    status: 'pending',
    approverUserId: approver.id,
    approverUserName: approver.name,
    requestedByUserId: actor.id,
    requestedAt: nowIso(),
    decidedAt: null,
    note: '',
  };
  // El paso queda en los comentarios, en la misma escritura.
  await updateDoc(opsTaskRef(task.id), {
    approval,
    comments: arrayUnion(commentEntry(`Sent for approval to ${approver.name}.`, actor)),
  });
}

/** Respuesta de quien aprueba: OK o pedir cambios (con nota). */
export async function decideApproval(
  task: OpsTask, decision: 'approved' | 'changes', note: string, actor: Actor,
): Promise<void> {
  if (!task.approval) return;
  await updateDoc(opsTaskRef(task.id), {
    approval: { ...task.approval, status: decision, decidedAt: nowIso(), note: decision === 'changes' ? note : '' },
    comments: arrayUnion(
      commentEntry(decision === 'approved' ? 'Approved.' : `Asked for changes${note ? `: ${note}` : '.'}`, actor),
    ),
  });
}

/** Pone o quita el requisito de visto bueno (sin enviarlo). */
export async function setApprovalRequirement(task: OpsTask, approval: OpsApproval | null): Promise<void> {
  await updateDoc(opsTaskRef(task.id), { approval });
}

// ---------------------------------------------------------------------------
// Comentarios y archivos
// ---------------------------------------------------------------------------
export async function addComment(taskId: string, text: string, actor: Actor): Promise<void> {
  await updateDoc(opsTaskRef(taskId), { comments: arrayUnion(commentEntry(text, actor)) });
}

async function removeStoredFile(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    console.error('No se pudo borrar el archivo de Storage:', err);
  }
}

/** Sube un archivo a la tarea (las imágenes se comprimen antes). */
export async function addAttachment(taskId: string, original: File): Promise<void> {
  const file = original.type.startsWith('image/')
    ? await compressImage(original, { maxWidth: 1920, quality: 0.85, maxSizeMB: 1 }).catch(() => original)
    : original;
  const safeName = original.name.replace(/[^\w.-]+/g, '_') || 'file';
  const path = opsTaskFilePath(taskId, safeName);
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file, {
    contentType: file.type || original.type || 'application/octet-stream',
    cacheControl: 'public, max-age=31536000',
  });
  const attachment: OpsAttachment = {
    name: original.name,
    url: await getDownloadURL(fileRef),
    path,
    type: file.type || original.type || 'application/octet-stream',
    size: file.size,
  };
  await updateDoc(opsTaskRef(taskId), { attachments: arrayUnion(attachment) });
}

export async function removeAttachment(taskId: string, attachment: OpsAttachment): Promise<void> {
  await updateDoc(opsTaskRef(taskId), { attachments: arrayRemove(attachment) });
  await removeStoredFile(attachment.path);
}

// ---------------------------------------------------------------------------
// Proyectos y top 3
// ---------------------------------------------------------------------------
export interface ProjectInput {
  title: string;
  description: string;
  ownerUserId: string;
  ownerUserName: string;
  teamId: string | null;
  startDate: YmdDate;
  dueDate: YmdDate;
  color: string | null;
  status: OpsProject['status'];
}

export async function createProject(input: ProjectInput, actor: Actor): Promise<string> {
  const projectRef = doc(opsProjectsCol);
  await setDoc(projectRef, {
    ...input,
    id: projectRef.id,
    repeat: null,
    taskCount: 0,
    doneCount: 0,
    openMinutes: 0,
    comments: [],
    doneAt: input.status === 'done' ? nowIso() : null,
    createdByUserId: actor.id,
    createdAt: nowIso(),
  });
  return projectRef.id;
}

/** Cambia datos del proyecto. Si cambia el estado, `doneAt` lo acompaña:
 *  la hora al pasar a Done y null al salir de Done. */
export async function updateProject(
  project: Pick<OpsProject, 'id' | 'status'>, patch: Partial<ProjectInput>,
): Promise<void> {
  const next = patch.status ?? project.status;
  const entersDone = next === 'done' && project.status !== 'done';
  const leavesDone = next !== 'done' && project.status === 'done';
  await updateDoc(opsProjectRef(project.id), {
    ...patch,
    ...(entersDone ? { doneAt: nowIso() } : {}),
    ...(leavesDone ? { doneAt: null } : {}),
  });
}

/** Solo se borra un proyecto SIN tareas (las demás se archivan). */
export async function deleteProject(project: OpsProject): Promise<void> {
  if ((project.taskCount || 0) > 0) throw new Error('El proyecto tiene tareas: archívalo en vez de borrarlo.');
  await deleteDoc(opsProjectRef(project.id));
}

/** Guarda el top 3 de un gerente (máximo 3 proyectos, en orden). */
export async function setPriorities(userId: string, projectIds: string[]): Promise<void> {
  await setDoc(opsPrioritiesRef(userId), {
    id: userId,
    projectIds: projectIds.filter(Boolean).slice(0, 3),
    updatedAt: nowIso(),
  });
}
