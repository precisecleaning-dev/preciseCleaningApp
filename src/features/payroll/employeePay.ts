// src/features/payroll/employeePay.ts
// Tipo de pago de cada empleado (System Users): por casa, por hora o fijo. Cada
// pestaña de Payroll muestra solo a los empleados de su tipo.
import type { EmployeePayType, Role, SystemUser } from '../../types/index';

export const PAY_TYPE_OPTIONS: ReadonlyArray<{ value: EmployeePayType; label: string }> = [
  { value: 'perHouse', label: 'Per house' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'fixed', label: 'Fixed salary' },
];

/** Sin tipo guardado, el empleado cobra por casa (como cobraban todos antes). */
export const getEmployeePayType = (user?: Pick<SystemUser, 'payType'> | null): EmployeePayType =>
  user?.payType ?? 'perHouse';

export const hasPayType = (user: Pick<SystemUser, 'payType'>, payType: EmployeePayType): boolean =>
  getEmployeePayType(user) === payType;

/**
 * Quién puede ver y cambiar el tipo de pago y los montos (rate / sueldo):
 * Payroll con alcance 'All' y permiso de editar (las reglas de hourly_rates y
 * fixed_salaries piden editar Payroll), o el Super Admin.
 */
export const canManageEmployeePay = (activeRole?: Role | null, isSuperAdmin?: boolean): boolean => {
  if (isSuperAdmin) return true;
  const payrollPermission = activeRole?.permissions?.find((permission) => permission.module === 'Payroll');
  return !!payrollPermission?.canEdit && payrollPermission.scope === 'All';
};

/**
 * Borrar un sueldo fijo o un pago fijo, o mover el pago de un empleado a su id
 * nuevo (invitación o cambio de correo, que borra el rate y el sueldo del id
 * viejo): además de administrar pagos pide el permiso Delete de Payroll (las
 * reglas de hourly_rates y fixed_salaries).
 */
export const canDeleteEmployeePay = (activeRole?: Role | null, isSuperAdmin?: boolean): boolean => {
  if (isSuperAdmin) return true;
  const payrollPermission = activeRole?.permissions?.find((permission) => permission.module === 'Payroll');
  return canManageEmployeePay(activeRole, isSuperAdmin) && !!payrollPermission?.canDelete;
};

export const canMoveEmployeePay = canDeleteEmployeePay;
