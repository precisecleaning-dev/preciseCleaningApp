// src/features/payroll/components/HourlyPayList.tsx
// Pagos por horas guardados (más reciente primero): fecha, empleado, horas ×
// rate, total, recibo y estado. "Mark paid" lo resuelve la vista (onMarkPaid).
import { CheckCircle, FileText } from 'lucide-react';
import type { PayrollRecord } from '../../../types/index';
import VirtualItems from '../../../shared/components/VirtualItems';
import { formatDate } from '../../../utils/dateFormat';
import { money } from '../../../utils/jobFinancials';
import './HourlyPayList.css';

interface HourlyPayRowProps {
  payment: PayrollRecord;
  employeeName: string;
  canMarkPaid: boolean;
  onMarkPaid: (payment: PayrollRecord) => void;
}

const HourlyPayRow = ({ payment, employeeName, canMarkPaid, onMarkPaid }: HourlyPayRowProps) => {
  const isPaid = payment.status === 'Paid';
  const hoursText = `${payment.hours ?? 0} h × ${money(payment.hourlyRate ?? 0)}`;
  const statusText = isPaid ? `Paid ${formatDate(payment.paidAt)}` : 'Pending';

  return (
    <div className="hpl-row">
      <span className="hpl-date">{formatDate(payment.date)}</span>
      <span className="hpl-employee">{employeeName}</span>
      <span className="hpl-hours">{hoursText}</span>
      <strong className="hpl-total">{money(payment.totalAmount)}</strong>
      <span className="hpl-receipt">
        {payment.receiptUrl && (
          <a className="hpl-receipt-link" href={payment.receiptUrl} rel="noopener noreferrer" target="_blank">
            <FileText size={14} aria-hidden="true" /> Receipt
          </a>
        )}
      </span>
      <span className="hpl-status">
        <span className={`hpl-badge${isPaid ? ' is-paid' : ''}`}>{statusText}</span>
        {canMarkPaid && !isPaid && (
          <button type="button" className="hpl-paid-btn" onClick={() => onMarkPaid(payment)}>
            <CheckCircle size={14} aria-hidden="true" /> Mark paid
          </button>
        )}
      </span>
    </div>
  );
};

interface HourlyPayListProps {
  payments: readonly PayrollRecord[];
  getEmployeeName: (employeeId: string) => string;
  canMarkPaid: boolean;
  onMarkPaid: (payment: PayrollRecord) => void;
}

const HourlyPayList = ({ payments, getEmployeeName, canMarkPaid, onMarkPaid }: HourlyPayListProps) => {
  const sortedPayments = [...payments].sort((paymentA, paymentB) => paymentB.date.localeCompare(paymentA.date));

  if (sortedPayments.length === 0) {
    return <p className="hpl-empty">No hourly payments yet.</p>;
  }

  return (
    <section className="hpl-card" aria-label="Hourly payments">
      <div className="hpl-head" aria-hidden="true">
        <span>Pay date</span>
        <span>Employee</span>
        <span>Hours × rate</span>
        <span>Total</span>
        <span>Receipt</span>
        <span>Status</span>
      </div>
      <VirtualItems
        className="hpl-list"
        estimate={56}
        items={sortedPayments}
        renderItem={(payment) => (
          <HourlyPayRow
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

export default HourlyPayList;
