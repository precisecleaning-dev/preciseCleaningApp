// src/features/invoices-new/hooks/useInvoiceForm.ts
// ============================================================================
// Estado del formulario Create / Edit Invoice (useReducer) y, en funciones
// puras, lo que se deriva de él: montos en centavos y errores.
//
// Servicios: al crear salen del job en el render (buildInvoiceLineItems con
// los billing_services del job), sin un efecto que los copie al estado; al
// editar son los guardados en el invoice, o los del job si se usó "Refresh
// from job" (`refreshedLineItems`). No se escriben a mano (decisión de Omar).
// Fees: % del subtotal de servicios, sin impuesto. El correo del envío:
// `null` = el del cliente del job.
// ============================================================================
import { useMemo, useReducer } from 'react';
import type {
  Invoice, InvoiceDeliveryChoice, InvoiceFeeInput, InvoiceLineItem, InvoiceManualPaymentInput, InvoiceManualStatus,
  InvoiceNote, InvoicePaymentTerms, InvoiceStatus, InvoiceTotals, YmdDate,
} from '../../../types/index';
import { todayIso } from '../../../utils/dateFormat';
import { bpsToPercent, computeInvoiceTotals, dueFromTerms, termsFromDates } from '../invoiceMath';
import { isPaidStatus } from '../invoiceStatus';
import { createEmptyManualPayment, getManualPaymentErrors } from '../invoicePayment';
import { INVOICE_LIMITS, getFeesProblem } from '../invoiceLimits';

const DEFAULT_TERMS: InvoicePaymentTerms = 'net_15';
/** Un invoice nuevo es un borrador hasta que se envía (decisión de Omar, 11/2026). */
const DEFAULT_STATUS: InvoiceManualStatus = 'needs_invoice';
/** Porcentaje de un fee: número con hasta dos decimales ("3", "2.75"). */
const PERCENT_PATTERN = /^\d+(\.\d{1,2})?$/;

/** Una nota del formulario: `original` = la nota guardada (al editar). */
export interface InvoiceFormNote {
  key: string;
  text: string;
  original: InvoiceNote | null;
}

/** Un fee del formulario: nombre y porcentaje como texto (`key` = su id al guardar). */
export interface InvoiceFormFee {
  key: string;
  label: string;
  rateText: string;
}

/** Opciones de envío del formulario. `recipientEmail` null = sin tocar: el del cliente. */
export type InvoiceFormDelivery = Omit<InvoiceDeliveryChoice, 'recipientEmail'> & { recipientEmail: string | null };

export interface InvoiceFormState {
  propertyId: string;
  issueDate: YmdDate;
  paymentTerms: InvoicePaymentTerms;
  dueDate: YmdDate;
  /** Al editar: servicios traídos con "Refresh from job" (null = los guardados). */
  refreshedLineItems: InvoiceLineItem[] | null;
  fees: InvoiceFormFee[];
  notes: InvoiceFormNote[];
  /** Al crear: Needs Invoice. Al editar: el guardado, hasta que el usuario elige otro. */
  status: InvoiceStatus;
  /** Datos del pago cuando se elige Paid (al crear o al editar uno sin pagar). */
  payment: InvoiceManualPaymentInput;
  /** Al guardar: mandar el PDF y/o el enlace de pago (desmarcados al abrir: editar no reenvía). */
  delivery: InvoiceFormDelivery;
}

type InvoiceFormAction =
  | { type: 'selectJob'; propertyId: string }
  | { type: 'setIssueDate'; issueDate: YmdDate }
  | { type: 'setPaymentTerms'; paymentTerms: InvoicePaymentTerms }
  | { type: 'setDueDate'; dueDate: YmdDate }
  | { type: 'refreshLineItems'; lineItems: InvoiceLineItem[] }
  | { type: 'addFee' }
  | { type: 'changeFee'; key: string; patch: Partial<Omit<InvoiceFormFee, 'key'>> }
  | { type: 'removeFee'; key: string }
  | { type: 'addNote' }
  | { type: 'changeNote'; key: string; text: string }
  | { type: 'removeNote'; key: string }
  | { type: 'setStatus'; status: InvoiceManualStatus }
  | { type: 'setPayment'; field: keyof InvoiceManualPaymentInput; value: string }
  | { type: 'setDelivery'; patch: Partial<InvoiceDeliveryChoice> };

