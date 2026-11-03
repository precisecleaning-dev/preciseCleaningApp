// Contenedor de los diálogos de Invoices New (formulario, detalle, registrar
// pago): overlay global, encabezado con título y X, y Escape para cerrar.
// Con un diálogo encima de otro, Escape cierra solo el de arriba. Un clic
// afuera NO cierra (se perdería lo escrito).
// Teclado: al abrir, el foco entra al diálogo; Tab y Shift+Tab dan la vuelta
// dentro de él (no se va a la página de atrás); al cerrar, el foco vuelve a lo
// que lo abrió.
import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import './InvoiceDialog.css';

/** Diálogos abiertos, el último es el de arriba. */
const openDialogIds: string[] = [];

const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', 'iframe', '[tabindex]:not([tabindex="-1"])',
].join(', ');

const isTopDialog = (dialogId: string): boolean => openDialogIds[openDialogIds.length - 1] === dialogId;

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
  const dialogRef = useRef<HTMLDivElement>(null);

  // Registra el diálogo en la pila mientras está abierto.
  useEffect(() => {
    openDialogIds.push(dialogId);
    return () => {
      const dialogIndex = openDialogIds.indexOf(dialogId);
      if (dialogIndex >= 0) openDialogIds.splice(dialogIndex, 1);
    };
  }, [dialogId]);

  // Foco: entra al diálogo al abrir y vuelve a lo que lo abrió al cerrar.
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, []);

  // Escape cierra solo el diálogo de arriba.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isTopDialog(dialogId) && !isCloseDisabled) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogId, isCloseDisabled, onClose]);

  // Tab y Shift+Tab dan la vuelta dentro del diálogo de arriba.
  const handleTabKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !isTopDialog(dialogId) || !dialogRef.current) return;
    const focusableElements = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusableElements.length === 0) return;
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    if (event.shiftKey && (activeElement === firstElement || activeElement === dialogRef.current)) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return (
    <div className="modal-overlay-centered">
      <div
        ref={dialogRef}
        className={`invd-dialog${size === 'wide' ? ' modal-70' : ' invd-narrow'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleTabKey}
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
