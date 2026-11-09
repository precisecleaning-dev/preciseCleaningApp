// Resumen de montos del formulario: Subtotal (servicios), Tax, cada fee y
// Total due. Se actualiza mientras se agregan o cambian los fees.
import type { InvoiceTotals } from '../../../types/index';
import { bpsToPercent, formatCents } from '../invoiceMath';

interface InvoiceTotalsSummaryProps {
  totals: InvoiceTotals;
}

const InvoiceTotalsSummary = ({ totals }: InvoiceTotalsSummaryProps) => {
  const taxLabel = totals.taxRateBps > 0 ? `Tax (${bpsToPercent(totals.taxRateBps)}%)` : 'Tax';
  return (
    <div className="invf-amount-summary" role="status" aria-live="polite" aria-atomic="true">
      <div className="invf-summary-item">
        <span>Subtotal</span>
        <strong>{formatCents(totals.subtotalCents)}</strong>
      </div>
      <div className="invf-summary-item">
        <span>{taxLabel}</span>
        <strong>{formatCents(totals.taxCents)}</strong>
      </div>
      {totals.fees.map((fee) => (
        <div key={fee.id} className="invf-summary-item">
          <span>{`${fee.label || 'Fee'} (${bpsToPercent(fee.rateBps)}%)`}</span>
          <strong>{formatCents(fee.amountCents)}</strong>
        </div>
      ))}
      <div className="invf-summary-item is-total">
        <span>Total due · USD</span>
        <strong>{formatCents(totals.totalCents)}</strong>
      </div>
    </div>
  );
};

export default InvoiceTotalsSummary;
