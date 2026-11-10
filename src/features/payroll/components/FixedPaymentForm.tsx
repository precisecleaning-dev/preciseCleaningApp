// src/features/payroll/components/FixedPaymentForm.tsx
// Modal para corregir el monto de un pago fijo quincenal. El empleado, la fecha
// y la quincena no se cambian (los fija la Cloud Function); el estado tampoco.
import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { PayrollRecord, SystemUser } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import { money } from '../../../utils/jobFinancials';
import { getFixedPayPeriodLabel } from '../fixedPay';
import { parsePositiveNumber } from '../hourlyPay';
import { updateFixedPaymentAmount } from '../services/fixedPaymentService';
import PayrollDialog from './PayrollDialog';
import './FixedPaymentForm.css';

interface FixedPaymentFormProps {
  payment: PayrollRecord;
  employeeName: string;
  currentUser?: SystemUser | null;
  onClose: () => void;
}

const FixedPaymentForm = ({ payment, employeeName, currentUser, onClose }: FixedPaymentFormProps) => {
  const [amountText, setAmountText] = useState(String(payment.totalAmount));
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState('');
  const amount = parsePositiveNumber(amountText);
  const canSave = amount !== null && !isSaving;

  const handleSaveAmount = async () => {
    if (!canSave || amount === null) return;
    setIsSaving(true);
    setErrorText('');
    try {
      await updateFixedPaymentAmount(payment, amount, employeeName, currentUser);
      onClose();
    } catch (error) {
      console.error('Error saving the fixed payment:', error);
      setErrorText('Could not save the payment. Check your connection and try again.');
      setIsSaving(false);
    }
  };

  const footer = (
    <>
      <button type="button" className="pdlg-secondary-btn" disabled={isSaving} onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="btn-primary" disabled={!canSave} onClick={handleSaveAmount}>
        {isSaving ? 'Saving...' : 'Save changes'}
      </button>
    </>
  );

  return (
    <PayrollDialog title="Edit fixed payment" icon={Pencil} onClose={onClose} footer={footer} isBusy={isSaving}>
      <dl className="pdlg-details">
        <div>
          <dt className="pdlg-detail-label">Employee</dt>
          <dd className="pdlg-detail-value">{employeeName}</dd>
        </div>
        <div>
          <dt className="pdlg-detail-label">Pay date</dt>
          <dd className="pdlg-detail-value">{formatDate(payment.date)} · {getFixedPayPeriodLabel(payment.date)}</dd>
        </div>
      </dl>
      <label className="pdlg-field fpf-amount">
        <span className="pdlg-label">Amount</span>
        <input
          className="pdlg-input"
          inputMode="decimal"
          min="0"
          step="0.01"
          type="number"
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
        />
      </label>
      <p className="fpf-hint">
        Only this payment changes ({money(payment.totalAmount)} today). To change the next payments, edit the fixed salary.
      </p>
      {errorText && <p className="pdlg-error" role="alert">{errorText}</p>}
    </PayrollDialog>
  );
};

export default FixedPaymentForm;
