/* ============================================================================
   Reglas de fechas de las casas recurrentes
   ----------------------------------------------------------------------------
   ⚠️ COPIA de src/features/houses/houseRecurrence.ts (normalizeRecurrence,
   getNextVisitDate y lo que usan): las functions no pueden importar de src/.
   La pantalla las usa para avisar cuándo será la siguiente visita y esta copia
   para crearla (recurringHouses.ts). Si cambia una, cambia la otra.
   ============================================================================ */

export type HouseRecurrencePattern = "daily" | "weekly" | "monthly";

/** Campo `recurrence` de una casa (ver HouseRecurrence en src/types/index.ts). */
export interface HouseRecurrence {
  pattern: HouseRecurrencePattern;
  weekdays?: number[];
  intervalWeeks?: number;
  monthDay?: number;
  createTime: string;
  leadDays: number;
  anchorDate?: string;
  nextCreateAt?: string;
  nextHouseId?: string;
  previousHouseId?: string;
}

const MAX_INTERVAL_WEEKS = 8;
const MAX_LEAD_DAYS = 30;
const DEFAULT_CREATE_TIME = "08:00";

const DAYS_PER_WEEK = 7;
const MILLISECONDS_PER_DAY = 86_400_000;
const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const isIsoDay = (value: unknown): value is string => typeof value === "string" && ISO_DAY_PATTERN.test(value);

const padToTwoDigits = (value: number) => String(value).padStart(2, "0");

// Las cuentas de días van en UTC: así un día con cambio de horario no mide 23 o 25 horas.
const toUtcTime = (isoDay: string): number => {
  const [year, month, day] = isoDay.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

const fromUtcTime = (time: number): string => {
  const date = new Date(time);
  return `${date.getUTCFullYear()}-${padToTwoDigits(date.getUTCMonth() + 1)}-${padToTwoDigits(date.getUTCDate())}`;
};

export const addDays = (isoDay: string, days: number): string => fromUtcTime(toUtcTime(isoDay) + days * MILLISECONDS_PER_DAY);

const getWeekday = (isoDay: string): number => new Date(toUtcTime(isoDay)).getUTCDay();

/** Lunes de la semana de `isoDay`. */
const getWeekStart = (isoDay: string): string => addDays(isoDay, -((getWeekday(isoDay) + 6) % DAYS_PER_WEEK));

const getLastDayOfMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

const clampInteger = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

/** Frecuencias de la primera versión del campo (`freq`), por si quedó alguna casa guardada con ellas. */
const LEGACY_FREQUENCIES: Record<string, Pick<HouseRecurrence, "pattern" | "intervalWeeks">> = {
  daily: { pattern: "daily" },
  weekly: { pattern: "weekly", intervalWeeks: 1 },
  every2Weeks: { pattern: "weekly", intervalWeeks: 2 },
  every3Weeks: { pattern: "weekly", intervalWeeks: 3 },
  every4Weeks: { pattern: "weekly", intervalWeeks: 4 },
  monthly: { pattern: "monthly" },
};

/**
 * La recurrencia de una casa con todos sus valores válidos (null = no se
 * repite). Los días de la semana o el día del mes que falten salen de la fecha
 * de la visita (`scheduleDate`).
 */
export const normalizeRecurrence = (rawRecurrence: unknown, scheduleDate: string): HouseRecurrence | null => {
  if (!rawRecurrence || typeof rawRecurrence !== "object") return null;
  const raw = rawRecurrence as Partial<HouseRecurrence> & { freq?: string };
  const legacy = raw.freq ? LEGACY_FREQUENCIES[raw.freq] : undefined;
  const pattern = raw.pattern ?? legacy?.pattern;
  if (pattern !== "daily" && pattern !== "weekly" && pattern !== "monthly") return null;

  const hasDate = isIsoDay(scheduleDate);
  const chosenWeekdays = Array.isArray(raw.weekdays)
    ? [...new Set(raw.weekdays.map(Number).filter((weekday) => Number.isInteger(weekday) && weekday >= 0 && weekday <= 6))]
    : [];
  const fallbackWeekdays = hasDate ? [getWeekday(scheduleDate)] : [];
  return {
    pattern,
    ...(pattern === "weekly" ? {
      weekdays: (chosenWeekdays.length > 0 ? chosenWeekdays : fallbackWeekdays).sort((dayA, dayB) => dayA - dayB),
      intervalWeeks: clampInteger(raw.intervalWeeks ?? legacy?.intervalWeeks, 1, MAX_INTERVAL_WEEKS, 1),
    } : {}),
    ...(pattern === "monthly" ? { monthDay: clampInteger(raw.monthDay, 1, 31, hasDate ? Number(scheduleDate.slice(8, 10)) : 1) } : {}),
    createTime: typeof raw.createTime === "string" && TIME_PATTERN.test(raw.createTime) ? raw.createTime : DEFAULT_CREATE_TIME,
    leadDays: clampInteger(raw.leadDays, 0, MAX_LEAD_DAYS, 0),
    ...(isIsoDay(raw.anchorDate) ? { anchorDate: raw.anchorDate } : {}),
    ...(typeof raw.nextCreateAt === "string" ? { nextCreateAt: raw.nextCreateAt } : {}),
    ...(raw.nextHouseId ? { nextHouseId: String(raw.nextHouseId) } : {}),
    ...(raw.previousHouseId ? { previousHouseId: String(raw.previousHouseId) } : {}),
  };
};

/** Día `monthDay` del mes de `isoDay` (o el último, si el mes es más corto). */
const getMonthVisit = (isoDay: string, monthDay: number, monthsAhead: number): string => {
  const [year, month] = isoDay.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(year, month - 1 + monthsAhead, 1));
  const targetYear = firstOfMonth.getUTCFullYear();
  const targetMonth = firstOfMonth.getUTCMonth() + 1;
  const day = Math.min(monthDay, getLastDayOfMonth(targetYear, targetMonth));
  return `${targetYear}-${padToTwoDigits(targetMonth)}-${padToTwoDigits(day)}`;
};

