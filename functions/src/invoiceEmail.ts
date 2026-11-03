/* ============================================================================
   sendinvoiceemail (callable) — Send / Resend de Invoices New
   ----------------------------------------------------------------------------
   Manda al cliente el invoice por correo: el PDF adjunto, el enlace de pago de
   Stripe, o los dos. Lo llama la app (features/invoices-new/services/
   invoiceEmailService.ts) DESPUÉS de subir el PDF a Storage, en
   `invoices/{invoiceId}/email/{uuid}.pdf`, un nombre nuevo por envío (el
   navegador lo genera igual que "Download PDF"). Al terminar, el PDF se borra.

   · Permiso: Edit en el módulo "Invoices New" (o Administrator), leído de
     system_users + settings_roles (no del espejo user_access).
   · Lo que se manda sale del invoice en Firestore (número, total, enlace),
     no de lo que diga el navegador.
   · SMTP: los secretos CREW_SMTP_* (los mismos de los correos del Task list de
     la app móvil). Los SMTP_* de esta web no se usan aquí.
   · Copia oculta (BCC) y Reply-To: el correo de la empresa
     (settings_company/main.email), para que las respuestas lleguen a la oficina.
   · Registro: `delivery` del invoice y eventos de Activity (delivery_requested,
     delivery_sent, delivery_failed). Un error NUNCA queda como enviado.
   · Enlace de pago enviado a un invoice sin pagar → "Payment Link Sent".
   · Candado: mientras un envío del mismo invoice está en proceso (3 min) no se
     acepta otro, así un doble clic no manda dos correos.
   ============================================================================ */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";
import { assertModuleAccess } from "./userAccess";
import {
  buildInvoiceEmail, buildPaymentUrl, isStripePaymentLink, isValidRecipient,
  type InvoiceEmailCompany,
} from "./invoiceEmailContent";

const CREW_SMTP_HOST = defineSecret("CREW_SMTP_HOST");
const CREW_SMTP_PORT = defineSecret("CREW_SMTP_PORT");
const CREW_SMTP_USER = defineSecret("CREW_SMTP_USER");
const CREW_SMTP_PASS = defineSecret("CREW_SMTP_PASS");
const CREW_SMTP_FROM = defineSecret("CREW_SMTP_FROM");

const MODULE_NAME = "Invoices New";
const DEFAULT_SMTP_PORT = 587;
/** Gmail acepta 25 MB por correo contando la codificación del adjunto (~33% más). */
const MAX_PDF_BYTES = 18 * 1024 * 1024;
const SENDING_LOCK_MS = 3 * 60 * 1000;
const INVOICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PAID_STATUSES = ["paid", "paid_via_stripe"];
const MAX_ERROR_LENGTH = 300;

/** El PDF de un envío solo puede estar en la carpeta de ese invoice (invoiceEmailService.ts). */
const isInvoicePdfPath = (invoiceId: string, pdfPath: string): boolean =>
  new RegExp(`^invoices/${invoiceId}/email/[A-Za-z0-9-]{1,64}\\.pdf$`).test(pdfPath);

const db = () => admin.firestore();

interface SendInvoiceRequest {
  invoiceId: string;
  to: string;
  includePdf: boolean;
  includePaymentLink: boolean;
  pdfPath: string | null;
}

/** Lo que este archivo lee de invoices/{id} (tipo completo: src/types/invoices.ts). */
interface InvoiceDoc {
  number: string;
  status: string;
  dueDate: string;
  totalCents: number;
  paymentLinkUrl?: string;
  client?: { name?: string };
  delivery?: { sendCount?: number; lastAt?: string | null; lastResult?: string | null };
}

interface Actor {
  id: string;
  name: string;
}

const parseRequest = (data: unknown): SendInvoiceRequest => {
  const input = (data ?? {}) as Partial<Record<keyof SendInvoiceRequest, unknown>>;
  const invoiceId = typeof input.invoiceId === "string" ? input.invoiceId : "";
  const to = typeof input.to === "string" ? input.to.trim() : "";
  const includePdf = input.includePdf === true;
  const includePaymentLink = input.includePaymentLink === true;
  const pdfPath = includePdf && typeof input.pdfPath === "string" ? input.pdfPath : null;
  if (!INVOICE_ID_PATTERN.test(invoiceId)) throw new HttpsError("invalid-argument", "The invoice id is not valid.");
  if (includePdf && (!pdfPath || !isInvoicePdfPath(invoiceId, pdfPath))) {
    throw new HttpsError("invalid-argument", "The invoice PDF was not uploaded. Try again.");
  }
  if (!isValidRecipient(to)) throw new HttpsError("invalid-argument", "Enter a valid client email.");
  if (!includePdf && !includePaymentLink) {
    throw new HttpsError("invalid-argument", "Choose what to send: the PDF, the payment link or both.");
  }
  return { invoiceId, to, includePdf, includePaymentLink, pdfPath };
};

