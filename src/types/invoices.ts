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
// exactas (las tarjetas suman sin redondeos) y las reglas pueden validar enteros. La
// conversión con el resto de la app (dólares) vive en
// features/invoices-new/invoiceMath.ts.
// Cliente y job se COPIAN al crear: editar después el cliente o la casa no
// cambia un invoice emitido. Ver la nota "Invoices New" de code-notes.md.
// ============================================================================
import type { Actor, IsoDateTime, Property, YmdDate } from './index';

/** Estado guardado, los mismos del módulo Invoices (sin Pre-Paid):
 *  needs_invoice = borrador, todavía no se envía al cliente · pending = enviado,
 *  esperando el pago · paid = pago recibido fuera de Stripe. `payment_link_sent`
 *  y `paid_via_stripe` los pone solo el servidor (envío del correo y webhook de
 *  Stripe). Overdue NO se guarda: se calcula (features/invoices-new/invoiceStatus.ts). */
export type InvoiceStatus = 'needs_invoice' | 'pending' | 'payment_link_sent' | 'paid' | 'paid_via_stripe';

/** Estados que el usuario elige en Create / Edit Invoice. */
export type InvoiceManualStatus = 'needs_invoice' | 'pending' | 'paid';

/** Estado que ve el usuario (badge, filtro): el guardado, Overdue (calculado) o
 *  Deleted (en la papelera: `deletion` no es null). */
export type InvoiceDisplayStatus = InvoiceStatus | 'overdue' | 'deleted';

/** Invoice en la papelera (Delete): sale de la lista y de los totales, conserva
 *  su número y su Activity, y se puede restaurar. Nunca uno pagado. */
export interface InvoiceDeletion {
  deletedAt: IsoDateTime;
  deletedByUserId: string; //           FK → system_users
  deletedByUserName: string; //         copia del nombre
  reason: string; //                    motivo obligatorio (1 a 300)
}

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

/** Cómo trata su impuesto un servicio del invoice (regla "Total Minus Tax" de
 *  AppSheet, shared/utils/billedServiceAmounts.ts): added = Apply Tax Yes +
 *  Minus Tax No (se suma) · subtracted = No + Yes (se resta del precio) · none =
 *  cualquier otra combinación o casa exenta (taxExempt). */
export type InvoiceLineTaxMode = 'added' | 'subtracted' | 'none';

/** Un servicio cobrado del job (billing_services) COPIADO al crear el invoice o
 *  al usar "Refresh from job". Editar después el servicio en el job no lo cambia. */
export interface InvoiceLineItem {
  billingServiceId: string; //          FK → billing_services
  serviceId: string; //                 FK → settings_products / settings_services
  serviceName: string; //               copia del nombre del servicio
  notes: string; //                     notas del servicio en el job ('' si no tiene)
  quantity: number;
  unitPriceCents: number; //            precio unitario sin impuesto
  amountCents: number; //               lo que suma al subtotal: precio sin impuesto (con subtracted, ya sin el impuesto)
  taxMode: InvoiceLineTaxMode;
  taxRateBps: number; //                tasa del servicio (0 con none)
  taxCents: number; //                  impuesto que se AGREGA al total (0 si no es added)
}

/** Fee porcentual del invoice: % del subtotal de servicios, sin impuesto
 *  (decisión de Omar, 11/2026). */
export interface InvoiceFee {
  id: string; //                        id local (crypto.randomUUID)
  label: string; //                     nombre libre ("Card processing"), hasta 60
  rateBps: number; //                   1 a 10000 (3% = 300)
  amountCents: number; //               round(subtotalCents × rateBps / 10000)
}

/** Fee que escribe el usuario: el monto lo calcula invoiceMath.computeInvoiceTotals. */
export type InvoiceFeeInput = Pick<InvoiceFee, 'id' | 'label' | 'rateBps'>;

