// Tarjetas de resumen del Clients Report, estilo tablero ejecutivo: Final
// cost, Jobs, Clients y Top client del periodo, cada una con un tono de la
// paleta de la app (azul marino del menú → azul de la marca). Reemplazan a
// KpiGrid solo en esta vista: KpiGrid sigue igual en el Overview e Invoices.
import type { LucideIcon } from 'lucide-react';
import { ClipboardList, DollarSign, TrendingUp, Users } from 'lucide-react';
import type { ClientsReport } from '../types/index';
import { money, pct } from '../utils/jobFinancials';
import { formatCount } from '../utils/countFormat';
import { getTopClient } from '../utils/clientsReport';
import './ClientsReportSummary.css';

interface SummaryCardProps {
  label: string;
  value: string;
  detail: string;
  /** Tono de la tarjeta (clase `tone-…` en ClientsReportSummary.css). */
  tone: 'navy' | 'indigo' | 'blue' | 'sky';
  Icon: LucideIcon;
  /** Todavía no llega el dato: valor y detalle en esqueleto. */
  isLoading?: boolean;
  /** El valor es un nombre (Top client): letra más chica y se corta con "…". */
  isTextValue?: boolean;
}

const SummaryCard = ({ label, value, detail, tone, Icon, isLoading = false, isTextValue = false }: SummaryCardProps) => (
  <article className={`crs-card tone-${tone}`}>
    <header className="crs-card-head">
      <span className="crs-label">{label}</span>
      <span className="crs-icon" aria-hidden="true"><Icon size={18} /></span>
    </header>
    {isLoading ? (
      <>
        <span className="crs-value-skeleton skel-line" aria-hidden="true" />
        <span className="crs-detail-skeleton skel-line" aria-hidden="true" />
      </>
    ) : (
      <>
        <strong className={`crs-value${isTextValue ? ' is-text' : ''}`} title={value}>{value}</strong>
        <span className="crs-detail">{detail}</span>
      </>
    )}
  </article>
);

interface ClientsReportSummaryProps {
  report: ClientsReport;
  /** Todavía no llegan los servicios cobrados: los montos van en esqueleto. */
  isFinalCostLoading: boolean;
}

const ClientsReportSummary = ({ report, isFinalCostLoading }: ClientsReportSummaryProps) => {
  const topClient = getTopClient(report.rows);
  const averagePerJob = report.totalJobs > 0 ? report.totalFinalCost / report.totalJobs : 0;
  const averagePerJobDetail = report.totalJobs > 0 ? `${money(averagePerJob)} avg. per job` : 'No jobs in this period';
  const jobsPerClient = report.rows.length > 0 ? report.totalJobs / report.rows.length : 0;
  const jobsPerClientDetail = report.rows.length > 0 ? `${jobsPerClient.toFixed(1)} jobs per client` : 'No clients in this period';
  const topClientName = topClient?.clientName ?? '—';
  const topClientDetail = topClient
    ? `${money(topClient.finalCost)} · ${pct(topClient.shareOfFinalCost * 100)} of final cost`
    : 'No final cost in this period';

  return (
    <section className="crs-grid" aria-label="Clients summary">
      <SummaryCard
        label="Final cost"
        value={money(report.totalFinalCost)}
        detail={averagePerJobDetail}
        tone="navy"
        Icon={DollarSign}
        isLoading={isFinalCostLoading}
      />
      <SummaryCard
        label="Jobs"
        value={formatCount(report.totalJobs)}
        detail="By schedule date"
        tone="indigo"
        Icon={ClipboardList}
      />
      <SummaryCard
        label="Clients"
        value={formatCount(report.rows.length)}
        detail={jobsPerClientDetail}
        tone="blue"
        Icon={Users}
      />
      <SummaryCard
        label="Top client"
        value={topClientName}
        detail={topClientDetail}
        tone="sky"
        Icon={TrendingUp}
        isLoading={isFinalCostLoading}
        isTextValue
      />
    </section>
  );
};

export default ClientsReportSummary;
