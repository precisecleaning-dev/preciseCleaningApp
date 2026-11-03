// src/features/invoices-new/invoiceMath.ts
// ============================================================================
// Cálculos de Invoices New, sin Firestore ni React. Los montos van en CENTAVOS
// enteros y la tasa en puntos base (8.25% = 825). Aquí está la ÚNICA
// conversión con el resto de la app, que trabaja en dólares (jobFinancials).
// ============================================================================
import type {
  InvoiceFeeInput, InvoiceJobSnapshot, InvoiceLineItem, InvoicePaymentTerms, InvoiceTotals, YmdDate,
} from '../../types/index';
import { money } from '../../utils/jobFinancials';

/** Días que suma cada plazo a la fecha de emisión (custom no suma: se elige). */
const TERM_DAYS: Record<Exclude<InvoicePaymentTerms, 'custom'>, number> = {
  due_on_receipt: 0,
  net_7: 7,
  net_15: 15,
  net_30: 30,
};

/** Nombre de cada plazo en la pantalla. */
export const INVOICE_PAYMENT_TERM_LABELS: Record<InvoicePaymentTerms, string> = {
  due_on_receipt: 'Due on receipt',
  net_7: 'Within 7 days',
  net_15: 'Within 15 days',
  net_30: 'Within 30 days',
  custom: 'Custom date',
};

const BASIS_POINTS_PER_UNIT = 10000;
const DAY_MS = 86_400_000;
const NUMBER_PREFIX = 'INV';
const NUMBER_SEQUENCE_DIGITS = 4;

/** Dólares → centavos enteros: 108.25 → 10825. */
export const toCents = (dollars: number): number => Math.round(dollars * 100);

/** Centavos → texto en dólares con el formato de la app: 10825 → "$108.25". */
export const formatCents = (cents: number): string => money(cents / 100);

/** Porcentaje → puntos base: 8.25 → 825. */
export const percentToBps = (percent: number): number => Math.round(percent * 100);

/** Puntos base → porcentaje para mostrar: 825 → 8.25. */
export const bpsToPercent = (basisPoints: number): number => basisPoints / 100;

/** Impuesto en centavos: round(subtotal × tasa). 10000 con 1000 bps → 1000. */
export const computeTax = (subtotalCents: number, taxRateBps: number): number =>
  Math.round((subtotalCents * taxRateBps) / BASIS_POINTS_PER_UNIT);

/** Monto de un fee: round(subtotal × tasa). $200.00 al 3% (300 bps) → 600. */
export const computeFeeCents = (subtotalCents: number, rateBps: number): number =>
  Math.round((subtotalCents * rateBps) / BASIS_POINTS_PER_UNIT);

/**
 * Montos del invoice con sus servicios y fees (decisión de Omar, 11/2026):
 * subtotal = Σ servicios sin el impuesto que se agrega · impuesto = Σ de esos
 * impuestos · cada fee = su % del SUBTOTAL (sin impuesto, el fee no paga
 * impuesto) · total = subtotal + impuesto + fees. Sin fees, el total es el
 * Final Cost del job (utils/jobFinancials.ts).
 * Ej.: un servicio de $200.00 al 8.25% + fee de 3% → 20000 + 1650 + 600 = 22250.
 */
export const computeInvoiceTotals = (
  lineItems: readonly InvoiceLineItem[], feeInputs: readonly InvoiceFeeInput[],
): InvoiceTotals => {
  const subtotalCents = lineItems.reduce((total, lineItem) => total + lineItem.amountCents, 0);
  const taxCents = lineItems.reduce((total, lineItem) => total + lineItem.taxCents, 0);
  const addedTaxRates = [...new Set(
    lineItems.filter((lineItem) => lineItem.taxMode === 'added').map((lineItem) => lineItem.taxRateBps),
  )];
  // Claves en orden alfabético: el service compara fees guardados con los del formulario.
  const fees = feeInputs.map((feeInput) => ({
    amountCents: computeFeeCents(subtotalCents, feeInput.rateBps),
    id: feeInput.id,
    label: feeInput.label.trim(),
    rateBps: feeInput.rateBps,
  }));
  const feesCents = fees.reduce((total, fee) => total + fee.amountCents, 0);
  return {
    subtotalCents,
    taxCents,
    taxRateBps: addedTaxRates.length === 1 ? addedTaxRates[0] : 0,
    fees,
    feesCents,
    totalCents: subtotalCents + taxCents + feesCents,
  };
};

/** "2026-11-02" → milisegundos a medianoche UTC (solo para contar días). */
const ymdToUtcMs = (ymd: YmdDate): number => {
  const [year, month, day] = ymd.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};

const utcMsToYmd = (utcMs: number): YmdDate => new Date(utcMs).toISOString().slice(0, 10);

/** Suma días a una fecha AAAA-MM-DD: ("2026-11-02", 15) → "2026-11-17". */
export const addDays = (ymd: YmdDate, days: number): YmdDate => utcMsToYmd(ymdToUtcMs(ymd) + days * DAY_MS);

/** Días entre dos fechas AAAA-MM-DD (to − from). */
export const daysBetween = (fromYmd: YmdDate, toYmd: YmdDate): number =>
  Math.round((ymdToUtcMs(toYmd) - ymdToUtcMs(fromYmd)) / DAY_MS);

/** Vencimiento según el plazo. Con custom se conserva la fecha que ya tenía. */
export const dueFromTerms = (issueDate: YmdDate, terms: InvoicePaymentTerms, currentDueDate: YmdDate): YmdDate =>
  terms === 'custom' ? currentDueDate : addDays(issueDate, TERM_DAYS[terms]);

/** Plazo que corresponde a un par de fechas (al editar el vencimiento a mano). */
export const termsFromDates = (issueDate: YmdDate, dueDate: YmdDate): InvoicePaymentTerms => {
  const dayCount = daysBetween(issueDate, dueDate);
  const matchingTerm = Object.entries(TERM_DAYS).find(([, termDays]) => termDays === dayCount);
  return matchingTerm ? (matchingTerm[0] as InvoicePaymentTerms) : 'custom';
};

/** Número legible: (2026, 1) → "INV-2026-0001". */
export const formatInvoiceNumber = (year: number, sequence: number): string =>
  `${NUMBER_PREFIX}-${year}-${String(sequence).padStart(NUMBER_SEQUENCE_DIGITS, '0')}`;

/** Clave para desempatar el orden: (2026, 1) → 2026000001. */
export const getNumberKey = (year: number, sequence: number): number => year * 1_000_000 + sequence;

/** Texto de búsqueda en minúsculas: número, cliente y job. */
export const buildSearchText = (number: string, clientName: string, job: InvoiceJobSnapshot): string =>
  [number, clientName, job.address, job.unit, job.serviceName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
