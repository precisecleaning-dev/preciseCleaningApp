// Lista de invoices que una acción en bloque saltó o no pudo hacer, con el
// motivo de cada uno. La usan Mark as Paid y Send invoice en bloque.
import type { InvoiceBulkIssue } from '../../../types/index';

interface InvoiceBulkIssueListProps {
  title: string;
  issues: InvoiceBulkIssue[];
  tone: 'warning' | 'error';
}

const InvoiceBulkIssueList = ({ title, issues, tone }: InvoiceBulkIssueListProps) => {
  if (issues.length === 0) return null;
  return (
    <section className={`invbd-issues tone-${tone}`} aria-label={title}>
      <h3 className="invbd-issues-title">{`${title} (${issues.length})`}</h3>
      <ul className="invbd-issues-list">
        {issues.map(({ invoice, reason }) => (
          <li key={invoice.id} className="invbd-issue">
            <span className="invbd-issue-number">{invoice.number}</span>
            <span className="invbd-issue-client">{invoice.client.name || 'Unknown client'}</span>
            <span className="invbd-issue-reason">{reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default InvoiceBulkIssueList;
