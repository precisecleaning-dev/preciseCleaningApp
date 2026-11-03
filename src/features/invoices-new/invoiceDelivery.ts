// src/features/invoices-new/invoiceDelivery.ts
// ============================================================================
// Envío por correo de un invoice: patrones, validación de las opciones y el
// texto del resultado. Lo usan el formulario, Send / Resend y el service. La
// Cloud Function sendinvoiceemail (functions/src/invoiceEmailContent.ts)
// repite los patrones en el servidor: si cambian aquí, cambian allá y en
// security/firestore.rules.
// ============================================================================
import type { InvoiceDeliveryChoice, InvoiceDeliveryOutcome } from '../../types/index';

/** Correo de un destinatario: un solo @, sin espacios. */
export const INVOICE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Payment Link creado a mano en el panel de Stripe. Solo se aceptan enlaces
 *  de Stripe: el enlace va en un correo a un cliente. */
export const STRIPE_PAYMENT_LINK_PATTERN = /^https:\/\/buy\.stripe\.com\/\S+$/;
export const STRIPE_PAYMENT_LINK_PLACEHOLDER = 'https://buy.stripe.com/...';

/** Peso máximo del PDF adjunto (Gmail acepta 25 MB por correo, contando la
 *  codificación del adjunto). Igual en functions/src/invoiceEmail.ts. */
export const MAX_INVOICE_PDF_BYTES = 18 * 1024 * 1024;

/**
 * Enlace de pago con la referencia del invoice. Stripe copia
 * `client_reference_id` al pago, y así el webhook sabe qué invoice se pagó
 * aunque el mismo Payment Link se use para varios. El correo agrega además
 * `prefilled_email` (functions/src/invoiceEmailContent.ts → buildPaymentUrl).
 * Si el enlace no es una URL válida, se devuelve tal cual.
 */
export const buildStripePaymentUrl = (paymentLinkUrl: string, invoiceId: string): string => {
  try {
    const url = new URL(paymentLinkUrl);
    url.searchParams.set('client_reference_id', invoiceId);
    return url.toString();
  } catch {
    return paymentLinkUrl;
  }
};

export type InvoiceDeliveryErrors = Partial<Record<'options' | 'recipientEmail' | 'paymentLinkUrl', string>>;

export const isDeliveryRequested = (choice: InvoiceDeliveryChoice): boolean => choice.sendPdf || choice.sendPaymentLink;

/**
 * Errores de las opciones de envío. `requireOption`: Send / Resend pide al
 * menos una (en el formulario, no mandar nada es válido).
 */
export const getDeliveryErrors = (choice: InvoiceDeliveryChoice, requireOption: boolean): InvoiceDeliveryErrors => {
  const deliveryErrors: InvoiceDeliveryErrors = {};
  if (requireOption && !isDeliveryRequested(choice)) {
    deliveryErrors.options = 'Choose what to send: the PDF, the payment link or both.';
  }
  if (isDeliveryRequested(choice) && !INVOICE_EMAIL_PATTERN.test(choice.recipientEmail.trim())) {
    deliveryErrors.recipientEmail = 'Enter a valid client email.';
  }
  if (choice.sendPaymentLink && !STRIPE_PAYMENT_LINK_PATTERN.test(choice.paymentLinkUrl.trim())) {
    deliveryErrors.paymentLinkUrl = `Paste the Stripe payment link (${STRIPE_PAYMENT_LINK_PLACEHOLDER}).`;
  }
  return deliveryErrors;
};

/** Aviso de fotos que no entraron en el PDF (también lo usa la descarga). */
export const getMissingPhotosWarning = (missingPhotoCount: number): string =>
  `${missingPhotoCount} photo(s) could not be added to the PDF: their storage does not allow the app to read them (CORS).`;

/** Texto del resultado de un envío y si es un problema (aviso en rojo). */
export const describeDeliveryOutcome = (outcome: InvoiceDeliveryOutcome): { text: string; isProblem: boolean } => {
  if (outcome.status === 'failed') {
    return { text: `The email was not sent. ${outcome.message} Use Send Invoice to try again.`, isProblem: true };
  }
  if (outcome.missingPhotoCount > 0) {
    return { text: `Emailed to ${outcome.to}. ${getMissingPhotosWarning(outcome.missingPhotoCount)}`, isProblem: true };
  }
  return { text: `Emailed to ${outcome.to}.`, isProblem: false };
};
