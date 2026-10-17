// Marco de los paneles de una tarea (ver/editar y crear): fondo oscuro, panel
// lateral en computadora y pantalla completa en el teléfono, encabezado con el
// botón de cerrar, cuerpo con scroll y pie con las acciones. El foco entra al
// abrirlo (al campo `initialFocusRef` o al panel) y vuelve a donde estaba al
// cerrarlo; Escape o un clic en el fondo oscuro lo cierran. Estilos en
// TaskPanel.css (clases .task-panel).
import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import './TaskPanel.css';

interface TaskDrawerProps {
  /** Texto chico del encabezado ("Task", "Task · Done", "New task"). */
  headerLabel: string;
  ariaLabel: string;
  /** Campo que recibe el foco al abrir (si no, el panel). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Botones del pie del panel. */
  footerActions: ReactNode;
  children: ReactNode;
  onClose: () => void;
}

const TaskDrawer = ({ headerLabel, ariaLabel, initialFocusRef, footerActions, children, onClose }: TaskDrawerProps) => {
  const drawerRef = useRef<HTMLElement | null>(null);
  // ¿El clic empezó en el fondo oscuro? Si se selecciona texto dentro del
  // panel y se suelta el mouse afuera, el navegador dispara el clic en el
  // fondo: sin esto el panel se cerraba y se perdía lo escrito.
  const pressStartedOnOverlayRef = useRef(false);

  // El foco entra al panel al abrirlo y vuelve a donde estaba al cerrarlo.
  useEffect(() => {
    const previouslyFocusedElement = document.activeElement as HTMLElement | null;
    (initialFocusRef?.current ?? drawerRef.current)?.focus();
    return () => previouslyFocusedElement?.focus?.();
  }, [initialFocusRef]); // un ref no cambia: corre solo al abrir

  const handleDrawerKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
  };

  const handleOverlayPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pressStartedOnOverlayRef.current = event.target === event.currentTarget;
  };

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    const isOverlayClick = pressStartedOnOverlayRef.current && event.target === event.currentTarget;
    pressStartedOnOverlayRef.current = false;
    if (isOverlayClick) onClose();
  };

  return (
    <div className="task-panel-overlay" onPointerDown={handleOverlayPointerDown} onClick={handleOverlayClick}>
      <aside
        ref={drawerRef}
        className="task-panel"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onKeyDown={handleDrawerKeyDown}
      >
        <header className="task-panel-head">
          <p className="task-panel-kicker">{headerLabel}</p>
          <button type="button" className="task-panel-icon-btn" onClick={onClose} aria-label="Close task">
            <X size={18} />
          </button>
        </header>
        <div className="task-panel-body">{children}</div>
        <footer className="task-panel-foot">{footerActions}</footer>
      </aside>
    </div>
  );
};

export default TaskDrawer;
