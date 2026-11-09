// Badge del estado de un invoice: el que se ve (Overdue si está vencido).
import type { InvoiceDisplayStatus } from '../../../types/index';
import { INVOICE_STATUS_LABELS } from '../invoiceStatus';
import './InvoiceStatusBadge.css';

interface InvoiceStatusBadgeProps {
  status: InvoiceDisplayStatus;
}

const InvoiceStatusBadge = ({ status }: InvoiceStatusBadgeProps) => (
  <span className={`invb-badge status-${status}`}>{INVOICE_STATUS_LABELS[status]}</span>
);

export default InvoiceStatusBadge;
