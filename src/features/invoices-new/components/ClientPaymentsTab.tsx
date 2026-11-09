// Cuenta del cliente · pestaña Payments: cada pago registrado (manual o de
// Stripe), el más reciente primero, con el total pagado y la paginación.
// Tocar una fila abre el detalle de su invoice encima.
import type { ClientAccountPayment, Invoice } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import { pluralize } from '../../../utils/countFormat';
import { clampPage, getPageCount, getPageItems } from '../../../shared/utils/pagination';
import PaginationBar from '../../../shared/components/PaginationBar';
import { formatCents } from '../invoiceMath';
import { INVOICE_PAGE_SIZES } from '../hooks/useInvoiceFilters';
import './InvoiceTable.css';

interface ClientPaymentsTabProps {
  payments: ClientAccountPayment[];
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onViewInvoice: (invoice: Invoice) => void;
}

const ClientPaymentsTab = ({
  payments, page, pageSize, onPageChange, onPageSizeChange, onViewInvoice,
}: ClientPaymentsTabProps) => {
  const pageCount = getPageCount(payments.length, pageSize);
  const visiblePage = clampPage(page, pageCount);
  const pagePayments = getPageItems(payments, visiblePage, pageSize);
  const paidTotalCents = payments.reduce((total, { payment }) => total + payment.amountCents, 0);

  if (payments.length === 0) {
    return <p className="cam-empty">This client has no payments recorded yet.</p>;
  }

  return (
    <div className="cam-tab">
      <p className="cam-tab-total">
        {`${pluralize(payments.length, 'payment', 'payments')} · `}
        <strong>{formatCents(paidTotalCents)}</strong>
        {' received'}
      </p>
      <div className="invt-scroll">
        <table className="cam-table invt-table">
          <thead>
            <tr>
              <th scope="col">Paid Date</th>
              <th scope="col">Invoice</th>
              <th scope="col">Method</th>
              <th scope="col">Reference</th>
              <th scope="col" className="invt-money">Amount</th>
            </tr>
          </thead>
          <tbody>
            {pagePayments.map(({ invoice, payment }) => (
              <tr key={invoice.id} className="invt-row" onClick={() => onViewInvoice(invoice)}>
                <td className="invt-date">{formatDate(payment.paidDate)}</td>
                <td>
                  <button type="button" className="invt-number" onClick={() => onViewInvoice(invoice)}>{invoice.number}</button>
                </td>
                <td>{payment.method}</td>
                <td className="cam-reference">{payment.reference || '—'}</td>
                <td className="invt-money">{formatCents(payment.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginationBar
        page={visiblePage}
        pageCount={pageCount}
        pageSize={pageSize}
        pageSizeOptions={INVOICE_PAGE_SIZES}
        totalItems={payments.length}
        itemLabel="payments"
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
};

export default ClientPaymentsTab;
