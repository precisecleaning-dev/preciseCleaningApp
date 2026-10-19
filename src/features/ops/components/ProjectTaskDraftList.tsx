// Tareas que se escriben en el formulario de un proyecto NUEVO (título y a
// quién va). No se guarda nada aquí: se crean junto con el proyecto al
// guardarlo. Las filas sin título no se crean.
import { Plus, Trash2 } from 'lucide-react';
import type { AssignableUser, ProjectTaskDraft } from '../../../types/index';
import { MAX_TITLE_LENGTH } from '../../../services/userTasksService';
import ActionButton from './ActionButton';

interface ProjectTaskDraftListProps {
  taskDrafts: ProjectTaskDraft[];
  people: AssignableUser[];
  /** A quién va una tarea nueva al agregar la fila. */
  defaultAssigneeUserId: string;
  maxTaskDrafts: number;
  onTaskDraftsChange: (taskDrafts: ProjectTaskDraft[]) => void;
}

/** Id local para la `key` de cada fila. */
const createDraftId = (): string => `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const ProjectTaskDraftList = ({
  taskDrafts, people, defaultAssigneeUserId, maxTaskDrafts, onTaskDraftsChange,
}: ProjectTaskDraftListProps) => {
  const canAddTaskDraft = taskDrafts.length < maxTaskDrafts;

  const handleAddTaskDraft = () =>
    onTaskDraftsChange([...taskDrafts, { draftId: createDraftId(), title: '', assigneeUserId: defaultAssigneeUserId }]);

  const handleTaskDraftChange = (draftId: string, changes: Partial<Omit<ProjectTaskDraft, 'draftId'>>) =>
    onTaskDraftsChange(taskDrafts.map((taskDraft) => (taskDraft.draftId === draftId ? { ...taskDraft, ...changes } : taskDraft)));

  const handleRemoveTaskDraft = (draftId: string) =>
    onTaskDraftsChange(taskDrafts.filter((taskDraft) => taskDraft.draftId !== draftId));

  return (
    <fieldset className="opm-field opm-task-drafts">
      <legend className="opm-lbl">Tasks</legend>
      {taskDrafts.length > 0 && (
        <ol className="opm-task-draft-list">
          {taskDrafts.map((taskDraft, draftIndex) => (
            <li key={taskDraft.draftId} className="opm-task-draft">
              <input
                className="opm-input opm-task-draft-title"
                value={taskDraft.title}
                maxLength={MAX_TITLE_LENGTH}
                aria-label={`Task ${draftIndex + 1}`}
                onChange={(event) => handleTaskDraftChange(taskDraft.draftId, { title: event.target.value })}
              />
              <select
                className="opm-input opm-task-draft-person"
                value={taskDraft.assigneeUserId}
                aria-label={`Who does task ${draftIndex + 1}`}
                onChange={(event) => handleTaskDraftChange(taskDraft.draftId, { assigneeUserId: event.target.value })}
              >
                {people.map((person) => <option key={person.id} value={person.id}>{person.label}</option>)}
              </select>
              <button type="button" className="danger opm-icon" aria-label={`Remove task ${draftIndex + 1}`}
                onClick={() => handleRemoveTaskDraft(taskDraft.draftId)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ol>
      )}
      <span className="opm-task-draft-add">
        <ActionButton variant="outline" size="sm" icon={<Plus size={14} />} disabled={!canAddTaskDraft}
          onClick={handleAddTaskDraft}>
          Add task
        </ActionButton>
      </span>
    </fieldset>
  );
};

export default ProjectTaskDraftList;
