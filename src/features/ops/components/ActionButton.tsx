// Botón del Task list ("+ Add task", "+ New project", "Open ›"…). Un solo
// componente con variantes para que todos se vean igual.
import type { ReactNode } from 'react';
import './ActionButton.css';

/** primary = azul lleno · secondary = azul claro · outline = blanco con borde. */
type ActionButtonVariant = 'primary' | 'secondary' | 'outline';
/** sm = dentro de una fila · md = encabezados · lg = acciones principales de la lista. */
type ActionButtonSize = 'sm' | 'md' | 'lg';

interface ActionButtonProps {
  children: ReactNode;
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
  /** Ícono antes del texto (lucide-react). */
  icon?: ReactNode;
  /** Ícono después del texto ("Open ›"). */
  trailingIcon?: ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
  onClick: () => void;
}

const ActionButton = ({
  children, variant = 'primary', size = 'md', icon, trailingIcon, disabled = false, ariaLabel, onClick,
}: ActionButtonProps) => (
  <button
    type="button"
    className={`action-button ${size} ${variant}`}
    disabled={disabled}
    aria-label={ariaLabel}
    onClick={onClick}
  >
    {icon}
    {children}
    {trailingIcon}
  </button>
);

export default ActionButton;
