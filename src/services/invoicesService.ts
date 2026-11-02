// src/services/invoicesService.ts
// ============================================================================
// Colección `invoices` (módulo Invoices New). Tipos en src/types/invoices.ts.
//
//   create · update · addNote · updatePhotoSelection · recordManualPayment
//   subscribeWindow · getOne · getEvents · getPhotoSelection · findByProperty
//
// ⭐ No hay `delete`: el número no debe dejar huecos y el historial se conserva
//    (mismo criterio que propertiesService). Tampoco hay getAll: la lista
//    escucha una ventana acotada (subscribeWindow, como propertiesWindow).
// ⭐ Cada cambio escribe su evento de Activity (invoices/{id}/events) en la
//    MISMA transacción o batch: si el cambio se guarda, su evento también.
// ⭐ El número sale de invoice_counters/{año} dentro de una transacción, así
//    dos personas creando a la vez nunca reciben el mismo. Sin conexión no se
//    puede crear (las transacciones necesitan al servidor).
// ⭐ `payment_link_sent`, `paid_via_stripe` y `delivery` los escribe SOLO el
//    servidor (correo y webhook de Stripe, etapas posteriores).
// ============================================================================
import {
  arrayUnion, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, where, writeBatch,
  type CollectionReference, type DocumentReference, type Transaction, type Unsubscribe, type WriteBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS } from '../lib/firebase/collections';
import { typedConverter } from '../lib/firebase/typedConverter';
import { logActivity } from './activityLogService';
import { todayIso } from '../utils/dateFormat';
import type {
  Invoice, InvoiceCounter, InvoiceCreateInput, InvoiceEvent, InvoiceEventType, InvoiceFieldChange,
  InvoiceManualPaymentInput, InvoiceNote, InvoicePatch, InvoicePayment, InvoicePhotoSelection,
  InvoicePhotoSelectionInput, InvoicePhotoSummary,
} from '../types/index';
import {
  buildSearchText, computeTotals, formatCents, formatInvoiceNumber, getNumberKey,
} from '../features/invoices-new/invoiceMath';
import { AWAITING_STATUSES, INVOICE_STATUS_LABELS, isPaidStatus } from '../features/invoices-new/invoiceStatus';
import { windowStartIso } from '../shared/data/propertiesWindow';
import { INVOICES_NEW_MODULE as MODULE_NAME } from '../features/invoices-new/invoicesNewPermissions';

const EVENTS_SUBCOLLECTION = 'events';
const PHOTOS_SUBCOLLECTION = 'photos';
const PHOTO_SELECTION_DOC_ID = 'selection';

/** Límites de texto (alcance §17); los valida el service, las reglas no pueden recorrer listas. */
export const INVOICE_LIMITS = {
  noteText: 3000,
  paymentReference: 160,
  paymentNote: 1500,
  maxNotes: 20,
  maxTaxRateBps: 10000,
} as const;

const PAYMENT_LINK_PATTERN = /^https:\/\/\S+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Campos que no cambian en un invoice pagado (Paid o Paid via Stripe). */
const PAID_LOCKED_FIELDS: readonly (keyof InvoicePatch)[] = ['subtotalCents', 'taxRateBps'];

// ---------------------------------------------------------------------------
// Referencias tipadas (la colección se tipa una sola vez, aquí)
// ---------------------------------------------------------------------------
export const invoicesCol: CollectionReference<Invoice> =
  collection(db, COLLECTIONS.invoices).withConverter(typedConverter<Invoice>());

export const invoiceRef = (invoiceId: string): DocumentReference<Invoice> =>
  doc(db, COLLECTIONS.invoices, invoiceId).withConverter(typedConverter<Invoice>());

const invoiceEventsCol = (invoiceId: string): CollectionReference<InvoiceEvent> =>
  collection(db, COLLECTIONS.invoices, invoiceId, EVENTS_SUBCOLLECTION).withConverter(typedConverter<InvoiceEvent>());

