// ⭐ PIPELINE → EXCEL — la hoja "Daily Operations" de la oficina:
//    · Export: descarga los trabajos del periodo con el MISMO formato de la hoja
//      (operationsSheetExport.ts).
//    · Compare: se sube el Excel y cada fila se empareja con su trabajo de la
//      app por dirección + fecha; se revisan Service Price, Taxes, Final Cost y
//      Payroll (operationsSheetMatch.ts).
//    Ambos usan el periodo de la barra (por defecto el mes) y los trabajos de
//    la empresa elegida en el Pipeline (Normal / Cavalry).
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import type {
  OperationsSheetAmounts, OperationsSheetComparisonTab, OperationsSheetRow, Property, UploadedOperationsSheet,
} from '../../../types/index';
import { inPeriod, MONTHS_LONG, periodRange, type PeriodState } from '../../../utils/periods';
import { formatCount, pluralize } from '../../../utils/countFormat';
import { useJobFinancials } from '../../../utils/jobFinancials';
import { getRelationName } from '../../../utils/relations';
import { dateSortValue, formatDateForFile, todayIso } from '../../../utils/dateFormat';
import { useStoredPeriod } from '../../../shared/hooks/useStoredPeriod';
import { useStableCallback } from '../../../shared/hooks/useStableCallback';
import { isHiddenByWindow, useFullHistory, WINDOW_MONTHS } from '../../../shared/data/propertiesWindow';
import { useLiveData } from '../../../shared/data/liveCollections';
import { customerNameIndex, displayClientNameIn } from '../../../utils/customerDocs';
import PeriodBar from '../../../components/PeriodBar';
import HistoryWindowNotice from '../../../components/HistoryWindowNotice';
import { buildOperationsSheetExportRows } from '../operationsSheetColumns';
import { readOperationsSheetFile } from '../operationsSheetRead';
import { compareOperationsSheet } from '../operationsSheetMatch';
import { downloadOperationsSheet, ExcelToolLoadError } from '../operationsSheetExport';
import OperationsSheetComparison from './OperationsSheetComparison';
import './OperationsSheetDialog.css';

/** Pestaña del archivo cuando el periodo no es un mes ("Operations", como la hoja). */
const DEFAULT_SHEET_NAME = 'Operations';

const EXPORT_ERROR_MESSAGE = 'Could not create the Excel file. Try again.';
const EXCEL_TOOL_LOAD_ERROR_MESSAGE =
  'Could not load the Excel tool. Check your internet connection and reload the page.';

/** Sin conexión o con la pestaña de antes de un deploy, reintentar no sirve. */
const getExportErrorMessage = (error: unknown) =>
  error instanceof ExcelToolLoadError ? EXCEL_TOOL_LOAD_ERROR_MESSAGE : EXPORT_ERROR_MESSAGE;

