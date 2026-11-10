// src/types/payroll.ts
// ============================================================================
// Tipos de la colección `payroll`: un pago a un empleado por documento (el pago
// de una casa, el ajuste de un pago consolidado…). Los usa
// src/services/payrollService.ts. Se importan desde '../types/index'
// (index.ts los reexporta).
// ============================================================================

/** Pago que no sale de una casa: por horas (pestaña Hourly de Payroll). */
export type PayrollPayType = 'hourly';

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
}
