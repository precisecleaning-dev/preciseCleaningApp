// src/features/payroll/components/HourlyPayList.tsx
// Pagos por horas guardados (más reciente primero): fecha, empleado, horas ×
// rate, total, recibo y estado. Arriba, el botón que abre el modal de un pago
// nuevo (onNewPayment). "Mark paid", editar y borrar los resuelve la vista
// (onMarkPaid, onEdit, onDelete); sin onEdit/onDelete no hay columna de acciones.
// Clic (o Enter) en la fila abre su detalle (onOpenDetail); los botones y el
// enlace del recibo no lo abren.
import { CheckCircle, RotateCcw, FileText, Pencil, Trash2 } from 'lucide-react';
import type { PayrollRecord } from '../../../types/index';
import VirtualItems from '../../../shared/components/VirtualItems';
import { formatDate } from '../../../utils/dateFormat';
import { money } from '../../../utils/jobFinancials';
import { PayrollTableRow, PayrollTableSkeleton, PayrollTableToolbar } from './PayrollTable';
import './HourlyPayList.css';

interface HourlyPayRowProps {
  payment: PayrollRecord;
  employeeName: string;
  canMarkPaid: boolean;
  onMarkPaid: (payment: PayrollRecord) => void;
  onMarkPending: (payment: PayrollRecord) => void;
  onEdit?: (payment: PayrollRecord) => void;
  onDelete?: (payment: PayrollRecord) => void;
  onOpenDetail: (payment: PayrollRecord) => void;
}

const HourlyPayRow = ({
  payment, employeeName, canMarkPaid, onMarkPaid, onMarkPending, onEdit, onDelete, onOpenDetail,
}: HourlyPayRowProps) => {
  const isPaid = payment.status === 'Paid';
  const hoursText = `${payment.hours ?? 0} h × ${money(payment.hourlyRate ?? 0)}`;
  const statusText = isPaid ? `Paid ${formatDate(payment.paidAt)}` : 'Pending';

  return (
    <PayrollTableRow label={`View hourly payment of ${employeeName}`} onOpen={() => onOpenDetail(payment)}>
      <span>{formatDate(payment.date)}</span>
      <span className="ptbl-name">{employeeName}</span>
      <span>{hoursText}</span>
      <strong className="ptbl-amount">{money(payment.totalAmount)}</strong>
      <span>
        {payment.receiptUrl && (
          <a className="hpl-receipt-link" href={payment.receiptUrl} rel="noopener noreferrer" target="_blank">
            <FileText size={14} aria-hidden="true" /> Receipt
          </a>
        )}
      </span>
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

interface HourlyPayListProps {
  payments: readonly PayrollRecord[];
  /** Mientras carga la nómina se muestra un esqueleto, no "No hourly payments yet". */
  isLoading: boolean;
  getEmployeeName: (employeeId: string) => string;
  canMarkPaid: boolean;
  onMarkPaid: (payment: PayrollRecord) => void;
  onMarkPending: (payment: PayrollRecord) => void;
  /** Sin esta función (alcance 'Own') no hay botón de pago nuevo. */
  onNewPayment?: () => void;
  onEdit?: (payment: PayrollRecord) => void;
  onDelete?: (payment: PayrollRecord) => void;
  onOpenDetail: (payment: PayrollRecord) => void;
}

const HourlyPayList = ({
  payments, isLoading, getEmployeeName, canMarkPaid, onMarkPaid, onMarkPending, onNewPayment, onEdit, onDelete, onOpenDetail,
}: HourlyPayListProps) => {
  const hasActions = !!(onEdit || onDelete);
  const sortedPayments = [...payments].sort((paymentA, paymentB) => paymentB.date.localeCompare(paymentA.date));
  const toolbar = <PayrollTableToolbar title="Hourly payments" actionText="New hourly payment" onAction={onNewPayment} />;

  if (isLoading) {
    return (
      <>
        {toolbar}
        <PayrollTableSkeleton />
      </>
    );
  }

  if (sortedPayments.length === 0) {
    return (
      <>
        {toolbar}
        <p className="ptbl-empty">No hourly payments yet.</p>
      </>
    );
  }

  return (
    <>
      {toolbar}
      <section className={`hpl-card ptbl-card${hasActions ? ' has-actions' : ''}`} aria-label="Hourly payments">
        <div className="ptbl-head" aria-hidden="true">
          <span>Pay date</span>
          <span>Employee</span>
          <span>Hours × rate</span>
          <span>Total</span>
          <span>Receipt</span>
          <span>Status</span>
          {hasActions && <span>Actions</span>}
        </div>
        <VirtualItems
          estimate={56}
          items={sortedPayments}
          renderItem={(payment) => (
            <HourlyPayRow
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
    </>
  );
};

export default HourlyPayList;
