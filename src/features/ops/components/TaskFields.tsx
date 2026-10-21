// Campos de una tarea que comparten el panel de ver/editar y el de crear:
// horario (hora, duración y repetición con TaskRepeatPicker), fecha, prioridad, quién la
// asignó (solo lectura), personas y proyecto. Cada cambio sale por `onPatch`
// (el panel de editar lo guarda al instante; el de crear lo junta hasta "Add task").
import type { CSSProperties } from 'react';
import type {
  AssignableUser, Priority, Repeat, TaskAssignee, TaskProject, UserTask,
} from '../../../types/index';
import DateInput from '../../../shared/components/DateInput';
import TimeInput from '../../../shared/components/TimeInput';
import { formatDate, todayIso } from '../../../utils/dateFormat';
import type { TaskPatch } from '../../../services/userTasksService';
import { isDailyRepeat, lateLabel } from '../opsDates';
import { DURATION_OPTIONS, getFirstName } from '../opsOptions';
import AssigneePicker from './AssigneePicker';
import OpsAvatar from './OpsAvatar';
import TaskRepeatPicker from './TaskRepeatPicker';

interface TaskFieldsProps {
  task: Pick<UserTask,
    'status' | 'dueDate' | 'dueTime' | 'durationMinutes' | 'repeat' | 'priorityId' | 'assignees'
    | 'projectId' | 'projectTitle' | 'createdByUserId' | 'createdByUserName' | 'createdAt'>;
  assignableUsers: AssignableUser[];
  projects: TaskProject[];
  priorities: Priority[];
  currentUser: { id: string; name: string };
  canEdit: boolean;
  /** Cambiar "Assignee" (las personas): quien la asignó (o Edit, si no es suya). */
  canReassign: boolean;
  onPatch: (patch: TaskPatch) => void;
}

const TaskFields = ({
  task, assignableUsers, projects, priorities, currentUser, canEdit, canReassign, onPatch,
}: TaskFieldsProps) => {
  // Una diaria vence el día que toca: sin fecha, empieza hoy.
  const handleRepeatChange = (repeat: Repeat | null) => {
    const shouldStartToday = !task.dueDate && isDailyRepeat(repeat);
    onPatch(shouldStartToday ? { repeat, dueDate: todayIso() } : { repeat });
  };

  const handleDueDateChange = (isoDate: string) => {
    if (isoDate === '' || /^\d{4}-\d{2}-\d{2}$/.test(isoDate)) onPatch({ dueDate: isoDate });
  };

  const handleAssigneesChange = (assignees: TaskAssignee[]) => onPatch({ assignees });

  const handleProjectChange = (projectId: string) => {
    const project = projects.find((option) => option.id === projectId);
    onPatch({ projectId: project?.id ?? null, projectTitle: project?.title ?? null });
  };

  const overdueLabel = task.status === 'open' ? lateLabel(task.dueDate) : '';
  const selectedPriority = priorities.find((option) => option.id === task.priorityId);
  const isKnownProject = !task.projectId || projects.some((project) => project.id === task.projectId);
  const isKnownDuration = DURATION_OPTIONS.some((option) => option.value === task.durationMinutes);
  const assignedByLabel = task.createdByUserId === currentUser.id
    ? `Me (${getFirstName(task.createdByUserName || currentUser.name)})`
    : task.createdByUserName || '—';
  const assigneesLabel = task.assignees
    .map((assignee) => (assignee.userId === currentUser.id
      ? `Me (${getFirstName(assignee.userName || currentUser.name)})`
      : assignee.userName))
    .join(', ') || '—';
  const firstAssignee = task.assignees[0] ?? { userId: '', userName: '' };

  return (
    <>
      <section className="task-panel-schedule" aria-label="Schedule">
        <p className="task-panel-lbl">Schedule <span className="task-panel-optional">(optional)</span></p>
        <div className="task-panel-schedule-grid">
          <label className="task-panel-field">
            <span className="task-panel-field-lbl">Time</span>
            <TimeInput
              className="task-panel-input"
              value={task.dueTime}
              disabled={!canEdit}
              aria-label="Time"
              onChange={(time) => onPatch({ dueTime: time })}
            />
          </label>
          <label className="task-panel-field">
            <span className="task-panel-field-lbl">Duration</span>
            <select className="task-panel-input" value={task.durationMinutes} disabled={!canEdit}
              onChange={(event) => onPatch({ durationMinutes: Number(event.target.value) })}>
              {!isKnownDuration && <option value={task.durationMinutes}>{task.durationMinutes} min</option>}
              {DURATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <TaskRepeatPicker
          repeat={task.repeat}
          canEdit={canEdit}
          onRepeatChange={handleRepeatChange}
        />
      </section>

      <dl className="task-panel-props">
        <div className="task-panel-prop">
          <dt>Due date</dt>
          <dd className="task-panel-due">
            <span className="task-panel-date-wrap">
              <DateInput
                className="task-panel-input"
                value={task.dueDate}
                disabled={!canEdit}
                aria-label="Due date"
                onChange={handleDueDateChange}
              />
            </span>
            {overdueLabel && <span className="task-panel-late">{overdueLabel}</span>}
          </dd>
        </div>
        <div className="task-panel-prop">
          <dt>Priority</dt>
          <dd className="task-panel-with-dot">
            <span className={`task-panel-dot${selectedPriority ? '' : ' none'}`}
              style={{ '--dot-color': selectedPriority?.color || '#cbd5e1' } as CSSProperties} />
            <select className="slim task-panel-input" value={task.priorityId ?? ''} disabled={!canEdit}
              onChange={(event) => onPatch({ priorityId: event.target.value || null })}>
              <option value="">None</option>
              {priorities.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </dd>
        </div>
        {/* Quién la asignó y cuándo: dato de la tarea, no se edita. */}
        <div className="task-panel-prop">
          <dt>Assigned by</dt>
          <dd className="task-panel-with-dot">
            <OpsAvatar id={task.createdByUserId} name={task.createdByUserName} size="sm" />
            <span className="task-panel-readonly">{assignedByLabel}</span>
            {task.createdAt && <span className="task-panel-readonly-sub">{formatDate(task.createdAt)}</span>}
          </dd>
        </div>
        <div className="task-panel-prop">
          <dt>Assignee</dt>
          <dd className="task-panel-with-dot">
            {task.assignees.length > 0 && <OpsAvatar id={firstAssignee.userId} name={firstAssignee.userName} size="sm" />}
            {canReassign ? (
              <AssigneePicker
                assignees={task.assignees}
                assignableUsers={assignableUsers}
                currentUserId={currentUser.id}
                label="Assignee"
                onAssigneesChange={handleAssigneesChange}
              />
            ) : (
              // Se la asignó otra persona: no la puede pasar a alguien más.
              <span className="task-panel-readonly">{assigneesLabel}</span>
            )}
          </dd>
        </div>
        <div className="task-panel-prop">
          <dt>Project</dt>
          <dd>
            <select className="slim task-panel-input" value={task.projectId ?? ''} disabled={!canEdit}
              onChange={(event) => handleProjectChange(event.target.value)}>
              <option value="">No project</option>
              {!isKnownProject && <option value={task.projectId ?? ''}>{task.projectTitle || '—'}</option>}
              {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
            </select>
          </dd>
        </div>
      </dl>
    </>
  );
};

export default TaskFields;
