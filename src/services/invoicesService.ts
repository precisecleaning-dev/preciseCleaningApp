// src/services/invoicesService.ts
// ============================================================================
// Colección `invoices` (módulo Invoices New). Tipos en src/types/invoices.ts.
//
//   create · update · addNote · updatePhotoSelection · recordManualPayment
//   moveToTrash · restore
//   subscribeWindow · subscribeByClient · subscribePhotoSelection · getOne · getEvents
//   getPhotoSelection · findByProperty
//
// ⭐ No hay `delete`: el número no debe dejar huecos y el historial se conserva
//    (mismo criterio que propertiesService). "Delete" en la pantalla es la
//    PAPELERA (moveToTrash): `deletion` con motivo; se restaura con restore. Tampoco hay getAll: la lista
//    escucha una ventana acotada (subscribeWindow, como propertiesWindow).
// ⭐ Cada cambio escribe su evento de Activity (invoices/{id}/events) en la
//    MISMA transacción o batch: si el cambio se guarda, su evento también.
// ⭐ El número sale de invoice_counters/{año} dentro de una transacción, así
//    dos personas creando a la vez nunca reciben el mismo. Sin conexión no se
//    puede crear (las transacciones necesitan al servidor).
// ⭐ `payment_link_sent`, `paid_via_stripe` y `delivery` los escribe SOLO el
//    servidor (correo y webhook de Stripe). Enviar un Needs Invoice por correo
//    lo pasa a Pending (functions/src/invoiceEmail.ts).
// ⭐ `awaiting_payment` es el nombre anterior de Pending (11/2026): solo lo
//    tienen invoices de prueba y se lee como 'pending' (invoiceConverter).
// ============================================================================
import {
  collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, where, writeBatch,
  type CollectionReference, type DocumentReference, type FirestoreDataConverter, type Query, type Transaction,
  type Unsubscribe, type WriteBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS } from '../lib/firebase/collections';
import { typedConverter } from '../lib/firebase/typedConverter';
import { logActivity } from './activityLogService';
import { formatDate, todayIso } from '../utils/dateFormat';
import type {
  Actor, ClientAccountKey, Invoice, InvoiceCounter, InvoiceCreateInput, InvoiceEvent, InvoiceEventType, InvoiceFeeInput,
  InvoiceFieldChange, InvoiceLineItem, InvoiceManualPaymentInput, InvoiceNormalizedPatch, InvoiceNote, InvoicePatch,
  InvoicePayment, InvoicePhotoSelection, InvoicePhotoSelectionInput, InvoicePhotoSummary,
} from '../types/index';
import {
  INVOICE_PAYMENT_TERM_LABELS, bpsToPercent, buildSearchText, computeInvoiceTotals, formatCents, formatInvoiceNumber,
  getNumberKey,
} from '../features/invoices-new/invoiceMath';
import {
  INVOICE_STATUS_LABELS, UNPAID_STATUSES, isDeletedInvoice, isPaidStatus,
} from '../features/invoices-new/invoiceStatus';
import { INVOICE_EMAIL_PATTERN, STRIPE_PAYMENT_LINK_PATTERN } from '../features/invoices-new/invoiceDelivery';
import { INVOICE_LIMITS, getFeesProblem, getLineItemsProblem } from '../features/invoices-new/invoiceLimits';
import { getManualPaymentErrors } from '../features/invoices-new/invoicePayment';
import { windowStartIso } from '../shared/data/propertiesWindow';
import { INVOICES_NEW_MODULE as MODULE_NAME } from '../features/invoices-new/invoicesNewPermissions';

const EVENTS_SUBCOLLECTION = 'events';
const PHOTOS_SUBCOLLECTION = 'photos';
const PHOTO_SELECTION_DOC_ID = 'selection';

/** Campos que no cambian en un invoice pagado (Paid o Paid via Stripe): los
 *  servicios y los fees (de ellos salen los montos). */
const PAID_LOCKED_FIELDS: readonly (keyof InvoicePatch)[] = ['lineItems', 'fees'];

/** Nombre anterior de Pending (11/2026). Solo lo tienen invoices de prueba. */
const LEGACY_PENDING_STATUS = 'awaiting_payment';

// ---------------------------------------------------------------------------
// Referencias tipadas (la colección se tipa una sola vez, aquí)
// ---------------------------------------------------------------------------
const baseInvoiceConverter = typedConverter<Invoice>();

/**
 * typedConverter + lo que les falta a los invoices de prueba viejos: el estado
 * `awaiting_payment` se lee como 'pending', y sin servicios ni fees (antes de
 * 11/2026) se leen `lineItems` y `fees` vacíos y `feesCents` 0 (el PDF y el
 * detalle muestran entonces una sola línea con el subtotal).
 */