/** Nombre de quien manda (system_users), para Activity. */
const getActor = async (userId: string): Promise<Actor> => {
  const snap = await db().doc(`system_users/${userId}`).get();
  const user = (snap.data() ?? {}) as { firstName?: string; lastName?: string; email?: string };
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || String(user.email ?? "").split("@")[0];
  return { id: userId, name: name || "Unknown" };
};

const getCompany = async (): Promise<InvoiceEmailCompany> => {
  const company = ((await db().doc("settings_company/main").get()).data() ?? {}) as Partial<InvoiceEmailCompany>;
  return {
    name: String(company.name ?? ""),
    email: String(company.email ?? "").trim(),
    phone: String(company.phone ?? ""),
    address: String(company.address ?? ""),
  };
};

const describeContent = (request: SendInvoiceRequest): string => {
  if (request.includePdf && request.includePaymentLink) return "PDF and payment link";
  return request.includePdf ? "PDF" : "payment link";
};

const writeEvent = (
  writer: admin.firestore.Transaction,
  invoiceId: string,
  actor: Actor,
  type: "delivery_requested" | "delivery_sent" | "delivery_failed",
  summary: string,
  changes: { field: string; before: string; after: string }[] = [],
): void => {
  const eventRef = db().collection(`invoices/${invoiceId}/events`).doc();
  writer.create(eventRef, {
    type,
    at: new Date().toISOString(),
    actorType: "user",
    actorUserId: actor.id,
    actorUserName: actor.name,
    summary: summary.slice(0, 500),
    changes,
  });
};

/** El PDF que subió la app (lanza un error claro si falta o pesa demasiado). */
const readPdf = async (pdfPath: string): Promise<Buffer> => {
  const file = admin.storage().bucket().file(pdfPath);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError("failed-precondition", "The invoice PDF was not uploaded. Try again.");
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size ?? 0) > MAX_PDF_BYTES) {
    throw new HttpsError("failed-precondition", "The PDF is too large to email. Choose fewer photos and try again.");
  }
  const [content] = await file.download();
  return content;
};

/** Borra el PDF del envío (ya va adjunto, o el envío falló): no queda en Storage. */
const deletePdf = async (pdfPath: string | null): Promise<void> => {
  if (!pdfPath) return;
  try {
    await admin.storage().bucket().file(pdfPath).delete({ ignoreNotFound: true });
  } catch (error) {
    logger.warn(`sendinvoiceemail: could not delete ${pdfPath}`, error);
  }
};

/** Paso 1: candado y registro del intento (transacción). Devuelve el invoice. */
const startDelivery = (request: SendInvoiceRequest, actor: Actor): Promise<InvoiceDoc> => {
  const invoiceRef = db().doc(`invoices/${request.invoiceId}`);
  return db().runTransaction(async (transaction) => {
    const snap = await transaction.get(invoiceRef);
    if (!snap.exists) throw new HttpsError("not-found", "This invoice no longer exists.");
    const invoice = snap.data() as InvoiceDoc;
    const delivery = invoice.delivery ?? {};
    const isPaid = PAID_STATUSES.includes(invoice.status);
    if (request.includePaymentLink && isPaid) {
      throw new HttpsError("failed-precondition", "This invoice is paid: it cannot be sent with a payment link.");
    }
    if (request.includePaymentLink && !isStripePaymentLink(invoice.paymentLinkUrl ?? "")) {
      throw new HttpsError("failed-precondition", "Add a Stripe payment link (https://buy.stripe.com/...) before sending it.");
    }
    const lastAtMs = delivery.lastAt ? Date.parse(delivery.lastAt) : 0;
    if (delivery.lastResult === "processing" && Date.now() - lastAtMs < SENDING_LOCK_MS) {
      throw new HttpsError("failed-precondition", "This invoice is already being sent. Wait a moment and check its Activity.");
    }
    transaction.update(invoiceRef, {
      delivery: {
        sendCount: (delivery.sendCount ?? 0) + 1,
        lastAt: new Date().toISOString(),
        lastTo: request.to,
        lastIncludedPdf: request.includePdf,
        lastIncludedPaymentLink: request.includePaymentLink,
        lastResult: "processing",
      },
    });
    writeEvent(transaction, request.invoiceId, actor, "delivery_requested",
      `Sending ${describeContent(request)} to ${request.to}`);
    return invoice;
  });
};

