// src/services/taskProjectsService.ts
// ============================================================================
// Colección `task_projects` (proyectos del Task list). Tipos en
// src/types/taskProjects.ts.
//
//   create · update · delete · getAll · getOne
//
// Los contadores del proyecto (taskCount, doneCount, openMinutes) NO se editan
// a mano: los mueve userTasksService con increment(), en el mismo batch que la
// tarea (bumpProjectCounters). La lista de proyectos en pantalla llega en vivo
// por el store compartido (useLiveData('taskProjects')); getAll/getOne son
// lecturas únicas para quien las necesite.
// ============================================================================
import {
  collection, deleteDoc, doc, getDoc, getDocs, increment, setDoc, updateDoc,
  type CollectionReference, type DocumentReference, type UpdateData, type WriteBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS } from '../lib/firebase/collections';
import { typedConverter } from '../lib/firebase/typedConverter';
import type { TaskProject, TaskProjectStatus, YmdDate } from '../types/index';

// ---------------------------------------------------------------------------
// Referencias tipadas (la colección se tipa una sola vez, aquí)
// ---------------------------------------------------------------------------
export const taskProjectsCol: CollectionReference<TaskProject> =
  collection(db, COLLECTIONS.taskProjects).withConverter(typedConverter<TaskProject>());

export const taskProjectRef = (projectId: string): DocumentReference<TaskProject> =>
  doc(db, COLLECTIONS.taskProjects, projectId).withConverter(typedConverter<TaskProject>());

/** Quién hace el cambio (para createdByUserId). */
interface ProjectActor {
  id: string;
}

/** Campos que se llenan en el formulario de Projects. */
export interface ProjectInput {
  title: string;
  description: string;
  ownerUserId: string;
  ownerUserName: string;
  teamId: string | null;
  startDate: YmdDate;
  dueDate: YmdDate;
  color: string | null;
  status: TaskProjectStatus;
}

const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Contadores (los usa userTasksService dentro de su batch)
// ---------------------------------------------------------------------------
export interface ProjectCounterDelta {
  taskCount?: number;
  doneCount?: number;
  openMinutes?: number;
}

const NO_COUNTERS: Required<ProjectCounterDelta> = { taskCount: 0, doneCount: 0, openMinutes: 0 };

/** Ids de los proyectos que existen (lista en vivo). */
export type KnownProjects = ReadonlySet<string>;

/** Suma o resta en los contadores del proyecto, dentro de `batch`. Solo si el
 *  proyecto existe (`known`): un proyecto borrado haría fallar el batch entero. */
export function bumpProjectCounters(
  batch: WriteBatch, projectId: string | null, delta: ProjectCounterDelta, known: KnownProjects,
): void {
  if (!projectId || !known.has(projectId)) return;
  const data: UpdateData<TaskProject> = {};
  if (delta.taskCount) data.taskCount = increment(delta.taskCount);
  if (delta.doneCount) data.doneCount = increment(delta.doneCount);
  if (delta.openMinutes) data.openMinutes = increment(delta.openMinutes);
  if (Object.keys(data).length > 0) batch.update(taskProjectRef(projectId), data);
}

/** Referencia para un proyecto nuevo (el id lo pone Firestore). */
export const newProjectRef = (): DocumentReference<TaskProject> => doc(taskProjectsCol);

/** Datos de un proyecto nuevo, sin comentarios. `counters` = lo que ya suman
 *  las tareas que se crean con él en el mismo batch (sin tareas, todo en cero). */
export const buildNewProject = (
  projectId: string, input: ProjectInput, actor: ProjectActor, counters: Required<ProjectCounterDelta> = NO_COUNTERS,
): TaskProject => ({
  ...input,
  id: projectId,
  repeat: null,
  ...counters,
  comments: [],
  doneAt: input.status === 'done' ? nowIso() : null,
  createdByUserId: actor.id,
  createdAt: nowIso(),
});

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
export const taskProjectsService = {
  /** Crea un proyecto con contadores en cero y sin comentarios. Devuelve su id.
   *  (Con tareas desde el inicio: userTasksService.createProjectWithTasks.) */
  async create(input: ProjectInput, actor: ProjectActor): Promise<string> {
    const projectRef = newProjectRef();
    await setDoc(projectRef, buildNewProject(projectRef.id, input, actor));
    return projectRef.id;
  },

  /** Cambia datos del proyecto. Si cambia el estado, `doneAt` lo acompaña:
   *  la hora al pasar a Done y null al salir de Done. */
  async update(project: Pick<TaskProject, 'id' | 'status'>, patch: Partial<ProjectInput>): Promise<void> {
    const next = patch.status ?? project.status;
    const entersDone = next === 'done' && project.status !== 'done';
    const leavesDone = next !== 'done' && project.status === 'done';
    await updateDoc(taskProjectRef(project.id), {
      ...patch,
      ...(entersDone ? { doneAt: nowIso() } : {}),
      ...(leavesDone ? { doneAt: null } : {}),
    });
  },

  /** Borra un proyecto SIN tareas. Con tareas: userTasksService.deleteProjectKeepingTasks
   *  (sus tareas quedan sin proyecto). */
  async delete(project: TaskProject): Promise<void> {
    if ((project.taskCount || 0) > 0) throw new Error('El proyecto tiene tareas: usa userTasksService.deleteProjectKeepingTasks.');
    await deleteDoc(taskProjectRef(project.id));
  },

  /** Todos los proyectos (son pocos). Lectura única con getDocs. */
  async getAll(): Promise<TaskProject[]> {
    const snap = await getDocs(taskProjectsCol);
    return snap.docs.map((d) => d.data());
  },

  /** Un proyecto por id (null si no existe). Lectura única con getDoc. */
  async getOne(projectId: string): Promise<TaskProject | null> {
    const snap = await getDoc(taskProjectRef(projectId));
    return snap.exists() ? snap.data() : null;
  },
};
