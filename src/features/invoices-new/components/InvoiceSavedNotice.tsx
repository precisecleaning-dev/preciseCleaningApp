// Aviso después de crear o guardar un invoice (hasta que llegue la lista, es
// la única confirmación en pantalla).
import { CheckCircle2, X } from 'lucide-react';
import './InvoiceSavedNotice.css';

interface InvoiceSavedNoticeProps {
  message: string;
  onDismiss: () => void;
}

const InvoiceSavedNotice = ({ message, onDismiss }: InvoiceSavedNoticeProps) => (
  <div className="invn-saved-notice" role="status">
    <CheckCircle2 size={18} aria-hidden="true" />
    <span className="invn-saved-text">{message}</span>
    <button type="button" className="invn-saved-close" aria-label="Dismiss message" onClick={onDismiss}>
      <X size={16} aria-hidden="true" />
    </button>
  </div>
);

export default InvoiceSavedNotice;
