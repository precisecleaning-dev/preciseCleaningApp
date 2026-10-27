// src/utils/clientsReport.ts
// Reporte de clientes (vista Clients Report): como la tabla dinámica de la hoja
// del mes, un renglón por cliente con cuántos trabajos tuvo, la suma de su
// Final Cost y qué parte del total es, más el Grand Total. La vista elige los
// trabajos (Schedule Date dentro del periodo); aquí solo se agrupan y se ordenan.
import type {
  ClientsReport, ClientsReportSort, ClientsReportSortColumn, ClientReportRow, Permission, Property, Role,
} from '../types/index';

/** Renglón de los trabajos sin cliente (va al final, como "(blank)" en la hoja). */
export const NO_CLIENT_LABEL = 'No client';

/** Módulo propio del reporte en Roles & Permissions. */
const CLIENTS_REPORT_MODULE = 'Clients Report';

/** Módulo del que hereda un rol que todavía no declara "Clients Report" (mismas cifras de dinero). */
const CLIENTS_REPORT_FALLBACK_MODULE = 'Invoices';

const roundToCents = (amount: number) => Math.round(amount * 100) / 100;

/** "No client" siempre al final: 1 o −1 si una de las dos filas lo es; 0 si ninguna. */
const compareNoClientLast = (rowA: ClientReportRow, rowB: ClientReportRow): number => {
  if (rowA.clientName === NO_CLIENT_LABEL) return 1;
  if (rowB.clientName === NO_CLIENT_LABEL) return -1;
  return 0;
};

/** Cliente A–Z sin distinguir mayúsculas. */
const compareClientNames = (rowA: ClientReportRow, rowB: ClientReportRow): number =>
  rowA.clientName.localeCompare(rowB.clientName, 'en', { sensitivity: 'base' });

/** Orden original: cliente A–Z con "No client" al final. */
const compareClientRows = (rowA: ClientReportRow, rowB: ClientReportRow): number =>
  compareNoClientLast(rowA, rowB) || compareClientNames(rowA, rowB);

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

  const roundedTotalFinalCost = roundToCents(totalFinalCost);
  const getShareOfFinalCost = (finalCost: number) =>
    roundedTotalFinalCost > 0 ? finalCost / roundedTotalFinalCost : 0;

  const rows = [...rowByClientName.values()]
    .map((clientRow) => {
      const finalCost = roundToCents(clientRow.finalCost);
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
      return compareNoClientLast(rowA, rowB) || directionFactor * compareClientNames(rowA, rowB);
    }
    const valueDifference = rowA[sort.column] - rowB[sort.column];
    return valueDifference !== 0 ? directionFactor * valueDifference : compareClientRows(rowA, rowB);
  };
  return [...rows].sort(compareRows);
};

/**
 * Módulo que decide el acceso al reporte: "Clients Report" si el rol lo
 * declara; si no, "Invoices" (de ahí hereda View y Scope). Lo usan App.tsx
 * (scope de las casas) y RolesView (valor inicial al editar el rol).
 */
export const getClientsReportPermissionModule = (role: Role | null | undefined): string =>
  role?.permissions?.some((permission) => permission.module === CLIENTS_REPORT_MODULE)
    ? CLIENTS_REPORT_MODULE
    : CLIENTS_REPORT_FALLBACK_MODULE;

/**
 * Lo que tiene en "Clients Report" un rol que NO lo declara: View y Scope de
 * "Invoices" (igual que "Projects" hereda de "Task List"). Es un reporte: Add,
 * Edit y Delete no aplican. Así abrir y guardar el rol no le quita el reporte.
 */
export const getInheritedClientsReportPermission = (role: Role | null | undefined): Permission => {
  const invoicesPermission = role?.permissions?.find((permission) => permission.module === CLIENTS_REPORT_FALLBACK_MODULE);
  return {
    module: CLIENTS_REPORT_MODULE,
    canView: !!invoicesPermission?.canView,
    canAdd: false,
    canEdit: false,
    canDelete: false,
    scope: invoicesPermission?.scope === 'Own' ? 'Own' : 'All',
  };
};
