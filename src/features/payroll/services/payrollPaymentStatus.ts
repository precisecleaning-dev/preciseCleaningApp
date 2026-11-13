// src/features/payroll/services/payrollPaymentStatus.ts
// Marcar un pago por horas o fijo como pagado (o regresarlo a Pending) desde
// las tablas de Hourly y Fixed pay. Quién lo pagó es el usuario de la app (no
// el nombre de la cuenta de Auth) y cada cambio queda en el Activity Log.
import type { PayrollRecord, SystemUser } from '../../../types/index';
import { payrollService } from '../../../services/payrollService';
import { logActivity } from '../../../services/activityLogService';
import { formatDate, todayIso } from '../../../utils/dateFormat';
import { fullName } from '../../../utils/homeData';
import { money } from '../../../utils/jobFinancials';

const describePayment = (payment: PayrollRecord) =>
  `${payment.payType === 'fixed' ? 'Fixed' : 'Hourly'} payment of ${formatDate(payment.date)} (${money(payment.totalAmount)})`;

export const markPayrollPaymentPaid = async (
  payment: PayrollRecord, employeeName: string, actor?: SystemUser | null,
): Promise<void> => {
  if (!payment.id) return;
  const paidAt = todayIso();
  await payrollService.update(payment.id, { status: 'Paid', paidAt, paidBy: fullName(actor) });
  void logActivity({
    action: 'update',
    module: 'Payroll',
    user: actor,
    targetId: payment.id,
    targetLabel: employeeName,
    detail: `${describePayment(payment)} marked as paid on ${formatDate(paidAt)}.`,
  });
};

export const markPayrollPaymentPending = async (
  payment: PayrollRecord, employeeName: string, actor?: SystemUser | null,
): Promise<void> => {
  if (!payment.id) return;
  await payrollService.update(payment.id, { status: 'Pending', paidAt: '', paidBy: '' });
  void logActivity({
    action: 'update',
    module: 'Payroll',
    user: actor,
    targetId: payment.id,
    targetLabel: employeeName,
    detail: `${describePayment(payment)} changed back to Pending.`,
  });
};
