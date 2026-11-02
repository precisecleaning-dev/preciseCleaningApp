// Estado de pago al crear: Awaiting Payment o Paid (pago recibido fuera de
// Stripe, con sus datos reales). Los dos estados automáticos se ven pero no se
// eligen. Al editar el estado no cambia aquí (Mark as Paid, en el detalle).
import type { InvoiceManualPaymentInput, InvoiceStatus } from '../../../types/index';
import type { ManualPaymentErrors } from '../invoicePayment';
import { INVOICE_STATUS_DESCRIPTIONS, INVOICE_STATUS_LABELS } from '../invoiceStatus';
import InvoiceFormField from './InvoiceFormField';
import InvoiceManualPaymentFields from './InvoiceManualPaymentFields';

const AUTOMATIC_STATUSES: InvoiceStatus[] = ['payment_link_sent', 'paid_via_stripe'];

interface InvoicePaymentFieldsProps {
  status: 'awaiting_payment' | 'paid';
  onStatusChange: (status: 'awaiting_payment' | 'paid') => void;
  payment: InvoiceManualPaymentInput;
  onPaymentChange: (field: keyof InvoiceManualPaymentInput, value: string) => void;
  /** Al editar: estado actual del invoice, solo lectura. */
  savedStatus: InvoiceStatus | null;
  paymentErrors: ManualPaymentErrors;
}

const InvoicePaymentFields = ({
  status, onStatusChange, payment, onPaymentChange, savedStatus, paymentErrors,
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
        <InvoiceManualPaymentFields payment={payment} onPaymentChange={onPaymentChange} errors={paymentErrors} />
      )}
    </>
  );
};

export default InvoicePaymentFields;
