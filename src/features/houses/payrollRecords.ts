// src/features/houses/payrollRecords.ts
// Pagos (`payroll`) tal como los abre el modal "Register Payment" del
// detalle y del formulario de casas. Extraído de HousesView.tsx.
import type { PayrollRecord } from "../../types/index";
import { todayIso } from "../../utils/dateFormat";

/** Pago NUEVO para la casa (fecha de hoy, montos en cero). */
export const newPayrollRecord = (propertyId: string): PayrollRecord => ({
  propertyId,
  date: todayIso(),
  employeeId: "",
  baseAmount: 0,
  extraAmount: 0,
  extraNote: "",
  discountAmount: 0,
  discountNote: "",
  totalAmount: 0,
});

/** El mismo modal precargado con un pago existente (para editarlo). */
export const editablePayroll = (record: PayrollRecord): PayrollRecord => ({
  propertyId: String(record.propertyId || ""),
  date: record.date || todayIso(),
  employeeId: String(record.employeeId || ""),
  baseAmount: Number(record.baseAmount || 0),
  extraAmount: Number(record.extraAmount || 0),
  extraNote: String(record.extraNote || ""),
  discountAmount: Number(record.discountAmount || 0),
  discountNote: String(record.discountNote || ""),
  totalAmount: Number(record.totalAmount || 0),
});

/** Total del pago: base + extra − descuento. */
export const payrollTotal = (f: PayrollRecord): number =>
  Number(f.baseAmount) + Number(f.extraAmount) - Number(f.discountAmount);
