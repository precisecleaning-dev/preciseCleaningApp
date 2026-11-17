// src/features/payroll/weeklyPayroll.ts
// Nómina semanal de los empleados que cobran por casa (pestaña Nóminas de
// Payroll). Decisión de Omar (11/2026): la semana va de lunes a domingo, se
// paga el miércoles siguiente y se arma SOLA con todos los pagos por casa
// (Registered Payments de la casa), sin pasar por "Pagar seleccionadas". El día
// de cada casa es su Schedule Date (lo resuelve quien llama, con getWorkDay).
// No se guarda ningún documento de la semana: se calcula de la colección
// payroll, así los pagos viejos también se ven por semana y día.
import type { PayrollRecord, WeeklyPayrollRow } from '../../types/index';
import { getPayrollTotal, roundToCents } from '../../utils/jobFinancials';

export const WEEK_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

const WEEK_BATCH_PREFIX = 'week_';
const MILLISECONDS_PER_DAY = 86_400_000;

const padToTwoDigits = (value: number) => String(value).padStart(2, '0');

/** AAAA-MM-DD en hora local de un timestamp. */
export const toIsoDay = (time: number): string => {
  const date = new Date(time);
  return `${date.getFullYear()}-${padToTwoDigits(date.getMonth() + 1)}-${padToTwoDigits(date.getDate())}`;
};

