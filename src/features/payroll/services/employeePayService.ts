// src/features/payroll/services/employeePayService.ts
// Guarda lo que se captura de pago en System Users: el rate por hora
// (hourly_rates) o el sueldo fijo (fixed_salaries). El tipo de pago (payType)
// lo guarda el propio formulario de usuario en system_users.
import type { EmployeePayType, FixedSalary, HourlyRate } from '../../../types/index';
import { hourlyRatesService } from '../../../services/hourlyRatesService';
import { fixedSalariesService } from '../../../services/fixedSalariesService';
import { todayIso } from '../../../utils/dateFormat';

export interface EmployeePayChange {
  employeeId: string;
  payType: EmployeePayType;
  previousPayType: EmployeePayType;
  /** Rate (por hora) o sueldo mensual (fijo); null = no se capturó. */
  amount: number | null;
  currentRate?: HourlyRate;
  currentSalary?: FixedSalary;
}

export const saveEmployeePay = async (change: EmployeePayChange, actorName: string): Promise<void> => {
  const { employeeId, payType, previousPayType, amount, currentRate, currentSalary } = change;

  if (payType === 'hourly' && amount !== null && amount !== currentRate?.hourlyRate) {
    await hourlyRatesService.save(employeeId, amount, actorName);
  }

  if (payType === 'fixed' && amount !== null) {
    if (!currentSalary) {
      await fixedSalariesService.create({ employeeId, monthlyAmount: amount, startDate: todayIso() }, actorName);
    } else if (!currentSalary.active) {
      // Vuelve a ser fijo: se reanuda desde hoy (como "Resume"), sin pagos de cuando estuvo parado.
      await fixedSalariesService.update(employeeId, { monthlyAmount: amount, active: true, startDate: todayIso() }, actorName);
    } else if (amount !== currentSalary.monthlyAmount) {
      await fixedSalariesService.update(employeeId, { monthlyAmount: amount }, actorName);
    }
  }

  // Deja de ser fijo: se detiene su sueldo (los pagos ya creados se quedan).
  if (previousPayType === 'fixed' && payType !== 'fixed' && currentSalary?.active) {
    await fixedSalariesService.update(employeeId, { active: false }, actorName);
  }
};

/**
 * El documento del usuario cambió de id (invitación o cambio de correo de un
 * usuario pendiente): su rate y su sueldo se pasan al id nuevo, si no la Cloud
 * Function seguiría pagando al id viejo.
 */
export const moveEmployeePay = async (fromId: string, toId: string, actorName: string): Promise<void> => {
  const [rate, salary] = await Promise.all([hourlyRatesService.getOne(fromId), fixedSalariesService.getOne(fromId)]);
  if (rate) {
    await hourlyRatesService.save(toId, rate.hourlyRate, actorName);
    await hourlyRatesService.delete(fromId);
  }
  if (salary) {
    await fixedSalariesService.create({ employeeId: toId, monthlyAmount: salary.monthlyAmount, startDate: salary.startDate }, actorName);
    if (!salary.active) await fixedSalariesService.update(toId, { active: false }, actorName);
    await fixedSalariesService.delete(fromId);
  }
};
