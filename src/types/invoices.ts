// src/types/invoices.ts
// ============================================================================
// Tipos de la colección `invoices` (módulo Invoices New) y de sus
// subcolecciones. Los usa src/services/invoicesService.ts.
// Se importan desde '../types/index' (index.ts los reexporta).
//
//   invoices/{invoiceId}                    Invoice (lo que necesita la lista)
//   invoices/{invoiceId}/photos/selection   InvoicePhotoSelection (URLs elegidas)
//   invoices/{invoiceId}/events/{eventId}   InvoiceEvent (Activity, solo se agrega)
//   invoice_counters/{YYYY}                 InvoiceCounter (consecutivo del año)
//
// Montos en CENTAVOS enteros y tasa en puntos base (8.25% = 825): sumas
// exactas (Paid + Awaiting = Total) y las reglas pueden validar enteros. La
// conversión con el resto de la app (dólares) vive en
// features/invoices-new/invoiceMath.ts.
// Cliente y job se COPIAN al crear: editar después el cliente o la casa no
// cambia un invoice emitido. Ver la nota "Invoices New" de code-notes.md.
// ============================================================================
import type { IsoDateTime, YmdDate } from './index';

/** Estado de pago. `payment_link_sent` y `paid_via_stripe` los pone solo el
 *  servidor (envío del correo y webhook de Stripe). Overdue NO es un estado:
 *  se calcula (features/invoices-new/invoiceStatus.ts). */
export type InvoiceStatus = 'awaiting_payment' | 'payment_link_sent' | 'paid' | 'paid_via_stripe';

/** Plazo de pago: al recibir, 7, 15 o 30 días después de la emisión, o fecha elegida. */
export type InvoicePaymentTerms = 'due_on_receipt' | 'net_7' | 'net_15' | 'net_30' | 'custom';

/** Métodos para registrar a mano un pago recibido fuera de Stripe. */
export type InvoiceManualMethod = 'Cash' | 'Bank transfer' | 'Check' | 'Other';

/** Categoría de una foto del job. */
export type InvoicePhotoCategory = 'before' | 'after';

/** Empresa del job al emitir (shared/utils/businesses.ts). */
export type InvoiceBusiness = 'Normal' | 'Cavalry';

/** Datos del cliente copiados al crear el invoice. */
export interface InvoiceClientSnapshot {
  customerId: string | null; //         FK → customers (null = no se encontró el cliente)
  clientRef: string; //                 valor original de properties.client (id, id legacy o nombre)
  name: string; //                      nombre del cliente
  email: string; //                     '' si el cliente no tiene
  phone: string; //                     '' si el cliente no tiene
  address: string; //                   '' si el cliente no tiene
  cityStateZip: string; //              '' si el cliente no tiene
}

/** Datos del job (casa) copiados al crear el invoice. */
export interface InvoiceJobSnapshot {
  propertyId: string; //                FK → properties
  address: string; //                   dirección del job
  unit: string; //                      unidad / Apt ('' si no tiene)
  city: string; //                      ciudad ('' si no tiene)
  serviceDate: YmdDate; //              properties.scheduleDate ('' si no tiene)
  serviceId: string; //                 FK → settings_services ('' si no tiene)
  serviceName: string; //               copia del nombre del servicio
}

/** Montos que tenía el job al emitir (utils/jobFinancials.ts), para auditoría. */
export interface InvoiceJobAmounts {
  servicePriceCents: number; //         Service Price del job
  taxesCents: number; //                Taxes del job
  finalCostCents: number; //            Final Cost del job
}

/** Nota del invoice: sale en el PDF (no es una nota privada del personal). */
export interface InvoiceNote {
  id: string; //                        id local (crypto.randomUUID)
  text: string; //                      hasta 3000 caracteres
  createdAt: IsoDateTime; //            cuándo se escribió
  createdByUserId: string; //           FK → system_users
  createdByUserName: string; //         copia del nombre
}

/** Pago completo del invoice (no hay pagos parciales). */
export interface InvoicePayment {
  source: 'manual' | 'stripe'; //       manual = Mark as Paid · stripe = webhook
  method: InvoiceManualMethod | 'Stripe';
  paidDate: YmdDate; //                 día en que el cliente pagó
  amountCents: number; //               igual al totalCents del invoice
  reference: string; //                 referencia de transferencia o recibo (hasta 160)
  note: string; //                      detalle adicional (hasta 1500)
  recordedAt: IsoDateTime; //           cuándo se registró
  recordedByUserId: string | null; //   FK → system_users (null = lo registró el servidor)
  recordedByUserName: string; //        copia del nombre ('Stripe' si lo registró el webhook)
  stripePaymentIntentId: string | null; // SOLO SERVIDOR: pago de Stripe que lo confirmó
  stripeEventId: string | null; //      SOLO SERVIDOR: evento del webhook (evita duplicados)
}

