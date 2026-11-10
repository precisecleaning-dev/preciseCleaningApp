// src/features/payroll/services/fixedPaymentService.ts
// Cambios a mano sobre un pago fijo quincenal que ya creó la Cloud Function
// createfixedpayroll: corregir su monto.
import type { PayrollRecord, SystemUser } from '../../../types/index';
import { payrollService } from '../../../services/payrollService';
import { logActivity } from '../../../services/activityLogService';
import { formatDate } from '../../../utils/dateFormat';
import { money } from '../../../utils/jobFinancials';

/** Cambia el monto de un pago fijo. No cambia su fecha ni su estado (Pending / Paid). */
export const updateFixedPaymentAmount = async (
  payment: PayrollRecord, amount: number, employeeName: string, actor?: SystemUser | null,
): Promise<void> => {
  if (!payment.id) return;
  await payrollService.update(payment.id, { baseAmount: amount, totalAmount: amount });
  void logActivity({
    action: 'update',
    module: 'Payroll',
    user: actor,
    targetId: payment.id,
    targetLabel: employeeName,
    detail: `Fixed payment of ${formatDate(payment.date)}: ${money(payment.totalAmount)} → ${money(amount)}.`,
  });
};
