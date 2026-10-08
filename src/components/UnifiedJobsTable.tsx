// ⭐ Tabla unificada del Overview — diseño "Precise Cleaning – Unified Jobs
//    View": operaciones, Quality Check, cobro, resumen automático y finanzas en
//    una sola fila por trabajo, agrupada por periodo con subtotales.
import { useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronRight, Pencil, Trash2, Sparkles } from 'lucide-react';
import type { Property } from '../types/index';
import { money, pct, marginTone, type JobFinancials } from '../utils/jobFinancials';
import type { UnifiedGroup } from '../utils/unifiedRows';
import './UnifiedJobsTable.css';

const PAGE = 50;

const BILLING_TONE: Record<string, string> = {
  'needs invoice': 'warn',
  pending: 'bad',
  paid: 'good',
  'pre-paid': 'info',
};
const billingTone = (b: string) => BILLING_TONE[b.toLowerCase().trim()] || 'none';

const INSIGHT_TONE: Record<string, string> = {
  'Action needed': 'bad',
  'Follow up': 'warn',
  'All good': 'good',
};

/** Celdas de dinero: "—" cuando el trabajo aún no tiene nada cobrado ni pagado. */
const hasMoney = (f: JobFinancials) => f.servicePrice !== 0 || f.payroll !== 0;
const moneyOrDash = (f: JobFinancials, v: number) => (hasMoney(f) ? money(v) : '—');

interface UnifiedJobsTableProps {
  groups: UnifiedGroup[];
  loading: boolean;
  emptyText: string;
  /** Celda de status (el selector interactivo de la vista). */
  renderStatus: (prop: Property) => ReactNode;
  onOpen: (prop: Property) => void;
  /** Clic en la pastilla de Quality Check. */
  onOpenQc: (prop: Property) => void;
  onEdit?: (prop: Property) => void;
  onDelete?: (prop: Property) => void;
}

