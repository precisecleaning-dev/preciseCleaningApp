// Aviso de la página de Invoices New: invoice creado o guardado, pago
// registrado, PDF que se está preparando o que falló.
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import './InvoiceSavedNotice.css';

export type InvoiceNoticeTone = 'success' | 'info' | 'error';

interface InvoiceSavedNoticeProps {
  message: string;
  tone?: InvoiceNoticeTone;
  onDismiss: () => void;
}

const TONE_ICONS = { success: CheckCircle2, info: Loader2, error: AlertTriangle };

const InvoiceSavedNotice = ({ message, tone = 'success', onDismiss }: InvoiceSavedNoticeProps) => {
  const ToneIcon = TONE_ICONS[tone];
  return (
    <div className={`invn-saved-notice tone-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <ToneIcon size={18} aria-hidden="true" />
      <span className="invn-saved-text">{message}</span>
      <button type="button" className="invn-saved-close" aria-label="Dismiss message" onClick={onDismiss}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
};

export default InvoiceSavedNotice;
