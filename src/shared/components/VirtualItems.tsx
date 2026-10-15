// src/shared/components/VirtualItems.tsx
// Lista larga dibujada por ventana (useVirtualRows): como `<tbody>` si recibe
// `colSpan` o como `<div className>` si no. Vive aparte de la vista para que el
// scroll solo vuelva a dibujar la lista y no la pantalla entera.
import type { CSSProperties, ReactNode } from 'react';
import { useVirtualRows } from '../hooks/useVirtualRows';

interface VirtualItemsProps<T> {
  items: readonly T[];
  /** Alto aproximado de un elemento (px), hasta medir los reales. */
  estimate: number;
  /** Cada elemento, con su `key`: UN solo nodo (fila, tarjeta o botón). */
  renderItem: (item: T) => ReactNode;
  /** Columnas de la tabla: dibuja un `<tbody>`. */
  colSpan?: number;
  className?: string;
}

export default function VirtualItems<T>({ items, estimate, renderItem, colSpan, className }: VirtualItemsProps<T>) {
  const { setAnchor, start, end, padTop, padBottom } = useVirtualRows(items.length, estimate);
  const spacer = (key: string, px: number) => {
    if (px <= 0) return null;
    const style = { '--vr-h': `${px}px` } as CSSProperties;
    return colSpan
      ? <tr key={key} className="u-vr-spacer" aria-hidden="true" style={style}><td colSpan={colSpan} /></tr>
      : <div key={key} className="u-vr-spacer" aria-hidden="true" style={style} />;
  };
  const content = [
    spacer('vr-top', padTop),
    ...items.slice(start, end).map(renderItem),
    spacer('vr-bottom', padBottom),
  ];

  return colSpan
    ? <tbody ref={setAnchor}>{content}</tbody>
    : <div ref={setAnchor} className={className}>{content}</div>;
}
