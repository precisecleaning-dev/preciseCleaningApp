// src/features/payroll/hourlyPay.ts
// Reglas del pago por horas (pestaña Hourly de Payroll): total = horas × rate.
import type { PayrollRecord } from '../../types/index';
import { roundToCents } from '../../utils/jobFinancials';

export const calcHourlyTotal = (hours: number, hourlyRate: number): number => roundToCents(hours * hourlyRate);

export const isHourlyPayment = (record: Pick<PayrollRecord, 'payType'>): boolean => record.payType === 'hourly';

/** Número mayor que 0 escrito en un campo; null si está vacío o no es válido. */
export const parsePositiveNumber = (text: string): number | null => {
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? value : null;
};

/** La tarifa del último pago por horas de ese empleado (para no escribirla cada vez); null si no hay. */
export const getLastHourlyRate = (records: readonly PayrollRecord[], employeeId: string): number | null => {
  const [lastPayment] = records
    .filter((record) => isHourlyPayment(record) && record.employeeId === employeeId && record.hourlyRate)
    .sort((recordA, recordB) => recordB.date.localeCompare(recordA.date));
  return lastPayment?.hourlyRate ?? null;
};
