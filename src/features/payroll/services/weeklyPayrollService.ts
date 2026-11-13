// src/features/payroll/services/weeklyPayrollService.ts
// Escrituras de la nómina semanal por casa (pestaña Nóminas de Payroll): pagar
// la semana completa, regresarla a Pending, guardar el bono / descuento de un
// empleado y editar el pago de una casa desde el detalle. Cada una es una sola
// escritura o UN batch (todo o nada) y deja su registro en el Activity Log. Lo pagado o ajustado aquí lleva batchId `week_AAAA-MM-DD`
// (ver weeklyPayroll.ts): así Asignar nómina lo ve como pagado y "Mark week
// pending" sabe qué regresar.
import { deleteField } from 'firebase/firestore';
import type { SystemUser } from '../../../types/index';
import { payrollService } from '../../../services/payrollService';
import { logActivity } from '../../../services/activityLogService';
import { commitOps, type BatchOp } from '../../../shared/data/batchWrites';
import { formatDate, formatDateRange } from '../../../utils/dateFormat';
import { fullName } from '../../../utils/homeData';
import { getPayrollTotal, money, roundToCents } from '../../../utils/jobFinancials';
import { getWeekBatchId, getWeekDays, type WeeklyPayrollRecord } from '../weeklyPayroll';

const describeWeek = (weekStart: string) => {
  const weekDays = getWeekDays(weekStart);
  return `week ${formatDateRange(weekDays[0], weekDays[6])}`;
};

const logWeekChange = (weekStart: string, targetLabel: string, detail: string, actor?: SystemUser | null) => {
  void logActivity({ action: 'update', module: 'Payroll', user: actor, targetId: getWeekBatchId(weekStart), targetLabel, detail });
};

/**
 * Marca como pagados los pagos sin pagar que recibe (toda la semana o los de un
 * empleado), con la fecha del pago. Los que venían de un pago consolidado de
 * Asignar nómina conservan su batchId. `paidForLabel`: a quién se pagó (Activity Log).
 */
export const payWeek = async (
  records: readonly WeeklyPayrollRecord[], weekStart: string, paymentDate: string, actor?: SystemUser | null,
  paidForLabel = 'All employees',
): Promise<void> => {
  const unpaidRecords = records.filter((record) => record.id && record.status !== 'Paid');
  if (unpaidRecords.length === 0) return;
  const paidBy = fullName(actor);
  const weekBatchId = getWeekBatchId(weekStart);
  await commitOps(unpaidRecords.map((record): BatchOp => (batch) => payrollService.batchUpdate(batch, record.id as string, {
    status: 'Paid', paidAt: paymentDate, paidBy, paymentDate, batchId: record.batchId || weekBatchId,
  })));
  const total = roundToCents(unpaidRecords.reduce((sum, record) => sum + getPayrollTotal(record), 0));
  logWeekChange(weekStart, `Payroll ${describeWeek(weekStart)}`,
    `${paidForLabel} paid on ${formatDate(paymentDate)}: ${unpaidRecords.length} payment(s), ${money(total)}.`, actor);
};

/**
 * Regresa a Pending lo que se pagó desde esta pestaña (toda la semana o lo de
 * un empleado: "Not sent"). Las casas pierden el batchId (vuelven a Asignar
 * nómina como pendientes); los ajustes de la semana lo conservan, porque es lo
 * que los ubica en su semana. `forLabel`: de quién (Activity Log).
 */
export const markWeekPending = async (
  paidRecords: readonly WeeklyPayrollRecord[], weekStart: string, actor?: SystemUser | null, forLabel = 'All employees',
): Promise<void> => {
  const records = paidRecords.filter((record) => record.id);
  if (records.length === 0) return;
  await commitOps(records.map((record): BatchOp => (batch) => payrollService.batchUpdate(batch, record.id as string, {
    status: 'Pending', paidAt: '', paidBy: '', paymentDate: deleteField(),
    ...(record.propertyId ? { batchId: deleteField() } : {}),
  })));
  logWeekChange(weekStart, `Payroll ${describeWeek(weekStart)}`,
    `${forLabel} changed back to Pending (not sent): ${records.length} payment(s).`, actor);
};

export interface WeekAdjustmentInput {
  employeeId: string;
  employeeName: string;
  weekStart: string;
  bonus: number;
  bonusNote: string;
  discount: number;
  discountNote: string;
}

/**
 * Bono y descuento de un empleado en la semana: borra sus ajustes SIN pagar y,
 * si hay bono o descuento, crea uno solo con el batchId de la semana. Los
 * ajustes ya pagados no se tocan.
 */
export const saveWeekAdjustment = async (
  input: WeekAdjustmentInput, unpaidAdjustments: readonly WeeklyPayrollRecord[], actor?: SystemUser | null,
): Promise<void> => {
  const ops: BatchOp[] = unpaidAdjustments
    .filter((adjustment) => adjustment.id)
    .map((adjustment) => payrollService.deleteOp(adjustment.id as string));
  if (input.bonus > 0 || input.discount > 0) {
    const adjustment: WeeklyPayrollRecord = {
      propertyId: '',
      employeeId: input.employeeId,
      date: input.weekStart,
      baseAmount: 0,
      extraAmount: input.bonus,
      extraNote: input.bonus > 0 ? input.bonusNote : '',
      discountAmount: input.discount,
      discountNote: input.discount > 0 ? input.discountNote : '',
      totalAmount: roundToCents(input.bonus - input.discount),
      status: 'Pending',
      paidAt: '',
      paidBy: '',
      batchId: getWeekBatchId(input.weekStart),
    };
    ops.push((batch) => payrollService.batchCreate(batch, adjustment));
  }
  if (ops.length === 0) return;
  await commitOps(ops);
  logWeekChange(input.weekStart, input.employeeName,
    `Payroll ${describeWeek(input.weekStart)}: bonus ${money(input.bonus)}, discount ${money(input.discount)}.`, actor);
};

export interface HousePaymentChanges {
  baseAmount: number;
  extraAmount: number;
  extraNote: string;
  discountAmount: number;
  discountNote: string;
}

/**
 * Edita el pago de una casa desde el detalle semanal (base, extra y descuento
 * con sus notas) sin salir de la pestaña. Solo esos campos: si alguien lo
 * marca pagado mientras tanto, el estado no se pisa.
 */
export const updateHousePayment = async (
  record: WeeklyPayrollRecord, changes: HousePaymentChanges, houseLabel: string, actor?: SystemUser | null,
): Promise<void> => {
  if (!record.id) return;
  const totalAmount = roundToCents(changes.baseAmount + changes.extraAmount - changes.discountAmount);
  await payrollService.update(record.id, { ...changes, totalAmount });
  void logActivity({
    action: 'update', module: 'Payroll', user: actor, targetId: record.id, targetLabel: houseLabel,
    detail: `House payment edited from the weekly payroll: ${money(getPayrollTotal(record))} → ${money(totalAmount)}.`,
  });
};
