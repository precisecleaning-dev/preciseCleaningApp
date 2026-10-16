// src/features/ops/opsDates.ts
// ============================================================================
// Fechas del Task list: secciones (Overdue / Today / This week / Later / No
// date), etiquetas y la siguiente repetición de una tarea.
// Se guarda AAAA-MM-DD; en pantalla SIEMPRE MM/DD/AAAA y h:mm AM/PM.
// La semana va de lunes a domingo (igual que utils/periods.ts).
// ============================================================================
import type { Repeat, YmdDate } from '../../types/index';
import { formatDate, formatHm, todayIso } from '../../utils/dateFormat';

const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "2026-10-13" → Date local (mediodía: sin saltos por horario de verano). */
export function ymdToDate(ymd: YmdDate): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}

function dateToYmd(d: Date): YmdDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(ymd: YmdDate, days: number): YmdDate {
  const d = ymdToDate(ymd);
  d.setDate(d.getDate() + days);
  return dateToYmd(d);
}

/** Días completos de `a` a `b` (b − a). */
function daysBetween(a: YmdDate, b: YmdDate): number {
  return Math.round((ymdToDate(b).getTime() - ymdToDate(a).getTime()) / 86_400_000);
}

/** Domingo de la semana (lunes a domingo) que contiene `ymd`. */
function endOfWeek(ymd: YmdDate): YmdDate {
  const day = ymdToDate(ymd).getDay(); // 0 = domingo
  return addDays(ymd, day === 0 ? 0 : 7 - day);
}

export type TaskSection = 'overdue' | 'today' | 'week' | 'later' | 'nodate';

export const SECTION_ORDER: TaskSection[] = ['overdue', 'today', 'week', 'later', 'nodate'];

export const SECTION_LABEL: Record<TaskSection, string> = {
  overdue: 'Overdue',
  today: 'Today',
  week: 'This week',
  later: 'Later',
  nodate: 'No date',
};

export function sectionOf(dueDate: YmdDate, today: YmdDate = todayIso()): TaskSection {
  if (!dueDate) return 'nodate';
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  if (dueDate <= endOfWeek(today)) return 'week';
  return 'later';
}

/** Etiqueta corta del vencimiento para la fila de la lista. */
export function dueLabel(dueDate: YmdDate, dueTime: string, today: YmdDate = todayIso()): string {
  const time = formatHm(dueTime);
  const section = sectionOf(dueDate, today);
  if (section === 'nodate') return time ? `No date · ${time}` : 'No date';
  if (section === 'today') return time ? `Today · ${time}` : 'Today';
  if (section === 'overdue') return `Overdue · ${formatDate(dueDate)}`;
  const base = section === 'week'
    ? `${WEEKDAYS[ymdToDate(dueDate).getDay()]}, ${formatDate(dueDate)}`
    : formatDate(dueDate);
  return time ? `${base} · ${time}` : base;
}

/** "3 days late" / "1 day late" (vacío si no está vencida). */
export function lateLabel(dueDate: YmdDate, today: YmdDate = todayIso()): string {
  if (!dueDate || dueDate >= today) return '';
  const n = daysBetween(dueDate, today);
  return `${n} day${n === 1 ? '' : 's'} late`;
}

/** 90 → "1 h 30 min"; 15 → "15 min". */
export function formatMinutes(min: number): string {
  const total = Math.max(0, Math.round(min || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export const REPEAT_LABEL: Record<Repeat['freq'], string> = {
  daily: 'Daily',
  weekdays: 'Weekdays',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

/**
 * Siguiente fecha de una tarea que se repite. Se cuenta desde la fecha de
 * vencimiento o desde hoy, la que sea MÁS tarde: una tarea diaria atrasada que
 * se completa hoy vuelve mañana, no en una fecha ya vencida.
 */
export function nextOccurrence(repeat: Repeat, dueDate: YmdDate, today: YmdDate = todayIso()): YmdDate {
  const base = dueDate && dueDate > today ? dueDate : today;
  if (repeat.freq === 'daily') return addDays(base, 1);
  if (repeat.freq === 'weekdays') {
    let next = addDays(base, 1);
    while ([0, 6].includes(ymdToDate(next).getDay())) next = addDays(next, 1);
    return next;
  }
  if (repeat.freq === 'weekly') {
    const days = repeat.days && repeat.days.length > 0
      ? repeat.days
      : [ymdToDate(dueDate || base).getDay()];
    for (let i = 1; i <= 7; i += 1) {
      const next = addDays(base, i);
      if (days.includes(ymdToDate(next).getDay())) return next;
    }
    return addDays(base, 7);
  }
  // monthly: el mismo día del mes (o el último, si el mes es más corto)
  const anchor = ymdToDate(dueDate || base).getDate();
  const b = ymdToDate(base);
  const candidate = (offset: number) => {
    const first = new Date(b.getFullYear(), b.getMonth() + offset, 1, 12);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12).getDate();
    return dateToYmd(new Date(first.getFullYear(), first.getMonth(), Math.min(anchor, last), 12));
  };
  const sameMonth = candidate(0);
  return sameMonth > base ? sameMonth : candidate(1);
}
