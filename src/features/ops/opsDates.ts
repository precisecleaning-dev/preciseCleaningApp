// src/features/ops/opsDates.ts
// ============================================================================
// Fechas del Task list: sección de una tarea por su vencimiento (Overdue,
// Daily = hoy, This week, Later, No date), etiquetas, repeticiones y la
// siguiente fecha de una tarea que se repite. Las pestañas: taskListTabs.ts.
// Se guarda AAAA-MM-DD; en pantalla SIEMPRE MM/DD/AAAA y h:mm AM/PM.
// La semana va de lunes a domingo (igual que utils/periods.ts).
// ============================================================================
import type { Repeat, TaskListTabId, UserTask, YmdDate } from '../../types/index';
import { formatDate, formatHm, todayIso } from '../../utils/dateFormat';

const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

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

/** Sección por fecha de vencimiento (las vistas Owner y Manager y la fila). */
export type DueSection = 'overdue' | 'today' | 'week' | 'later' | 'nodate';

/** Pestaña por fecha de una tarea abierta: 'daily' = vence hoy (también las
 *  que se repiten a diario). */
export type TaskSection = Extract<TaskListTabId, 'overdue' | 'daily' | 'week' | 'later' | 'nodate'>;

/** Diaria que vence otro día: la crea la anterior al completarse y aparece en
 *  las pendientes el día que le toca (en "ALL" sí se ve). */
export const isUpcomingDailyRepeat = (task: Pick<UserTask, 'dueDate' | 'repeat'>, today: YmdDate = todayIso()): boolean =>
  isDailyRepeat(task.repeat) && !!task.dueDate && task.dueDate > today;

/** Pestaña por fecha de una tarea (null = diaria de otro día: todavía no se muestra).
 *  Las diarias viejas sin fecha van en Daily. */
export const taskSectionOf = (task: Pick<UserTask, 'dueDate' | 'repeat'>, today: YmdDate = todayIso()): TaskSection | null => {
  if (isUpcomingDailyRepeat(task, today)) return null;
  if (!task.dueDate && isDailyRepeat(task.repeat)) return 'daily';
  const dueSection = sectionOf(task.dueDate, today);
  return dueSection === 'today' ? 'daily' : dueSection;
};

/** Por vencimiento: fecha, luego hora (sin hora al final) y fecha de creación.
 *  (La "siguiente tarea" de un proyecto; las listas van por compareByNewest.) */
export const compareByDue = (firstTask: UserTask, secondTask: UserTask): number =>
  (firstTask.dueDate || '9999').localeCompare(secondTask.dueDate || '9999')
  || (firstTask.dueTime || '99:99').localeCompare(secondTask.dueTime || '99:99')
  || (firstTask.createdAt ?? '').localeCompare(secondTask.createdAt ?? '');

/** De la más reciente a la más vieja: fecha y hora de creación (ISO). */
export const compareByNewest = (firstTask: UserTask, secondTask: UserTask): number =>
  (secondTask.createdAt ?? '').localeCompare(firstTask.createdAt ?? '');

/** Sección por fecha de vencimiento. */
export function sectionOf(dueDate: YmdDate, today: YmdDate = todayIso()): DueSection {
  if (!dueDate) return 'nodate';
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  if (dueDate <= endOfWeek(today)) return 'week';
  return 'later';
}

/** Etiqueta corta del vencimiento para la fila de la lista. (La repetición
 *  va aparte, en su etiqueta: "Every day".) */
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

/** Días de la semana que NO toca una repetición (0 = domingo … 6 = sábado):
 *  "Every day" → []; las viejas "Every weekday" → sábado y domingo; las de
 *  ciertos días ('weekly') → los días que no se eligieron. */
export const repeatExceptDays = (repeat: Repeat): number[] => {
  if (repeat.freq === 'weekdays') return [0, 6];
  if (repeat.freq === 'weekly' && repeat.days?.length) {
    return ALL_WEEKDAYS.filter((weekday) => !repeat.days?.includes(weekday));
  }
  return [];
};

/** Repetición que se guarda para "Every day" (sin días) o "Every day except"
 *  esos días. "Except" se guarda como 'weekly' con los días que SÍ tocan: así
 *  la siguiente fecha la calcula `nextOccurrence` sin cambios. */
export const repeatFromExceptDays = (exceptDays: number[]): Repeat => {
  const allowedDays = ALL_WEEKDAYS.filter((weekday) => !exceptDays.includes(weekday));
  return exceptDays.length === 0 || allowedDays.length === 0
    ? { freq: 'daily' }
    : { freq: 'weekly', days: allowedDays };
};

/** ¿Es "Every day" o "Every day except"? (Daily). Solo las viejas mensuales no. */
export const isDailyRepeat = (repeat: Repeat | null | undefined): boolean =>
  !!repeat && repeat.freq !== 'monthly';

/** "Every day", "Every day except Sat, Sun" o, en las viejas mensuales, "Every month". */
export const repeatSummary = (repeat: Repeat): string => {
  if (!isDailyRepeat(repeat)) return 'Every month';
  const exceptDays = repeatExceptDays(repeat);
  if (exceptDays.length === 0) return 'Every day';
  // De lunes a domingo: "except Sat, Sun".
  const mondayFirstDays = [...exceptDays].sort((firstDay, secondDay) => ((firstDay + 6) % 7) - ((secondDay + 6) % 7));
  return `Every day except ${mondayFirstDays.map((weekday) => WEEKDAYS[weekday]).join(', ')}`;
};

/** Etiqueta de la repetición en la fila. Las viejas con fin ("After N times")
 *  siguen contando hasta que alguien las edite: "Every day · 3 left". */
export const repeatBadgeLabel = (repeat: Repeat): string =>
  (repeat.timesLeft ? `${repeatSummary(repeat)} · ${repeat.timesLeft} left` : repeatSummary(repeat));

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
