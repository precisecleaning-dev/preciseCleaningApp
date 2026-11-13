// src/features/payroll/components/PayrollTable.tsx
// Piezas comunes de las tablas de Hourly y Fixed pay (pagos por horas, sueldos
// fijos y pagos quincenales): la barra con título y botón, el esqueleto de
// carga y la fila que abre su detalle. Estilos en PayrollTable.css; cada lista
// solo define sus columnas (--ptbl-columns).
import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import './PayrollTable.css';

interface PayrollTableToolbarProps {
  title: string;
  actionText: string;
  /** Sin esta función no hay botón (p. ej. alcance 'Own'). */
  onAction?: () => void;
  /** Botón deshabilitado (p. ej. mientras carga lo que necesita). */
  isActionDisabled?: boolean;
}

export const PayrollTableToolbar = ({ title, actionText, onAction, isActionDisabled = false }: PayrollTableToolbarProps) => (
  <div className="ptbl-toolbar">
    <h3 className="ptbl-title">{title}</h3>
    {onAction && (
      <button type="button" className="btn-primary" disabled={isActionDisabled} onClick={onAction}>
        <Plus size={16} aria-hidden="true" /> {actionText}
      </button>
    )}
  </div>
);

/** Mientras cargan los datos: esqueleto, no "No … yet" (clases de components/RouteTransition.css). */
export const PayrollTableSkeleton = () => (
  <div className="skel-block" aria-busy="true" aria-label="Loading">
    {[0, 1, 2].map((rowIndex) => (
      <div key={rowIndex} className="skel-row">
        <div className="skel-line skel-row-main" />
        <div className="skel-line skel-row-side" />
      </div>
    ))}
  </div>
);

interface PayrollTableRowProps {
  /** Texto del botón que abre el detalle (lo lee el lector de pantalla). */
  label: string;
  onOpen: () => void;
  /** 'li' cuando la tabla es una lista <ul>; 'div' dentro de VirtualItems. */
  as?: 'div' | 'li';
  children: ReactNode;
}

/**
 * Fila que abre su detalle. El detalle lo abre un <button> real que cubre toda
 * la fila (se enfoca con Tab y se activa con Enter o espacio); los botones y
 * enlaces de la fila quedan encima de él (PayrollTable.css), así un clic en
 * ellos no abre el detalle. Antes la fila era role="button" con botones adentro.
 */
export const PayrollTableRow = ({ label, onOpen, as: Tag = 'div', children }: PayrollTableRowProps) => (
  <Tag className="ptbl-row is-clickable">
    <button type="button" className="ptbl-open-btn" aria-label={label} onClick={onOpen} />
    {children}
  </Tag>
);
