// Tabla de invoices de la página actual. En pantallas chicas se desplaza de
// lado (alcance §17: la tabla se conserva en el teléfono). Con permiso Edit, la
// primera columna marca invoices para las acciones en bloque; el checkbox del
// encabezado marca o desmarca toda la página.
import type { Invoice, YmdDate } from '../../../types/index';
import InvoiceRow, { type InvoiceRowActions } from './InvoiceRow';
import './InvoiceTable.css';

/** Selección de la página (useInvoiceSelection). */
export interface InvoiceTableSelection {
  selectedIds: ReadonlySet<string>;
  isAllSelected: boolean;
  isSomeSelected: boolean;
  onToggleInvoice: (invoice: Invoice) => void;
  onToggleAll: () => void;
}

interface InvoiceTableProps extends InvoiceRowActions {
  invoices: Invoice[];
  today: YmdDate;
  canEdit: boolean;
  canDelete: boolean;
  /** null = sin columna de selección. */
  selection: InvoiceTableSelection | null;
}

const InvoiceTable = ({
  invoices, today, canEdit, canDelete, selection, onViewInvoice, onEditInvoice, onMarkAsPaid, onPreviewPdf, onDownloadPdf,
  onSendInvoice, onOpenClientAccount, onDeleteInvoice, onRestoreInvoice,
}: InvoiceTableProps) => {
  // "Algunos marcados" no tiene atributo en HTML: se pone en el elemento.
  const setHeaderCheckboxState = (headerCheckbox: HTMLInputElement | null) => {
    if (headerCheckbox && selection) {
      headerCheckbox.indeterminate = selection.isSomeSelected && !selection.isAllSelected;
    }
  };

  return (
    <div className="invt-scroll">
      <table className="invt-table">
        <thead>
          <tr>
            {selection && (
              <th scope="col" className="invt-select">
                <label className="invt-select-label">
                  <input
                    ref={setHeaderCheckboxState}
                    type="checkbox"
                    className="invt-checkbox"
                    aria-label="Select all invoices on this page"
                    checked={selection.isAllSelected}
                    onChange={selection.onToggleAll}
                  />
                </label>
              </th>
            )}
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
              canDelete={canDelete}
              isSelected={selection ? selection.selectedIds.has(invoice.id) : null}
              onToggleSelected={selection?.onToggleInvoice}
              onViewInvoice={onViewInvoice}
              onEditInvoice={onEditInvoice}
              onMarkAsPaid={onMarkAsPaid}
              onPreviewPdf={onPreviewPdf}
              onDownloadPdf={onDownloadPdf}
              onSendInvoice={onSendInvoice}
              onOpenClientAccount={onOpenClientAccount}
              onDeleteInvoice={onDeleteInvoice}
              onRestoreInvoice={onRestoreInvoice}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default InvoiceTable;
