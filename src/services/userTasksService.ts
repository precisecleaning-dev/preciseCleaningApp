// src/services/userTasksService.ts
// ============================================================================
// Colección `user_tasks` (tareas del Task list). Tipos en src/types/userTasks.ts.
//
//   create · update · delete · getAll · getOne
//   y lo que ya usa la pantalla: complete · reopen · visto bueno · comentarios
//   · archivos.
//
// Cada escritura que cambia una tarea con proyecto viaja en UN writeBatch (todo
// o nada): la tarea y los contadores de su proyecto (taskCount, doneCount,
// openMinutes) se actualizan juntos con increment(). Por eso create, update y
// delete reciben `known` (ids de los proyectos que existen).
//
// Lecturas: la lista en pantalla usa listeners filtrados (features/ops/hooks/
// useOpsData.ts). getAll/getOne son lecturas únicas; getAll sin filtros trae
// TODA la colección (también las hechas, que crecen sin fin): pásale filtros.
//
// Personas asignadas: una tarea puede tener varias (assigneeUserIds /
// assigneeUserNames). Las tareas de antes guardan una sola (assigneeUserId /
// assigneeUserName): el converter las lee como lista y `update` borra el
// formato viejo cuando se cambian las personas. Mientras queden tareas viejas,
// la lista de una persona escucha los dos formatos (useOpsData.ts).
// ============================================================================
import {
  arrayRemove, arrayUnion, collection, deleteField, doc, getDoc, getDocs, query, updateDoc, where, writeBatch,
  type CollectionReference, type DocumentReference, type FirestoreDataConverter, type QueryConstraint,
  type QueryDocumentSnapshot, type UpdateData, type WithFieldValue,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db } from '../config/firebase';
import { storage } from '../config/storage';
import { COLLECTIONS } from '../lib/firebase/collections';
import type { NewDoc } from '../lib/firebase/typedConverter';
import type {
  Repeat, StoredUserTask, TaskAttachment, TaskComment, UserTask, UserTaskApproval, YmdDate,
} from '../types/index';
import { compressImage } from '../utils/imageCompression';
import { nextOccurrence } from '../features/ops/opsDates';
import { bumpProjectCounters, type KnownProjects, type ProjectCounterDelta } from './taskProjectsService';

export type { KnownProjects } from './taskProjectsService';

// ---------------------------------------------------------------------------
// Referencias tipadas (la colección se tipa una sola vez, aquí)
// ---------------------------------------------------------------------------
/** Como typedConverter (el id es el del documento), y además lee la persona
 *  del formato viejo (assigneeUserId) como lista: el resto de la app solo ve
 *  assigneeUserIds / assigneeUserNames. */
const userTaskConverter: FirestoreDataConverter<UserTask, StoredUserTask> = {
  toFirestore(task: WithFieldValue<UserTask>): WithFieldValue<StoredUserTask> {
    const { id: _id, ...data } = task;
    return data;
  },
  fromFirestore(snap: QueryDocumentSnapshot): UserTask {
    const { assigneeUserId, assigneeUserName, ...data } = snap.data() as StoredUserTask;
    return {
      ...data,
      id: snap.id,
      assigneeUserIds: data.assigneeUserIds ?? (assigneeUserId ? [assigneeUserId] : []),
      assigneeUserNames: data.assigneeUserNames ?? (assigneeUserId ? [assigneeUserName ?? ''] : []),
    };
  },
};

export const userTasksCol: CollectionReference<UserTask, StoredUserTask> =
  collection(db, COLLECTIONS.userTasks).withConverter(userTaskConverter);

export const userTaskRef = (taskId: string): DocumentReference<UserTask, StoredUserTask> =>
  doc(db, COLLECTIONS.userTasks, taskId).withConverter(userTaskConverter);

/** Campo de la persona en el formato viejo (para escuchar las tareas de antes). */
export const LEGACY_ASSIGNEE_FIELD = 'assigneeUserId';

/** Borra la persona del formato viejo (va junto con las listas nuevas). */
const DROP_LEGACY_ASSIGNEE = { assigneeUserId: deleteField(), assigneeUserName: deleteField() };

/** Carpeta de Storage de los adjuntos de una tarea. La hora va delante para
 *  que dos archivos con el mismo nombre no se pisen. */
const taskFilePath = (taskId: string, fileName: string) =>
  `${COLLECTIONS.userTasks}/${taskId}/${Date.now()}-${fileName}`;

// ---------------------------------------------------------------------------
// Tipos de entrada
// ---------------------------------------------------------------------------
/** Quién hace el cambio. */
export interface Actor {
  id: string;
  name: string;
}

/** Campos para crear una tarea (el resto los pone el service). */
export interface TaskInput {
  title: string;
  assigneeUserIds: string[];
  assigneeUserNames: string[];
  dueDate: YmdDate;
  dueTime: string;
  durationMinutes: number;
  priorityId: string | null;
  projectId: string | null;
  projectTitle: string | null;
  repeat: Repeat | null;
  approval: UserTaskApproval | null;
}

