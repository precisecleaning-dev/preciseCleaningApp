// "+ Add task" al final de un área del checklist (modo "Edit checklist").
import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { MAX_CHECKLIST_TASK_NAME_LENGTH } from '../../../services/settingsTasksService';

interface QcAddTaskFormProps {
  sectionName: string;
  /** Se está guardando la tarea anterior: el botón espera (evita duplicados). */
  isAdding: boolean;
  onAddTask: (taskName: string) => void;
}

const QcAddTaskForm = ({ sectionName, isAdding, onAddTask }: QcAddTaskFormProps) => {
  const [newTaskName, setNewTaskName] = useState('');
  const trimmedTaskName = newTaskName.trim();

  const handleAddTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedTaskName || isAdding) return;
    onAddTask(trimmedTaskName);
    setNewTaskName('');
  };

  return (
    <form className="qcl-add" onSubmit={handleAddTask}>
      <input
        className="qcl-task-input"
        value={newTaskName}
        maxLength={MAX_CHECKLIST_TASK_NAME_LENGTH}
        placeholder="New task"
        aria-label={`New task for ${sectionName}`}
        onChange={(event) => setNewTaskName(event.target.value)}
      />
      <button type="submit" className="qcl-add-btn" disabled={!trimmedTaskName || isAdding}>
        <Plus size={14} /> {isAdding ? 'Adding…' : 'Add task'}
      </button>
    </form>
  );
};

export default QcAddTaskForm;