const emptyNote = (): InvoiceFormNote => ({ key: crypto.randomUUID(), text: '', original: null });

const emptyFee = (): InvoiceFormFee => ({ key: crypto.randomUUID(), label: '', rateText: '' });

const createInitialDelivery = (invoice: Invoice | null): InvoiceFormDelivery => ({
  sendPdf: false,
  sendPaymentLink: false,
  recipientEmail: invoice?.recipientEmail || null,
  paymentLinkUrl: invoice?.paymentLinkUrl ?? '',
});

const createInitialState = (invoice: Invoice | null): InvoiceFormState => {
  if (!invoice) {
    const issueDate = todayIso();
    return {
      propertyId: '',
      issueDate,
      paymentTerms: DEFAULT_TERMS,
      dueDate: dueFromTerms(issueDate, DEFAULT_TERMS, issueDate),
      refreshedLineItems: null,
      fees: [],
      notes: [emptyNote()],
      status: DEFAULT_STATUS,
      payment: createEmptyManualPayment(),
      delivery: createInitialDelivery(null),
    };
  }
  const savedNotes = invoice.notes.map((note) => ({ key: note.id, text: note.text, original: note }));
  return {
    propertyId: invoice.propertyId,
    issueDate: invoice.issueDate,
    paymentTerms: invoice.paymentTerms,
    dueDate: invoice.dueDate,
    refreshedLineItems: null,
    fees: invoice.fees.map((fee) => ({ key: fee.id, label: fee.label, rateText: String(bpsToPercent(fee.rateBps)) })),
    notes: savedNotes.length > 0 ? savedNotes : [emptyNote()],
    status: invoice.status,
    payment: createEmptyManualPayment(),
    delivery: createInitialDelivery(invoice),
  };
};

function invoiceFormReducer(state: InvoiceFormState, action: InvoiceFormAction): InvoiceFormState {
  switch (action.type) {
    case 'selectJob':
      // Los servicios salen del job elegido en el render (no hay nada que limpiar).
      return { ...state, propertyId: action.propertyId };
    case 'setIssueDate':
      return {
        ...state,
        issueDate: action.issueDate,
        dueDate: dueFromTerms(action.issueDate, state.paymentTerms, state.dueDate),
      };
    case 'setPaymentTerms':
      return {
        ...state,
        paymentTerms: action.paymentTerms,
        dueDate: dueFromTerms(state.issueDate, action.paymentTerms, state.dueDate),
      };
    case 'setDueDate':
      // Elegir el vencimiento a mano pasa el plazo al que corresponda (o Custom).
      return { ...state, dueDate: action.dueDate, paymentTerms: termsFromDates(state.issueDate, action.dueDate) };
    case 'refreshLineItems':
      return { ...state, refreshedLineItems: action.lineItems };
    case 'addFee':
      return { ...state, fees: [...state.fees, emptyFee()] };
    case 'changeFee':
      return { ...state, fees: state.fees.map((fee) => (fee.key === action.key ? { ...fee, ...action.patch } : fee)) };
    case 'removeFee':
      return { ...state, fees: state.fees.filter((fee) => fee.key !== action.key) };
    case 'addNote':
      return { ...state, notes: [...state.notes, emptyNote()] };
    case 'changeNote':
      return { ...state, notes: state.notes.map((note) => (note.key === action.key ? { ...note, text: action.text } : note)) };
    case 'removeNote': {
      const remainingNotes = state.notes.filter((note) => note.key !== action.key);
      return { ...state, notes: remainingNotes.length > 0 ? remainingNotes : [emptyNote()] };
    }
    case 'setStatus':
      return { ...state, status: action.status };
    case 'setPayment':
      return { ...state, payment: { ...state.payment, [action.field]: action.value } };
    case 'setDelivery':
      return { ...state, delivery: { ...state.delivery, ...action.patch } };
    default:
      return state;
  }
}

