// src/features/payroll/components/FixedSalaryForm.tsx
// Modal del sueldo fijo de un empleado: empleado (con búsqueda), sueldo MENSUAL
// y desde qué fecha aplica; muestra cuánto se paga el 15 y el último día. Con
// `salary` edita ese sueldo (el empleado no se cambia). Los pagos los crea la
// Cloud Function createfixedpayroll. Se monta de nuevo en cada apertura.
// Solo salen los empleados con tipo de pago "Fixed salary" (System Users).
// "Starts on" es siempre un inicio de quincena (el 1 o el 16): la de hoy o una
// siguiente, nunca una pasada (así no se reviven quincenas en que estuvo parado).
// Guardar el de un sueldo detenido lo reanuda desde esa fecha.
import { useMemo, useState } from 'react';
import { CalendarDays, User } from 'lucide-react';
import type { FixedSalary, SystemUser } from '../../../types/index';
import SearchableSelect from '../../../shared/components/SearchableSelect';
import { FIXED_SALARY_EXISTS, fixedSalariesService } from '../../../services/fixedSalariesService';
import { logActivity } from '../../../services/activityLogService';
import { formatDate, todayIso } from '../../../utils/dateFormat';
import { fullName } from '../../../utils/homeData';
import { money } from '../../../utils/jobFinancials';
import { getBiweeklyAmounts, getNextPayPeriodStart, getPayPeriodStartOptions } from '../fixedPay';
import { parsePositiveNumber } from '../../../shared/utils/parsePositiveNumber';
import { hasPayType } from '../employeePay';
import PayrollDialog from './PayrollDialog';
import './FixedSalaryForm.css';

interface FixedSalaryFormProps {
  employees: readonly SystemUser[];
  salaries: readonly FixedSalary[];
  currentUser?: SystemUser | null;
  /** Sueldo a editar; sin él, es un sueldo nuevo. */
  salary?: FixedSalary | null;
  onClose: () => void;
}

