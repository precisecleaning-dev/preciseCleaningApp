// src/features/invoices-new/invoiceFilters.ts
// ============================================================================
// Filtros, tarjetas y orden de la lista de Invoices New, sin React.
//
//   1. Búsqueda + rango de fechas → el conjunto buscado.
//   2. Las tarjetas se calculan sobre ESE conjunto (no sobre la página ni sobre
//      la tarjeta o el estado elegidos), así siguen comparando grupos.
//   3. Tarjeta + estado puntual → lo que muestra la tabla. 'all' = ninguna
//      tarjeta elegida (tocar la tarjeta elegida la quita).
//   4. Orden: emisión descendente; empate, número descendente (numberKey).
// El estado puntual es el que se ve (getDisplayStatus): Pending deja fuera los
// vencidos, que se filtran con Overdue.
// ============================================================================
import type {
  Invoice, InvoiceCardKey, InvoiceCardSummary, InvoiceDateRange, InvoiceDisplayStatus, InvoiceSummary, YmdDate,
} from '../../types/index';
import { OUTSTANDING_STATUSES, getDisplayStatus, isOverdue } from './invoiceStatus';

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

export const sumCards = (invoices: readonly Invoice[]): InvoiceCardSummary => ({
  count: invoices.length,
  totalCents: invoices.reduce((total, invoice) => total + invoice.totalCents, 0),
});

const matchesCard = (invoice: Invoice, card: InvoiceCardKey, today: YmdDate): boolean => {
  if (card === 'overdue') return isOverdue(invoice, today);
  if (card === 'outstanding') return OUTSTANDING_STATUSES.includes(invoice.status);
  if (card === 'draft') return invoice.status === 'needs_invoice';
  return true;
};

/** Paso 2: las tres tarjetas. Overdue ya está dentro de Outstanding: no se suma otra vez. */
export const summarizeInvoices = (invoices: readonly Invoice[], today: YmdDate): InvoiceSummary => ({
  overdue: sumCards(invoices.filter((invoice) => matchesCard(invoice, 'overdue', today))),
  outstanding: sumCards(invoices.filter((invoice) => matchesCard(invoice, 'outstanding', today))),
  draft: sumCards(invoices.filter((invoice) => matchesCard(invoice, 'draft', today))),
});

/** Orden de las listas: emisión descendente; empate, número descendente. */
export const compareByIssueDateDesc = (invoiceA: Invoice, invoiceB: Invoice): number =>
  invoiceB.issueDate.localeCompare(invoiceA.issueDate) || invoiceB.numberKey - invoiceA.numberKey;

/** Pasos 3 y 4: lo que muestra la tabla, ya ordenado. */
export const filterByCardAndStatus = (
  invoices: readonly Invoice[], card: InvoiceCardKey, status: InvoiceDisplayStatus | 'all', today: YmdDate,
): Invoice[] =>
  invoices
    .filter((invoice) => matchesCard(invoice, card, today)
      && (status === 'all' || getDisplayStatus(invoice, today) === status))
    .sort(compareByIssueDateDesc);

/** Tarjeta que corresponde a un estado puntual (al elegirlo en el filtro);
 *  los pagados no tienen tarjeta. */
export const cardForStatus = (status: InvoiceDisplayStatus): InvoiceCardKey => {
  if (status === 'overdue') return 'overdue';
  if (status === 'needs_invoice') return 'draft';
  if (status === 'pending' || status === 'payment_link_sent') return 'outstanding';
  return 'all';
};
