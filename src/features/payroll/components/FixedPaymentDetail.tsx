// src/features/payroll/components/FixedPaymentDetail.tsx
// Detalle de un pago fijo quincenal (se abre al hacer clic en su fila):
// empleado, monto, quincena, fecha de pago, estado y cuándo y quién lo pagó.
// Solo lectura: editar, borrar y "Mark paid" están en la tabla. La vista le
// pasa el pago EN VIVO.
import { CalendarClock } from 'lucide-react';
import type { PayrollRecord } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import { money } from '../../../utils/jobFinancials';
import { getFixedPayPeriodLabel } from '../fixedPay';
import PayrollDialog from './PayrollDialog';
import './PayrollTable.css';
import './FixedPaymentDetail.css';

interface FixedPaymentDetailProps {
  payment: PayrollRecord;
  employeeName: string;
  onClose: () => void;
}

const FixedPaymentDetail = ({ payment, employeeName, onClose }: FixedPaymentDetailProps) => {
  const isPaid = payment.status === 'Paid';

  const footer = (
    <button type="button" className="pdlg-secondary-btn" onClick={onClose}>
      Close
    </button>
  );

  return (
    <PayrollDialog title="Fixed payment" icon={CalendarClock} onClose={onClose} footer={footer}>
      <div className="fpd-summary">
        <div>
          <p className="fpd-employee">{employeeName}</p>
          <p className="fpd-amount">{money(payment.totalAmount)}</p>
        </div>
        <span className={`ptbl-badge${isPaid ? ' is-paid' : ''}`}>{isPaid ? 'Paid' : 'Pending'}</span>
      </div>

      <dl className="pdlg-details">
        <div>
          <dt className="pdlg-detail-label">Pay date</dt>
          <dd className="pdlg-detail-value">{formatDate(payment.date)}</dd>
        </div>
        <div>
          <dt className="pdlg-detail-label">Period</dt>
          <dd className="pdlg-detail-value">{getFixedPayPeriodLabel(payment.date)}</dd>
        </div>
        {isPaid && (
          <div>
            <dt className="pdlg-detail-label">Paid on</dt>
            <dd className="pdlg-detail-value">{formatDate(payment.paidAt)}</dd>
          </div>
        )}
        {isPaid && (
          <div>
            <dt className="pdlg-detail-label">Paid by</dt>
            <dd className="pdlg-detail-value">{payment.paidBy || '—'}</dd>
          </div>
        )}
      </dl>
      <p className="fpd-hint">Created automatically from the employee&apos;s fixed salary.</p>
    </PayrollDialog>
  );
};

export default FixedPaymentDetail;
