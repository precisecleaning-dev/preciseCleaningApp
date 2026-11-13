// src/features/payroll/components/WeeklyPayrollTable.tsx
// Nómina de una semana (pestaña Nóminas de Payroll), pensada para marcar rápido.
// Arriba, el resumen: día de pago, total, pendiente y pagado, más "Pay week" /
// "Mark week pending". Abajo, una fila por empleado (A-Z, sin separar en
// grupos: la fila no se mueve al marcarla) con las columnas que pidió Omar:
// Employee | Total | Payment ("Not sent" / "Sent"; en verde cuando se envió).
// Clic (o Enter) en la fila abre su detalle (día por día, casas, bono /
// descuento); los botones de la fila no lo abren. Datos: weeklyPayroll.ts.
import { useState } from 'react';
import { Check, CheckCircle, RotateCcw } from 'lucide-react';
import { formatDate, todayIso } from '../../../utils/dateFormat';
import { money, roundToCents } from '../../../utils/jobFinancials';
import {
  getUnpaidTotal, getWeekBatchId, getWeekPayDay, type WeeklyPayrollRow,
} from '../weeklyPayroll';
import { PayrollTableRow, PayrollTableSkeleton } from './PayrollTable';
import './WeeklyPayrollTable.css';

const sumBy = (rows: readonly WeeklyPayrollRow[], pick: (row: WeeklyPayrollRow) => number) =>
  roundToCents(rows.reduce((sum, row) => sum + pick(row), 0));

const countHouses = (row: WeeklyPayrollRow) => row.records.filter((record) => record.propertyId).length;
const countDaysWorked = (row: WeeklyPayrollRow) => row.dayTotals.filter((amount) => amount > 0).length;

/** Iniciales para el círculo del empleado ("Julissa Carolina Quiroz" → "JQ"). */
const getInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return `${words[0][0]}${words.length > 1 ? words[words.length - 1][0] : ''}`.toUpperCase();
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

const EmployeeCell = ({ row, employeeName }: { row: WeeklyPayrollRow; employeeName: string }) => (
  <span className="wpt-employee">
    <span className={`wpt-avatar${row.isPaid ? ' is-paid' : ''}`} aria-hidden="true">{getInitials(employeeName)}</span>
    <span className="wpt-employee-text">
      <span className="ptbl-name">{employeeName}</span>
      <span className="wpt-employee-meta">{plural(countHouses(row), 'house')} · {plural(countDaysWorked(row), 'day')}</span>
    </span>
  </span>
);

/** Total de la semana y, si tiene, su bono / descuento debajo. */
const TotalCell = ({ row }: { row: WeeklyPayrollRow }) => (
  <span className="wpt-total">
    <strong className="ptbl-amount">{money(row.total)}</strong>
    {row.bonus > 0 && <span className="wpt-bonus">+{money(row.bonus)} bonus</span>}
    {row.discount > 0 && <span className="wpt-discount">−{money(row.discount)} discount</span>}
  </span>
);

interface PaymentCellProps {
  row: WeeklyPayrollRow;
  employeeName: string;
  weekStart: string;
  /** Sin esta función (sin permiso de editar) solo se ve el estado. */
  onSetSent?: (row: WeeklyPayrollRow, isSent: boolean) => Promise<void>;
}

