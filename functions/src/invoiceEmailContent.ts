/* ============================================================================
   CONTENIDO DEL CORREO DE UN INVOICE (Invoices New)
   ----------------------------------------------------------------------------
   Funciones puras: arman asunto, HTML y texto del correo que manda
   `sendinvoiceemail` (invoiceEmail.ts). Todo texto que viene de la base de
   datos pasa por escapeHtml (nombre del cliente, de la empresa, enlaces...).
   Fechas en MM/DD/YYYY y montos en dólares (los invoices guardan centavos).
   ============================================================================ */

/** Correo de un destinatario (mismo patrón que la app: un solo @, sin espacios). */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Payment Link creado a mano en el panel de Stripe. */
export const STRIPE_PAYMENT_LINK_PATTERN = /^https:\/\/buy\.stripe\.com\/\S+$/;

export const isValidRecipient = (email: string): boolean => email.length <= 254 && EMAIL_PATTERN.test(email);

export const isStripePaymentLink = (url: string): boolean => STRIPE_PAYMENT_LINK_PATTERN.test(url);

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** "2026-11-17" → "11/17/2026" (regla del negocio: MM/DD/YYYY). */
export const formatYmd = (ymd: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : ymd;
};

export const formatCents = (cents: number): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/**
 * Enlace de pago con la referencia del invoice. Stripe copia
 * `client_reference_id` al pago (checkout.session), y así el webhook sabe qué
 * invoice se pagó aunque el mismo Payment Link se use para varios invoices.
 * `prefilled_email` deja el correo del cliente ya escrito en el formulario.
 */
export const buildPaymentUrl = (paymentLinkUrl: string, invoiceId: string, recipientEmail: string): string => {
  const url = new URL(paymentLinkUrl);
  url.searchParams.set("client_reference_id", invoiceId);
  url.searchParams.set("prefilled_email", recipientEmail);
  return url.toString();
};

export interface InvoiceEmailCompany {
  name: string;
  email: string;
  phone: string;
  address: string;
}

export interface InvoiceEmailInput {
  number: string;
  clientName: string;
  totalCents: number;
  dueDate: string;
  isPaid: boolean;
  includePdf: boolean;
  /** URL ya con la referencia del invoice (buildPaymentUrl); null = sin enlace. */
  paymentUrl: string | null;
  company: InvoiceEmailCompany;
}

export interface InvoiceEmailContent {
  subject: string;
  html: string;
  text: string;
}

/** Asunto, HTML y texto del correo. */
export const buildInvoiceEmail = (input: InvoiceEmailInput): InvoiceEmailContent => {
  const companyName = input.company.name.trim() || "Precise Cleaning";
  const total = formatCents(input.totalCents);
  const dueDate = formatYmd(input.dueDate);
  const greeting = input.clientName.trim() ? `Hello ${input.clientName.trim()},` : "Hello,";
  const invoiceLine = input.isPaid
    ? `Invoice ${input.number} for ${total} is paid. Thank you!`
    : `Invoice ${input.number} for ${total} is due on ${dueDate}.`;
  const attachmentLine = input.includePdf ? "The invoice is attached to this email as a PDF." : "";
  const paymentLine = input.paymentUrl ? "You can pay it online with a card using the secure Stripe link below." : "";
  const contactParts = [input.company.phone, input.company.email].map((part) => part.trim()).filter(Boolean);
  const contactLine = contactParts.length > 0
    ? `If you have any questions, reply to this email or contact us at ${contactParts.join(" · ")}.`
    : "If you have any questions, reply to this email.";
  const bodyLines = [invoiceLine, attachmentLine, paymentLine].filter(Boolean);

  const paragraphStyle = "margin:0 0 14px;font-size:15px;line-height:1.5;color:#0f172a;";
  const paymentButton = input.paymentUrl
    ? `<p style="margin:22px 0;"><a href="${escapeHtml(input.paymentUrl)}" style="background:#1d3fcf;border-radius:8px;color:#ffffff;display:inline-block;font-size:15px;font-weight:700;padding:12px 22px;text-decoration:none;">Pay ${escapeHtml(total)}</a></p>
       <p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#64748b;">If the button does not work, copy this link into your browser:<br><a href="${escapeHtml(input.paymentUrl)}" style="color:#1d3fcf;word-break:break-all;">${escapeHtml(input.paymentUrl)}</a></p>`
    : "";
  const footer = [companyName, input.company.address.trim()].filter(Boolean).map(escapeHtml).join(" · ");

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
    <p style="margin:0 0 18px;font-size:18px;font-weight:700;color:#1e3a8a;">${escapeHtml(companyName)}</p>
    <p style="${paragraphStyle}">${escapeHtml(greeting)}</p>
    ${bodyLines.map((line) => `<p style="${paragraphStyle}">${escapeHtml(line)}</p>`).join("\n    ")}
    ${paymentButton}
    <p style="${paragraphStyle}">${escapeHtml(contactLine)}</p>
    <p style="margin:0;font-size:15px;line-height:1.5;color:#0f172a;">Thank you,<br>${escapeHtml(companyName)}</p>
  </div>
  <p style="max-width:560px;margin:14px auto 0;font-size:11px;color:#94a3b8;text-align:center;">${footer}</p>
</body></html>`;

  const text = [
    greeting,
    "",
    ...bodyLines,
    ...(input.paymentUrl ? ["", `Pay online: ${input.paymentUrl}`] : []),
    "",
    contactLine,
    "",
    "Thank you,",
    companyName,
  ].join("\n");

  return {
    subject: `Invoice ${input.number} from ${companyName}`.replace(/[\r\n]+/g, " "),
    html,
    text,
  };
};
