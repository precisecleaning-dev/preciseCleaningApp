// src/features/invoices-new/invoiceLimits.ts
// ============================================================================
// Límites de Invoices New y las validaciones que comparten el formulario y el
// service (la última barrera), sin Firestore ni React: así el formulario y el
// service dan el MISMO mensaje. Los límites de texto y de listas también los
// repiten las reglas (security/firestore.rules): si cambia uno, cambia allá.
// ============================================================================
import type { InvoiceFeeInput, InvoiceLineItem } from '../../types/index';

export const INVOICE_LIMITS = {
  noteText: 3000,
  paymentReference: 160,
  paymentNote: 1500,
  maxNotes: 20,
  maxTaxRateBps: 10000,
  maxLineItems: 50,
  maxFees: 10,
  feeLabel: 60,
  deletionReason: 300,
  /** Los mismos de las reglas: pasarlos daría un permission-denied sin mensaje. */
  recipientEmail: 254,
  paymentLinkUrl: 2000,
  searchText: 1000,
  photoItems: 1000,
} as const;

/** Problema de los fees (null = están bien): cantidad, nombre y porcentaje. */
export const getFeesProblem = (fees: readonly InvoiceFeeInput[]): string | null => {
  if (fees.length > INVOICE_LIMITS.maxFees) return `An invoice can have up to ${INVOICE_LIMITS.maxFees} fees.`;
  if (fees.some((fee) => !fee.label.trim() || fee.label.trim().length > INVOICE_LIMITS.feeLabel)) {
    return `Give each fee a name (up to ${INVOICE_LIMITS.feeLabel} characters).`;
  }
  const hasInvalidRate = fees.some(
    (fee) => !Number.isInteger(fee.rateBps) || fee.rateBps < 1 || fee.rateBps > INVOICE_LIMITS.maxTaxRateBps,
  );
  if (hasInvalidRate) return 'Enter each fee as a percentage between 0.01 and 100, with up to two decimals.';
  return null;
};

/** Problema de los servicios copiados del job (null = están bien). */
export const getLineItemsProblem = (lineItems: readonly InvoiceLineItem[]): string | null => {
  if (lineItems.length === 0) return 'This job has no services. Add them in the job first.';
  if (lineItems.length > INVOICE_LIMITS.maxLineItems) return `An invoice can have up to ${INVOICE_LIMITS.maxLineItems} services.`;
  const hasInvalidLine = lineItems.some(
    (lineItem) => ![lineItem.amountCents, lineItem.taxCents, lineItem.taxRateBps, lineItem.unitPriceCents].every(Number.isInteger)
      || lineItem.taxCents < 0,
  );
  return hasInvalidLine ? 'A service of the job has an invalid amount. Check it in the job.' : null;
};