const invoiceConverter: FirestoreDataConverter<Invoice> = {
  toFirestore: baseInvoiceConverter.toFirestore,
  fromFirestore: (snap) => {
    const invoice = baseInvoiceConverter.fromFirestore(snap);
    return {
      ...invoice,
      status: (invoice.status as string) === LEGACY_PENDING_STATUS ? 'pending' : invoice.status,
      lineItems: invoice.lineItems ?? [],
      fees: invoice.fees ?? [],
      feesCents: invoice.feesCents ?? 0,
      deletion: invoice.deletion ?? null,
    };
  },
};

export const invoicesCol: CollectionReference<Invoice> =
  collection(db, COLLECTIONS.invoices).withConverter(invoiceConverter);

export const invoiceRef = (invoiceId: string): DocumentReference<Invoice> =>
  doc(db, COLLECTIONS.invoices, invoiceId).withConverter(invoiceConverter);

const invoiceEventsCol = (invoiceId: string): CollectionReference<InvoiceEvent> =>
  collection(db, COLLECTIONS.invoices, invoiceId, EVENTS_SUBCOLLECTION).withConverter(typedConverter<InvoiceEvent>());

const photoSelectionRef = (invoiceId: string): DocumentReference<InvoicePhotoSelection> =>
  doc(db, COLLECTIONS.invoices, invoiceId, PHOTOS_SUBCOLLECTION, PHOTO_SELECTION_DOC_ID)
    .withConverter(typedConverter<InvoicePhotoSelection>());

const counterRef = (year: number): DocumentReference<InvoiceCounter> =>
  doc(db, COLLECTIONS.invoiceCounters, String(year)).withConverter(typedConverter<InvoiceCounter>());

/** Otra persona guardó el invoice mientras se editaba: no se pisa su cambio. */
export class InvoiceChangedError extends Error {
  constructor(invoiceNumber: string) {
    super(`Someone else changed invoice ${invoiceNumber} while you were editing it. Close the form and open it again to see the latest version.`);
    this.name = 'InvoiceChangedError';
  }
}

/** Ya hay un pago completo registrado: no se registra otro. */
export class InvoiceAlreadyPaidError extends Error {
  constructor(invoiceNumber: string) {
    super(`Invoice ${invoiceNumber} is already paid.`);
    this.name = 'InvoiceAlreadyPaidError';
  }
}

/** Un invoice pagado (Paid o Paid via Stripe) no se manda a la papelera. */
export class InvoicePaidCannotBeDeletedError extends Error {
  constructor(invoiceNumber: string) {
    super(`Invoice ${invoiceNumber} is paid: paid invoices cannot be deleted.`);
    this.name = 'InvoicePaidCannotBeDeletedError';
  }
}

/** El invoice está en la papelera: no se cambia hasta restaurarlo. */
const assertNotDeleted = (invoice: Invoice): void => {
  if (isDeletedInvoice(invoice)) throw new Error(`Invoice ${invoice.number} was deleted. Restore it first.`);
};

