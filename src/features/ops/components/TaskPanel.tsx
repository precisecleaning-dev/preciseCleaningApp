// Panel de una tarea: título, sus campos (TaskFields: horario, fecha,
// prioridad, quién la asignó, persona y proyecto), visto bueno, archivos y
// comentarios. Cada cambio se guarda al elegirlo (el título al salir del
// campo). El marco (panel lateral en computadora y pantalla completa en el
// teléfono) es TaskDrawer.
import type { FocusEvent, KeyboardEvent } from 'react';
import { CheckCircle2, RotateCcw, Trash2 } from 'lucide-react';
import type {
  Actor, ApprovalDecision, AssignableUser, UserTaskApproval, TaskAttachment, TaskProject, UserTask, TaskComment, Priority,
} from '../../../types/index';
import { MAX_TITLE_LENGTH, type TaskPatch } from '../../../services/userTasksService';
import TaskApproval from './TaskApproval';
import TaskAttachments from './TaskAttachments';
import TaskComments from './TaskComments';
import TaskDrawer from './TaskDrawer';
import TaskFields from './TaskFields';

interface TaskPanelProps {
  task: UserTask;
  comments: TaskComment[];
  assignableUsers: AssignableUser[];
  projects: TaskProject[];
  priorities: Priority[];
  currentUser: { id: string; name: string };
  canEdit: boolean;
  /** Cambiar "Assignee": quien la asignó (o Edit, si no es suya). */
  canReassign: boolean;
  canDelete: boolean;
  isBusy: boolean;
  isUploading: boolean;
  onClose: () => void;
  onPatch: (patch: TaskPatch) => void;
  onToggleDone: () => void;
  onDelete: () => void;
  onAddComment: (text: string) => Promise<boolean>;
  onAttachFiles: (files: File[]) => void;
  onRemoveAttachment: (attachment: TaskAttachment) => void;
  /** Quienes pueden dar el visto bueno y el que se propone por defecto. */
  approvers: AssignableUser[];
  defaultApproverUserId: string;
  onSendApproval: (approver: Actor) => void;
  onDecideApproval: (decision: ApprovalDecision, note: string) => Promise<boolean>;
  onSetApproval: (approval: UserTaskApproval | null) => void;
}

export default function TaskPanel(props: TaskPanelProps) {
  const {
    task, comments, assignableUsers, projects, priorities, currentUser, canEdit, canReassign, canDelete,
    isBusy, isUploading, onClose, onPatch, onToggleDone, onDelete, onAddComment, onAttachFiles,
    onRemoveAttachment, approvers, defaultApproverUserId, onSendApproval, onDecideApproval, onSetApproval,
  } = props;

  // Un título vacío no se guarda: el campo vuelve al título que tiene la tarea.
  const handleSaveTitle = (event: FocusEvent<HTMLInputElement>) => {
    const inputValue = event.target.value;
    const trimmedTitle = inputValue.trim();
    if (!trimmedTitle) {
      event.target.value = task.title;
      return;
    }
    if (trimmedTitle !== task.title) onPatch({ title: trimmedTitle });
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  const isDone = task.status === 'done';

  const footerActions = (
    <>
      {canDelete && (
        <button type="button" className="danger task-panel-btn" onClick={onDelete} disabled={isBusy}>
          <Trash2 size={15} /> Delete
        </button>
      )}
      <button type="button" className={`task-panel-btn ${isDone ? 'ghost' : 'primary'}`} onClick={onToggleDone} disabled={isBusy}>
        {isDone ? <><RotateCcw size={15} /> Reopen</> : <><CheckCircle2 size={15} /> Mark done</>}
      </button>
    </>
  );

  return (
    <TaskDrawer
      headerLabel={`Task${isDone ? ' · Done' : ''}`}
      ariaLabel={`Task · ${task.title}`}
      footerActions={footerActions}
      onClose={onClose}
    >
      <input
        key={`${task.id}:${task.title}`}
        className={`task-panel-title${isDone ? ' done' : ''}`}
        defaultValue={task.title}
        disabled={!canEdit}
        aria-label="Task title"
        maxLength={MAX_TITLE_LENGTH}
        onBlur={handleSaveTitle}
        onKeyDown={handleTitleKeyDown}
      />

      <TaskFields
        task={task}
        assignableUsers={assignableUsers}
        projects={projects}
        priorities={priorities}
        currentUser={currentUser}
        canEdit={canEdit}
        canReassign={canReassign}
        onPatch={onPatch}
      />

      <TaskApproval
        key={`${task.id}:${task.approval?.status ?? 'none'}`}
        approval={task.approval ?? null}
        approvers={approvers}
        defaultApproverUserId={defaultApproverUserId}
        currentUserId={currentUser.id}
        canManageApproval={canEdit && !isDone}
        isBusy={isBusy}
        onSendForApproval={onSendApproval}
        onDecideApproval={onDecideApproval}
        onApprovalChange={onSetApproval}
      />
      <TaskAttachments
        attachments={task.attachments ?? []}
        canRemove={canEdit}
        uploading={isUploading}
        onAttach={onAttachFiles}
        onRemove={onRemoveAttachment}
      />
      <TaskComments comments={comments} me={currentUser} onAdd={onAddComment} />
    </TaskDrawer>
  );
}
