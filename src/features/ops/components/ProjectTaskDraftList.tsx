// Tareas que se escriben en el formulario de un proyecto NUEVO (título y a
// quién va). No se guarda nada aquí: se crean junto con el proyecto al
// guardarlo. Las filas sin título no se crean. Enter en un título pasa a la
// fila siguiente (o agrega una nueva) en vez de enviar el formulario del proyecto.
import { useRef, useState, type KeyboardEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { AssignableUser, ProjectTaskDraft } from '../../../types/index';
import { MAX_TITLE_LENGTH } from '../../../services/userTasksService';
import ActionButton from './ActionButton';

interface ProjectTaskDraftListProps {
  taskDrafts: ProjectTaskDraft[];
  assignableUsers: AssignableUser[];
  /** A quién va una tarea nueva al agregar la fila. */
  defaultAssigneeUserId: string;
  maxTaskDrafts: number;
  onTaskDraftsChange: (taskDrafts: ProjectTaskDraft[]) => void;
}

const ProjectTaskDraftList = ({
  taskDrafts, assignableUsers, defaultAssigneeUserId, maxTaskDrafts, onTaskDraftsChange,
}: ProjectTaskDraftListProps) => {
  const canAddTaskDraft = taskDrafts.length < maxTaskDrafts;
  // Campo de título de cada fila (para pasar a la siguiente con Enter).
  const titleInputsByDraftId = useRef(new Map<string, HTMLInputElement>());
  // Fila nueva cuyo título toma el foco al aparecer (autoFocus).
  const [draftIdToFocus, setDraftIdToFocus] = useState<string | null>(null);

  // El id solo sirve de `key` de la fila (no va a Firestore).
  const handleAddTaskDraft = () => {
    const newDraftId = crypto.randomUUID();
    onTaskDraftsChange([...taskDrafts, { draftId: newDraftId, title: '', assigneeUserId: defaultAssigneeUserId }]);
    setDraftIdToFocus(newDraftId);
  };

  // Enter adentro del formulario del proyecto lo enviaba (se creaba con las
  // tareas escritas hasta ahí): aquí pasa a la fila siguiente o agrega una.
  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>, draftIndex: number) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const nextTaskDraft = taskDrafts[draftIndex + 1];
    if (nextTaskDraft) titleInputsByDraftId.current.get(nextTaskDraft.draftId)?.focus();
    else if (canAddTaskDraft) handleAddTaskDraft();
  };

  const registerTitleInput = (draftId: string, titleInput: HTMLInputElement | null) => {
    if (titleInput) titleInputsByDraftId.current.set(draftId, titleInput);
    else titleInputsByDraftId.current.delete(draftId);
  };

  const handleTaskDraftChange = (draftId: string, draftChanges: Partial<Omit<ProjectTaskDraft, 'draftId'>>) =>
    onTaskDraftsChange(taskDrafts.map((taskDraft) => (
      taskDraft.draftId === draftId ? { ...taskDraft, ...draftChanges } : taskDraft
    )));

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
                ref={(titleInput) => registerTitleInput(taskDraft.draftId, titleInput)}
                autoFocus={taskDraft.draftId === draftIdToFocus}
                onChange={(event) => handleTaskDraftChange(taskDraft.draftId, { title: event.target.value })}
                onKeyDown={(event) => handleTitleKeyDown(event, draftIndex)}
              />
              <select
                className="opm-input opm-task-draft-person"
                value={taskDraft.assigneeUserId}
                aria-label={`Who does task ${draftIndex + 1}`}
                onChange={(event) => handleTaskDraftChange(taskDraft.draftId, { assigneeUserId: event.target.value })}
              >
                {assignableUsers.map((person) => <option key={person.id} value={person.id}>{person.label}</option>)}
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
