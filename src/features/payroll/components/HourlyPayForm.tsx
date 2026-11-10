// src/features/payroll/components/HourlyPayForm.tsx
// Modal para capturar o editar un pago por horas: empleado (de System Users,
// con búsqueda), fecha de pago, horas trabajadas y rate; el total (horas × rate)
// se calcula solo. El recibo de pago se sube como comprobante (las horas se
// escriben a mano). Se monta de nuevo en cada apertura y se cierra al guardar.
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Clock, FileText, Paperclip, User, X } from 'lucide-react';
import type { PayrollRecord, SystemUser } from '../../../types/index';
import SearchableSelect from '../../../shared/components/SearchableSelect';
import DateInput from '../../../shared/components/DateInput';
import { todayIso } from '../../../utils/dateFormat';
import { fullName } from '../../../utils/homeData';
import { money } from '../../../utils/jobFinancials';
import { calcHourlyTotal, getLastHourlyRate, parsePositiveNumber } from '../hourlyPay';
import { createHourlyPayment, updateHourlyPayment } from '../services/hourlyPayService';
import './HourlyPayForm.css';

interface HourlyPayFormProps {
  employees: readonly SystemUser[];
  /** Pagos ya guardados: de ahí sale el último rate de cada empleado. */
  payrollRecords: readonly PayrollRecord[];
  currentUser?: SystemUser | null;
  /** Pago a editar; sin él, es un pago nuevo. */
  payment?: PayrollRecord | null;
  onClose: () => void;
}

const HourlyPayForm = ({ employees, payrollRecords, currentUser, payment, onClose }: HourlyPayFormProps) => {
  const isEditing = !!payment;
  const [employeeId, setEmployeeId] = useState(payment?.employeeId ?? '');
  const [payDate, setPayDate] = useState(() => payment?.date || todayIso());
  const [hoursText, setHoursText] = useState(payment?.hours ? String(payment.hours) : '');
  const [rateText, setRateText] = useState(payment?.hourlyRate ? String(payment.hourlyRate) : '');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [keepCurrentReceipt, setKeepCurrentReceipt] = useState(!!payment?.receiptUrl);
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState('');
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
  const hasCurrentReceipt = keepCurrentReceipt && !receiptFile && !!payment?.receiptUrl;
  const attachText = hasCurrentReceipt ? 'Replace pay receipt' : 'Attach pay receipt';
  const receiptButtonText = receiptFile ? receiptFile.name : attachText;
  const titleText = isEditing ? 'Edit hourly payment' : 'New hourly payment';
  const saveButtonText = isEditing ? 'Save changes' : 'Save payment';

  // Mientras se guarda no se puede cerrar (la X, el fondo y Escape esperan).
  const handleClose = () => {
    if (!isSaving) onClose();
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSaving, onClose]);

  // En un pago nuevo, al elegir empleado se propone su último rate (se puede cambiar).
  const handleEmployeeChange = (nextEmployeeId: string) => {
    setEmployeeId(nextEmployeeId);
    setErrorText('');
    if (isEditing) return;
    const lastRate = getLastHourlyRate(payrollRecords, nextEmployeeId);
    setRateText(lastRate === null ? '' : String(lastRate));
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
    setErrorText('');
    const paymentInput = { employeeId, employeeName, date: payDate, hours, hourlyRate, receiptFile };
    try {
      if (payment) {
        await updateHourlyPayment(payment, { ...paymentInput, keepCurrentReceipt }, currentUser);
      } else {
        await createHourlyPayment(paymentInput, currentUser);
      }
      onClose();
    } catch (error) {
      console.error('Error saving the hourly payment:', error);
      setErrorText('Could not save the payment. Check your connection and try again.');
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay-centered" onClick={handleClose}>
      <section
        className="modal-50 hpf-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hpf-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="hpf-header">
          <h3 id="hpf-title" className="hpf-title">
            <Clock size={18} aria-hidden="true" /> {titleText}
          </h3>
          <button type="button" className="hpf-close-btn" aria-label="Close" disabled={isSaving} onClick={handleClose}>
            <X size={20} />
          </button>
        </header>

        <div className="hpf-body">
          <div className="hpf-grid">
            <div className="hpf-field">
              <span className="hpf-label">Employee</span>
              <SearchableSelect
                options={employeeOptions}
                value={employeeId}
                onChange={handleEmployeeChange}
                placeholder="Search employee..."
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
            {hasCurrentReceipt && (
              <>
                <a className="hpf-current-receipt" href={payment?.receiptUrl} rel="noopener noreferrer" target="_blank">
                  <FileText size={14} aria-hidden="true" /> Current receipt
                </a>
                <button
                  type="button"
                  className="hpf-receipt-remove"
                  aria-label="Remove current receipt"
                  onClick={() => setKeepCurrentReceipt(false)}
                >
                  <X size={16} />
                </button>
              </>
            )}
          </div>

          <p className="hpf-total">
            Total to pay: <strong>{totalText}</strong>
          </p>
          {errorText && <p className="hpf-error" role="alert">{errorText}</p>}
        </div>

        <footer className="hpf-footer">
          <button type="button" className="hpf-cancel-btn" disabled={isSaving} onClick={handleClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={!canSave} onClick={handleSavePayment}>
            {isSaving ? 'Saving...' : saveButtonText}
          </button>
        </footer>
      </section>
    </div>
  );
};

export default HourlyPayForm;
