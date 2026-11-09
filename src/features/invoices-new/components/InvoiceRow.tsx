// Una fila de la tabla de invoices: checkbox (con permiso Edit), número,
// cliente / job, emisión, vencimiento (con días de atraso), total, estado y menú
// de acciones. Un clic en la fila o en el número abre el detalle (el número es
// el acceso con teclado); el nombre del cliente abre su cuenta (Client account).
// Los clics del checkbox, del cliente y del menú no llegan a la fila.
import type { MouseEvent } from 'react';
import { CheckCircle2, Download, Eye, FileText, Pencil, RotateCcw, Send, Trash2 } from 'lucide-react';
import type { Invoice, InvoiceActions, InvoicesNewRights, YmdDate } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import { formatCents } from '../invoiceMath';
import { getDisplayStatus, getLateDays } from '../invoiceStatus';
import { getInvoiceActionRights } from '../invoicesNewPermissions';
import ActionMenu, { type ActionMenuItem } from '../../../shared/components/ActionMenu';
import InvoiceStatusBadge from './InvoiceStatusBadge';

/** Menú "..." de una fila: las mismas reglas que el pie del detalle
 *  (getInvoiceActionRights). En la papelera solo se ve el detalle y se restaura. */
const buildMenuItems = (invoice: Invoice, rights: InvoicesNewRights, actions: InvoiceActions): ActionMenuItem[] => {
  const actionRights = getInvoiceActionRights(invoice, rights);
  const sendLabel = invoice.delivery.sendCount > 0 ? 'Resend invoice' : 'Send invoice';
  const menuItems: ActionMenuItem[] = [
    { key: 'view', label: 'View details', icon: Eye, onSelect: () => actions.viewInvoice(invoice) },
  ];
  if (actionRights.canEdit) menuItems.push({ key: 'edit', label: 'Edit', icon: Pencil, onSelect: () => actions.editInvoice(invoice) });
  if (!actionRights.isDeleted) {
    menuItems.push(
      { key: 'preview-pdf', label: 'Preview PDF', icon: FileText, onSelect: () => actions.previewPdf(invoice) },
      { key: 'download-pdf', label: 'Download PDF', icon: Download, onSelect: () => actions.downloadPdf(invoice) },
    );
  }
  if (actionRights.canSend) menuItems.push({ key: 'send', label: sendLabel, icon: Send, onSelect: () => actions.sendInvoice(invoice) });
  if (actionRights.canMarkAsPaid) {
    menuItems.push({ key: 'mark-paid', label: 'Mark as Paid', icon: CheckCircle2, onSelect: () => actions.markAsPaid(invoice) });
  }
  if (actionRights.canDelete) {
    menuItems.push({ key: 'delete', label: 'Delete', icon: Trash2, tone: 'danger', onSelect: () => actions.deleteInvoice(invoice) });
  }
  if (actionRights.canRestore) {
    menuItems.push({ key: 'restore', label: 'Restore', icon: RotateCcw, onSelect: () => actions.restoreInvoice(invoice) });
  }
  return menuItems;
};

interface InvoiceRowProps {
  invoice: Invoice;
  today: YmdDate;
  rights: InvoicesNewRights;
  /** Lo que se hace con el invoice (el mismo objeto para el detalle). */
  actions: InvoiceActions;
  /** null = sin columna de selección (sin permiso Edit ni Delete, o vista Deleted). */
  isSelected: boolean | null;
  onToggleSelected?: (invoice: Invoice) => void;
}

const InvoiceRow = ({ invoice, today, rights, actions, isSelected, onToggleSelected }: InvoiceRowProps) => {
  const lateDays = getLateDays(invoice, today);
  const jobLine = [invoice.job.address, invoice.job.unit, invoice.job.serviceName].filter(Boolean).join(' · ');
  const lateText = lateDays === 1 ? '1 day overdue' : `${lateDays} days overdue`;
  const menuItems = buildMenuItems(invoice, rights, actions);

  // El clic en el cliente abre su cuenta, no el detalle de la fila.
  const handleOpenClientAccount = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    actions.openClientAccount(invoice);
  };

  return (
    <tr className={`invt-row${isSelected ? ' selected' : ''}`} onClick={() => actions.viewInvoice(invoice)}>
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
        <button type="button" className="invt-number" onClick={() => actions.viewInvoice(invoice)}>{invoice.number}</button>
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
