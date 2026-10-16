// Panel para crear una tarea (botón "Add task" del Task list). Usa el mismo
// marco y los mismos campos que el panel de una tarea (TaskDrawer +
// TaskFields), pero no guarda nada hasta "Add task": los cambios se juntan en
// un borrador. Si alguien tiene que dar el OK, la tarea se crea con el visto
// bueno "por enviar" (se envía después desde el panel de la tarea).
import { useRef, useState, type KeyboardEvent } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { AssignableUser, Priority, TaskAssignee, TaskProject } from '../../../types/index';
import { draftApproval, type TaskInput, type TaskPatch } from '../../../services/userTasksService';
import { todayIso } from '../../../utils/dateFormat';
import TaskDrawer from './TaskDrawer';
import TaskFields from './TaskFields';

interface NewTaskPanelProps {
  people: AssignableUser[];
  projects: TaskProject[];
  priorities: Priority[];
  me: { id: string; name: string };
  /** A quién va la tarea al abrir el panel (la persona que se está mirando). */
  defaultAssignee: TaskAssignee;
  /** Quienes pueden dar el visto bueno (sin uno mismo). */
  approvers: AssignableUser[];
  onClose: () => void;
  onCreate: (input: TaskInput) => Promise<boolean>;
}

const NewTaskPanel = ({
  people, projects, priorities, me, defaultAssignee, approvers, onClose, onCreate,
}: NewTaskPanelProps) => {
  const titleRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState<Omit<TaskInput, 'approval'>>(() => ({
    title: '',
    assignees: [defaultAssignee],
    dueDate: todayIso(),
    dueTime: '',
    durationMinutes: 30,
    priorityId: null,
    projectId: null,
    projectTitle: null,
    repeat: null,
  }));
  const [approverId, setApproverId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handlePatch = (patch: TaskPatch) => setDraft((current) => ({ ...current, ...patch }));

  const handleCreate = async () => {
    const title = draft.title.trim();
    if (!title || isSaving) return;
    setIsSaving(true);
    const approver = approvers.find((person) => person.id === approverId);
    try {
      // onCreate (useTaskActions.add) avisa con un alert si no se pudo guardar.
      const wasCreated = await onCreate({
        ...draft,
        title,
        approval: approver ? draftApproval(approver.id, approver.name) : null,
      });
      if (wasCreated) onClose();
    } catch (error) {
      console.error('No se pudo agregar la tarea:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') void handleCreate();
  };

  // TaskFields muestra "Assigned by": quien crea la tarea, sin fecha todavía.
  const fieldsTask = {
    ...draft,
    status: 'open' as const,
    createdByUserId: me.id,
    createdByUserName: me.name,
    createdAt: '',
  };
  const canCreate = !!draft.title.trim() && !isSaving;

  const footer = (
    <>
      <button type="button" className="ghost task-panel-btn" onClick={onClose} disabled={isSaving}>
        Cancel
      </button>
      <button type="button" className="primary task-panel-btn" onClick={handleCreate} disabled={!canCreate}>
        {isSaving ? <Loader2 size={15} className="task-panel-spin" /> : <Plus size={15} />} Add task
      </button>
    </>
  );

  return (
    <TaskDrawer kicker="New task" ariaLabel="New task" initialFocusRef={titleRef} footer={footer} onClose={onClose}>
      <input
        ref={titleRef}
        className="task-panel-title"
        value={draft.title}
        placeholder="What needs to get done?"
        aria-label="Task title"
        maxLength={200}
        onChange={(e) => handlePatch({ title: e.target.value })}
        onKeyDown={handleTitleKeyDown}
      />

      <TaskFields
        task={fieldsTask}
        people={people}
        projects={projects}
        priorities={priorities}
        me={me}
        canEdit
        canReassign
        onPatch={handlePatch}
      />

      <section className="task-panel-approval" aria-label="Approval">
        <p className="task-panel-approval-title">Approval</p>
        <p className="task-panel-approval-hint">Who needs to OK this before it&apos;s done? (e.g. a social media post)</p>
        <label className="task-panel-approval-for">
          <span>For</span>
          <select className="slim task-panel-input" value={approverId} onChange={(e) => setApproverId(e.target.value)}
            aria-label="Who approves">
            <option value="">No approval needed</option>
            {approvers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
      </section>
    </TaskDrawer>
  );
};

export default NewTaskPanel;
