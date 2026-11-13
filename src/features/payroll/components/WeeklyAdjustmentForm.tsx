// src/features/payroll/components/WeeklyAdjustmentForm.tsx
// Modal del bono y el descuento de un empleado en la nómina semanal por casa.
// Propone lo que ya tiene sin pagar en la semana; al guardar queda UN solo
// ajuste (ver saveWeekAdjustment). Los ajustes ya pagados no cambian.
import { useState } from 'react';
import { BadgePercent } from 'lucide-react';
import type { SystemUser } from '../../../types/index';
import { formatDateRange } from '../../../utils/dateFormat';
import { getPayrollTotal, money, roundToCents } from '../../../utils/jobFinancials';
import { getUnpaidRecords, getWeekDays, parseOptionalAmount, type WeeklyPayrollRow } from '../weeklyPayroll';
import { saveWeekAdjustment } from '../services/weeklyPayrollService';
import PayrollDialog from './PayrollDialog';
import './WeeklyPayrollTable.css';

const joinNotes = (notes: Array<string | undefined>) => notes.filter(Boolean).join(' · ');

interface WeeklyAdjustmentFormProps {
  row: WeeklyPayrollRow;
  employeeName: string;
  /** Lunes de la semana, AAAA-MM-DD. */
  weekStart: string;
  currentUser?: SystemUser | null;
  onClose: () => void;
}

const WeeklyAdjustmentForm = ({ row, employeeName, weekStart, currentUser, onClose }: WeeklyAdjustmentFormProps) => {
  const unpaidAdjustments = getUnpaidRecords(row).filter((record) => !record.propertyId);
  const paidAdjustmentsTotal = row.records
    .filter((record) => !record.propertyId && record.status === 'Paid')
    .reduce((sum, record) => sum + getPayrollTotal(record), 0);
  const [bonusText, setBonusText] = useState(() => {
    const bonus = unpaidAdjustments.reduce((sum, record) => sum + Number(record.extraAmount || 0), 0);
    return bonus ? String(roundToCents(bonus)) : '';
  });
  const [bonusNote, setBonusNote] = useState(() => joinNotes(unpaidAdjustments.map((record) => record.extraNote)));
  const [discountText, setDiscountText] = useState(() => {
    const discount = unpaidAdjustments.reduce((sum, record) => sum + Number(record.discountAmount || 0), 0);
    return discount ? String(roundToCents(discount)) : '';
  });
  const [discountNote, setDiscountNote] = useState(() => joinNotes(unpaidAdjustments.map((record) => record.discountNote)));
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState('');

  const bonus = parseOptionalAmount(bonusText);
  const discount = parseOptionalAmount(discountText);
  const weekDays = getWeekDays(weekStart);
  const newTotal = bonus !== null && discount !== null
    ? roundToCents(row.housesTotal + paidAdjustmentsTotal + bonus - discount)
    : null;
  const canSave = bonus !== null && discount !== null && !isSaving;

  const handleSaveAdjustment = async () => {
    if (!canSave || bonus === null || discount === null) return;
    setIsSaving(true);
    setErrorText('');
    try {
      await saveWeekAdjustment(
        { employeeId: row.employeeId, employeeName, weekStart, bonus, bonusNote: bonusNote.trim(), discount, discountNote: discountNote.trim() },
        unpaidAdjustments,
        currentUser,
      );
      onClose();
    } catch (error) {
      console.error('Error saving the bonus / discount:', error);
      setErrorText('Could not save the bonus / discount. Check your connection and try again.');
      setIsSaving(false);
    }
  };

  const footer = (
    <>
      <button type="button" className="pdlg-secondary-btn" disabled={isSaving} onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="btn-primary" disabled={!canSave} onClick={handleSaveAdjustment}>
        {isSaving ? 'Saving...' : 'Save'}
      </button>
    </>
  );

  return (
    <PayrollDialog title="Bonus / discount" icon={BadgePercent} onClose={onClose} footer={footer} isBusy={isSaving}>
      <dl className="pdlg-details">
        <div>
          <dt className="pdlg-detail-label">Employee</dt>
          <dd className="pdlg-detail-value">{employeeName}</dd>
        </div>
        <div>
          <dt className="pdlg-detail-label">Week</dt>
          <dd className="pdlg-detail-value">{formatDateRange(weekDays[0], weekDays[6])}</dd>
        </div>
      </dl>
      <div className="pdlg-grid wpt-dialog-list">
        <label className="pdlg-field">
          <span className="pdlg-label">Bonus</span>
          <input
            className="pdlg-input"
            inputMode="decimal"
            min="0"
            step="0.01"
            type="number"
            placeholder="0.00"
            value={bonusText}
            onChange={(event) => setBonusText(event.target.value)}
          />
        </label>
        <label className="pdlg-field">
          <span className="pdlg-label">Bonus note</span>
          <input className="pdlg-input" value={bonusNote} onChange={(event) => setBonusNote(event.target.value)} />
        </label>
        <label className="pdlg-field">
          <span className="pdlg-label">Discount</span>
          <input
            className="pdlg-input"
            inputMode="decimal"
            min="0"
            step="0.01"
            type="number"
            placeholder="0.00"
            value={discountText}
            onChange={(event) => setDiscountText(event.target.value)}
          />
        </label>
        <label className="pdlg-field">
          <span className="pdlg-label">Discount note</span>
          <input className="pdlg-input" value={discountNote} onChange={(event) => setDiscountNote(event.target.value)} />
        </label>
      </div>
      {newTotal === null
        ? <p className="pdlg-error" role="alert">Bonus and discount must be 0 or more.</p>
        : <p className="pdlg-note">Houses {money(row.housesTotal)} · Week total {money(newTotal)}</p>}
      {errorText && <p className="pdlg-error" role="alert">{errorText}</p>}
    </PayrollDialog>
  );
};

export default WeeklyAdjustmentForm;
