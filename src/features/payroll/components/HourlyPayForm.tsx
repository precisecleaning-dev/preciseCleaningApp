// src/features/payroll/components/HourlyPayForm.tsx
// Captura de un pago por horas: empleado (de System Users), fecha de pago,
// horas trabajadas y rate; el total (horas × rate) se calcula solo. El recibo
// de pago se sube como comprobante (las horas se escriben a mano).
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Clock, Paperclip, User, X } from 'lucide-react';
import type { PayrollRecord, SystemUser } from '../../../types/index';
import CustomSelect from '../../../components/CustomSelect';
import DateInput from '../../../shared/components/DateInput';
import { todayIso } from '../../../utils/dateFormat';
import { fullName } from '../../../utils/homeData';
import { money } from '../../../utils/jobFinancials';
import { calcHourlyTotal, getLastHourlyRate, parsePositiveNumber } from '../hourlyPay';
import { createHourlyPayment } from '../services/hourlyPayService';
import './HourlyPayForm.css';

interface FormMessage {
  tone: 'error' | 'success';
  text: string;
}

interface HourlyPayFormProps {
  employees: readonly SystemUser[];
  /** Pagos ya guardados: de ahí sale el último rate de cada empleado. */
  payrollRecords: readonly PayrollRecord[];
  currentUser?: SystemUser | null;
}

const HourlyPayForm = ({ employees, payrollRecords, currentUser }: HourlyPayFormProps) => {
  const [employeeId, setEmployeeId] = useState('');
  const [payDate, setPayDate] = useState(todayIso);
  const [hoursText, setHoursText] = useState('');
  const [rateText, setRateText] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<FormMessage | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const employeeOptions = useMemo(
    () => employees
      .filter((employee) => employee.status !== 'Inactive')
      .map((employee) => ({ id: employee.id, name: fullName(employee) }))
      .sort((optionA, optionB) => optionA.name.localeCompare(optionB.name)),
    [employees],
  );
  const employeeName = employeeOptions.find((option) => option.id === employeeId)?.name ?? '';
  const hours = parsePositiveNumber(hoursText);
  const hourlyRate = parsePositiveNumber(rateText);
  const totalText = hours !== null && hourlyRate !== null ? money(calcHourlyTotal(hours, hourlyRate)) : '—';
  const canSave = !!employeeId && !!payDate && hours !== null && hourlyRate !== null && !isSaving;
  const receiptButtonText = receiptFile ? receiptFile.name : 'Attach pay receipt';

  // Al elegir empleado se propone su último rate (se puede cambiar).
  const handleEmployeeChange = (nextEmployeeId: string) => {
    setEmployeeId(nextEmployeeId);
    const lastRate = getLastHourlyRate(payrollRecords, nextEmployeeId);
    setRateText(lastRate === null ? '' : String(lastRate));
    setMessage(null);
  };

  const handleReceiptChange = (event: ChangeEvent<HTMLInputElement>) => {
    setReceiptFile(event.target.files?.[0] ?? null);
  };

  const handleRemoveReceipt = () => {
    setReceiptFile(null);
    if (receiptInputRef.current) receiptInputRef.current.value = '';
  };

  const handleSavePayment = async () => {
    if (!canSave || hours === null || hourlyRate === null) return;
    setIsSaving(true);
    setMessage(null);
    try {
      await createHourlyPayment({ employeeId, employeeName, date: payDate, hours, hourlyRate, receiptFile }, currentUser);
      setHoursText('');
      handleRemoveReceipt();
      setMessage({ tone: 'success', text: `Hourly payment saved for ${employeeName}.` });
    } catch (error) {
      console.error('Error saving the hourly payment:', error);
      setMessage({ tone: 'error', text: 'Could not save the payment. Check your connection and try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="hpf-card" aria-label="New hourly payment">
      <h3 className="hpf-title">
        <Clock size={18} aria-hidden="true" /> New hourly payment
      </h3>
      <div className="hpf-grid">
        <div className="hpf-field">
          <span className="hpf-label">Employee</span>
          <CustomSelect
            options={employeeOptions}
            value={employeeId}
            onChange={handleEmployeeChange}
            placeholder="Select employee..."
            icon={User}
          />
        </div>
        <label className="hpf-field">
          <span className="hpf-label">Pay date</span>
          <DateInput className="hpf-input" value={payDate} onChange={setPayDate} aria-label="Pay date" />
        </label>
        <label className="hpf-field">
          <span className="hpf-label">Hours worked</span>
          <input
            className="hpf-input"
            inputMode="decimal"
            min="0"
            step="0.25"
            type="number"
            value={hoursText}
            onChange={(event) => setHoursText(event.target.value)}
          />
        </label>
        <label className="hpf-field">
          <span className="hpf-label">Rate ($/hour)</span>
          <input
            className="hpf-input"
            inputMode="decimal"
            min="0"
            step="0.01"
            type="number"
            value={rateText}
            onChange={(event) => setRateText(event.target.value)}
          />
        </label>
      </div>

      <div className="hpf-receipt">
        <label className="hpf-receipt-btn">
          <Paperclip size={16} aria-hidden="true" />
          <span className="hpf-receipt-name">{receiptButtonText}</span>
          <input
            ref={receiptInputRef}
            accept="image/*,application/pdf"
            className="hpf-receipt-input"
            type="file"
            onChange={handleReceiptChange}
          />
        </label>
        {receiptFile && (
          <button type="button" className="hpf-receipt-remove" aria-label="Remove receipt" onClick={handleRemoveReceipt}>
            <X size={16} />
          </button>
        )}
      </div>

      <div className="hpf-footer">
        <p className="hpf-total">
          Total to pay: <strong>{totalText}</strong>
        </p>
        <button type="button" className="btn-primary" disabled={!canSave} onClick={handleSavePayment}>
          {isSaving ? 'Saving...' : 'Save payment'}
        </button>
      </div>
      {message && (
        <p className={`hpf-message${message.tone === 'error' ? ' is-error' : ''}`} role="status">
          {message.text}
        </p>
      )}
    </section>
  );
};

export default HourlyPayForm;
