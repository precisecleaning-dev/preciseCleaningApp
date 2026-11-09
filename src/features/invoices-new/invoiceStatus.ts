// src/features/invoices-new/invoiceStatus.ts
// ============================================================================
// Estados de Invoices New: los mismos del módulo Invoices (Needs Invoice,
// Pending, Paid; sin Pre-Paid) más los dos automáticos de Stripe. Overdue NO
// se guarda: se calcula con el estado y el vencimiento, y se muestra como un
// estado más (badge, filtro y tarjeta).
// ============================================================================
import type { Invoice, InvoiceDisplayStatus, InvoiceManualStatus, InvoiceStatus, YmdDate } from '../../types/index';
import { daysBetween } from './invoiceMath';

/** Etiqueta de cada estado en la pantalla (inglés, como el resto de la UI). */
export const INVOICE_STATUS_LABELS: Record<InvoiceDisplayStatus, string> = {
  needs_invoice: 'Needs Invoice',
  pending: 'Pending',
  overdue: 'Overdue',
  payment_link_sent: 'Payment Link Sent',
  paid: 'Paid',
  paid_via_stripe: 'Paid via Stripe',
  deleted: 'Deleted',
};

/** Explicación de cada estado bajo el selector del formulario. */
export const INVOICE_STATUS_DESCRIPTIONS: Record<InvoiceDisplayStatus, string> = {
  needs_invoice: 'Draft: not sent to the client yet. Emailing it moves it to Pending.',
  pending: 'Sent to the client; payment has not been received yet.',
  overdue: 'Pending past its due date. Set automatically.',
  payment_link_sent: 'A Stripe payment link was emailed. Set automatically.',
  paid: 'The full payment was received outside Stripe.',
  paid_via_stripe: 'Payment confirmed by Stripe. Set automatically.',
  deleted: 'In the deleted invoices: it does not count in the totals. It can be restored.',
};

/** Orden del filtro de estado (sin Deleted: la lista lo agrega al final). */
export const INVOICE_DISPLAY_STATUSES: readonly InvoiceDisplayStatus[] = [
  'needs_invoice', 'pending', 'overdue', 'payment_link_sent', 'paid', 'paid_via_stripe',
];

export const PAID_STATUSES: readonly InvoiceStatus[] = ['paid', 'paid_via_stripe'];

/** Enviados y sin pagar: la tarjeta Total Outstanding (incluye los vencidos). */
export const OUTSTANDING_STATUSES: readonly InvoiceStatus[] = ['pending', 'payment_link_sent'];

/** Sin pagar, enviados o no: los que la lista trae aunque sean de hace más de 12 meses. */
export const UNPAID_STATUSES: readonly InvoiceStatus[] = ['needs_invoice', ...OUTSTANDING_STATUSES];

/** Estados que el usuario elige en Create / Edit. Los otros dos los pone el
 *  servidor (envío del enlace y webhook de Stripe). */
export const MANUAL_STATUSES: readonly InvoiceManualStatus[] = ['needs_invoice', 'pending', 'paid'];

export const isPaidStatus = (status: InvoiceStatus): boolean => PAID_STATUSES.includes(status);

export const isManualStatus = (status: InvoiceStatus): status is InvoiceManualStatus =>
  (MANUAL_STATUSES as readonly InvoiceStatus[]).includes(status);

/** ¿Está en la papelera? */
export const isDeletedInvoice = (invoice: Pick<Invoice, 'deletion'>): boolean => !!invoice.deletion;

/** Vencido = enviado, sin pagar y con vencimiento ANTES de hoy (vence hoy: todavía
 *  no). Un borrador (Needs Invoice) no vence: el cliente aún no lo recibe; uno
 *  en la papelera tampoco. */
export const isOverdue = (invoice: Pick<Invoice, 'status' | 'dueDate' | 'deletion'>, today: YmdDate): boolean =>
  !isDeletedInvoice(invoice) && OUTSTANDING_STATUSES.includes(invoice.status) && invoice.dueDate < today;

/** Estado que se muestra: Deleted si está en la papelera, Overdue si está
 *  vencido; si no, el guardado. */
export const getDisplayStatus = (
  invoice: Pick<Invoice, 'status' | 'dueDate' | 'deletion'>, today: YmdDate,
): InvoiceDisplayStatus => {
  if (isDeletedInvoice(invoice)) return 'deleted';
  return isOverdue(invoice, today) ? 'overdue' : invoice.status;
};

/** ¿Se puede mandar a la papelera? Nunca un pagado ni uno ya borrado. */
export const canMoveToTrash = (invoice: Pick<Invoice, 'status' | 'deletion'>): boolean =>
  !isPaidStatus(invoice.status) && !isDeletedInvoice(invoice);

/** Días de atraso (0 si no está vencido). */
export const getLateDays = (invoice: Pick<Invoice, 'status' | 'dueDate' | 'deletion'>, today: YmdDate): number =>
  isOverdue(invoice, today) ? daysBetween(invoice.dueDate, today) : 0;

/** Saldo pendiente en centavos: el total si no está pagado, 0 si lo está. */
export const getBalanceCents = (invoice: Pick<Invoice, 'status' | 'totalCents'>): number =>
  isPaidStatus(invoice.status) ? 0 : invoice.totalCents;

/**
 * Estados que se pueden elegir en Edit según el guardado: con el enlace de
 * Stripe enviado solo queda registrar el pago (volver a Pending perdería ese
 * dato); un invoice pagado no cambia de estado.
 */
export const getSelectableStatuses = (savedStatus: InvoiceStatus | null): readonly InvoiceManualStatus[] => {
  if (savedStatus && isPaidStatus(savedStatus)) return [];
  if (savedStatus === 'payment_link_sent') return ['paid'];
  return MANUAL_STATUSES;
};