/** Montos de un invoice a partir de sus servicios y fees. */
export interface InvoiceTotals {
  subtotalCents: number; //             Σ amountCents de los servicios
  taxCents: number; //                  Σ impuesto que se agrega
  /** Tasa común de los servicios con impuesto que se agrega; 0 si no hay o
   *  si tienen tasas distintas (el PDF dice "Tax" sin %). */
  taxRateBps: number;
  fees: InvoiceFee[];
  feesCents: number;
  totalCents: number; //                subtotal + impuesto + fees
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
  lineItems: InvoiceLineItem[]; //      servicios cobrados del job, copiados ([] en invoices de prueba viejos)
  fees: InvoiceFee[]; //                fees porcentuales (0 a 10)
  subtotalCents: number; //             Σ amountCents de los servicios (≥ 1)
  taxRateBps: number; //                tasa común del impuesto (InvoiceTotals.taxRateBps)
  taxCents: number; //                  Σ impuesto que se agrega
  feesCents: number; //                 Σ fees
  totalCents: number; //                subtotalCents + taxCents + feesCents
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
  /** En la papelera. Ausente o null = activo (no se escribe al crear). */
  deletion?: InvoiceDeletion | null;
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
  | 'delivery_requested' | 'delivery_sent' | 'delivery_failed'
  | 'deleted' | 'restored';

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
  canDelete: boolean; //                mandar a la papelera y restaurar, nunca un pagado (Delete)
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
  lineItems: InvoiceLineItem[]; //      servicios del job (al menos uno)
  fees: InvoiceFeeInput[];
  recipientEmail: string;
  paymentLinkUrl: string;
  noteTexts: string[]; //               las vacías se descartan
  photos: InvoicePhotoSelectionInput;
  status: InvoiceManualStatus;
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

/** De quién es una cuenta de cliente (Client account): su customerId o, si el
 *  invoice no encontró al cliente al crearse, su clientRef (properties.client). */
export interface ClientAccountKey {
  customerId: string | null;
  clientRef: string;
  name: string;
}

/** Tarjeta elegida en la cuenta del cliente ('all' = ninguna). */
export type ClientAccountCardKey = 'all' | 'outstanding' | 'overdue' | 'paid' | 'draft';

/** Un pago de la pestaña Payments: el pago y su invoice. */
export interface ClientAccountPayment {
  invoice: Invoice;
  payment: InvoicePayment;
}

/** El patch tal como se guarda: los fees ya llevan su monto (invoicesService.update). */
export type InvoiceNormalizedPatch = Omit<InvoicePatch, 'fees'> & { fees?: InvoiceFee[] };

/** Un invoice que una acción en bloque no hizo (saltado o con error), y por qué. */
export interface InvoiceBulkIssue {
  invoice: Invoice;
  reason: string;
}

/** Resultado de Mark as Paid o Send invoice en bloque. */
export interface InvoiceBulkResult {
  doneInvoices: Invoice[]; //           pagados o enviados
  skipped: InvoiceBulkIssue[]; //       no se intentaron (ya pagado, sin correo, sin enlace…)
  failed: InvoiceBulkIssue[]; //        se intentaron y fallaron
}

/** Un envío de Send invoice en bloque: cada invoice a SU cliente. */
export interface InvoiceBulkSendItem {
  invoice: Invoice;
  to: string;
  includePdf: boolean;
  includePaymentLink: boolean;
}

/** Campos que el formulario de Edit Invoice puede cambiar. Cliente, job y
 *  número no cambian; en un invoice pagado tampoco servicios ni fees (los
 *  montos los recalcula el service). El estado solo va de Needs Invoice a
 *  Pending o al revés: Paid se registra con su pago (invoicesService.update
 *  con `manualPayment`, o Mark as Paid). */
export type InvoicePatch = Partial<Pick<Invoice,
  'issueDate' | 'paymentTerms' | 'dueDate' | 'lineItems' | 'recipientEmail' | 'paymentLinkUrl' | 'notes'
> & { status: Exclude<InvoiceManualStatus, 'paid'>; fees: InvoiceFeeInput[] }>;

// ---------------------------------------------------------------------------
// Lista, tarjetas, avisos y acciones en bloque (features/invoices-new)
// ---------------------------------------------------------------------------

/** Tarjeta del resumen (y grupo de la tabla); 'all' = sin tarjeta elegida. */
export type InvoiceCardKey = 'all' | 'overdue' | 'outstanding' | 'draft';

/** Tarjetas que se ven (todas menos 'all'). */
export type InvoiceSummaryCardKey = Exclude<InvoiceCardKey, 'all'>;

/** Campo de fecha del filtro de rango. */
export type InvoiceDateField = 'issueDate' | 'dueDate';

/** Rango de fechas: extremos inclusivos; '' = sin límite de ese lado. */
export interface InvoiceDateRange {
  field: InvoiceDateField;
  from: YmdDate;
  to: YmdDate;
}

/** Monto y cantidad de una tarjeta. */
export interface InvoiceCardSummary {
  count: number;
  totalCents: number;
}

/** Overdue = enviados y vencidos · Outstanding = enviados sin pagar (incluye
 *  los vencidos) · Draft = Needs Invoice (todavía no se envían). */
export type InvoiceSummary = Record<InvoiceSummaryCardKey, InvoiceCardSummary>;

/** Filtros de la lista (hooks/useInvoiceFilters.ts). */
export interface InvoiceFiltersState {
  search: string;
  card: InvoiceCardKey;
  status: InvoiceDisplayStatus | 'all';
  dateRange: InvoiceDateRange;
  page: number;
  pageSize: number;
}

/** Tarjetas de la cuenta del cliente (todas menos 'all'). */
export type ClientAccountSummaryKey = Exclude<ClientAccountCardKey, 'all'>;

export type ClientAccountSummary = Record<ClientAccountSummaryKey, InvoiceCardSummary>;

/** Tono del aviso de la página. */
export type InvoiceNoticeTone = 'success' | 'info' | 'error';

/** Botón del aviso ("Undo"). */
export interface InvoiceNoticeAction {
  label: string;
  onAction: () => void;
}

/** Qué hace Mark as Paid en bloque con los invoices marcados (invoiceBulk.ts). */
export interface BulkPaymentPlan {
  /** Sin pagar: se les registra el pago. */
  unpaidInvoices: Invoice[];
  /** Ya pagados: se saltan. */
  skipped: InvoiceBulkIssue[];
  /** Suma de los totales que se van a registrar. */
  totalCents: number;
  /** Emisión más reciente: la fecha de pago no puede ser anterior ('' sin invoices). */
  latestIssueDate: YmdDate;
}

/** Qué se manda en Send invoice en bloque. */
export interface BulkSendOptions {
  sendPdf: boolean;
  sendPaymentLink: boolean;
}

/** Qué hace Send invoice en bloque con los invoices marcados. */
export interface BulkSendPlan {
  items: InvoiceBulkSendItem[];
  skipped: InvoiceBulkIssue[];
}

/** Lo que necesita un envío por correo (services/invoiceEmailService.ts). */
export interface SendInvoiceEmailInput {
  /** El invoice con el correo y el enlace ya guardados. */
  invoice: Invoice;
  /** Casa del job (null si no está en la ventana de 12 meses): sus fotos van al PDF. */
  jobProperty: Property | null;
  to: string;
  includePdf: boolean;
  includePaymentLink: boolean;
  actor: Actor;
}
