// src/features/payroll/components/FixedSalaryDetail.tsx
// Detalle de un sueldo fijo (se abre al hacer clic en su fila): sueldo mensual,
// lo que se paga el 15 y el último día, desde cuándo, estado, último cambio y
// los pagos quincenales que ya creó la Cloud Function (más reciente primero).
// Solo lectura. La vista le pasa el sueldo y los pagos EN VIVO.
import { CalendarDays } from 'lucide-react';
import type { FixedSalary, PayrollRecord } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import { money } from '../../../utils/jobFinancials';
import { getBiweeklyAmounts, getFixedPayPeriodLabel } from '../fixedPay';
import PayrollDialog from './PayrollDialog';
import './FixedSalaryDetail.css';

interface FixedSalaryDetailProps {
  salary: FixedSalary;
  employeeName: string;
  /** Pagos fijos de este empleado. */
  payments: readonly PayrollRecord[];
  onClose: () => void;
}

const FixedSalaryDetail = ({ salary, employeeName, payments, onClose }: FixedSalaryDetailProps) => {
  const { firstHalf, secondHalf } = getBiweeklyAmounts(salary.monthlyAmount);
  const sortedPayments = [...payments].sort((paymentA, paymentB) => paymentB.date.localeCompare(paymentA.date));
  const lastChangeText = `${formatDate(salary.updatedAt)}${salary.updatedByUserName ? ` · ${salary.updatedByUserName}` : ''}`;

  const footer = (
    <button type="button" className="pdlg-secondary-btn" onClick={onClose}>
      Close
    </button>
  );

  return (
    <PayrollDialog title="Fixed salary" icon={CalendarDays} onClose={onClose} footer={footer}>
      <div className="fsd-summary">
        <div>
          <p className="fsd-employee">{employeeName}</p>
          <p className="fsd-amount">{money(salary.monthlyAmount)} <span className="fsd-per">/ month</span></p>
        </div>
        <span className={`fsd-badge${salary.active ? ' is-active' : ''}`}>{salary.active ? 'Active' : 'Stopped'}</span>
      </div>

      <dl className="pdlg-details">
        <div>
          <dt className="pdlg-detail-label">Paid on the 15th</dt>
          <dd className="pdlg-detail-value">{money(firstHalf)}</dd>
        </div>
        <div>
          <dt className="pdlg-detail-label">Paid on the last day</dt>
          <dd className="pdlg-detail-value">{money(secondHalf)}</dd>
        </div>
        <div>
          <dt className="pdlg-detail-label">Starts on</dt>
          <dd className="pdlg-detail-value">{formatDate(salary.startDate)}</dd>
        </div>
        <div>
          <dt className="pdlg-detail-label">Last change</dt>
          <dd className="pdlg-detail-value">{lastChangeText}</dd>
        </div>
      </dl>

      <h4 className="fsd-section-title">Payments created ({sortedPayments.length})</h4>
      {sortedPayments.length === 0 ? (
        <p className="fsd-empty">No payments yet: they are created on the 15th and the last day of each month.</p>
      ) : (
        <ul className="fsd-payments">
          {sortedPayments.map((payment) => (
            <li key={payment.id} className="fsd-payment">
              <span>{formatDate(payment.date)}</span>
              <span className="fsd-period">{getFixedPayPeriodLabel(payment.date)}</span>
              <strong>{money(payment.totalAmount)}</strong>
              <span className={`fsd-payment-status${payment.status === 'Paid' ? ' is-paid' : ''}`}>
                {payment.status === 'Paid' ? 'Paid' : 'Pending'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PayrollDialog>
  );
};

export default FixedSalaryDetail;
