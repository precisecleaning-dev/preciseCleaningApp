// src/features/houses/operationsSheetColumns.ts
// Columnas de la hoja "Daily Operations" (Excel que llevaba la oficina) y cómo
// se llena cada fila desde la app. Lo usan la lectura (operationsSheetRead),
// la comparación (operationsSheetMatch) y la exportación (operationsSheetExport).
import type { OperationsSheetExportRow, OperationsSheetRowSources, Property } from '../../types/index';

/** Encabezados de la hoja, en su orden (A–T). "Week Numer" va así en la hoja. */
export const OPERATIONS_SHEET_HEADERS = [
  'Address', 'Client', 'Note', 'Date', 'Team', 'Service Price', 'Taxes', 'Final Cost',
  'Payroll', 'Profit', 'Profit Margin', 'Invoice', 'Notes', 'Issues', 'QC Status',
  'Recall Completed', 'Move in/Rekeyed', 'Number of Days', 'Drip pans/Bulbs/Filters', 'Week Numer',
] as const;

/** Ancho de cada columna (caracteres de Excel), los mismos de la hoja. */
export const OPERATIONS_SHEET_COLUMN_WIDTHS = [
  39.5, 26.1, 28.9, 9.6, 18.8, 15.8, 12.1, 14.1, 13.5, 11, 17.5, 17.1, 44.5, 27.6, 13.5, 14.1, 14, 17.6, 35.1, 23.9,
];

/** Opciones de la columna Invoice en la hoja (lista desplegable). */
export const OPERATIONS_SHEET_INVOICE_OPTIONS = [
  'Sent', 'Paid', 'Quality Check', 'Needs Invoice', 'No se cobra', 'Transfer', 'Cheque', 'Unable to Sent',
  'Overdue 1 Reminder Sent', 'Overdue 2 Reminder Sent', 'Overdue 3 Reminder Sent',
];

/** Opciones de la columna Drip pans/Bulbs/Filters en la hoja. */
export const OPERATIONS_SHEET_SUPPLY_OPTIONS = ['Bulbs', 'Grease Filter', 'AC Filter', 'Air Freshener', 'Drip Pans'];

/** Orden de la hoja: por fecha, luego equipo y dirección. */
const compareExportRows = (rowA: OperationsSheetExportRow, rowB: OperationsSheetExportRow): number =>
  rowA.date.localeCompare(rowB.date)
  || rowA.team.localeCompare(rowB.team, 'en', { numeric: true })
  || rowA.address.localeCompare(rowB.address, 'en');

/** Filas de la hoja para los trabajos dados, en el orden de la hoja. */
export const buildOperationsSheetExportRows = (
  jobs: readonly Property[],
  sources: OperationsSheetRowSources,
): OperationsSheetExportRow[] =>
  jobs
    .map((job) => ({
      address: job.address ?? '',
      client: sources.getClientName(job),
      note: job.note || job.generalNotes || '',
      date: job.scheduleDate ?? '',
      team: sources.getTeamName(job),
      amounts: sources.getAmounts(job),
      profit: sources.getProfit(job),
      isTaxExempt: !!job.taxExempt,
      invoice: job.invoiceStatus ?? '',
      notes: sources.canSeeOfficeNotes ? job.officeNote ?? '' : '',
      issues: job.issues ?? '',
    }))
    .sort(compareExportRows);
