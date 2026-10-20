// src/features/quality-check/qcReports.ts
// ============================================================================
// Reglas de la tabla de reportes de Quality Check (antes dentro de
// QCReportsTableView): puntaje, notas, hora del reporte, a qué pestaña va
// según el estado ACTUAL de la casa, y formatos de hora y duración.
// ============================================================================
import type { Property, QcReportRow, QcReportTab, Status } from '../../types/index';
import { formatTime } from '../../utils/dateFormat';
import { computeQCScore } from '../../utils/qcScore';
import { isInvoiceName, isRecallName } from '../../utils/statusFilters';
import type { QCPdfTask } from '../../utils/qcReportPdf';

export const REPORT_TAB_ORDER: QcReportTab[] = ['quality_check', 'invoice', 'recall'];

export const REPORT_TAB_LABEL: Record<QcReportTab, string> = {
  quality_check: 'Quality Checks',
  invoice: 'Invoice',
  recall: 'Recall',
};

/** ISO → milisegundos (NaN si no se puede leer). */
const toTimestampMs = (isoDateTime?: string | null): number => {
  if (!isoDateTime) return NaN;
  return new Date(isoDateTime).getTime();
};

/** "12:24 AM" o "—" si no hay hora. */
export const formatReportClock = (isoDateTime?: string | null): string => formatTime(isoDateTime) || '—';

/** 45 → "45 min"; 90 → "1 h 30 min"; sin dato → "—". */
export const formatInspectionDuration = (minutes?: number | null): string => {
  if (typeof minutes !== 'number' || !isFinite(minutes) || minutes < 0) return '—';
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return remainingMinutes ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
};

/** Resultado (%) del reporte. Se prefiere el GUARDADO al cerrar la inspección;
 *  los registros viejos no lo tienen y se recalcula desde qcData con el mismo
 *  util que usa el PDF (mismo número, sin generarlo). */
export const getReportScore = (report: QcReportRow, tasks: QCPdfTask[]): { passRate: number; hasData: boolean } => {
  if (typeof report.passRate === 'number' && (report.passRateAnswered ?? 1) > 0) {
    return { passRate: report.passRate, hasData: true };
  }
  const computedScore = computeQCScore(report.qcData ?? {}, tasks);
  return { passRate: computedScore.passRate, hasData: computedScore.hasData };
};

/** Notas capturadas durante la inspección, resumidas en una línea. */
export const getReportNotes = (report: QcReportRow): string => {
  const noteParts: string[] = [];
  Object.values(report.qcData ?? {}).forEach((placeEntry) => {
    const placeData = placeEntry as { notes?: string; damage?: string };
    if (placeData?.notes) noteParts.push(String(placeData.notes).replace(/\n/g, ' · '));
    if (placeData?.damage) noteParts.push(`⚠ ${placeData.damage}`);
  });
  return noteParts.join(' · ').trim();
};

/** Hora del reporte para ordenar: cierre de la inspección; en registros viejos,
 *  createdAt, la entrada o la fecha (el primero que se pueda leer). */
export const getReportTimeMs = (report: QcReportRow): number => {
  const candidates = [report.checkOutAt, report.createdAt, report.checkInAt, report.date ? `${report.date}T00:00:00` : null];
  for (const candidate of candidates) {
    const timestampMs = toTimestampMs(candidate);
    if (!Number.isNaN(timestampMs)) return timestampMs;
  }
  return 0;
};

/** Pestaña del reporte según el estado ACTUAL de su casa. Si la casa ya no
 *  existe o está en otro estado, cae en "Quality Checks". */
export const getReportTab = (house: Property | undefined, statuses: Status[]): QcReportTab => {
  const rawStatus = String(house?.statusId ?? '').trim();
  const houseStatus = statuses.find((status) => String(status.id) === rawStatus || String(status.name) === rawStatus);
  const statusName = houseStatus?.name ?? rawStatus;
  if (isRecallName(statusName)) return 'recall';
  if (isInvoiceName(statusName)) return 'invoice';
  return 'quality_check';
};