/** Paso 3: resultado (transacción). Con enlace a un invoice pendiente → Payment Link Sent. */
const finishDelivery = (request: SendInvoiceRequest, actor: Actor, errorMessage: string | null): Promise<void> => {
  const invoiceRef = db().doc(`invoices/${request.invoiceId}`);
  return db().runTransaction(async (transaction) => {
    const snap = await transaction.get(invoiceRef);
    if (!snap.exists) return;
    const invoice = snap.data() as InvoiceDoc;
    if (errorMessage) {
      transaction.update(invoiceRef, { "delivery.lastResult": "error" });
      writeEvent(transaction, request.invoiceId, actor, "delivery_failed",
        `Email to ${request.to} failed: ${errorMessage}`);
      return;
    }
    const marksLinkSent = request.includePaymentLink && invoice.status === "awaiting_payment";
    transaction.update(invoiceRef, {
      "delivery.lastResult": "sent",
      ...(marksLinkSent ? { status: "payment_link_sent" } : {}),
    });
    writeEvent(transaction, request.invoiceId, actor, "delivery_sent",
      `Sent ${describeContent(request)} to ${request.to}`,
      marksLinkSent ? [{ field: "status", before: "Awaiting Payment", after: "Payment Link Sent" }] : []);
  });
};

const toErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, MAX_ERROR_LENGTH);
};

export const sendinvoiceemail = onCall(
  {
    region: "us-central1",
    secrets: [CREW_SMTP_HOST, CREW_SMTP_PORT, CREW_SMTP_USER, CREW_SMTP_PASS, CREW_SMTP_FROM],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (callRequest) => {
    // Mensaje propio en inglés (el de assertModuleAccess está en español y la pantalla es en inglés).
    const access = await assertModuleAccess(callRequest.auth, MODULE_NAME, "e").catch(() => {
      throw new HttpsError("permission-denied", "Your role cannot send invoices (Invoices New · Edit).");
    });
    const request = parseRequest(callRequest.data);
    const actor = await getActor(access.userId);
    const invoice = await startDelivery(request, actor).catch(async (error: unknown) => {
      await deletePdf(request.pdfPath); // rechazado (pagado, sin enlace, ya enviándose…)
      throw error;
    });

    try {
      const [pdfContent, company] = await Promise.all([
        request.pdfPath ? readPdf(request.pdfPath) : Promise.resolve(null),
        getCompany(),
      ]);
      const paymentUrl = request.includePaymentLink
        ? buildPaymentUrl(invoice.paymentLinkUrl ?? "", request.invoiceId, request.to)
        : null;
      const email = buildInvoiceEmail({
        number: invoice.number,
        clientName: invoice.client?.name ?? "",
        totalCents: invoice.totalCents,
        dueDate: invoice.dueDate,
        isPaid: PAID_STATUSES.includes(invoice.status),
        includePdf: request.includePdf,
        paymentUrl,
        company,
      });
      const companyEmail = isValidRecipient(company.email) ? company.email : null;

      // Import dinámico: nodemailer solo se carga cuando se manda un correo.
      const nodemailer = await import("nodemailer");
      const port = Number(CREW_SMTP_PORT.value()) || DEFAULT_SMTP_PORT;
      const transporter = nodemailer.createTransport({
        host: CREW_SMTP_HOST.value(),
        port,
        secure: port === 465, // 465 = SSL implícito; 587 = STARTTLS (Gmail)
        auth: { user: CREW_SMTP_USER.value(), pass: CREW_SMTP_PASS.value() },
        // Que un SMTP lento falle antes del límite de la función (120 s): así el
        // error queda registrado en vez de cortarse a medias.
        connectionTimeout: 20_000,
        greetingTimeout: 20_000,
        socketTimeout: 60_000,
      });
      await transporter.sendMail({
        from: CREW_SMTP_FROM.value() || CREW_SMTP_USER.value(),
        to: request.to,
        ...(companyEmail && companyEmail.toLowerCase() !== request.to.toLowerCase()
          ? { bcc: companyEmail, replyTo: companyEmail }
          : {}),
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: pdfContent
          ? [{ filename: `Invoice_${invoice.number}.pdf`, content: pdfContent, contentType: "application/pdf" }]
          : [],
      });
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      logger.error(`sendinvoiceemail: ${invoice.number} → ${request.to}: ${errorMessage}`);
      await finishDelivery(request, actor, errorMessage);
      await deletePdf(request.pdfPath);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("unavailable", `The email server did not accept the message (${errorMessage}).`);
    }

    await finishDelivery(request, actor, null);
    await deletePdf(request.pdfPath);
    logger.info(`sendinvoiceemail: ${invoice.number} sent to ${request.to}`);
    return { result: "sent" };
  },
);
