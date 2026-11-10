// src/features/payroll/fixedPay.ts
// Reglas del pago fijo quincenal (pestaña Fixed pay de Payroll): el sueldo
// mensual se paga en dos partes, el 15 y el último día de cada mes. La Cloud
// Function createfixedpayroll (functions/src/fixedPayroll.ts) usa la MISMA
// división: si se cambia aquí, se cambia allá.
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
