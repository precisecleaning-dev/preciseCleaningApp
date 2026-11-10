// src/features/payroll/services/fixedPaymentService.ts
// Cambios a mano sobre un pago fijo quincenal que ya creó la Cloud Function
// createfixedpayroll: corregir su monto o borrarlo.
import type { PayrollRecord, SystemUser } from '../../../types/index';
import { payrollService } from '../../../services/payrollService';
import { fixedSalariesService } from '../../../services/fixedSalariesService';
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

/**
 * Borra un pago fijo. Antes anota su fecha en el sueldo (skippedPayDates) para
 * que la Cloud Function no lo vuelva a crear al día siguiente. Si el sueldo ya
 * no existe, no hace falta: sin sueldo no se crean pagos.
 */
export const deleteFixedPayment = async (
  payment: PayrollRecord, employeeName: string, actor?: SystemUser | null,
): Promise<void> => {
  if (!payment.id) return;
  const salaryId = payment.fixedSalaryId || payment.employeeId;
  const salary = await fixedSalariesService.getOne(salaryId);
  if (salary) await fixedSalariesService.skipPayDate(salaryId, payment.date);
  await payrollService.delete(payment.id);
  void logActivity({
    action: 'delete',
    module: 'Payroll',
    user: actor,
    targetId: payment.id,
    targetLabel: employeeName,
    detail: `Fixed payment deleted: ${money(payment.totalAmount)} (${formatDate(payment.date)}).`,
  });
};
