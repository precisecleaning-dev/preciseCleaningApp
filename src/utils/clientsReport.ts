// src/utils/clientsReport.ts
// Reporte de clientes (vista Clients Report): como la tabla dinámica de la hoja
// del mes, un renglón por cliente con cuántos trabajos tuvo, la suma de su
// Final Cost y qué parte del total es, más el Grand Total. La vista elige los
// trabajos (Schedule Date dentro del periodo); aquí solo se agrupan y se ordenan.
import type {
  ClientsReport, ClientsReportSort, ClientsReportSortColumn, ClientReportRow, Property,
} from '../types/index';
import { round2 } from './jobFinancials';

/** Renglón de los trabajos sin cliente (va al final, como "(blank)" en la hoja). */
export const NO_CLIENT_LABEL = 'No client';

/** Orden alfabético sin distinguir mayúsculas; "No client" siempre al final. */
const compareClientRows = (rowA: ClientReportRow, rowB: ClientReportRow): number => {
  if (rowA.clientName === NO_CLIENT_LABEL) return 1;
  if (rowB.clientName === NO_CLIENT_LABEL) return -1;
  return rowA.clientName.localeCompare(rowB.clientName, 'en', { sensitivity: 'base' });
};

/**
 * Agrupa los trabajos por cliente. `getClientName` debe dar el nombre ya
 * resuelto (displayClientNameIn): así el id, el id legacy y el nombre del mismo
 * cliente caen en un solo renglón. `getFinalCost` es `calc(job).finalCost` de
 * useJobFinancials.
 */
export const buildClientsReport = (
  jobs: readonly Property[],
  getClientName: (job: Property) => string,
  getFinalCost: (job: Property) => number,
): ClientsReport => {
  const rowByClientName = new Map<string, ClientReportRow>();
  let totalFinalCost = 0;

  for (const job of jobs) {
    const clientName = getClientName(job);
    const finalCost = getFinalCost(job);
    const clientRow = rowByClientName.get(clientName) ?? { clientName, jobCount: 0, finalCost: 0, shareOfFinalCost: 0 };
    clientRow.jobCount += 1;
    clientRow.finalCost += finalCost;
    rowByClientName.set(clientName, clientRow);
    totalFinalCost += finalCost;
  }

  const roundedTotalFinalCost = round2(totalFinalCost);
  const getShareOfFinalCost = (finalCost: number) =>
    roundedTotalFinalCost > 0 ? finalCost / roundedTotalFinalCost : 0;

  const rows = [...rowByClientName.values()]
    .map((clientRow) => {
      const finalCost = round2(clientRow.finalCost);
      return { ...clientRow, finalCost, shareOfFinalCost: getShareOfFinalCost(finalCost) };
    })
    .sort(compareClientRows);

  return { rows, totalJobs: jobs.length, totalFinalCost: roundedTotalFinalCost };
};

/** El cliente con más Final Cost del periodo ("No client" no cuenta). null si
 *  no hay ninguno con monto. */
export const getTopClient = (rows: readonly ClientReportRow[]): ClientReportRow | null => {
  let topClient: ClientReportRow | null = null;
  for (const clientRow of rows) {
    if (clientRow.clientName === NO_CLIENT_LABEL || clientRow.finalCost <= 0) continue;
    if (!topClient || clientRow.finalCost > topClient.finalCost) topClient = clientRow;
  }
  return topClient;
};

/**
 * Orden siguiente al presionar el encabezado de una columna: la primera vez de
 * mayor a menor, la segunda de menor a mayor y la tercera vuelve al orden
 * original (null). Otra columna empieza de nuevo de mayor a menor.
 */
export const getNextClientsReportSort = (
  currentSort: ClientsReportSort | null,
  column: ClientsReportSortColumn,
): ClientsReportSort | null => {
  if (currentSort?.column !== column) return { column, direction: 'desc' };
  if (currentSort.direction === 'desc') return { column, direction: 'asc' };
  return null;
};

/**
 * Renglones en el orden elegido. Los empates se desempatan por cliente A–Z;
 * al ordenar por cliente, "No client" queda siempre al final.
 */
export const sortClientRows = (
  rows: readonly ClientReportRow[],
  sort: ClientsReportSort | null,
): readonly ClientReportRow[] => {
  if (!sort) return rows;
  const directionFactor = sort.direction === 'asc' ? 1 : -1;
  const compareRows = (rowA: ClientReportRow, rowB: ClientReportRow): number => {
    if (sort.column === 'clientName') {
      if (rowA.clientName === NO_CLIENT_LABEL) return 1;
      if (rowB.clientName === NO_CLIENT_LABEL) return -1;
      return directionFactor * rowA.clientName.localeCompare(rowB.clientName, 'en', { sensitivity: 'base' });
    }
    const valueDifference = rowA[sort.column] - rowB[sort.column];
    return valueDifference !== 0 ? directionFactor * valueDifference : compareClientRows(rowA, rowB);
  };
  return [...rows].sort(compareRows);
};
