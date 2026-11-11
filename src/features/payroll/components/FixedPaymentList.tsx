// src/features/payroll/components/FixedPaymentList.tsx
// Pagos fijos quincenales ya creados por la Cloud Function (más reciente
// primero): fecha, empleado, quincena, monto y estado. "Mark paid", editar y
// borrar los resuelve la vista (onMarkPaid, onEdit, onDelete); sin onEdit ni
// onDelete no hay columna de acciones. Clic (o Enter) en la fila abre su detalle
// (onOpenDetail); los botones de la fila no lo abren.
import { CheckCircle, RotateCcw, Pencil, Trash2 } from 'lucide-react';
import type { PayrollRecord } from '../../../types/index';
import VirtualItems from '../../../shared/components/VirtualItems';
import { formatDate } from '../../../utils/dateFormat';
import { money } from '../../../utils/jobFinancials';
import { getFixedPayPeriodLabel } from '../fixedPay';
import { PayrollTableRow, PayrollTableSkeleton } from './PayrollTable';
import './FixedPaymentList.css';

interface FixedPaymentRowProps {
  payment: PayrollRecord;
  employeeName: string;
  canMarkPaid: boolean;
  onMarkPaid: (payment: PayrollRecord) => void;
  onMarkPending: (payment: PayrollRecord) => void;
  onEdit?: (payment: PayrollRecord) => void;
  onDelete?: (payment: PayrollRecord) => void;
  onOpenDetail: (payment: PayrollRecord) => void;
}

const FixedPaymentRow = ({
  payment, employeeName, canMarkPaid, onMarkPaid, onMarkPending, onEdit, onDelete, onOpenDetail,
}: FixedPaymentRowProps) => {
  const isPaid = payment.status === 'Paid';
  const statusText = isPaid ? `Paid ${formatDate(payment.paidAt)}` : 'Pending';

  return (
    <PayrollTableRow label={`View fixed payment of ${employeeName}`} onOpen={() => onOpenDetail(payment)}>
      <span>{formatDate(payment.date)}</span>
      <span className="ptbl-name">{employeeName}</span>
      <span>{getFixedPayPeriodLabel(payment.date)}</span>
      <strong className="ptbl-amount">{money(payment.totalAmount)}</strong>
      <span className="ptbl-status">
        <span className={`ptbl-badge${isPaid ? ' is-paid' : ''}`}>{statusText}</span>
        {canMarkPaid && !isPaid && (
          <button type="button" className="ptbl-paid-btn" onClick={() => onMarkPaid(payment)}>
            <CheckCircle size={14} aria-hidden="true" /> Mark paid
          </button>
        )}
        {canMarkPaid && isPaid && (
          <button type="button" className="ptbl-pending-btn" onClick={() => onMarkPending(payment)}>
            <RotateCcw size={14} aria-hidden="true" /> Mark pending
          </button>
        )}
      </span>
      {(onEdit || onDelete) && (
        <span className="ptbl-actions">
          {onEdit && (
            <button type="button" className="ptbl-icon-btn" aria-label="Edit payment" title="Edit" onClick={() => onEdit(payment)}>
              <Pencil size={16} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="ptbl-icon-btn is-delete"
              aria-label="Delete payment"
              title="Delete"
              onClick={() => onDelete(payment)}
            >
              <Trash2 size={16} />
            </button>
          )}
        </span>
      )}
    </PayrollTableRow>
  );
};

interface FixedPaymentListProps {
  payments: readonly PayrollRecord[];
  /** Mientras carga la nómina se muestra un esqueleto, no "No fixed payments yet". */
  isLoading: boolean;
  getEmployeeName: (employeeId: string) => string;
  canMarkPaid: boolean;
  onMarkPaid: (payment: PayrollRecord) => void;
  onMarkPending: (payment: PayrollRecord) => void;
  onEdit?: (payment: PayrollRecord) => void;
  onDelete?: (payment: PayrollRecord) => void;
  onOpenDetail: (payment: PayrollRecord) => void;
}

const FixedPaymentList = ({
  payments, isLoading, getEmployeeName, canMarkPaid, onMarkPaid, onMarkPending, onEdit, onDelete, onOpenDetail,
}: FixedPaymentListProps) => {
  const hasActions = !!(onEdit || onDelete);
  const sortedPayments = [...payments].sort((paymentA, paymentB) => paymentB.date.localeCompare(paymentA.date));

  if (isLoading) return <PayrollTableSkeleton />;

  if (sortedPayments.length === 0) {
    return <p className="ptbl-empty">No fixed payments yet: they are created on the 15th and the last day of each month.</p>;
  }

  return (
    <section className={`fpl-card ptbl-card${hasActions ? ' has-actions' : ''}`} aria-label="Fixed payments">
      <div className="ptbl-head" aria-hidden="true">
        <span>Pay date</span>
        <span>Employee</span>
        <span>Period</span>
        <span>Amount</span>
        <span>Status</span>
        {hasActions && <span>Actions</span>}
      </div>
      <VirtualItems
        estimate={56}
        items={sortedPayments}
        renderItem={(payment) => (
          <FixedPaymentRow
            key={payment.id}
            payment={payment}
            employeeName={getEmployeeName(payment.employeeId)}
            canMarkPaid={canMarkPaid}
            onMarkPaid={onMarkPaid}
            onMarkPending={onMarkPending}
            onEdit={onEdit}
            onDelete={onDelete}
            onOpenDetail={onOpenDetail}
          />
        )}
      />
    </section>
  );
};

export default FixedPaymentList;
