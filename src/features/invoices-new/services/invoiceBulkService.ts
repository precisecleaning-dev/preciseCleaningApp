// src/features/invoices-new/services/invoiceBulkService.ts
// ============================================================================
// Mark as Paid, Send invoice y Delete en bloque. Cada invoice va por SU camino
// de siempre (recordManualPayment / sendInvoiceEmail / moveToTrash), uno tras otro: si uno
// falla, los demás siguen, y el resultado dice cuáles no se hicieron. No es un
// todo-o-nada a propósito: un invoice que otra persona pagó en ese momento no
// debe impedir registrar los demás.
// ============================================================================
import type {
  Actor, Invoice, InvoiceBulkResult, InvoiceBulkSendItem, InvoiceManualPaymentInput, Property,
} from '../../../types/index';
import {
  InvoiceAlreadyPaidError, InvoicePaidCannotBeDeletedError, invoicesService,
} from '../../../services/invoicesService';
import { sendInvoiceEmail } from './invoiceEmailService';

/** Avance: cuántos van de cuántos. */
export type BulkProgressHandler = (doneCount: number, totalCount: number) => void;

const toReason = (error: unknown, fallback: string): string =>
  (error instanceof Error && error.message ? error.message : fallback);

/** Registra el MISMO pago (método, fecha, referencia, nota) en cada invoice, con su propio total. */
export const recordPaymentsInBulk = async (
  invoices: readonly Invoice[],
  payment: InvoiceManualPaymentInput,
  actor: Actor,
  onProgress: BulkProgressHandler,
): Promise<InvoiceBulkResult> => {
  const result: InvoiceBulkResult = { doneInvoices: [], skipped: [], failed: [] };
  for (const [invoiceIndex, invoice] of invoices.entries()) {
    try {
      await invoicesService.recordManualPayment(invoice.id, payment, actor);
      result.doneInvoices.push(invoice);
    } catch (error) {
      console.error(`Could not record the payment of ${invoice.number}:`, error);
      if (error instanceof InvoiceAlreadyPaidError) result.skipped.push({ invoice, reason: 'Already paid' });
      else result.failed.push({ invoice, reason: toReason(error, 'Could not record the payment.') });
    }
    onProgress(invoiceIndex + 1, invoices.length);
  }
  return result;
};

/** Manda cada invoice a la papelera con el MISMO motivo. Un pagado se salta. */
export const deleteInvoicesInBulk = async (
  invoices: readonly Invoice[],
  reason: string,
  actor: Actor,
  onProgress: BulkProgressHandler,
): Promise<InvoiceBulkResult> => {
  const result: InvoiceBulkResult = { doneInvoices: [], skipped: [], failed: [] };
  for (const [invoiceIndex, invoice] of invoices.entries()) {
    try {
      await invoicesService.moveToTrash(invoice.id, reason, actor);
      result.doneInvoices.push(invoice);
    } catch (error) {
      console.error(`Could not delete ${invoice.number}:`, error);
      if (error instanceof InvoicePaidCannotBeDeletedError) result.skipped.push({ invoice, reason: 'Paid' });
      else result.failed.push({ invoice, reason: toReason(error, 'Could not delete the invoice.') });
    }
    onProgress(invoiceIndex + 1, invoices.length);
  }
  return result;
};

/** Restore (o Undo de Delete): saca cada invoice de la papelera. */
export const restoreInvoices = async (invoices: readonly Invoice[], actor: Actor): Promise<InvoiceBulkResult> => {
  const result: InvoiceBulkResult = { doneInvoices: [], skipped: [], failed: [] };
  for (const invoice of invoices) {
    try {
      await invoicesService.restore(invoice.id, actor);
      result.doneInvoices.push(invoice);
    } catch (error) {
      console.error(`Could not restore ${invoice.number}:`, error);
      result.failed.push({ invoice, reason: toReason(error, 'Could not restore the invoice.') });
    }
  }
  return result;
};

/**
 * Manda cada invoice a su cliente. Si el invoice no tenía guardado ese correo,
 * se guarda antes (como en Send Invoice: queda en su Activity).
 */
export const sendInvoicesInBulk = async (
  items: readonly InvoiceBulkSendItem[],
  findJobProperty: (invoice: Invoice) => Property | null,
  actor: Actor,
  onProgress: BulkProgressHandler,
): Promise<InvoiceBulkResult> => {
  const result: InvoiceBulkResult = { doneInvoices: [], skipped: [], failed: [] };
  for (const [itemIndex, item] of items.entries()) {
    try {
      const invoiceToSend = item.to === item.invoice.recipientEmail
        ? item.invoice
        : { ...item.invoice, recipientEmail: item.to };
      if (invoiceToSend !== item.invoice) {
        await invoicesService.update(item.invoice.id, { recipientEmail: item.to }, actor);
      }
      await sendInvoiceEmail({
        invoice: invoiceToSend,
        jobProperty: findJobProperty(item.invoice),
        to: item.to,
        includePdf: item.includePdf,
        includePaymentLink: item.includePaymentLink,
        actor,
      });
      result.doneInvoices.push(item.invoice);
    } catch (error) {
      console.error(`Could not email ${item.invoice.number}:`, error);
      result.failed.push({ invoice: item.invoice, reason: toReason(error, 'Could not send the invoice.') });
    }
    onProgress(itemIndex + 1, items.length);
  }
  return result;
};