/** Campos que se editan desde el panel de la tarea. Quién la asignó
 *  (createdBy*) y cuándo (createdAt) no se editan nunca. */
export type TaskPatch = Partial<Pick<UserTask,
  'title' | 'assigneeUserIds' | 'assigneeUserNames' | 'dueDate' | 'dueTime' | 'durationMinutes'
  | 'priorityId' | 'projectId' | 'projectTitle' | 'repeat'>>;

/** Filtros de igualdad para getAll (sin índice compuesto). Por persona
 *  asignada no hay: es una lista (ver useOpsData.ts). */
type UserTaskFilters = Partial<Pick<UserTask, 'status' | 'createdByUserId' | 'projectId'>>;

// ---------------------------------------------------------------------------
// Ayudas internas
// ---------------------------------------------------------------------------
const nowIso = () => new Date().toISOString();

/** Lo que una tarea aporta a los contadores de su proyecto. */
const contribution = (t: Pick<UserTask, 'status' | 'durationMinutes'>): Required<ProjectCounterDelta> => ({
  taskCount: 1,
  doneCount: t.status === 'done' ? 1 : 0,
  openMinutes: t.status === 'open' ? Number(t.durationMinutes) || 0 : 0,
});

const negate = (d: Required<ProjectCounterDelta>): Required<ProjectCounterDelta> => ({
  taskCount: -d.taskCount,
  doneCount: -d.doneCount,
  openMinutes: -d.openMinutes,
});

/** Visto bueno "por enviar" con quien lo debe dar (casilla "Needs OK"). */
export const draftApproval = (approverUserId: string, approverUserName: string): UserTaskApproval => ({
  status: 'draft',
  approverUserId,
  approverUserName,
  requestedByUserId: null,
  requestedAt: null,
  decidedAt: null,
  note: '',
});

