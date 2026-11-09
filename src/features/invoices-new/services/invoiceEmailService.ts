// src/features/invoices-new/services/invoiceEmailService.ts
// ============================================================================
// Send / Resend de un invoice por correo. El navegador genera el PDF (igual que
// "Download PDF"), lo sube a Storage con un nombre nuevo en cada envío (dos
// envíos a la vez no se cruzan; la función lo borra al terminar) y llama a la
// Cloud Function `sendinvoiceemail` (functions/src/invoiceEmail.ts), que arma el correo con
// los datos del invoice en Firestore, lo manda por SMTP y registra el
// resultado (delivery, Activity y Payment Link Sent). El navegador no escribe
// nada de eso.
// ============================================================================
import { ref, uploadBytes } from 'firebase/storage';
import type { InvoiceSendRequest, SendInvoiceEmailInput } from '../../../types/index';
import { storage } from '../../../config/storage';
import { callable } from '../../../config/functions';
import { logActivity } from '../../../services/activityLogService';
import { createSavedInvoicePdfFile } from '../invoicePdfFile';
import { MAX_INVOICE_PDF_BYTES } from '../invoiceDelivery';
import { INVOICES_NEW_MODULE } from '../invoicesNewPermissions';

/** Dónde se deja el PDF de un envío (la función solo acepta esta carpeta). */
const invoiceEmailPdfPath = (invoiceId: string): string => `invoices/${invoiceId}/email/${crypto.randomUUID()}.pdf`;

/** La función puede tardar hasta 120 s (SMTP lento): la app espera un poco más,
 *  para no mostrar un error de un correo que sí salió. */
const SEND_TIMEOUT_MS = 130_000;

/** Mensajes genéricos de Firebase que no le dicen nada al usuario. */
const GENERIC_CALLABLE_MESSAGES = ['internal', 'not-found', 'not_found', 'unavailable', 'deadline-exceeded'];

const toSendErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message.trim() : '';
  if (!message || GENERIC_CALLABLE_MESSAGES.includes(message.toLowerCase())) {
    return 'Could not reach the email service. Check your connection and try again.';
  }
  return message;
};

/**
 * Manda el invoice por correo. Lanza un Error con un mensaje para el usuario
 * si no se pudo (PDF demasiado grande, sin conexión, SMTP...). Devuelve las
 * fotos que no entraron en el PDF.
 */
export const sendInvoiceEmail = async (input: SendInvoiceEmailInput): Promise<{ missingPhotoCount: number }> => {
  let missingPhotoCount = 0;
  let pdfPath: string | null = null;
  if (input.includePdf) {
    const pdfFile = await createSavedInvoicePdfFile(input.invoice, input.jobProperty);
    if (pdfFile.blob.size > MAX_INVOICE_PDF_BYTES) {
      const sizeInMegabytes = (pdfFile.blob.size / (1024 * 1024)).toFixed(1);
      throw new Error(`The PDF is too large to email (${sizeInMegabytes} MB). Choose fewer photos and try again.`);
    }
    pdfPath = invoiceEmailPdfPath(input.invoice.id);
    await uploadBytes(ref(storage, pdfPath), pdfFile.blob, { contentType: 'application/pdf' });
    missingPhotoCount = pdfFile.missingPhotoCount;
  }

  const request: InvoiceSendRequest = {
    invoiceId: input.invoice.id,
    to: input.to.trim(),
    includePdf: input.includePdf,
    includePaymentLink: input.includePaymentLink,
    pdfPath,
  };
  try {
    const sendInvoice = await callable('sendinvoiceemail', { timeout: SEND_TIMEOUT_MS });
    await sendInvoice(request);
  } catch (error) {
    console.error('sendinvoiceemail failed:', error);
    throw new Error(toSendErrorMessage(error));
  }

  // Sin correo ni montos: activity_logs lo lee cualquier usuario activo.
  void logActivity({
    action: 'update', module: INVOICES_NEW_MODULE, user: input.actor, targetId: input.invoice.id,
    targetLabel: input.invoice.number, detail: 'Invoice emailed',
  });
  return { missingPhotoCount };
};
