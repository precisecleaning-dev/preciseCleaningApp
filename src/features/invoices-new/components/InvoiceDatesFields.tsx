// Fechas del invoice: emisión, plazo y vencimiento. El vencimiento se calcula
// con el plazo; si se elige a mano, el plazo pasa a Custom date.
import type { InvoicePaymentTerms, YmdDate } from '../../../types/index';
import DateInput from '../../../shared/components/DateInput';
import InvoiceFormField from './InvoiceFormField';

const PAYMENT_TERM_OPTIONS: { value: InvoicePaymentTerms; label: string }[] = [
  { value: 'due_on_receipt', label: 'Due on receipt' },
  { value: 'net_7', label: 'Within 7 days' },
  { value: 'net_15', label: 'Within 15 days' },
  { value: 'net_30', label: 'Within 30 days' },
  { value: 'custom', label: 'Custom date' },
];

interface InvoiceDatesFieldsProps {
  issueDate: YmdDate;
  paymentTerms: InvoicePaymentTerms;
  dueDate: YmdDate;
  onIssueDateChange: (issueDate: YmdDate) => void;
  onPaymentTermsChange: (paymentTerms: InvoicePaymentTerms) => void;
  onDueDateChange: (dueDate: YmdDate) => void;
  issueDateError?: string;
  dueDateError?: string;
}

const InvoiceDatesFields = ({
  issueDate, paymentTerms, dueDate, onIssueDateChange, onPaymentTermsChange, onDueDateChange, issueDateError, dueDateError,
}: InvoiceDatesFieldsProps) => (
  <div className="invf-grid-3">
    <InvoiceFormField htmlFor="invoice-issue-date" label="Issue date" error={issueDateError}>
      <DateInput id="invoice-issue-date" className="invf-input" value={issueDate} onChange={onIssueDateChange} />
    </InvoiceFormField>
    <InvoiceFormField htmlFor="invoice-payment-terms" label="Payment terms">
      <select
        id="invoice-payment-terms"
        className="invf-input"
        value={paymentTerms}
        onChange={(event) => onPaymentTermsChange(event.target.value as InvoicePaymentTerms)}
      >
        {PAYMENT_TERM_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </InvoiceFormField>
    <InvoiceFormField htmlFor="invoice-due-date" label="Due date" error={dueDateError}>
      <DateInput id="invoice-due-date" className="invf-input" value={dueDate} onChange={onDueDateChange} />
    </InvoiceFormField>
  </div>
);

export default InvoiceDatesFields;
