// src/types/payroll.ts
// ============================================================================
// Tipos de la colección `payroll`: un pago a un empleado por documento (el pago
// de una casa, el ajuste de un pago consolidado…). Los usa
// src/services/payrollService.ts. Se importan desde '../types/index'
// (index.ts los reexporta).
// ============================================================================

/** Cómo cobra un empleado (campo payType de system_users): por casa (Asignar
 *  nómina), por hora (Hourly) o sueldo fijo quincenal (Fixed pay). Sin el campo
 *  se toma 'perHouse', que es como cobraban todos antes. */
export type EmployeePayType = 'perHouse' | 'hourly' | 'fixed';

/** Pago que no sale de una casa: por horas (pestaña Hourly) o fijo quincenal
 *  (pestaña Fixed pay, lo crea la Cloud Function `createfixedpayroll`). */
export type PayrollRecordPayType = Exclude<EmployeePayType, 'perHouse'>;

export interface PayrollRecord {
  id?: string;
  propertyId: string;
  date: string;
  employeeId: string;
  baseAmount: number;
  extraAmount: number;
  extraNote: string;
  discountAmount: number;
  discountNote: string;
  totalAmount: number;
  /** Pending hasta que se marca como pagado. */
  status?: 'Pending' | 'Paid';
  /** Fecha (AAAA-MM-DD) y quién lo marcó como pagado. */
  paidAt?: string | null;
  paidBy?: string | null;
  /** Pago por horas o fijo (sin casa: propertyId vacío). Los pagos de una casa no lo llevan. */
  payType?: PayrollRecordPayType;
  /** Pago por horas: horas trabajadas y tarifa por hora (total = hours × hourlyRate). */
  hours?: number;
  hourlyRate?: number;
  /** Recibo de pago subido a Storage (payroll_receipts/…) y su nombre original. */
  receiptUrl?: string;
  receiptFileName?: string;
  /** Pago fijo: el sueldo (fixed_salaries/{employeeId}) del que sale. */
  fixedSalaryId?: string;
  /** Fecha y hora ISO en que lo creó la Cloud Function createfixedpayroll (pagos fijos). */
  createdAt?: string;
}

/** Lo que captura la pantalla de un pago por horas (el service calcula el total y sube el recibo). */
export interface HourlyPaymentInput {
  employeeId: string;
  employeeName: string;
  /** Fecha de pago, AAAA-MM-DD. */
  date: string;
  hours: number;
  hourlyRate: number;
  receiptFile: File | null;
}

/** Cambios a un pago por horas ya guardado. */
export interface HourlyPaymentChanges extends HourlyPaymentInput {
  /** false si se quitó el recibo que ya tenía (y no se subió otro). */
  shouldKeepCurrentReceipt: boolean;
}

/**
 * Sueldo fijo de un empleado (colección `fixed_salaries`, id = id del
 * empleado: uno por persona). Se paga en dos partes iguales, el 15 y el último
 * día de cada mes; los pagos los crea la Cloud Function `createfixedpayroll`.
 */
export interface FixedSalary {
  id: string;
  employeeId: string;
  /** Sueldo MENSUAL; cada pago quincenal es la mitad. */
  monthlyAmount: number;
  /** Primer día (AAAA-MM-DD) desde el que se crean sus pagos. */
  startDate: string;
  /** false = ya no se crean pagos (los creados se quedan). */
  active: boolean;
  /** Fecha y hora ISO de la última modificación y quién la hizo. */
  updatedAt: string;
  updatedByUserName: string;
  /** Fechas de pago (AAAA-MM-DD) cuyo pago se borró a mano: la Cloud Function no lo vuelve a crear. */
  skippedPayDates?: string[];
}

/** Lo que captura la pantalla de un sueldo fijo; el resto (id, fechas, quién) lo pone el service. */
export interface FixedSalaryInput {
  employeeId: string;
  monthlyAmount: number;
  startDate: string;
}

/** Rate por hora de un empleado (colección hourly_rates; id = id del empleado). Solo lo ve Payroll. */
export interface HourlyRate {
  id: string;
  employeeId: string;
  /** Dólares por hora; es el rate que propone la pestaña Hourly. */
  hourlyRate: number;
  /** Fecha y hora ISO de la última modificación y quién la hizo. */
  updatedAt: string;
  updatedByUserName: string;
}

/** Lo que se guarda del pago de un empleado desde System Users (rate por hora o sueldo fijo). */
export interface EmployeePayChange {
  employeeId: string;
  employeeName: string;
  payType: EmployeePayType;
  /** Rate (por hora) o sueldo mensual (fijo); null = no se capturó. */
  amount: number | null;
  /** false si el usuario queda Inactive: su sueldo fijo se detiene. */
  isActiveUser: boolean;
}
