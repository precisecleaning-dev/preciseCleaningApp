// src/features/payroll/components/HourlyPaymentForm.tsx
// Modal para capturar o editar un pago por horas: empleado (de System Users,
// con búsqueda), fecha de pago, horas trabajadas y rate; el total (horas × rate)
// se calcula solo. El recibo de pago se sube como comprobante (las horas se
// escriben a mano). Se monta de nuevo en cada apertura y se cierra al guardar.
// Solo salen los empleados con tipo de pago "Hourly" (System Users); su rate
// guardado (hourly_rates) se propone al elegirlos.
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Clock, FileText, Paperclip, User, X } from 'lucide-react';
import type { HourlyRate, PayrollRecord, SystemUser } from '../../../types/index';
import SearchableSelect from '../../../shared/components/SearchableSelect';
import DateInput from '../../../shared/components/DateInput';
import { formatDate, todayIso } from '../../../utils/dateFormat';
import { fullName } from '../../../utils/homeData';
import { money } from '../../../utils/jobFinancials';
import { computeHourlyTotal, getLastHourlyRate } from '../hourlyPay';
import { parsePositiveNumber } from '../../../shared/utils/parsePositiveNumber';
import { createHourlyPayment, updateHourlyPayment } from '../services/hourlyPayService';
import { hasPayType } from '../employeePay';
import PayrollDialog from './PayrollDialog';
import './HourlyPaymentForm.css';

interface HourlyPaymentFormProps {
  employees: readonly SystemUser[];
  /** Pagos ya guardados: de ahí sale el último rate de cada empleado. */
  payrollRecords: readonly PayrollRecord[];
  /** Rate guardado de cada empleado por hora (System Users); manda sobre el último pago. */
  hourlyRates: readonly HourlyRate[];
  currentUser?: SystemUser | null;
  /** Pago a editar; sin él, es un pago nuevo. */
  payment?: PayrollRecord | null;
  onClose: () => void;
}

const HourlyPaymentForm = ({
  employees, payrollRecords, hourlyRates, currentUser, payment, onClose,
}: HourlyPaymentFormProps) => {
  const isEditing = !!payment;
  const [employeeId, setEmployeeId] = useState(payment?.employeeId ?? '');
  const [payDate, setPayDate] = useState(() => payment?.date || todayIso());
  const [hoursText, setHoursText] = useState(payment?.hours ? String(payment.hours) : '');
  const [rateText, setRateText] = useState(payment?.hourlyRate ? String(payment.hourlyRate) : '');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [shouldKeepCurrentReceipt, setShouldKeepCurrentReceipt] = useState(!!payment?.receiptUrl);
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState('');
  const receiptInputRef = useRef<HTMLInputElement>(null);

  // Empleados por hora activos; al editar, también el del pago aunque ya no sea por hora
  // (o "Deleted employee" si ya no existe, para no mostrar su id crudo).
  const paymentEmployeeId = payment?.employeeId ?? '';
  const employeeOptions = useMemo(() => {
    const options = employees
      .filter((employee) => (employee.status !== 'Inactive' && hasPayType(employee, 'hourly'))
        || employee.id === paymentEmployeeId)
      .map((employee) => ({ id: employee.id, name: fullName(employee) }))
      .sort((optionA, optionB) => optionA.name.localeCompare(optionB.name));
    const isPaymentEmployeeMissing = !!paymentEmployeeId && !options.some((option) => option.id === paymentEmployeeId);
    return isPaymentEmployeeMissing ? [{ id: paymentEmployeeId, name: 'Deleted employee' }, ...options] : options;
  }, [employees, paymentEmployeeId]);
  const employeeName = employeeOptions.find((option) => option.id === employeeId)?.name ?? '';
  const hours = parsePositiveNumber(hoursText);
  const hourlyRate = parsePositiveNumber(rateText);
  const totalText = hours !== null && hourlyRate !== null ? money(computeHourlyTotal(hours, hourlyRate)) : '—';
  const canSave = !!employeeId && !!payDate && hours !== null && hourlyRate !== null && !isSaving;
  const hasCurrentReceipt = shouldKeepCurrentReceipt && !receiptFile && !!payment?.receiptUrl;
  const attachText = hasCurrentReceipt ? 'Replace pay receipt' : 'Attach pay receipt';
  const receiptButtonText = receiptFile ? receiptFile.name : attachText;
  const titleText = isEditing ? 'Edit hourly payment' : 'New hourly payment';
  const saveButtonText = isEditing ? 'Save changes' : 'Save payment';

  // En un pago nuevo, al elegir empleado se propone su último rate (se puede cambiar).
  const handleEmployeeChange = (nextEmployeeId: string) => {
    setEmployeeId(nextEmployeeId);
    setErrorText('');
    if (isEditing) return;
    const savedRate = hourlyRates.find((rate) => rate.employeeId === nextEmployeeId)?.hourlyRate;
    const proposedRate = savedRate ?? getLastHourlyRate(payrollRecords, nextEmployeeId);
    setRateText(proposedRate === null ? '' : String(proposedRate));
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
        await updateHourlyPayment(payment, { ...paymentInput, shouldKeepCurrentReceipt }, currentUser);
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

  const footer = (
    <>
      <button type="button" className="pdlg-secondary-btn" disabled={isSaving} onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="btn-primary" disabled={!canSave} onClick={handleSavePayment}>
        {isSaving ? 'Saving...' : saveButtonText}
      </button>
    </>
  );

  return (
    <PayrollDialog title={titleText} icon={Clock} onClose={onClose} footer={footer} isBusy={isSaving} canOverflow>
      <div className="pdlg-grid">
        <div className="pdlg-field">
          <span className="pdlg-label">Employee</span>
          <SearchableSelect
            options={employeeOptions}
            value={employeeId}
            onChange={handleEmployeeChange}
            placeholder="Search employee..."
            icon={User}
            ariaLabel="Employee"
          />
          {employeeOptions.length === 0 && (
            <span className="hpf-hint">No hourly employees: set the pay type in System Users.</span>
          )}
        </div>
        <label className="pdlg-field">
          <span className="pdlg-label">Pay date</span>
          <DateInput className="pdlg-input" value={payDate} onChange={setPayDate} aria-label="Pay date" />
        </label>
        <label className="pdlg-field">
          <span className="pdlg-label">Hours worked</span>
          <input
            className="pdlg-input"
            inputMode="decimal"
            min="0"
            step="0.25"
            type="number"
            value={hoursText}
            onChange={(event) => setHoursText(event.target.value)}
          />
        </label>
        <label className="pdlg-field">
          <span className="pdlg-label">Rate ($/hour)</span>
          <input
            className="pdlg-input"
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
              onClick={() => setShouldKeepCurrentReceipt(false)}
            >
              <X size={16} />
            </button>
          </>
        )}
      </div>

      {payment?.status === 'Paid' && (
        <p className="hpf-paid-note">
          This payment is already marked as paid ({formatDate(payment.paidAt)}): changing it does not change what was paid.
        </p>
      )}
      <p className="hpf-total">
        Total to pay: <strong>{totalText}</strong>
      </p>
      {errorText && <p className="pdlg-error" role="alert">{errorText}</p>}
    </PayrollDialog>
  );
};

export default HourlyPaymentForm;
