// src/features/payroll/components/FixedSalaryList.tsx
// Sueldos fijos guardados: empleado, sueldo mensual, lo que se paga el 15 y el
// último día, desde cuándo y si sigue activo. "Stop" deja de crear pagos (los
// ya creados se quedan); "Resume" los vuelve a crear desde hoy (startDate = hoy,
// así la Cloud Function no crea los de las quincenas en que estuvo parado).
// Arriba, el botón que abre el modal de un sueldo nuevo (onNewSalary). Cada
// fila tiene Edit (abre el mismo modal: onEdit) y Delete (borra el sueldo; los
// pagos ya creados se quedan). Clic (o Enter) en la fila abre su detalle
// (onOpenDetail); los botones de la fila no lo abren.
import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
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
  onEdit: (salary: FixedSalary) => void;
  onDelete: (salary: FixedSalary) => void;
  onOpenDetail: (salary: FixedSalary) => void;
}

/** Los botones de la fila no abren el detalle. */
const stopRowClick = (event: MouseEvent) => event.stopPropagation();

const FixedSalaryRow = ({
  salary, employeeName, isUpdating, onToggleActive, onEdit, onDelete, onOpenDetail,
}: FixedSalaryRowProps) => {
  const { firstHalf, secondHalf } = getBiweeklyAmounts(salary.monthlyAmount);
  const toggleText = salary.active ? 'Stop' : 'Resume';

  // Enter o espacio sobre la FILA (no sobre un botón de adentro) abre el detalle.
  const handleRowKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onOpenDetail(salary);
  };

  return (
    <li
      className="fsl-row is-clickable"
      role="button"
      tabIndex={0}
      aria-label={`View fixed salary of ${employeeName}`}
      onClick={() => onOpenDetail(salary)}
      onKeyDown={handleRowKeyDown}
    >
      <span className="fsl-employee">{employeeName}</span>
      <strong className="fsl-amount">{money(salary.monthlyAmount)}</strong>
      <span className="fsl-split">{money(firstHalf)} / {money(secondHalf)}</span>
      <span className="fsl-start">{formatDate(salary.startDate)}</span>
      <span className="fsl-actions" onClick={stopRowClick}>
        <span className={`fsl-badge${salary.active ? ' is-active' : ''}`}>{salary.active ? 'Active' : 'Stopped'}</span>
        <button type="button" className="fsl-toggle-btn" disabled={isUpdating} onClick={() => onToggleActive(salary)}>
          {toggleText}
        </button>
      </span>
      <span className="fsl-row-actions" onClick={stopRowClick}>
        <button type="button" className="fsl-icon-btn" aria-label="Edit salary" title="Edit" onClick={() => onEdit(salary)}>
          <Pencil size={16} />
        </button>
        <button
          type="button"
          className="fsl-icon-btn is-delete"
          aria-label="Delete salary"
          title="Delete"
          disabled={isUpdating}
          onClick={() => onDelete(salary)}
        >
          <Trash2 size={16} />
        </button>
      </span>
    </li>
  );
};

interface FixedSalaryToolbarProps {
  onNewSalary: () => void;
}

const FixedSalaryToolbar = ({ onNewSalary }: FixedSalaryToolbarProps) => (
  <div className="fsl-toolbar">
    <h3 className="fsl-title">Fixed salaries</h3>
    <button type="button" className="btn-primary" onClick={onNewSalary}>
      <Plus size={16} aria-hidden="true" /> New fixed salary
    </button>
  </div>
);

interface FixedSalaryListProps {
  salaries: readonly FixedSalary[];
  getEmployeeName: (employeeId: string) => string;
  currentUser?: SystemUser | null;
  onNewSalary: () => void;
  onEdit: (salary: FixedSalary) => void;
  onOpenDetail: (salary: FixedSalary) => void;
}

const FixedSalaryList = ({
  salaries, getEmployeeName, currentUser, onNewSalary, onEdit, onOpenDetail,
}: FixedSalaryListProps) => {
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

  // Borra el sueldo: la Cloud Function deja de crear pagos; los ya creados se quedan.
  const handleDelete = async (salary: FixedSalary) => {
    const employeeName = getEmployeeName(salary.employeeId);
    const question = `Delete the fixed salary of ${employeeName} (${money(salary.monthlyAmount)} per month)? `
      + 'Payments already created are kept.';
    if (!window.confirm(question)) return;
    setUpdatingEmployeeId(salary.employeeId);
    try {
      await fixedSalariesService.delete(salary.employeeId);
      void logActivity({
        action: 'delete',
        module: 'Payroll',
        user: currentUser,
        targetId: salary.employeeId,
        targetLabel: employeeName,
        detail: `Fixed salary deleted (${money(salary.monthlyAmount)} per month).`,
      });
    } catch (error) {
      console.error('Error deleting the fixed salary:', error);
      alert('Could not delete the salary. Check your connection and try again.');
    } finally {
      setUpdatingEmployeeId('');
    }
  };

  if (sortedSalaries.length === 0) {
    return (
      <>
        <FixedSalaryToolbar onNewSalary={onNewSalary} />
        <p className="fsl-empty">No fixed salaries yet.</p>
      </>
    );
  }

  return (
    <>
      <FixedSalaryToolbar onNewSalary={onNewSalary} />
      <section className="fsl-card" aria-label="Fixed salaries">
        <div className="fsl-head" aria-hidden="true">
          <span>Employee</span>
          <span>Monthly</span>
          <span>15th / last day</span>
          <span>Starts on</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        <ul className="fsl-list">
          {sortedSalaries.map((salary) => (
            <FixedSalaryRow
              key={salary.employeeId}
              salary={salary}
              employeeName={getEmployeeName(salary.employeeId)}
              isUpdating={updatingEmployeeId === salary.employeeId}
              onToggleActive={handleToggleActive}
              onEdit={onEdit}
              onDelete={handleDelete}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </ul>
      </section>
    </>
  );
};

export default FixedSalaryList;
