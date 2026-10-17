// Una tarea del checklist. Normal: nombre y botones Pass / Fail (tocar el ya
// marcado lo deja sin responder). En "Edit checklist": el nombre se puede
// cambiar (se guarda al salir del campo o con Enter) y la tarea se puede quitar.
import { useState, type KeyboardEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { MAX_CHECKLIST_TASK_NAME_LENGTH } from '../../../services/settingsTasksService';
import type { QcAnswer, QcSectionTask } from '../qcForm';

interface QcChecklistTaskRowProps {
  task: QcSectionTask;
  answer: string | undefined;
  isEditingChecklist: boolean;
  canRenameTask: boolean;
  canRemoveTask: boolean;
  onAnswer: (task: QcSectionTask, value: QcAnswer | null) => void;
  onRenameTask: (task: QcSectionTask, name: string) => void;
  onRemoveTask: (task: QcSectionTask) => void;
}

const QcChecklistTaskRow = ({
  task, answer, isEditingChecklist, canRenameTask, canRemoveTask, onAnswer, onRenameTask, onRemoveTask,
}: QcChecklistTaskRowProps) => {
  // Nombre que se escribe mientras no se guarda (null = muestra el guardado).
  const [taskNameDraft, setTaskNameDraft] = useState<string | null>(null);

  const handleSaveTaskName = () => {
    if (taskNameDraft === null) return;
    const trimmedName = taskNameDraft.trim();
    setTaskNameDraft(null);
    if (trimmedName && trimmedName !== task.name) onRenameTask(task, trimmedName);
  };

  const handleTaskNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') {
      setTaskNameDraft(null);
      event.currentTarget.blur();
    }
  };

  if (isEditingChecklist) {
    return (
      <li className="editing qcl-item">
        {canRenameTask ? (
          <input
            className="qcl-task-input"
            value={taskNameDraft ?? task.name}
            maxLength={MAX_CHECKLIST_TASK_NAME_LENGTH}
            aria-label={`Task name: ${task.name}`}
            onChange={(event) => setTaskNameDraft(event.target.value)}
            onBlur={handleSaveTaskName}
            onKeyDown={handleTaskNameKeyDown}
          />
        ) : (
          <span className="qcl-task">{task.name}</span>
        )}
        {canRemoveTask && (
          <button
            type="button"
            className="qcl-icon-btn remove"
            aria-label={`Remove "${task.name}" from the checklist`}
            title="Remove from the checklist"
            onClick={() => onRemoveTask(task)}
          >
            <Trash2 size={15} />
          </button>
        )}
      </li>
    );
  }

  return (
    <li className="qcl-item">
      <span className="qcl-task">{task.name}</span>
      <div className="qcl-yn" role="group" aria-label={task.name}>
        <button
          type="button"
          className={`qcl-btn${answer === 'Yes' ? ' ok' : ''}`}
          aria-pressed={answer === 'Yes'}
          onClick={() => onAnswer(task, answer === 'Yes' ? null : 'Yes')}
        >
          Pass
        </button>
        <button
          type="button"
          className={`qcl-btn${answer === 'No' ? ' bad' : ''}`}
          aria-pressed={answer === 'No'}
          onClick={() => onAnswer(task, answer === 'No' ? null : 'No')}
        >
          Fail
        </button>
      </div>
    </li>
  );
};

export default QcChecklistTaskRow;
