// Estado de pago al crear: Awaiting Payment o Paid (pago recibido fuera de
// Stripe, con sus datos reales). Los dos estados automáticos se ven pero no se
// eligen. Al editar el estado no cambia aquí (Mark as Paid, en el detalle).
import type { InvoiceManualMethod, InvoiceManualPaymentInput, InvoiceStatus } from '../../../types/index';
import { INVOICE_STATUS_DESCRIPTIONS, INVOICE_STATUS_LABELS } from '../invoiceStatus';
import DateInput from '../../../shared/components/DateInput';
import InvoiceFormField from './InvoiceFormField';
import { INVOICE_LIMITS } from '../../../services/invoicesService';

const MANUAL_METHODS: InvoiceManualMethod[] = ['Cash', 'Bank transfer', 'Check', 'Other'];
const AUTOMATIC_STATUSES: InvoiceStatus[] = ['payment_link_sent', 'paid_via_stripe'];

interface InvoicePaymentFieldsProps {
  status: 'awaiting_payment' | 'paid';
  onStatusChange: (status: 'awaiting_payment' | 'paid') => void;
  payment: InvoiceManualPaymentInput;
  onPaymentMethodChange: (method: InvoiceManualMethod) => void;
  onPaymentFieldChange: (field: keyof InvoiceManualPaymentInput, value: string) => void;
  /** Al editar: estado actual del invoice, solo lectura. */
  savedStatus: InvoiceStatus | null;
  paymentDateError?: string;
  paymentReferenceError?: string;
  paymentNoteError?: string;
}

const InvoicePaymentFields = ({
  status, onStatusChange, payment, onPaymentMethodChange, onPaymentFieldChange, savedStatus, paymentDateError,
  paymentReferenceError, paymentNoteError,
}: InvoicePaymentFieldsProps) => {
  if (savedStatus) {
    return (
      <p className="invf-help">
        {`Payment status: ${INVOICE_STATUS_LABELS[savedStatus]}. ${INVOICE_STATUS_DESCRIPTIONS[savedStatus]}`}
      </p>
    );
  }

  return (
    <>
      <InvoiceFormField htmlFor="invoice-status" label="Payment status" help={INVOICE_STATUS_DESCRIPTIONS[status]}>
        <select
          id="invoice-status"
          className="invf-input"
          value={status}
          onChange={(event) => onStatusChange(event.target.value as 'awaiting_payment' | 'paid')}
        >
          <option value="awaiting_payment">{INVOICE_STATUS_LABELS.awaiting_payment}</option>
          <option value="paid">{INVOICE_STATUS_LABELS.paid}</option>
          {AUTOMATIC_STATUSES.map((automaticStatus) => (
            <option key={automaticStatus} value={automaticStatus} disabled>
              {`${INVOICE_STATUS_LABELS[automaticStatus]} · Automatic`}
            </option>
          ))}
        </select>
      </InvoiceFormField>
      {status === 'paid' && (
        <div className="invf-grid-2">
          <InvoiceFormField htmlFor="invoice-payment-method" label="Payment method">
            <select
              id="invoice-payment-method"
              className="invf-input"
              value={payment.method}
              onChange={(event) => onPaymentMethodChange(event.target.value as InvoiceManualMethod)}
            >
              {MANUAL_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
            </select>
          </InvoiceFormField>
          <InvoiceFormField htmlFor="invoice-payment-date" label="Payment date" error={paymentDateError}>
            <DateInput
              id="invoice-payment-date"
              className="invf-input"
              value={payment.paidDate}
              onChange={(paidDate) => onPaymentFieldChange('paidDate', paidDate)}
            />
          </InvoiceFormField>
          <InvoiceFormField htmlFor="invoice-payment-reference" label="Reference (optional)" error={paymentReferenceError}>
            <input
              id="invoice-payment-reference"
              className="invf-input"
              maxLength={INVOICE_LIMITS.paymentReference}
              placeholder="Transfer or receipt number"
              value={payment.reference}
              onChange={(event) => onPaymentFieldChange('reference', event.target.value)}
            />
          </InvoiceFormField>
          <InvoiceFormField htmlFor="invoice-payment-note" label="Payment note (optional)" error={paymentNoteError}>
            <input
              id="invoice-payment-note"
              className="invf-input"
              maxLength={INVOICE_LIMITS.paymentNote}
              value={payment.note}
              onChange={(event) => onPaymentFieldChange('note', event.target.value)}
            />
          </InvoiceFormField>
        </div>
      )}
    </>
  );
};

export default InvoicePaymentFields;