/** Resumen de las fotos que van en el PDF (las URLs están en photos/selection). */
export interface InvoicePhotoSummary {
  include: boolean; //                  ¿el PDF lleva fotos?
  mode: 'all' | 'selected'; //          todas las del job o solo las elegidas
  selectedCount: number; //             fotos elegidas
  beforeCount: number; //               de ellas, Before
  afterCount: number; //                de ellas, After
}

/** Resumen de envíos por correo. SOLO SERVIDOR (etapa de correo). */
export interface InvoiceDeliverySummary {
  sendCount: number; //                 envíos intentados
  lastAt: IsoDateTime | null; //        último intento
  lastTo: string; //                    último destinatario
  lastIncludedPdf: boolean; //          ¿el último envío llevó el PDF?
  lastIncludedPaymentLink: boolean; //  ¿el último envío llevó el enlace de pago?
  lastResult: 'processing' | 'sent' | 'error' | null;
}

/** invoices/{invoiceId} — Un invoice: un cliente y un job. */
export interface Invoice {
  id: string; //                        PK · id del documento
  number: string; //                    "INV-2026-0001" (no cambia)
  numberYear: number; //                año del consecutivo (no cambia)
  numberSeq: number; //                 consecutivo dentro del año (no cambia)
  numberKey: number; //                 numberYear * 1,000,000 + numberSeq (desempate del orden)
  status: InvoiceStatus;
  currency: 'USD';
  issueDate: YmdDate; //                fecha de emisión
  paymentTerms: InvoicePaymentTerms;
  dueDate: YmdDate; //                  vencimiento (no antes de la emisión)
  subtotalCents: number; //             monto antes del impuesto (≥ 1)
  taxRateBps: number; //                tasa en puntos base: 0 a 10000 (8.25% = 825)
  taxCents: number; //                  round(subtotalCents * taxRateBps / 10000)
  totalCents: number; //                subtotalCents + taxCents
  propertyId: string; //                FK → properties (igual a job.propertyId; para where())
  customerId: string | null; //         FK → customers (igual a client.customerId; para where())
  business: InvoiceBusiness; //         empresa del job al emitir
  client: InvoiceClientSnapshot; //     no cambia después de crear
  job: InvoiceJobSnapshot; //           no cambia después de crear
  jobAmountsAtIssue: InvoiceJobAmounts | null; // montos del job al crear (auditoría)
  recipientEmail: string; //            destinatario de los envíos ('' = sin correo)
  notes: InvoiceNote[]; //              notas que salen en el PDF
  photos: InvoicePhotoSummary;
  payment: InvoicePayment | null; //    null = sin pagar
  delivery: InvoiceDeliverySummary; //  SOLO SERVIDOR
  paymentLinkUrl: string; //            enlace de Stripe pegado ('' = sin enlace)
  searchText: string; //                número, cliente y job en minúsculas (búsqueda)
  createdAt: IsoDateTime; //            no cambia
  createdByUserId: string; //           FK → system_users
  createdByUserName: string; //         copia del nombre
  updatedAt: IsoDateTime;
  updatedByUserId: string; //           FK → system_users
  updatedByUserName: string; //         copia del nombre
}

/** Una foto del job elegida para el PDF. Se identifica por su URL: las fotos
 *  de la casa (properties.beforePhotos / afterPhotos) no tienen otro id. */
export interface InvoicePhotoItem {
  url: string;
  category: InvoicePhotoCategory;
  order: number; //                     posición dentro de su categoría
}

/** invoices/{invoiceId}/photos/selection — Fotos elegidas (un solo documento). */
export interface InvoicePhotoSelection {
  id: string; //                        siempre 'selection'
  include: boolean;
  mode: 'all' | 'selected';
  items: InvoicePhotoItem[]; //         copia al elegir, también en modo 'all'
  updatedAt: IsoDateTime;
  updatedByUserId: string; //           FK → system_users
  updatedByUserName: string; //         copia del nombre
}

