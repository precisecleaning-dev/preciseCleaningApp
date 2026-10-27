// src/types/billingServices.ts
// ============================================================================
// Tipos de la colección `billing_services`: los servicios cobrados de una casa.
// Se importan desde '../types/index' (index.ts los reexporta).
// ============================================================================

/** Un servicio cobrado tal como lo manejan el formulario y el detalle de la
 *  casa (features/houses/serviceRecords.ts tiene sus fórmulas). */
export interface ServiceRecord {
  id?: string;
  propertyId: string;
  serviceId: string;
  quantity: number;
  price: number;
  subtotal: number;
  applyTax: "Yes" | "No";
  minusTax: "Yes" | "No";
  taxPercentage: number;
  taxAmount: number;
  total: number;
  totalMinusTax: number; // ⭐ AppSheet "Total Minus Tax"
  notes: string;
  createdAt?: string;
}

/** Campos de un servicio cobrado que usan las finanzas del trabajo
 *  (utils/jobFinancials.ts). */
type BilledServiceAmountField = keyof Pick<ServiceRecord, 'subtotal' | 'quantity' | 'price' | 'total' | 'applyTax'>;

/** Lo que se lee de esos campos: los mismos de ServiceRecord, pero `unknown`
 *  porque los registros viejos o importados pueden traer textos o no traerlos. */
export type BilledServiceAmounts = Partial<Record<BilledServiceAmountField, unknown>>;
