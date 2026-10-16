// Panel de una tarea: título, sus campos (TaskFields: horario, fecha,
// prioridad, quién la asignó, persona y proyecto), visto bueno, archivos y
// comentarios. Cada cambio se guarda al elegirlo (el título al salir del
// campo). El marco (panel lateral en computadora y pantalla completa en el
// teléfono) es TaskDrawer.
import { CheckCircle2, RotateCcw, Trash2 } from 'lucide-react';
import type {
  AssignableUser, UserTaskApproval, TaskAttachment, TaskProject, UserTask, TaskComment, Priority,
} from '../../../types/index';
import type { TaskPatch } from '../../../services/userTasksService';
import TaskApproval from './TaskApproval';
import TaskAttachments from './TaskAttachments';
import TaskComments from './TaskComments';
import TaskDrawer from './TaskDrawer';
import TaskFields from './TaskFields';

interface TaskPanelProps {
  task: UserTask;
  comments: TaskComment[];
  people: AssignableUser[];
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
  approvers: AssignableUser[];
  defaultApproverId: string;
  onSendApproval: (approver: AssignableUser) => void;
  onDecideApproval: (decision: 'approved' | 'changes', note: string) => void;
  onSetApproval: (approval: UserTaskApproval | null) => void;
}

export default function TaskPanel(props: TaskPanelProps) {
  const {
    task, comments, people, projects, priorities, me, canEdit, canReassign, canDelete, busy, uploading,
    onClose, onPatch, onToggleDone, onDelete, onAddComment, onAttach, onRemoveAttachment,
    approvers, defaultApproverId, onSendApproval, onDecideApproval, onSetApproval,
  } = props;

  const saveTitle = (value: string) => {
    const text = value.trim();
    if (text && text !== task.title) onPatch({ title: text });
  };

  const isDone = task.status === 'done';

  const footer = (
    <>
      {canDelete && (
        <button type="button" className="danger task-panel-btn" onClick={onDelete} disabled={busy}>
          <Trash2 size={15} /> Delete
        </button>
      )}
      <button type="button" className={`task-panel-btn ${isDone ? 'ghost' : 'primary'}`} onClick={onToggleDone} disabled={busy}>
        {isDone ? <><RotateCcw size={15} /> Reopen</> : <><CheckCircle2 size={15} /> Mark done</>}
      </button>
    </>
  );

  return (
    <TaskDrawer
      kicker={`Task${isDone ? ' · Done' : ''}`}
      ariaLabel={`Task · ${task.title}`}
      footer={footer}
      onClose={onClose}
    >
      <input
        key={`${task.id}:${task.title}`}
        className={`task-panel-title${isDone ? ' done' : ''}`}
        defaultValue={task.title}
        disabled={!canEdit}
        aria-label="Task title"
        maxLength={200}
        onBlur={(e) => saveTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />

      <TaskFields
        task={task}
        people={people}
        projects={projects}
        priorities={priorities}
        me={me}
        canEdit={canEdit}
        canReassign={canReassign}
        onPatch={onPatch}
      />

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
    </TaskDrawer>
  );
}
