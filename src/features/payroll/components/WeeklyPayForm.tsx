// src/features/payroll/components/WeeklyPayForm.tsx
// Modal de pago de la nómina semanal por casa: "Pay week" paga de una vez lo
// que falta de la semana a todos los empleados; el botón "Pay" de una fila (o
// del detalle) abre este mismo modal con un solo empleado. Propone el día de
// pago (miércoles siguiente) y muestra cuánto se le paga a cada uno.
import { useState } from 'react';
import { CheckCircle } from 'lucide-react';
import type { SystemUser } from '../../../types/index';
import DateInput from '../../../shared/components/DateInput';
import { formatDateRange } from '../../../utils/dateFormat';
import { money, roundToCents } from '../../../utils/jobFinancials';
import { getUnpaidRecords, getUnpaidTotal, getWeekDays, getWeekPayDay, type WeeklyPayrollRow } from '../weeklyPayroll';
import { payWeek } from '../services/weeklyPayrollService';
import PayrollDialog from './PayrollDialog';
import './WeeklyPayrollTable.css';

interface WeeklyPayFormProps {
  /** Lunes de la semana, AAAA-MM-DD. */
  weekStart: string;
  /** Filas con algo sin pagar: todas (Pay week) o la de un empleado. */
  pendingRows: readonly WeeklyPayrollRow[];
  /** true = pago de un solo empleado (botón de su fila). */
  isSingleEmployee?: boolean;
  getEmployeeName: (employeeId: string) => string;
  currentUser?: SystemUser | null;
  onClose: () => void;
}

const WeeklyPayForm = ({ weekStart, pendingRows, isSingleEmployee = false, getEmployeeName, currentUser, onClose }: WeeklyPayFormProps) => {
  const [paymentDate, setPaymentDate] = useState(() => getWeekPayDay(weekStart));
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState('');
  const weekDays = getWeekDays(weekStart);
  const unpaidTotal = roundToCents(pendingRows.reduce((sum, row) => sum + getUnpaidTotal(row), 0));
  const canSave = !!paymentDate && pendingRows.length > 0 && !isSaving;
  const employeeName = isSingleEmployee && pendingRows[0] ? getEmployeeName(pendingRows[0].employeeId) : '';

  const handlePayWeek = async () => {
    if (!canSave) return;
    setIsSaving(true);
    setErrorText('');
    try {
      await payWeek(pendingRows.flatMap(getUnpaidRecords), weekStart, paymentDate, currentUser, employeeName || undefined);
      onClose();
    } catch (error) {
      console.error('Error paying the weekly payroll:', error);
      setErrorText('Could not save the payment. Check your connection and try again.');
      setIsSaving(false);
    }
  };

  const footer = (
    <>
      <button type="button" className="pdlg-secondary-btn" disabled={isSaving} onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="btn-primary" disabled={!canSave} onClick={handlePayWeek}>
        {isSaving ? 'Saving...' : `Pay ${money(unpaidTotal)}`}
      </button>
    </>
  );

  return (
    <PayrollDialog title={employeeName ? `Pay ${employeeName}` : 'Pay week'} icon={CheckCircle} onClose={onClose} footer={footer} isBusy={isSaving}>
      <div className="pdlg-grid">
        <div className="pdlg-field">
          <span className="pdlg-label">Week</span>
          <p className="pdlg-detail-value">{formatDateRange(weekDays[0], weekDays[6])}</p>
        </div>
        <label className="pdlg-field">
          <span className="pdlg-label">Paid on</span>
          <DateInput className="pdlg-input" value={paymentDate} onChange={setPaymentDate} aria-label="Paid on" />
        </label>
      </div>
      <dl className="pdlg-details wpt-dialog-list">
        {pendingRows.map((row) => (
          <div key={row.employeeId}>
            <dt className="pdlg-detail-label">{getEmployeeName(row.employeeId)}</dt>
            <dd className="pdlg-detail-value">{money(getUnpaidTotal(row))}</dd>
          </div>
        ))}
      </dl>
      <p className="pdlg-note">
        {employeeName
          ? `Everything not paid yet for ${employeeName} in this week is marked as paid.`
          : `${pendingRows.length} employee(s) · Total ${money(unpaidTotal)}. Everything not paid yet in this week is marked as paid.`}
      </p>
      {errorText && <p className="pdlg-error" role="alert">{errorText}</p>}
    </PayrollDialog>
  );
};

export default WeeklyPayForm;
