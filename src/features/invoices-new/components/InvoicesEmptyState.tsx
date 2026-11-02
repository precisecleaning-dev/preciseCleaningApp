// Mensaje cuando no hay invoices que mostrar (sin invoices todavía, o sin
// resultados para los filtros). Las acciones (p. ej. "Clear filters") van
// como children.
import type { ReactNode } from 'react';
import { FileText } from 'lucide-react';
import './InvoicesEmptyState.css';

interface InvoicesEmptyStateProps {
  title: string;
  description: string;
  children?: ReactNode;
}

const InvoicesEmptyState = ({ title, description, children }: InvoicesEmptyStateProps) => (
  <section className="invn-empty" aria-live="polite">
    <FileText size={32} className="invn-empty-icon" aria-hidden="true" />
    <h2 className="invn-empty-title">{title}</h2>
    <p className="invn-empty-text">{description}</p>
    {children}
  </section>
);

export default InvoicesEmptyState;
