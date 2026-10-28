// ============================================================================
// ⭐ CLIENTS REPORT — reporte de clientes, como la tabla dinámica de la hoja
//    del mes (Client · COUNTA of Client · SUM of Final Cost · Grand Total).
//      · trabajos con Schedule Date dentro del periodo (Day/Week/Month/Year/
//        Custom), igual que el Overview e Invoices
//      · un renglón por cliente: cuántos trabajos y la suma de su Final Cost
//        (Service Price − 8.25% de impuesto, utils/jobFinancials.ts)
//      · tarjetas arriba: Final cost, trabajos, clientes y el cliente con más
//        Final Cost; en la tabla, los encabezados ordenan
//    Permiso propio "Clients Report"; si el rol aún no lo declara, lo hereda
//    de "Invoices" (son las mismas cifras de dinero).
//    Las reglas viven en src/utils/clientsReport.ts.
// ============================================================================
import { useMemo } from 'react';
import type { Property } from '../types/index';
import { useLiveData } from '../shared/data/liveCollections';
import { useStoredPeriod } from '../shared/hooks/useStoredPeriod';
import { inPeriod, periodRange } from '../utils/periods';
import { useJobFinancials } from '../utils/jobFinancials';
import { customerNameIndex, displayClientNameIn } from '../utils/customerDocs';
import { buildClientsReport, NO_CLIENT_LABEL } from '../utils/clientsReport';
import MenuButton from '../shared/components/MenuButton';
import HistoryWindowNotice from '../components/HistoryWindowNotice';
import PeriodBar from '../components/PeriodBar';
import ClientsReportSummary from '../components/ClientsReportSummary';
import ClientsReportTable from '../components/ClientsReportTable';
import './ClientsReportView.css';

interface ClientsReportViewProps {
  onOpenMenu: () => void;
  /** Casas del listener global de App.tsx (con el scope del módulo ya aplicado). */
  properties: Property[];
}

const ClientsReportView = ({ onOpenMenu, properties }: ClientsReportViewProps) => {
  const [period, setPeriod] = useStoredPeriod('pc.clientsReport.period', 'month');
  const periodDateRange = useMemo(() => periodRange(period), [period]);
  const customers = useLiveData('customers');
  const { calc: calcJobFinancials, loading: isFinalCostLoading } = useJobFinancials();

  const clientNameIndex = useMemo(() => customerNameIndex(customers), [customers]);

  const periodJobs = useMemo(
    () => properties.filter((job) => inPeriod(job.scheduleDate, periodDateRange)),
    [properties, periodDateRange],
  );

  const clientsReport = useMemo(() => {
    // Un client con solo espacios cuenta como "No client" (no un renglón sin nombre).
    const getClientName = (job: Property) => {
      const clientKey = job.client?.trim();
      return clientKey ? displayClientNameIn(clientNameIndex, clientKey) : NO_CLIENT_LABEL;
    };
    const getFinalCost = (job: Property) => calcJobFinancials(job).finalCost;
    return buildClientsReport(periodJobs, getClientName, getFinalCost);
  }, [periodJobs, clientNameIndex, calcJobFinancials]);

  return (
    <div className="cr-page fade-in">
      <header className="cr-header">
        <div className="cr-title-group view-header-title-group">
          <MenuButton onClick={onOpenMenu} />
          <div>
            <h1 className="cr-title">Clients Report</h1>
            <p className="cr-subtitle">Jobs and final cost per client</p>
          </div>
        </div>
      </header>
      <HistoryWindowNotice />

      <PeriodBar period={period} onChange={setPeriod} />

      <ClientsReportSummary report={clientsReport} isFinalCostLoading={isFinalCostLoading} />

      <ClientsReportTable
        report={clientsReport}
        isFinalCostLoading={isFinalCostLoading}
        periodLabel={periodDateRange.label}
      />
    </div>
  );
};

export default ClientsReportView;
