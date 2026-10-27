// Resultado de comparar el Excel "Daily Operations" con la app (Pipeline →
// Excel): totales, pestañas Differences / Only in Excel / Only in app / Match /
// All y una fila por trabajo con los 4 montos. Donde no coinciden se ven los
// dos valores (Excel y App) y el motivo cuando se sabe. Los datos los arma
// features/houses/operationsSheetMatch.ts.
import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type {
  OperationsSheetAmountField, OperationsSheetComparison as OperationsSheetComparisonResult,
  OperationsSheetComparisonTab, OperationsSheetMatch, OperationsSheetMatchStatus, Property,
} from '../../../types/index';
import { money } from '../../../utils/jobFinancials';
import { formatDate } from '../../../utils/dateFormat';
import VirtualItems from '../../../shared/components/VirtualItems';
import './OperationsSheetComparison.css';

const TABS: { id: OperationsSheetComparisonTab; label: string }[] = [
  { id: 'different', label: 'Differences' },
  { id: 'sheetOnly', label: 'Only in Excel' },
  { id: 'appOnly', label: 'Only in app' },
  { id: 'ok', label: 'Match' },
  { id: 'all', label: 'All' },
];

const STATUS_LABELS: Record<OperationsSheetMatchStatus, string> = {
  ok: 'Match',
  different: 'Different',
  sheetOnly: 'Only in Excel',
  appOnly: 'Only in app',
};

const AMOUNT_COLUMNS: { field: OperationsSheetAmountField; label: string }[] = [
  { field: 'servicePrice', label: 'Service Price' },
  { field: 'taxes', label: 'Taxes' },
  { field: 'finalCost', label: 'Final Cost' },
  { field: 'payroll', label: 'Payroll' },
];

/** Alto aproximado de una fila (px) mientras VirtualItems mide las reales. */
const ROW_HEIGHT_ESTIMATE = 76;

const formatAmount = (amount: number | null | undefined) => (amount === null || amount === undefined ? '—' : money(amount));

const getFirstTab = (counts: Record<OperationsSheetMatchStatus, number>): OperationsSheetComparisonTab =>
  TABS.find((tab) => tab.id !== 'all' && counts[tab.id as OperationsSheetMatchStatus] > 0)?.id ?? 'all';

interface AmountCellProps {
  match: OperationsSheetMatch;
  field: OperationsSheetAmountField;
  label: string;
}

/** Un monto: el de la app (o el del Excel si solo está ahí); si no coinciden, los dos. */
const AmountCell = ({ match, field, label }: AmountCellProps) => {
  const sheetValue = match.sheetRow?.[field] ?? null;
  const appValue = match.appAmounts?.[field] ?? null;
  const isDifferent = match.differences.some((difference) => difference.field === field);
  if (isDifferent) {
    return (
      <div className="osc-amount is-different" data-label={label}>
        <span className="osc-amount-sheet">Excel {formatAmount(sheetValue)}</span>
        <span className="osc-amount-app">App {formatAmount(appValue)}</span>
      </div>
    );
  }
  return (
    <div className="osc-amount" data-label={label}>
      {formatAmount(match.job ? appValue : sheetValue)}
    </div>
  );
};

interface ComparisonRowProps {
  match: OperationsSheetMatch;
  getClientName: (job: Property) => string;
  onOpenHouse: (house: Property) => void;
}

