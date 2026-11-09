// Barra de acciones en bloque: aparece arriba de la tabla cuando hay invoices
// marcados. Mark as Paid y Send invoice (permiso Edit) y Delete (permiso
// Delete, a la papelera) actúan sobre TODOS los marcados; el menú "..." de cada
// fila sigue actuando solo sobre esa fila.
import { CheckCircle2, Send, Trash2, X } from 'lucide-react';
import { pluralize } from '../../../utils/countFormat';
import './InvoiceBulkBar.css';

interface InvoiceBulkBarProps {
  selectedCount: number;
  canEdit: boolean;
  canDelete: boolean;
  onMarkAsPaid: () => void;
  onSendInvoices: () => void;
  onDeleteInvoices: () => void;
  onClearSelection: () => void;
}

const InvoiceBulkBar = ({
  selectedCount, canEdit, canDelete, onMarkAsPaid, onSendInvoices, onDeleteInvoices, onClearSelection,
}: InvoiceBulkBarProps) => (
  <div className="invbb-bar" role="toolbar" aria-label="Actions for the selected invoices">
    <span className="invbb-count" aria-live="polite">{`${pluralize(selectedCount, 'invoice', 'invoices')} selected`}</span>
    <div className="invbb-actions">
      {canEdit && (
        <button type="button" className="invbb-btn" onClick={onMarkAsPaid}>
          <CheckCircle2 size={16} aria-hidden="true" /> Mark as Paid
        </button>
      )}
      {canEdit && (
        <button type="button" className="invbb-btn" onClick={onSendInvoices}>
          <Send size={16} aria-hidden="true" /> Send invoice
        </button>
      )}
      {canDelete && (
        <button type="button" className="invbb-btn is-danger" onClick={onDeleteInvoices}>
          <Trash2 size={16} aria-hidden="true" /> Delete
        </button>
      )}
      <button type="button" className="invbb-clear-btn" onClick={onClearSelection}>
        <X size={16} aria-hidden="true" /> Clear
      </button>
    </div>
  </div>
);

export default InvoiceBulkBar;
