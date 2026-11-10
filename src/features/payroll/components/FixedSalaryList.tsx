// src/features/payroll/components/FixedSalaryList.tsx
// Sueldos fijos guardados: empleado, sueldo mensual, lo que se paga el 15 y el
// último día, desde cuándo y si sigue activo. "Stop" deja de crear pagos (los
// ya creados se quedan); "Resume" los vuelve a crear desde hoy (startDate = hoy,
// así la Cloud Function no crea los de las quincenas en que estuvo parado).
import { useState } from 'react';
import type { FixedSalary, SystemUser } from '../../../types/index';
import { fixedSalariesService } from '../../../services/fixedSalariesService';
import { logActivity } from '../../../services/activityLogService';
import { formatDate, todayIso } from '../../../utils/dateFormat';
import { fullName } from '../../../utils/homeData';
import { money } from '../../../utils/jobFinancials';
import { getBiweeklyAmounts } from '../fixedPay';
import './FixedSalaryList.css';

interface FixedSalaryRowProps {
  salary: FixedSalary;
  employeeName: string;
  isUpdating: boolean;
  onToggleActive: (salary: FixedSalary) => void;
}

const FixedSalaryRow = ({ salary, employeeName, isUpdating, onToggleActive }: FixedSalaryRowProps) => {
  const { firstHalf, secondHalf } = getBiweeklyAmounts(salary.monthlyAmount);
  const toggleText = salary.active ? 'Stop' : 'Resume';

  return (
    <li className="fsl-row">
      <span className="fsl-employee">{employeeName}</span>
      <strong className="fsl-amount">{money(salary.monthlyAmount)}</strong>
      <span className="fsl-split">{money(firstHalf)} / {money(secondHalf)}</span>
      <span className="fsl-start">{formatDate(salary.startDate)}</span>
      <span className="fsl-actions">
        <span className={`fsl-badge${salary.active ? ' is-active' : ''}`}>{salary.active ? 'Active' : 'Stopped'}</span>
        <button type="button" className="fsl-toggle-btn" disabled={isUpdating} onClick={() => onToggleActive(salary)}>
          {toggleText}
        </button>
      </span>
    </li>
  );
};

interface FixedSalaryListProps {
  salaries: readonly FixedSalary[];
  getEmployeeName: (employeeId: string) => string;
  currentUser?: SystemUser | null;
}

const FixedSalaryList = ({ salaries, getEmployeeName, currentUser }: FixedSalaryListProps) => {
  const [updatingEmployeeId, setUpdatingEmployeeId] = useState('');
  const sortedSalaries = [...salaries].sort((salaryA, salaryB) =>
    getEmployeeName(salaryA.employeeId).localeCompare(getEmployeeName(salaryB.employeeId)));

  const handleToggleActive = async (salary: FixedSalary) => {
    const isActive = !salary.active;
    const resumeDate = todayIso();
    const changes = isActive ? { active: true, startDate: resumeDate } : { active: false };
    setUpdatingEmployeeId(salary.employeeId);
    try {
      await fixedSalariesService.update(salary.employeeId, changes, fullName(currentUser));
      void logActivity({
        action: 'update',
        module: 'Payroll',
        user: currentUser,
        targetId: salary.employeeId,
        targetLabel: getEmployeeName(salary.employeeId),
        detail: isActive ? `Fixed salary resumed from ${formatDate(resumeDate)}.` : 'Fixed salary stopped.',
      });
    } catch (error) {
      console.error('Error updating the fixed salary:', error);
      alert('Could not update the salary. Check your connection and try again.');
    } finally {
      setUpdatingEmployeeId('');
    }
  };

  if (sortedSalaries.length === 0) {
    return <p className="fsl-empty">No fixed salaries yet.</p>;
  }

  return (
    <section className="fsl-card" aria-label="Fixed salaries">
      <div className="fsl-head" aria-hidden="true">
        <span>Employee</span>
        <span>Monthly</span>
        <span>15th / last day</span>
        <span>Starts on</span>
        <span>Status</span>
      </div>
      <ul className="fsl-list">
        {sortedSalaries.map((salary) => (
          <FixedSalaryRow
            key={salary.employeeId}
            salary={salary}
            employeeName={getEmployeeName(salary.employeeId)}
            isUpdating={updatingEmployeeId === salary.employeeId}
            onToggleActive={handleToggleActive}
          />
        ))}
      </ul>
    </section>
  );
};

export default FixedSalaryList;
