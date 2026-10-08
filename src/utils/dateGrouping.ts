// src/utils/dateGrouping.ts
// ⭐ Agrupación de trabajos por Año / Mes / Semana / Día. La usan el Overview
//    unificado e Invoices a través de la barra de periodo (src/utils/periods.ts):
//    Year → meses · Month → semanas · Week → días.
//
//    · La fecha se lee con dateSortValue (utils/dateFormat): misma regla de
//      formatos mixtos (ISO, MM/DD, DD/MM) que el resto de la app.
//    · Semana = semana ISO 8601 (lunes a domingo). Es la misma numeración que
//      la columna "Week Number" de la hoja Operations (01/06/2026 → semana 23).

import { dateSortValue } from './dateFormat';

export type DateGroupMode = 'none' | 'year' | 'month' | 'week' | 'day';

export interface DateGroup<T> {
  key: string;
  label: string;
  /** Detalle opcional (rango de fechas de la semana). */
  detail?: string;
  /** Timestamp del inicio del grupo (0 = sin fecha). Sirve para ordenar. */
  start: number;
  items: T[];
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const pad = (n: number) => String(n).padStart(2, '0');
const mdy = (d: Date) => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;

/** Fecha del valor (o null si no hay fecha válida). */
export function toDate(value: unknown): Date | null {
  const t = dateSortValue(value);
  if (!t) return null;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

/** Semana ISO 8601: { year, week }. El año ISO puede diferir del calendario
 *  en los primeros/últimos días de enero/diciembre. */
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // lunes = 1 … domingo = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // jueves de esa semana
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

/** Número de semana ISO de un valor de fecha (null si no hay fecha). */
export function weekNumberOf(value: unknown): number | null {
  const d = toDate(value);
  return d ? isoWeek(d).week : null;
}

const mondayOf = (d: Date): Date => {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
};

function groupInfo(d: Date, mode: DateGroupMode): { key: string; label: string; detail?: string; start: number } {
  switch (mode) {
    case 'year':
      return { key: `${d.getFullYear()}`, label: `${d.getFullYear()}`, start: new Date(d.getFullYear(), 0, 1).getTime() };
    case 'month':
      return {
        key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
        label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        start: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
      };
    case 'week': {
      const { year, week } = isoWeek(d);
      const mon = mondayOf(d);
      const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
      return {
        key: `${year}-W${pad(week)}`,
        label: `Semana ${week}`,
        detail: `${mdy(mon)} – ${mdy(sun)}`,
        start: mon.getTime(),
      };
    }
    default: {
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return { key: mdy(day), label: `${WEEKDAYS[day.getDay()]} ${mdy(day)}`, start: day.getTime() };
    }
  }
}

/**
 * Agrupa `items` por la fecha que devuelve `getDate`.
 * - Dentro de cada grupo se CONSERVA el orden recibido (cada vista ya ordena).
 * - Los grupos se ordenan por fecha (`order`); "Sin fecha" siempre al final.
 */
export function groupByDate<T>(
  items: T[],
  getDate: (item: T) => unknown,
  mode: DateGroupMode,
  order: 'desc' | 'asc' = 'desc',
): DateGroup<T>[] {
  if (mode === 'none') return [{ key: 'all', label: 'Todos', start: 0, items }];
  const map = new Map<string, DateGroup<T>>();
  const noDate: DateGroup<T> = { key: 'no-date', label: 'Sin fecha', start: 0, items: [] };
  for (const item of items) {
    const d = toDate(getDate(item));
    if (!d) {
      noDate.items.push(item);
      continue;
    }
    const info = groupInfo(d, mode);
    let g = map.get(info.key);
    if (!g) {
      g = { ...info, items: [] };
      map.set(info.key, g);
    }
    g.items.push(item);
  }
  const groups = [...map.values()].sort((a, b) => (order === 'desc' ? b.start - a.start : a.start - b.start));
  if (noDate.items.length) groups.push(noDate);
  return groups;
}
