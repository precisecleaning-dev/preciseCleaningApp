// Contenedor de los diálogos de Invoices New (formulario, detalle, registrar
// pago): overlay global, encabezado con título y X, y Escape para cerrar.
// Con un diálogo encima de otro, Escape cierra solo el de arriba. Un clic
// afuera NO cierra (se perdería lo escrito).
import { useEffect, useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import './InvoiceDialog.css';

/** Diálogos abiertos, el último es el de arriba. */
const openDialogIds: string[] = [];

interface InvoiceDialogProps {
  title: string;
  subtitle?: string;
  /** Contenido extra del encabezado (p. ej. el badge de estado). */
  headerExtra?: ReactNode;
  /** 'wide' = .modal-70 (formulario, detalle) · 'narrow' = diálogo corto. */
  size?: 'wide' | 'narrow';
  /** Mientras se guarda no se puede cerrar. */
  isCloseDisabled?: boolean;
  onClose: () => void;
  children: ReactNode;
}

const InvoiceDialog = ({
  title, subtitle, headerExtra, size = 'wide', isCloseDisabled = false, onClose, children,
}: InvoiceDialogProps) => {
  const dialogId = useId();
  const titleId = `${dialogId}-title`;

  // Registra el diálogo en la pila mientras está abierto.
  useEffect(() => {
    openDialogIds.push(dialogId);
    return () => {
      const dialogIndex = openDialogIds.indexOf(dialogId);
      if (dialogIndex >= 0) openDialogIds.splice(dialogIndex, 1);
    };
  }, [dialogId]);

  // Escape cierra solo el diálogo de arriba.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isTopDialog = openDialogIds[openDialogIds.length - 1] === dialogId;
      if (event.key === 'Escape' && isTopDialog && !isCloseDisabled) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogId, isCloseDisabled, onClose]);

  return (
    <div className="modal-overlay-centered">
      <div
        className={`invd-dialog${size === 'wide' ? ' modal-70' : ' invd-narrow'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="invd-header">
          <div className="invd-heading">
            <h2 className="invd-title" id={titleId}>{title}</h2>
            {subtitle && <p className="invd-subtitle">{subtitle}</p>}
            {headerExtra}
          </div>
          <button
            type="button"
            className="invd-close-btn"
            aria-label={`Close ${title}`}
            disabled={isCloseDisabled}
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
};

export default InvoiceDialog;
