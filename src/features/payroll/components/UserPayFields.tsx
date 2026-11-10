// src/features/payroll/components/UserPayFields.tsx
// Campos de pago del modal de System Users: tipo de pago (por casa, por hora o
// fijo) y, según el tipo, el rate por hora o el sueldo mensual. Solo los cambia
// quien puede administrar pagos (canManagePay); los demás ven el tipo, no el monto.
import { Wallet } from 'lucide-react';
import type { EmployeePayType } from '../../../types/index';
import { PAY_TYPE_OPTIONS } from '../employeePay';
import './UserPayFields.css';

interface UserPayFieldsProps {
  payType: EmployeePayType;
  onPayTypeChange: (payType: EmployeePayType) => void;
  amountText: string;
  onAmountChange: (amountText: string) => void;
  canManagePay: boolean;
}

const AMOUNT_LABELS: Record<EmployeePayType, string> = {
  perHouse: '',
  hourly: 'Rate ($/hour)',
  fixed: 'Monthly salary',
};

const UserPayFields = ({ payType, onPayTypeChange, amountText, onAmountChange, canManagePay }: UserPayFieldsProps) => {
  const amountLabel = AMOUNT_LABELS[payType];

  return (
    <div className="upf-row">
      <label className="upf-field">
        <span className="upf-label">Pay type</span>
        <span className="upf-input-wrap">
          <Wallet size={16} className="upf-icon" aria-hidden="true" />
          <select
            className="upf-input with-icon"
            disabled={!canManagePay}
            value={payType}
            onChange={(event) => onPayTypeChange(event.target.value as EmployeePayType)}
          >
            {PAY_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </span>
      </label>
      {amountLabel && canManagePay && (
        <label className="upf-field">
          <span className="upf-label">{amountLabel}</span>
          <input
            className="upf-input"
            inputMode="decimal"
            min="0"
            step="0.01"
            type="number"
            value={amountText}
            onChange={(event) => onAmountChange(event.target.value)}
          />
        </label>
      )}
      {!canManagePay && <p className="upf-hint">Only Payroll can change the pay type and amounts.</p>}
      {canManagePay && payType === 'fixed' && (
        <p className="upf-hint">Paid on the 15th and the last day of each month (Payroll → Fixed pay).</p>
      )}
    </div>
  );
};

export default UserPayFields;
