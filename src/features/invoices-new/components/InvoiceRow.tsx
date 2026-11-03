// Una fila de la tabla de invoices: número (abre el detalle), cliente / job,
// emisión, vencimiento (con días de atraso), total, estado y menú de acciones.
import { CheckCircle2, Download, Eye, FileText, Pencil } from 'lucide-react';
import type { Invoice, YmdDate } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import { formatCents } from '../invoiceMath';
import { getLateDays, isPaidStatus } from '../invoiceStatus';
import ActionMenu, { type ActionMenuItem } from '../../../shared/components/ActionMenu';
import InvoiceStatusBadge from './InvoiceStatusBadge';

/** Acciones sobre un invoice (la fila las recibe con el invoice como parámetro). */
export interface InvoiceRowActions {
  onViewInvoice: (invoice: Invoice) => void;
  onEditInvoice: (invoice: Invoice) => void;
  onMarkAsPaid: (invoice: Invoice) => void;
  onPreviewPdf: (invoice: Invoice) => void;
  onDownloadPdf: (invoice: Invoice) => void;
}

interface InvoiceRowProps extends InvoiceRowActions {
  invoice: Invoice;
  today: YmdDate;
  canEdit: boolean;
}

const InvoiceRow = ({
  invoice, today, canEdit, onViewInvoice, onEditInvoice, onMarkAsPaid, onPreviewPdf, onDownloadPdf,
}: InvoiceRowProps) => {
  const lateDays = getLateDays(invoice, today);
  const jobLine = [invoice.job.address, invoice.job.unit, invoice.job.serviceName].filter(Boolean).join(' · ');
  const lateText = lateDays === 1 ? '1 day overdue' : `${lateDays} days overdue`;
  const menuItems: ActionMenuItem[] = [
    { key: 'view', label: 'View details', icon: Eye, onSelect: () => onViewInvoice(invoice) },
    ...(canEdit ? [{ key: 'edit', label: 'Edit', icon: Pencil, onSelect: () => onEditInvoice(invoice) }] : []),
    { key: 'preview-pdf', label: 'Preview PDF', icon: FileText, onSelect: () => onPreviewPdf(invoice) },
    { key: 'download-pdf', label: 'Download PDF', icon: Download, onSelect: () => onDownloadPdf(invoice) },
    ...(canEdit && !isPaidStatus(invoice.status)
      ? [{ key: 'mark-paid', label: 'Mark as Paid', icon: CheckCircle2, onSelect: () => onMarkAsPaid(invoice) }]
      : []),
  ];

  return (
    <tr>
      <td>
        <button type="button" className="invt-number" onClick={() => onViewInvoice(invoice)}>{invoice.number}</button>
      </td>
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
        <ActionMenu label={`Actions for ${invoice.number}`} items={menuItems} />
      </td>
    </tr>
  );
};

export default InvoiceRow;
