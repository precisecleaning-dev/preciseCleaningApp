// src/shared/utils/dateRangePresets.ts
// ============================================================================
// Periodos rápidos de un filtro de fechas (AAAA-MM-DD, hora local, extremos
// inclusivos): todas las fechas, este mes, el mes pasado, últimos 30 y 90 días.
// ============================================================================
import { todayIso } from '../../utils/dateFormat';

export type DateRangePresetKey = 'all' | 'this_month' | 'last_month' | 'last_30_days' | 'last_90_days';

export interface DateRangeBounds {
  from: string;
  to: string;
}

export const DATE_RANGE_PRESETS: { key: DateRangePresetKey; label: string }[] = [
  { key: 'all', label: 'All dates' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'last_30_days', label: 'Last 30 days' },
  { key: 'last_90_days', label: 'Last 90 days' },
];

const pad = (value: number) => String(value).padStart(2, '0');

const toYmd = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** "Hoy y los N−1 días anteriores". */
const lastDays = (dayCount: number): DateRangeBounds => {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (dayCount - 1));
  return { from: toYmd(firstDay), to: todayIso() };
};

/** Primer y último día de un mes (monthOffset 0 = este mes, −1 = el pasado). */
const monthBounds = (monthOffset: number): DateRangeBounds => {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + monthOffset + 1, 0);
  return { from: toYmd(firstDay), to: toYmd(lastDay) };
};

export const getDateRangePreset = (presetKey: DateRangePresetKey): DateRangeBounds => {
  if (presetKey === 'this_month') return monthBounds(0);
  if (presetKey === 'last_month') return monthBounds(-1);
  if (presetKey === 'last_30_days') return lastDays(30);
  if (presetKey === 'last_90_days') return lastDays(90);
  return { from: '', to: '' };
};
