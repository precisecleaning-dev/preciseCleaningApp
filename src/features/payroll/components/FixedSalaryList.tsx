// src/features/payroll/components/FixedSalaryList.tsx
// Sueldos fijos guardados: empleado, sueldo mensual, lo que se paga el 15 y el
// último día, desde cuándo y si sigue activo. "Stop" deja de crear pagos (los
// ya creados se quedan); "Resume" los vuelve a crear desde el próximo inicio de
// quincena (startDate = esa fecha, así la Cloud Function no crea los de las
// quincenas en que estuvo parado). Arriba, el botón que abre el modal de un
// sueldo nuevo (onNewSalary). Cada fila tiene Edit (abre el mismo modal: onEdit)
// y Delete (borra el sueldo; los pagos ya creados se quedan). Clic (o Enter) en
// la fila abre su detalle (onOpenDetail); los botones de la fila no lo abren.
// Las escrituras están en services/fixedSalaryActions.ts.
import { Pencil, Trash2 } from 'lucide-react';
import type { FixedSalary, SystemUser } from '../../../types/index';
import { usePendingById } from '../../../shared/hooks/usePendingById';
import { formatDate, todayIso } from '../../../utils/dateFormat';
import { money } from '../../../utils/jobFinancials';
import { getBiweeklyAmounts, getNextFixedPayDate, getNextPayPeriodStart } from '../fixedPay';
import { getNotFixedEmployeeMessage, isActiveFixedEmployee } from '../employeePay';
import { deleteFixedSalary, resumeFixedSalary, stopFixedSalary } from '../services/fixedSalaryActions';
import { PayrollTableRow, PayrollTableSkeleton, PayrollTableToolbar } from './PayrollTable';
import './FixedSalaryList.css';

interface FixedSalaryRowProps {
  salary: FixedSalary;
  employeeName: string;
  isUpdating: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onToggleActive: (salary: FixedSalary) => void;
  onEdit: (salary: FixedSalary) => void;
  onDelete: (salary: FixedSalary) => void;
  onOpenDetail: (salary: FixedSalary) => void;
}

const FixedSalaryRow = ({
  salary, employeeName, isUpdating, canEdit, canDelete, onToggleActive, onEdit, onDelete, onOpenDetail,
}: FixedSalaryRowProps) => {
  const { firstHalf, secondHalf } = getBiweeklyAmounts(salary.monthlyAmount);
  const toggleText = salary.active ? 'Stop' : 'Resume';

  return (
    <PayrollTableRow as="li" label={`View fixed salary of ${employeeName}`} onOpen={() => onOpenDetail(salary)}>
      <span className="ptbl-name">{employeeName}</span>
      <strong className="ptbl-amount">{money(salary.monthlyAmount)}</strong>
      <span>{money(firstHalf)} / {money(secondHalf)}</span>
      <span>{formatDate(salary.startDate)}</span>
      <span className="ptbl-status">
        <span className={`ptbl-badge${salary.active ? ' is-active' : ' is-stopped'}`}>{salary.active ? 'Active' : 'Stopped'}</span>
        {canEdit && (
          <button type="button" className="fsl-toggle-btn" disabled={isUpdating} onClick={() => onToggleActive(salary)}>
            {toggleText}
          </button>
        )}
      </span>
      <span className="ptbl-actions">
        {canEdit && (
          <button type="button" className="ptbl-icon-btn" aria-label="Edit salary" title="Edit" onClick={() => onEdit(salary)}>
            <Pencil size={16} />
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            className="ptbl-icon-btn is-delete"
            aria-label="Delete salary"
            title="Delete"
            disabled={isUpdating}
            onClick={() => onDelete(salary)}
          >
            <Trash2 size={16} />
          </button>
        )}
      </span>
    </PayrollTableRow>
  );
};

interface FixedSalaryListProps {
  salaries: readonly FixedSalary[];
  /** Usuarios: Resume revisa que el empleado siga activo y con tipo de pago fijo. */
  employees: readonly SystemUser[];
  /** Mientras cargan los sueldos: esqueleto y "New fixed salary" espera (si no, podría pisar uno que no se ve aún). */
  isLoading: boolean;
  /** Crear, editar, Stop y Resume: Payroll con alcance All y Edit (canManageEmployeePay). */
  canEdit: boolean;
  /** Borrar: además, Payroll con Delete (canDeleteEmployeePay). */
  canDelete: boolean;
  getEmployeeName: (employeeId: string) => string;
  currentUser?: SystemUser | null;
  onNewSalary: () => void;
  onEdit: (salary: FixedSalary) => void;
  onOpenDetail: (salary: FixedSalary) => void;
}

