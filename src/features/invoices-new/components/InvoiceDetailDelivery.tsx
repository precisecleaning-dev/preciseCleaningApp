// Detalle · entrega: envíos por correo y el enlace de pago registrado. (El
// envío llega en su etapa.)
import type { Invoice } from '../../../types/index';
import { formatDateTime } from '../../../utils/dateFormat';

interface InvoiceDetailDeliveryProps {
  invoice: Invoice;
}

const InvoiceDetailDelivery = ({ invoice }: InvoiceDetailDeliveryProps) => {
  const { delivery } = invoice;
  const deliveryText = delivery.sendCount > 0
    ? `Sent ${delivery.sendCount} time(s) · last to ${delivery.lastTo} on ${formatDateTime(delivery.lastAt)}`
    : 'Not sent yet.';

  return (
    <dl className="invdt-facts">
      <div className="invdt-fact">
        <dt>Delivery</dt>
        <dd>{deliveryText}</dd>
      </div>
      {invoice.paymentLinkUrl && (
        <div className="invdt-fact">
          <dt>Stripe payment link</dt>
          <dd className="invdt-link">{invoice.paymentLinkUrl}</dd>
        </div>
      )}
    </dl>
  );
};

export default InvoiceDetailDelivery;
