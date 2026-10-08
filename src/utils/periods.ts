// src/utils/periods.ts
// ⭐ Navegador de periodo (Day / Week / Month / Year / Custom) del Overview e
//    Invoices — diseño "Precise Cleaning – Unified Jobs View".
//
//    · El periodo FILTRA la tabla a su rango y se recorre con ← / → / Today.
//    · Dentro del periodo, las filas se agrupan con la unidad inmediata menor:
//      Year → meses · Month → semanas · Week → días · Day → un solo grupo.
//      Custom elige la unidad según la longitud del rango.
//    · Semanas ISO (lunes a domingo), igual que "Week Number" de la hoja.

import { isoWeek, toDate, type DateGroupMode } from './dateGrouping';

export type PeriodKind = 'day' | 'week' | 'month' | 'year' | 'custom';

export const PERIOD_KINDS: { id: PeriodKind; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'custom', label: 'Custom' },
];

export interface PeriodState {
  kind: PeriodKind;
  /** Fecha ancla (cualquier día dentro del periodo), "YYYY-MM-DD". */
  anchor: string;
  /** Solo para Custom: inicio y fin inclusivos, "YYYY-MM-DD" ('' = abierto). */
  customStart: string;
  customEnd: string;
}

export interface PeriodRange {
  /** Inicio (00:00 local) y fin EXCLUSIVO, en ms. null = sin límite. */
  start: number | null;
  end: number | null;
  /** Texto pequeño arriba ("Semana 41", "Today", "Month"…). */
  name: string;
  /** Texto grande ("Oct 5 – Oct 11, 2026"). */
  label: string;
  /** Agrupación de las filas dentro del periodo. */
  groupBy: DateGroupMode;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 86400000;
const pad = (n: number) => String(n).padStart(2, '0');

export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => toIso(new Date());

const parseIso = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const mondayOf = (d: Date) => {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
};

const shortDate = (d: Date) => `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;

export function defaultPeriod(kind: PeriodKind): PeriodState {
  return { kind, anchor: todayIso(), customStart: '', customEnd: '' };
}

/** Rango, títulos y agrupación de un periodo. */
export function periodRange(p: PeriodState): PeriodRange {
  const a = parseIso(p.anchor);
  switch (p.kind) {
    case 'day': {
      const s = new Date(a.getFullYear(), a.getMonth(), a.getDate());
      const isToday = toIso(s) === todayIso();
      return {
        start: s.getTime(),
        end: s.getTime() + DAY_MS,
        name: isToday ? 'Today' : WEEKDAYS[s.getDay()],
        label: `${WEEKDAYS[s.getDay()]}, ${shortDate(s)}, ${s.getFullYear()}`,
        groupBy: 'day',
      };
    }
    case 'week': {
      const s = mondayOf(a);
      const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7);
      const last = new Date(e.getTime() - DAY_MS);
      return {
        start: s.getTime(),
        end: e.getTime(),
        name: `Semana ${isoWeek(s).week}`,
        label: `${shortDate(s)} – ${shortDate(last)}, ${last.getFullYear()}`,
        groupBy: 'day',
      };
    }
    case 'month': {
      const s = new Date(a.getFullYear(), a.getMonth(), 1);
      const e = new Date(a.getFullYear(), a.getMonth() + 1, 1);
      return { start: s.getTime(), end: e.getTime(), name: 'Month', label: `${MONTHS_LONG[s.getMonth()]} ${s.getFullYear()}`, groupBy: 'week' };
    }
    case 'year': {
      const s = new Date(a.getFullYear(), 0, 1);
      const e = new Date(a.getFullYear() + 1, 0, 1);
      return { start: s.getTime(), end: e.getTime(), name: 'Year', label: `${s.getFullYear()}`, groupBy: 'month' };
    }
    default: {
      const s = p.customStart ? parseIso(p.customStart) : null;
      const eInc = p.customEnd ? parseIso(p.customEnd) : null;
      const span = s && eInc ? (eInc.getTime() - s.getTime()) / DAY_MS : Infinity;
      const groupBy: DateGroupMode = span <= 14 ? 'day' : span <= 92 ? 'week' : span <= 730 ? 'month' : 'year';
      const fmt = (d: Date | null, ph: string) => (d ? `${shortDate(d)}, ${d.getFullYear()}` : ph);
      return {
        start: s ? s.getTime() : null,
        end: eInc ? eInc.getTime() + DAY_MS : null,
        name: 'Custom range',
        label: `${fmt(s, 'Start')} – ${fmt(eInc, 'End')}`,
        groupBy,
      };
    }
  }
}

/** Mueve el periodo hacia atrás (-1) o adelante (+1). Custom no se mueve. */
export function shiftPeriod(p: PeriodState, dir: -1 | 1): PeriodState {
  const a = parseIso(p.anchor);
  switch (p.kind) {
    case 'day': a.setDate(a.getDate() + dir); break;
    case 'week': a.setDate(a.getDate() + 7 * dir); break;
    case 'month': a.setDate(1); a.setMonth(a.getMonth() + dir); break;
    case 'year': a.setFullYear(a.getFullYear() + dir); break;
    default: return p;
  }
  return { ...p, anchor: toIso(a) };
}

/** ¿La fecha del trabajo cae dentro del periodo? Sin fecha = fuera. */
export function inPeriod(value: unknown, range: PeriodRange): boolean {
  if (range.start === null && range.end === null) return true;
  const d = toDate(value);
  if (!d) return false;
  const t = d.getTime();
  if (range.start !== null && t < range.start) return false;
  if (range.end !== null && t >= range.end) return false;
  return true;
}

/** Lee el periodo guardado (por navegador); al volver, el ancla es HOY. */
export function loadPeriod(storageKey: string, fallback: PeriodKind): PeriodState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const v = JSON.parse(raw) as Partial<PeriodState>;
      if (v.kind && PERIOD_KINDS.some((k) => k.id === v.kind)) {
        return {
          kind: v.kind,
          anchor: todayIso(),
          customStart: typeof v.customStart === 'string' ? v.customStart : '',
          customEnd: typeof v.customEnd === 'string' ? v.customEnd : '',
        };
      }
    }
  } catch {
    /* almacenamiento bloqueado o dato viejo: se usa el periodo por defecto */
  }
  return defaultPeriod(fallback);
}

export function savePeriod(storageKey: string, p: PeriodState): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ kind: p.kind, customStart: p.customStart, customEnd: p.customEnd }));
  } catch {
    /* sin almacenamiento: la preferencia no se recuerda */
  }
}
