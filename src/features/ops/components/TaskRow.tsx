// Tarjeta de una tarea en la lista: casilla para marcarla hecha, título, datos
// (personas, quién la asignó, vencimiento, repetición, duración, proyecto,
// comentarios, archivos) y el botón "Open". El borde izquierdo es rojo si está
// vencida, verde azulado si se repite a diario y azul si vence hoy.
import type { CSSProperties } from 'react';
import { BadgeCheck, Check, ChevronRight, Clock, Hourglass, MessageSquare, Paperclip } from 'lucide-react';
import type { UserTaskApproval, UserTask } from '../../../types/index';
import { dueLabel, isDailyRepeat, repeatBadgeLabel, sectionOf } from '../opsDates';
import { formatDate, formatDuration } from '../../../utils/dateFormat';
import { getFirstName } from '../opsOptions';
import { isAwaitingApproval } from '../opsPermissions';
import ActionButton from './ActionButton';
import OpsAvatar from './OpsAvatar';
import './TaskRow.css';

interface TaskRowProps {
  task: UserTask;
  /** Hoy, AAAA-MM-DD. */
  todayIsoDate: string;
  /** Nombres de las personas asignadas ("Me, Sandy +1"; "Me" es quien mira). */
  assigneesLabel: string;
  /** Nombre corto de quien la asignó ("Omar"; la fila agrega "From"); null si
   *  se la asignó la misma persona o si es quien se está mirando. */
  assignedByName: string | null;
  /** Título del proyecto en vivo (o la copia guardada en la tarea). */
  projectTitle: string | null;
  /** Color del proyecto (el elegido o el automático). */
  projectColor: string;
  isSelected: boolean;
  isBusy: boolean;
  onOpen: (task: UserTask) => void;
  /** Sin `onMarkDone` la fila no lleva casilla (en "Needs Approval", las que
   *  esperan MI OK: quien da el visto bueno revisa la tarea, no la marca hecha;
   *  en "Done" ya está hecha). */
  onMarkDone?: (task: UserTask) => void;
  /** Tarea hecha (pestaña Done): muestra "Done MM/DD/AAAA" en vez del vencimiento
   *  y no toma el color de su sección. */
  isDoneRow?: boolean;
}

/** Avatares que se ven en la fila (el resto lo cuenta la etiqueta: "+2"). */
const MAX_VISIBLE_AVATARS = 3;

/** Color del borde de la fila: vencida (rojo), diaria (verde azulado) o de hoy
 *  (azul); '' = sin color propio. */
const getRowTone = (task: UserTask, todayIsoDate: string): string => {
  const dueSection = sectionOf(task.dueDate, todayIsoDate);
  if (dueSection === 'overdue') return 'overdue';
  if (isDailyRepeat(task.repeat)) return 'daily';
  return dueSection === 'today' ? 'today' : '';
};

const getApproverFirstName = (approval: UserTaskApproval): string =>
  getFirstName(approval.approverUserName ?? '') || 'approver';

/** Texto de la etiqueta del visto bueno ("Waiting for Omar", "Approved"…). */
function getApprovalLabel(approval: UserTaskApproval): string {
  const approverFirstName = getApproverFirstName(approval);
  if (approval.status === 'pending') return `Waiting for ${approverFirstName}`;
  if (approval.status === 'approved') return 'Approved';
  if (approval.status === 'changes_requested') return 'Changes requested';
  return 'Needs OK';
}

/** Por qué todavía no se puede marcar hecha (null si se puede). */
function getMarkDoneBlockedReason(task: UserTask): string | null {
  if (!task.approval || !isAwaitingApproval(task)) return null;
  const approverFirstName = getApproverFirstName(task.approval);
  return task.approval.status === 'pending'
    ? `Waiting for ${approverFirstName}'s OK`
    : `Needs ${approverFirstName}'s OK before it's done`;
}

const TaskRow = ({
  task, todayIsoDate, assigneesLabel, assignedByName, projectTitle, projectColor, isSelected, isBusy, onOpen,
  onMarkDone, isDoneRow = false,
}: TaskRowProps) => {
  const dueSection = sectionOf(task.dueDate, todayIsoDate);
  const attachmentCount = task.attachments?.length ?? 0;
  const commentCount = task.comments?.length ?? 0;
  const visibleAssignees = task.assignees.slice(0, MAX_VISIBLE_AVATARS);
  const markDoneBlockedReason = getMarkDoneBlockedReason(task);
  const stateClasses = [isDoneRow ? 'done' : getRowTone(task, todayIsoDate), isSelected ? 'selected' : '']
    .filter(Boolean)
    .sort();
  const rowClassName = ['ops-row', ...stateClasses].join(' ');
  return (
    <li className={rowClassName}>
      {onMarkDone && (
        <button
          type="button"
          className="ops-check"
          onClick={() => onMarkDone(task)}
          disabled={isBusy || !!markDoneBlockedReason}
          title={markDoneBlockedReason ?? undefined}
          aria-label={markDoneBlockedReason ?? `Mark "${task.title}" as done`}
        >
          <Check size={14} />
        </button>
      )}
      <button type="button" className="ops-row-main" onClick={() => onOpen(task)}>
        <span className="ops-row-title">{task.title}</span>
        <span className="ops-row-meta">
          <span className="ops-meta-person">
            <span className="ops-avatars">
              {visibleAssignees.map((assignee) => (
                <OpsAvatar key={assignee.userId} id={assignee.userId} name={assignee.userName} size="xs" />
              ))}
            </span>
            {assigneesLabel}
          </span>
          {assignedByName && <span className="ops-meta-from">From {assignedByName}</span>}
          {isDoneRow ? (
            <span className="ops-meta-done">Done {formatDate(task.doneAt)}</span>
          ) : (
            <span className={`ops-meta-due${dueSection === 'overdue' ? ' late' : ''}`}>
              {dueLabel(task.dueDate, task.dueTime, todayIsoDate)}
            </span>
          )}
          {task.approval && (
            <span className={`approval ops-badge ${task.approval.status}`}>
              {task.approval.status === 'approved' ? <BadgeCheck size={11} /> : <Hourglass size={11} />}
              {getApprovalLabel(task.approval)}
            </span>
          )}
          {task.repeat && <span className="ops-badge repeat">{repeatBadgeLabel(task.repeat)}</span>}
          {task.durationMinutes > 0 && (
            <span className="ops-badge time">
              <Clock size={11} /> {formatDuration(task.durationMinutes)}
            </span>
          )}
          {task.projectId && projectTitle && (
            <span className="ops-chip" style={{ '--chip-color': projectColor } as CSSProperties}>
              {projectTitle}
            </span>
          )}
          {commentCount > 0 && (
            <span className="ops-meta-count" aria-label={`${commentCount} comments`}>
              <MessageSquare size={12} /> {commentCount}
            </span>
          )}
          {attachmentCount > 0 && (
            <span className="ops-meta-count" aria-label={`${attachmentCount} attachments`}>
              <Paperclip size={12} /> {attachmentCount}
            </span>
          )}
        </span>
      </button>
      <span className="ops-row-open">
        <ActionButton
          variant="outline"
          size="sm"
          trailingIcon={<ChevronRight size={14} />}
          ariaLabel={`Open "${task.title}"`}
          onClick={() => onOpen(task)}
        >
          Open
        </ActionButton>
      </span>
    </li>
  );
};

export default TaskRow;
