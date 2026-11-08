// src/types/payroll.ts
// ============================================================================
// Tipos de la colección `payroll`: un pago a un empleado por documento (el pago
// de una casa, el ajuste de un pago consolidado…). Los usa
// src/services/payrollService.ts. Se importan desde '../types/index'
// (index.ts los reexporta).
// ============================================================================

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
}
