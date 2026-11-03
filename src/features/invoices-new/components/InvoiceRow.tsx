// Una fila de la tabla de invoices: checkbox (con permiso Edit), número,
// cliente / job, emisión, vencimiento (con días de atraso), total, estado y menú
// de acciones. Un clic en la fila o en el número abre el detalle (el número es
// el acceso con teclado); el nombre del cliente abre su cuenta (Client account).
// Los clics del checkbox, del cliente y del menú no llegan a la fila.
import type { MouseEvent } from 'react';
import { CheckCircle2, Download, Eye, FileText, Pencil, RotateCcw, Send, Trash2 } from 'lucide-react';
import type { Invoice, YmdDate } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import { formatCents } from '../invoiceMath';
import { canMoveToTrash, getDisplayStatus, getLateDays, isDeletedInvoice, isPaidStatus } from '../invoiceStatus';
import ActionMenu, { type ActionMenuItem } from '../../../shared/components/ActionMenu';
import InvoiceStatusBadge from './InvoiceStatusBadge';

/** Acciones sobre un invoice (la fila las recibe con el invoice como parámetro). */
export interface InvoiceRowActions {
  onViewInvoice: (invoice: Invoice) => void;
  onEditInvoice: (invoice: Invoice) => void;
  onMarkAsPaid: (invoice: Invoice) => void;
  onPreviewPdf: (invoice: Invoice) => void;
  onDownloadPdf: (invoice: Invoice) => void;
  onSendInvoice: (invoice: Invoice) => void;
  onOpenClientAccount: (invoice: Invoice) => void;
  /** Delete: a la papelera (con permiso Delete, nunca un pagado). */
  onDeleteInvoice: (invoice: Invoice) => void;
  /** Restore: saca de la papelera (con permiso Delete). */
  onRestoreInvoice: (invoice: Invoice) => void;
}

interface InvoiceRowProps extends InvoiceRowActions {
  invoice: Invoice;
  today: YmdDate;
  canEdit: boolean;
  canDelete: boolean;
  /** null = sin columna de selección (sin permiso Edit ni Delete, o vista Deleted). */
  isSelected: boolean | null;
  onToggleSelected?: (invoice: Invoice) => void;
}

const InvoiceRow = ({
  invoice, today, canEdit, canDelete, isSelected, onToggleSelected, onViewInvoice, onEditInvoice, onMarkAsPaid,
  onPreviewPdf, onDownloadPdf, onSendInvoice, onOpenClientAccount, onDeleteInvoice, onRestoreInvoice,
}: InvoiceRowProps) => {
  const lateDays = getLateDays(invoice, today);
  const jobLine = [invoice.job.address, invoice.job.unit, invoice.job.serviceName].filter(Boolean).join(' · ');
  const lateText = lateDays === 1 ? '1 day overdue' : `${lateDays} days overdue`;
  const sendLabel = invoice.delivery.sendCount > 0 ? 'Resend invoice' : 'Send invoice';
  const viewItem: ActionMenuItem = { key: 'view', label: 'View details', icon: Eye, onSelect: () => onViewInvoice(invoice) };
  // En la papelera solo se ve el detalle y se restaura.
  const deletedMenuItems: ActionMenuItem[] = [
    viewItem,
    ...(canDelete ? [{ key: 'restore', label: 'Restore', icon: RotateCcw, onSelect: () => onRestoreInvoice(invoice) }] : []),
  ];
  const activeMenuItems: ActionMenuItem[] = [
    viewItem,
    ...(canEdit ? [{ key: 'edit', label: 'Edit', icon: Pencil, onSelect: () => onEditInvoice(invoice) }] : []),
    { key: 'preview-pdf', label: 'Preview PDF', icon: FileText, onSelect: () => onPreviewPdf(invoice) },
    { key: 'download-pdf', label: 'Download PDF', icon: Download, onSelect: () => onDownloadPdf(invoice) },
    ...(canEdit ? [{ key: 'send', label: sendLabel, icon: Send, onSelect: () => onSendInvoice(invoice) }] : []),
    ...(canEdit && !isPaidStatus(invoice.status)
      ? [{ key: 'mark-paid', label: 'Mark as Paid', icon: CheckCircle2, onSelect: () => onMarkAsPaid(invoice) }]
      : []),
    ...(canDelete && canMoveToTrash(invoice)
      ? [{ key: 'delete', label: 'Delete', icon: Trash2, tone: 'danger' as const, onSelect: () => onDeleteInvoice(invoice) }]
      : []),
  ];
  const menuItems = isDeletedInvoice(invoice) ? deletedMenuItems : activeMenuItems;

  // El clic en el cliente abre su cuenta, no el detalle de la fila.
  const handleOpenClientAccount = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOpenClientAccount(invoice);
  };

  return (
    <tr className={`invt-row${isSelected ? ' selected' : ''}`} onClick={() => onViewInvoice(invoice)}>
      {isSelected !== null && (
        <td className="invt-select" onClick={(event) => event.stopPropagation()}>
          <label className="invt-select-label">
            <input
              type="checkbox"
              className="invt-checkbox"
              aria-label={`Select invoice ${invoice.number}`}
              checked={isSelected}
              onChange={() => onToggleSelected?.(invoice)}
            />
          </label>
        </td>
      )}
      <td>
        <button type="button" className="invt-number" onClick={() => onViewInvoice(invoice)}>{invoice.number}</button>
      </td>
      <td className="invt-client">
        <button
          type="button"
          className="invt-client-name invt-client-btn"
          title="Open the client account"
          onClick={handleOpenClientAccount}
        >
          {invoice.client.name || 'Unknown client'}
        </button>
        <span className="invt-job">{jobLine}</span>
      </td>
      <td className="invt-date">{formatDate(invoice.issueDate)}</td>
      <td className="invt-date">
        {formatDate(invoice.dueDate)}
        {lateDays > 0 && <span className="invt-late">{lateText}</span>}
      </td>
      <td className="invt-money">{formatCents(invoice.totalCents)}</td>
      <td><InvoiceStatusBadge status={getDisplayStatus(invoice, today)} /></td>
      <td className="invt-actions" onClick={(event) => event.stopPropagation()}>
        <ActionMenu label={`Actions for ${invoice.number}`} items={menuItems} />
      </td>
    </tr>
  );
};

export default InvoiceRow;