/** "Not sent" / "Sent": un toque marca el pago del empleado (Sent queda en verde) o lo regresa. */
const PaymentCell = ({ row, employeeName, weekStart, onSetSent }: PaymentCellProps) => {
  const [isSaving, setIsSaving] = useState(false);
  // Solo se regresa lo pagado desde esta pestaña; lo de "Pagar seleccionadas" no.
  const canUndo = row.records.some((record) => record.status === 'Paid' && record.batchId === getWeekBatchId(weekStart));

  if (!onSetSent) {
    return <span className={`ptbl-badge${row.isPaid ? ' is-paid' : ''}`}>{row.isPaid ? 'Sent' : 'Not sent'}</span>;
  }

  const handleChoose = async (isSent: boolean) => {
    if (isSent === row.isPaid || isSaving) return;
    setIsSaving(true);
    try {
      await onSetSent(row, isSent);
    } catch (error) {
      console.error('Error saving the payment status:', error);
      alert('Could not save the payment. Check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <span className={`wpt-payment${isSaving ? ' is-saving' : ''}`} role="group" aria-label={`Payment of ${employeeName}`}>
      <button
        type="button"
        className={`wpt-payment-btn${row.isPaid ? '' : ' is-selected'}`}
        aria-pressed={!row.isPaid}
        disabled={isSaving || (row.isPaid && !canUndo)}
        title={row.isPaid && !canUndo ? 'Paid with "Pagar seleccionadas"' : 'Not sent'}
        onClick={() => handleChoose(false)}
      >
        Not sent
      </button>
      <button
        type="button"
        className={`wpt-payment-btn is-sent${row.isPaid ? ' is-selected' : ''}`}
        aria-pressed={row.isPaid}
        disabled={isSaving}
        title={row.isPaid ? 'Sent' : `Mark ${money(getUnpaidTotal(row))} as sent today`}
        onClick={() => handleChoose(true)}
      >
        {row.isPaid && <Check size={14} aria-hidden="true" />} Sent
      </button>
    </span>
  );
};

interface SummaryItemProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'pending' | 'paid';
}

const SummaryItem = ({ label, value, hint, tone }: SummaryItemProps) => (
  <div className={`wpt-kpi${tone ? ` is-${tone}` : ''}`}>
    <span className="wpt-kpi-label">{label}</span>
    <strong className="wpt-kpi-value">{value}</strong>
    {hint && <span className="wpt-kpi-hint">{hint}</span>}
  </div>
);

interface WeeklyPayrollTableProps {
  /** Filas ya ordenadas por la vista (A-Z). */
  rows: readonly WeeklyPayrollRow[];
  /** Lunes de la semana, AAAA-MM-DD. */
  weekStart: string;
  isLoading: boolean;
  isBusy: boolean;
  getEmployeeName: (employeeId: string) => string;
  onOpenDetail: (row: WeeklyPayrollRow) => void;
  /** Sin estas funciones (sin permiso de editar) no hay botones. */
  onSetSent?: (row: WeeklyPayrollRow, isSent: boolean) => Promise<void>;
  onPayWeek?: () => void;
  onMarkWeekPending?: () => void;
}

const WeeklyPayrollTable = ({
  rows, weekStart, isLoading, isBusy, getEmployeeName, onOpenDetail, onSetSent, onPayWeek, onMarkWeekPending,
}: WeeklyPayrollTableProps) => {
  const today = todayIso();
  const payDay = getWeekPayDay(weekStart);
  const pendingRows = rows.filter((row) => !row.isPaid);
  const weekTotal = sumBy(rows, (row) => row.total);
  const unpaidTotal = sumBy(pendingRows, getUnpaidTotal);
  const isWeekPaid = rows.length > 0 && pendingRows.length === 0;
  const houseCount = rows.reduce((sum, row) => sum + countHouses(row), 0);
  const sentCount = rows.length - pendingRows.length;

  if (isLoading) return <PayrollTableSkeleton />;

  const getPayDayHint = () => {
    if (isWeekPaid) return 'Paid';
    if (payDay === today) return 'Today';
    return payDay < today ? 'Overdue' : 'Upcoming';
  };

  return (
    <>
      <section className="wpt-summary" aria-label="Week summary">
        <div className="wpt-kpis">
          <SummaryItem label="Pay day" value={`Wed ${formatDate(payDay)}`} hint={getPayDayHint()} />
          <SummaryItem label="Week total" value={money(weekTotal)} hint={`${plural(rows.length, 'employee')} · ${plural(houseCount, 'house')}`} />
          <SummaryItem label="Pending" value={money(unpaidTotal)} hint={`${pendingRows.length} not sent`} tone="pending" />
          <SummaryItem label="Paid" value={money(roundToCents(weekTotal - unpaidTotal))} hint={`${sentCount} sent`} tone="paid" />
        </div>
        <div className="wpt-summary-actions">
          {onMarkWeekPending && (
            <button type="button" className="ptbl-pending-btn" disabled={isBusy} onClick={onMarkWeekPending}>
              <RotateCcw size={14} aria-hidden="true" /> Mark week pending
            </button>
          )}
          {onPayWeek && pendingRows.length > 0 && (
            <button type="button" className="btn-primary" disabled={isBusy} onClick={onPayWeek}>
              <CheckCircle size={16} aria-hidden="true" /> Pay week · {money(unpaidTotal)}
            </button>
          )}
          {isWeekPaid && <span className="ptbl-badge is-paid">Week paid</span>}
        </div>
      </section>

      {rows.length === 0 ? (
        <p className="ptbl-empty">No house payments in this week.</p>
      ) : (
        <section className="wpt-card ptbl-card" aria-label="Weekly payroll">
          <div className="ptbl-head" aria-hidden="true">
            <span>Employee</span>
            <span className="wpt-num">Total</span>
            <span>Payment</span>
          </div>
          <ul className="ptbl-list">
            {rows.map((row) => {
              const employeeName = getEmployeeName(row.employeeId);
              return (
                <PayrollTableRow key={row.employeeId} as="li" label={`View payroll of ${employeeName}`} onOpen={() => onOpenDetail(row)}>
                  <EmployeeCell row={row} employeeName={employeeName} />
                  <TotalCell row={row} />
                  <PaymentCell row={row} employeeName={employeeName} weekStart={weekStart} onSetSent={onSetSent} />
                </PayrollTableRow>
              );
            })}
          </ul>
          <div className="ptbl-head wpt-totals" aria-label="Week total">
            <span>Total</span>
            <strong className="wpt-num">{money(weekTotal)}</strong>
            <span className="wpt-totals-sent">{sentCount} / {rows.length} sent</span>
          </div>
        </section>
      )}
    </>
  );
};

export default WeeklyPayrollTable;
