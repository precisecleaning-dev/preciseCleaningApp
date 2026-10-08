// src/utils/unifiedRows.ts
// ⭐ Arma las filas y grupos de la tabla unificada (Overview) a partir de las
//    casas ya filtradas por periodo. Cada vista le pasa sus propias funciones
//    de catálogo (cliente, equipo, status…) para no duplicar esa lógica aquí.

import type { Property } from '../types/index';
import { formatDate, dateSortValue } from './dateFormat';
import { groupByDate, toDate, type DateGroupMode } from './dateGrouping';
import type { JobFinancials } from './jobFinancials';
import type { QcInfo } from './jobQuality';
import { groupInsight, jobInsight, type JobInsight } from './jobInsights';

export interface UnifiedRow {
  prop: Property;
  date: string;
  time: string;
  client: string;
  address: string;
  note: string;
  type: string;
  teamName: string | null;
  teamColor: string;
  qc: QcInfo;
  billing: string;
  insight: JobInsight;
  fin: JobFinancials;
}

export interface UnifiedGroup {
  key: string;
  label: string;
  detail?: string;
  rows: UnifiedRow[];
  fin: JobFinancials;
  ai: string;
}

export interface UnifiedDeps {
  getClientName: (prop: Property) => string;
  /** null = sin equipo asignado. */
  getTeam: (prop: Property) => { name: string; color: string } | null;
  getStatusName: (prop: Property) => string;
  getTypeName: (prop: Property) => string;
  getNote: (prop: Property) => string;
  qcFor: (prop: Property) => QcInfo;
  calc: (prop: Property) => JobFinancials;
  sum: (list: Property[]) => JobFinancials;
}

const norm = (s: string) => String(s || '').toLowerCase().trim();

/** Llave de posible duplicado: misma dirección + fecha + hora. */
const dupKey = (p: Property) =>
  p.address && p.scheduleDate ? `${norm(p.address)}|${dateSortValue(p.scheduleDate)}|${norm(p.timeIn)}` : '';

export function buildUnifiedGroups(
  list: Property[],
  groupBy: DateGroupMode,
  deps: UnifiedDeps,
  order: 'asc' | 'desc' = 'desc',
): UnifiedGroup[] {
  const dupCount = new Map<string, number>();
  list.forEach((p) => {
    const k = dupKey(p);
    if (k) dupCount.set(k, (dupCount.get(k) || 0) + 1);
  });
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  const toRow = (prop: Property): UnifiedRow => {
    const team = deps.getTeam(prop);
    const qc = deps.qcFor(prop);
    const fin = deps.calc(prop);
    const client = deps.getClientName(prop);
    const date = prop.scheduleDate ? formatDate(prop.scheduleDate) : '—';
    const d = toDate(prop.scheduleDate);
    const k = dupKey(prop);
    const insight = jobInsight({
      statusName: deps.getStatusName(prop),
      teamName: team ? team.name : null,
      client,
      dateLabel: date,
      isPast: !!d && d.getTime() < todayStart,
      isDuplicate: !!k && (dupCount.get(k) || 0) > 1,
      qc,
      billing: String(prop.invoiceStatus || ''),
      fin,
    });
    return {
      prop,
      date,
      time: prop.timeIn || '',
      client,
      address: prop.address || '',
      note: deps.getNote(prop),
      type: deps.getTypeName(prop),
      teamName: team ? team.name : null,
      teamColor: team ? team.color : '',
      qc,
      billing: String(prop.invoiceStatus || ''),
      insight,
      fin,
    };
  };

  return groupByDate(list, (p) => p.scheduleDate, groupBy, order).map((g) => {
    const rows = g.items.map(toRow);
    const fin = deps.sum(g.items);
    const noTeam = rows.filter((r) => !r.teamName).length;
    return {
      key: g.key,
      label: g.label,
      detail: g.detail,
      rows,
      fin,
      ai: groupInsight(rows.map((r) => r.insight), fin, noTeam),
    };
  });
}
