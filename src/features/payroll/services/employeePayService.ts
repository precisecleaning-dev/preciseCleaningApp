// src/features/payroll/services/employeePayService.ts
// Guarda lo que se captura de pago en System Users: el rate por hora
// (hourly_rates) o el sueldo fijo (fixed_salaries). El tipo de pago (payType)
// lo guarda el propio formulario de usuario en system_users. Cuando el usuario
// cambia de id, buildEmployeePayMoveOps mueve todo su pago en el mismo batch.
import type { EmployeePayChange, SystemUser } from '../../../types/index';
import type { BatchOp } from '../../../shared/data/batchWrites';
import { hourlyRatesService } from '../../../services/hourlyRatesService';
import { fixedSalariesService } from '../../../services/fixedSalariesService';
import { payrollService } from '../../../services/payrollService';
import { logActivity } from '../../../services/activityLogService';
import { todayIso } from '../../../utils/dateFormat';
import { getNextPayPeriodStart } from '../fixedPay';
import { fullName } from '../../../utils/homeData';
import { money } from '../../../utils/jobFinancials';

const logPayChange = (employeeId: string, employeeName: string, detail: string, actor?: SystemUser | null) => {
  void logActivity({ action: 'update', module: 'Payroll', user: actor, targetId: employeeId, targetLabel: employeeName, detail });
};

/** Detiene el sueldo fijo del empleado si está activo (los pagos ya creados se quedan). */
export const stopEmployeeFixedSalary = async (
  employeeId: string, employeeName: string, reason: string, actor?: SystemUser | null,
): Promise<void> => {
  const salary = await fixedSalariesService.getOne(employeeId);
  if (!salary?.active) return;
  await fixedSalariesService.update(employeeId, { active: false }, fullName(actor));
  logPayChange(employeeId, employeeName, `Fixed salary stopped: ${reason}.`, actor);
};

/**
 * Guarda el pago capturado en System Users. Decide con lo que hay GUARDADO
 * (getOne), no con lo que traía la pantalla (el listener pudo no haber llegado).
 * Primero detiene el sueldo fijo si ya no corresponde (otro tipo o usuario
 * Inactive): así un reintento lo vuelve a intentar aunque lo demás ya esté.
 */
export const saveEmployeePay = async (change: EmployeePayChange, actor?: SystemUser | null): Promise<void> => {
  const { employeeId, employeeName, payType, amount, isActiveUser } = change;
  const actorName = fullName(actor);
  const [rate, salary] = await Promise.all([hourlyRatesService.getOne(employeeId), fixedSalariesService.getOne(employeeId)]);

  if (salary?.active && (payType !== 'fixed' || !isActiveUser)) {
    await fixedSalariesService.update(employeeId, { active: false }, actorName);
    logPayChange(employeeId, employeeName, `Fixed salary stopped (${isActiveUser ? 'pay type changed' : 'user inactive'}).`, actor);
  }
  if (!isActiveUser || amount === null) return;

  if (payType === 'hourly' && amount !== rate?.hourlyRate) {
    if (rate) {
      await hourlyRatesService.update(employeeId, amount, actorName);
    } else {
      await hourlyRatesService.create(employeeId, amount, actorName);
    }
    logPayChange(employeeId, employeeName, `Hourly rate: ${money(amount)} per hour.`, actor);
  }

  if (payType === 'fixed') {
    if (!salary) {
      await fixedSalariesService.create({ employeeId, monthlyAmount: amount, startDate: getNextPayPeriodStart(todayIso()) }, actorName);
      logPayChange(employeeId, employeeName, `Fixed salary: ${money(amount)} per month.`, actor);
    } else if (!salary.active) {
      // Vuelve a ser fijo: se reanuda en el próximo inicio de quincena (como "Resume"), sin pagos de cuando estuvo parado.
      await fixedSalariesService.update(
        employeeId, { monthlyAmount: amount, active: true, startDate: getNextPayPeriodStart(todayIso()) }, actorName,
      );
      logPayChange(employeeId, employeeName, `Fixed salary resumed: ${money(amount)} per month.`, actor);
    } else if (amount !== salary.monthlyAmount) {
      await fixedSalariesService.update(employeeId, { monthlyAmount: amount }, actorName);
      logPayChange(employeeId, employeeName, `Fixed salary: ${money(salary.monthlyAmount)} → ${money(amount)} per month.`, actor);
    }
  }
};

/**
 * El documento del usuario cambia de id (invitación ✈️ o cambio de correo de un
 * usuario pendiente). Devuelve las operaciones que mueven su pago al id nuevo,
 * para que viajen en el MISMO batch que el usuario (todo o nada):
 *  · su rate y su sueldo (con skippedPayDates) se guardan en el id nuevo y se
 *    borran del viejo;
 *  · sus pagos por horas y fijos ya creados pasan al id nuevo;
 *  · las fechas de esos pagos fijos se suman a skippedPayDates: su documento se
 *    llama fixed_{idViejo}_{fecha} y, sin esto, createfixedpayroll los volvería
 *    a crear con el id nuevo.
 * `movedCount` dice cuántos documentos se mueven (0 = nada que mover).
 */
export const buildEmployeePayMoveOps = async (
  fromId: string, toId: string, actor?: SystemUser | null,
): Promise<{ ops: BatchOp[]; movedCount: number }> => {
  const [rate, salary, payments] = await Promise.all([
    hourlyRatesService.getOne(fromId),
    fixedSalariesService.getOne(fromId),
    payrollService.getByEmployeeId(fromId),
  ]);
  const actorName = fullName(actor);
  const updatedAt = new Date().toISOString();
  const movedPayments = payments.filter((payment) => payment.payType === 'hourly' || payment.payType === 'fixed');
  const ops: BatchOp[] = [];

  if (rate) {
    ops.push(hourlyRatesService.setOp({ ...rate, id: toId, employeeId: toId, updatedAt, updatedByUserName: actorName }));
    ops.push(hourlyRatesService.deleteOp(fromId));
  }
  if (salary) {
    const createdFixedDates = movedPayments.filter((payment) => payment.payType === 'fixed').map((payment) => payment.date);
    const skippedPayDates = [...new Set([...(salary.skippedPayDates ?? []), ...createdFixedDates])];
    ops.push(fixedSalariesService.setOp({
      ...salary, id: toId, employeeId: toId, skippedPayDates, updatedAt, updatedByUserName: actorName,
    }));
    ops.push(fixedSalariesService.deleteOp(fromId));
  }
  movedPayments.forEach((payment) => {
    const changes = payment.payType === 'fixed' ? { employeeId: toId, fixedSalaryId: toId } : { employeeId: toId };
    ops.push(payrollService.updateOp(payment.id, changes));
  });

  return { ops, movedCount: (rate ? 1 : 0) + (salary ? 1 : 0) + movedPayments.length };
};

/** Registra en el Activity Log que el pago se movió con el usuario (después del batch). */
export const logEmployeePayMove = (
  toId: string, employeeName: string, movedCount: number, actor?: SystemUser | null,
): void => {
  if (movedCount === 0) return;
  void logActivity({
    action: 'update',
    module: 'Payroll',
    user: actor,
    targetId: toId,
    targetLabel: employeeName,
    detail: `Pay moved to the new account (${movedCount} record${movedCount === 1 ? '' : 's'}: rate, salary and payments).`,
  });
};
