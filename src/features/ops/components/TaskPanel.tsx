// Panel de una tarea: título, horario (repetición, hora, duración), fecha,
// prioridad, quién la asignó (solo lectura), persona, proyecto, archivos y
// comentarios. Cada cambio se guarda
// al elegirlo (el título al salir del campo). Panel lateral en computadora y
// pantalla completa en el teléfono.
import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { CheckCircle2, RotateCcw, Trash2, X } from 'lucide-react';
import type { UserTaskApproval, TaskAttachment, TaskProject, UserTask, TaskComment, Priority, RepeatFreq } from '../../../types/index';
import DateInput from '../../../shared/components/DateInput';
import { formatDate } from '../../../utils/dateFormat';
import { lateLabel, ymdToDate } from '../opsDates';
import {
  DURATION_OPTIONS, REPEAT_OPTIONS, repeatValue, TIME_OPTIONS, WEEKDAY_LETTERS, WEEKDAY_NAMES,
} from '../opsOptions';
import type { TaskPatch } from '../../../services/userTasksService';
import OpsAvatar from './OpsAvatar';
import type { PersonOption } from '../opsPermissions';
import TaskApproval from './TaskApproval';
import TaskAttachments from './TaskAttachments';
import TaskComments from './TaskComments';
import './TaskPanel.css';

interface TaskPanelProps {
  task: UserTask;
  comments: TaskComment[];
  people: PersonOption[];
  projects: TaskProject[];
  priorities: Priority[];
  me: { id: string; name: string };
  canEdit: boolean;
  /** Cambiar "Assignee": quien la asignó (o Edit, si no es suya). */
  canReassign: boolean;
  canDelete: boolean;
  busy: boolean;
  uploading: boolean;
  onClose: () => void;
  onPatch: (patch: TaskPatch) => void;
  onToggleDone: () => void;
  onDelete: () => void;
  onAddComment: (text: string) => Promise<boolean>;
  onAttach: (files: File[]) => void;
  onRemoveAttachment: (attachment: TaskAttachment) => void;
  /** Quienes pueden dar el visto bueno y el que se propone por defecto. */
  approvers: PersonOption[];
  defaultApproverId: string;
  onSendApproval: (approver: PersonOption) => void;
  onDecideApproval: (decision: 'approved' | 'changes', note: string) => void;
  onSetApproval: (approval: UserTaskApproval | null) => void;
}

