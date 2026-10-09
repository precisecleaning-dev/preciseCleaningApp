// src/services/managerTasksService.ts
// ⭐ Tareas de gerentes (vistas Owner y Manager). Colección nueva
//    `manager_tasks`: el Owner crea y asigna; el Manager marca hecha.
//    Una tarea está VENCIDA si no está hecha y su `dueAt` ya pasó.
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { formatDate } from '../utils/dateFormat';

const COL = 'manager_tasks';

export interface ManagerTask {
  id: string;
  title: string;
  /** id de system_users del gerente asignado */
  assigneeId: string;
  assigneeName: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
  /** ISO. Vacío = sin fecha límite. */
  dueAt: string;
  done: boolean;
  doneAt?: string | null;
  doneById?: string | null;
}

type NewManagerTask = Omit<ManagerTask, 'id' | 'done' | 'doneAt' | 'doneById' | 'createdAt'>;

export const managerTasksService = {
  subscribe(cb: (tasks: ManagerTask[]) => void): () => void {
    return onSnapshot(
      collection(db, COL),
      (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ManagerTask)),
      (err) => { console.error('Error manager_tasks:', err); cb([]); },
    );
  },

  async create(task: NewManagerTask): Promise<void> {
    await addDoc(collection(db, COL), {
      ...task,
      createdAt: new Date().toISOString(),
      done: false,
      doneAt: null,
      doneById: null,
    });
  },

  async setDone(id: string, done: boolean, userId: string): Promise<void> {
    await updateDoc(doc(db, COL, id), {
      done,
      doneAt: done ? new Date().toISOString() : null,
      doneById: done ? userId : null,
    });
  },

  async remove(id: string): Promise<void> {
    await deleteDoc(doc(db, COL, id));
  },
};

/** La tarea no está hecha y su fecha límite ya pasó. */
export const isTaskOverdue = (t: ManagerTask, now = new Date()): boolean =>
  !t.done && !!t.dueAt && new Date(t.dueAt).getTime() < now.getTime();

/** Una tarea creada sin hora vence a las 23:59 de ese día: esa hora no se muestra. */
export const dueHasTime = (due: Date): boolean => due.getHours() !== 23 || due.getMinutes() !== 59;

/** Etiqueta corta de la fecha límite: "Done", "Overdue", "Today 11 AM", "Fri", "Oct 14". */
export function taskDueLabel(t: ManagerTask, now = new Date()): { text: string; tone: 'done' | 'overdue' | 'today' | 'later' } {
  if (t.done) return { text: 'Done', tone: 'done' };
  if (!t.dueAt) return { text: '—', tone: 'later' };
  const due = new Date(t.dueAt);
  if (isNaN(due.getTime())) return { text: '—', tone: 'later' };
  if (due.getTime() < now.getTime()) return { text: 'Overdue', tone: 'overdue' };
  const sameDay = due.toDateString() === now.toDateString();
  const hasTime = dueHasTime(due);
  const time = due.toLocaleTimeString('en-US', { hour: 'numeric', minute: due.getMinutes() ? '2-digit' : undefined });
  if (sameDay) return { text: hasTime ? `Today ${time}` : 'Today', tone: 'today' };
  const days = (due.getTime() - now.getTime()) / 86400000;
  if (days < 6) return { text: due.toLocaleDateString('en-US', { weekday: 'short' }), tone: 'later' };
  return { text: formatDate(due), tone: 'later' };
}
