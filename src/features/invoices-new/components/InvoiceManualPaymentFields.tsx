// Campos de un pago recibido fuera de Stripe: método, fecha, referencia y
// nota. Los usan el formulario (crear como Paid) y Record payment.
import { useId } from 'react';
import type { InvoiceManualMethod, InvoiceManualPaymentInput } from '../../../types/index';
import type { ManualPaymentErrors } from '../invoicePayment';
import { MANUAL_PAYMENT_METHODS } from '../invoicePayment';
import { INVOICE_LIMITS } from '../../../services/invoicesService';
import DateInput from '../../../shared/components/DateInput';
import InvoiceFormField from './InvoiceFormField';

interface InvoiceManualPaymentFieldsProps {
  payment: InvoiceManualPaymentInput;
  onPaymentChange: (field: keyof InvoiceManualPaymentInput, value: string) => void;
  errors: ManualPaymentErrors;
}

const InvoiceManualPaymentFields = ({ payment, onPaymentChange, errors }: InvoiceManualPaymentFieldsProps) => {
  const fieldIdPrefix = useId();
  const methodId = `${fieldIdPrefix}-method`;
  const dateId = `${fieldIdPrefix}-date`;
  const referenceId = `${fieldIdPrefix}-reference`;
  const noteId = `${fieldIdPrefix}-note`;

  return (
    <div className="invf-grid-2">
      <InvoiceFormField htmlFor={methodId} label="Payment method">
        <select
          id={methodId}
          className="invf-input"
          value={payment.method}
          onChange={(event) => onPaymentChange('method', event.target.value as InvoiceManualMethod)}
        >
          {MANUAL_PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
        </select>
      </InvoiceFormField>
      <InvoiceFormField htmlFor={dateId} label="Payment date" error={errors.paymentDate}>
        <DateInput id={dateId} className="invf-input" value={payment.paidDate} onChange={(paidDate) => onPaymentChange('paidDate', paidDate)} />
      </InvoiceFormField>
      <InvoiceFormField htmlFor={referenceId} label="Reference (optional)" error={errors.paymentReference}>
        <input
          id={referenceId}
          className="invf-input"
          maxLength={INVOICE_LIMITS.paymentReference}
          placeholder="Transfer or receipt number"
          value={payment.reference}
          onChange={(event) => onPaymentChange('reference', event.target.value)}
        />
      </InvoiceFormField>
      <InvoiceFormField htmlFor={noteId} label="Note (optional)" error={errors.paymentNote}>
        <input
          id={noteId}
          className="invf-input"
          maxLength={INVOICE_LIMITS.paymentNote}
          placeholder="Added to the invoice notes"
          value={payment.note}
          onChange={(event) => onPaymentChange('note', event.target.value)}
        />
      </InvoiceFormField>
    </div>
  );
};

export default InvoiceManualPaymentFields;
