// Monto (subtotal en USD) y tasa de impuesto, con el resumen Subtotal / Tax /
// Total due que se actualiza mientras se escribe.
import { formatCents, bpsToPercent } from '../invoiceMath';
import InvoiceFormField from './InvoiceFormField';

interface InvoiceAmountFieldsProps {
  amountText: string;
  taxRateText: string;
  onAmountChange: (amountText: string) => void;
  onTaxRateChange: (taxRateText: string) => void;
  subtotalCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
  /** Invoice pagado: monto y tasa bloqueados. */
  isLocked: boolean;
  amountError?: string;
  taxRateError?: string;
  /** Aviso cuando el total no coincide con el Final Cost del job. */
  jobAmountHint: string | null;
}

const InvoiceAmountFields = ({
  amountText, taxRateText, onAmountChange, onTaxRateChange, subtotalCents, taxRateBps, taxCents, totalCents, isLocked,
  amountError, taxRateError, jobAmountHint,
}: InvoiceAmountFieldsProps) => (
  <>
    <div className="invf-grid-2">
      <InvoiceFormField htmlFor="invoice-amount" label="Invoice amount" error={amountError}>
        <div className="invf-affix-input">
          <span className="invf-affix" aria-hidden="true">$</span>
          <input
            id="invoice-amount"
            className="invf-input"
            inputMode="decimal"
            placeholder="0.00"
            value={amountText}
            disabled={isLocked}
            onChange={(event) => onAmountChange(event.target.value)}
          />
          <span className="invf-affix" aria-hidden="true">USD</span>
        </div>
      </InvoiceFormField>
      <InvoiceFormField htmlFor="invoice-tax-rate" label="Tax rate" error={taxRateError}>
        <div className="invf-affix-input">
          <input
            id="invoice-tax-rate"
            className="invf-input"
            inputMode="decimal"
            placeholder="0"
            value={taxRateText}
            disabled={isLocked}
            onChange={(event) => onTaxRateChange(event.target.value)}
          />
          <span className="invf-affix" aria-hidden="true">%</span>
        </div>
      </InvoiceFormField>
    </div>
    {jobAmountHint && <p className="invf-warning" role="status">{jobAmountHint}</p>}
    <div className="invf-amount-summary" role="status" aria-live="polite" aria-atomic="true">
      <div className="invf-summary-item">
        <span>Subtotal</span>
        <strong>{formatCents(subtotalCents)}</strong>
      </div>
      <div className="invf-summary-item">
        <span>{`Tax (${bpsToPercent(taxRateBps)}%)`}</span>
        <strong>{formatCents(taxCents)}</strong>
      </div>
      <div className="invf-summary-item is-total">
        <span>Total due · USD</span>
        <strong>{formatCents(totalCents)}</strong>
      </div>
    </div>
  </>
);

export default InvoiceAmountFields;
