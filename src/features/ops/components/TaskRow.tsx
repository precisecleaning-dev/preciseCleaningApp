// Fila de una tarea en la lista: casilla para marcarla hecha, título y datos
// (persona, quién la asignó, vencimiento, repetición, duración, proyecto,
// comentarios, archivos).
import type { CSSProperties } from 'react';
import { BadgeCheck, Check, Clock, Hourglass, MessageSquare, Paperclip } from 'lucide-react';
import type { OpsApproval, OpsTask } from '../../../types/index';
import { dueLabel, formatMinutes, REPEAT_LABEL, sectionOf, type TaskSection } from '../opsDates';
import OpsAvatar from './OpsAvatar';
import './TaskRow.css';

interface TaskRowProps {
  task: OpsTask;
  today: string;
  /** Nombre que se muestra de la persona asignada ("Me" si es quien mira). */
  assigneeLabel: string;
  /** Quién la asignó ("From Omar"); null si se la asignó la misma persona o
   *  si es quien se está mirando (pestaña "Assigned by"). */
  assignedByLabel: string | null;
  /** Título del proyecto en vivo (o la copia guardada en la tarea). */
  projectName: string | null;
  /** Color del proyecto (el elegido o el automático). */
  projectColor: string;
  selected: boolean;
  busy: boolean;
  onOpen: (task: OpsTask) => void;
  onComplete: (task: OpsTask) => void;
}

const ROW_TONE: Record<TaskSection, string> = {
  overdue: ' overdue',
  today: ' today',
  week: '',
  later: '',
  nodate: '',
};

/** Texto de la etiqueta del visto bueno ("Waiting for Omar", "Approved"…). */
function approvalLabel(a: OpsApproval): string {
  const first = (a.approverUserName || '').split(' ')[0] || 'approver';
  if (a.status === 'pending') return `Waiting for ${first}`;
  if (a.status === 'approved') return 'Approved';
  if (a.status === 'changes') return 'Changes requested';
  return 'Needs OK';
}

export default function TaskRow({
  task, today, assigneeLabel, assignedByLabel, projectName, projectColor, selected, busy, onOpen, onComplete,
}: TaskRowProps) {
  const section = sectionOf(task.dueDate, today);
  const attachments = task.attachments?.length || 0;
  const commentCount = task.comments?.length || 0;
  return (
    <li className={`ops-row${ROW_TONE[section]}${selected ? ' selected' : ''}`}>
      <button
        type="button"
        className="ops-check"
        onClick={() => onComplete(task)}
        disabled={busy}
        aria-label={`Mark "${task.title}" as done`}
      >
        <Check size={14} />
      </button>
      <button type="button" className="ops-row-main" onClick={() => onOpen(task)}>
        <span className="ops-row-title">{task.title}</span>
        <span className="ops-row-meta">
          <span className="ops-meta-person">
            <OpsAvatar id={task.assigneeUserId} name={task.assigneeUserName} size="xs" />
            {assigneeLabel}
          </span>
          {assignedByLabel && <span className="ops-meta-from">From {assignedByLabel}</span>}
          <span className={`ops-meta-due${section === 'overdue' ? ' late' : ''}`}>
            {dueLabel(task.dueDate, task.dueTime, today)}
          </span>
          {task.approval && (
            <span className={`ops-badge approval ${task.approval.status}`}>
              {task.approval.status === 'approved' ? <BadgeCheck size={11} /> : <Hourglass size={11} />}
              {approvalLabel(task.approval)}
            </span>
          )}
          {task.repeat && <span className="ops-badge repeat">{REPEAT_LABEL[task.repeat.freq]}</span>}
          {task.durationMinutes > 0 && (
            <span className="ops-badge time">
              <Clock size={11} /> {formatMinutes(task.durationMinutes)}
            </span>
          )}
          {task.projectId && projectName && (
            <span className="ops-chip" style={{ '--chip-color': projectColor } as CSSProperties}>
              {projectName}
            </span>
          )}
          {commentCount > 0 && (
            <span className="ops-meta-count" aria-label={`${commentCount} comments`}>
              <MessageSquare size={12} /> {commentCount}
            </span>
          )}
          {attachments > 0 && (
            <span className="ops-meta-count" aria-label={`${attachments} attachments`}>
              <Paperclip size={12} /> {attachments}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
