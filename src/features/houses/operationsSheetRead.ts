// src/features/houses/operationsSheetRead.ts
// Lee el Excel "Daily Operations" que sube la oficina: toma TODAS las pestañas
// cuyo encabezado tenga Address, Date y Service Price (Operations, September,
// October…) y devuelve sus filas de trabajo. Las pestañas con otro formato
// (Carpet & Tile Cleaning, PayrollReport, Drip Pans…) se saltan.
// Los montos son los valores que la hoja ya calculó (Google Sheets / Excel los
// guardan junto a la fórmula), no se vuelven a calcular aquí.
import type { OperationsSheetHeaderField, OperationsSheetRow } from '../../types/index';

/** Columnas que se leen, por el texto de su encabezado (sin mayúsculas ni espacios de más). */
const HEADER_KEYS: Record<OperationsSheetHeaderField, string> = {
  address: 'address',
  client: 'client',
  note: 'note',
  date: 'date',
  team: 'team',
  servicePrice: 'service price',
  taxes: 'taxes',
  finalCost: 'final cost',
  payroll: 'payroll',
  invoice: 'invoice',
};

/** Encabezados sin los que una pestaña no es de trabajos. */
const REQUIRED_FIELDS: OperationsSheetHeaderField[] = ['address', 'date', 'servicePrice'];

/** Día 0 de las fechas de Excel (30/12/1899), en ms UTC. */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

const padToTwoDigits = (value: number) => String(value).padStart(2, '0');

const normalizeHeader = (value: unknown) => String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

const getCellText = (value: unknown): string => (value === null || value === undefined ? '' : String(value).trim());

/**
 * Número de la celda: número tal cual, o texto tipo "$1,234.50" / "200,00".
 * La coma es decimal solo si le siguen 1 o 2 dígitos al final ("200,00",
 * "12,5"); si no, separa miles ("$1,234" = 1234).
 */
export const parseSheetAmount = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = getCellText(value).replace(/[$\s]/g, '');
  if (!text) return null;
  const hasCommaDecimal = !text.includes('.') && /,\d{1,2}$/.test(text);
  const withDecimalPoint = hasCommaDecimal ? text.replace(/,(?=\d{1,2}$)/, '.') : text;
  const normalized = withDecimalPoint.replace(/,/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
};

/** Fecha de la celda en AAAA-MM-DD: número de serie de Excel o texto M/D/AAAA. '' si no es fecha. */
export const parseSheetDate = (value: unknown): string => {
  if (typeof value === 'number' && value > 0) {
    // UTC a propósito: el número de serie es un día, sin hora ni zona. floor:
    // la parte decimal es la hora (45567.75 = ese día a las 6 p. m.).
    const date = new Date(EXCEL_EPOCH_MS + Math.floor(value) * DAY_MS);
    return `${date.getUTCFullYear()}-${padToTwoDigits(date.getUTCMonth() + 1)}-${padToTwoDigits(date.getUTCDate())}`;
  }
  const text = getCellText(value);
  const usDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (usDate) return `${usDate[3]}-${padToTwoDigits(Number(usDate[1]))}-${padToTwoDigits(Number(usDate[2]))}`;
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  return isoDate ? `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}` : '';
};

/** Posición de cada columna leída; null si la pestaña no es de trabajos. */
const findColumnIndexes = (headerRow: readonly unknown[]): Record<OperationsSheetHeaderField, number> | null => {
  const normalizedHeaders = headerRow.map(normalizeHeader);
  const columnIndexes = {} as Record<OperationsSheetHeaderField, number>;
  for (const [field, header] of Object.entries(HEADER_KEYS) as [OperationsSheetHeaderField, string][]) {
    columnIndexes[field] = normalizedHeaders.indexOf(header);
  }
  const hasRequiredColumns = REQUIRED_FIELDS.every((field) => columnIndexes[field] >= 0);
  return hasRequiredColumns ? columnIndexes : null;
};

/**
 * Filas de trabajo de UNA pestaña (`rows` = celdas por fila, la primera es el
 * encabezado). Se saltan las filas sin dirección o sin fecha válida.
 */
export const parseOperationsSheetRows = (sheetName: string, rows: readonly (readonly unknown[])[]): OperationsSheetRow[] => {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) return [];
  const columnIndexes = findColumnIndexes(headerRow);
  if (!columnIndexes) return [];
  const readCell = (row: readonly unknown[], field: OperationsSheetHeaderField) =>
    columnIndexes[field] >= 0 ? row[columnIndexes[field]] : null;

  const sheetRows: OperationsSheetRow[] = [];
  dataRows.forEach((row, dataIndex) => {
    const address = getCellText(readCell(row, 'address'));
    const date = parseSheetDate(readCell(row, 'date'));
    if (!address || !date) return;
    sheetRows.push({
      sheetName,
      rowNumber: dataIndex + 2,
      address,
      client: getCellText(readCell(row, 'client')),
      note: getCellText(readCell(row, 'note')),
      date,
      team: getCellText(readCell(row, 'team')),
      servicePrice: parseSheetAmount(readCell(row, 'servicePrice')),
      taxes: parseSheetAmount(readCell(row, 'taxes')),
      finalCost: parseSheetAmount(readCell(row, 'finalCost')),
      payroll: parseSheetAmount(readCell(row, 'payroll')),
      invoice: getCellText(readCell(row, 'invoice')),
    });
  });
  return sheetRows;
};

/**
 * Filas de trabajo de todas las pestañas del archivo. `xlsx` se carga solo
 * aquí (import dinámico, ~276 kB), como en DataImportView.
 */
export const readOperationsSheetFile = async (file: File): Promise<OperationsSheetRow[]> => {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return workbook.SheetNames.flatMap((sheetName) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1, raw: true, defval: null, blankrows: true,
    });
    return parseOperationsSheetRows(sheetName, rows);
  });
};
