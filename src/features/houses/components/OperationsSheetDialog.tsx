// ⭐ PIPELINE → EXCEL — la hoja "Daily Operations" de la oficina:
//    · Export: descarga los trabajos del periodo con el MISMO formato de la hoja
//      (operationsSheetExport.ts).
//    · Compare: se sube el Excel y cada fila se empareja con su trabajo de la
//      app por dirección + fecha; se revisan Service Price, Taxes, Final Cost y
//      Payroll (operationsSheetMatch.ts).
//    Ambos usan el periodo de la barra (por defecto el mes) y los trabajos de
//    la empresa elegida en el Pipeline (Normal / Cavalry).
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import type { OperationsSheetAmounts, Property, UploadedOperationsSheet } from '../../../types/index';
import { inPeriod, MONTHS_LONG, periodRange } from '../../../utils/periods';
import { formatCount, pluralize } from '../../../utils/countFormat';
import { useJobFinancials } from '../../../utils/jobFinancials';
import { getRelationName } from '../../../utils/relations';
import { formatDateForFile, todayIso } from '../../../utils/dateFormat';
import { useStoredPeriod } from '../../../shared/hooks/useStoredPeriod';
import { useLiveData } from '../../../shared/data/liveCollections';
import { customerNameIndex, displayClientNameIn } from '../../../utils/customerDocs';
import PeriodBar from '../../../components/PeriodBar';
import HistoryWindowNotice from '../../../components/HistoryWindowNotice';
import { buildOperationsSheetExportRows } from '../operationsSheetColumns';
import { readOperationsSheetFile } from '../operationsSheetRead';
import { compareOperationsSheet } from '../operationsSheetMatch';
import { downloadOperationsSheet } from '../operationsSheetExport';
import OperationsSheetComparison from './OperationsSheetComparison';
import './OperationsSheetDialog.css';

/** Pestaña del archivo cuando el periodo no es un mes ("Operations", como la hoja). */
const DEFAULT_SHEET_NAME = 'Operations';

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
  const { calc: calcJobFinancials, loading: isFinancialsLoading } = useJobFinancials();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Escape cierra (como DeleteHouseDialog).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // El foco entra al diálogo al abrirlo y vuelve a donde estaba (el botón
  // Excel) al cerrarlo.
  useEffect(() => {
    const previouslyFocusedElement = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previouslyFocusedElement?.focus?.();
  }, []);

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
    return compareOperationsSheet(periodSheetRows, periodJobs, { getAppAmounts, getClientName: getJobClientName });
  }, [uploadedSheet, isFinancialsLoading, periodSheetRows, periodJobs, getAppAmounts, getJobClientName]);

  const isMonthPeriod = period.kind === 'month';
  const sheetName = isMonthPeriod ? MONTHS_LONG[Number(period.anchor.slice(5, 7)) - 1] : DEFAULT_SHEET_NAME;
  const exportSummary = `${pluralize(periodJobs.length, 'job', 'jobs')} · ${periodDateRange.label} · ${businessName}`;
  const uploadSummary = uploadedSheet
    ? `${uploadedSheet.fileName} · ${pluralize(periodSheetRows.length, 'row', 'rows')} in this period (of ${formatCount(uploadedSheet.rows.length)}) · compared with ${businessName} jobs only`
    : 'Upload the Daily Operations Excel to check it against the app.';
  const isExportDisabled = isExporting || isFinancialsLoading || periodJobs.length === 0;

  const handleExport = async () => {
    setErrorMessage('');
    setIsExporting(true);
    try {
      const exportRows = buildOperationsSheetExportRows(periodJobs, {
        getClientName: getJobClientName,
        getTeamName: (job) => getRelationName(teams, job.teamId, ''),
        getAmounts: getAppAmounts,
        getProfit: (job) => calcJobFinancials(job).profit,
        canSeeOfficeNotes,
      });
      const fileName = `Daily_Operations_${sheetName}_${formatDateForFile(todayIso())}.xlsx`;
      await downloadOperationsSheet(exportRows, sheetName, fileName);
    } catch (error) {
      console.error(error);
      setErrorMessage('Could not create the Excel file. Try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
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
      onUploadedSheetChange({ fileName: selectedFile.name, rows });
    } catch (error) {
      console.error(error);
      setErrorMessage('Could not read that file. Upload the .xlsx exported from the Daily Operations sheet.');
    } finally {
      setIsReadingFile(false);
    }
  };

  return (
    <div className="modal-overlay-centered" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal-90 osd-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="osd-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="osd-header">
          <div className="osd-heading">
            <FileSpreadsheet size={22} className="osd-heading-icon" aria-hidden="true" />
            <div>
              <h2 id="osd-title" className="osd-title">Operations Excel</h2>
              <p className="osd-subtitle">Export the Daily Operations sheet or check it against the app.</p>
            </div>
          </div>
          <button type="button" className="osd-close-btn" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="osd-body">
          <PeriodBar period={period} onChange={setPeriod} />
          <HistoryWindowNotice />

          <div className="osd-actions">
            <section className="osd-action-card" aria-label="Export">
              <div>
                <h3 className="osd-action-title">Export</h3>
                <p className="osd-action-text">{exportSummary}</p>
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
                onChange={handleFileSelected}
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