export default function UnifiedJobsTable({
  groups, loading, emptyText, renderStatus, onOpen, onOpenQc, onEdit, onDelete,
}: UnifiedJobsTableProps) {
  // Grupos ABIERTOS por defecto (el periodo ya acota el volumen); se pliegan.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState<Record<string, number>>({});
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="ujt-card">
      <div className="ujt-scroll">
        <table className="ujt-table">
          <thead>
            <tr>
              <th>Date / time</th>
              <th>Client &amp; address</th>
              <th>Type</th>
              <th>Team</th>
              <th>Job status</th>
              <th>Quality check</th>
              <th>Billing</th>
              <th className="ujt-ai-head"><Sparkles size={12} /> AI summary</th>
              <th className="n money">Service price</th>
              <th className="n">Taxes</th>
              <th className="n">Final cost</th>
              <th className="n">Payroll</th>
              <th className="n">Profit</th>
              <th className="n">Margin</th>
              <th className="n">Actions</th>
            </tr>
          </thead>
          {loading ? (
            <tbody><tr><td colSpan={15} className="ujt-empty">Loading jobs…</td></tr></tbody>
          ) : total === 0 ? (
            <tbody><tr><td colSpan={15} className="ujt-empty">{emptyText}</td></tr></tbody>
          ) : (
            groups.map((g) => {
              const open = !collapsed.has(g.key);
              const limit = shown[g.key] ?? PAGE;
              const tone = marginTone(g.fin.margin);
              return (
                <tbody key={g.key}>
                  <tr className="ujt-group" onClick={() => toggle(g.key)}>
                    <td colSpan={7}>
                      <span className="ujt-group-title">
                        <ChevronRight size={16} className={`ujt-chevron${open ? ' open' : ''}`} />
                        {g.label}
                        {g.detail && <span className="ujt-group-range">{g.detail}</span>}
                        <span className="ujt-count">{g.rows.length} {g.rows.length === 1 ? 'job' : 'jobs'}</span>
                      </span>
                    </td>
                    <td className="ujt-ai ujt-group-ai"><Sparkles size={12} /> {g.ai}</td>
                    <td className="n money strong">{moneyOrDash(g.fin, g.fin.servicePrice)}</td>
                    <td className="n strong">{moneyOrDash(g.fin, g.fin.taxes)}</td>
                    <td className="n strong">{moneyOrDash(g.fin, g.fin.finalCost)}</td>
                    <td className="n strong">{moneyOrDash(g.fin, g.fin.payroll)}</td>
                    <td className={`n strong ${hasMoney(g.fin) ? (g.fin.profit < 0 ? 'neg' : 'pos') : ''}`}>{moneyOrDash(g.fin, g.fin.profit)}</td>
                    <td className="n"><span className={`ujt-pill ${tone}`}>{pct(g.fin.margin)}</span></td>
                    <td></td>
                  </tr>
                  {open && g.rows.slice(0, limit).map((r) => (
                    <tr key={r.prop.id} className="ujt-row" onClick={() => onOpen(r.prop)}>
                      <td>
                        <div className="ujt-strong">{r.date}</div>
                        <div className="ujt-muted">{r.time}</div>
                      </td>
                      <td className="ujt-client">
                        <div className="ujt-strong">{r.client}</div>
                        <div className="ujt-muted">{r.address}</div>
                        {r.note && <div className="ujt-muted ujt-note" title={r.note}>{r.note}</div>}
                      </td>
                      <td className="ujt-semibold">{r.type}</td>
                      <td>
                        {r.teamName ? (
                          <span className="ujt-team" style={{ '--team-color': r.teamColor || '#64748b' } as CSSProperties}>{r.teamName}</span>
                        ) : (
                          <span className="ujt-team-none">Unassigned</span>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>{renderStatus(r.prop)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {r.qc.state === 'none' ? (
                          <span className="ujt-pill none">—</span>
                        ) : (
                          <button type="button" className={`ujt-pill ${r.qc.tone} as-btn`} onClick={() => onOpenQc(r.prop)}>
                            {r.qc.label}
                          </button>
                        )}
                      </td>
                      <td><span className={`ujt-pill ${billingTone(r.billing)}`}>{r.billing || '—'}</span></td>
                      <td className="ujt-ai">
                        <span className={`ujt-aitag ${INSIGHT_TONE[r.insight.tag]}`}>{r.insight.tag}</span>
                        <div>{r.insight.text}</div>
                      </td>
                      <td className="n money">{moneyOrDash(r.fin, r.fin.servicePrice)}</td>
                      <td className="n">{moneyOrDash(r.fin, r.fin.taxes)}</td>
                      <td className="n ujt-strong">{moneyOrDash(r.fin, r.fin.finalCost)}</td>
                      <td className="n">{moneyOrDash(r.fin, r.fin.payroll)}</td>
                      <td className={`n ujt-strong ${hasMoney(r.fin) ? (r.fin.profit < 0 ? 'neg' : 'pos') : ''}`}>{moneyOrDash(r.fin, r.fin.profit)}</td>
                      <td className="n"><span className={`ujt-pill ${marginTone(r.fin.margin)}`}>{pct(r.fin.margin)}</span></td>
                      <td className="n" onClick={(e) => e.stopPropagation()}>
                        <div className="ujt-actions">
                          {onEdit && (
                            <button type="button" className="ujt-iconbtn" aria-label="Edit job" onClick={() => onEdit(r.prop)}>
                              <Pencil size={16} />
                            </button>
                          )}
                          {onDelete && (
                            <button type="button" className="ujt-iconbtn danger" aria-label="Delete job" onClick={() => onDelete(r.prop)}>
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {open && g.rows.length > limit && (
                    <tr className="ujt-more">
                      <td colSpan={15}>
                        <button
                          type="button"
                          className="ujt-more-btn"
                          onClick={() => setShown((s) => ({ ...s, [g.key]: limit + 100 }))}
                        >
                          Show more — {limit} of {g.rows.length}
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })
          )}
        </table>
      </div>
    </div>
  );
}
