// src/features/payroll/components/PayrollDialog.tsx
// Caja de los modales de la pestaña Fixed pay: fondo, encabezado (ícono,
// título y X), cuerpo y botonera. Se cierra con la X, tocando el fondo o con
// Escape, salvo mientras `isBusy` (se está guardando).
import { useEffect, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import './PayrollDialog.css';

interface PayrollDialogProps {
  title: string;
  icon: LucideIcon;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
  isBusy?: boolean;
  /** Formularios con buscador: la lista de opciones puede salir de la caja. */
  canOverflow?: boolean;
  /** Clase extra de la caja (p. ej. un detalle más ancho). */
  boxClassName?: string;
}

const PayrollDialog = ({
  title, icon: Icon, onClose, footer, children, isBusy = false, canOverflow = false, boxClassName = '',
}: PayrollDialogProps) => {
  const handleClose = () => {
    if (!isBusy) onClose();
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Si un control de adentro ya usó el Escape (la lista del buscador abierta), el modal no se cierra.
      if (event.key === 'Escape' && !isBusy && !event.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBusy, onClose]);

  return (
    <div className="modal-overlay-centered" onClick={handleClose}>
      <section
        className={`modal-50 pdlg-box${canOverflow ? ' allows-overflow' : ''}${boxClassName ? ` ${boxClassName}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="pdlg-header">
          <h3 className="pdlg-title">
            <Icon size={18} aria-hidden="true" /> {title}
          </h3>
          <button type="button" className="pdlg-close-btn" aria-label="Close" disabled={isBusy} onClick={handleClose}>
            <X size={20} />
          </button>
        </header>
        <div className="pdlg-body">{children}</div>
        <footer className="pdlg-footer">{footer}</footer>
      </section>
    </div>
  );
};

export default PayrollDialog;
