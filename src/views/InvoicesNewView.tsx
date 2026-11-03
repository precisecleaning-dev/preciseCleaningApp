// ============================================================================
// ⭐ INVOICES NEW — módulo nuevo de invoices (el módulo "Invoices" de siempre
//    sigue aparte, sin cambios). Un invoice = un job y su cliente, con pagos,
//    PDF, envío por correo y enlace de Stripe. Se construye por etapas (ver
//    la nota "Invoices New" de code-notes.md).
//    Esta vista solo orquesta: permisos, datos (hooks de
//    features/invoices-new) y componentes.
// ============================================================================
import { useState } from 'react';
import type { Invoice, InvoiceDeliveryOutcome, Property, Role, SystemUser } from '../types/index';
import { todayIso } from '../utils/dateFormat';
import { getInvoicesNewRights } from '../features/invoices-new/invoicesNewPermissions';
import { useInvoicesWindow } from '../features/invoices-new/hooks/useInvoicesWindow';
import { useInvoiceFilters } from '../features/invoices-new/hooks/useInvoiceFilters';
import { useInvoiceList } from '../features/invoices-new/hooks/useInvoiceList';
import HistoryWindowNotice from '../components/HistoryWindowNotice';
import InvoicesNewHeader from '../features/invoices-new/components/InvoicesNewHeader';
import InvoiceSummaryCards from '../features/invoices-new/components/InvoiceSummaryCards';
import InvoiceFiltersBar from '../features/invoices-new/components/InvoiceFiltersBar';
import InvoiceRegister from '../features/invoices-new/components/InvoiceRegister';
import InvoiceFormModal from '../features/invoices-new/components/InvoiceFormModal';
import InvoiceSavedNotice, { type InvoiceNoticeTone } from '../features/invoices-new/components/InvoiceSavedNotice';
import SavedInvoicePdfPreview from '../features/invoices-new/components/SavedInvoicePdfPreview';
import { downloadSavedInvoicePdf } from '../features/invoices-new/invoicePdfFile';
import { describeDeliveryOutcome, getMissingPhotosWarning } from '../features/invoices-new/invoiceDelivery';
import InvoiceDetailModal from '../features/invoices-new/components/InvoiceDetailModal';
import RecordPaymentDialog from '../features/invoices-new/components/RecordPaymentDialog';
import SendInvoiceDialog from '../features/invoices-new/components/SendInvoiceDialog';
import './InvoicesNewView.css';

interface InvoicesNewViewProps {
  onOpenMenu: () => void;
  /** Casas del listener global de App.tsx (ventana de 12 meses): los jobs del formulario. */
  properties: Property[];
  currentUser: SystemUser | null;
  activeRole: Role | null;
  isSuperAdmin: boolean;
}

/** Formulario abierto: crear (`invoice` null) o editar ese invoice. */
type InvoiceFormTarget = { invoice: Invoice | null } | null;