const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Validación: la última barrera (las reglas de seguridad son una propuesta y
// todavía no están publicadas, ver security/README.md)
// ---------------------------------------------------------------------------
type ValidatedFields = Pick<Invoice,
  'issueDate' | 'dueDate' | 'subtotalCents' | 'recipientEmail' | 'paymentLinkUrl' | 'notes'
>;

/** Servicios y fees que se van a guardar (al crear, o si cambian al editar). */
const assertValidCharges = (lineItems: readonly InvoiceLineItem[], fees: readonly InvoiceFeeInput[]): void => {
  const problem = getLineItemsProblem(lineItems) ?? getFeesProblem(fees);
  if (problem) throw new Error(problem);
};

const assertValidInvoice = (fields: ValidatedFields): void => {
  if (!Number.isInteger(fields.subtotalCents) || fields.subtotalCents < 1) {
    throw new Error('The services of the invoice must add up to at least $0.01.');
  }
  if (!fields.issueDate || !fields.dueDate) throw new Error('Issue date and due date are required.');
  if (fields.dueDate < fields.issueDate) throw new Error('The due date cannot be before the issue date.');
  if (fields.recipientEmail && !INVOICE_EMAIL_PATTERN.test(fields.recipientEmail)) throw new Error('The client email is not valid.');
  if (fields.paymentLinkUrl && !STRIPE_PAYMENT_LINK_PATTERN.test(fields.paymentLinkUrl)) {
    throw new Error('The payment link must be a Stripe payment link (https://buy.stripe.com/...).');
  }
  if (fields.notes.length > INVOICE_LIMITS.maxNotes) throw new Error(`An invoice can have up to ${INVOICE_LIMITS.maxNotes} notes.`);
  if (fields.notes.some((note) => note.text.length > INVOICE_LIMITS.noteText)) {
    throw new Error(`Each note can have up to ${INVOICE_LIMITS.noteText} characters.`);
  }
};

/** Mismas reglas y mensajes que el formulario (getManualPaymentErrors). */
const assertValidPayment = (payment: InvoiceManualPaymentInput, issueDate: string): void => {
  const [firstError] = Object.values(getManualPaymentErrors(payment, issueDate));
  if (firstError) throw new Error(firstError);
};

// ---------------------------------------------------------------------------
// Piezas que se escriben junto con cada cambio
// ---------------------------------------------------------------------------
/** Nota nueva (las vacías no se guardan: se filtran antes). */
export const buildInvoiceNote = (text: string, actor: Actor): InvoiceNote => ({
  id: crypto.randomUUID(),
  text: text.trim(),
  createdAt: nowIso(),
  createdByUserId: actor.id,
  createdByUserName: actor.name,
});

const buildPhotoSummary = (photos: InvoicePhotoSelectionInput): InvoicePhotoSummary => ({
  include: photos.include,
  mode: photos.mode,
  selectedCount: photos.items.length,
  beforeCount: photos.items.filter((photo) => photo.category === 'before').length,
  afterCount: photos.items.filter((photo) => photo.category === 'after').length,
});

const buildManualPayment = (
  payment: InvoiceManualPaymentInput, amountCents: number, actor: Actor,
): InvoicePayment => ({
  source: 'manual',
  method: payment.method,
  paidDate: payment.paidDate,
  amountCents,
  reference: payment.reference.trim(),
  note: payment.note.trim(),
  recordedAt: nowIso(),
  recordedByUserId: actor.id,
  recordedByUserName: actor.name,
  stripePaymentIntentId: null,
  stripeEventId: null,
});

interface EventInput {
  type: InvoiceEventType;
  summary: string;
  changes?: InvoiceFieldChange[];
}

/** Escribe un evento de Activity dentro de la transacción o el batch del cambio. */
const writeEvent = (writer: Transaction | WriteBatch, invoiceId: string, actor: Actor, event: EventInput): void => {
  const eventRef = doc(invoiceEventsCol(invoiceId));
  const invoiceEvent: InvoiceEvent = {
    id: eventRef.id,
    type: event.type,
    at: nowIso(),
    actorType: 'user',
    actorUserId: actor.id,
    actorUserName: actor.name,
    summary: event.summary,
    changes: event.changes ?? [],
  };
  // Transaction y WriteBatch tienen el mismo set(ref, data).
  (writer as WriteBatch).set(eventRef, invoiceEvent);
};

/** Nombre de cada campo en Activity. */
const FIELD_LABELS: Record<keyof InvoicePatch, string> = {
  issueDate: 'Issue date',
  paymentTerms: 'Payment terms',
  dueDate: 'Due date',
  lineItems: 'Services',
  fees: 'Fees',
  recipientEmail: 'Client email',
  paymentLinkUrl: 'Stripe payment link',
  notes: 'Notes',
  status: 'Status',
};

/** Texto corto de un valor para la lista de cambios de Activity (fechas MM/DD/YYYY). */
const describeValue = (field: keyof InvoicePatch, value: unknown): string => {
  if (field === 'lineItems' && Array.isArray(value)) {
    const lineItems = value as InvoiceLineItem[];
    const lineTotal = lineItems.reduce((total, lineItem) => total + lineItem.amountCents + lineItem.taxCents, 0);
    return `${lineItems.length} service(s) · ${formatCents(lineTotal)}`;
  }
  if (field === 'fees' && Array.isArray(value)) {
    const fees = value as InvoiceFeeInput[];
    return fees.length > 0 ? fees.map((fee) => `${fee.label} ${bpsToPercent(fee.rateBps)}%`).join(', ') : 'None';
  }
  if (field === 'notes' && Array.isArray(value)) return `${value.length} note(s)`;
  if ((field === 'issueDate' || field === 'dueDate') && typeof value === 'string') return formatDate(value);
  if (field === 'paymentTerms' && typeof value === 'string') {
    return INVOICE_PAYMENT_TERM_LABELS[value as keyof typeof INVOICE_PAYMENT_TERM_LABELS] ?? value;
  }
  if (field === 'status' && typeof value === 'string') {
    return INVOICE_STATUS_LABELS[value as keyof typeof INVOICE_STATUS_LABELS] ?? value;
  }
  return String(value ?? '');
};

/** Resumen del pago para Activity: método, fecha y referencia. */
const describePayment = (payment: InvoicePayment): string =>
  [`Payment recorded · ${payment.method} · ${formatDate(payment.paidDate)}`, payment.reference ? `Ref. ${payment.reference}` : '']
    .filter(Boolean)
    .join(' · ');

/**
 * Lo que se escribe al registrar el pago manual COMPLETO (Mark as Paid, o Paid
 * en Edit Invoice): estado, pago y, si el pago trae nota y hay lugar, esa nota
 * en las notas del invoice (alcance §13.5; si no hay lugar queda en el pago).
 * `invoice` = como queda guardado (con los cambios del mismo Edit).
 */
const buildManualPaymentUpdate = (
  invoice: Pick<Invoice, 'status' | 'issueDate' | 'notes' | 'totalCents'>,
  paymentInput: InvoiceManualPaymentInput,
  actor: Actor,
): { fields: Pick<Invoice, 'status' | 'payment'> & Partial<Pick<Invoice, 'notes'>>; event: EventInput } => {
  assertValidPayment(paymentInput, invoice.issueDate);
  const payment = buildManualPayment(paymentInput, invoice.totalCents, actor);
  const hasRoomForNote = invoice.notes.length < INVOICE_LIMITS.maxNotes;
  const paymentNotes = payment.note && hasRoomForNote ? [buildInvoiceNote(payment.note, actor)] : [];
  return {
    fields: {
      status: 'paid',
      payment,
      ...(paymentNotes.length > 0 ? { notes: [...invoice.notes, ...paymentNotes] } : {}),
    },
    event: {
      type: 'payment_recorded',
      summary: describePayment(payment),
      changes: [{ field: FIELD_LABELS.status, before: INVOICE_STATUS_LABELS[invoice.status], after: INVOICE_STATUS_LABELS.paid }],
    },
  };
};

/** Estados desde los que Edit puede pasar a Needs Invoice o Pending (no con el
 *  enlace de Stripe enviado ni pagado: ver getSelectableStatuses). */
const DRAFT_OR_PENDING_STATUSES: readonly Invoice['status'][] = ['needs_invoice', 'pending'];

/** JSON con las claves ordenadas: Firestore no devuelve los mapas en el orden
 *  en que se escribieron, y un orden distinto no es un cambio. */
const stableStringify = (value: unknown): string => JSON.stringify(value, (_key, nestedValue: unknown) => (
  nestedValue && typeof nestedValue === 'object' && !Array.isArray(nestedValue)
    ? Object.fromEntries(Object.entries(nestedValue).sort(([keyA], [keyB]) => keyA.localeCompare(keyB)))
    : nestedValue
));

/** Campos del patch que de verdad cambian, con su antes y después. */
const getPatchChanges = (
  invoice: Invoice, patch: InvoiceNormalizedPatch,
): { changedPatch: InvoiceNormalizedPatch; changes: InvoiceFieldChange[] } => {
  const changedPatch: Record<string, unknown> = {};
  const changes: InvoiceFieldChange[] = [];
  Object.entries(patch).forEach(([field, value]) => {
    if (value === undefined) return;
    const fieldName = field as keyof InvoicePatch;
    if (stableStringify(invoice[fieldName]) === stableStringify(value)) return;
    changedPatch[field] = value;
    changes.push({
      field: FIELD_LABELS[fieldName] ?? field,
      before: describeValue(fieldName, invoice[fieldName]),
      after: describeValue(fieldName, value),
    });
  });
  // Se arma campo por campo (Object.entries pierde el tipo de cada valor).
  return { changedPatch: changedPatch as InvoiceNormalizedPatch, changes };
};

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------
export const invoicesService = {
  /**
   * Crea el invoice con su número, sus fotos y su evento "created" en UNA
   * transacción. Creado como Paid, guarda también el pago (con sus datos
   * reales: no se inventa el método). Devuelve id y número.
   */
  async create(input: InvoiceCreateInput, actor: Actor): Promise<{ id: string; number: string }> {
    const notes = input.noteTexts.filter((text) => text.trim() !== '').map((text) => buildInvoiceNote(text, actor));
    const recipientEmail = input.recipientEmail.trim();
    const paymentLinkUrl = input.paymentLinkUrl.trim();
    assertValidCharges(input.lineItems, input.fees);
    const totals = computeInvoiceTotals(input.lineItems, input.fees);
    assertValidInvoice({ ...input, ...totals, recipientEmail, paymentLinkUrl, notes });
    if (input.status === 'paid') {
      if (!input.initialPayment) throw new Error('Record the payment details to create a paid invoice.');
      assertValidPayment(input.initialPayment, input.issueDate);
    }
    if (input.photos.include && input.photos.mode === 'selected' && input.photos.items.length === 0) {
      throw new Error('Select at least one photo, or turn off "Include before & after photos".');
    }

    const year = Number(todayIso().slice(0, 4));
    const newInvoiceRef = doc(invoicesCol);
    const { totalCents } = totals;

    const number = await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef(year));
      const sequence = (counterSnap.exists() ? counterSnap.data().lastSeq : 0) + 1;
      const invoiceNumber = formatInvoiceNumber(year, sequence);
      const createdAt = nowIso();
      const payment = input.status === 'paid' && input.initialPayment
        ? buildManualPayment(input.initialPayment, totalCents, actor)
        : null;

      const invoice: Invoice = {
        id: newInvoiceRef.id,
        number: invoiceNumber,
        numberYear: year,
        numberSeq: sequence,
        numberKey: getNumberKey(year, sequence),
        status: input.status,
        currency: 'USD',
        issueDate: input.issueDate,
        paymentTerms: input.paymentTerms,
        dueDate: input.dueDate,
        lineItems: input.lineItems,
        fees: totals.fees,
        subtotalCents: totals.subtotalCents,
        taxRateBps: totals.taxRateBps,
        taxCents: totals.taxCents,
        feesCents: totals.feesCents,
        totalCents,
        propertyId: input.job.propertyId,
        customerId: input.client.customerId,
        business: input.business,
        client: input.client,
        job: input.job,
        jobAmountsAtIssue: input.jobAmountsAtIssue,
        recipientEmail,
        notes,
        photos: buildPhotoSummary(input.photos),
        payment,
        delivery: {
          sendCount: 0, lastAt: null, lastTo: '', lastIncludedPdf: false, lastIncludedPaymentLink: false, lastResult: null,
        },
        paymentLinkUrl,
        searchText: buildSearchText(invoiceNumber, input.client.name, input.job),
        createdAt,
        createdByUserId: actor.id,
        createdByUserName: actor.name,
        updatedAt: createdAt,
        updatedByUserId: actor.id,
        updatedByUserName: actor.name,
      };

      transaction.set(counterRef(year), {
        id: String(year), lastSeq: sequence, lastInvoiceId: newInvoiceRef.id, updatedAt: createdAt,
      });
      transaction.set(newInvoiceRef, invoice);
      transaction.set(photoSelectionRef(newInvoiceRef.id), {
        id: PHOTO_SELECTION_DOC_ID,
        ...input.photos,
        updatedAt: createdAt,
        updatedByUserId: actor.id,
        updatedByUserName: actor.name,
      });
      writeEvent(transaction, newInvoiceRef.id, actor, { type: 'created', summary: `Invoice ${invoiceNumber} created` });
      if (payment) {
        writeEvent(transaction, newInvoiceRef.id, actor, {
          type: 'payment_recorded',
          summary: describePayment(payment),
        });
      }
      return invoiceNumber;
    });

    void logActivity({
      action: 'create', module: MODULE_NAME, user: actor, targetId: newInvoiceRef.id, targetLabel: number,
    });
    return { id: newInvoiceRef.id, number };
  },

  /**
   * Guarda solo los campos que cambiaron, con su evento "updated". Relee el
   * invoice en la transacción: si ya está pagado (Paid o Paid via Stripe), no
   * se pueden cambiar servicios ni fees. Si cambian, se recalculan todos los
   * montos (computeInvoiceTotals); los fees se guardan con su monto.
   * `expectedUpdatedAt` (Edit Invoice): el `updatedAt` del invoice al abrir el
   * formulario. Si otra persona lo guardó después, falla con InvoiceChangedError
   * en vez de pisar sus notas, montos o fechas con la copia del formulario.
   * `manualPayment` (Paid elegido en Edit): registra el pago completo en la
   * MISMA transacción, con el total ya actualizado; falla si ya estaba pagado.
   */
  async update(
    invoiceId: string,
    patch: InvoicePatch,
    actor: Actor,
    expectedUpdatedAt?: string,
    manualPayment?: InvoiceManualPaymentInput | null,
  ): Promise<void> {
    await runTransaction(db, async (transaction) => {
      const invoiceSnap = await transaction.get(invoiceRef(invoiceId));
      if (!invoiceSnap.exists()) throw new Error('This invoice no longer exists.');
      const invoice = invoiceSnap.data();
      assertNotDeleted(invoice);
      if (expectedUpdatedAt && invoice.updatedAt !== expectedUpdatedAt) throw new InvoiceChangedError(invoice.number);
      // Servicios o fees nuevos: los fees llevan su monto con el subtotal que
      // queda (así un fee igual al guardado no cuenta como cambio).
      const touchesCharges = patch.lineItems !== undefined || patch.fees !== undefined;
      const chargeTotals = touchesCharges
        ? computeInvoiceTotals(patch.lineItems ?? invoice.lineItems, patch.fees ?? invoice.fees)
        : null;
      const { fees: _feeInputs, ...patchWithoutFees } = patch;
      const normalizedPatch: InvoiceNormalizedPatch = chargeTotals
        ? { ...patchWithoutFees, fees: chargeTotals.fees }
        : patchWithoutFees;
      const { changedPatch, changes } = getPatchChanges(invoice, normalizedPatch);
      if (changes.length === 0 && !manualPayment) return;

      if (manualPayment && isPaidStatus(invoice.status)) throw new InvoiceAlreadyPaidError(invoice.number);
      if ('status' in changedPatch && !DRAFT_OR_PENDING_STATUSES.includes(invoice.status)) {
        throw new Error(`Invoice ${invoice.number} is ${INVOICE_STATUS_LABELS[invoice.status]}: its status can only change by recording the payment.`);
      }
      const touchesLockedField = PAID_LOCKED_FIELDS.some((field) => field in changedPatch);
      if (isPaidStatus(invoice.status) && touchesLockedField) {
        throw new Error('A paid invoice cannot change its services or fees.');
      }
      const chargesChanged = 'lineItems' in changedPatch || 'fees' in changedPatch;
      if (chargesChanged) assertValidCharges(patch.lineItems ?? invoice.lineItems, patch.fees ?? invoice.fees);
      const totals: Partial<Pick<Invoice, 'subtotalCents' | 'taxRateBps' | 'taxCents' | 'feesCents' | 'totalCents'>> =
        chargesChanged && chargeTotals
          ? {
            subtotalCents: chargeTotals.subtotalCents,
            taxRateBps: chargeTotals.taxRateBps,
            taxCents: chargeTotals.taxCents,
            feesCents: chargeTotals.feesCents,
            totalCents: chargeTotals.totalCents,
          }
          : {};
      const merged: Invoice = { ...invoice, ...changedPatch, ...totals, fees: changedPatch.fees ?? invoice.fees };
      assertValidInvoice({
        ...merged, recipientEmail: merged.recipientEmail.trim(), paymentLinkUrl: merged.paymentLinkUrl.trim(),
      });
      if (merged.payment && merged.payment.paidDate < merged.issueDate) {
        throw new Error(`The issue date cannot be after the payment date (${formatDate(merged.payment.paidDate)}).`);
      }

      const paymentUpdate = manualPayment ? buildManualPaymentUpdate(merged, manualPayment, actor) : null;
      transaction.update(invoiceRef(invoiceId), {
        ...changedPatch,
        ...totals,
        ...paymentUpdate?.fields,
        updatedAt: nowIso(),
        updatedByUserId: actor.id,
        updatedByUserName: actor.name,
      });
      if (changes.length > 0) {
        writeEvent(transaction, invoiceId, actor, { type: 'updated', summary: `Invoice ${invoice.number} updated`, changes });
      }
      if (paymentUpdate) writeEvent(transaction, invoiceId, actor, paymentUpdate.event);
    });

    void logActivity(manualPayment
      ? { action: 'status_change', module: MODULE_NAME, user: actor, targetId: invoiceId, detail: 'Payment recorded' }
      : { action: 'update', module: MODULE_NAME, user: actor, targetId: invoiceId, detail: 'Invoice updated' });
  },

  /**
   * Agrega una nota (sale en el PDF) con su evento. Transacción: relee las
   * notas para no pasar del máximo aunque dos personas agreguen a la vez.
   */
  async addNote(invoiceId: string, text: string, actor: Actor): Promise<void> {
    const trimmedText = text.trim();
    if (!trimmedText) throw new Error('The note is empty.');
    if (trimmedText.length > INVOICE_LIMITS.noteText) {
      throw new Error(`Each note can have up to ${INVOICE_LIMITS.noteText} characters.`);
    }
    await runTransaction(db, async (transaction) => {
      const invoiceSnap = await transaction.get(invoiceRef(invoiceId));
      if (!invoiceSnap.exists()) throw new Error('This invoice no longer exists.');
      const noteInvoice = invoiceSnap.data();
      assertNotDeleted(noteInvoice);
      const { notes } = noteInvoice;
      if (notes.length >= INVOICE_LIMITS.maxNotes) {
        throw new Error(`An invoice can have up to ${INVOICE_LIMITS.maxNotes} notes.`);
      }
      transaction.update(invoiceRef(invoiceId), {
        notes: [...notes, buildInvoiceNote(trimmedText, actor)],
        updatedAt: nowIso(),
        updatedByUserId: actor.id,
        updatedByUserName: actor.name,
      });
      writeEvent(transaction, invoiceId, actor, { type: 'note_added', summary: 'Note added' });
    });
  },

  /** Cambia las fotos del PDF: la selección completa y el resumen del encabezado. */
  async updatePhotoSelection(invoiceId: string, photos: InvoicePhotoSelectionInput, actor: Actor): Promise<void> {
    if (photos.include && photos.mode === 'selected' && photos.items.length === 0) {
      throw new Error('Select at least one photo, or turn off "Include before & after photos".');
    }
    const updatedAt = nowIso();
    const summary = buildPhotoSummary(photos);
    const batch = writeBatch(db);
    batch.set(photoSelectionRef(invoiceId), {
      id: PHOTO_SELECTION_DOC_ID, ...photos, updatedAt, updatedByUserId: actor.id, updatedByUserName: actor.name,
    });
    batch.update(invoiceRef(invoiceId), {
      photos: summary, updatedAt, updatedByUserId: actor.id, updatedByUserName: actor.name,
    });
    const eventSummary = photos.include ? `Photos updated · ${summary.selectedCount} selected` : 'Photos removed from the PDF';
    writeEvent(batch, invoiceId, actor, { type: 'photos_updated', summary: eventSummary });
    await batch.commit();
  },

  /**
   * Mark as Paid: registra el pago COMPLETO recibido fuera de Stripe. Relee el
   * invoice en la transacción y falla con InvoiceAlreadyPaidError si ya está
   * pagado: dos clics o dos personas dejan un solo pago (buildManualPaymentUpdate).
   */
  async recordManualPayment(invoiceId: string, paymentInput: InvoiceManualPaymentInput, actor: Actor): Promise<void> {
    await runTransaction(db, async (transaction) => {
      const invoiceSnap = await transaction.get(invoiceRef(invoiceId));
      if (!invoiceSnap.exists()) throw new Error('This invoice no longer exists.');
      const invoice = invoiceSnap.data();
      assertNotDeleted(invoice);
      if (isPaidStatus(invoice.status)) throw new InvoiceAlreadyPaidError(invoice.number);
      const paymentUpdate = buildManualPaymentUpdate(invoice, paymentInput, actor);
      transaction.update(invoiceRef(invoiceId), {
        ...paymentUpdate.fields,
        updatedAt: nowIso(),
        updatedByUserId: actor.id,
        updatedByUserName: actor.name,
      });
      writeEvent(transaction, invoiceId, actor, paymentUpdate.event);
    });

    void logActivity({
      action: 'status_change', module: MODULE_NAME, user: actor, targetId: invoiceId, detail: 'Payment recorded',
    });
  },

  /**
   * Delete: manda el invoice a la papelera con su motivo (transacción). Relee el
   * invoice: falla si está pagado (InvoicePaidCannotBeDeletedError) o si ya
   * estaba borrado. Conserva número, montos y Activity; se deshace con restore.
   */
  async moveToTrash(invoiceId: string, reason: string, actor: Actor): Promise<void> {
    const trimmedReason = reason.trim();
    if (!trimmedReason) throw new Error('Write why the invoice is deleted.');
    if (trimmedReason.length > INVOICE_LIMITS.deletionReason) {
      throw new Error(`The reason can have up to ${INVOICE_LIMITS.deletionReason} characters.`);
    }
    const number = await runTransaction(db, async (transaction) => {
      const invoiceSnap = await transaction.get(invoiceRef(invoiceId));
      if (!invoiceSnap.exists()) throw new Error('This invoice no longer exists.');
      const invoice = invoiceSnap.data();
      if (isPaidStatus(invoice.status)) throw new InvoicePaidCannotBeDeletedError(invoice.number);
      if (isDeletedInvoice(invoice)) throw new Error(`Invoice ${invoice.number} is already deleted.`);
      const deletedAt = nowIso();
      transaction.update(invoiceRef(invoiceId), {
        deletion: { deletedAt, deletedByUserId: actor.id, deletedByUserName: actor.name, reason: trimmedReason },
        updatedAt: deletedAt,
        updatedByUserId: actor.id,
        updatedByUserName: actor.name,
      });
      writeEvent(transaction, invoiceId, actor, { type: 'deleted', summary: `Invoice deleted · ${trimmedReason}`.slice(0, 500) });
      return invoice.number;
    });
    void logActivity({ action: 'delete', module: MODULE_NAME, user: actor, targetId: invoiceId, targetLabel: number });
  },

  /** Restore: saca el invoice de la papelera (vuelve con el estado que tenía). */
  async restore(invoiceId: string, actor: Actor): Promise<void> {
    const number = await runTransaction(db, async (transaction) => {
      const invoiceSnap = await transaction.get(invoiceRef(invoiceId));
      if (!invoiceSnap.exists()) throw new Error('This invoice no longer exists.');
      const invoice = invoiceSnap.data();
      if (!isDeletedInvoice(invoice)) return invoice.number;
      const restoredAt = nowIso();
      transaction.update(invoiceRef(invoiceId), {
        deletion: null,
        updatedAt: restoredAt,
        updatedByUserId: actor.id,
        updatedByUserName: actor.name,
      });
      writeEvent(transaction, invoiceId, actor, { type: 'restored', summary: 'Invoice restored' });
      return invoice.number;
    });
    void logActivity({
      action: 'update', module: MODULE_NAME, user: actor, targetId: invoiceId, targetLabel: number, detail: 'Invoice restored',
    });
  },

  /** Un invoice por id (null si no existe). Lectura única. */
  async getOne(invoiceId: string): Promise<Invoice | null> {
    const snap = await getDoc(invoiceRef(invoiceId));
    return snap.exists() ? snap.data() : null;
  },

  /** Activity de un invoice, más reciente primero. Se lee al abrir la pestaña. */
  async getEvents(invoiceId: string, maxEvents = 50): Promise<InvoiceEvent[]> {
    const snap = await getDocs(query(invoiceEventsCol(invoiceId), orderBy('at', 'desc'), limit(maxEvents)));
    return snap.docs.map((eventDoc) => eventDoc.data());
  },

  /** Fotos elegidas para el PDF (null si el invoice no tiene selección). */
  async getPhotoSelection(invoiceId: string): Promise<InvoicePhotoSelection | null> {
    const snap = await getDoc(photoSelectionRef(invoiceId));
    return snap.exists() ? snap.data() : null;
  },

  /**
   * Escucha la lista de invoices. Con ventana: los emitidos desde el día 1 de
   * hace 12 meses MÁS los que siguen sin pagar de cualquier fecha (Needs
   * Invoice, Pending, Payment Link Sent y el viejo awaiting_payment; dos
   * consultas de un solo campo, sin índices compuestos), unidos por id. Con
   * `isFullHistory`, la colección completa. `onData` recibe la lista entera
   * cada vez que algo cambia.
   */
  subscribeWindow(
    isFullHistory: boolean,
    onData: (invoices: Invoice[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    if (isFullHistory) {
      return onSnapshot(invoicesCol, (snap) => onData(snap.docs.map((invoiceDoc) => invoiceDoc.data())), onError);
    }
    const windowQueries = [
      query(invoicesCol, where('issueDate', '>=', windowStartIso())),
      query(invoicesCol, where('status', 'in', [...UNPAID_STATUSES, LEGACY_PENDING_STATUS])),
    ];
    const parts = windowQueries.map(() => new Map<string, Invoice>());
    const arrived = windowQueries.map(() => false);
    const publish = () => {
      if (!arrived.every(Boolean)) return;
      const merged = new Map<string, Invoice>();
      parts.forEach((part) => part.forEach((invoice, invoiceId) => merged.set(invoiceId, invoice)));
      onData([...merged.values()]);
    };
    const unsubscribes = windowQueries.map((windowQuery, queryIndex) => onSnapshot(windowQuery, (snap) => {
      parts[queryIndex] = new Map(snap.docs.map((invoiceDoc) => [invoiceDoc.id, invoiceDoc.data()]));
      arrived[queryIndex] = true;
      publish();
    }, onError));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  },

  /**
   * Escucha TODOS los invoices de un cliente, de cualquier fecha (cuenta del
   * cliente), mientras la ventana está abierta. Por customerId o, si el cliente
   * no se encontró al crear, por client.clientRef: consultas de un solo campo,
   * sin índice compuesto; el orden se hace en el navegador.
   */
  subscribeByClient(
    clientKey: ClientAccountKey,
    onData: (invoices: Invoice[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const clientQuery: Query<Invoice> = clientKey.customerId
      ? query(invoicesCol, where('customerId', '==', clientKey.customerId))
      : query(invoicesCol, where('client.clientRef', '==', clientKey.clientRef));
    return onSnapshot(clientQuery, (snap) => onData(snap.docs.map((invoiceDoc) => invoiceDoc.data())), onError);
  },

  /** Escucha las fotos elegidas de UN invoice (un documento), mientras el
   *  detalle o el formulario están abiertos. `null` = sin selección guardada. */
  subscribePhotoSelection(
    invoiceId: string,
    onData: (selection: InvoicePhotoSelection | null) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    return onSnapshot(photoSelectionRef(invoiceId), (snap) => onData(snap.exists() ? snap.data() : null), onError);
  },

  /** Invoices de un job: el formulario avisa si el job ya tiene alguno. */
  async findByProperty(propertyId: string): Promise<Invoice[]> {
    const snap = await getDocs(query(invoicesCol, where('propertyId', '==', propertyId)));
    return snap.docs.map((invoiceDoc) => invoiceDoc.data());
  },
};