const photoSelectionRef = (invoiceId: string): DocumentReference<InvoicePhotoSelection> =>
  doc(db, COLLECTIONS.invoices, invoiceId, PHOTOS_SUBCOLLECTION, PHOTO_SELECTION_DOC_ID)
    .withConverter(typedConverter<InvoicePhotoSelection>());

const counterRef = (year: number): DocumentReference<InvoiceCounter> =>
  doc(db, COLLECTIONS.invoiceCounters, String(year)).withConverter(typedConverter<InvoiceCounter>());

/** Quién hace el cambio. */
export interface InvoiceActor {
  id: string;
  name: string;
}

/** Ya hay un pago completo registrado: no se registra otro. */
export class InvoiceAlreadyPaidError extends Error {
  constructor(invoiceNumber: string) {
    super(`Invoice ${invoiceNumber} is already paid.`);
    this.name = 'InvoiceAlreadyPaidError';
  }
}

const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Validación: la última barrera (las reglas de seguridad son una propuesta y
// todavía no están publicadas, ver security/README.md)
// ---------------------------------------------------------------------------
type ValidatedFields = Pick<Invoice,
  'issueDate' | 'dueDate' | 'subtotalCents' | 'taxRateBps' | 'recipientEmail' | 'paymentLinkUrl' | 'notes'
>;

const assertValidInvoice = (fields: ValidatedFields): void => {
  if (!Number.isInteger(fields.subtotalCents) || fields.subtotalCents < 1) {
    throw new Error('The invoice amount must be at least $0.01.');
  }
  if (!Number.isInteger(fields.taxRateBps) || fields.taxRateBps < 0 || fields.taxRateBps > INVOICE_LIMITS.maxTaxRateBps) {
    throw new Error('The tax rate must be between 0% and 100%, with up to two decimals.');
  }
  if (!fields.issueDate || !fields.dueDate) throw new Error('Issue date and due date are required.');
  if (fields.dueDate < fields.issueDate) throw new Error('The due date cannot be before the issue date.');
  if (fields.recipientEmail && !EMAIL_PATTERN.test(fields.recipientEmail)) throw new Error('The client email is not valid.');
  if (fields.paymentLinkUrl && !PAYMENT_LINK_PATTERN.test(fields.paymentLinkUrl)) {
    throw new Error('The payment link must be a valid https:// URL.');
  }
  if (fields.notes.length > INVOICE_LIMITS.maxNotes) throw new Error(`An invoice can have up to ${INVOICE_LIMITS.maxNotes} notes.`);
  if (fields.notes.some((note) => note.text.length > INVOICE_LIMITS.noteText)) {
    throw new Error(`Each note can have up to ${INVOICE_LIMITS.noteText} characters.`);
  }
};

const assertValidPayment = (payment: InvoiceManualPaymentInput, issueDate: string): void => {
  if (!payment.paidDate) throw new Error('The payment date is required.');
  if (payment.paidDate > todayIso()) throw new Error('The payment date cannot be in the future.');
  if (payment.paidDate < issueDate) throw new Error('The payment date cannot be before the issue date.');
  if (payment.reference.length > INVOICE_LIMITS.paymentReference) {
    throw new Error(`The reference can have up to ${INVOICE_LIMITS.paymentReference} characters.`);
  }
  if (payment.note.length > INVOICE_LIMITS.paymentNote) {
    throw new Error(`The payment note can have up to ${INVOICE_LIMITS.paymentNote} characters.`);
  }
};

// ---------------------------------------------------------------------------
// Piezas que se escriben junto con cada cambio
// ---------------------------------------------------------------------------
/** Nota nueva (las vacías no se guardan: se filtran antes). */
export const buildInvoiceNote = (text: string, actor: InvoiceActor): InvoiceNote => ({
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
  payment: InvoiceManualPaymentInput, amountCents: number, actor: InvoiceActor,
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
const writeEvent = (writer: Transaction | WriteBatch, invoiceId: string, actor: InvoiceActor, event: EventInput): void => {
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

/** Texto corto de un valor para la lista de cambios de Activity. */
const describeValue = (field: keyof InvoicePatch, value: unknown): string => {
  if (field === 'subtotalCents' && typeof value === 'number') return formatCents(value);
  if (field === 'taxRateBps' && typeof value === 'number') return `${value / 100}%`;
  if (field === 'notes' && Array.isArray(value)) return `${value.length} note(s)`;
  return String(value ?? '');
};

/** Campos del patch que de verdad cambian, con su antes y después. */
const getPatchChanges = (invoice: Invoice, patch: InvoicePatch): { changedPatch: InvoicePatch; changes: InvoiceFieldChange[] } => {
  const changedPatch: Record<string, unknown> = {};
  const changes: InvoiceFieldChange[] = [];
  Object.entries(patch).forEach(([field, value]) => {
    if (value === undefined) return;
    const fieldName = field as keyof InvoicePatch;
    if (JSON.stringify(invoice[fieldName]) === JSON.stringify(value)) return;
    changedPatch[field] = value;
    changes.push({ field, before: describeValue(fieldName, invoice[fieldName]), after: describeValue(fieldName, value) });
  });
  return { changedPatch: changedPatch as InvoicePatch, changes };
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
  async create(input: InvoiceCreateInput, actor: InvoiceActor): Promise<{ id: string; number: string }> {
    const notes = input.noteTexts.filter((text) => text.trim() !== '').map((text) => buildInvoiceNote(text, actor));
    const recipientEmail = input.recipientEmail.trim();
    const paymentLinkUrl = input.paymentLinkUrl.trim();
    assertValidInvoice({ ...input, recipientEmail, paymentLinkUrl, notes });
    if (input.status === 'paid') {
      if (!input.initialPayment) throw new Error('Record the payment details to create a paid invoice.');
      assertValidPayment(input.initialPayment, input.issueDate);
    }
    if (input.photos.include && input.photos.mode === 'selected' && input.photos.items.length === 0) {
      throw new Error('Select at least one photo, or turn off "Include before & after photos".');
    }

    const year = Number(todayIso().slice(0, 4));
    const newInvoiceRef = doc(invoicesCol);
    const { taxCents, totalCents } = computeTotals(input.subtotalCents, input.taxRateBps);

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
        subtotalCents: input.subtotalCents,
        taxRateBps: input.taxRateBps,
        taxCents,
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
          summary: `Payment recorded · ${payment.method} · ${payment.paidDate}`,
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
   * se pueden cambiar subtotal ni tasa. Si cambian, se recalculan impuesto y total.
   */
  async update(invoiceId: string, patch: InvoicePatch, actor: InvoiceActor): Promise<void> {
    await runTransaction(db, async (transaction) => {
      const invoiceSnap = await transaction.get(invoiceRef(invoiceId));
      if (!invoiceSnap.exists()) throw new Error('This invoice no longer exists.');
      const invoice = invoiceSnap.data();
      const { changedPatch, changes } = getPatchChanges(invoice, patch);
      if (changes.length === 0) return;

      const touchesLockedField = PAID_LOCKED_FIELDS.some((field) => field in changedPatch);
      if (isPaidStatus(invoice.status) && touchesLockedField) {
        throw new Error('A paid invoice cannot change its amount or tax rate.');
      }
      const merged = { ...invoice, ...changedPatch };
      assertValidInvoice({
        ...merged, recipientEmail: merged.recipientEmail.trim(), paymentLinkUrl: merged.paymentLinkUrl.trim(),
      });

      const amountsChanged = 'subtotalCents' in changedPatch || 'taxRateBps' in changedPatch;
      transaction.update(invoiceRef(invoiceId), {
        ...changedPatch,
        ...(amountsChanged ? computeTotals(merged.subtotalCents, merged.taxRateBps) : {}),
        updatedAt: nowIso(),
        updatedByUserId: actor.id,
        updatedByUserName: actor.name,
      });
      writeEvent(transaction, invoiceId, actor, { type: 'updated', summary: `Invoice ${invoice.number} updated`, changes });
    });

    void logActivity({ action: 'update', module: MODULE_NAME, user: actor, targetId: invoiceId, detail: 'Invoice updated' });
  },

  /** Agrega una nota (sale en el PDF) con su evento, en un batch. */
  async addNote(invoiceId: string, text: string, actor: InvoiceActor): Promise<void> {
    const trimmedText = text.trim();
    if (!trimmedText) throw new Error('The note is empty.');
    if (trimmedText.length > INVOICE_LIMITS.noteText) {
      throw new Error(`Each note can have up to ${INVOICE_LIMITS.noteText} characters.`);
    }
    const batch = writeBatch(db);
    batch.update(invoiceRef(invoiceId), {
      notes: arrayUnion(buildInvoiceNote(trimmedText, actor)),
      updatedAt: nowIso(),
      updatedByUserId: actor.id,
      updatedByUserName: actor.name,
    });
    writeEvent(batch, invoiceId, actor, { type: 'note_added', summary: 'Note added' });
    await batch.commit();
  },

  /** Cambia las fotos del PDF: la selección completa y el resumen del encabezado. */
  async updatePhotoSelection(invoiceId: string, photos: InvoicePhotoSelectionInput, actor: InvoiceActor): Promise<void> {
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
   * pagado: dos clics o dos personas dejan un solo pago. Si el pago trae nota,
   * también se agrega a las notas del invoice (alcance §13.5).
   */
  async recordManualPayment(invoiceId: string, paymentInput: InvoiceManualPaymentInput, actor: InvoiceActor): Promise<void> {
    await runTransaction(db, async (transaction) => {
      const invoiceSnap = await transaction.get(invoiceRef(invoiceId));
      if (!invoiceSnap.exists()) throw new Error('This invoice no longer exists.');
      const invoice = invoiceSnap.data();
      if (isPaidStatus(invoice.status)) throw new InvoiceAlreadyPaidError(invoice.number);
      assertValidPayment(paymentInput, invoice.issueDate);

      const payment = buildManualPayment(paymentInput, invoice.totalCents, actor);
      const paymentNote = payment.note ? [buildInvoiceNote(payment.note, actor)] : [];
      transaction.update(invoiceRef(invoiceId), {
        status: 'paid',
        payment,
        ...(paymentNote.length > 0 ? { notes: [...invoice.notes, ...paymentNote] } : {}),
        updatedAt: nowIso(),
        updatedByUserId: actor.id,
        updatedByUserName: actor.name,
      });
      writeEvent(transaction, invoiceId, actor, {
        type: 'payment_recorded',
        summary: `Payment recorded · ${payment.method} · ${payment.paidDate}`,
        changes: [{ field: 'status', before: INVOICE_STATUS_LABELS[invoice.status], after: INVOICE_STATUS_LABELS.paid }],
      });
    });

    void logActivity({
      action: 'status_change', module: MODULE_NAME, user: actor, targetId: invoiceId, detail: 'Payment recorded',
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
   * hace 12 meses MÁS los que siguen sin pagar de cualquier fecha (dos
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
      query(invoicesCol, where('status', 'in', [...AWAITING_STATUSES])),
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

  /** Invoices de un job: el formulario avisa si el job ya tiene alguno. */
  async findByProperty(propertyId: string): Promise<Invoice[]> {
    const snap = await getDocs(query(invoicesCol, where('propertyId', '==', propertyId)));
    return snap.docs.map((invoiceDoc) => invoiceDoc.data());
  },
};
