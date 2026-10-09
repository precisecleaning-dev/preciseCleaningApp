// src/features/houses/serviceRecords.ts
// Servicios cobrados de una casa (`billing_services`) tal como los maneja el
// formulario de casas. Extraído de HousesView.tsx.

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

  let totalMinusTax = subtotal;
  if (f.minusTax === "Yes" && f.applyTax === "No") totalMinusTax = subtotal - taxAmount;
  else if (f.applyTax === "Yes" && f.minusTax === "No") totalMinusTax = subtotal + taxAmount;

  return { subtotal, taxAmount, total, totalMinusTax };
};
