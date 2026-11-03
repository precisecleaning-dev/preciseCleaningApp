// src/features/invoices-new/invoicePayment.ts
// ============================================================================
// Pago manual (recibido fuera de Stripe): valores iniciales y validación. Lo
// usan el formulario (crear como Paid), Record payment (Mark as Paid) y el
// service (la misma validación, como última barrera).
// ============================================================================
import type { InvoiceManualMethod, InvoiceManualPaymentInput, YmdDate } from '../../types/index';
import { todayIso } from '../../utils/dateFormat';
import { INVOICE_LIMITS } from './invoiceLimits';

export const MANUAL_PAYMENT_METHODS: InvoiceManualMethod[] = ['Cash', 'Bank transfer', 'Check', 'Other'];

export const createEmptyManualPayment = (): InvoiceManualPaymentInput => ({
  method: 'Cash', paidDate: todayIso(), reference: '', note: '',
});

export type ManualPaymentErrors = Partial<Record<'paymentDate' | 'paymentReference' | 'paymentNote', string>>;

/** Errores de un pago manual: fecha (no futura ni antes de la emisión) y largos. */
export const getManualPaymentErrors = (payment: InvoiceManualPaymentInput, issueDate: YmdDate): ManualPaymentErrors => {
  const paymentErrors: ManualPaymentErrors = {};
  if (!payment.paidDate) paymentErrors.paymentDate = 'Enter the payment date.';
  else if (payment.paidDate > todayIso()) paymentErrors.paymentDate = 'The payment date cannot be in the future.';
  else if (issueDate && payment.paidDate < issueDate) paymentErrors.paymentDate = 'The payment date cannot be before the issue date.';
  if (payment.reference.length > INVOICE_LIMITS.paymentReference) {
    paymentErrors.paymentReference = `The reference can have up to ${INVOICE_LIMITS.paymentReference} characters.`;
  }
  if (payment.note.length > INVOICE_LIMITS.paymentNote) {
    paymentErrors.paymentNote = `The payment note can have up to ${INVOICE_LIMITS.paymentNote} characters.`;
  }
  return paymentErrors;
};
