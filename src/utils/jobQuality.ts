// src/utils/jobQuality.ts
// ⭐ Estado de Quality Check por trabajo para la columna "Quality check" y la
//    banda de KPIs del Overview unificado. Se basa en el ÚLTIMO reporte de la
//    casa en `quality_checks` (misma regla que src/utils/qcStatus.ts) y en el
//    status del trabajo (si está en "Quality Check", su QC está pendiente).

import { useMemo } from 'react';
import type { Status } from '../types/index';
import { useLiveCollection } from '../shared/data/liveCollections';
import { isQualityCheckStatus } from './qcStatus';
import type { Tone } from './jobFinancials';

interface QcDoc {
  houseId?: string;
  date?: string;
  createdAt?: string;
  status?: string;
  result?: string | null;
  passRate?: number | null;
  isTestRecord?: boolean;
}

export type QcState = 'passed' | 'failed' | 'pending' | 'none';

export interface QcInfo {
  state: QcState;
  /** "Passed · 95", "Re-clean needed", "QC pending", "—" */
  label: string;
  tone: Tone;
  score: number | null;
}

const NONE: QcInfo = { state: 'none', label: '—', tone: 'none', score: null };

/** Último reporte de QC por casa, en tiempo real (store compartido). */
export function useQcRecords(enabled = true) {
  const { data, loaded } = useLiveCollection('qualityChecks', enabled);
  const latest = useMemo(() => {
    const m = new Map<string, QcDoc>();
    const key = (x: QcDoc) => String(x.date || '') + String(x.createdAt || '');
    (data as QcDoc[]).forEach((r) => {
      if (!r.houseId || r.isTestRecord) return;
      const prev = m.get(r.houseId);
      if (!prev || key(r) > key(prev)) m.set(r.houseId, r);
    });
    return m;
  }, [data]);
  return { latest, loading: !loaded };
}

/** Estado de QC de un trabajo. */
export function qcInfoFor(
  houseId: string,
  statusIdOrName: string | null | undefined,
  statuses: Status[],
  latest: Map<string, QcDoc>,
): QcInfo {
  const r = latest.get(houseId);
  if (r) {
    if (String(r.result || '').toLowerCase() === 'failed') {
      return { state: 'failed', label: 'Re-clean needed', tone: 'bad', score: r.passRate ?? null };
    }
    if (r.status === 'Finished') {
      const score = typeof r.passRate === 'number' ? r.passRate : null;
      return { state: 'passed', label: score !== null ? `Passed · ${score}` : 'Passed', tone: 'good', score };
    }
    return { state: 'pending', label: 'QC pending', tone: 'warn', score: null };
  }
  if (isQualityCheckStatus(statusIdOrName, statuses)) {
    return { state: 'pending', label: 'QC pending', tone: 'warn', score: null };
  }
  return NONE;
}

/** Conteos para la banda "Quality check" (Passed / Re-clean / QC pending). */
export function qcCounts(infos: QcInfo[]) {
  const c = { passed: 0, failed: 0, pending: 0 };
  infos.forEach((i) => {
    if (i.state === 'passed') c.passed += 1;
    else if (i.state === 'failed') c.failed += 1;
    else if (i.state === 'pending') c.pending += 1;
  });
  return c;
}
