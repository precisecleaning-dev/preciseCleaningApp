// Cuenta del cliente (Client account): se abre al tocar el cliente en la tabla
// o en el detalle. Contacto, tarjetas (Outstanding, Overdue, Paid, In Draft) y
// pestañas Invoices y Payments con TODO su historial en Invoices New, de
// cualquier fecha, paginado. Tocar un invoice abre su detalle encima.
// Los invoices llegan de la vista (useClientInvoices), que también los usa
// para abrir en vivo el detalle de un invoice fuera de la ventana de 12 meses.
// "Download statement": estado de cuenta en PDF (clientStatementPdf.ts).
import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { ClientAccountKey, Invoice, YmdDate } from '../../../types/index';
import { filterClientInvoices, getClientContact, getClientPayments, summarizeClientAccount } from '../clientAccount';
import { isDeletedInvoice } from '../invoiceStatus';
import { useClientAccountFilters, type ClientAccountTab } from '../hooks/useClientAccountFilters';
import { downloadClientStatement } from '../clientStatementFile';
import InvoiceDialog from './InvoiceDialog';
import ClientAccountSummary from './ClientAccountSummary';
import ClientInvoicesTab from './ClientInvoicesTab';
import ClientPaymentsTab from './ClientPaymentsTab';
import './InvoiceDetailModal.css';
import './ClientAccountModal.css';

const ACCOUNT_TABS: { key: ClientAccountTab; label: string }[] = [
  { key: 'invoices', label: 'Invoices' },
  { key: 'payments', label: 'Payments' },
];

interface ClientAccountModalProps {
  clientKey: ClientAccountKey;
  /** Todos los invoices del cliente (useClientInvoices). */
  invoices: Invoice[];
  isLoading: boolean;
  hasError: boolean;
  today: YmdDate;
  onViewInvoice: (invoice: Invoice) => void;
  onClose: () => void;
}

const ClientAccountModal = ({
  clientKey, invoices, isLoading, hasError, today, onViewInvoice, onClose,
}: ClientAccountModalProps) => {
  const { filters, actions } = useClientAccountFilters();
  const [isDownloadingStatement, setIsDownloadingStatement] = useState(false);
  const [statementError, setStatementError] = useState('');
  // Los de la papelera no cuentan en la cuenta del cliente.
  const activeInvoices = invoices.filter((invoice) => !isDeletedInvoice(invoice));
  const contact = getClientContact(invoices);
  const clientName = contact?.name || clientKey.name || 'Unknown client';
  const contactLine = [
    contact?.email,
    contact?.phone,
    [contact?.address, contact?.cityStateZip].filter(Boolean).join(', '),
  ].filter(Boolean).join(' · ');
  const summary = summarizeClientAccount(activeInvoices, today);
  const filteredInvoices = filterClientInvoices(activeInvoices, filters.card, filters.status, today);
  const payments = getClientPayments(activeInvoices);
  const isStatementDisabled = isLoading || hasError || isDownloadingStatement;

  const handleDownloadStatement = async () => {
    setStatementError('');
    setIsDownloadingStatement(true);
    try {
      await downloadClientStatement(activeInvoices, clientName, today);
    } catch (error) {
      console.error('Could not create the statement:', error);
      setStatementError('Could not create the statement PDF. Check your connection and try again.');
    } finally {
      setIsDownloadingStatement(false);
    }
  };

  const renderPanel = () => {
    if (isLoading) {
      return (
        <div className="cam-loading" aria-hidden="true">
          <span className="skel-line skel-row-main" />
          <span className="skel-line skel-row-main" />
          <span className="skel-line skel-row-main" />
        </div>
      );
    }
    if (hasError) {
      return (
        <p className="cam-empty" role="alert">
          Could not load this client&apos;s invoices. Check your connection and open the account again.
        </p>
      );
    }
    if (filters.tab === 'payments') {
      return (
        <ClientPaymentsTab
          payments={payments}
          page={filters.paymentsPage}
          pageSize={filters.pageSize}
          onPageChange={actions.setPaymentsPage}
          onPageSizeChange={actions.setPageSize}
          onViewInvoice={onViewInvoice}
        />
      );
    }
    return (
      <ClientInvoicesTab
        invoices={filteredInvoices}
        status={filters.status}
        onStatusChange={actions.setStatus}
        page={filters.invoicesPage}
        pageSize={filters.pageSize}
        onPageChange={actions.setInvoicesPage}
        onPageSizeChange={actions.setPageSize}
        today={today}
        onViewInvoice={onViewInvoice}
      />
    );
  };

  return (
    <InvoiceDialog title={clientName} subtitle={contactLine || 'Client account'} onClose={onClose}>
      <div className="invd-body modal-body-scroll">
        <ClientAccountSummary
          summary={summary}
          selectedCard={filters.card}
          onSelectCard={actions.selectCard}
          isLoading={isLoading}
        />
        <div className="cam-tabs invdt-tabs" role="tablist" aria-label="Client account sections">
          {ACCOUNT_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`client-account-tab-${tab.key}`}
              aria-selected={filters.tab === tab.key}
              aria-controls={`client-account-panel-${tab.key}`}
              className={`invdt-tab${filters.tab === tab.key ? ' active' : ''}`}
              onClick={() => actions.setTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`client-account-panel-${filters.tab}`} aria-labelledby={`client-account-tab-${filters.tab}`}>
          {renderPanel()}
        </div>
      </div>
      <footer className="invd-footer">
        {statementError && <p className="invd-footer-error" role="alert">{statementError}</p>}
        <button type="button" className="invd-secondary-btn" disabled={isStatementDisabled} onClick={handleDownloadStatement}>
          {isDownloadingStatement ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
          {' '}Download statement
        </button>
        <button type="button" className="btn-primary invd-primary-btn" onClick={onClose}>Close</button>
      </footer>
    </InvoiceDialog>
  );
};

export default ClientAccountModal;
