// src/features/payroll/services/fixedSalaryActions.ts
// Acciones sobre un sueldo fijo desde la tabla de Fixed pay: detenerlo,
// reanudarlo y borrarlo. Cada una deja su registro en el Activity Log.
import type { FixedSalary, SystemUser } from '../../../types/index';
import { fixedSalariesService } from '../../../services/fixedSalariesService';
import { logActivity } from '../../../services/activityLogService';
import { formatDate } from '../../../utils/dateFormat';
import { fullName } from '../../../utils/homeData';
import { money } from '../../../utils/jobFinancials';

const logSalaryChange = (
  salary: FixedSalary, employeeName: string, detail: string, actor?: SystemUser | null, action: 'update' | 'delete' = 'update',
) => {
  void logActivity({ action, module: 'Payroll', user: actor, targetId: salary.employeeId, targetLabel: employeeName, detail });
};

/** Deja de crear pagos (los ya creados se quedan). */
export const stopFixedSalary = async (salary: FixedSalary, employeeName: string, actor?: SystemUser | null): Promise<void> => {
  await fixedSalariesService.update(salary.employeeId, { active: false }, fullName(actor));
  logSalaryChange(salary, employeeName, 'Fixed salary stopped.', actor);
};

/**
 * Vuelve a crear pagos desde `startDate` (inicio de quincena): "Starts on" pasa
 * a esa fecha, así no se crean los de las quincenas en que estuvo parado.
 */
export const resumeFixedSalary = async (
  salary: FixedSalary, employeeName: string, startDate: string, actor?: SystemUser | null,
): Promise<void> => {
  await fixedSalariesService.update(salary.employeeId, { active: true, startDate }, fullName(actor));
  logSalaryChange(salary, employeeName, `Fixed salary resumed from ${formatDate(startDate)}.`, actor);
};

/** Borra el sueldo: la Cloud Function deja de crear pagos; los ya creados se quedan. */
export const deleteFixedSalary = async (salary: FixedSalary, employeeName: string, actor?: SystemUser | null): Promise<void> => {
  await fixedSalariesService.delete(salary.employeeId);
  logSalaryChange(salary, employeeName, `Fixed salary deleted (${money(salary.monthlyAmount)} per month).`, actor, 'delete');
};
