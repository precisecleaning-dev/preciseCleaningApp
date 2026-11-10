// src/features/payroll/components/HourlyPayList.tsx
// Pagos por horas guardados (más reciente primero): fecha, empleado, horas ×
// rate, total, recibo y estado. Arriba, el botón que abre el modal de un pago
// nuevo (onNewPayment). "Mark paid", editar y borrar los resuelve la vista
// (onMarkPaid, onEdit, onDelete); sin onEdit/onDelete no hay columna de acciones.
import { CheckCircle, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
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
  onEdit?: (payment: PayrollRecord) => void;
  onDelete?: (payment: PayrollRecord) => void;
}

const HourlyPayRow = ({ payment, employeeName, canMarkPaid, onMarkPaid, onEdit, onDelete }: HourlyPayRowProps) => {
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
      {(onEdit || onDelete) && (
        <span className="hpl-actions">
          {onEdit && (
            <button type="button" className="hpl-icon-btn" aria-label="Edit payment" title="Edit" onClick={() => onEdit(payment)}>
              <Pencil size={16} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="hpl-icon-btn is-delete"
              aria-label="Delete payment"
              title="Delete"
              onClick={() => onDelete(payment)}
            >
              <Trash2 size={16} />
            </button>
          )}
        </span>
      )}
    </div>
  );
};

interface HourlyPayToolbarProps {
  /** Sin esta función (alcance 'Own') no hay botón de pago nuevo. */
  onNewPayment?: () => void;
}

const HourlyPayToolbar = ({ onNewPayment }: HourlyPayToolbarProps) => (
  <div className="hpl-toolbar">
    <h3 className="hpl-title">Hourly payments</h3>
    {onNewPayment && (
      <button type="button" className="btn-primary" onClick={onNewPayment}>
        <Plus size={16} aria-hidden="true" /> New hourly payment
      </button>
    )}
  </div>
);

interface HourlyPayListProps {
  payments: readonly PayrollRecord[];
  getEmployeeName: (employeeId: string) => string;
  canMarkPaid: boolean;
  onMarkPaid: (payment: PayrollRecord) => void;
  onNewPayment?: () => void;
  onEdit?: (payment: PayrollRecord) => void;
  onDelete?: (payment: PayrollRecord) => void;
}

const HourlyPayList = ({
  payments, getEmployeeName, canMarkPaid, onMarkPaid, onNewPayment, onEdit, onDelete,
}: HourlyPayListProps) => {
  const hasActions = !!(onEdit || onDelete);
  const sortedPayments = [...payments].sort((paymentA, paymentB) => paymentB.date.localeCompare(paymentA.date));

  if (sortedPayments.length === 0) {
    return (
      <>
        <HourlyPayToolbar onNewPayment={onNewPayment} />
        <p className="hpl-empty">No hourly payments yet.</p>
      </>
    );
  }

  return (
    <>
      <HourlyPayToolbar onNewPayment={onNewPayment} />
      <section className={`hpl-card${hasActions ? ' has-actions' : ''}`} aria-label="Hourly payments">
        <div className="hpl-head" aria-hidden="true">
          <span>Pay date</span>
          <span>Employee</span>
          <span>Hours × rate</span>
          <span>Total</span>
          <span>Receipt</span>
          <span>Status</span>
          {hasActions && <span>Actions</span>}
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
              onEdit={onEdit}
              onDelete={onDelete}
            />
          )}
        />
      </section>
    </>
  );
};

export default HourlyPayList;
