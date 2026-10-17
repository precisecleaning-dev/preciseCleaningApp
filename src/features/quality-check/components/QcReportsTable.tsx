// Tabla de reportes (escritorio). La columna "Enviar" va PRIMERO y fija a la
// izquierda: la tabla mide 980 px mínimo y al final quedaba fuera de pantalla.
import type { ReactNode } from 'react';

interface QcReportsTableProps {
  /** Texto en lugar de las filas (cargando, sin reportes, sin coincidencias); null = hay filas. */
  emptyMessage: string | null;
  /** Una QcReportTableRow por reporte. */
  children: ReactNode;
}

const COLUMN_COUNT = 8;

const QcReportsTable = ({ emptyMessage, children }: QcReportsTableProps) => (
  <div className="qcrs-table-wrap">
    <table className="qcrs-table">
      <thead>
        <tr>
          <th className="actions center qcrs-th">Enviar</th>
          <th className="center qcrs-th">Score</th>
          <th className="qcrs-th">House Status</th>
          <th className="qcrs-th">Client / Address</th>
          <th className="qcrs-th">Inspection Date</th>
          <th className="qcrs-th">Team</th>
          <th className="qcrs-th">Inspector</th>
          <th className="qcrs-th">Duration</th>
        </tr>
      </thead>
      <tbody>
        {emptyMessage === null
          ? children
          : <tr><td colSpan={COLUMN_COUNT} className="qcrs-empty-row">{emptyMessage}</td></tr>}
      </tbody>
    </table>
  </div>
);

export default QcReportsTable;
