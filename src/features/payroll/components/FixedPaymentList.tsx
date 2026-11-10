// src/features/payroll/components/FixedPaymentList.tsx
// Pagos fijos quincenales ya creados por la Cloud Function (más reciente
// primero): fecha, empleado, quincena, monto y estado. "Mark paid" lo resuelve
// la vista (onMarkPaid).
import { CheckCircle } from 'lucide-react';
import type { PayrollRecord } from '../../../types/index';
import VirtualItems from '../../../shared/components/VirtualItems';
import { formatDate } from '../../../utils/dateFormat';
import { money } from '../../../utils/jobFinancials';
import { getFixedPayPeriodLabel } from '../fixedPay';
import './FixedPaymentList.css';

interface FixedPaymentRowProps {
  payment: PayrollRecord;
  employeeName: string;
  canMarkPaid: boolean;
  onMarkPaid: (payment: PayrollRecord) => void;
}

const FixedPaymentRow = ({ payment, employeeName, canMarkPaid, onMarkPaid }: FixedPaymentRowProps) => {
  const isPaid = payment.status === 'Paid';
  const statusText = isPaid ? `Paid ${formatDate(payment.paidAt)}` : 'Pending';

  return (
    <div className="fpl-row">
      <span className="fpl-date">{formatDate(payment.date)}</span>
      <span className="fpl-employee">{employeeName}</span>
      <span className="fpl-period">{getFixedPayPeriodLabel(payment.date)}</span>
      <strong className="fpl-amount">{money(payment.totalAmount)}</strong>
      <span className="fpl-status">
        <span className={`fpl-badge${isPaid ? ' is-paid' : ''}`}>{statusText}</span>
        {canMarkPaid && !isPaid && (
          <button type="button" className="fpl-paid-btn" onClick={() => onMarkPaid(payment)}>
            <CheckCircle size={14} aria-hidden="true" /> Mark paid
          </button>
        )}
      </span>
    </div>
  );
};

interface FixedPaymentListProps {
  payments: readonly PayrollRecord[];
  getEmployeeName: (employeeId: string) => string;
  canMarkPaid: boolean;
  onMarkPaid: (payment: PayrollRecord) => void;
}

const FixedPaymentList = ({ payments, getEmployeeName, canMarkPaid, onMarkPaid }: FixedPaymentListProps) => {
  const sortedPayments = [...payments].sort((paymentA, paymentB) => paymentB.date.localeCompare(paymentA.date));

  if (sortedPayments.length === 0) {
    return <p className="fpl-empty">No fixed payments yet: they are created on the 15th and the last day of each month.</p>;
  }

  return (
    <section className="fpl-card" aria-label="Fixed payments">
      <div className="fpl-head" aria-hidden="true">
        <span>Pay date</span>
        <span>Employee</span>
        <span>Period</span>
        <span>Amount</span>
        <span>Status</span>
      </div>
      <VirtualItems
        className="fpl-list"
        estimate={56}
        items={sortedPayments}
        renderItem={(payment) => (
          <FixedPaymentRow
            key={payment.id}
            payment={payment}
            employeeName={getEmployeeName(payment.employeeId)}
            canMarkPaid={canMarkPaid}
            onMarkPaid={onMarkPaid}
          />
        )}
      />
    </section>
  );
};

export default FixedPaymentList;
