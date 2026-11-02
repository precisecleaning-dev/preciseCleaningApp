// Una fila de la tabla de invoices: número, cliente / job, emisión,
// vencimiento (con días de atraso), total, estado y acciones.
import { Pencil } from 'lucide-react';
import type { Invoice, YmdDate } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import { formatCents } from '../invoiceMath';
import { getLateDays } from '../invoiceStatus';
import InvoiceStatusBadge from './InvoiceStatusBadge';

interface InvoiceRowProps {
  invoice: Invoice;
  today: YmdDate;
  canEdit: boolean;
  onEditInvoice: (invoice: Invoice) => void;
}

const InvoiceRow = ({ invoice, today, canEdit, onEditInvoice }: InvoiceRowProps) => {
  const lateDays = getLateDays(invoice, today);
  const jobLine = [invoice.job.address, invoice.job.unit, invoice.job.serviceName].filter(Boolean).join(' · ');
  const lateText = lateDays === 1 ? '1 day overdue' : `${lateDays} days overdue`;

  return (
    <tr>
      <td className="invt-number">{invoice.number}</td>
      <td className="invt-client">
        <span className="invt-client-name">{invoice.client.name || 'Unknown client'}</span>
        <span className="invt-job">{jobLine}</span>
      </td>
      <td className="invt-date">{formatDate(invoice.issueDate)}</td>
      <td className="invt-date">
        {formatDate(invoice.dueDate)}
        {lateDays > 0 && <span className="invt-late">{lateText}</span>}
      </td>
      <td className="invt-money">{formatCents(invoice.totalCents)}</td>
      <td><InvoiceStatusBadge status={invoice.status} /></td>
      <td className="invt-actions">
        {canEdit && (
          <button
            type="button"
            className="invt-action-btn"
            aria-label={`Edit invoice ${invoice.number}`}
            title="Edit"
            onClick={() => onEditInvoice(invoice)}
          >
            <Pencil size={16} aria-hidden="true" />
          </button>
        )}
      </td>
    </tr>
  );
};

export default InvoiceRow;
