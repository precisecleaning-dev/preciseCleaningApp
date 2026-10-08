// ⭐ Lista de tareas de gerentes con casilla (vistas Owner y Manager).
//    Owner: muestra a quién está asignada. Manager: muestra quién la pidió.
import { Trash2 } from 'lucide-react';
import { taskDueLabel, type ManagerTask } from '../services/managerTasksService';

interface TaskChecklistProps {
  tasks: ManagerTask[];
  now: Date;
  /** 'assignee' = etiqueta con el gerente · 'author' = "From Omar" */
  meta: 'assignee' | 'author';
  canToggle: (t: ManagerTask) => boolean;
  onToggle: (t: ManagerTask) => void;
  onDelete?: (t: ManagerTask) => void;
  emptyText: string;
}

export default function TaskChecklist({ tasks, now, meta, canToggle, onToggle, onDelete, emptyText }: TaskChecklistProps) {
  if (tasks.length === 0) return <p className="hm-empty">{emptyText}</p>;
  return (
    <ul className="hm-tasks">
      {tasks.map((t) => {
        const due = taskDueLabel(t, now);
        return (
          <li key={t.id} className={`hm-task${t.done ? ' done' : ''}`}>
            <label className="hm-task-main">
              <input
                type="checkbox"
                className="hm-check"
                checked={t.done}
                disabled={!canToggle(t)}
                onChange={() => onToggle(t)}
              />
              <span className="hm-task-text">
                <span className="hm-task-title">{t.title}</span>
                {meta === 'author' && <span className="hm-task-sub">From {t.createdByName || 'the office'}</span>}
              </span>
            </label>
            {meta === 'assignee' && <span className="hm-tag">{t.assigneeName}</span>}
            <span className={`hm-due ${due.tone}`}>{due.text}</span>
            {onDelete && (
              <button type="button" className="hm-task-del" aria-label={`Delete task ${t.title}`} title="Delete" onClick={() => onDelete(t)}>
                <Trash2 size={14} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
