// Encabezado de Invoices New: menú, título, subtítulo y "Create Invoice"
// (solo para quien tiene Add en el módulo).
import { Plus } from 'lucide-react';
import MenuButton from '../../../shared/components/MenuButton';
import './InvoicesNewHeader.css';

interface InvoicesNewHeaderProps {
  onOpenMenu: () => void;
  canCreate: boolean;
  /** Abre el formulario. Sin handler el botón se ve deshabilitado. */
  onCreateInvoice?: () => void;
}

const InvoicesNewHeader = ({ onOpenMenu, canCreate, onCreateInvoice }: InvoicesNewHeaderProps) => (
  <header className="invn-header">
    <div className="invn-title-group view-header-title-group">
      <MenuButton onClick={onOpenMenu} />
      <div>
        <h1 className="invn-title">Invoices</h1>
        <p className="invn-subtitle">Manage invoices, track payments, and share with clients.</p>
      </div>
    </div>
    {canCreate && (
      <button type="button" className="btn-primary invn-create-btn" disabled={!onCreateInvoice} onClick={onCreateInvoice}>
        <Plus size={18} aria-hidden="true" /> Create Invoice
      </button>
    )}
  </header>
);

export default InvoicesNewHeader;
