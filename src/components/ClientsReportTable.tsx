// Tabla del reporte de clientes (vista Clients Report): Client · Jobs · Final
// Cost · Share, un renglón por cliente y el Grand Total al pie, como la tabla
// dinámica de la hoja del mes. Arriba lleva el periodo y los totales para que
// una captura de pantalla se entienda sola. Al presionar un encabezado se
// ordena: de mayor a menor, de menor a mayor y de vuelta al orden original
// (cliente A–Z). Los datos y el orden los arma utils/clientsReport.ts.
import { useMemo, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type {
  ClientReportRow, ClientsReport, ClientsReportSort, ClientsReportSortColumn,
} from '../types/index';
import { money, pct } from '../utils/jobFinancials';
import { getNextClientsReportSort, NO_CLIENT_LABEL, sortClientRows } from '../utils/clientsReport';
import { PHONE_QUERY, useMediaQuery } from '../shared/hooks/useMediaQuery';
import VirtualItems from '../shared/components/VirtualItems';
import './ClientsReportTable.css';

/** Alto aproximado de un renglón (px) mientras VirtualItems mide los reales. */
const ROW_HEIGHT_ESTIMATE = 53;

const formatCount = (count: number) => count.toLocaleString('en-US');

const pluralize = (count: number, singular: string, plural: string) =>
  `${formatCount(count)} ${count === 1 ? singular : plural}`;

/** Valor de aria-sort del encabezado según el orden elegido. */
const getAriaSort = (sort: ClientsReportSort | null, column: ClientsReportSortColumn) => {
  if (sort?.column !== column) return 'none';
  return sort.direction === 'desc' ? 'descending' : 'ascending';
};

interface SortIconProps {
  sort: ClientsReportSort | null;
  column: ClientsReportSortColumn;
}

/** Flecha del orden activo, o la doble flecha tenue si la columna no ordena. */
const SortIcon = ({ sort, column }: SortIconProps) => {
  if (sort?.column !== column) return <ChevronsUpDown size={13} className="crt-sort-icon" aria-hidden="true" />;
  if (sort.direction === 'desc') return <ArrowDown size={13} className="crt-sort-icon" aria-hidden="true" />;
  return <ArrowUp size={13} className="crt-sort-icon" aria-hidden="true" />;
};

interface SortableHeaderCellProps {
  label: string;
  column: ClientsReportSortColumn;
  sort: ClientsReportSort | null;
  onSort: (column: ClientsReportSortColumn) => void;
  className?: string;
}

const SortableHeaderCell = ({ label, column, sort, onSort, className }: SortableHeaderCellProps) => {
  const isSorted = sort?.column === column;
  return (
    <th className={className} scope="col" aria-sort={getAriaSort(sort, column)}>
      <button
        type="button"
        className={`crt-sort-btn${isSorted ? ' is-sorted' : ''}`}
        title={`Sort by ${label}`}
        onClick={() => onSort(column)}
      >
        {label}
        <SortIcon sort={sort} column={column} />
      </button>
    </th>
  );
};

interface FinalCostCellProps {
  finalCost: number;
  isLoading: boolean;
}

/** Monto (los $0.00 en gris), o un esqueleto mientras llegan los servicios cobrados. */
const FinalCostCell = ({ finalCost, isLoading }: FinalCostCellProps) => {
  if (isLoading) {
    return <td className="crt-number"><span className="skel-line skel-money" aria-hidden="true" /></td>;
  }
  return <td className={`crt-money crt-number${finalCost === 0 ? ' is-zero' : ''}`}>{money(finalCost)}</td>;
};

interface ShareCellProps {
  shareOfFinalCost: number;
  /** La mayor participación de la tabla: su barra va llena. */
  largestShareOfFinalCost: number;
  isLoading: boolean;
}

/** Porcentaje del Final Cost total que es de este cliente, con una barra
 *  relativa al cliente más grande (así se comparan a simple vista; con la
 *  escala 0–100% casi todas las barras quedaban de 1–2 px). */
const ShareCell = ({ shareOfFinalCost, largestShareOfFinalCost, isLoading }: ShareCellProps) => {
  if (isLoading) {
    return <td className="crt-share"><span className="skel-line skel-money" aria-hidden="true" /></td>;
  }
  const sharePercent = shareOfFinalCost * 100;
  const barWidthPercent = largestShareOfFinalCost > 0 ? (shareOfFinalCost / largestShareOfFinalCost) * 100 : 0;
  const shareBarStyle = { '--crt-share': `${barWidthPercent}%` } as CSSProperties;
  return (
    <td className="crt-share">
      <div className="crt-share-content">
        <span className="crt-share-track" aria-hidden="true">
          <span className="crt-share-fill" style={shareBarStyle} />
        </span>
        <span className="crt-share-value">{pct(sharePercent)}</span>
      </div>
    </td>
  );
};

interface ClientsReportTableRowProps {
  clientRow: ClientReportRow;
  largestShareOfFinalCost: number;
  isFinalCostLoading: boolean;
  showShareColumn: boolean;
}

const ClientsReportTableRow = ({
  clientRow, largestShareOfFinalCost, isFinalCostLoading, showShareColumn,
}: ClientsReportTableRowProps) => {
  const isWithoutClient = clientRow.clientName === NO_CLIENT_LABEL;
  return (
    <tr>
      <td className={`crt-client${isWithoutClient ? ' is-unassigned' : ''}`}>{clientRow.clientName}</td>
      <td className="crt-jobs crt-number">{formatCount(clientRow.jobCount)}</td>
      <FinalCostCell finalCost={clientRow.finalCost} isLoading={isFinalCostLoading} />
      {showShareColumn && (
        <ShareCell
          shareOfFinalCost={clientRow.shareOfFinalCost}
          largestShareOfFinalCost={largestShareOfFinalCost}
          isLoading={isFinalCostLoading}
        />
      )}
    </tr>
  );
};

interface ClientsReportTableProps {
  report: ClientsReport;
  /** Todavía no llegan los servicios cobrados: los montos van en esqueleto. */
  isFinalCostLoading: boolean;
  /** Periodo de la barra ("October 2026", "10/05/2026 – 10/11/2026"…). */
  periodLabel: string;
}

const ClientsReportTable = ({ report, isFinalCostLoading, periodLabel }: ClientsReportTableProps) => {
  const [sort, setSort] = useState<ClientsReportSort | null>(null);
  // En el teléfono no cabe la barra: se queda Client · Jobs · Final Cost.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const showShareColumn = !isPhone;
  const columnCount = showShareColumn ? 4 : 3;
  const hasJobs = report.rows.length > 0;
  const largestShareOfFinalCost = Math.max(0, ...report.rows.map((clientRow) => clientRow.shareOfFinalCost));
  const sortedRows = useMemo(() => sortClientRows(report.rows, sort), [report.rows, sort]);
  const reportSummary = `${periodLabel} · ${pluralize(report.rows.length, 'client', 'clients')} · ${pluralize(report.totalJobs, 'job', 'jobs')}`;

  const handleSortByColumn = (column: ClientsReportSortColumn) => {
    setSort((currentSort) => getNextClientsReportSort(currentSort, column));
  };

  const renderClientRow = (clientRow: ClientReportRow) => (
    <ClientsReportTableRow
      key={clientRow.clientName}
      clientRow={clientRow}
      largestShareOfFinalCost={largestShareOfFinalCost}
      isFinalCostLoading={isFinalCostLoading}
      showShareColumn={showShareColumn}
    />
  );

  return (
    <section className="crt-card" aria-label="Final cost by client">
      <header className="crt-head">
        <h2 className="crt-title">Final cost by client</h2>
        <p className="crt-summary">{reportSummary}</p>
      </header>
      <table className="crt-table">
        <thead>
          <tr>
            <SortableHeaderCell label="Client" column="clientName" sort={sort} onSort={handleSortByColumn} />
            <SortableHeaderCell
              label="Jobs" column="jobCount" sort={sort} onSort={handleSortByColumn} className="crt-number"
            />
            <SortableHeaderCell
              label="Final Cost" column="finalCost" sort={sort} onSort={handleSortByColumn} className="crt-number"
            />
            {showShareColumn && (
              <SortableHeaderCell
                label="Share" column="shareOfFinalCost" sort={sort} onSort={handleSortByColumn} className="crt-share"
              />
            )}
          </tr>
        </thead>
        {hasJobs ? (
          <VirtualItems
            items={sortedRows}
            estimate={ROW_HEIGHT_ESTIMATE}
            colSpan={columnCount}
            renderItem={renderClientRow}
          />
        ) : (
          <tbody>
            <tr>
              <td className="crt-empty" colSpan={columnCount}>No jobs scheduled in this period.</td>
            </tr>
          </tbody>
        )}
        {hasJobs && (
          <tfoot>
            <tr>
              <th scope="row">Grand Total</th>
              <td className="crt-number">{formatCount(report.totalJobs)}</td>
              <FinalCostCell finalCost={report.totalFinalCost} isLoading={isFinalCostLoading} />
              {showShareColumn && <td className="crt-share" />}
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );
};

export default ClientsReportTable;
