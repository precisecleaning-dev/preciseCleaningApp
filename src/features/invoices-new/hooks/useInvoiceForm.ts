// src/features/invoices-new/hooks/useInvoiceForm.ts
// ============================================================================
// Estado del formulario Create / Edit Invoice (useReducer) y, en funciones
// puras, lo que se deriva de él: montos en centavos y errores.
//
// Monto y tasa: mientras el usuario no los toca (`null`), el formulario
// muestra los del job (getInvoiceDefaults) en el render; no hay un efecto que
// los copie al estado cuando llegan los servicios del job.
// ============================================================================
import { useMemo, useReducer } from 'react';
import type {
  Invoice, InvoiceManualPaymentInput, InvoiceNote, InvoicePaymentTerms,
  YmdDate,
} from '../../../types/index';
import { todayIso } from '../../../utils/dateFormat';
import { bpsToPercent, computeTotals, dueFromTerms, termsFromDates } from '../invoiceMath';
import { isPaidStatus } from '../invoiceStatus';
import { createEmptyManualPayment, getManualPaymentErrors } from '../invoicePayment';
import { INVOICE_LIMITS } from '../../../services/invoicesService';

const DEFAULT_TERMS: InvoicePaymentTerms = 'net_15';
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/** Una nota del formulario: `original` = la nota guardada (al editar). */
export interface InvoiceFormNote {
  key: string;
  text: string;
  original: InvoiceNote | null;
}

export interface InvoiceFormState {
  propertyId: string;
  issueDate: YmdDate;
  paymentTerms: InvoicePaymentTerms;
  dueDate: YmdDate;
  /** null = sin tocar: se muestra el monto que trae el job. */
  amountText: string | null;
  /** null = sin tocar: se muestra la tasa que trae el job. */
  taxRateText: string | null;
  notes: InvoiceFormNote[];
  status: 'awaiting_payment' | 'paid';
  payment: InvoiceManualPaymentInput;
}

type InvoiceFormAction =
  | { type: 'selectJob'; propertyId: string }
  | { type: 'setIssueDate'; issueDate: YmdDate }
  | { type: 'setPaymentTerms'; paymentTerms: InvoicePaymentTerms }
  | { type: 'setDueDate'; dueDate: YmdDate }
  | { type: 'setAmount'; amountText: string }
  | { type: 'setTaxRate'; taxRateText: string }
  | { type: 'addNote' }
  | { type: 'changeNote'; key: string; text: string }
  | { type: 'removeNote'; key: string }
  | { type: 'setStatus'; status: 'awaiting_payment' | 'paid' }
  | { type: 'setPayment'; field: keyof InvoiceManualPaymentInput; value: string };

const emptyNote = (): InvoiceFormNote => ({ key: crypto.randomUUID(), text: '', original: null });

const centsToText = (cents: number): string => (cents / 100).toFixed(2);

const createInitialState = (invoice: Invoice | null): InvoiceFormState => {
  if (!invoice) {
    const issueDate = todayIso();
    return {
      propertyId: '',
      issueDate,
      paymentTerms: DEFAULT_TERMS,
      dueDate: dueFromTerms(issueDate, DEFAULT_TERMS, issueDate),
      amountText: null,
      taxRateText: null,
      notes: [emptyNote()],
      status: 'awaiting_payment',
      payment: createEmptyManualPayment(),
    };
  }
  const savedNotes = invoice.notes.map((note) => ({ key: note.id, text: note.text, original: note }));
  return {
    propertyId: invoice.propertyId,
    issueDate: invoice.issueDate,
    paymentTerms: invoice.paymentTerms,
    dueDate: invoice.dueDate,
    amountText: centsToText(invoice.subtotalCents),
    taxRateText: String(bpsToPercent(invoice.taxRateBps)),
    notes: savedNotes.length > 0 ? savedNotes : [emptyNote()],
    status: isPaidStatus(invoice.status) ? 'paid' : 'awaiting_payment',
    payment: createEmptyManualPayment(),
  };
};

function invoiceFormReducer(state: InvoiceFormState, action: InvoiceFormAction): InvoiceFormState {
  switch (action.type) {
    case 'selectJob':
      // Otro job: vuelven el monto y la tasa que traiga ese job.
      return { ...state, propertyId: action.propertyId, amountText: null, taxRateText: null };
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
    case 'setAmount':
      return { ...state, amountText: action.amountText };
    case 'setTaxRate':
      return { ...state, taxRateText: action.taxRateText };
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
    default:
      return state;
  }
}