function newTaskData(input: TaskInput, actor: Actor): NewDoc<UserTask> {
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

/** Un comentario nuevo de `actor`. Va a `comments[]` con arrayUnion: dos
 *  personas que comentan a la vez no se pisan (la hora los distingue). */
const commentEntry = (text: string, actor: Actor): TaskComment => ({
  userId: actor.id,
  userName: actor.name,
  text,
  createdAt: nowIso(),
});

async function removeStoredFile(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    console.error('No se pudo borrar el archivo de Storage:', err);
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export const userTasksService = {
  /** Crea una tarea abierta y suma 1 tarea (y sus minutos) a su proyecto.
   *  Devuelve el id nuevo. */
  async create(input: TaskInput, actor: Actor, known: KnownProjects): Promise<string> {
    const taskRef = doc(userTasksCol);
    const batch = writeBatch(db);
    batch.set(taskRef, { ...newTaskData(input, actor), id: taskRef.id });
    bumpProjectCounters(batch, input.projectId, contribution({ status: 'open', durationMinutes: input.durationMinutes }), known);
    await batch.commit();
    return taskRef.id;
  },

  /** Guarda solo los campos cambiados y ajusta los contadores si cambió el
   *  proyecto o la duración. `task` es la versión en vivo. Si cambian las
   *  personas, borra también el formato viejo (una sola persona). */
  async update(task: UserTask, patch: TaskPatch, known: KnownProjects): Promise<void> {
    const batch = writeBatch(db);
    const changes = patch.assigneeUserIds ? { ...patch, ...DROP_LEGACY_ASSIGNEE } : patch;
    batch.update(userTaskRef(task.id), changes as UpdateData<StoredUserTask>);
    const before = contribution(task);
    const after = contribution({ status: task.status, durationMinutes: patch.durationMinutes ?? task.durationMinutes });
    const nextProject = patch.projectId !== undefined ? patch.projectId : task.projectId;
    if (nextProject !== task.projectId) {
      bumpProjectCounters(batch, task.projectId, negate(before), known);
      bumpProjectCounters(batch, nextProject, after, known);
    } else if (after.openMinutes !== before.openMinutes) {
      bumpProjectCounters(batch, task.projectId, { openMinutes: after.openMinutes - before.openMinutes }, known);
    }
    await batch.commit();
  },

  /** Borra la tarea (con sus comentarios, que viven dentro), la descuenta de su
   *  proyecto y borra sus archivos de Storage. */
  async delete(task: UserTask, known: KnownProjects): Promise<void> {
    const batch = writeBatch(db);
    batch.delete(userTaskRef(task.id));
    bumpProjectCounters(batch, task.projectId, negate(contribution(task)), known);
    await batch.commit();
    await Promise.all((task.attachments || []).map((a) => removeStoredFile(a.path)));
  },

  /** Tareas que cumplen los filtros (igualdades). Lectura única con getDocs.
   *  Ej.: getAll({ createdByUserId: id, status: 'open' }). Sin filtros trae toda
   *  la colección: evítalo (cada documento es una lectura). */
  async getAll(filters: UserTaskFilters = {}): Promise<UserTask[]> {
    const constraints: QueryConstraint[] = Object.entries(filters)
      .filter(([, value]) => value !== undefined)
      .map(([field, value]) => where(field, '==', value));
    const snap = await getDocs(query(userTasksCol, ...constraints));
    return snap.docs.map((d) => d.data());
  },

  /** Una tarea por id (null si no existe). Lectura única con getDoc. */
  async getOne(taskId: string): Promise<UserTask | null> {
    const snap = await getDoc(userTaskRef(taskId));
    return snap.exists() ? snap.data() : null;
  },

  /** Marca la tarea hecha. Si se repite, crea la siguiente en el MISMO batch
   *  (nueva fecha) y devuelve su id para poder deshacer. */
  async complete(task: UserTask, actor: Actor, known: KnownProjects): Promise<string | null> {
    const batch = writeBatch(db);
    batch.update(userTaskRef(task.id), { status: 'done', doneAt: nowIso(), doneByUserId: actor.id });
    bumpProjectCounters(batch, task.projectId, { doneCount: 1, openMinutes: -(Number(task.durationMinutes) || 0) }, known);
    let nextId: string | null = null;
    if (task.repeat) {
      const nextRef = doc(userTasksCol);
      nextId = nextRef.id;
      const input: TaskInput = {
        title: task.title,
        assigneeUserIds: task.assigneeUserIds,
        assigneeUserNames: task.assigneeUserNames,
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
      bumpProjectCounters(batch, task.projectId, contribution({ status: 'open', durationMinutes: task.durationMinutes }), known);
    }
    await batch.commit();
    return nextId;
  },

  /** Vuelve a abrir una tarea hecha. Con `undoNextId` (botón "Undo" justo
   *  después de completarla) borra también la repetición que se había creado. */
  async reopen(task: UserTask, known: KnownProjects, undoNextId: string | null = null): Promise<void> {
    const batch = writeBatch(db);
    batch.update(userTaskRef(task.id), { status: 'open', doneAt: null, doneByUserId: null });
    bumpProjectCounters(batch, task.projectId, { doneCount: -1, openMinutes: Number(task.durationMinutes) || 0 }, known);
    if (undoNextId) {
      batch.delete(userTaskRef(undoNextId));
      bumpProjectCounters(batch, task.projectId, negate(contribution({ status: 'open', durationMinutes: task.durationMinutes })), known);
    }
    await batch.commit();
  },

  /** Envía (o reenvía) la tarea a `approver` para su OK. El paso queda en los
   *  comentarios, en la misma escritura. */
  async requestApproval(task: UserTask, approver: Actor, actor: Actor): Promise<void> {
    const approval: UserTaskApproval = {
      status: 'pending',
      approverUserId: approver.id,
      approverUserName: approver.name,
      requestedByUserId: actor.id,
      requestedAt: nowIso(),
      decidedAt: null,
      note: '',
    };
    await updateDoc(userTaskRef(task.id), {
      approval,
      comments: arrayUnion(commentEntry(`Sent for approval to ${approver.name}.`, actor)),
    });
  },

  /** Respuesta de quien aprueba: OK o pedir cambios (con nota). */
  async decideApproval(task: UserTask, decision: 'approved' | 'changes', note: string, actor: Actor): Promise<void> {
    if (!task.approval) return;
    await updateDoc(userTaskRef(task.id), {
      approval: { ...task.approval, status: decision, decidedAt: nowIso(), note: decision === 'changes' ? note : '' },
      comments: arrayUnion(
        commentEntry(decision === 'approved' ? 'Approved.' : `Asked for changes${note ? `: ${note}` : '.'}`, actor),
      ),
    });
  },

  /** Pone o quita el requisito de visto bueno (sin enviarlo). */
  async setApproval(task: UserTask, approval: UserTaskApproval | null): Promise<void> {
    await updateDoc(userTaskRef(task.id), { approval });
  },

  async addComment(taskId: string, text: string, actor: Actor): Promise<void> {
    await updateDoc(userTaskRef(taskId), { comments: arrayUnion(commentEntry(text, actor)) });
  },

  /** Sube un archivo a la tarea (las imágenes se comprimen antes). */
  async addAttachment(taskId: string, original: File): Promise<void> {
    const file = original.type.startsWith('image/')
      ? await compressImage(original, { maxWidth: 1920, quality: 0.85, maxSizeMB: 1 }).catch(() => original)
      : original;
    const safeName = original.name.replace(/[^\w.-]+/g, '_') || 'file';
    const path = taskFilePath(taskId, safeName);
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file, {
      contentType: file.type || original.type || 'application/octet-stream',
      cacheControl: 'public, max-age=31536000',
    });
    const attachment: TaskAttachment = {
      name: original.name,
      url: await getDownloadURL(fileRef),
      path,
      type: file.type || original.type || 'application/octet-stream',
      size: file.size,
    };
    await updateDoc(userTaskRef(taskId), { attachments: arrayUnion(attachment) });
  },

  async removeAttachment(taskId: string, attachment: TaskAttachment): Promise<void> {
    await updateDoc(userTaskRef(taskId), { attachments: arrayRemove(attachment) });
    await removeStoredFile(attachment.path);
  },
};
