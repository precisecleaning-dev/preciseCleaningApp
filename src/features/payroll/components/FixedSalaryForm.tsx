// src/features/payroll/components/FixedSalaryForm.tsx
// Alta (o cambio) del sueldo fijo de un empleado: empleado, sueldo MENSUAL y
// desde qué fecha aplica. Muestra cuánto se paga el 15 y el último día. Los
// pagos los crea la Cloud Function createfixedpayroll.
import { useMemo, useState } from 'react';
import { CalendarDays, User } from 'lucide-react';
import type { FixedSalary, SystemUser } from '../../../types/index';
import CustomSelect from '../../../components/CustomSelect';
import DateInput from '../../../shared/components/DateInput';
import { fixedSalariesService } from '../../../services/fixedSalariesService';
import { logActivity } from '../../../services/activityLogService';
import { formatDate, todayIso } from '../../../utils/dateFormat';
import { fullName } from '../../../utils/homeData';
import { money } from '../../../utils/jobFinancials';
import { getBiweeklyAmounts } from '../fixedPay';
import { parsePositiveNumber } from '../hourlyPay';
import './FixedSalaryForm.css';

interface FormMessage {
  tone: 'error' | 'success';
  text: string;
}

interface FixedSalaryFormProps {
  employees: readonly SystemUser[];
  salaries: readonly FixedSalary[];
  currentUser?: SystemUser | null;
}

const FixedSalaryForm = ({ employees, salaries, currentUser }: FixedSalaryFormProps) => {
  const [employeeId, setEmployeeId] = useState('');
  const [monthlyText, setMonthlyText] = useState('');
  const [startDate, setStartDate] = useState(todayIso);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<FormMessage | null>(null);

  const employeeOptions = useMemo(
    () => employees
      .filter((employee) => employee.status !== 'Inactive')
      .map((employee) => ({ id: employee.id, name: fullName(employee) }))
      .sort((optionA, optionB) => optionA.name.localeCompare(optionB.name)),
    [employees],
  );
  const employeeName = employeeOptions.find((option) => option.id === employeeId)?.name ?? '';
  const existingSalary = salaries.find((salary) => salary.employeeId === employeeId);
  const monthlyAmount = parsePositiveNumber(monthlyText);
  const biweeklyAmounts = monthlyAmount === null ? null : getBiweeklyAmounts(monthlyAmount);
  const canSave = !!employeeId && !!startDate && monthlyAmount !== null && !isSaving;
  const saveButtonText = existingSalary ? 'Update salary' : 'Save salary';

  // Si el empleado ya tiene sueldo fijo, se muestran sus datos para cambiarlos.
  const handleEmployeeChange = (nextEmployeeId: string) => {
    setEmployeeId(nextEmployeeId);
    const salary = salaries.find((savedSalary) => savedSalary.employeeId === nextEmployeeId);
    setMonthlyText(salary ? String(salary.monthlyAmount) : '');
    setStartDate(salary?.startDate ?? todayIso());
    setMessage(null);
  };

  const handleSaveSalary = async () => {
    if (!canSave || monthlyAmount === null) return;
    setIsSaving(true);
    setMessage(null);
    try {
      await fixedSalariesService.create({ employeeId, monthlyAmount, startDate }, fullName(currentUser));
      void logActivity({
        action: existingSalary ? 'update' : 'create',
        module: 'Payroll',
        user: currentUser,
        targetId: employeeId,
        targetLabel: employeeName,
        detail: `Fixed salary: ${money(monthlyAmount)} per month from ${formatDate(startDate)}.`,
      });
      setMessage({ tone: 'success', text: `Fixed salary saved for ${employeeName}.` });
    } catch (error) {
      console.error('Error saving the fixed salary:', error);
      setMessage({ tone: 'error', text: 'Could not save the salary. Check your connection and try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="fsf-card" aria-label="Fixed salary">
      <h3 className="fsf-title">
        <CalendarDays size={18} aria-hidden="true" /> Fixed salary (paid on the 15th and the last day of the month)
      </h3>
      <div className="fsf-grid">
        <div className="fsf-field">
          <span className="fsf-label">Employee</span>
          <CustomSelect
            options={employeeOptions}
            value={employeeId}
            onChange={handleEmployeeChange}
            placeholder="Select employee..."
            icon={User}
          />
        </div>
        <label className="fsf-field">
          <span className="fsf-label">Monthly salary</span>
          <input
            className="fsf-input"
            inputMode="decimal"
            min="0"
            step="0.01"
            type="number"
            value={monthlyText}
            onChange={(event) => setMonthlyText(event.target.value)}
          />
        </label>
        <label className="fsf-field">
          <span className="fsf-label">Starts on</span>
          <DateInput className="fsf-input" value={startDate} onChange={setStartDate} aria-label="Starts on" />
        </label>
      </div>
      <div className="fsf-footer">
        {biweeklyAmounts && (
          <p className="fsf-split">
            {money(biweeklyAmounts.firstHalf)} on the 15th · {money(biweeklyAmounts.secondHalf)} on the last day
          </p>
        )}
        <button type="button" className="btn-primary" disabled={!canSave} onClick={handleSaveSalary}>
          {isSaving ? 'Saving...' : saveButtonText}
        </button>
      </div>
      {message && (
        <p className={`fsf-message${message.tone === 'error' ? ' is-error' : ''}`} role="status">
          {message.text}
        </p>
      )}
    </section>
  );
};

export default FixedSalaryForm;
