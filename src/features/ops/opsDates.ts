// src/features/ops/opsDates.ts
// ============================================================================
// Fechas del Task list: secciones (Daily / Overdue / Today / This week / Later /
// No date), etiquetas y la siguiente repetición de una tarea.
// Se guarda AAAA-MM-DD; en pantalla SIEMPRE MM/DD/AAAA y h:mm AM/PM.
// La semana va de lunes a domingo (igual que utils/periods.ts).
// ============================================================================
import type { Repeat, UserTask, YmdDate } from '../../types/index';
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

/** Sección (pestaña) de la lista. 'daily' = las que se repiten todos los días
 *  o de lunes a viernes; las demás van por su fecha de vencimiento. */
export type TaskSection = 'daily' | 'overdue' | 'today' | 'week' | 'later' | 'nodate';

export const SECTION_ORDER: TaskSection[] = ['daily', 'overdue', 'today', 'week', 'later', 'nodate'];

export const SECTION_LABEL: Record<TaskSection, string> = {
  daily: 'Daily',
  overdue: 'Overdue',
  today: 'Today',
  week: 'This week',
  later: 'Later',
  nodate: 'No date',
};

/** ¿Se repite todos los días o de lunes a viernes? (van en la pestaña Daily). */
export const isDailyRepeat = (repeat: Repeat | null | undefined): boolean =>
  repeat?.freq === 'daily' || repeat?.freq === 'weekdays';

/** Sección de una tarea en la lista: Daily si se repite a diario; si no, por vencimiento. */
export const taskSectionOf = (task: Pick<UserTask, 'dueDate' | 'repeat'>, today: YmdDate = todayIso()): TaskSection =>
  (isDailyRepeat(task.repeat) ? 'daily' : sectionOf(task.dueDate, today));

/** Orden dentro de una sección: por fecha, luego por hora (sin hora al final) y
 *  por fecha de creación. */
export const compareByDue = (firstTask: UserTask, secondTask: UserTask): number =>
  (firstTask.dueDate || '9999').localeCompare(secondTask.dueDate || '9999')
  || (firstTask.dueTime || '99:99').localeCompare(secondTask.dueTime || '99:99')
  || (firstTask.createdAt ?? '').localeCompare(secondTask.createdAt ?? '');

/** Tareas agrupadas por sección (cada grupo ordenado con `compareByDue`). */
export function groupTasksBySection(tasks: UserTask[], today: YmdDate = todayIso()): Record<TaskSection, UserTask[]> {
  const tasksBySection: Record<TaskSection, UserTask[]> = {
    daily: [], overdue: [], today: [], week: [], later: [], nodate: [],
  };
  tasks.forEach((task) => tasksBySection[taskSectionOf(task, today)].push(task));
  Object.values(tasksBySection).forEach((sectionTasks) => sectionTasks.sort(compareByDue));
  return tasksBySection;
}

/** Sección por fecha de vencimiento (nunca devuelve 'daily'). */
export function sectionOf(dueDate: YmdDate, today: YmdDate = todayIso()): TaskSection {
  if (!dueDate) return 'nodate';
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  if (dueDate <= endOfWeek(today)) return 'week';
  return 'later';
}

/** Cómo se lee una repetición diaria en la fila ("Every day", "Every weekday"). */
const DAILY_REPEAT_LABEL: Partial<Record<Repeat['freq'], string>> = {
  daily: 'Every day',
  weekdays: 'Every weekday',
};

/** Etiqueta corta del vencimiento para la fila de la lista. Las diarias dicen
 *  "Every day · 8:00 AM" (salvo que estén atrasadas: ahí se ve la fecha). */
export function dueLabel(
  dueDate: YmdDate, dueTime: string, today: YmdDate = todayIso(), repeat: Repeat | null = null,
): string {
  const time = formatHm(dueTime);
  const section = sectionOf(dueDate, today);
  const dailyLabel = repeat ? DAILY_REPEAT_LABEL[repeat.freq] : undefined;
  if (dailyLabel && section !== 'overdue') return time ? `${dailyLabel} · ${time}` : dailyLabel;
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

/** Etiqueta de la repetición en la fila: "Weekly" o, si tiene fin, "Weekly · 3 left". */
export const repeatBadgeLabel = (repeat: Repeat): string =>
  (repeat.timesLeft ? `${REPEAT_LABEL[repeat.freq]} · ${repeat.timesLeft} left` : REPEAT_LABEL[repeat.freq]);

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
