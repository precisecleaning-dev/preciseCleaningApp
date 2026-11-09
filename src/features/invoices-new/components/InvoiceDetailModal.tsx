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
import type { Invoice, InvoiceActions, InvoicesNewRights, Property, SystemUser, YmdDate } from '../../../types/index';
import { getDisplayStatus } from '../invoiceStatus';
import { getInvoiceActionRights } from '../invoicesNewPermissions';
import { formatDate } from '../../../utils/dateFormat';
import InvoiceDialog from './InvoiceDialog';
import InvoiceTabs, { type InvoiceTabItem } from './InvoiceTabs';
import { getTabPanelProps } from '../invoiceTabs';
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

const DETAIL_TABS_ID = 'invoice-detail';

const DETAIL_TABS: InvoiceTabItem<DetailTab>[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'activity', label: 'Activity' },
];

interface InvoiceDetailModalProps {
  invoice: Invoice;
  /** Casa del job (null si no está en la ventana de 12 meses). */
  jobProperty: Property | null;
  today: YmdDate;
  rights: InvoicesNewRights;
  currentUser: SystemUser | null;
  /** Lo que se hace con el invoice (las mismas acciones del menú de la fila). */
  actions: InvoiceActions;
  onClose: () => void;
}

const InvoiceDetailModal = ({
  invoice, jobProperty, today, rights, currentUser, actions, onClose,
}: InvoiceDetailModalProps) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const { deletion } = invoice;
  // Mismas reglas que el menú de la fila; en la papelera solo PDF y Restore.
  const actionRights = getInvoiceActionRights(invoice, rights);
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
      <InvoiceTabs
        tabs={DETAIL_TABS}
        activeTab={activeTab}
        onChange={setActiveTab}
        idPrefix={DETAIL_TABS_ID}
        label="Invoice sections"
      />

      <div className="invd-body" {...getTabPanelProps(DETAIL_TABS_ID, activeTab)}>
        {activeTab === 'overview' && (
          <>
            {actionRights.isDeleted && <p className="invf-warning" role="status">{deletionText}</p>}
            <InvoiceFormSection id="invoice-detail-info" title="Invoice" icon={FileText}>
              <InvoiceDetailFacts invoice={invoice} today={today} onOpenClientAccount={actions.openClientAccount} />
            </InvoiceFormSection>
            <InvoiceFormSection id="invoice-detail-amounts" title="Amounts" icon={DollarSign}>
              <InvoiceDetailAmounts invoice={invoice} />
            </InvoiceFormSection>
            <InvoiceFormSection id="invoice-detail-notes" title="Notes" icon={StickyNote}>
              <InvoiceDetailNotes invoice={invoice} canEdit={actionRights.canEdit} currentUser={currentUser} />
            </InvoiceFormSection>
            <InvoiceFormSection id="invoice-detail-photos" title="Job photos" icon={ImageIcon}>
              <InvoiceDetailPhotos
                invoice={invoice}
                jobProperty={jobProperty}
                canEdit={actionRights.canEdit}
                currentUser={currentUser}
              />
            </InvoiceFormSection>
            <InvoiceFormSection id="invoice-detail-delivery" title="Delivery" icon={Send}>
              <InvoiceDetailDelivery invoice={invoice} />
            </InvoiceFormSection>
          </>
        )}
        {activeTab === 'activity' && <InvoiceActivityTab invoiceId={invoice.id} />}
      </div>

      <footer className="invd-footer">
        <button type="button" className="invd-secondary-btn" onClick={() => actions.previewPdf(invoice)}>
          <Eye size={16} aria-hidden="true" /> Preview PDF
        </button>
        <button type="button" className="invd-secondary-btn" onClick={() => actions.downloadPdf(invoice)}>
          <Download size={16} aria-hidden="true" /> Download PDF
        </button>
        {actionRights.canDelete && (
          <button type="button" className="invd-secondary-btn is-danger" onClick={() => actions.deleteInvoice(invoice)}>
            <Trash2 size={16} aria-hidden="true" /> Delete
          </button>
        )}
        {actionRights.canEdit && (
          <button type="button" className="invd-secondary-btn" onClick={() => actions.editInvoice(invoice)}>
            <Pencil size={16} aria-hidden="true" /> Edit
          </button>
        )}
        {actionRights.canSend && (
          <button type="button" className="invd-secondary-btn" onClick={() => actions.sendInvoice(invoice)}>
            <Send size={16} aria-hidden="true" /> {sendLabel}
          </button>
        )}
        {actionRights.canMarkAsPaid && (
          <button type="button" className="btn-primary invd-primary-btn" onClick={() => actions.markAsPaid(invoice)}>
            <CheckCircle2 size={16} aria-hidden="true" /> Mark as Paid
          </button>
        )}
        {actionRights.canRestore && (
          <button type="button" className="btn-primary invd-primary-btn" onClick={() => actions.restoreInvoice(invoice)}>
            <RotateCcw size={16} aria-hidden="true" /> Restore
          </button>
        )}
      </footer>
    </InvoiceDialog>
  );
};

export default InvoiceDetailModal;
