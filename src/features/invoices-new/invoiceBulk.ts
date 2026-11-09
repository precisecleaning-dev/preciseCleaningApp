// src/features/invoices-new/invoiceBulk.ts
// ============================================================================
// Acciones en bloque de la tabla (Mark as Paid y Send invoice sobre los
// invoices marcados), sin React: qué se puede hacer con cada invoice antes de
// empezar y el texto del resultado. Las escrituras están en
// services/invoiceBulkService.ts.
// ============================================================================
import type {
  BulkPaymentPlan, BulkSendOptions, BulkSendPlan, Invoice, InvoiceBulkIssue, InvoiceBulkResult, InvoiceBulkSendItem,
} from '../../types/index';
import { isPaidStatus } from './invoiceStatus';
import { INVOICE_EMAIL_PATTERN, STRIPE_PAYMENT_LINK_PATTERN } from './invoiceDelivery';

/** Máximo de invoices por envío en bloque: cada uno arma su PDF en el navegador
 *  (unos segundos cada uno) y la pantalla debe quedarse abierta (decisión de Omar). */
export const MAX_BULK_SEND = 20;

/** Correo al que va un invoice: el guardado o, si no tiene, el de su cliente. */
export const getInvoiceRecipientEmail = (invoice: Invoice): string =>
  (invoice.recipientEmail || invoice.client.email).trim();

/** Qué hace Mark as Paid en bloque con cada invoice marcado. */
export const planBulkPayment = (invoices: readonly Invoice[]): BulkPaymentPlan => {
  const unpaidInvoices = invoices.filter((invoice) => !isPaidStatus(invoice.status));
  return {
    unpaidInvoices,
    skipped: invoices
      .filter((invoice) => isPaidStatus(invoice.status))
      .map((invoice) => ({ invoice, reason: 'Already paid' })),
    totalCents: unpaidInvoices.reduce((total, invoice) => total + invoice.totalCents, 0),
    latestIssueDate: unpaidInvoices.reduce((latest, invoice) => (invoice.issueDate > latest ? invoice.issueDate : latest), ''),
  };
};

/** Por qué no se puede mandar un invoice con estas opciones (null = sí se puede). */
const getSendSkipReason = (invoice: Invoice, options: BulkSendOptions): string | null => {
  if (!INVOICE_EMAIL_PATTERN.test(getInvoiceRecipientEmail(invoice))) return 'No valid client email';
  const isPaid = isPaidStatus(invoice.status);
  if (options.sendPaymentLink && !isPaid && !STRIPE_PAYMENT_LINK_PATTERN.test(invoice.paymentLinkUrl)) {
    return 'No Stripe payment link';
  }
  if (!options.sendPdf && isPaid) return 'Paid: there is no payment link to send';
  return null;
};

/**
 * Qué manda Send invoice en bloque: cada invoice a su cliente, con el PDF y/o
 * el enlace de Stripe. A un invoice pagado nunca se le manda el enlace.
 */
export const planBulkSend = (invoices: readonly Invoice[], options: BulkSendOptions): BulkSendPlan => {
  const items: InvoiceBulkSendItem[] = [];
  const skipped: InvoiceBulkIssue[] = [];
  invoices.forEach((invoice) => {
    const skipReason = getSendSkipReason(invoice, options);
    if (skipReason) {
      skipped.push({ invoice, reason: skipReason });
      return;
    }
    items.push({
      invoice,
      to: getInvoiceRecipientEmail(invoice),
      includePdf: options.sendPdf,
      includePaymentLink: options.sendPaymentLink && !isPaidStatus(invoice.status),
    });
  });
  return { items, skipped };
};

/** Aviso de la página al terminar: "5 invoices marked as paid. 1 skipped." */
export const describeBulkResult = (actionText: string, result: InvoiceBulkResult): { text: string; isProblem: boolean } => {
  const doneCount = result.doneInvoices.length;
  const doneText = `${doneCount} ${doneCount === 1 ? 'invoice' : 'invoices'} ${actionText}.`;
  const issueTexts = [
    result.skipped.length > 0 ? `${result.skipped.length} skipped` : '',
    result.failed.length > 0 ? `${result.failed.length} failed` : '',
  ].filter(Boolean);
  return {
    text: issueTexts.length > 0 ? `${doneText} ${issueTexts.join(', ')}.` : doneText,
    isProblem: result.failed.length > 0,
  };
};
