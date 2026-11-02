// Detalle · montos: subtotal, tasa, impuesto, total y saldo pendiente, y los
// datos del pago si ya está pagado.
import type { Invoice } from '../../../types/index';
import { formatDate, formatDateTime } from '../../../utils/dateFormat';
import { bpsToPercent, formatCents } from '../invoiceMath';
import { getBalanceCents } from '../invoiceStatus';

interface InvoiceDetailAmountsProps {
  invoice: Invoice;
}

const InvoiceDetailAmounts = ({ invoice }: InvoiceDetailAmountsProps) => {
  const { payment } = invoice;
  const paymentLine = payment
    ? [payment.method, formatDate(payment.paidDate), payment.reference && `Ref. ${payment.reference}`].filter(Boolean).join(' · ')
    : '';
  const recordedLine = payment ? `Recorded by ${payment.recordedByUserName} on ${formatDateTime(payment.recordedAt)}` : '';

  return (
    <div className="invdt-amounts">
      <dl className="invdt-amount-list">
        <div className="invdt-amount-row">
          <dt>Subtotal</dt>
          <dd>{formatCents(invoice.subtotalCents)}</dd>
        </div>
        <div className="invdt-amount-row">
          <dt>{`Tax (${bpsToPercent(invoice.taxRateBps)}%)`}</dt>
          <dd>{formatCents(invoice.taxCents)}</dd>
        </div>
        <div className="invdt-amount-row is-total">
          <dt>Total · USD</dt>
          <dd>{formatCents(invoice.totalCents)}</dd>
        </div>
        <div className="invdt-amount-row is-balance">
          <dt>Balance due</dt>
          <dd>{formatCents(getBalanceCents(invoice))}</dd>
        </div>
      </dl>
      {payment && (
        <div className="invdt-payment">
          <strong className="invdt-payment-title">Payment received</strong>
          <span>{paymentLine}</span>
          {payment.note && <span className="invdt-secondary">{payment.note}</span>}
          <span className="invdt-secondary">{recordedLine}</span>
        </div>
      )}
    </div>
  );
};

export default InvoiceDetailAmounts;
