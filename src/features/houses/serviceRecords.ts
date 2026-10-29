// src/features/houses/serviceRecords.ts
// Servicios cobrados de una casa (`billing_services`) tal como los maneja el
// formulario de casas. Extraído de HousesView.tsx.
import type { Customer, ServiceRecord, Tax } from "../../types/index";
import { getServiceTaxSign } from "../../utils/jobFinancials";

// Huella de un servicio para saber si cambió desde que se cargó. Las claves se
// ordenan: el mismo contenido en otro orden no cuenta como cambio.
export const recordFingerprint = (r: ServiceRecord): string => {
  const entries = Object.entries(r as unknown as Record<string, unknown>);
  return JSON.stringify(entries.sort(([a], [b]) => a.localeCompare(b)));
};

// Totales de un servicio cobrado (mismas fórmulas que AppSheet):
//   Subtotal = cantidad × precio; Tax$ = subtotal × %;
//   Total = subtotal + tax (Apply Tax), − tax (Minus Tax sin Apply Tax) o subtotal;
//   Total Minus Tax = IF(minusTax & !applyTax, subtotal − tax,
//                     IF(applyTax & !minusTax, subtotal + tax, subtotal)).
export const computeServiceTotals = (f: ServiceRecord) => {
  const qty = Number(f.quantity) || 0;
  const price = Number(f.price) || 0;
  const subtotal = qty * price;
  const taxPct = Number(f.taxPercentage) || 0;
  const taxAmount = (subtotal * taxPct) / 100;

  let total = subtotal;
  if (f.applyTax === "Yes") total = subtotal + taxAmount;
  else if (f.applyTax === "No" && f.minusTax === "Yes") total = subtotal - taxAmount;

  // La misma regla que usan Invoices y el Overview (utils/jobFinancials.ts).
  const totalMinusTax = subtotal + getServiceTaxSign(f.applyTax, f.minusTax) * taxAmount;

  return { subtotal, taxAmount, total, totalMinusTax };
};

// ⭐ Total Minus Tax para registros que aún no lo tengan guardado (legacy/importados)
export const recordTotalMinusTax = (r: ServiceRecord): number => {
  if (typeof r?.totalMinusTax === "number") return r.totalMinusTax;
  const subtotal = Number(r?.subtotal) || 0;
  const taxAmount = Number(r?.taxAmount) || 0;
  return subtotal + getServiceTaxSign(r?.applyTax, r?.minusTax) * taxAmount;
};

const DEFAULT_SERVICE_RECORD: ServiceRecord = {
  propertyId: "",
  serviceId: "",
  quantity: 1,
  price: 0,
  subtotal: 0,
  applyTax: "Yes",
  minusTax: "No",
  taxPercentage: 0,
  taxAmount: 0,
  total: 0,
  totalMinusTax: 0,
  notes: "",
};

/**
 * Servicio NUEVO para el modal "Add Service" (detalle o formulario de casa).
 * El impuesto inicial es el primero del catálogo y APPLY TAX sale del cliente.
 */
export function newServiceRecord(
  propertyId: string,
  clientRef: string | undefined,
  taxes: Tax[],
  customersList: Customer[],
): ServiceRecord {
  const defaultTax = taxes.length > 0 ? Number(taxes[0].percentage) : 0;
  // ⭐ APPLY TAX inicial según el CLIENTE de la casa (campo "Apply Tax"
  //    del módulo Customers). Es solo el VALOR INICIAL: en el formulario
  //    del servicio se puede cambiar caso por caso. Sin cliente o sin
  //    preferencia definida → "Yes" (comportamiento histórico).
  const customer = customersList.find(
    (c) =>
      c.id === clientRef ||
      (c as Customer & { legacyId?: string }).legacyId === clientRef ||
      c.name === clientRef,
  );
  const clientApplyTax: "Yes" | "No" =
    customer?.applyTax === "No" ? "No" : "Yes";
  return {
    ...DEFAULT_SERVICE_RECORD,
    propertyId,
    taxPercentage: defaultTax,
    applyTax: clientApplyTax,
    // minusTax NO se toca: es un control aparte en el formulario y su
    // default es "No" (Apply Tax "No" del cliente = simplemente sin
    // impuesto agregado, no impuesto restado).
    minusTax: "No",
  };
}
