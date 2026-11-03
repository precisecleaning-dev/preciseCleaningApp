// Detalle de un invoice: pestañas Overview (datos, montos, pago, notas, fotos
// con Manage photos, y entrega) y Activity. Acciones: Preview / Download PDF y,
// con el permiso Edit, Edit, Send / Resend y Mark as Paid (solo sin pagar); con
// Delete, Delete (a la papelera, nunca un pagado). En la papelera: un aviso con
// quién, cuándo y por qué, y solo PDF y Restore.
// Recibe el invoice EN VIVO de la lista: se actualiza solo.
import { useState } from 'react';
import {
  CheckCircle2, DollarSign, Download, Eye, FileText, Image as ImageIcon, Pencil, RotateCcw, Send, StickyNote, Trash2,
} from 'lucide-react';
import type { Invoice, Property, SystemUser, YmdDate } from '../../../types/index';
import { canMoveToTrash, getDisplayStatus, isDeletedInvoice, isPaidStatus } from '../invoiceStatus';
import { formatDate } from '../../../utils/dateFormat';
import InvoiceDialog from './InvoiceDialog';
import InvoiceStatusBadge from './InvoiceStatusBadge';
import InvoiceFormSection from './InvoiceFormSection';
import InvoiceDetailFacts from './InvoiceDetailFacts';
import InvoiceDetailAmounts from './InvoiceDetailAmounts';
import InvoiceDetailNotes from './InvoiceDetailNotes';
import InvoiceDetailDelivery from './InvoiceDetailDelivery';
import InvoiceDetailPhotos from './InvoiceDetailPhotos';
import InvoiceActivityTab from './InvoiceActivityTab';
import './InvoiceFormModal.css';
import './InvoiceDetailModal.css';

type DetailTab = 'overview' | 'activity';

const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'activity', label: 'Activity' },
];

interface InvoiceDetailModalProps {
  invoice: Invoice;
  /** Casa del job (null si no está en la ventana de 12 meses). */
  jobProperty: Property | null;
  today: YmdDate;
  canEdit: boolean;
  canDelete: boolean;
  currentUser: SystemUser | null;
  onClose: () => void;
  onEditInvoice: (invoice: Invoice) => void;
  onMarkAsPaid: (invoice: Invoice) => void;
  onPreviewPdf: (invoice: Invoice) => void;
  onDownloadPdf: (invoice: Invoice) => void;
  onSendInvoice: (invoice: Invoice) => void;
  onOpenClientAccount: (invoice: Invoice) => void;
  onDeleteInvoice: (invoice: Invoice) => void;
  onRestoreInvoice: (invoice: Invoice) => void;
}

const InvoiceDetailModal = ({
  invoice, jobProperty, today, canEdit, canDelete, currentUser, onClose, onEditInvoice, onMarkAsPaid, onPreviewPdf,
  onDownloadPdf, onSendInvoice, onOpenClientAccount, onDeleteInvoice, onRestoreInvoice,
}: InvoiceDetailModalProps) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const { deletion } = invoice;
  const isDeleted = isDeletedInvoice(invoice);
  // En la papelera no se cambia nada hasta restaurarlo.
  const canChange = canEdit && !isDeleted;
  const canMarkAsPaid = canChange && !isPaidStatus(invoice.status);
  const canDeleteThis = canDelete && canMoveToTrash(invoice);
  const deletionText = deletion
    ? `Deleted on ${formatDate(deletion.deletedAt.slice(0, 10))} by ${deletion.deletedByUserName} · Reason: ${deletion.reason}`
    : '';
  const subtitle = [invoice.client.name, invoice.job.address].filter(Boolean).join(' · ');
  const sendLabel = invoice.delivery.sendCount > 0 ? 'Resend' : 'Send';

  return (
    <InvoiceDialog
      title={invoice.number}
      subtitle={subtitle}
      headerExtra={<InvoiceStatusBadge status={getDisplayStatus(invoice, today)} />}
      onClose={onClose}
    >
      <div className="invdt-tabs" role="tablist" aria-label="Invoice sections">
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`invoice-detail-tab-${tab.key}`}
            aria-selected={activeTab === tab.key}
            aria-controls={`invoice-detail-panel-${tab.key}`}
            className={`invdt-tab${activeTab === tab.key ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className="invd-body"
        role="tabpanel"
        id={`invoice-detail-panel-${activeTab}`}
        aria-labelledby={`invoice-detail-tab-${activeTab}`}
      >
        {activeTab === 'overview' && (
          <>
            {isDeleted && <p className="invf-warning" role="status">{deletionText}</p>}
            <InvoiceFormSection id="invoice-detail-info" title="Invoice" icon={FileText}>
              <InvoiceDetailFacts invoice={invoice} today={today} onOpenClientAccount={onOpenClientAccount} />
            </InvoiceFormSection>
            <InvoiceFormSection id="invoice-detail-amounts" title="Amounts" icon={DollarSign}>
              <InvoiceDetailAmounts invoice={invoice} />
            </InvoiceFormSection>
            <InvoiceFormSection id="invoice-detail-notes" title="Notes" icon={StickyNote}>
              <InvoiceDetailNotes invoice={invoice} canEdit={canChange} currentUser={currentUser} />
            </InvoiceFormSection>
            <InvoiceFormSection id="invoice-detail-photos" title="Job photos" icon={ImageIcon}>
              <InvoiceDetailPhotos invoice={invoice} jobProperty={jobProperty} canEdit={canChange} currentUser={currentUser} />
            </InvoiceFormSection>
            <InvoiceFormSection id="invoice-detail-delivery" title="Delivery" icon={Send}>
              <InvoiceDetailDelivery invoice={invoice} />
            </InvoiceFormSection>
          </>
        )}
        {activeTab === 'activity' && <InvoiceActivityTab invoiceId={invoice.id} />}
      </div>

      <footer className="invd-footer">
        <button type="button" className="invd-secondary-btn" onClick={() => onPreviewPdf(invoice)}>
          <Eye size={16} aria-hidden="true" /> Preview PDF
        </button>
        <button type="button" className="invd-secondary-btn" onClick={() => onDownloadPdf(invoice)}>
          <Download size={16} aria-hidden="true" /> Download PDF
        </button>
        {canDeleteThis && (
          <button type="button" className="invd-secondary-btn is-danger" onClick={() => onDeleteInvoice(invoice)}>
            <Trash2 size={16} aria-hidden="true" /> Delete
          </button>
        )}
        {canChange && (
          <button type="button" className="invd-secondary-btn" onClick={() => onEditInvoice(invoice)}>
            <Pencil size={16} aria-hidden="true" /> Edit
          </button>
        )}
        {canChange && (
          <button type="button" className="invd-secondary-btn" onClick={() => onSendInvoice(invoice)}>
            <Send size={16} aria-hidden="true" /> {sendLabel}
          </button>
        )}
        {canMarkAsPaid && (
          <button type="button" className="btn-primary invd-primary-btn" onClick={() => onMarkAsPaid(invoice)}>
            <CheckCircle2 size={16} aria-hidden="true" /> Mark as Paid
          </button>
        )}
        {isDeleted && canDelete && (
          <button type="button" className="btn-primary invd-primary-btn" onClick={() => onRestoreInvoice(invoice)}>
            <RotateCcw size={16} aria-hidden="true" /> Restore
          </button>
        )}
      </footer>
    </InvoiceDialog>
  );
};

export default InvoiceDetailModal;
