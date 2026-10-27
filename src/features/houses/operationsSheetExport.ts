// src/features/houses/operationsSheetExport.ts
// Exporta los trabajos al Excel "Daily Operations" con el MISMO aspecto de la
// hoja de la oficina: encabezado azul (#535FC1) con filtros, filas celeste
// (#CFE2F3) con borde, letra Arial, formatos m/d/yyyy, $ y %, primera fila fija
// y las listas de Invoice y Drip pans/Bulbs/Filters.
// Taxes, Final Cost, Profit, Profit Margin y Week Numer van como FÓRMULAS
// cuando los montos de la app (utils/jobFinancials.ts) caben en una: Taxes =
// F×8.25%, Final Cost = F+G (impuesto sumado) o F−G (restado), Profit = H−G−I
// o H−I (el impuesto sumado es del estado, no ganancia; la hoja usa H−I). Si
// no caben (sin impuesto, otro %, o un trabajo que suma y resta), va el valor.
// La fórmula de la hoja con XLOOKUP a la pestaña Customers no se copia: esa
// pestaña no viene en el archivo y daría #REF!.
// `exceljs` (~1 MB) se carga solo al exportar (import dinámico).
import type * as ExcelJS from 'exceljs';
import type {
  ExcelWorksheetWithRangeValidations, OperationsSheetAmounts, OperationsSheetExportRow, OperationsSheetFinalCostKind,
} from '../../types/index';
import { isSameAmount, roundToCents, TAX_RATE } from '../../utils/jobFinancials';
import { downloadBlob } from '../../shared/utils/downloadFile';
import {
  OPERATIONS_SHEET_COLUMN_WIDTHS, OPERATIONS_SHEET_HEADERS, OPERATIONS_SHEET_INVOICE_OPTIONS,
  OPERATIONS_SHEET_SUPPLY_OPTIONS,
} from './operationsSheetColumns';

/** Colores de la hoja (estilo de tabla "Operations-style"). */
const HEADER_FILL_COLOR = 'FF535FC1';
const HEADER_TEXT_COLOR = 'FF000000';
const ROW_FILL_COLOR = 'FFCFE2F3';
const BORDER_COLOR = 'FF535FC1';

const FONT_NAME = 'Arial';
const ROW_HEIGHT = 22.5;

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const DATE_FORMAT = 'm/d/yyyy';
const MONEY_FORMAT = '"$"#,##0.00';
const PERCENT_FORMAT = '0.00%';

/** Columnas (1 = A) con formato de fecha, de dinero y de porcentaje. */
const DATE_COLUMN = 4;
const MONEY_COLUMNS = [6, 7, 8, 9, 10];
const PERCENT_COLUMN = 11;
const INVOICE_COLUMN_LETTER = 'L';
const SUPPLY_COLUMN_LETTER = 'S';

const TAX_PERCENT_TEXT = `${TAX_RATE * 100}%`;


/** "2026-10-08" → Date a medianoche UTC (exceljs pasa la fecha a número de serie en UTC). */
const toExcelDate = (isoDate: string): Date | null => {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  return dateMatch ? new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]))) : null;
};

/** WEEKNUM de Excel (semanas que empiezan en domingo), para el valor ya calculado. */
const getExcelWeekNumber = (isoDate: string): number | null => {
  const date = toExcelDate(isoDate);
  if (!date) return null;
  const januaryFirst = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.round((date.getTime() - januaryFirst) / 86_400_000);
  return Math.floor((dayOfYear + new Date(januaryFirst).getUTCDay()) / 7) + 1;
};

/** Taxes: F×8.25% si es el 8.25% del precio; si no (sin impuesto, otro %), el valor. */
const buildTaxesCell = (row: OperationsSheetExportRow, rowNumber: number) => {
  const { servicePrice, taxes } = row.amounts;
  const isStandardTax = taxes > 0 && isSameAmount(taxes, roundToCents(servicePrice * TAX_RATE));
  return isStandardTax ? { formula: `F${rowNumber}*${TAX_PERCENT_TEXT}`, result: taxes } : taxes;
};

/** F+G (impuesto sumado), F−G (restado) o null si el trabajo suma y resta. */
const getFinalCostKind = ({ servicePrice, taxes, finalCost }: OperationsSheetAmounts): OperationsSheetFinalCostKind => {
  if (isSameAmount(finalCost, servicePrice + taxes)) return 'taxAdded';
  if (isSameAmount(finalCost, servicePrice - taxes)) return 'taxSubtracted';
  return null;
};

/**
 * Final Cost como en la hoja: F+G (Apply Tax = Yes) o F−G (No). Si el trabajo
 * mezcla servicios con y sin Apply Tax no hay una fórmula de la hoja que dé
 * ese monto: va el valor de la app.
 */
const buildFinalCostCell = (row: OperationsSheetExportRow, rowNumber: number, finalCostKind: OperationsSheetFinalCostKind) => {
  const { finalCost } = row.amounts;
  if (finalCostKind === 'taxAdded') return { formula: `F${rowNumber}+G${rowNumber}`, result: finalCost };
  if (finalCostKind === 'taxSubtracted') return { formula: `F${rowNumber}-G${rowNumber}`, result: finalCost };
  return finalCost;
};

