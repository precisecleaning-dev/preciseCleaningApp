// Badge del estado de pago de un invoice.
import type { InvoiceStatus } from '../../../types/index';
import { INVOICE_STATUS_LABELS } from '../invoiceStatus';
import './InvoiceStatusBadge.css';

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
}

const InvoiceStatusBadge = ({ status }: InvoiceStatusBadgeProps) => (
  <span className={`invb-badge status-${status}`}>{INVOICE_STATUS_LABELS[status]}</span>
);

export default InvoiceStatusBadge;
