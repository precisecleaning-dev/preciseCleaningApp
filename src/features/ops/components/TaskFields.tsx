// Campos de una tarea que comparten el panel de ver/editar y el de crear:
// horario (repetición, hora, duración y días), fecha, prioridad, quién la
// asignó (solo lectura), personas y proyecto. Cada cambio sale por `onPatch`
// (el panel de editar lo guarda al instante; el de crear lo junta hasta "Add task").
import type { CSSProperties } from 'react';
import type {
  AssignableUser, Priority, RepeatFreq, TaskAssignee, TaskProject, UserTask,
} from '../../../types/index';
import DateInput from '../../../shared/components/DateInput';
import TimeInput from '../../../shared/components/TimeInput';
import { formatDate } from '../../../utils/dateFormat';
import type { TaskPatch } from '../../../services/userTasksService';
import { lateLabel, ymdToDate } from '../opsDates';
import {
  DURATION_OPTIONS, REPEAT_OPTIONS, repeatValue, WEEKDAY_LETTERS, WEEKDAY_NAMES,
} from '../opsOptions';
import AssigneePicker from './AssigneePicker';
import OpsAvatar from './OpsAvatar';

interface TaskFieldsProps {
  task: Pick<UserTask,
    'status' | 'dueDate' | 'dueTime' | 'durationMinutes' | 'repeat' | 'priorityId' | 'assignees'
    | 'projectId' | 'projectTitle' | 'createdByUserId' | 'createdByUserName' | 'createdAt'>;
  people: AssignableUser[];
  projects: TaskProject[];
  priorities: Priority[];
  me: { id: string; name: string };
  canEdit: boolean;
  /** Cambiar "Assignee" (las personas): quien la asignó (o Edit, si no es suya). */
  canReassign: boolean;
  onPatch: (patch: TaskPatch) => void;
}

const firstName = (name: string) => name.split(' ')[0];

const TaskFields = ({ task, people, projects, priorities, me, canEdit, canReassign, onPatch }: TaskFieldsProps) => {
  const handleRepeatChange = (freq: '' | RepeatFreq) => {
    if (!freq) return onPatch({ repeat: null });
    if (freq === 'weekly') {
      const day = task.dueDate ? ymdToDate(task.dueDate).getDay() : new Date().getDay();
      return onPatch({ repeat: { freq, days: [day] } });
    }
    onPatch({ repeat: { freq } });
  };

  const handleToggleDay = (day: number) => {
    const days = task.repeat?.days ?? [];
    const nextDays = days.includes(day) ? days.filter((current) => current !== day) : [...days, day].sort();
    if (nextDays.length === 0) return; // al menos un día
    onPatch({ repeat: { freq: 'weekly', days: nextDays } });
  };

  const handleDueDateChange = (iso: string) => {
    if (iso === '' || /^\d{4}-\d{2}-\d{2}$/.test(iso)) onPatch({ dueDate: iso });
  };

  const handleAssigneesChange = (assignees: TaskAssignee[]) => onPatch({ assignees });

  const handleProjectChange = (projectId: string) => {
    const project = projects.find((option) => option.id === projectId);
    onPatch({ projectId: project?.id ?? null, projectTitle: project?.title ?? null });
  };

  const late = task.status === 'open' ? lateLabel(task.dueDate) : '';
  const priority = priorities.find((option) => option.id === task.priorityId);
  const knownProject = !task.projectId || projects.some((project) => project.id === task.projectId);
  const knownDuration = DURATION_OPTIONS.some((option) => option.value === task.durationMinutes);
  const assignedByName = task.createdByUserId === me.id
    ? `Me (${firstName(task.createdByUserName || me.name)})`
    : task.createdByUserName || '—';
  const assigneeNames = task.assignees
    .map((assignee) => (assignee.userId === me.id ? `Me (${firstName(assignee.userName || me.name)})` : assignee.userName))
    .join(', ') || '—';
  const firstAssignee = task.assignees[0] ?? { userId: '', userName: '' };

  return (
    <>
      <section className="task-panel-schedule" aria-label="Schedule">
        <p className="task-panel-lbl">Schedule <span className="task-panel-optional">(optional)</span></p>
        <div className="task-panel-schedule-grid">
          <label className="task-panel-field">
            <span className="task-panel-field-lbl">Repeat</span>
            <select className="task-panel-input" value={repeatValue(task.repeat)} disabled={!canEdit}
              onChange={(e) => handleRepeatChange(e.target.value as '' | RepeatFreq)}>
              {REPEAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="task-panel-field">
            <span className="task-panel-field-lbl">Time</span>
            <TimeInput
              className="task-panel-input"
              value={task.dueTime}
              disabled={!canEdit}
              aria-label="Time"
              onChange={(hm) => onPatch({ dueTime: hm })}
            />
          </label>
          <label className="task-panel-field">
            <span className="task-panel-field-lbl">How long</span>
            <select className="task-panel-input" value={task.durationMinutes} disabled={!canEdit}
              onChange={(e) => onPatch({ durationMinutes: Number(e.target.value) })}>
              {!knownDuration && <option value={task.durationMinutes}>{task.durationMinutes} min</option>}
              {DURATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        {task.repeat?.freq === 'weekly' && (
          <div className="task-panel-days" role="group" aria-label="Repeat on">
            {WEEKDAY_LETTERS.map((letter, day) => {
              const isOn = !!task.repeat?.days?.includes(day);
              return (
                <button
                  key={WEEKDAY_NAMES[day]}
                  type="button"
                  className={`task-panel-day${isOn ? ' on' : ''}`}
                  aria-pressed={isOn}
                  aria-label={WEEKDAY_NAMES[day]}
                  disabled={!canEdit}
                  onClick={() => handleToggleDay(day)}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        )}
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
            {late && <span className="task-panel-late">{late}</span>}
          </dd>
        </div>
        <div className="task-panel-prop">
          <dt>Priority</dt>
          <dd className="task-panel-with-dot">
            <span className={`task-panel-dot${priority ? '' : ' none'}`}
              style={{ '--dot-color': priority?.color || '#cbd5e1' } as CSSProperties} />
            <select className="slim task-panel-input" value={task.priorityId ?? ''} disabled={!canEdit}
              onChange={(e) => onPatch({ priorityId: e.target.value || null })}>
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
            <span className="task-panel-readonly">{assignedByName}</span>
            {task.createdAt && <span className="task-panel-readonly-sub">{formatDate(task.createdAt)}</span>}
          </dd>
        </div>
        <div className="task-panel-prop">
          <dt>Assignee</dt>
          <dd className="task-panel-with-dot">
            <OpsAvatar id={firstAssignee.userId} name={firstAssignee.userName} size="sm" />
            {canReassign ? (
              <AssigneePicker
                assignees={task.assignees}
                assignableUsers={people}
                currentUserId={me.id}
                label="Assignee"
                onAssigneesChange={handleAssigneesChange}
              />
            ) : (
              // Se la asignó otra persona: no la puede pasar a alguien más.
              <span className="task-panel-readonly">{assigneeNames}</span>
            )}
          </dd>
        </div>
        <div className="task-panel-prop">
          <dt>Project</dt>
          <dd>
            <select className="slim task-panel-input" value={task.projectId ?? ''} disabled={!canEdit}
              onChange={(e) => handleProjectChange(e.target.value)}>
              <option value="">No project</option>
              {!knownProject && <option value={task.projectId ?? ''}>{task.projectTitle || '—'}</option>}
              {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
            </select>
          </dd>
        </div>
      </dl>
    </>
  );
};

export default TaskFields;
