// src/features/payroll/components/HourlyPayDetail.tsx
// Detalle de un pago por horas (se abre al hacer clic en su fila): empleado,
// fecha de pago, horas, rate, total, estado y el recibo (una imagen se ve
// aquí mismo; un PDF se abre en otra pestaña). Solo lectura: editar, borrar y
// "Mark paid" están en la tabla. La vista le pasa el pago EN VIVO.
import { FileText, Timer } from 'lucide-react';
import type { PayrollRecord } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import { money } from '../../../utils/jobFinancials';
import PayrollDialog from './PayrollDialog';
import './PayrollTable.css';
import './HourlyPayDetail.css';

const isPdfReceipt = (payment: PayrollRecord): boolean =>
  /\.pdf$/i.test(payment.receiptFileName ?? '') || /\.pdf(\?|$)/i.test(payment.receiptUrl ?? '');

interface DetailItemProps {
  label: string;
  value: string;
}

const DetailItem = ({ label, value }: DetailItemProps) => (
  <div>
    <dt className="pdlg-detail-label">{label}</dt>
    <dd className="pdlg-detail-value">{value}</dd>
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

  const footer = (
    <button type="button" className="pdlg-secondary-btn" onClick={onClose}>
      Close
    </button>
  );

  return (
    <PayrollDialog title="Hourly payment" icon={Timer} onClose={onClose} footer={footer}>
      <div className="hpd-summary">
        <div>
          <p className="hpd-employee">{employeeName}</p>
          <p className="hpd-total">{money(payment.totalAmount)}</p>
        </div>
        <span className={`ptbl-badge${isPaid ? ' is-paid' : ''}`}>{isPaid ? 'Paid' : 'Pending'}</span>
      </div>

      <dl className="pdlg-details">
        <DetailItem label="Pay date" value={formatDate(payment.date)} />
        <DetailItem label="Hours worked" value={`${payment.hours ?? 0} h`} />
        <DetailItem label="Rate" value={`${money(payment.hourlyRate ?? 0)} / hour`} />
        <DetailItem label="Total" value={money(payment.totalAmount)} />
        {isPaid && <DetailItem label="Paid on" value={formatDate(payment.paidAt)} />}
        {isPaid && <DetailItem label="Paid by" value={payment.paidBy || '—'} />}
      </dl>

      <h4 className="hpd-section-title">Pay receipt</h4>
      <ReceiptPreview payment={payment} />
    </PayrollDialog>
  );
};

export default HourlyPayDetail;
