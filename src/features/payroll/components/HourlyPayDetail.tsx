// src/features/payroll/components/HourlyPayDetail.tsx
// Detalle de un pago por horas (se abre al hacer clic en su fila): empleado,
// fecha de pago, horas, rate, total, estado y el recibo (una imagen se ve
// aquí mismo; un PDF se abre en otra pestaña). Solo lectura: editar, borrar y
// "Mark paid" están en la tabla. La vista le pasa el pago EN VIVO.
import { useEffect } from 'react';
import { FileText, Timer, X } from 'lucide-react';
import type { PayrollRecord } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import { money } from '../../../utils/jobFinancials';
import './HourlyPayDetail.css';

const isPdfReceipt = (payment: PayrollRecord): boolean =>
  /\.pdf$/i.test(payment.receiptFileName ?? '') || /\.pdf(\?|$)/i.test(payment.receiptUrl ?? '');

interface DetailItemProps {
  label: string;
  value: string;
}

const DetailItem = ({ label, value }: DetailItemProps) => (
  <div className="hpd-item">
    <dt className="hpd-label">{label}</dt>
    <dd className="hpd-value">{value}</dd>
  </div>
);

interface ReceiptPreviewProps {
  payment: PayrollRecord;
}

const ReceiptPreview = ({ payment }: ReceiptPreviewProps) => {
  if (!payment.receiptUrl) return <p className="hpd-no-receipt">No pay receipt attached.</p>;
  const fileName = payment.receiptFileName || 'Pay receipt';

  if (isPdfReceipt(payment)) {
    return (
      <a className="hpd-receipt-link" href={payment.receiptUrl} rel="noopener noreferrer" target="_blank">
        <FileText size={16} aria-hidden="true" /> {fileName}
      </a>
    );
  }

  return (
    <a className="hpd-receipt-image-link" href={payment.receiptUrl} rel="noopener noreferrer" target="_blank">
      <img className="hpd-receipt-image" src={payment.receiptUrl} alt={fileName} loading="lazy" />
    </a>
  );
};

interface HourlyPayDetailProps {
  payment: PayrollRecord;
  employeeName: string;
  onClose: () => void;
}

const HourlyPayDetail = ({ payment, employeeName, onClose }: HourlyPayDetailProps) => {
  const isPaid = payment.status === 'Paid';

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay-centered" onClick={onClose}>
      <section
        className="modal-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hpd-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="hpd-header">
          <h3 id="hpd-title" className="hpd-title">
            <Timer size={18} aria-hidden="true" /> Hourly payment
          </h3>
          <button type="button" className="hpd-close-btn" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="hpd-body">
          <div className="hpd-summary">
            <div>
              <p className="hpd-employee">{employeeName}</p>
              <p className="hpd-total">{money(payment.totalAmount)}</p>
            </div>
            <span className={`hpd-badge${isPaid ? ' is-paid' : ''}`}>{isPaid ? 'Paid' : 'Pending'}</span>
          </div>

          <dl className="hpd-grid">
            <DetailItem label="Pay date" value={formatDate(payment.date)} />
            <DetailItem label="Hours worked" value={`${payment.hours ?? 0} h`} />
            <DetailItem label="Rate" value={`${money(payment.hourlyRate ?? 0)} / hour`} />
            <DetailItem label="Total" value={money(payment.totalAmount)} />
            {isPaid && <DetailItem label="Paid on" value={formatDate(payment.paidAt)} />}
            {isPaid && <DetailItem label="Paid by" value={payment.paidBy || '—'} />}
          </dl>

          <h4 className="hpd-section-title">Pay receipt</h4>
          <ReceiptPreview payment={payment} />
        </div>

        <footer className="hpd-footer">
          <button type="button" className="hpd-close-footer-btn" onClick={onClose}>
            Close
          </button>
        </footer>
      </section>
    </div>
  );
};

export default HourlyPayDetail;
