// Marco de los paneles de una tarea (ver/editar y crear): fondo oscuro, panel
// lateral en computadora y pantalla completa en el teléfono, encabezado con el
// botón de cerrar, cuerpo con scroll y pie con las acciones. El foco entra al
// abrirlo (al campo `initialFocusRef` o al panel) y vuelve a donde estaba al
// cerrarlo; Escape lo cierra. Estilos en TaskPanel.css (clases .otp).
import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import './TaskPanel.css';

interface TaskDrawerProps {
  /** Texto chico del encabezado ("Task", "Task · Done", "New task"). */
  kicker: string;
  ariaLabel: string;
  /** Campo que recibe el foco al abrir (si no, el panel). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  footer: ReactNode;
  children: ReactNode;
  onClose: () => void;
}

const TaskDrawer = ({ kicker, ariaLabel, initialFocusRef, footer, children, onClose }: TaskDrawerProps) => {
  const rootRef = useRef<HTMLElement | null>(null);

  // El foco entra al panel al abrirlo y vuelve a donde estaba al cerrarlo.
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    (initialFocusRef?.current ?? rootRef.current)?.focus();
    return () => previousFocus?.focus?.();
  }, [initialFocusRef]); // un ref no cambia: corre solo al abrir

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
  };

  return (
    <div className="otp-overlay" onClick={onClose}>
      <aside
        ref={rootRef}
        className="otp"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <header className="otp-head">
          <p className="otp-kicker">{kicker}</p>
          <button type="button" className="otp-icon-btn" onClick={onClose} aria-label="Close task">
            <X size={18} />
          </button>
        </header>
        <div className="otp-body">{children}</div>
        <footer className="otp-foot">{footer}</footer>
      </aside>
    </div>
  );
};

export default TaskDrawer;
