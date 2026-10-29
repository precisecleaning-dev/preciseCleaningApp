// Totales del periodo en Invoices para el teléfono (tarjetas, ≤900 px): Final
// Cost, Payroll y Profit con su margen, como la fila TOTAL de la tabla de
// escritorio. Se agregó al quitar las tarjetas Financials (pedido de Omar,
// 10/2026): sin esto el teléfono no mostraba ningún total.
import type { ReactNode } from 'react';
import { money, pct, type JobFinancials } from '../utils/jobFinancials';
import { pluralize } from '../utils/countFormat';
import './InvoicesTotalsBar.css';

interface InvoicesTotalsBarProps {
  totals: JobFinancials;
  jobCount: number;
  /** billing_services / payroll todavía no llegan: esqueleto en los montos. */
  isLoading: boolean;
}

const InvoicesTotalsBar = ({ totals, jobCount, isLoading }: InvoicesTotalsBarProps) => {
  const formatAmount = (amount: number): ReactNode =>
    isLoading ? <span className="skel-line skel-money" /> : money(amount);
  const profitToneClass = totals.profit >= 0 ? ' is-positive' : ' is-negative';
  const marginText = isLoading ? '' : pct(totals.margin);

  return (
    <section className="itb-bar" aria-label="Period totals">
      <div className="itb-head">
        <span className="itb-title">Total</span>
        <span className="itb-count">{pluralize(jobCount, 'job', 'jobs')}</span>
      </div>
      <dl className="itb-grid">
        <div className="itb-item">
          <dt className="itb-label">Final Cost</dt>
          <dd className="itb-value">{formatAmount(totals.finalCost)}</dd>
        </div>
        <div className="itb-item">
          <dt className="itb-label">Payroll</dt>
          <dd className="itb-value">{formatAmount(totals.payroll)}</dd>
        </div>
        <div className={`itb-item${profitToneClass}`}>
          <dt className="itb-label">Profit</dt>
          <dd className="itb-value">
            {formatAmount(totals.profit)} <span className="itb-margin">{marginText}</span>
          </dd>
        </div>
      </dl>
    </section>
  );
};

export default InvoicesTotalsBar;
