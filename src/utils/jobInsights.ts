// src/utils/jobInsights.ts
// ⭐ Columna "✦ AI summary" del Overview unificado.
//    Decisión del usuario (10/2026): resumen por REGLAS AUTOMÁTICAS, no por un
//    modelo de IA — gratis, instantáneo y siempre basado en los datos reales.
//    Cada regla mira el status, el equipo, el QC, el cobro y el margen del
//    trabajo y escribe una frase accionable con una etiqueta de prioridad.
//    El orden de las reglas ES la prioridad: gana la primera que aplica.

import { money, pct, type JobFinancials } from './jobFinancials';
import type { QcInfo } from './jobQuality';

export type InsightTag = 'Action needed' | 'Follow up' | 'All good';

export interface JobInsight {
  tag: InsightTag;
  text: string;
}

export interface InsightInput {
  statusName: string;
  teamName: string | null;
  client: string;
  dateLabel: string;
  /** El día del trabajo ya pasó. */
  isPast: boolean;
  isDuplicate: boolean;
  qc: QcInfo;
  /** Status del invoice ("Needs Invoice", "Pending", "Paid", "Pre-Paid" o ""). */
  billing: string;
  fin: JobFinancials;
}

const norm = (s: string) => s.toLowerCase().trim();

export function jobInsight(i: InsightInput): JobInsight {
  const status = norm(i.statusName);
  const billing = norm(i.billing);
  const team = i.teamName || 'the team';
  const priced = i.fin.servicePrice > 0;
  const isWorkflowDone = status === 'invoice' || status.includes('complete') || i.qc.state !== 'none';

  if (i.isDuplicate) {
    return { tag: 'Action needed', text: 'Same address, date and time as another job — confirm it is not a duplicate.' };
  }
  if (i.qc.state === 'failed') {
    return { tag: 'Action needed', text: `Failed QC. Send ${team} back and hold the invoice.` };
  }
  if (!i.teamName && !isWorkflowDone) {
    return i.isPast
      ? { tag: 'Action needed', text: `Date passed (${i.dateLabel}) with no team assigned — reschedule or close it.` }
      : { tag: 'Action needed', text: `No team assigned. Assess and schedule before ${i.dateLabel}.` };
  }
  if (billing === 'needs invoice') {
    if (i.qc.state === 'passed') {
      const score = i.qc.score !== null ? ` (${i.qc.score})` : '';
      return { tag: 'Action needed', text: `Done and passed QC${score}. Ready to invoice ${money(i.fin.servicePrice)}.` };
    }
    return { tag: 'Action needed', text: priced ? `Ready to invoice ${money(i.fin.servicePrice)}.` : 'Needs invoice, but no services are billed yet.' };
  }
  if (priced && i.fin.profit < 0) {
    return { tag: 'Action needed', text: `Negative margin: payroll is ${money(i.fin.payroll - i.fin.finalCost)} over the final cost.` };
  }
  if (billing === 'pending') {
    return { tag: 'Follow up', text: `Payment still pending — follow up with ${i.client}.` };
  }
  if (billing === 'paid' && i.qc.state === 'pending') {
    return { tag: 'Follow up', text: 'Client already paid but QC is still pending. Inspect or close it out.' };
  }
  if (i.qc.state === 'pending') {
    return { tag: 'Follow up', text: 'Waiting on Quality Check.' };
  }
  if (status.includes('schedule')) {
    return { tag: 'Follow up', text: 'Waiting on schedule confirmation.' };
  }
  if (status.includes('assessment')) {
    return { tag: 'Follow up', text: 'Assessment pending before it can be scheduled.' };
  }
  if (billing === 'paid' || billing === 'pre-paid') {
    const qcPart = i.qc.state === 'passed' && i.qc.score !== null ? `, QC ${i.qc.score}` : '';
    return priced
      ? { tag: 'All good', text: `Clean close: paid${qcPart}, profit ${money(i.fin.profit)} (${pct(i.fin.margin)} margin).` }
      : { tag: 'All good', text: `Paid${qcPart}.` };
  }
  return { tag: 'All good', text: `${i.statusName || 'In progress'} · ${team}.` };
}

/** Resumen de un grupo (semana, mes, día…). */
export function groupInsight(insights: JobInsight[], fin: JobFinancials, noTeam: number): string {
  const action = insights.filter((x) => x.tag === 'Action needed').length;
  const follow = insights.filter((x) => x.tag === 'Follow up').length;
  const parts: string[] = [];
  if (action) parts.push(`${action} need${action === 1 ? 's' : ''} action`);
  if (follow) parts.push(`${follow} to follow up`);
  if (!action && !follow) parts.push('All on track');
  if (noTeam) parts.push(`${noTeam} without a team`);
  if (fin.finalCost > 0) parts.push(`margin ${pct(fin.margin)}`);
  const s = parts.join(' · ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}
