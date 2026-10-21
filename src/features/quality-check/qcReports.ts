// src/features/quality-check/qcReports.ts
// ============================================================================
// Reglas de la tabla de reportes de Quality Check (antes dentro de
// QCReportsTableView): puntaje, notas, hora del reporte, qué reportes salen
// en la tabla (no los de casas HOY en Recall), formatos de hora y duración, y
// qué clics abren el detalle de la casa.
// ============================================================================
import type { MouseEvent } from 'react';
import { Check, Repeat } from 'lucide-react';
import type { Place, QcReportArea, QcReportRow, QcResultBadge } from '../../types/index';
import { formatTime } from '../../utils/dateFormat';
import { computeQCScore } from '../../utils/qcScore';
import type { QCPdfTask } from '../../utils/qcReportPdf';
import { sortPlacesByOrder } from '../../utils/qcCatalog';
import { GENERAL_SLOT, GENERAL_SLOT_NAME, getFailedTaskNames, OFFICE_SLOT, withFailNoteLines } from './qcForm';

/** Resultado de un reporte terminado: la misma insignia en las tarjetas de
 *  Quality Check Reports y en la pestaña "Quality check" de la casa. */
export const PASSED_BADGE: QcResultBadge = { background: '#dcfce7', color: '#166534', label: 'Passed', Icon: Check };
export const FAILED_BADGE: QcResultBadge = { background: '#f3e8ff', color: '#7c3aed', label: 'Did Not Pass', Icon: Repeat };

/** Insignia de un reporte terminado según su resultado. */
export const getFinishedResultBadge = (report: QcReportRow): QcResultBadge =>
  (report.result === 'failed' ? FAILED_BADGE : PASSED_BADGE);

/** Tocar un reporte abre el detalle de su casa, salvo si el clic fue en uno de
 *  sus controles (envíos, status): esos hacen lo suyo. */
export const isInteractiveClickTarget = (event: MouseEvent<HTMLElement>): boolean =>
  event.target instanceof Element && event.target.closest('a, button, input, select, textarea') !== null;

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

/** Áreas de un reporte con algo que leer (respuestas, nota o fotos), en el
 *  orden del checklist y "General" al final. Las fotos de oficina
 *  (OFFICE_SLOT) nunca salen fuera del panel de inspección. La nota se muestra
 *  con sus líneas "Fail <tarea>" (la línea vieja "⚠ Marcado "No"" se convierte) y,
 *  si el reporte es viejo y lo tiene, el daño anotado ("Damage: …", como en el PDF). */
export const getReportAreas = (report: QcReportRow, places: Place[], tasks: QCPdfTask[]): QcReportArea[] => {
  const placeById = new Map(places.map((place) => [place.id, place] as const));
  const taskNameById = new Map(tasks.map((task) => [task.id, task.name] as const));
  const positionByPlaceId = new Map(sortPlacesByOrder(places).map((place, position) => [place.id, position] as const));
  // Áreas borradas del catálogo antes de "General", que siempre va al final.
  const getAreaSortPosition = (areaId: string): number => {
    if (areaId === GENERAL_SLOT) return Number.MAX_SAFE_INTEGER;
    return positionByPlaceId.get(areaId) ?? Number.MAX_SAFE_INTEGER - 1;
  };
  return Object.entries(report.qcData ?? {})
    .filter(([areaId]) => areaId !== OFFICE_SLOT)
    .map(([areaId, areaData]): QcReportArea => {
      const areaAnswers: Record<string, string> = areaData?.tasks ?? {};
      const answers = Object.values(areaAnswers);
      const failedTaskNames = getFailedTaskNames(areaAnswers, taskNameById);
      const damage = String(areaData?.damage ?? '').trim();
      const notes = withFailNoteLines(String(areaData?.notes ?? ''), failedTaskNames).trim();
      return {
        id: areaId,
        name: areaId === GENERAL_SLOT ? GENERAL_SLOT_NAME : placeById.get(areaId)?.name ?? 'Area',
        passedCount: answers.filter((answer) => answer === 'Yes').length,
        answeredCount: answers.length,
        notes: [notes, damage && `Damage: ${damage}`].filter(Boolean).join('\n'),
        photoUrls: (Array.isArray(areaData?.photos) ? areaData.photos : [])
          .filter((photoUrl: unknown): photoUrl is string => typeof photoUrl === 'string'),
      };
    })
    .filter((area) => area.answeredCount > 0 || area.notes !== '' || area.photoUrls.length > 0)
    .sort((firstArea, secondArea) => getAreaSortPosition(firstArea.id) - getAreaSortPosition(secondArea.id));
};