const parseIsoDay = (isoDay: string): Date => {
  const [year, month, day] = isoDay.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (isoDay: string, days: number): string => {
  const date = parseIsoDay(isoDay);
  date.setDate(date.getDate() + days);
  return toIsoDay(date.getTime());
};

/** Los siete días (AAAA-MM-DD) de la semana que empieza en `weekStart` (lunes). */
export const getWeekDays = (weekStart: string): string[] => WEEK_DAY_NAMES.map((_, dayIndex) => addDays(weekStart, dayIndex));

/** Día de pago: el miércoles siguiente a la semana (lunes + 9 días). */
export const getWeekPayDay = (weekStart: string): string => addDays(weekStart, 9);

/** batchId de lo que se paga o ajusta desde esta pestaña. */
export const getWeekBatchId = (weekStart: string): string => `${WEEK_BATCH_PREFIX}${weekStart}`;

/** Semana (lunes AAAA-MM-DD) de un batchId `week_…`; '' si no es de esta pestaña. */
const getBatchWeekStart = (record: PayrollRecord): string =>
  (record.batchId?.startsWith(WEEK_BATCH_PREFIX) ? record.batchId.slice(WEEK_BATCH_PREFIX.length) : '');

/**
 * Semana en que se PAGÓ una casa desde esta pestaña ('' si no). Una casa pagada
 * se queda en esa semana aunque después la reprogramen: si no, la semana pagada
 * cambiaría su total y "Mark week pending" de la nueva no la regresaría.
 */
export const getPaidWeekStart = (record: PayrollRecord): string =>
  (record.propertyId && record.status === 'Paid' ? getBatchWeekStart(record) : '');

/** Columna (0 = lunes … 6 = domingo) de un día AAAA-MM-DD. */
const getWeekdayIndex = (isoDay: string): number => (parseIsoDay(isoDay).getDay() + 6) % 7;

const createEmptyRow = (employeeId: string): WeeklyPayrollRow => ({
  employeeId, dayTotals: WEEK_DAY_NAMES.map(() => 0), propertiesTotal: 0, bonus: 0, discount: 0, total: 0, records: [], isPaid: false,
});

/**
 * Arma la nómina de la semana que empieza en `weekStart` (lunes AAAA-MM-DD), una
 * fila por empleado. Cuentan los pagos por casa y sus ajustes (bono / descuento,
 * sin casa); los de Hourly y Fixed pay (payType) no. Cada uno cae en la semana de:
 *  - una casa pagada aquí: la semana en que se pagó (`getPaidWeekStart`), en la
 *    columna de su día de la semana aunque la hayan reprogramado;
 *  - otra casa: su día trabajado (`getWorkDay`);
 *  - un ajuste de esta pestaña: la semana de su batchId (`week_AAAA-MM-DD`);
 *  - un ajuste de un pago consolidado viejo: la casa más reciente de su batch
 *    (si no, se iría a la semana en que se pagó, la siguiente);
 *  - otro ajuste: `getWorkDay` (su fecha).
 */
export const buildWeeklyPayroll = (
  records: readonly PayrollRecord[],
  weekStart: string,
  getWorkDay: (record: PayrollRecord) => string,
): WeeklyPayrollRow[] => {
  const perHouseRecords = records.filter((record) => !record.payType);
  const latestDayByBatch = new Map<string, string>();
  perHouseRecords.forEach((record) => {
    if (!record.propertyId || !record.batchId) return;
    const workDay = getWorkDay(record);
    if (workDay > (latestDayByBatch.get(record.batchId) ?? '')) latestDayByBatch.set(record.batchId, workDay);
  });
  const getAdjustmentDay = (record: PayrollRecord): string =>
    getBatchWeekStart(record) || (record.batchId && latestDayByBatch.get(record.batchId)) || getWorkDay(record);

  const weekEnd = addDays(weekStart, 6);
  const isInWeek = (day: string) => !!day && day >= weekStart && day <= weekEnd;
  const weekStartTime = parseIsoDay(weekStart).getTime();
  // Math.round: un día con cambio de horario mide 23 o 25 horas.
  const getDayIndex = (day: string) => Math.round((parseIsoDay(day).getTime() - weekStartTime) / MILLISECONDS_PER_DAY);
  const rowsByEmployee = new Map<string, WeeklyPayrollRow>();
  perHouseRecords.forEach((record) => {
    const paidWeekStart = getPaidWeekStart(record);
    const day = record.propertyId ? getWorkDay(record) : getAdjustmentDay(record);
    const belongsToWeek = paidWeekStart ? paidWeekStart === weekStart : isInWeek(day);
    if (!belongsToWeek) return;
    const row = rowsByEmployee.get(record.employeeId) ?? createEmptyRow(record.employeeId);
    row.records.push(record);
    if (record.propertyId) {
      const amount = getPayrollTotal(record);
      const dayIndex = isInWeek(day) ? getDayIndex(day) : getWeekdayIndex(day || weekStart);
      row.dayTotals[dayIndex] += amount;
      row.propertiesTotal += amount;
    } else {
      row.bonus += Number(record.extraAmount || 0);
      row.discount += Number(record.discountAmount || 0);
    }
    rowsByEmployee.set(record.employeeId, row);
  });

  return [...rowsByEmployee.values()].map((row) => ({
    ...row,
    dayTotals: row.dayTotals.map(roundToCents),
    propertiesTotal: roundToCents(row.propertiesTotal),
    bonus: roundToCents(row.bonus),
    discount: roundToCents(row.discount),
    total: roundToCents(row.propertiesTotal + row.bonus - row.discount),
    isPaid: row.records.every((record) => record.status === 'Paid'),
  }));
};

/** Pagos de la fila que faltan por pagar. */
export const getUnpaidRecords = (row: WeeklyPayrollRow): PayrollRecord[] =>
  row.records.filter((record) => record.status !== 'Paid');

/** Lo que falta por pagar de la fila (casas y ajustes sin pagar). */
export const getUnpaidTotal = (row: WeeklyPayrollRow): number =>
  roundToCents(getUnpaidRecords(row).reduce((sum, record) => sum + getPayrollTotal(record), 0));

/** Pagos de la semana que se pagaron desde esta pestaña (los que "Mark week pending" y "Not sent" regresan). */
export const getRecordsPaidThisWeek = (rows: readonly WeeklyPayrollRow[], weekStart: string): PayrollRecord[] =>
  rows.flatMap((row) => row.records).filter((record) => record.status === 'Paid' && record.batchId === getWeekBatchId(weekStart));

/** Monto opcional de los formularios de la nómina semanal: vacío = 0; null si no es un número de 0 o más. */
export const parseOptionalAmount = (text: string): number | null => {
  if (text.trim() === '') return 0;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? roundToCents(value) : null;
};

/** "1 house", "3 houses". */
export const pluralize = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;
