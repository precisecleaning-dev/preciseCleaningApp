// Tarjetas de la cuenta del cliente: Outstanding, Overdue, Paid e In Draft, con
// monto y cantidad de TODOS sus invoices. Elegir una filtra la pestaña
// Invoices; tocar la elegida otra vez la quita. Mismo aspecto que las tarjetas
// de la lista (InvoiceSummaryCards.css).
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, CheckCircle2, Clock, FilePen } from 'lucide-react';
import type {
  ClientAccountCardKey, ClientAccountSummary as ClientAccountSummaryData, ClientAccountSummaryKey,
} from '../../../types/index';
import { formatCents } from '../invoiceMath';
import { pluralize } from '../../../utils/countFormat';
import './InvoiceSummaryCards.css';

interface SummaryCardConfig {
  key: ClientAccountSummaryKey;
  label: string;
  icon: LucideIcon;
}

const SUMMARY_CARDS: SummaryCardConfig[] = [
  { key: 'outstanding', label: 'Outstanding', icon: Clock },
  { key: 'overdue', label: 'Overdue', icon: AlertTriangle },
  { key: 'paid', label: 'Paid', icon: CheckCircle2 },
  { key: 'draft', label: 'In Draft', icon: FilePen },
];

interface ClientAccountSummaryProps {
  summary: ClientAccountSummaryData;
  selectedCard: ClientAccountCardKey;
  onSelectCard: (card: ClientAccountSummaryKey) => void;
  isLoading: boolean;
}

const ClientAccountSummary = ({ summary, selectedCard, onSelectCard, isLoading }: ClientAccountSummaryProps) => (
  <section className="cam-summary invs-grid" aria-label="Client balance">
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
          <span className="invs-detail">{isLoading ? 'Loading…' : pluralize(cardSummary.count, 'invoice', 'invoices')}</span>
        </button>
      );
    })}
  </section>
);

export default ClientAccountSummary;
