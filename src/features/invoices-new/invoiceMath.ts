// src/features/invoices-new/invoiceMath.ts
// ============================================================================
// Cálculos de Invoices New, sin Firestore ni React. Los montos van en CENTAVOS
// enteros y la tasa en puntos base (8.25% = 825). Aquí está la ÚNICA
// conversión con el resto de la app, que trabaja en dólares (jobFinancials).
// ============================================================================
import type { InvoicePaymentTerms, InvoiceJobSnapshot, YmdDate } from '../../types/index';
import { money } from '../../utils/jobFinancials';

/** Días que suma cada plazo a la fecha de emisión (custom no suma: se elige). */
const TERM_DAYS: Record<Exclude<InvoicePaymentTerms, 'custom'>, number> = {
  due_on_receipt: 0,
  net_7: 7,
  net_15: 15,
  net_30: 30,
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

/** Impuesto y total de un subtotal: USD 100 al 10% → { taxCents: 1000, totalCents: 11000 }. */
export const computeTotals = (subtotalCents: number, taxRateBps: number) => {
  const taxCents = computeTax(subtotalCents, taxRateBps);
  return { taxCents, totalCents: subtotalCents + taxCents };
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
