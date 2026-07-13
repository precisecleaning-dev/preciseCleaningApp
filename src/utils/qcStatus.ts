import type { Status } from '../types/index';

// Antes reimplementado casi idéntico en QCRouteView.tsx y QualityCheckView.tsx (ambos
// archivos incluso tenían el comentario "misma lógica que Quality Check" admitiéndolo).
// Cubre solo la parte de "qué casas tienen QC pendiente" — NO la planificación de rutas
// (geocoding/haversine), que sigue siendo dos features paralelas intencionalmente
// separadas por ahora (ver code-notes.md).

export interface QCStatusLike {
  houseId: string;
  date: string;
  status: 'Finished' | 'Pending';
  result?: 'passed' | 'failed' | null;
}

/** Determina si un status (id o nombre) corresponde a "Quality Check". */
export const isQualityCheckStatus = (statusIdOrName: string | null | undefined, statuses: Status[]): boolean => {
  const st = statuses.find(s => String(s.id) === String(statusIdOrName) || String(s.name) === String(statusIdOrName));
  const name = String(st?.name || statusIdOrName || '').toLowerCase().trim();
  return name === 'qc' || name.includes('quality check') || name.includes('quality-check');
};

/** Último reporte de QC registrado para una casa (por fecha descendente). */
export function latestQCForHouse<T extends QCStatusLike>(houseId: string, qcList: T[]): T | undefined {
  const recs = qcList.filter(q => q.houseId === houseId);
  if (recs.length === 0) return undefined;
  return recs.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
}

/** ¿El último QC de la casa ya pasó (Finished y no fallido)? -> sale de pendientes. */
export function housePassedQC<T extends QCStatusLike>(houseId: string, qcList: T[]): boolean {
  const r = latestQCForHouse(houseId, qcList);
  return !!r && r.status === 'Finished' && r.result !== 'failed';
}

/** ¿El último QC de la casa NO pasó? */
export function houseFailedQC<T extends QCStatusLike>(houseId: string, qcList: T[]): boolean {
  const r = latestQCForHouse(houseId, qcList);
  return !!r && r.result === 'failed';
}