/** Errores por campo (vacío = se puede guardar). */
export type InvoiceFormErrors = Partial<Record<
  'job' | 'issueDate' | 'dueDate' | 'services' | 'fees' | 'notes' | 'paymentDate' | 'paymentReference' | 'paymentNote',
  string
>>;

/** Texto "3.5" → puntos base (null si no es un % válido de 0.01 a 100 con hasta dos decimales). */
const parseFeeRateBps = (rateText: string): number | null => {
  if (!PERCENT_PATTERN.test(rateText.trim())) return null;
  const basisPoints = Math.round(Number(rateText) * 100);
  return basisPoints >= 1 && basisPoints <= INVOICE_LIMITS.maxTaxRateBps ? basisPoints : null;
};

/** Servicios, fees y montos que muestra y guarda el formulario. */
export interface InvoiceFormCharges {
  /** null = los servicios del job todavía no llegan (al crear). */
  lineItems: InvoiceLineItem[] | null;
  /** Fees con el % ya convertido (0 si el texto no es válido: ver errores). */
  feeInputs: InvoiceFeeInput[];
  totals: InvoiceTotals;
}

/**
 * Servicios y montos del formulario. Al crear, `jobLineItems` = los servicios
 * del job elegido (null mientras llegan); al editar, los del invoice o los
 * traídos con "Refresh from job".
 */
export function getInvoiceFormCharges(
  state: InvoiceFormState, invoice: Invoice | null, jobLineItems: InvoiceLineItem[] | null,
): InvoiceFormCharges {
  const lineItems = invoice ? state.refreshedLineItems ?? invoice.lineItems : jobLineItems;
  const feeInputs = state.fees.map((fee) => ({ id: fee.key, label: fee.label, rateBps: parseFeeRateBps(fee.rateText) ?? 0 }));
  return { lineItems, feeInputs, totals: computeInvoiceTotals(lineItems ?? [], feeInputs) };
}

/** Error de los servicios (undefined si hay al menos uno). */
const getServicesError = (state: InvoiceFormState, charges: InvoiceFormCharges, isEditing: boolean): string | undefined => {
  if (!state.propertyId) return undefined;
  if (charges.lineItems === null) return 'Wait for the job services to load.';
  if (charges.lineItems.length > 0) return undefined;
  // Invoice de prueba viejo (sin servicios guardados): solo pide servicios si se agregan fees.
  if (isEditing) return state.fees.length > 0 ? 'Use "Refresh from job" to load the services before adding fees.' : undefined;
  return 'This job has no services. Add them in the job first.';
};

/**
 * Opciones de envío listas para validar y mandar: el correo es el que escribió
 * el usuario o el del cliente, y un invoice pagado no manda enlace de pago.
 */
export function getInvoiceFormDelivery(state: InvoiceFormState, clientEmail: string): InvoiceDeliveryChoice {
  return {
    ...state.delivery,
    recipientEmail: state.delivery.recipientEmail ?? clientEmail,
    sendPaymentLink: state.delivery.sendPaymentLink && !isPaidStatus(state.status),
  };
}

/**
 * ¿El formulario registra un pago? Paid elegido en un invoice nuevo o en uno
 * que todavía no estaba pagado (`savedStatus` = el guardado, null al crear).
 */
export const isRecordingPayment = (state: InvoiceFormState, savedStatus: InvoiceStatus | null): boolean =>
  state.status === 'paid' && !(savedStatus && isPaidStatus(savedStatus));

