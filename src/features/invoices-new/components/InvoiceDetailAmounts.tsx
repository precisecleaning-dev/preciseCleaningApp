// Detalle · montos: los servicios del job copiados al invoice, subtotal,
// impuesto, cada fee, total y saldo pendiente, y los datos del pago si ya está
// pagado. Un invoice de prueba viejo (sin servicios guardados) muestra solo los montos.
import type { Invoice, InvoiceLineItem } from '../../../types/index';
import { formatDate, formatDateTime } from '../../../utils/dateFormat';
import { bpsToPercent, formatCents } from '../invoiceMath';
import { getBalanceCents } from '../invoiceStatus';

/** "2 × $100.00 · +$16.50 tax (8.25%)" de una línea. */
const getLineDetail = (lineItem: InvoiceLineItem): string => {
  const quantityText = `${lineItem.quantity} × ${formatCents(lineItem.unitPriceCents)}`;
  if (lineItem.taxMode === 'added') {
    return `${quantityText} · +${formatCents(lineItem.taxCents)} tax (${bpsToPercent(lineItem.taxRateBps)}%)`;
  }
  if (lineItem.taxMode === 'subtracted') return `${quantityText} · tax deducted (${bpsToPercent(lineItem.taxRateBps)}%)`;
  return quantityText;
};

interface InvoiceDetailAmountsProps {
  invoice: Invoice;
}

const InvoiceDetailAmounts = ({ invoice }: InvoiceDetailAmountsProps) => {
  const { payment } = invoice;
  const paymentLine = payment
    ? [payment.method, formatDate(payment.paidDate), payment.reference && `Ref. ${payment.reference}`].filter(Boolean).join(' · ')
    : '';
  const recordedLine = payment ? `Recorded by ${payment.recordedByUserName} on ${formatDateTime(payment.recordedAt)}` : '';
  const taxLabel = invoice.taxRateBps > 0 ? `Tax (${bpsToPercent(invoice.taxRateBps)}%)` : 'Tax';

  return (
    <div className="invdt-amounts">
      {invoice.lineItems.length > 0 && (
        <ul className="invdt-services" aria-label="Services">
          {invoice.lineItems.map((lineItem) => (
            <li key={lineItem.billingServiceId || lineItem.serviceName} className="invdt-service">
              <span className="invdt-service-name">
                {lineItem.serviceName}
                <span className="invdt-secondary">{getLineDetail(lineItem)}</span>
                {lineItem.notes && <span className="invdt-secondary">{lineItem.notes}</span>}
              </span>
              <span className="invdt-service-amount">{formatCents(lineItem.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}
      <dl className="invdt-amount-list">
        <div className="invdt-amount-row">
          <dt>Subtotal</dt>
          <dd>{formatCents(invoice.subtotalCents)}</dd>
        </div>
        <div className="invdt-amount-row">
          <dt>{taxLabel}</dt>
          <dd>{formatCents(invoice.taxCents)}</dd>
        </div>
        {invoice.fees.map((fee) => (
          <div key={fee.id} className="invdt-amount-row">
            <dt>{`${fee.label} (${bpsToPercent(fee.rateBps)}%)`}</dt>
            <dd>{formatCents(fee.amountCents)}</dd>
          </div>
        ))}
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
