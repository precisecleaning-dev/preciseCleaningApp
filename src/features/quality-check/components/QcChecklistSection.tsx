// Un área del checklist (Porch, Rooms…): encabezado que la contrae o la
// extiende (con lo que lleva aprobado), sus tareas, "+ Add task" en modo
// "Edit checklist", las flechas para cambiarla de lugar, sus fotos y al final
// su nota (QcSectionNotes: llega armada, como las fotos).
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from 'lucide-react';
import type { QcAnswer, QcSection, QcSectionTask } from '../qcForm';
import QcAddTaskForm from './QcAddTaskForm';
import QcChecklistTaskRow from './QcChecklistTaskRow';

interface QcChecklistSectionProps {
  section: QcSection;
  sectionAnswers: Record<string, string>;
  isCollapsed: boolean;
  isEditingChecklist: boolean;
  canAddTasks: boolean;
  canEditTasks: boolean;
  canRemoveTasks: boolean;
  isFirstSection: boolean;
  isLastSection: boolean;
  /** Se está guardando un cambio de orden: las flechas esperan. */
  isReorderingSections: boolean;
  /** Se está guardando una tarea nueva en esta área. */
  isAddingTask: boolean;
  /** Tareas que se están guardando (renombrar o quitar). */
  pendingTaskIds: ReadonlySet<string>;
  photos: ReactNode;
  /** Nota del área (QcSectionNotes), al final, debajo de las fotos. */
  notesField: ReactNode;
  onToggleCollapsed: (section: QcSection) => void;
  onAnswer: (placeId: string, taskId: string, value: QcAnswer | null) => void;
  onMoveSection: (section: QcSection, positionOffset: -1 | 1) => void;
  onAddTask: (section: QcSection, taskName: string) => void;
  onRenameTask: (section: QcSection, task: QcSectionTask, name: string) => void;
  onRemoveTask: (section: QcSection, task: QcSectionTask) => void;
}

const QcChecklistSection = ({
  section, sectionAnswers, isCollapsed, isEditingChecklist, canAddTasks, canEditTasks, canRemoveTasks,
  isFirstSection, isLastSection, isReorderingSections, isAddingTask, pendingTaskIds, photos, notesField, onToggleCollapsed, onAnswer, onMoveSection, onAddTask, onRenameTask,
  onRemoveTask,
}: QcChecklistSectionProps) => {
  const passedCount = section.tasks.filter((task) => sectionAnswers[task.id] === 'Yes').length;
  const failedCount = section.tasks.filter((task) => sectionAnswers[task.id] === 'No').length;
  const countTone = (() => {
    if (failedCount > 0) return 'bad';
    return passedCount === section.tasks.length ? 'ok' : 'muted';
  })();
  const showMoveButtons = isEditingChecklist && canEditTasks;
  const sectionBodyId = `qcl-section-${section.id}`;

  return (
    <section className="qcl-section" aria-label={section.name}>
      <header className="qcl-head">
        <button
          type="button"
          className="qcl-toggle"
          aria-expanded={!isCollapsed}
          aria-controls={sectionBodyId}
          onClick={() => onToggleCollapsed(section)}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          <h4 className="qcl-name">{section.name}</h4>
          <span className={`qcl-count ${countTone}`}>{passedCount}/{section.tasks.length}</span>
        </button>
        {showMoveButtons && (
          <span className="qcl-move">
            <button
              type="button"
              className="qcl-icon-btn"
              aria-label={`Move ${section.name} up`}
              disabled={isFirstSection || isReorderingSections}
              onClick={() => onMoveSection(section, -1)}
            >
              <ArrowUp size={15} />
            </button>
            <button
              type="button"
              className="qcl-icon-btn"
              aria-label={`Move ${section.name} down`}
              disabled={isLastSection || isReorderingSections}
              onClick={() => onMoveSection(section, 1)}
            >
              <ArrowDown size={15} />
            </button>
          </span>
        )}
      </header>

      {!isCollapsed && (
        <div id={sectionBodyId}>
          <ul className="qcl-items">
            {section.tasks.map((task) => (
              <QcChecklistTaskRow
                key={task.id}
                task={task}
                answer={sectionAnswers[task.id]}
                isEditingChecklist={isEditingChecklist}
                canRenameTask={canEditTasks}
                canRemoveTask={canRemoveTasks}
                isSaving={pendingTaskIds.has(task.id)}
                onAnswer={(answeredTask, value) => onAnswer(section.id, answeredTask.id, value)}
                onRenameTask={(renamedTask, name) => onRenameTask(section, renamedTask, name)}
                onRemoveTask={(removedTask) => onRemoveTask(section, removedTask)}
              />
            ))}
          </ul>
          {isEditingChecklist && canAddTasks && (
            <QcAddTaskForm
              sectionName={section.name}
              isAdding={isAddingTask}
              onAddTask={(taskName) => onAddTask(section, taskName)}
            />
          )}
          <div className="qcl-photos" aria-label={`Photos · ${section.name}`}>
            <span className="qcl-photos-lbl">Photos · {section.name}</span>
            {photos}
          </div>
          {notesField}
        </div>
      )}
    </section>
  );
};

export default QcChecklistSection;