/**
 * Profit sin el impuesto que es del estado: H−G−I con Apply Tax = Yes (el
 * impuesto se sumó al Final Cost) y H−I con No (ya se restó). Trabajo mixto:
 * el valor de la app.
 */
const buildProfitCell = (row: OperationsSheetExportRow, rowNumber: number, finalCostKind: OperationsSheetFinalCostKind) => {
  if (finalCostKind === 'taxAdded') return { formula: `H${rowNumber}-G${rowNumber}-I${rowNumber}`, result: row.profit };
  if (finalCostKind === 'taxSubtracted') return { formula: `H${rowNumber}-I${rowNumber}`, result: row.profit };
  return row.profit;
};

/** Celdas A–T de una fila; las fórmulas llevan su resultado para verse sin recalcular. */
const buildRowValues = (row: OperationsSheetExportRow, rowNumber: number) => {
  const { servicePrice, finalCost, payroll } = row.amounts;
  const { profit } = row;
  const finalCostKind = getFinalCostKind(row.amounts);
  const weekNumber = getExcelWeekNumber(row.date);
  return [
    row.address,
    row.client,
    row.note,
    toExcelDate(row.date),
    row.team,
    servicePrice,
    buildTaxesCell(row, rowNumber),
    buildFinalCostCell(row, rowNumber, finalCostKind),
    payroll,
    buildProfitCell(row, rowNumber, finalCostKind),
    { formula: `IFERROR(J${rowNumber}/H${rowNumber},0)`, result: finalCost ? profit / finalCost : 0 },
    row.invoice,
    row.notes || null,
    row.issues || null,
    null,
    null,
    null,
    null,
    null,
    weekNumber === null ? null : { formula: `WEEKNUM(D${rowNumber})`, result: weekNumber },
  ];
};

/** Arma el .xlsx en memoria. `sheetName` es el nombre de la pestaña ("October", "Operations"…). */
export const buildOperationsSheetFile = async (
  rows: readonly OperationsSheetExportRow[],
  sheetName: string,
): Promise<ArrayBuffer> => {
  const excelModule: typeof ExcelJS & { default?: typeof ExcelJS } = await import('exceljs');
  // exceljs es CommonJS: según quien lo empaqueta llega con `default` o sin él.
  const { Workbook } = excelModule.default ?? excelModule;
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
  const thinBorder = { style: 'thin' as const, color: { argb: BORDER_COLOR } };
  const cellBorder = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

  worksheet.columns = OPERATIONS_SHEET_HEADERS.map((header, columnIndex) => ({
    header,
    width: OPERATIONS_SHEET_COLUMN_WIDTHS[columnIndex],
  }));

  const headerRow = worksheet.getRow(1);
  headerRow.height = ROW_HEIGHT;
  headerRow.eachCell((cell) => {
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = cellBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL_COLOR } };
    cell.font = { bold: true, color: { argb: HEADER_TEXT_COLOR }, name: FONT_NAME, size: 11 };
  });

  rows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const excelRow = worksheet.addRow(buildRowValues(row, rowNumber));
    excelRow.height = ROW_HEIGHT;
    for (let columnNumber = 1; columnNumber <= OPERATIONS_SHEET_HEADERS.length; columnNumber += 1) {
      const cell = excelRow.getCell(columnNumber);
      cell.alignment = { vertical: 'middle' };
      cell.border = cellBorder;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_FILL_COLOR } };
      cell.font = { name: FONT_NAME, size: 10 };
      if (columnNumber === DATE_COLUMN) cell.numFmt = DATE_FORMAT;
      if (MONEY_COLUMNS.includes(columnNumber)) cell.numFmt = MONEY_FORMAT;
      if (columnNumber === PERCENT_COLUMN) cell.numFmt = PERCENT_FORMAT;
    }
  });

  if (rows.length > 0) {
    const lastRowNumber = rows.length + 1;
    const { dataValidations } = worksheet as unknown as ExcelWorksheetWithRangeValidations;
    dataValidations.add(`${INVOICE_COLUMN_LETTER}2:${INVOICE_COLUMN_LETTER}${lastRowNumber}`, {
      type: 'list', allowBlank: true, formulae: [`"${OPERATIONS_SHEET_INVOICE_OPTIONS.join(',')}"`],
    });
    dataValidations.add(`${SUPPLY_COLUMN_LETTER}2:${SUPPLY_COLUMN_LETTER}${lastRowNumber}`, {
      type: 'list', allowBlank: true, formulae: [`"${OPERATIONS_SHEET_SUPPLY_OPTIONS.join(',')}"`],
    });
  }

  worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: OPERATIONS_SHEET_HEADERS.length } };

  return workbook.xlsx.writeBuffer();
};

/** Arma y descarga el .xlsx con el nombre `fileName`. */
export const downloadOperationsSheet = async (
  rows: readonly OperationsSheetExportRow[],
  sheetName: string,
  fileName: string,
): Promise<void> => {
  const fileBuffer = await buildOperationsSheetFile(rows, sheetName);
  downloadBlob(new Blob([fileBuffer], { type: XLSX_MIME_TYPE }), fileName);
};
