// src/features/invoices-new/invoiceStatus.ts
// ============================================================================
// Estados de pago de Invoices New y la condición Overdue, que NO es un estado:
// se calcula con el pago y el vencimiento (nunca se guarda).
// ============================================================================
import type { Invoice, InvoiceStatus, YmdDate } from '../../types/index';
import { daysBetween } from './invoiceMath';

/** Etiqueta de cada estado en la pantalla (inglés, como el resto de la UI). */
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  awaiting_payment: 'Awaiting Payment',
  payment_link_sent: 'Payment Link Sent',
  paid: 'Paid',
  paid_via_stripe: 'Paid via Stripe',
};

/** Explicación de cada estado bajo el selector del formulario. */
export const INVOICE_STATUS_DESCRIPTIONS: Record<InvoiceStatus, string> = {
  awaiting_payment: 'Payment has not been received yet.',
  payment_link_sent: 'A Stripe payment link was emailed. Set automatically.',
  paid: 'The full payment was received outside Stripe.',
  paid_via_stripe: 'Payment confirmed by Stripe. Set automatically.',
};

/** Estados de las tarjetas Paid y Awaiting Payment. */
export const PAID_STATUSES: readonly InvoiceStatus[] = ['paid', 'paid_via_stripe'];
export const AWAITING_STATUSES: readonly InvoiceStatus[] = ['awaiting_payment', 'payment_link_sent'];

/** Estados que el usuario puede elegir al crear. Los otros dos los pone el
 *  servidor (envío del enlace y webhook de Stripe). */
export const CLIENT_SETTABLE_STATUSES: readonly InvoiceStatus[] = ['awaiting_payment', 'paid'];

export const isPaidStatus = (status: InvoiceStatus): boolean => PAID_STATUSES.includes(status);

/** Vencido = sin pagar y con vencimiento ANTES de hoy (vence hoy: todavía no). */
export const isOverdue = (invoice: Pick<Invoice, 'status' | 'dueDate'>, today: YmdDate): boolean =>
  !isPaidStatus(invoice.status) && invoice.dueDate < today;

/** Días de atraso (0 si no está vencido). */
export const getLateDays = (invoice: Pick<Invoice, 'status' | 'dueDate'>, today: YmdDate): number =>
  isOverdue(invoice, today) ? daysBetween(invoice.dueDate, today) : 0;

/** Saldo pendiente en centavos: el total si no está pagado, 0 si lo está. */
export const getBalanceCents = (invoice: Pick<Invoice, 'status' | 'totalCents'>): number =>
  isPaidStatus(invoice.status) ? 0 : invoice.totalCents;
