// Fees del invoice: ninguno, uno o varios, cada uno con nombre libre y
// porcentaje del SUBTOTAL de servicios (sin impuesto; el fee no paga impuesto,
// decisión de Omar). Se agregan con "Add fee" (en el encabezado de la sección)
// y se quitan con la X, como las notas. Muestra el monto de cada uno.
import { X } from 'lucide-react';
import type { InvoiceFee } from '../../../types/index';
import type { InvoiceFormFee } from '../hooks/useInvoiceForm';
import { INVOICE_LIMITS } from '../invoiceLimits';
import { formatCents } from '../invoiceMath';

interface InvoiceFeesEditorProps {
  fees: InvoiceFormFee[];
  /** Fees con su monto calculado (computeInvoiceTotals), por id. */
  computedFees: InvoiceFee[];
  onChangeFee: (key: string, patch: Partial<Omit<InvoiceFormFee, 'key'>>) => void;
  onRemoveFee: (key: string) => void;
  /** Invoice pagado: los fees no cambian. */
  isLocked: boolean;
  error?: string;
}

const InvoiceFeesEditor = ({ fees, computedFees, onChangeFee, onRemoveFee, isLocked, error }: InvoiceFeesEditorProps) => {
  if (fees.length === 0) {
    return <p className="invf-help">No fees. Use “Add fee” to charge a percentage of the services subtotal.</p>;
  }

  return (
    <div className="invf-fees">
      {fees.map((fee, feeIndex) => {
        const feeNumber = feeIndex + 1;
        const feeAmountCents = computedFees.find((computedFee) => computedFee.id === fee.key)?.amountCents ?? 0;
        return (
          <div key={fee.key} className="invf-fee-row">
            <label className="invn-sr-only" htmlFor={`invoice-fee-name-${fee.key}`}>{`Fee ${feeNumber} name`}</label>
            <input
              id={`invoice-fee-name-${fee.key}`}
              className="invf-fee-name invf-input"
              maxLength={INVOICE_LIMITS.feeLabel}
              placeholder="Fee name, e.g. Card processing"
              value={fee.label}
              disabled={isLocked}
              onChange={(event) => onChangeFee(fee.key, { label: event.target.value })}
            />
            <div className="invf-affix-input invf-fee-rate">
              <label className="invn-sr-only" htmlFor={`invoice-fee-rate-${fee.key}`}>{`Fee ${feeNumber} percentage`}</label>
              <input
                id={`invoice-fee-rate-${fee.key}`}
                className="invf-input"
                inputMode="decimal"
                placeholder="0"
                value={fee.rateText}
                disabled={isLocked}
                onChange={(event) => onChangeFee(fee.key, { rateText: event.target.value })}
              />
              <span className="invf-affix" aria-hidden="true">%</span>
            </div>
            <span className="invf-fee-amount">{formatCents(feeAmountCents)}</span>
            {!isLocked && (
              <button
                type="button"
                className="invf-icon-btn"
                aria-label={`Remove fee ${feeNumber}`}
                onClick={() => onRemoveFee(fee.key)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        );
      })}
      {error && <p className="invf-error" role="alert">{error}</p>}
    </div>
  );
};

export default InvoiceFeesEditor;