const FixedSalaryList = ({
  salaries, employees, isLoading, canEdit, canDelete, getEmployeeName, currentUser, onNewSalary, onEdit, onOpenDetail,
}: FixedSalaryListProps) => {
  const { pending, run } = usePendingById();
  const sortedSalaries = [...salaries].sort((salaryA, salaryB) =>
    getEmployeeName(salaryA.employeeId).localeCompare(getEmployeeName(salaryB.employeeId)));

  const handleStop = (salary: FixedSalary) => {
    const employeeName = getEmployeeName(salary.employeeId);
    const confirmMessage = `Stop the fixed salary of ${employeeName}? Payments not created yet (next one: `
      + `${formatDate(getNextFixedPayDate(todayIso()))}) will not be created. Payments already created are kept.`;
    if (!window.confirm(confirmMessage)) return;
    run(salary.employeeId, () => stopFixedSalary(salary, employeeName, currentUser),
      'Could not stop the salary. Check your connection and try again.');
  };

  // Solo se reanuda a quien sigue activo y con tipo de pago "Fixed salary" en System Users.
  const handleResume = (salary: FixedSalary) => {
    const employeeName = getEmployeeName(salary.employeeId);
    const employee = employees.find((candidate) => candidate.id === salary.employeeId);
    if (!isActiveFixedEmployee(employee)) {
      alert(getNotFixedEmployeeMessage(employeeName));
      return;
    }
    const resumeDate = getNextPayPeriodStart(todayIso());
    const confirmMessage = `Resume the fixed salary of ${employeeName}? Payments start again on ${formatDate(resumeDate)} `
      + '(start of the next pay period) and "Starts on" changes to that date.';
    if (!window.confirm(confirmMessage)) return;
    run(salary.employeeId, () => resumeFixedSalary(salary, employeeName, resumeDate, currentUser),
      'Could not resume the salary. Check your connection and try again.');
  };

  const handleToggleActive = (salary: FixedSalary) => {
    if (salary.active) {
      handleStop(salary);
    } else {
      handleResume(salary);
    }
  };

  // Borra el sueldo: la Cloud Function deja de crear pagos; los ya creados se quedan.
  const handleDelete = (salary: FixedSalary) => {
    const employeeName = getEmployeeName(salary.employeeId);
    const confirmMessage = `Delete the fixed salary of ${employeeName} (${money(salary.monthlyAmount)} per month)? `
      + 'Payments already created are kept. They stay as "Fixed salary" in System Users: change their pay type there '
      + 'if they no longer have a fixed salary.';
    if (!window.confirm(confirmMessage)) return;
    run(salary.employeeId, () => deleteFixedSalary(salary, employeeName, currentUser),
      'Could not delete the salary. Check your connection and try again.');
  };

  const toolbar = (
    <PayrollTableToolbar title="Fixed salaries" actionText="New fixed salary" onAction={canEdit ? onNewSalary : undefined} isActionDisabled={isLoading} />
  );

  if (isLoading) {
    return (
      <>
        {toolbar}
        <div className="fsl-loading">
          <PayrollTableSkeleton />
        </div>
      </>
    );
  }

  if (sortedSalaries.length === 0) {
    return (
      <>
        {toolbar}
        <p className="fsl-empty ptbl-empty">No fixed salaries yet.</p>
      </>
    );
  }

  return (
    <>
      {toolbar}
      <section className="fsl-card ptbl-card" aria-label="Fixed salaries">
        <div className="ptbl-head" aria-hidden="true">
          <span>Employee</span>
          <span>Monthly</span>
          <span>15th / last day</span>
          <span>Starts on</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        <ul className="ptbl-list">
          {sortedSalaries.map((salary) => (
            <FixedSalaryRow
              key={salary.employeeId}
              salary={salary}
              employeeName={getEmployeeName(salary.employeeId)}
              isUpdating={pending.has(salary.employeeId)}
              canEdit={canEdit}
              canDelete={canDelete}
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
