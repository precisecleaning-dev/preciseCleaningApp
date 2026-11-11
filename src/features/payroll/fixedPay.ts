// src/features/payroll/fixedPay.ts
// Reglas del pago fijo quincenal (pestaña Fixed pay de Payroll): el sueldo
// mensual se paga en dos partes, el 15 y el último día de cada mes. La Cloud
// Function createfixedpayroll (functions/src/fixedPayroll.ts) usa la MISMA
// división: si se cambia aquí, se cambia allá.
// Cada quincena se paga COMPLETA (decisión de Omar, 11/2026): un sueldo empieza
// o se reanuda siempre el 1 o el 16 (inicio de quincena), nunca a la mitad.
import type { PayrollRecord } from '../../types/index';

/** Las dos partes del sueldo mensual. Si no se divide exacto, el centavo que sobra va en la segunda. */
export const getBiweeklyAmounts = (monthlyAmount: number) => {
  const monthlyCents = Math.round(monthlyAmount * 100);
  const firstHalfCents = Math.floor(monthlyCents / 2);
  return { firstHalf: firstHalfCents / 100, secondHalf: (monthlyCents - firstHalfCents) / 100 };
};

export const isFixedPayment = (record: Pick<PayrollRecord, 'payType'>): boolean => record.payType === 'fixed';

/** Qué quincena paga: la del 15 o la del último día del mes. */
export const getFixedPayPeriodLabel = (payDate: string): string =>
  payDate.endsWith('-15') ? '1st half (15th)' : '2nd half (end of month)';

const padToTwoDigits = (value: number) => String(value).padStart(2, '0');
const toIsoDate = (year: number, month: number, day: number) => `${year}-${padToTwoDigits(month)}-${padToTwoDigits(day)}`;
const getLastDayOfMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

/** Inicio de la quincena que contiene la fecha (el 1 o el 16), AAAA-MM-DD. */
export const getPayPeriodStart = (dateIso: string): string => {
  const [year, month, day] = dateIso.split('-').map(Number);
  return toIsoDate(year, month, day >= 16 ? 16 : 1);
};

/** Próximo inicio de quincena desde la fecha: ella misma si es el 1 o el 16. */
export const getNextPayPeriodStart = (dateIso: string): string => {
  const [year, month, day] = dateIso.split('-').map(Number);
  if (day === 1 || day === 16) return dateIso;
  if (day < 16) return toIsoDate(year, month, 16);
  return month === 12 ? toIsoDate(year + 1, 1, 1) : toIsoDate(year, month + 1, 1);
};

/** Inicios de quincena que se pueden elegir: el de la quincena actual y los `count` siguientes. */
export const getPayPeriodStartOptions = (todayIsoDate: string, count = 6): string[] => {
  const starts = [getPayPeriodStart(todayIsoDate)];
  while (starts.length <= count) {
    const [year, month, day] = starts[starts.length - 1].split('-').map(Number);
    starts.push(day === 1 ? toIsoDate(year, month, 16) : getNextPayPeriodStart(toIsoDate(year, month, 17)));
  }
  return starts;
};

/** Próxima fecha de pago fijo desde la fecha (el 15 o el último día del mes): ella misma si ya lo es. */
export const getNextFixedPayDate = (dateIso: string): string => {
  const [year, month, day] = dateIso.split('-').map(Number);
  if (day <= 15) return toIsoDate(year, month, 15);
  return toIsoDate(year, month, getLastDayOfMonth(year, month));
};
