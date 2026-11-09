// src/features/invoices-new/clientAccount.ts
// ============================================================================
// Cuenta del cliente (Client account), sin React: de quién es la cuenta, sus
// tarjetas, sus invoices filtrados y sus pagos. Los invoices llegan de
// invoicesService.subscribeByClient (todos los del cliente, de cualquier fecha).
// ============================================================================
import type {
  ClientAccountCardKey, ClientAccountKey, ClientAccountPayment, ClientAccountSummary, ClientAccountSummaryKey, Invoice,
  InvoiceClientSnapshot, InvoiceDisplayStatus, YmdDate,
} from '../../types/index';
import { compareByIssueDateDesc, sumCards, summarizeInvoices } from './invoiceFilters';
import { getDisplayStatus, isPaidStatus } from './invoiceStatus';

/** La cuenta del cliente de un invoice. */
export const getClientAccountKey = (invoice: Invoice): ClientAccountKey => ({
  customerId: invoice.client.customerId,
  clientRef: invoice.client.clientRef,
  name: invoice.client.name,
});

/** Datos de contacto: los del invoice más reciente (el cliente se copia al crear). */
export const getClientContact = (invoices: readonly Invoice[]): InvoiceClientSnapshot | null =>
  [...invoices].sort(compareByIssueDateDesc)[0]?.client ?? null;

/** Tarjetas de la cuenta: las de la lista (Outstanding, Overdue, In Draft) más Paid. */
export const summarizeClientAccount = (invoices: readonly Invoice[], today: YmdDate): ClientAccountSummary => ({
  ...summarizeInvoices(invoices, today),
  paid: sumCards(invoices.filter((invoice) => isPaidStatus(invoice.status))),
});

const CARD_STATUSES: Record<ClientAccountSummaryKey, readonly InvoiceDisplayStatus[]> = {
  outstanding: ['pending', 'payment_link_sent', 'overdue'],
  overdue: ['overdue'],
  paid: ['paid', 'paid_via_stripe'],
  draft: ['needs_invoice'],
};

/** Tarjeta que corresponde a un estado puntual (al elegirlo en el filtro). */
export const clientCardForStatus = (status: InvoiceDisplayStatus): ClientAccountCardKey => {
  if (status === 'deleted') return 'all';
  if (status === 'overdue') return 'overdue';
  if (status === 'needs_invoice') return 'draft';
  if (status === 'paid' || status === 'paid_via_stripe') return 'paid';
  return 'outstanding';
};

/** Invoices de la pestaña Invoices: tarjeta + estado puntual (el que se ve), en el orden de la lista. */
export const filterClientInvoices = (
  invoices: readonly Invoice[], card: ClientAccountCardKey, status: InvoiceDisplayStatus | 'all', today: YmdDate,
): Invoice[] =>
  invoices
    .filter((invoice) => {
      const displayStatus = getDisplayStatus(invoice, today);
      const matchesCard = card === 'all' || CARD_STATUSES[card].includes(displayStatus);
      return matchesCard && (status === 'all' || displayStatus === status);
    })
    .sort(compareByIssueDateDesc);

/** Pagos del cliente (manuales y de Stripe), el más reciente primero. */
export const getClientPayments = (invoices: readonly Invoice[]): ClientAccountPayment[] =>
  invoices
    .flatMap((invoice) => (invoice.payment ? [{ invoice, payment: invoice.payment }] : []))
    .sort((paymentA, paymentB) => paymentB.payment.paidDate.localeCompare(paymentA.payment.paidDate)
      || paymentB.invoice.numberKey - paymentA.invoice.numberKey);
