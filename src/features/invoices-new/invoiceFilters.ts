// src/features/invoices-new/invoiceFilters.ts
// ============================================================================
// Filtros, tarjetas y orden de la lista de Invoices New, sin React.
//
//   1. Búsqueda + rango de fechas → el conjunto buscado.
//   2. Las tarjetas se calculan sobre ESE conjunto (no sobre la página ni sobre
//      la tarjeta o el estado elegidos), así siguen comparando grupos.
//   3. Tarjeta + estado puntual → lo que muestra la tabla.
//   4. Orden: emisión descendente; empate, número descendente (numberKey).
// ============================================================================
import type { Invoice, InvoiceStatus, YmdDate } from '../../types/index';
import { AWAITING_STATUSES, PAID_STATUSES, isOverdue, isPaidStatus } from './invoiceStatus';

/** Tarjeta del resumen (y grupo de la tabla). */
export type InvoiceCardKey = 'total' | 'paid' | 'awaiting' | 'overdue';

/** Campo de fecha del filtro de rango. */
export type InvoiceDateField = 'issueDate' | 'dueDate';

/** Rango de fechas: extremos inclusivos; '' = sin límite de ese lado. */
export interface InvoiceDateRange {
  field: InvoiceDateField;
  from: YmdDate;
  to: YmdDate;
}

export interface InvoiceCardSummary {
  count: number;
  totalCents: number;
}

export interface InvoiceSummary {
  total: InvoiceCardSummary;
  paid: InvoiceCardSummary;
  /** Parte de Paid que llegó por Stripe. */
  paidViaStripe: InvoiceCardSummary;
  awaiting: InvoiceCardSummary;
  overdue: InvoiceCardSummary;
}

export const ALL_DATES: InvoiceDateRange = { field: 'issueDate', from: '', to: '' };

const matchesSearch = (invoice: Invoice, normalizedSearch: string): boolean =>
  !normalizedSearch || invoice.searchText.includes(normalizedSearch);

const matchesDateRange = (invoice: Invoice, dateRange: InvoiceDateRange): boolean => {
  const value = invoice[dateRange.field];
  if (dateRange.from && value < dateRange.from) return false;
  if (dateRange.to && value > dateRange.to) return false;
  return true;
};

/** Paso 1: el conjunto buscado (búsqueda sin mayúsculas + rango de fechas). */
export const filterBySearchAndDates = (invoices: readonly Invoice[], search: string, dateRange: InvoiceDateRange): Invoice[] => {
  const normalizedSearch = search.trim().toLowerCase();
  return invoices.filter((invoice) => matchesSearch(invoice, normalizedSearch) && matchesDateRange(invoice, dateRange));
};

const sumCards = (invoices: readonly Invoice[]): InvoiceCardSummary => ({
  count: invoices.length,
  totalCents: invoices.reduce((total, invoice) => total + invoice.totalCents, 0),
});

/** Paso 2: las cuatro tarjetas. Overdue ya está dentro de Awaiting: no se suma otra vez. */
export const summarizeInvoices = (invoices: readonly Invoice[], today: YmdDate): InvoiceSummary => ({
  total: sumCards(invoices),
  paid: sumCards(invoices.filter((invoice) => isPaidStatus(invoice.status))),
  paidViaStripe: sumCards(invoices.filter((invoice) => invoice.status === 'paid_via_stripe')),
  awaiting: sumCards(invoices.filter((invoice) => AWAITING_STATUSES.includes(invoice.status))),
  overdue: sumCards(invoices.filter((invoice) => isOverdue(invoice, today))),
});

const matchesCard = (invoice: Invoice, card: InvoiceCardKey, today: YmdDate): boolean => {
  if (card === 'paid') return PAID_STATUSES.includes(invoice.status);
  if (card === 'awaiting') return AWAITING_STATUSES.includes(invoice.status);
  if (card === 'overdue') return isOverdue(invoice, today);
  return true;
};

const compareByIssueDateDesc = (invoiceA: Invoice, invoiceB: Invoice): number =>
  invoiceB.issueDate.localeCompare(invoiceA.issueDate) || invoiceB.numberKey - invoiceA.numberKey;

/** Pasos 3 y 4: lo que muestra la tabla, ya ordenado. */
export const filterByCardAndStatus = (
  invoices: readonly Invoice[], card: InvoiceCardKey, status: InvoiceStatus | 'all', today: YmdDate,
): Invoice[] =>
  invoices
    .filter((invoice) => matchesCard(invoice, card, today) && (status === 'all' || invoice.status === status))
    .sort(compareByIssueDateDesc);

/** Tarjeta que corresponde a un estado puntual (al elegirlo en el filtro). */
export const cardForStatus = (status: InvoiceStatus): InvoiceCardKey =>
  (isPaidStatus(status) ? 'paid' : 'awaiting');