const ComparisonRow = ({ match, getClientName, onOpenHouse }: ComparisonRowProps) => {
  const { sheetRow, job } = match;
  const address = job?.address || sheetRow?.address || '';
  const clientName = job ? getClientName(job) : sheetRow?.client ?? '';
  const dateText = match.isDateShifted
    ? `Excel ${formatDate(sheetRow?.date)} · App ${formatDate(job?.scheduleDate)}`
    : formatDate(sheetRow?.date ?? job?.scheduleDate);
  const sheetLocation = sheetRow ? `${sheetRow.sheetName} · row ${sheetRow.rowNumber}` : '';
  const reasons = [...new Set(match.differences.map((difference) => difference.reason).filter(Boolean))];
  if (match.isDateShifted) reasons.unshift('Different date');

  return (
    <article className={`osc-row status-${match.status}`}>
      <div className="osc-date">{dateText}</div>
      <div className="osc-job">
        <span className="osc-address">{address}</span>
        <span className="osc-meta">{[clientName, sheetLocation].filter(Boolean).join(' · ')}</span>
      </div>
      {AMOUNT_COLUMNS.map(({ field, label }) => (
        <AmountCell key={field} match={match} field={field} label={label} />
      ))}
      <div className="osc-status">
        <span className={`osc-badge status-${match.status}`}>{STATUS_LABELS[match.status]}</span>
        {job && (
          <button type="button" className="osc-open-btn" title="Open job" onClick={() => onOpenHouse(job)}>
            <ExternalLink size={14} aria-hidden="true" /> Open
          </button>
        )}
      </div>
      {reasons.length > 0 && <p className="osc-reasons">{reasons.join(' · ')}</p>}
    </article>
  );
};

interface OperationsSheetComparisonProps {
  comparison: OperationsSheetComparisonResult;
  getClientName: (job: Property) => string;
  onOpenHouse: (house: Property) => void;
}

const OperationsSheetComparison = ({ comparison, getClientName, onOpenHouse }: OperationsSheetComparisonProps) => {
  const [selectedTab, setSelectedTab] = useState<OperationsSheetComparisonTab>(() => getFirstTab(comparison.counts));
  const visibleMatches = selectedTab === 'all'
    ? comparison.matches
    : comparison.matches.filter((match) => match.status === selectedTab);
  const finalCostDifference = comparison.sheetFinalCostTotal - comparison.appFinalCostTotal;
  const getTabCount = (tab: OperationsSheetComparisonTab) =>
    tab === 'all' ? comparison.matches.length : comparison.counts[tab];

  const renderMatch = (match: OperationsSheetMatch) => (
    <ComparisonRow key={match.key} match={match} getClientName={getClientName} onOpenHouse={onOpenHouse} />
  );

  return (
    <section className="osc-wrap" aria-label="Excel comparison">
      <div className="osc-totals">
        <span>Final Cost · Excel <strong>{money(comparison.sheetFinalCostTotal)}</strong></span>
        <span>App <strong>{money(comparison.appFinalCostTotal)}</strong></span>
        <span className={`osc-total-difference${Math.abs(finalCostDifference) >= 0.01 ? ' is-different' : ''}`}>
          Difference <strong>{money(finalCostDifference)}</strong>
        </span>
      </div>

      {/* Filtros de la lista (no pestañas con panel propio): botones con aria-pressed. */}
      <div className="osc-tabs" role="group" aria-label="Show results">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={selectedTab === tab.id}
            className={`osc-tab tab-${tab.id}${selectedTab === tab.id ? ' active' : ''}`}
            onClick={() => setSelectedTab(tab.id)}
          >
            {tab.label} <span className="osc-tab-count">{getTabCount(tab.id)}</span>
          </button>
        ))}
      </div>

      <div className="osc-list">
        <div className="osc-list-head" aria-hidden="true">
          <span>Date</span>
          <span>Address · Client</span>
          {AMOUNT_COLUMNS.map(({ field, label }) => <span key={field} className="osc-head-amount">{label}</span>)}
          <span>Status</span>
        </div>
        {visibleMatches.length > 0 ? (
          <VirtualItems items={visibleMatches} estimate={ROW_HEIGHT_ESTIMATE} renderItem={renderMatch} className="osc-rows" />
        ) : (
          <p className="osc-empty">Nothing here for this period.</p>
        )}
      </div>
    </section>
  );
};

export default OperationsSheetComparison;