/** Errores del formulario (vacío = se puede guardar). */
export function getInvoiceFormErrors(
  state: InvoiceFormState, charges: InvoiceFormCharges, savedStatus: InvoiceStatus | null,
): InvoiceFormErrors {
  const formErrors: InvoiceFormErrors = {};
  if (!state.propertyId) formErrors.job = 'Select a job.';
  if (!state.issueDate) formErrors.issueDate = 'Enter the issue date.';
  if (!state.dueDate) formErrors.dueDate = 'Enter the due date.';
  else if (state.issueDate && state.dueDate < state.issueDate) formErrors.dueDate = 'The due date cannot be before the issue date.';
  const servicesError = getServicesError(state, charges, savedStatus !== null);
  if (servicesError) formErrors.services = servicesError;
  else if (charges.lineItems && charges.lineItems.length > 0 && charges.totals.subtotalCents < 1) {
    formErrors.services = 'The services of this job add up to $0.00. Check their prices in the job.';
  }
  // Las mismas reglas que el service (invoiceLimits.ts); un % mal escrito llega como 0.
  const feesError = getFeesProblem(charges.feeInputs);
  if (feesError) formErrors.fees = feesError;
  if (state.notes.some((note) => note.text.length > INVOICE_LIMITS.noteText)) {
    formErrors.notes = `Each note can have up to ${INVOICE_LIMITS.noteText} characters.`;
  }
  if (state.notes.filter((note) => note.text.trim() !== '').length > INVOICE_LIMITS.maxNotes) {
    formErrors.notes = `An invoice can have up to ${INVOICE_LIMITS.maxNotes} notes.`;
  }
  const paymentErrors = isRecordingPayment(state, savedStatus) ? getManualPaymentErrors(state.payment, state.issueDate) : {};
  return { ...formErrors, ...paymentErrors };
}

/** Estado del formulario. `invoice` = el invoice que se edita (null al crear). */
export function useInvoiceForm(invoice: Invoice | null) {
  const [state, dispatch] = useReducer(invoiceFormReducer, invoice, createInitialState);

  const actions = useMemo(() => ({
    selectJob: (propertyId: string) => dispatch({ type: 'selectJob', propertyId }),
    setIssueDate: (issueDate: YmdDate) => dispatch({ type: 'setIssueDate', issueDate }),
    setPaymentTerms: (paymentTerms: InvoicePaymentTerms) => dispatch({ type: 'setPaymentTerms', paymentTerms }),
    setDueDate: (dueDate: YmdDate) => dispatch({ type: 'setDueDate', dueDate }),
    refreshLineItems: (lineItems: InvoiceLineItem[]) => dispatch({ type: 'refreshLineItems', lineItems }),
    addFee: () => dispatch({ type: 'addFee' }),
    changeFee: (key: string, patch: Partial<Omit<InvoiceFormFee, 'key'>>) => dispatch({ type: 'changeFee', key, patch }),
    removeFee: (key: string) => dispatch({ type: 'removeFee', key }),
    addNote: () => dispatch({ type: 'addNote' }),
    changeNote: (key: string, text: string) => dispatch({ type: 'changeNote', key, text }),
    removeNote: (key: string) => dispatch({ type: 'removeNote', key }),
    setStatus: (status: InvoiceManualStatus) => dispatch({ type: 'setStatus', status }),
    setPaymentField: (field: keyof InvoiceManualPaymentInput, value: string) => dispatch({ type: 'setPayment', field, value }),
    setDelivery: (patch: Partial<InvoiceDeliveryChoice>) => dispatch({ type: 'setDelivery', patch }),
  }), []);

  return {
    state,
    actions,
    isEditing: invoice !== null,
    /** Invoice pagado: estado, servicios y fees no cambian (decisión de Omar). */
    isPaymentLocked: invoice !== null && isPaidStatus(invoice.status),
  };
}
