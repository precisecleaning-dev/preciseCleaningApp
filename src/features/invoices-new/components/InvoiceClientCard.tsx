// Datos del cliente del job elegido (solo lectura): no hay selector de
// cliente, sale del job.
import type { InvoiceClientSnapshot } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';

interface InvoiceClientCardProps {
  client: InvoiceClientSnapshot;
  serviceDate: string;
}

const InvoiceClientCard = ({ client, serviceDate }: InvoiceClientCardProps) => {
  const contactLine = [client.email, client.phone].filter(Boolean).join(' · ');
  const addressLine = [client.address, client.cityStateZip].filter(Boolean).join(', ');
  const serviceDateText = serviceDate ? formatDate(serviceDate) : 'No service date';

  return (
    <div className="invf-client-card" aria-label="Client of the selected job">
      <div className="invf-client-main">
        <span className="invf-client-label">Client</span>
        <strong className="invf-client-name">{client.name || 'Unknown client'}</strong>
        {contactLine && <span className="invf-client-line">{contactLine}</span>}
        {addressLine && <span className="invf-client-line">{addressLine}</span>}
        {!client.email && <span className="invf-client-warning">This client has no email on file.</span>}
      </div>
      <div className="invf-client-side">
        <span className="invf-client-label">Service date</span>
        <strong className="invf-client-name">{serviceDateText}</strong>
      </div>
    </div>
  );
};

export default InvoiceClientCard;
