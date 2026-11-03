// Las tres tarjetas del resumen: Overdue, Total Outstanding e In Draft, con
// monto y cantidad del conjunto buscado. Elegir una filtra la tabla por ese
// grupo (solo una a la vez); tocar la elegida otra vez la quita.
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Clock, FilePen } from 'lucide-react';
import type { InvoiceCardKey, InvoiceSummary, InvoiceSummaryCardKey } from '../../../types/index';
import { formatCents } from '../invoiceMath';
import { pluralize } from '../../../utils/countFormat';
import './InvoiceSummaryCards.css';

interface SummaryCardConfig {
  key: InvoiceSummaryCardKey;
  label: string;
  icon: LucideIcon;
  /** Texto después de la cantidad ("3 invoices · includes overdue"). */
  detailSuffix: string;
}

const SUMMARY_CARDS: SummaryCardConfig[] = [
  { key: 'overdue', label: 'Overdue', icon: AlertTriangle, detailSuffix: 'past due date' },
  { key: 'outstanding', label: 'Total Outstanding', icon: Clock, detailSuffix: 'includes overdue' },
  { key: 'draft', label: 'In Draft', icon: FilePen, detailSuffix: 'not sent yet' },
];

interface InvoiceSummaryCardsProps {
  summary: InvoiceSummary;
  selectedCard: InvoiceCardKey;
  onSelectCard: (card: InvoiceSummaryCardKey) => void;
  isLoading: boolean;
}

const InvoiceSummaryCards = ({ summary, selectedCard, onSelectCard, isLoading }: InvoiceSummaryCardsProps) => (
  <section className="invs-grid" aria-label="Payment summary">
    {SUMMARY_CARDS.map(({ key, label, icon: Icon, detailSuffix }) => {
      const cardSummary = summary[key];
      const isSelected = selectedCard === key;
      const detailText = `${pluralize(cardSummary.count, 'invoice', 'invoices')} · ${detailSuffix}`;
      return (
        <button
          key={key}
          type="button"
          className={`invs-card tone-${key}${isSelected ? ' selected' : ''}`}
          aria-pressed={isSelected}
          onClick={() => onSelectCard(key)}
        >
          <span className="invs-card-head">
            <span className="invs-label">{label}</span>
            <Icon size={18} className="invs-icon" aria-hidden="true" />
          </span>
          {isLoading ? (
            <span className="invs-value-skeleton skel-line" aria-hidden="true" />
          ) : (
            <strong className="invs-value">{formatCents(cardSummary.totalCents)}</strong>
          )}
          <span className="invs-detail">{isLoading ? 'Loading…' : detailText}</span>
        </button>
      );
    })}
  </section>
);

export default InvoiceSummaryCards;
