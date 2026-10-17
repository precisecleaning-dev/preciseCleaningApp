// Columna del tablero (Pipeline): el nombre del status con su color, cuántos
// trabajos tiene (y el total en dinero si se pide) y sus tarjetas.
import type { CSSProperties, ReactNode } from 'react';
import type { Status } from '../types/index';
import { money } from '../utils/jobFinancials';

interface PipelineColumnProps {
  status: Status;
  jobCount: number;
  /** Suma de los montos de la columna; null = no se muestra. */
  totalAmount: number | null;
  /** Una PipelineJobCard por trabajo. */
  children: ReactNode;
}

const PipelineColumn = ({ status, jobCount, totalAmount, children }: PipelineColumnProps) => {
  // Sin color en el status, el borde usa el gris de respaldo del CSS (var(--col-color, …)).
  const columnHeadStyle = status.color ? ({ '--col-color': status.color } as CSSProperties) : undefined;

  return (
    <div className="board-column">
      <div className="pb-column-head" style={columnHeadStyle}>
        <div className="pb-column-head-row">
          <h3 className="pb-column-title">{status.name}</h3>
          <span className="pb-column-count">{jobCount}</span>
        </div>
        {totalAmount !== null && <div className="pb-column-total">{money(totalAmount)} total</div>}
      </div>
      <div className="pb-column-body">
        {jobCount === 0 ? <div className="pb-column-empty">No jobs</div> : children}
      </div>
    </div>
  );
};

export default PipelineColumn;
