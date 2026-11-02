// Detalle · datos del invoice: cliente, job, fechas (servicio, emisión,
// vencimiento con días de atraso) y correo registrado.
import type { Invoice, YmdDate } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import { INVOICE_PAYMENT_TERM_LABELS } from '../invoiceMath';
import { getLateDays } from '../invoiceStatus';

interface InvoiceDetailFactsProps {
  invoice: Invoice;
  today: YmdDate;
}

const InvoiceDetailFacts = ({ invoice, today }: InvoiceDetailFactsProps) => {
  const lateDays = getLateDays(invoice, today);
  const jobText = [invoice.job.address, invoice.job.unit, invoice.job.city].filter(Boolean).join(' · ');
  const clientContact = [invoice.client.phone, [invoice.client.address, invoice.client.cityStateZip].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(' · ');
  const dueText = lateDays > 0 ? `${formatDate(invoice.dueDate)} · ${lateDays} day(s) overdue` : formatDate(invoice.dueDate);

  return (
    <dl className="invdt-facts">
      <div className="invdt-fact">
        <dt>Client</dt>
        <dd>
          {invoice.client.name || 'Unknown client'}
          {clientContact && <span className="invdt-secondary">{clientContact}</span>}
        </dd>
      </div>
      <div className="invdt-fact">
        <dt>Job</dt>
        <dd>
          {jobText || 'No address'}
          {invoice.job.serviceName && <span className="invdt-secondary">{invoice.job.serviceName}</span>}
        </dd>
      </div>
      <div className="invdt-fact">
        <dt>Service date</dt>
        <dd>{invoice.job.serviceDate ? formatDate(invoice.job.serviceDate) : 'No service date'}</dd>
      </div>
      <div className="invdt-fact">
        <dt>Issue date</dt>
        <dd>{formatDate(invoice.issueDate)}</dd>
      </div>
      <div className="invdt-fact">
        <dt>Due date</dt>
        <dd className={lateDays > 0 ? 'invdt-late' : undefined}>
          {dueText}
          <span className="invdt-secondary">{INVOICE_PAYMENT_TERM_LABELS[invoice.paymentTerms]}</span>
        </dd>
      </div>
      <div className="invdt-fact">
        <dt>Client email</dt>
        <dd>{invoice.recipientEmail || 'No email on file'}</dd>
      </div>
    </dl>
  );
};

export default InvoiceDetailFacts;
