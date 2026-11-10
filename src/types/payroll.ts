// src/types/payroll.ts
// ============================================================================
// Tipos de la colección `payroll`: un pago a un empleado por documento (el pago
// de una casa, el ajuste de un pago consolidado…). Los usa
// src/services/payrollService.ts. Se importan desde '../types/index'
// (index.ts los reexporta).
// ============================================================================

/** Pago que no sale de una casa: por horas (pestaña Hourly) o fijo quincenal
 *  (pestaña Fixed pay, lo crea la Cloud Function `createfixedpayroll`). */
export type PayrollPayType = 'hourly' | 'fixed';

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
  /** Pago por horas (sin casa: propertyId vacío). Los pagos de una casa no lo llevan. */
  payType?: PayrollPayType;
  /** Pago por horas: horas trabajadas y tarifa por hora (total = hours × hourlyRate). */
  hours?: number;
  hourlyRate?: number;
  /** Recibo de pago subido a Storage (payroll_receipts/…) y su nombre original. */
  receiptUrl?: string;
  receiptFileName?: string;
  /** Pago fijo: el sueldo (fixed_salaries/{employeeId}) del que sale. */
  fixedSalaryId?: string;
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