export default function TaskPanel(props: TaskPanelProps) {
  const {
    task, comments, people, projects, priorities, me, canEdit, canReassign, canDelete, busy, uploading,
    onClose, onPatch, onToggleDone, onDelete, onAddComment, onAttach, onRemoveAttachment,
    approvers, defaultApproverId, onSendApproval, onDecideApproval, onSetApproval,
  } = props;
  const rootRef = useRef<HTMLElement | null>(null);

  // El foco entra al panel al abrirlo y vuelve a donde estaba al cerrarlo.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    rootRef.current?.focus();
    return () => { prev?.focus?.(); };
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  const saveTitle = (value: string) => {
    const text = value.trim();
    if (text && text !== task.title) onPatch({ title: text });
  };

  const setRepeat = (freq: '' | RepeatFreq) => {
    if (!freq) return onPatch({ repeat: null });
    if (freq === 'weekly') {
      const day = task.dueDate ? ymdToDate(task.dueDate).getDay() : new Date().getDay();
      return onPatch({ repeat: { freq, days: [day] } });
    }
    onPatch({ repeat: { freq } });
  };

  const toggleDay = (day: number) => {
    const days = task.repeat?.days || [];
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort();
    if (next.length === 0) return; // al menos un día
    onPatch({ repeat: { freq: 'weekly', days: next } });
  };

  const late = task.status === 'open' ? lateLabel(task.dueDate) : '';
  const priority = priorities.find((p) => p.id === task.priorityId);
  const knownAssignee = people.some((p) => p.id === task.assigneeUserId);
  const knownProject = !task.projectId || projects.some((p) => p.id === task.projectId);
  const isDone = task.status === 'done';

  return (
    <div className="otp-overlay" onClick={onClose}>
      <aside
        ref={rootRef}
        className="otp"
        role="dialog"
        aria-modal="true"
        aria-label={`Task · ${task.title}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <header className="otp-head">
          <p className="otp-kicker">Task{isDone ? ' · Done' : ''}</p>
          <button type="button" className="otp-icon-btn" onClick={onClose} aria-label="Close task">
            <X size={18} />
          </button>
        </header>

        <div className="otp-body">
          <input
            key={`${task.id}:${task.title}`}
            className={`otp-title${isDone ? ' done' : ''}`}
            defaultValue={task.title}
            disabled={!canEdit}
            aria-label="Task title"
            maxLength={200}
            onBlur={(e) => saveTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />

          <section className="otp-schedule" aria-label="Schedule">
            <p className="otp-lbl">Schedule <span className="otp-optional">(optional)</span></p>
            <div className="otp-schedule-grid">
              <label className="otp-field">
                <span className="otp-field-lbl">Repeat</span>
                <select className="otp-input" value={repeatValue(task.repeat)} disabled={!canEdit}
                  onChange={(e) => setRepeat(e.target.value as '' | RepeatFreq)}>
                  {REPEAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="otp-field">
                <span className="otp-field-lbl">Time</span>
                <select className="otp-input" value={task.dueTime || ''} disabled={!canEdit}
                  onChange={(e) => onPatch({ dueTime: e.target.value })}>
                  {TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="otp-field">
                <span className="otp-field-lbl">How long</span>
                <select className="otp-input" value={task.durationMinutes} disabled={!canEdit}
                  onChange={(e) => onPatch({ durationMinutes: Number(e.target.value) })}>
                  {!DURATION_OPTIONS.some((o) => o.value === task.durationMinutes) && (
                    <option value={task.durationMinutes}>{task.durationMinutes} min</option>
                  )}
                  {DURATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>
            {task.repeat?.freq === 'weekly' && (
              <div className="otp-days" role="group" aria-label="Repeat on">
                {WEEKDAY_LETTERS.map((letter, day) => {
                  const on = !!task.repeat?.days?.includes(day);
                  return (
                    <button
                      key={WEEKDAY_NAMES[day]}
                      type="button"
                      className={`otp-day${on ? ' on' : ''}`}
                      aria-pressed={on}
                      aria-label={WEEKDAY_NAMES[day]}
                      disabled={!canEdit}
                      onClick={() => toggleDay(day)}
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <dl className="otp-props">
            <div className="otp-prop">
              <dt>Due date</dt>
              <dd className="otp-due">
                <span className="otp-date-wrap">
                  <DateInput
                    className="otp-input"
                    value={task.dueDate}
                    disabled={!canEdit}
                    aria-label="Due date"
                    onChange={(iso) => { if (iso === '' || /^\d{4}-\d{2}-\d{2}$/.test(iso)) onPatch({ dueDate: iso }); }}
                  />
                </span>
                {late && <span className="otp-late">{late}</span>}
              </dd>
            </div>
            <div className="otp-prop">
              <dt>Priority</dt>
              <dd className="otp-with-dot">
                <span className={`otp-dot${priority ? '' : ' none'}`}
                  style={{ '--dot-color': priority?.color || '#cbd5e1' } as CSSProperties} />
                <select className="otp-input slim" value={task.priorityId || ''} disabled={!canEdit}
                  onChange={(e) => onPatch({ priorityId: e.target.value || null })}>
                  <option value="">None</option>
                  {priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </dd>
            </div>
            {/* Quién la asignó y cuándo: dato de la tarea, no se edita. */}
            <div className="otp-prop">
              <dt>Assigned by</dt>
              <dd className="otp-with-dot">
                <OpsAvatar id={task.createdByUserId} name={task.createdByUserName} size="sm" />
                <span className="otp-readonly">
                  {task.createdByUserId === me.id
                    ? `Me (${(task.createdByUserName || me.name).split(' ')[0]})`
                    : task.createdByUserName || '—'}
                </span>
                {task.createdAt && <span className="otp-readonly-sub">{formatDate(task.createdAt)}</span>}
              </dd>
            </div>
            <div className="otp-prop">
              <dt>Assignee</dt>
              <dd className="otp-with-dot">
                <OpsAvatar id={task.assigneeUserId} name={task.assigneeUserName} size="sm" />
                {canReassign ? (
                  <select className="otp-input slim" value={task.assigneeUserId}
                    onChange={(e) => {
                      const p = people.find((x) => x.id === e.target.value);
                      if (p) onPatch({ assigneeUserId: p.id, assigneeUserName: p.name });
                    }}>
                    {!knownAssignee && <option value={task.assigneeUserId}>{task.assigneeUserName || '—'}</option>}
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>{p.id === me.id ? `Me (${p.name.split(' ')[0]})` : p.name}</option>
                    ))}
                  </select>
                ) : (
                  // Se la asignó otra persona: no la puede pasar a alguien más.
                  <span className="otp-readonly">
                    {task.assigneeUserId === me.id
                      ? `Me (${(task.assigneeUserName || me.name).split(' ')[0]})`
                      : task.assigneeUserName || '—'}
                  </span>
                )}
              </dd>
            </div>
            <div className="otp-prop">
              <dt>Project</dt>
              <dd>
                <select className="otp-input slim" value={task.projectId || ''} disabled={!canEdit}
                  onChange={(e) => {
                    const p = projects.find((x) => x.id === e.target.value);
                    onPatch({ projectId: p ? p.id : null, projectTitle: p ? p.title : null });
                  }}>
                  <option value="">No project</option>
                  {!knownProject && <option value={task.projectId || ''}>{task.projectTitle || '—'}</option>}
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </dd>
            </div>
          </dl>

          <TaskApproval
            key={`${task.id}:${task.approval?.status ?? 'none'}`}
            approval={task.approval ?? null}
            approvers={approvers}
            defaultApproverId={defaultApproverId}
            meId={me.id}
            canManage={canEdit && !isDone}
            busy={busy}
            onSend={onSendApproval}
            onDecide={onDecideApproval}
            onSetApproval={onSetApproval}
          />
          <TaskAttachments
            attachments={task.attachments || []}
            canRemove={canEdit}
            uploading={uploading}
            onAttach={onAttach}
            onRemove={onRemoveAttachment}
          />
          <TaskComments comments={comments} me={me} onAdd={onAddComment} />
        </div>

        <footer className="otp-foot">
          {canDelete && (
            <button type="button" className="otp-btn danger" onClick={onDelete} disabled={busy}>
              <Trash2 size={15} /> Delete
            </button>
          )}
          <button type="button" className={`otp-btn ${isDone ? 'ghost' : 'primary'}`} onClick={onToggleDone} disabled={busy}>
            {isDone ? <><RotateCcw size={15} /> Reopen</> : <><CheckCircle2 size={15} /> Mark done</>}
          </button>
        </footer>
      </aside>
    </div>
  );
}
