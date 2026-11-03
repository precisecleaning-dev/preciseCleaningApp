// Detalle · entrega: el último envío por correo (enviado, con error o en
// proceso; lo escribe la Cloud Function sendinvoiceemail) y el enlace de pago
// registrado. El historial completo está en Activity.
import type { Invoice } from '../../../types/index';
import { formatDateTime } from '../../../utils/dateFormat';

interface InvoiceDetailDeliveryProps {
  invoice: Invoice;
}

const describeLastContent = (invoice: Invoice): string => {
  const { lastIncludedPdf, lastIncludedPaymentLink } = invoice.delivery;
  if (lastIncludedPdf && lastIncludedPaymentLink) return 'PDF and payment link';
  return lastIncludedPdf ? 'PDF' : 'payment link';
};

const describeDelivery = (invoice: Invoice): string => {
  const { delivery } = invoice;
  if (delivery.sendCount === 0) return 'Not sent yet.';
  const when = formatDateTime(delivery.lastAt);
  const content = describeLastContent(invoice);
  if (delivery.lastResult === 'processing') return `Sending ${content} to ${delivery.lastTo}…`;
  if (delivery.lastResult === 'error') return `The last email to ${delivery.lastTo} (${when}) failed. See Activity.`;
  return `${content.charAt(0).toUpperCase()}${content.slice(1)} sent to ${delivery.lastTo} on ${when}.`;
};

const InvoiceDetailDelivery = ({ invoice }: InvoiceDetailDeliveryProps) => (
  <dl className="invdt-facts">
    <div className="invdt-fact">
      <dt>Last email</dt>
      <dd>{describeDelivery(invoice)}</dd>
    </div>
    {invoice.delivery.sendCount > 1 && (
      <div className="invdt-fact">
        <dt>Attempts</dt>
        <dd>{invoice.delivery.sendCount}</dd>
      </div>
    )}
    {invoice.paymentLinkUrl && (
      <div className="invdt-fact">
        <dt>Stripe payment link</dt>
        <dd className="invdt-link">{invoice.paymentLinkUrl}</dd>
      </div>
    )}
  </dl>
);

export default InvoiceDetailDelivery;