const FixedSalaryForm = ({ employees, salaries, currentUser, salary, onClose }: FixedSalaryFormProps) => {
  const isEditing = !!salary;
  const [employeeId, setEmployeeId] = useState(salary?.employeeId ?? '');
  const [monthlyAmountText, setMonthlyAmountText] = useState(salary ? String(salary.monthlyAmount) : '');
  const [startDate, setStartDate] = useState(() => salary?.startDate || getNextPayPeriodStart(todayIso()));
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState('');

  const employeeOptions = useMemo(
    () => employees
      .filter((employee) => employee.status !== 'Inactive' && hasPayType(employee, 'fixed'))
      .map((employee) => ({ id: employee.id, name: fullName(employee) }))
      .sort((optionA, optionB) => optionA.name.localeCompare(optionB.name)),
    [employees],
  );
  const employeeName = fullName(employees.find((employee) => employee.id === employeeId));
  // Un empleado ya tiene a lo más un sueldo (id = empleado): elegirlo de nuevo lo actualiza.
  const existingSalary = salary ?? salaries.find((savedSalary) => savedSalary.employeeId === employeeId);
  const isResuming = !!existingSalary && !existingSalary.active;
  // Inicios de quincena elegibles; si el sueldo guardado empezó antes, esa fecha también (sin cambio).
  const periodStartOptions = getPayPeriodStartOptions(todayIso());
  const startDateOptions = existingSalary && !periodStartOptions.includes(existingSalary.startDate)
    ? [existingSalary.startDate, ...periodStartOptions]
    : periodStartOptions;
  const monthlyAmount = parsePositiveNumber(monthlyAmountText);
  const biweeklyAmounts = monthlyAmount === null ? null : getBiweeklyAmounts(monthlyAmount);
  const canSave = !!employeeId && !!startDate && monthlyAmount !== null && !isSaving;
  const titleText = isEditing ? 'Edit fixed salary' : 'New fixed salary';
  const saveButtonText = existingSalary ? 'Save changes' : 'Save salary';

  // En un sueldo nuevo, si el empleado ya tiene uno se cargan sus datos para cambiarlos.
  const handleEmployeeChange = (nextEmployeeId: string) => {
    setEmployeeId(nextEmployeeId);
    const savedSalary = salaries.find((candidate) => candidate.employeeId === nextEmployeeId);
    setMonthlyAmountText(savedSalary ? String(savedSalary.monthlyAmount) : '');
    setStartDate(savedSalary?.active ? savedSalary.startDate : getNextPayPeriodStart(todayIso()));
    setErrorText('');
  };

  const handleSaveSalary = async () => {
    if (!canSave || monthlyAmount === null) return;
    setIsSaving(true);
    setErrorText('');
    try {
      if (existingSalary) {
        // Un sueldo detenido vuelve a quedar activo desde "Starts on".
        await fixedSalariesService.update(employeeId, { monthlyAmount, startDate, active: true }, fullName(currentUser));
      } else {
        await fixedSalariesService.create({ employeeId, monthlyAmount, startDate }, fullName(currentUser));
      }
      void logActivity({
        action: existingSalary ? 'update' : 'create',
        module: 'Payroll',
        user: currentUser,
        targetId: employeeId,
        targetLabel: employeeName,
        detail: `Fixed salary${isResuming ? ' resumed' : ''}: ${money(monthlyAmount)} per month from ${formatDate(startDate)}.`,
      });
      onClose();
    } catch (error) {
      console.error('Error saving the fixed salary:', error);
      const alreadyExists = error instanceof Error && error.message === FIXED_SALARY_EXISTS;
      setErrorText(alreadyExists
        ? 'This employee already has a fixed salary. Close this window and open it from the list to change it.'
        : 'Could not save the salary. Check your connection and try again.');
      setIsSaving(false);
    }
  };

  const footer = (
    <>
      <button type="button" className="pdlg-secondary-btn" disabled={isSaving} onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="btn-primary" disabled={!canSave} onClick={handleSaveSalary}>
        {isSaving ? 'Saving...' : saveButtonText}
      </button>
    </>
  );

  return (
    <PayrollDialog title={titleText} icon={CalendarDays} onClose={onClose} footer={footer} isBusy={isSaving} canOverflow>
      <div className="pdlg-grid">
        <div className="fsf-employee pdlg-field">
          <span className="pdlg-label">Employee</span>
          {isEditing ? (
            <input className="pdlg-input" disabled value={employeeName} aria-label="Employee" />
          ) : (
            <SearchableSelect
              options={employeeOptions}
              value={employeeId}
              onChange={handleEmployeeChange}
              placeholder="Search employee..."
              icon={User}
              ariaLabel="Employee"
            />
          )}
          {!isEditing && employeeOptions.length === 0 && (
            <span className="fsf-hint">No fixed-salary employees: set the pay type in System Users.</span>
          )}
        </div>
        <label className="pdlg-field">
          <span className="pdlg-label">Monthly salary</span>
          <input
            className="pdlg-input"
            inputMode="decimal"
            min="0"
            step="0.01"
            type="number"
            value={monthlyAmountText}
            onChange={(event) => setMonthlyAmountText(event.target.value)}
          />
        </label>
        <label className="pdlg-field">
          <span className="pdlg-label">Starts on</span>
          <select className="pdlg-input" value={startDate} onChange={(event) => setStartDate(event.target.value)}>
            {startDateOptions.map((periodStart) => (
              <option key={periodStart} value={periodStart}>{formatDate(periodStart)}</option>
            ))}
          </select>
        </label>
      </div>
      {isResuming && (
        <p className="fsf-resume-note">This salary is stopped: saving resumes it from {formatDate(startDate)}.</p>
      )}
      {biweeklyAmounts && (
        <p className="pdlg-note">
          {money(biweeklyAmounts.firstHalf)} on the 15th · {money(biweeklyAmounts.secondHalf)} on the last day
        </p>
      )}
      {errorText && <p className="pdlg-error" role="alert">{errorText}</p>}
    </PayrollDialog>
  );
};

export default FixedSalaryForm;
