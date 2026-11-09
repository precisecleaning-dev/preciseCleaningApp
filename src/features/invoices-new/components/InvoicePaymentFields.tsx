// Estado del invoice en Create / Edit: Needs Invoice (borrador), Pending o
// Paid (pago recibido fuera de Stripe, con sus datos reales). Los automáticos
// (Payment Link Sent, Paid via Stripe) se ven pero no se eligen. Un invoice
// pagado no cambia de estado; con el enlace de Stripe enviado solo se puede
// registrar el pago (getSelectableStatuses).
import type { InvoiceManualPaymentInput, InvoiceManualStatus, InvoiceStatus } from '../../../types/index';
import type { ManualPaymentErrors } from '../invoicePayment';
import {
  INVOICE_STATUS_DESCRIPTIONS, INVOICE_STATUS_LABELS, MANUAL_STATUSES, getSelectableStatuses, isPaidStatus,
} from '../invoiceStatus';
import InvoiceFormField from './InvoiceFormField';
import InvoiceManualPaymentFields from './InvoiceManualPaymentFields';

const AUTOMATIC_STATUSES: InvoiceStatus[] = ['payment_link_sent', 'paid_via_stripe'];

interface InvoicePaymentFieldsProps {
  /** Estado elegido en el formulario (al editar empieza en el guardado). */
  status: InvoiceStatus;
  onStatusChange: (status: InvoiceManualStatus) => void;
  payment: InvoiceManualPaymentInput;
  onPaymentChange: (field: keyof InvoiceManualPaymentInput, value: string) => void;
  /** Al editar: estado guardado del invoice (null al crear). */
  savedStatus: InvoiceStatus | null;
  paymentErrors: ManualPaymentErrors;
}

const InvoicePaymentFields = ({
  status, onStatusChange, payment, onPaymentChange, savedStatus, paymentErrors,
}: InvoicePaymentFieldsProps) => {
  if (savedStatus && isPaidStatus(savedStatus)) {
    return (
      <p className="invf-help">
        {`Payment status: ${INVOICE_STATUS_LABELS[savedStatus]}. ${INVOICE_STATUS_DESCRIPTIONS[savedStatus]}`}
      </p>
    );
  }

  const selectableStatuses = getSelectableStatuses(savedStatus);
  const isRecordingPayment = status === 'paid';

  return (
    <>
      <InvoiceFormField htmlFor="invoice-status" label="Status" help={INVOICE_STATUS_DESCRIPTIONS[status]}>
        <select
          id="invoice-status"
          className="invf-input"
          value={status}
          onChange={(event) => onStatusChange(event.target.value as InvoiceManualStatus)}
        >
          {MANUAL_STATUSES.map((manualStatus) => (
            <option key={manualStatus} value={manualStatus} disabled={!selectableStatuses.includes(manualStatus)}>
              {INVOICE_STATUS_LABELS[manualStatus]}
            </option>
          ))}
          {AUTOMATIC_STATUSES.map((automaticStatus) => (
            <option key={automaticStatus} value={automaticStatus} disabled>
              {`${INVOICE_STATUS_LABELS[automaticStatus]} · Automatic`}
            </option>
          ))}
        </select>
      </InvoiceFormField>
      {isRecordingPayment && (
        <InvoiceManualPaymentFields payment={payment} onPaymentChange={onPaymentChange} errors={paymentErrors} />
      )}
    </>
  );
};

export default InvoicePaymentFields;
