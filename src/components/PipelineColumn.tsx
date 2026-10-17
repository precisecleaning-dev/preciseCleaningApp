// Columna del tablero (Pipeline): el nombre del status con su color, cuántos
// trabajos tiene (y el total en dinero si se pide) y sus tarjetas.
import type { CSSProperties, ReactNode } from 'react';
import type { Status } from '../types/index';

interface PipelineColumnProps {
  status: Status;
  jobCount: number;
  /** Suma de los montos de la columna; null = no se muestra. */
  totalAmount: number | null;
  /** Una PipelineJobCard por trabajo. */
  children: ReactNode;
}

const PipelineColumn = ({ status, jobCount, totalAmount, children }: PipelineColumnProps) => {
  const columnHeadStyle = { '--col-color': status.color || '#e5e7eb' } as CSSProperties;

  return (
    <div className="board-column">
      <div className="pb-column-head" style={columnHeadStyle}>
        <div className="pb-column-head-row">
          <h3 className="pb-column-title">{status.name}</h3>
          <span className="pb-column-count">{jobCount}</span>
        </div>
        {totalAmount !== null && <div className="pb-column-total">${totalAmount.toFixed(2)} total</div>}
      </div>
      <div className="pb-column-body">
        {jobCount === 0 ? <div className="pb-column-empty">Sin trabajos</div> : children}
      </div>
    </div>
  );
};

export default PipelineColumn;