/**
 * Fecha de la siguiente visita: la primera de la serie DESPUÉS de
 * `scheduleDate` que no haya pasado ya (las visitas atrasadas no se crean: si
 * la función estuvo apagada un mes, no aparecen cuatro órdenes de golpe).
 * "" si falta la fecha o no hay días elegidos.
 */
export const getNextVisitDate = (recurrence: HouseRecurrence, scheduleDate: string, today: string): string => {
  if (!isIsoDay(scheduleDate)) return "";
  const dayAfterVisit = addDays(scheduleDate, 1);
  const firstCandidate = dayAfterVisit > today ? dayAfterVisit : today;

  if (recurrence.pattern === "daily") return firstCandidate;

  if (recurrence.pattern === "monthly") {
    const monthDay = recurrence.monthDay ?? Number(scheduleDate.slice(8, 10));
    const visitThisMonth = getMonthVisit(firstCandidate, monthDay, 0);
    return visitThisMonth >= firstCandidate ? visitThisMonth : getMonthVisit(firstCandidate, monthDay, 1);
  }

  const weekdays = recurrence.weekdays ?? [];
  if (weekdays.length === 0) return "";
  const intervalWeeks = recurrence.intervalWeeks ?? 1;
  const anchorWeekStart = getWeekStart(isIsoDay(recurrence.anchorDate) ? recurrence.anchorDate : scheduleDate);
  const daysToSearch = (intervalWeeks + 1) * DAYS_PER_WEEK;
  for (let offset = 0; offset < daysToSearch; offset += 1) {
    const candidate = addDays(firstCandidate, offset);
    const weeksFromAnchor = Math.round((toUtcTime(getWeekStart(candidate)) - toUtcTime(anchorWeekStart)) / (DAYS_PER_WEEK * MILLISECONDS_PER_DAY));
    const isVisitWeek = ((weeksFromAnchor % intervalWeeks) + intervalWeeks) % intervalWeeks === 0;
    if (isVisitWeek && weekdays.includes(getWeekday(candidate))) return candidate;
  }
  return "";
};
