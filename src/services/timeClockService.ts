// src/services/timeClockService.ts
// ⭐ Reloj de entrada/salida de los gerentes (vistas Owner y Manager).
//    Colección nueva `time_clock`: cada turno es un documento con la hora de
//    entrada (`inAt`) y la de salida (`outAt`, null mientras sigue trabajando).
import { addDoc, collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../config/firebase';

const COL = 'time_clock';

export interface ClockEntry {
  id: string;
  userId: string;
  userName: string;
  inAt: string;
  outAt: string | null;
}

/** Lunes 00:00 de la semana actual. */
export function weekStart(now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - dow);
  return d;
}

export const timeClockService = {
  /** Turnos de esta semana (para horas acumuladas y quién está trabajando). */
  subscribeWeek(cb: (entries: ClockEntry[]) => void): () => void {
    const q = query(collection(db, COL), where('inAt', '>=', weekStart().toISOString()));
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClockEntry)),
      (err) => { console.error('Error time_clock:', err); cb([]); },
    );
  },

  async clockIn(userId: string, userName: string): Promise<void> {
    await addDoc(collection(db, COL), { userId, userName, inAt: new Date().toISOString(), outAt: null });
  },

  async clockOut(entryId: string): Promise<void> {
    await updateDoc(doc(db, COL, entryId), { outAt: new Date().toISOString() });
  },
};

/** Turno abierto (sin salida) del usuario, si lo hay. */
export const openEntryOf = (entries: ClockEntry[], userId: string): ClockEntry | undefined =>
  entries
    .filter((e) => e.userId === userId && !e.outAt)
    .sort((a, b) => b.inAt.localeCompare(a.inAt))[0];

/** Horas trabajadas en la semana (el turno abierto cuenta hasta ahora). */
export function weekHours(entries: ClockEntry[], userId: string, now = new Date()): number {
  const ms = entries
    .filter((e) => e.userId === userId)
    .reduce((sum, e) => {
      const a = new Date(e.inAt).getTime();
      const b = e.outAt ? new Date(e.outAt).getTime() : now.getTime();
      return isNaN(a) || isNaN(b) || b < a ? sum : sum + (b - a);
    }, 0);
  return Math.round((ms / 3600000) * 10) / 10;
}

export const fmtClock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
