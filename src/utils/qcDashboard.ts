// src/utils/qcDashboard.ts
// ⭐ Lógica de la vista "QC Dashboard" (diseño "Quality Check dashboard" del
//    lienzo Unified Jobs View). Vive aparte del componente para que las reglas
//    se lean de un vistazo:
//
//    · Trabajo COMPLETADO del periodo = casa con Schedule Date en el periodo y
//      que ya terminó el trabajo: status Quality Check / Invoice / Recall /
//      "complete…", o marcado como terminado por el empleado, o con un QC.
//    · Resultado = último reporte de QC de la casa:
//        Finished y no fallido → Passed · fallido → Re-clean · sin QC terminado
//        → Not inspected.
//    · Score = % guardado al cerrar la inspección (passRate) o, en registros
//      viejos, recalculado desde qcData con el mismo util que el PDF.
//    · Issues = áreas con al menos una tarea marcada "No".

import type { Property } from '../types/index';
import { computeQCScore } from './qcScore';

export interface QcRecordLite {
  id: string;
  houseId: string;
  date?: string;
  createdAt?: string;
  status?: string;
  result?: string | null;
  inspector?: string;
  team?: string;
  client?: string;
  address?: string;
  passRate?: number | null;
  passRateAnswered?: number | null;
  qcData?: Record<string, QcPlaceData>;
  isTestRecord?: boolean;
}

export interface QcPlaceData {
  tasks?: Record<string, string>;
  notes?: string;
  damage?: string;
  corrections?: string;
  photos?: string[];
}

export interface QcTask { id: string; placeId: string; name: string }
export interface QcPlace { id: string; name: string }

export type QcResult = 'passed' | 'reclean' | 'todo';

export interface QcDashRow {
  prop: Property;
  rec: QcRecordLite | null;
  result: QcResult;
  score: number | null;
  issues: string[];
  inspector: string;
  date: string;
  follow: string;
  recall: boolean;
}

/** Último reporte de QC por casa (sin registros de prueba). */
export function latestByHouse(records: QcRecordLite[]): Map<string, QcRecordLite> {
  const m = new Map<string, QcRecordLite>();
  const key = (r: QcRecordLite) => String(r.date || '') + String(r.createdAt || '');
  records.forEach((r) => {
    if (!r.houseId || r.isTestRecord) return;
    const prev = m.get(r.houseId);
    if (!prev || key(r) > key(prev)) m.set(r.houseId, r);
  });
  return m;
}

export function recordScore(rec: QcRecordLite | null, tasks: QcTask[]): number | null {
  if (!rec) return null;
  if (typeof rec.passRate === 'number' && (rec.passRateAnswered ?? 1) > 0) return rec.passRate;
  const s = computeQCScore(rec.qcData || {}, tasks);
  return s.hasData ? s.passRate : null;
}

/** Áreas con al menos una tarea marcada "No". */
export function failedAreas(rec: QcRecordLite | null, places: QcPlace[]): string[] {
  if (!rec?.qcData) return [];
  const out: string[] = [];
  Object.entries(rec.qcData).forEach(([placeId, data]) => {
    const hasNo = Object.values(data?.tasks || {}).some((v) => String(v).toLowerCase() === 'no');
    if (hasNo) out.push(places.find((p) => p.id === placeId)?.name || 'Area');
  });
  return out;
}

export function resultOf(rec: QcRecordLite | null): QcResult {
  if (!rec) return 'todo';
  if (String(rec.result || '').toLowerCase() === 'failed') return 'reclean';
  if (rec.status === 'Finished') return 'passed';
  return 'todo';
}

/** Siguiente paso sugerido según resultado + cobro. */
export function followUp(result: QcResult, invoiceStatus: string, teamName: string): string {
  const inv = invoiceStatus.toLowerCase().trim();
  if (result === 'reclean') {
    return `Re-clean ${teamName || 'team'}${inv && inv !== 'paid' ? ' · invoice on hold' : ''}`;
  }
  if (result === 'todo') {
    return inv === 'paid' || inv === 'pre-paid' ? 'Already paid — inspect or close out' : 'Inspect';
  }
  if (inv === 'needs invoice') return 'Ready to invoice';
  if (inv === 'pending') return 'Payment pending';
  return '—';
}

export const RESULT_LABEL: Record<QcResult, string> = {
  passed: 'Passed',
  reclean: 'Re-clean',
  todo: 'Not inspected',
};

/** Resumen escrito del periodo (reglas, no IA). */
export function dashboardSummary(rows: QcDashRow[], teamName: (p: Property) => string): string {
  if (rows.length === 0) return 'No completed jobs in this period.';
  const parts: string[] = [];
  const failed = rows.filter((r) => r.result === 'reclean');
  if (failed.length) {
    const teams = [...new Set(failed.map((r) => teamName(r.prop)))];
    const areas = [...new Set(failed.flatMap((r) => r.issues))].slice(0, 3);
    parts.push(
      `${teams.join(', ')} had ${failed.length === 1 ? 'the only failed inspection' : `${failed.length} failed inspections`}` +
        `${areas.length ? ` (${areas.join(', ').toLowerCase()})` : ''}.`,
    );
  }
  const todo = rows.filter((r) => r.result === 'todo');
  if (todo.length) {
    const paid = todo.filter((r) => ['paid', 'pre-paid'].includes(String(r.prop.invoiceStatus || '').toLowerCase())).length;
    parts.push(
      `${todo.length} completed job${todo.length === 1 ? ' was' : 's were'} never inspected` +
        `${paid ? ` (${paid} already paid)` : ''}.`,
    );
  }
  const passed = rows.filter((r) => r.result === 'passed' && r.score !== null);
  if (passed.length) {
    const min = Math.min(...passed.map((r) => r.score as number));
    parts.push(failed.length || todo.length ? `Everyone else scored ${min}+.` : `All inspections passed; lowest score ${min}.`);
  }
  return parts.join(' ');
}
