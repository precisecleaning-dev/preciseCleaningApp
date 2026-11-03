// Tabla de invoices de la página actual. En pantallas chicas se desplaza de
// lado (alcance §17: la tabla se conserva en el teléfono).
import type { Invoice, YmdDate } from '../../../types/index';
import InvoiceRow, { type InvoiceRowActions } from './InvoiceRow';
import './InvoiceTable.css';

interface InvoiceTableProps extends InvoiceRowActions {
  invoices: Invoice[];
  today: YmdDate;
  canEdit: boolean;
}

const InvoiceTable = ({
  invoices, today, canEdit, onViewInvoice, onEditInvoice, onMarkAsPaid, onPreviewPdf, onDownloadPdf, onSendInvoice,
}: InvoiceTableProps) => (
  <div className="invt-scroll">
    <table className="invt-table">
      <thead>
        <tr>
          <th scope="col">Invoice</th>
          <th scope="col">Client / Job</th>
          <th scope="col">Issue Date</th>
          <th scope="col">Due Date</th>
          <th scope="col" className="invt-money">Total</th>
          <th scope="col">Payment Status</th>
          <th scope="col"><span className="invn-sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((invoice) => (
          <InvoiceRow
            key={invoice.id}
            invoice={invoice}
            today={today}
            canEdit={canEdit}
            onViewInvoice={onViewInvoice}
            onEditInvoice={onEditInvoice}
            onMarkAsPaid={onMarkAsPaid}
            onPreviewPdf={onPreviewPdf}
            onDownloadPdf={onDownloadPdf}
            onSendInvoice={onSendInvoice}
          />
        ))}
      </tbody>
    </table>
  </div>
);

export default InvoiceTable;