const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Elementos del diálogo que reciben foco con Tab (los visibles). */
const getFocusableElements = (container: HTMLElement | null): HTMLElement[] =>
  container
    ? [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((element) => element.getClientRects().length > 0)
    : [];

interface OperationsSheetDialogProps {
  /** Trabajos de la empresa elegida, con el scope del rol ya aplicado. */
  jobs: Property[];
  businessName: string;
  /** El rol puede ver las notas de oficina (columna Notes del Excel). */
  canSeeOfficeNotes: boolean;
  /** Excel subido (lo guarda HouseList: sigue ahí al volver de abrir un trabajo). */
  uploadedSheet: UploadedOperationsSheet | null;
  onUploadedSheetChange: (uploadedSheet: UploadedOperationsSheet | null) => void;
  onOpenHouse: (house: Property) => void;
  onClose: () => void;
}

const OperationsSheetDialog = ({
  jobs, businessName, canSeeOfficeNotes, uploadedSheet, onUploadedSheetChange, onOpenHouse, onClose,
}: OperationsSheetDialogProps) => {
  const [period, setPeriod] = useStoredPeriod('pc.operationsSheet.period', 'month');
  const periodDateRange = useMemo(() => periodRange(period), [period]);
  const hasFullHistory = useFullHistory();
  const { calc: calcJobFinancials, loading: isFinancialsLoading } = useJobFinancials();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  // El foco vuelve al botón Excel solo al cerrar (X, Escape o clic afuera).
  // Con "Open" se queda en el detalle de la casa que se abre encima.
  const handleCloseDialog = useStableCallback(() => {
    previouslyFocusedElementRef.current?.focus?.();
    onClose();
  });

  // Escape cierra (como DeleteHouseDialog).
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') handleCloseDialog();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCloseDialog]);

  // El foco entra al diálogo al abrirlo; se recuerda dónde estaba.
  useEffect(() => {
    previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
  }, []);

  // Tab y Shift+Tab dan la vuelta dentro del diálogo (aria-modal).
  const handleTrapTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const focusableElements = getFocusableElements(dialogRef.current);
    if (focusableElements.length === 0) return;
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const isOnFirstElement = document.activeElement === firstElement || document.activeElement === dialogRef.current;
    if (event.shiftKey && isOnFirstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  // Ventana de 12 meses: sin todo el historial, un trabajo de antes no está
  // cargado. El export lo pide antes de armar el archivo; la comparación
  // separa esas filas del Excel (operationsSheetMatch.ts).
  const isPeriodOutsideLoadedHistory = isHiddenByWindow(hasFullHistory, false, periodDateRange.start ?? 0);
  const isOutsideLoadedHistory = useCallback(
    (sheetRow: OperationsSheetRow) => isHiddenByWindow(hasFullHistory, false, dateSortValue(sheetRow.date)),
    [hasFullHistory],
  );

  const periodJobs = useMemo(
    () => jobs.filter((job) => inPeriod(job.scheduleDate, periodDateRange)),
    [jobs, periodDateRange],
  );
  const periodSheetRows = useMemo(
    () => uploadedSheet?.rows.filter((sheetRow) => inPeriod(sheetRow.date, periodDateRange)) ?? [],
    [uploadedSheet, periodDateRange],
  );

  const customers = useLiveData('customers');
  const teams = useLiveData('teams');
  const clientNameIndex = useMemo(() => customerNameIndex(customers), [customers]);
  const getJobClientName = useCallback(
    (job: Property) => displayClientNameIn(clientNameIndex, job.client),
    [clientNameIndex],
  );

  const getAppAmounts = useCallback((job: Property): OperationsSheetAmounts => {
    const { servicePrice, taxes, finalCost, payroll } = calcJobFinancials(job);
    return { servicePrice, taxes, finalCost, payroll };
  }, [calcJobFinancials]);

  const comparison = useMemo(() => {
    if (!uploadedSheet || isFinancialsLoading) return null;
    return compareOperationsSheet(periodSheetRows, periodJobs, {
      getAppAmounts, getClientName: getJobClientName, isOutsideLoadedHistory,
    });
  }, [uploadedSheet, isFinancialsLoading, periodSheetRows, periodJobs, getAppAmounts, getJobClientName, isOutsideLoadedHistory]);

  const isMonthPeriod = period.kind === 'month';
  const sheetName = isMonthPeriod ? MONTHS_LONG[Number(period.anchor.slice(5, 7)) - 1] : DEFAULT_SHEET_NAME;
  const exportSummary = `${pluralize(periodJobs.length, 'job', 'jobs')} · ${periodDateRange.label} · ${businessName}`;
  const uploadSummary = uploadedSheet
    ? `${uploadedSheet.fileName} · ${pluralize(periodSheetRows.length, 'row', 'rows')} in this period (of ${formatCount(uploadedSheet.rows.length)}) · compared with ${businessName} jobs only`
    : 'Upload the Daily Operations Excel to check it against the app.';
  const isExportDisabled = isExporting || isFinancialsLoading || periodJobs.length === 0 || isPeriodOutsideLoadedHistory;
  const olderPeriodText = `This period goes back more than ${WINDOW_MONTHS} months: load the full history to export every job.`;

  // Otro periodo: la comparación vuelve a la primera pestaña con resultados.
  const handlePeriodChange = (nextPeriod: PeriodState) => {
    setPeriod(nextPeriod);
    if (uploadedSheet?.comparisonTab) onUploadedSheetChange({ ...uploadedSheet, comparisonTab: null });
  };

  const handleComparisonTabChange = (comparisonTab: OperationsSheetComparisonTab) => {
    if (uploadedSheet) onUploadedSheetChange({ ...uploadedSheet, comparisonTab });
  };

  const handleExport = async () => {
    setErrorMessage('');
    setIsExporting(true);
    try {
      const exportRows = buildOperationsSheetExportRows(periodJobs, {
        getClientName: getJobClientName,
        getTeamName: (job) => getRelationName(teams, job.teamId, ''),
        getAmounts: getAppAmounts,
        getProfit: (job) => calcJobFinancials(job).profit,
        getMargin: (job) => calcJobFinancials(job).margin,
        canSeeOfficeNotes,
      });
      const fileName = `Daily_Operations_${sheetName}_${formatDateForFile(todayIso())}.xlsx`;
      await downloadOperationsSheet(exportRows, sheetName, fileName);
    } catch (error) {
      console.error(error);
      setErrorMessage(getExportErrorMessage(error));
    } finally {
      setIsExporting(false);
    }
  };

  const handleUploadSheet = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';
    if (!selectedFile) return;
    setErrorMessage('');
    setIsReadingFile(true);
    try {
      const rows = await readOperationsSheetFile(selectedFile);
      if (rows.length === 0) {
        setErrorMessage('No job rows found. The sheet needs the Address, Date and Service Price columns.');
        return;
      }
      onUploadedSheetChange({ fileName: selectedFile.name, rows, comparisonTab: null });
    } catch (error) {
      console.error(error);
      setErrorMessage('Could not read that file. Upload the .xlsx exported from the Daily Operations sheet.');
    } finally {
      setIsReadingFile(false);
    }
  };

  return (
    <div className="modal-overlay-centered" onClick={handleCloseDialog}>
      <div
        ref={dialogRef}
        className="modal-90 osd-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="osd-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleTrapTabKey}
      >
        <header className="osd-header">
          <div className="osd-heading">
            <FileSpreadsheet size={22} className="osd-heading-icon" aria-hidden="true" />
            <div>
              <h2 id="osd-title" className="osd-title">Operations Excel</h2>
              <p className="osd-subtitle">Export the Daily Operations sheet or check it against the app.</p>
            </div>
          </div>
          <button type="button" className="osd-close-btn" aria-label="Close" onClick={handleCloseDialog}>
            <X size={20} />
          </button>
        </header>

        <div className="osd-body">
          <PeriodBar period={period} onChange={handlePeriodChange} />
          <HistoryWindowNotice />

          <div className="osd-actions">
            <section className="osd-action-card" aria-label="Export">
              <div>
                <h3 className="osd-action-title">Export</h3>
                <p className="osd-action-text">{exportSummary}</p>
                {isPeriodOutsideLoadedHistory && <p className="osd-action-warning">{olderPeriodText}</p>}
              </div>
              <button type="button" className="osd-primary-btn" disabled={isExportDisabled} onClick={handleExport}>
                {isExporting ? <Loader2 size={16} className="spin" /> : <Download size={16} />} Download Excel
              </button>
            </section>

            <section className="osd-action-card" aria-label="Compare">
              <div>
                <h3 className="osd-action-title">Compare</h3>
                <p className="osd-action-text">{uploadSummary}</p>
              </div>
              <button
                type="button"
                className="osd-secondary-btn"
                disabled={isReadingFile}
                onClick={() => fileInputRef.current?.click()}
              >
                {isReadingFile ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
                {uploadedSheet ? ' Change file' : ' Upload Excel'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="osd-file-input"
                onChange={handleUploadSheet}
              />
            </section>
          </div>

          {errorMessage && <p className="osd-error" role="alert">{errorMessage}</p>}

          {uploadedSheet && !comparison && (
            <div className="osd-loading" aria-hidden="true">
              <span className="skel-line skel-row-main" />
              <span className="skel-line skel-row-main" />
            </div>
          )}

          {comparison && (
            <OperationsSheetComparison
              key={`${uploadedSheet?.fileName}-${periodDateRange.start}-${periodDateRange.end}`}
              comparison={comparison}
              selectedTab={uploadedSheet?.comparisonTab ?? null}
              onSelectedTabChange={handleComparisonTabChange}
              getClientName={getJobClientName}
              onOpenHouse={onOpenHouse}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default OperationsSheetDialog;
