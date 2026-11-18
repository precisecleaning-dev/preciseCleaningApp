// src/features/payroll/services/payrollPaymentStatus.ts
// Marcar un pago por horas o fijo como pagado (o regresarlo a Pending) desde
// las tablas de Hourly y Fixed pay, y sacar una casa de una nómina asignada sin
// pagar ("Unassign" de Asignar nómina). Quién lo pagó es el usuario de la app
// (no el nombre de la cuenta de Auth) y cada cambio queda en el Activity Log.
import { deleteField } from 'firebase/firestore';
import type { PayrollRecord, SystemUser } from '../../../types/index';
import { payrollService } from '../../../services/payrollService';
import { logActivity } from '../../../services/activityLogService';
import { commitOps, type BatchOp } from '../../../shared/data/batchWrites';
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

/** Ajustes sin pagar (bono / descuento, sin casa) que se borran si se saca la última casa de su nómina asignada. */
export const getAdjustmentsLeftWithoutProperties = (
  record: PayrollRecord, payrollRecords: readonly PayrollRecord[],
): PayrollRecord[] => {
  const sameBatch = payrollRecords.filter((other) => other.batchId === record.batchId && other.id !== record.id);
  if (sameBatch.some((other) => other.propertyId)) return [];
  return sameBatch.filter((other) => !other.propertyId && other.id && other.status !== 'Paid');
};

/**
 * "Unassign": saca una casa de su nómina asignada SIN pagar (Asignar nómina →
 * "En nómina") y la regresa a pendiente, en un batch. Si era la última casa de
 * esa nómina, se borra también su ajuste (bono / descuento) sin pagar, que ya
 * no tendría a qué sumarse. Una casa pagada no se saca.
 */
export const unassignPropertyPayment = async (
  record: PayrollRecord, payrollRecords: readonly PayrollRecord[], employeeName: string, actor?: SystemUser | null,
): Promise<void> => {
  if (!record.id || !record.batchId || record.status === 'Paid') return;
  const orphanAdjustments = getAdjustmentsLeftWithoutProperties(record, payrollRecords);
  const ops: BatchOp[] = [
    (batch) => payrollService.batchUpdate(batch, record.id as string, {
      status: 'Pending', paidAt: '', paidBy: '', batchId: deleteField(), paymentDate: deleteField(),
    }),
    ...orphanAdjustments.map((adjustment) => payrollService.deleteOp(adjustment.id as string)),
  ];
  await commitOps(ops);
  void logActivity({
    action: 'update',
    module: 'Payroll',
    user: actor,
    targetId: record.id,
    targetLabel: employeeName,
    detail: `House payment of ${formatDate(record.date)} (${money(record.totalAmount)}) removed from its assigned payroll`
      + `${orphanAdjustments.length ? ' (its bonus / discount was removed too)' : ''}.`,
  });
};
