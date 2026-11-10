// src/features/payroll/components/FixedPaymentList.tsx
// Pagos fijos quincenales ya creados por la Cloud Function (más reciente
// primero): fecha, empleado, quincena, monto y estado. "Mark paid" y editar los
// resuelve la vista (onMarkPaid, onEdit); sin onEdit no hay columna de acciones.
import { CheckCircle, Pencil } from 'lucide-react';
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
  onEdit?: (payment: PayrollRecord) => void;
}

const FixedPaymentRow = ({ payment, employeeName, canMarkPaid, onMarkPaid, onEdit }: FixedPaymentRowProps) => {
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
      {onEdit && (
        <span className="fpl-actions">
          <button type="button" className="fpl-icon-btn" aria-label="Edit payment" title="Edit" onClick={() => onEdit(payment)}>
            <Pencil size={16} />
          </button>
        </span>
      )}
    </div>
  );
};

interface FixedPaymentListProps {
  payments: readonly PayrollRecord[];
  getEmployeeName: (employeeId: string) => string;
  canMarkPaid: boolean;
  onMarkPaid: (payment: PayrollRecord) => void;
  onEdit?: (payment: PayrollRecord) => void;
}

const FixedPaymentList = ({ payments, getEmployeeName, canMarkPaid, onMarkPaid, onEdit }: FixedPaymentListProps) => {
  const hasActions = !!onEdit;
  const sortedPayments = [...payments].sort((paymentA, paymentB) => paymentB.date.localeCompare(paymentA.date));

  if (sortedPayments.length === 0) {
    return <p className="fpl-empty">No fixed payments yet: they are created on the 15th and the last day of each month.</p>;
  }

  return (
    <section className={`fpl-card${hasActions ? ' has-actions' : ''}`} aria-label="Fixed payments">
      <div className="fpl-head" aria-hidden="true">
        <span>Pay date</span>
        <span>Employee</span>
        <span>Period</span>
        <span>Amount</span>
        <span>Status</span>
        {hasActions && <span>Actions</span>}
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
            onEdit={onEdit}
          />
        )}
      />
    </section>
  );
};

export default FixedPaymentList;
