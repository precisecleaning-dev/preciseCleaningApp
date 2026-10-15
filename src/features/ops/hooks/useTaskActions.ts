// src/features/ops/hooks/useTaskActions.ts
// Acciones del Task list con su aviso de error, el estado "guardando" y el
// "Undo" de unos segundos después de marcar una tarea hecha.
import { useEffect, useRef, useState } from 'react';
import type { OpsApproval, OpsAttachment, OpsProject, OpsProjectStatus, OpsTask } from '../../../types/index';
import {
  addAttachment, addComment, completeTask, createProject, createTask, decideApproval, deleteProject,
  deleteTask, removeAttachment, reopenTask, requestApproval, setApprovalRequirement, setPriorities,
  updateProject, updateTask,
  type Actor, type KnownProjects, type ProjectInput, type TaskInput, type TaskPatch,
} from '../services/opsTasksService';

const UNDO_MS = 6000;

interface UndoState {
  task: OpsTask;
  nextId: string | null;
}

function fail(what: string, err: unknown) {
  console.error(`${what}:`, err);
  const e = err as { code?: string; message?: string };
  alert(`${what}.\n\n${e.code ? `Código: ${e.code}\n` : ''}${e.message || String(err)}`);
}

export function useTaskActions(actor: Actor, known: KnownProjects) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [undo, setUndo] = useState<UndoState | null>(null);

  // El aviso "Undo" se va solo después de unos segundos.
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  // Acciones en curso por id: un doble clic no marca dos veces la misma tarea
  // (los contadores del proyecto sumarían doble).
  const inFlight = useRef(new Set<string>());

  type Result<T> = { ok: true; value: T } | { ok: false };
  const run = async <T,>(id: string, what: string, job: () => Promise<T>): Promise<Result<T>> => {
    if (inFlight.current.has(id)) return { ok: false };
    inFlight.current.add(id);
    setBusyId(id);
    try {
      return { ok: true, value: await job() };
    } catch (err) {
      fail(what, err);
      return { ok: false };
    } finally {
      inFlight.current.delete(id);
      setBusyId(null);
    }
  };

  return {
    busyId,
    uploading,
    undo,
    dismissUndo: () => setUndo(null),

    add: async (input: TaskInput): Promise<boolean> =>
      (await run('new', 'No se pudo agregar la tarea', () => createTask(input, actor, known))).ok,

    patch: (task: OpsTask, patch: TaskPatch) =>
      run(task.id, 'No se pudo guardar el cambio', () => updateTask(task, patch, known)),

    complete: async (task: OpsTask) => {
      // Sin el visto bueno no se puede terminar (regla de la tarea con approval).
      if (task.approval && task.approval.status !== 'approved') {
        const who = task.approval.approverUserName || 'the approver';
        alert(task.approval.status === 'pending'
          ? `This task is waiting for ${who}'s OK. It can be marked done after it is approved.`
          : `This task needs ${who}'s OK before it's done. Send it for approval first.`);
        return;
      }
      const res = await run(task.id, 'No se pudo marcar la tarea', () => completeTask(task, actor, known));
      if (res.ok) setUndo({ task, nextId: res.value });
    },

    undoComplete: async () => {
      if (!undo) return;
      const { task, nextId } = undo;
      setUndo(null);
      // `task` es la versión de antes de marcarla: abierta, con sus datos.
      await run(task.id, 'No se pudo deshacer', () => reopenTask(task, known, nextId));
    },

    reopen: (task: OpsTask) => run(task.id, 'No se pudo reabrir la tarea', () => reopenTask(task, known)),

    remove: async (task: OpsTask): Promise<boolean> =>
      (await run(task.id, 'No se pudo borrar la tarea', () => deleteTask(task, known))).ok,

    comment: async (taskId: string, text: string): Promise<boolean> =>
      (await run(taskId, 'No se pudo publicar el comentario', () => addComment(taskId, text, actor))).ok,

    attach: async (taskId: string, files: File[]) => {
      setUploading(true);
      try {
        for (const file of files) await addAttachment(taskId, file);
      } catch (err) {
        fail('No se pudo subir el archivo', err);
      } finally {
        setUploading(false);
      }
    },

    sendForApproval: (task: OpsTask, approver: Actor) =>
      run(task.id, 'No se pudo enviar para aprobación', () => requestApproval(task, approver, actor)),

    decide: (task: OpsTask, decision: 'approved' | 'changes', note: string) =>
      run(task.id, 'No se pudo guardar la respuesta', () => decideApproval(task, decision, note, actor)),

    setApproval: (task: OpsTask, approval: OpsApproval | null) =>
      run(task.id, 'No se pudo cambiar el visto bueno', () => setApprovalRequirement(task, approval)),

    removeFile: (taskId: string, attachment: OpsAttachment) =>
      run(taskId, 'No se pudo quitar el archivo', () => removeAttachment(taskId, attachment)),

    saveProject: async (input: ProjectInput, project: OpsProject | null): Promise<boolean> =>
      (await run('project', 'No se pudo guardar el proyecto', async () => {
        if (project) await updateProject(project, input);
        else await createProject(input, actor);
      })).ok,

    setProjectStatus: (project: OpsProject, status: OpsProjectStatus) =>
      run(project.id, 'No se pudo cambiar el estado', () => updateProject(project, { status })),

    removeProject: (project: OpsProject) =>
      run(project.id, 'No se pudo borrar el proyecto', () => deleteProject(project)),

    savePriorities: async (userId: string, projectIds: string[]): Promise<boolean> =>
      (await run('priorities', 'No se pudo guardar el top 3', () => setPriorities(userId, projectIds))).ok,
  };
}
