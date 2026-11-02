// Las cuatro tarjetas del resumen: Total Invoiced, Paid, Awaiting Payment y
// Overdue, con monto y cantidad del conjunto buscado. Elegir una filtra la
// tabla por ese grupo (solo una a la vez).
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, CheckCircle2, Clock, FileText } from 'lucide-react';
import type { InvoiceCardKey, InvoiceCardSummary, InvoiceSummary } from '../invoiceFilters';
import { formatCents } from '../invoiceMath';
import { pluralize } from '../../../utils/countFormat';
import './InvoiceSummaryCards.css';

interface SummaryCardConfig {
  key: InvoiceCardKey;
  label: string;
  icon: LucideIcon;
}

const SUMMARY_CARDS: SummaryCardConfig[] = [
  { key: 'total', label: 'Total Invoiced', icon: FileText },
  { key: 'paid', label: 'Paid', icon: CheckCircle2 },
  { key: 'awaiting', label: 'Awaiting Payment', icon: Clock },
  { key: 'overdue', label: 'Overdue', icon: AlertTriangle },
];

interface InvoiceSummaryCardsProps {
  summary: InvoiceSummary;
  selectedCard: InvoiceCardKey;
  onSelectCard: (card: InvoiceCardKey) => void;
  isLoading: boolean;
}

/** Línea de detalle de cada tarjeta. */
const getCardDetail = (cardKey: InvoiceCardKey, cardSummary: InvoiceCardSummary, summary: InvoiceSummary): string => {
  const invoiceCount = pluralize(cardSummary.count, 'invoice', 'invoices');
  if (cardKey === 'paid') return `${invoiceCount} · ${formatCents(summary.paidViaStripe.totalCents)} via Stripe`;
  if (cardKey === 'awaiting') return `${invoiceCount} · includes overdue`;
  return invoiceCount;
};

const InvoiceSummaryCards = ({ summary, selectedCard, onSelectCard, isLoading }: InvoiceSummaryCardsProps) => (
  <section className="invs-grid" aria-label="Payment summary">
    {SUMMARY_CARDS.map(({ key, label, icon: Icon }) => {
      const cardSummary = summary[key];
      const isSelected = selectedCard === key;
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
          <span className="invs-detail">{isLoading ? 'Loading…' : getCardDetail(key, cardSummary, summary)}</span>
        </button>
      );
    })}
  </section>
);

export default InvoiceSummaryCards;