/** Errores por campo (vacío = se puede guardar). */
export type InvoiceFormErrors = Partial<Record<
  'job' | 'issueDate' | 'dueDate' | 'amount' | 'taxRate' | 'notes' | 'paymentDate' | 'paymentReference' | 'paymentNote',
  string
>>;

/** Texto "12.50" → centavos (null si no es un monto válido de hasta dos decimales). */
const parseAmountCents = (text: string): number | null =>
  AMOUNT_PATTERN.test(text.trim()) ? Math.round(Number(text) * 100) : null;

/** Texto "8.25" → puntos base (null si no es una tasa válida de 0 a 100 con hasta dos decimales). */
const parseTaxRateBps = (text: string): number | null => {
  if (!AMOUNT_PATTERN.test(text.trim())) return null;
  const basisPoints = Math.round(Number(text) * 100);
  return basisPoints <= INVOICE_LIMITS.maxTaxRateBps ? basisPoints : null;
};

/** Montos del job elegido (getInvoiceDefaults). */
export interface InvoiceFormDefaults {
  subtotalCents: number;
  taxRateBps: number;
}

/** Montos que muestra y guarda el formulario. */
export interface InvoiceFormAmounts {
  amountText: string;
  taxRateText: string;
  /** null = el texto no es un monto válido (ver errores). */
  subtotalCents: number | null;
  taxRateBps: number | null;
  taxCents: number;
  totalCents: number;
}

/**
 * Montos del formulario: lo que escribió el usuario o, si no los tocó, los del
 * job (`jobDefaults`, null mientras no hay job o no llegan sus servicios).
 */
export function getInvoiceFormAmounts(state: InvoiceFormState, jobDefaults: InvoiceFormDefaults | null): InvoiceFormAmounts {
  const amountText = state.amountText ?? (jobDefaults ? centsToText(jobDefaults.subtotalCents) : '');
  const taxRateText = state.taxRateText ?? (jobDefaults ? String(bpsToPercent(jobDefaults.taxRateBps)) : '0');
  const subtotalCents = parseAmountCents(amountText);
  const taxRateBps = parseTaxRateBps(taxRateText);
  const { taxCents, totalCents } = computeTotals(subtotalCents ?? 0, taxRateBps ?? 0);
  return { amountText, taxRateText, subtotalCents, taxRateBps, taxCents, totalCents };
}

/** Errores del formulario (vacío = se puede guardar). */
export function getInvoiceFormErrors(state: InvoiceFormState, amounts: InvoiceFormAmounts, isEditing: boolean): InvoiceFormErrors {
  const formErrors: InvoiceFormErrors = {};
  if (!state.propertyId) formErrors.job = 'Select a job.';
  if (!state.issueDate) formErrors.issueDate = 'Enter the issue date.';
  if (!state.dueDate) formErrors.dueDate = 'Enter the due date.';
  else if (state.issueDate && state.dueDate < state.issueDate) formErrors.dueDate = 'The due date cannot be before the issue date.';
  if (amounts.subtotalCents === null || amounts.subtotalCents < 1) {
    formErrors.amount = 'Enter an amount of at least $0.01, with up to two decimals.';
  }
  if (amounts.taxRateBps === null) formErrors.taxRate = 'Enter a tax rate between 0 and 100, with up to two decimals.';
  if (state.notes.some((note) => note.text.length > INVOICE_LIMITS.noteText)) {
    formErrors.notes = `Each note can have up to ${INVOICE_LIMITS.noteText} characters.`;
  }
  const paymentErrors = !isEditing && state.status === 'paid' ? getManualPaymentErrors(state.payment, state.issueDate) : {};
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
    setAmount: (amountText: string) => dispatch({ type: 'setAmount', amountText }),
    setTaxRate: (taxRateText: string) => dispatch({ type: 'setTaxRate', taxRateText }),
    addNote: () => dispatch({ type: 'addNote' }),
    changeNote: (key: string, text: string) => dispatch({ type: 'changeNote', key, text }),
    removeNote: (key: string) => dispatch({ type: 'removeNote', key }),
    setStatus: (status: 'awaiting_payment' | 'paid') => dispatch({ type: 'setStatus', status }),
    setPaymentField: (field: keyof InvoiceManualPaymentInput, value: string) => dispatch({ type: 'setPayment', field, value }),
  }), []);

  return {
    state,
    actions,
    isEditing: invoice !== null,
    /** Invoice pagado: estado, monto y tasa no cambian (decisión de Omar). */
    isPaymentLocked: invoice !== null && isPaidStatus(invoice.status),
  };
}
