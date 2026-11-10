// src/features/payroll/components/FixedSalaryForm.tsx
// Modal del sueldo fijo de un empleado: empleado (con búsqueda), sueldo MENSUAL
// y desde qué fecha aplica; muestra cuánto se paga el 15 y el último día. Con
// `salary` edita ese sueldo (el empleado no se cambia). Los pagos los crea la
// Cloud Function createfixedpayroll. Se monta de nuevo en cada apertura.
// Solo salen los empleados con tipo de pago "Fixed salary" (System Users).
import { useMemo, useState } from 'react';
import { CalendarDays, User } from 'lucide-react';
import type { FixedSalary, SystemUser } from '../../../types/index';
import SearchableSelect from '../../../shared/components/SearchableSelect';
import DateInput from '../../../shared/components/DateInput';
import { fixedSalariesService } from '../../../services/fixedSalariesService';
import { logActivity } from '../../../services/activityLogService';
import { formatDate, todayIso } from '../../../utils/dateFormat';
import { fullName } from '../../../utils/homeData';
import { money } from '../../../utils/jobFinancials';
import { getBiweeklyAmounts } from '../fixedPay';
import { parsePositiveNumber } from '../hourlyPay';
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
  const [monthlyText, setMonthlyText] = useState(salary ? String(salary.monthlyAmount) : '');
  const [startDate, setStartDate] = useState(() => salary?.startDate || todayIso());
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState('');

  const employeeOptions = useMemo(
    () => employees
      .filter((employee) => employee.status !== 'Inactive' && hasPayType(employee, 'fixed'))
      .map((employee) => ({ id: employee.id, name: fullName(employee) }))
      .sort((optionA, optionB) => optionA.name.localeCompare(optionB.name)),
    [employees],
  );
  const employeeName = fullName(employees.find((employee) => employee.id === employeeId)) || '';
  // Un empleado ya tiene a lo más un sueldo (id = empleado): elegirlo de nuevo lo actualiza.
  const existingSalary = salary ?? salaries.find((savedSalary) => savedSalary.employeeId === employeeId);
  const monthlyAmount = parsePositiveNumber(monthlyText);
  const biweeklyAmounts = monthlyAmount === null ? null : getBiweeklyAmounts(monthlyAmount);
  const canSave = !!employeeId && !!startDate && monthlyAmount !== null && !isSaving;
  const titleText = isEditing ? 'Edit fixed salary' : 'New fixed salary';
  const saveButtonText = existingSalary ? 'Save changes' : 'Save salary';

  // En un sueldo nuevo, si el empleado ya tiene uno se cargan sus datos para cambiarlos.
  const handleEmployeeChange = (nextEmployeeId: string) => {
    setEmployeeId(nextEmployeeId);
    const savedSalary = salaries.find((candidate) => candidate.employeeId === nextEmployeeId);
    setMonthlyText(savedSalary ? String(savedSalary.monthlyAmount) : '');
    setStartDate(savedSalary?.startDate ?? todayIso());
    setErrorText('');
  };

  const handleSaveSalary = async () => {
    if (!canSave || monthlyAmount === null) return;
    setIsSaving(true);
    setErrorText('');
    try {
      if (existingSalary) {
        await fixedSalariesService.update(employeeId, { monthlyAmount, startDate }, fullName(currentUser));
      } else {
        await fixedSalariesService.create({ employeeId, monthlyAmount, startDate }, fullName(currentUser));
      }
      void logActivity({
        action: existingSalary ? 'update' : 'create',
        module: 'Payroll',
        user: currentUser,
        targetId: employeeId,
        targetLabel: employeeName,
        detail: `Fixed salary: ${money(monthlyAmount)} per month from ${formatDate(startDate)}.`,
      });
      onClose();
    } catch (error) {
      console.error('Error saving the fixed salary:', error);
      setErrorText('Could not save the salary. Check your connection and try again.');
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
    <PayrollDialog title={titleText} icon={CalendarDays} onClose={onClose} footer={footer} isBusy={isSaving} allowOverflow>
      <div className="pdlg-grid">
        <div className="pdlg-field fsf-employee">
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
            value={monthlyText}
            onChange={(event) => setMonthlyText(event.target.value)}
          />
        </label>
        <label className="pdlg-field">
          <span className="pdlg-label">Starts on</span>
          <DateInput className="pdlg-input" value={startDate} onChange={setStartDate} aria-label="Starts on" />
        </label>
      </div>
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