const InvoicesNewView = ({ onOpenMenu, properties, currentUser, activeRole, isSuperAdmin }: InvoicesNewViewProps) => {
  const rights = getInvoicesNewRights(activeRole, isSuperAdmin);
  const today = todayIso();
  const invoicesWindow = useInvoicesWindow();
  const { filters, actions: filterActions, hasActiveFilters } = useInvoiceFilters();
  const invoiceList = useInvoiceList(invoicesWindow.invoices, filters, today);
  const [formTarget, setFormTarget] = useState<InvoiceFormTarget>(null);
  // Detalle y Record payment guardan el id: el invoice se toma EN VIVO de la lista.
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);
  const [sendInvoiceId, setSendInvoiceId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: InvoiceNoticeTone } | null>(null);
  const findInvoice = (invoiceId: string | null) =>
    invoicesWindow.invoices.find((windowInvoice) => windowInvoice.id === invoiceId) ?? null;
  const findJobProperty = (invoice: Invoice) => properties.find((property) => property.id === invoice.propertyId) ?? null;
  const detailInvoice = findInvoice(detailInvoiceId);
  const paymentInvoice = findInvoice(paymentInvoiceId);
  const previewInvoice = findInvoice(previewInvoiceId);
  const sendInvoice = findInvoice(sendInvoiceId);

  const handleInvoiceSaved = (result: { id: string; number: string; isNew: boolean; delivery: InvoiceDeliveryOutcome | null }) => {
    setFormTarget(null);
    const savedText = result.isNew ? `Invoice ${result.number} created.` : `Invoice ${result.number} saved.`;
    const deliveryText = result.delivery ? describeDeliveryOutcome(result.delivery) : null;
    setNotice({
      message: deliveryText ? `${savedText} ${deliveryText.text}` : savedText,
      tone: deliveryText?.isProblem ? 'error' : 'success',
    });
    // Al crear se limpian los filtros y se abre su detalle, para que el invoice
    // nuevo quede a la vista (alcance §9). El detalle aparece cuando el listener lo trae.
    if (result.isNew) {
      filterActions.clear();
      setDetailInvoiceId(result.id);
    }
  };

  const handleInvoiceSent = (invoice: Invoice, outcome: InvoiceDeliveryOutcome) => {
    setSendInvoiceId(null);
    const { text, isProblem } = describeDeliveryOutcome(outcome);
    setNotice({ message: `Invoice ${invoice.number}: ${text}`, tone: isProblem ? 'error' : 'success' });
  };

  const handlePaymentRecorded = (invoice: Invoice) => {
    setPaymentInvoiceId(null);
    setNotice({ message: `Payment recorded for ${invoice.number}.`, tone: 'success' });
  };

  // Download PDF desde el menú o el detalle (sin abrir la vista previa).
  const handleDownloadPdf = async (invoice: Invoice) => {
    setNotice({ message: `Preparing the PDF of ${invoice.number}…`, tone: 'info' });
    try {
      const { missingPhotoCount } = await downloadSavedInvoicePdf(invoice, findJobProperty(invoice));
      if (missingPhotoCount > 0) {
        setNotice({ message: `PDF of ${invoice.number} downloaded. ${getMissingPhotosWarning(missingPhotoCount)}`, tone: 'error' });
      } else {
        setNotice({ message: `PDF of ${invoice.number} downloaded.`, tone: 'success' });
      }
    } catch (error) {
      console.error('Could not create the PDF:', error);
      setNotice({ message: `Could not create the PDF of ${invoice.number}. Check your connection and try again.`, tone: 'error' });
    }
  };

  return (
    <div className="fade-in invn-page">
      <InvoicesNewHeader
        onOpenMenu={onOpenMenu}
        canCreate={rights.canCreate}
        onCreateInvoice={() => setFormTarget({ invoice: null })}
      />
      <HistoryWindowNotice />
      {notice && <InvoiceSavedNotice message={notice.message} tone={notice.tone} onDismiss={() => setNotice(null)} />}
      <InvoiceSummaryCards
        summary={invoiceList.summary}
        selectedCard={filters.card}
        onSelectCard={filterActions.selectCard}
        isLoading={invoicesWindow.isLoading}
      />
      <InvoiceFiltersBar
        search={filters.search}
        onSearchChange={filterActions.setSearch}
        status={filters.status}
        onStatusChange={filterActions.setStatus}
        dateRange={filters.dateRange}
        onDateRangeChange={filterActions.setDateRange}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={filterActions.clear}
      />
      <InvoiceRegister
        pageInvoices={invoiceList.pageInvoices}
        filteredCount={invoiceList.filteredCount}
        windowCount={invoicesWindow.invoices.length}
        isLoading={invoicesWindow.isLoading}
        hasError={invoicesWindow.hasError}
        today={today}
        page={invoiceList.page}
        pageCount={invoiceList.pageCount}
        pageSize={filters.pageSize}
        onPageChange={filterActions.setPage}
        onPageSizeChange={filterActions.setPageSize}
        onClearFilters={filterActions.clear}
        canEdit={rights.canEdit}
        onViewInvoice={(invoice) => setDetailInvoiceId(invoice.id)}
        onEditInvoice={(invoice) => setFormTarget({ invoice })}
        onMarkAsPaid={(invoice) => setPaymentInvoiceId(invoice.id)}
        onPreviewPdf={(invoice) => setPreviewInvoiceId(invoice.id)}
        onDownloadPdf={handleDownloadPdf}
        onSendInvoice={(invoice) => setSendInvoiceId(invoice.id)}
      />
      {detailInvoice && (
        <InvoiceDetailModal
          invoice={detailInvoice}
          jobProperty={findJobProperty(detailInvoice)}
          today={today}
          canEdit={rights.canEdit}
          currentUser={currentUser}
          onClose={() => setDetailInvoiceId(null)}
          onEditInvoice={(invoice) => setFormTarget({ invoice })}
          onMarkAsPaid={(invoice) => setPaymentInvoiceId(invoice.id)}
          onPreviewPdf={(invoice) => setPreviewInvoiceId(invoice.id)}
          onDownloadPdf={handleDownloadPdf}
          onSendInvoice={(invoice) => setSendInvoiceId(invoice.id)}
        />
      )}
      {formTarget && (
        <InvoiceFormModal
          invoice={formTarget.invoice}
          properties={properties}
          currentUser={currentUser}
          onClose={() => setFormTarget(null)}
          onSaved={handleInvoiceSaved}
        />
      )}
      {paymentInvoice && (
        <RecordPaymentDialog
          invoice={paymentInvoice}
          currentUser={currentUser}
          onClose={() => setPaymentInvoiceId(null)}
          onRecorded={handlePaymentRecorded}
        />
      )}
      {sendInvoice && (
        <SendInvoiceDialog
          invoice={sendInvoice}
          jobProperty={findJobProperty(sendInvoice)}
          currentUser={currentUser}
          onClose={() => setSendInvoiceId(null)}
          onSent={handleInvoiceSent}
        />
      )}
      {previewInvoice && (
        <SavedInvoicePdfPreview
          invoice={previewInvoice}
          jobProperty={findJobProperty(previewInvoice)}
          onClose={() => setPreviewInvoiceId(null)}
        />
      )}
    </div>
  );
};

export default InvoicesNewView;