/** Tipos de evento de Activity. */
export type InvoiceEventType =
  | 'created' | 'updated' | 'note_added' | 'photos_updated'
  | 'payment_recorded' | 'payment_confirmed_stripe'
  | 'delivery_requested' | 'delivery_sent' | 'delivery_failed';

/** Un campo que cambió (mismo formato que activity_logs). */
export interface InvoiceFieldChange {
  field: string;
  before: string;
  after: string;
}

/** invoices/{invoiceId}/events/{eventId} — Activity. Solo se agrega: nunca se
 *  edita ni se borra. Se escribe en la MISMA transacción o batch que el cambio. */
export interface InvoiceEvent {
  id: string; //                        PK · id del documento
  type: InvoiceEventType;
  at: IsoDateTime; //                   cuándo pasó (orden de Activity, más reciente primero)
  actorType: 'user' | 'system' | 'stripe';
  actorUserId: string | null; //        FK → system_users (null = servidor o Stripe)
  actorUserName: string; //             copia del nombre
  summary: string; //                   texto para Activity
  changes: InvoiceFieldChange[]; //     campos que cambiaron (en 'updated')
}

/** invoice_counters/{YYYY} — Último consecutivo del año. Solo se mueve dentro
 *  de la transacción que crea el invoice. */
export interface InvoiceCounter {
  id: string; //                        PK · el año ("2026")
  lastSeq: number; //                   último consecutivo usado
  lastInvoiceId: string; //             FK → invoices: el invoice que lo usó
  updatedAt: IsoDateTime;
}

/** Qué puede hacer un rol en Invoices New (módulo "Invoices New" de Roles). */
export interface InvoicesNewRights {
  canView: boolean; //                  ver la lista, el detalle, el PDF y Activity
  canCreate: boolean; //                crear invoices (Add)
  canEdit: boolean; //                  editar, notas, fotos, enviar y registrar pagos (Edit)
}

/** Datos de un pago manual que escribe el usuario. */
export interface InvoiceManualPaymentInput {
  method: InvoiceManualMethod;
  paidDate: YmdDate;
  reference: string;
  note: string;
}

/** Fotos elegidas en el formulario. */
export type InvoicePhotoSelectionInput = Pick<InvoicePhotoSelection, 'include' | 'mode' | 'items'>;

/** Lo que manda el formulario de Create Invoice al service. */
export interface InvoiceCreateInput {
  client: InvoiceClientSnapshot;
  job: InvoiceJobSnapshot;
  business: InvoiceBusiness;
  jobAmountsAtIssue: InvoiceJobAmounts | null;
  issueDate: YmdDate;
  paymentTerms: InvoicePaymentTerms;
  dueDate: YmdDate;
  subtotalCents: number;
  taxRateBps: number;
  recipientEmail: string;
  paymentLinkUrl: string;
  noteTexts: string[]; //               las vacías se descartan
  photos: InvoicePhotoSelectionInput;
  status: 'awaiting_payment' | 'paid';
  initialPayment: InvoiceManualPaymentInput | null; // obligatorio si status = 'paid'
}

/** Qué se manda por correo (formulario y Send / Resend). */
export interface InvoiceDeliveryChoice {
  sendPdf: boolean; //                  adjuntar el PDF
  sendPaymentLink: boolean; //          incluir el enlace de pago de Stripe (nunca en un invoice pagado)
  recipientEmail: string; //            un solo destinatario para las dos opciones
  paymentLinkUrl: string; //            Payment Link creado a mano en Stripe (https://buy.stripe.com/...)
}

/** Lo que recibe la Cloud Function sendinvoiceemail (functions/src/invoiceEmail.ts). */
export interface InvoiceSendRequest {
  invoiceId: string;
  to: string;
  includePdf: boolean;
  includePaymentLink: boolean;
  /** PDF subido para ESTE envío (invoices/{id}/email/{uuid}.pdf); null sin PDF. */
  pdfPath: string | null;
}

/** Resultado de mandar un invoice por correo, para el aviso de la página. */
export type InvoiceDeliveryOutcome =
  | { status: 'sent'; to: string; missingPhotoCount: number }
  | { status: 'failed'; message: string };

/** Campos que el formulario de Edit Invoice puede cambiar. Cliente, job y
 *  número no cambian; en un invoice pagado tampoco subtotal ni tasa. */
export type InvoicePatch = Partial<Pick<Invoice,
  'issueDate' | 'paymentTerms' | 'dueDate' | 'subtotalCents' | 'taxRateBps' | 'recipientEmail' | 'paymentLinkUrl' | 'notes'
>>;
