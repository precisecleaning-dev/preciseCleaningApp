// ⭐ Checklist del Quality Check: una sección por área de Settings (en su orden
//    manual) con sus tareas Pass / Fail y sus fotos. Cada área se contrae o se
//    extiende; "Collapse all" / "Expand all" para todas. Con el permiso
//    "QC Checklist Setup" (Roles) aparece "Edit checklist": ordenar las áreas
//    (flechas) y agregar, renombrar o quitar tareas. Esos cambios son del
//    catálogo (Settings → Places / Tasks): valen para todas las casas.
import { useState, type ReactNode } from 'react';
import { Check, Pencil } from 'lucide-react';
import type { QcAnswer, QcSection, QcSectionTask } from '../qcForm';
import QcChecklistSection from './QcChecklistSection';
import './QcChecklist.css';

interface QcChecklistProps {
  sections: QcSection[];
  answers: Record<string, Record<string, string> | undefined>;
  onAnswer: (placeId: string, taskId: string, value: QcAnswer | null) => void;
  /** Cuadrícula de fotos de un área (QcPhotoGrid de esa área). */
  renderSectionPhotos: (section: QcSection) => ReactNode;
  /** Permisos de "QC Checklist Setup": Add = agregar · Edit = renombrar y ordenar · Delete = quitar. */
  canAddTasks: boolean;
  canEditTasks: boolean;
  canRemoveTasks: boolean;
  onMoveSection: (section: QcSection, positionOffset: -1 | 1) => void;
  onAddTask: (section: QcSection, taskName: string) => void;
  onRenameTask: (section: QcSection, task: QcSectionTask, name: string) => void;
  onRemoveTask: (section: QcSection, task: QcSectionTask) => void;
}

const QcChecklist = ({
  sections, answers, onAnswer, renderSectionPhotos, canAddTasks, canEditTasks, canRemoveTasks, onMoveSection,
  onAddTask, onRenameTask, onRemoveTask,
}: QcChecklistProps) => {
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<ReadonlySet<string>>(() => new Set());
  const [isEditingChecklist, setIsEditingChecklist] = useState(false);

  const canSetUpChecklist = canAddTasks || canEditTasks || canRemoveTasks;
  const areAllSectionsCollapsed = sections.length > 0
    && sections.every((section) => collapsedSectionIds.has(section.id));

  const handleToggleCollapsed = (section: QcSection) => {
    setCollapsedSectionIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(section.id)) nextIds.delete(section.id);
      else nextIds.add(section.id);
      return nextIds;
    });
  };

  const handleToggleAllSections = () => {
    setCollapsedSectionIds(areAllSectionsCollapsed ? new Set() : new Set(sections.map((section) => section.id)));
  };

  if (sections.length === 0) {
    return <p className="qcl-empty">No hay áreas con tareas configuradas para esta casa (Settings → Places y Tasks).</p>;
  }

  return (
    <div className="qcl">
      <div className="qcl-toolbar">
        <button type="button" className="qcl-tool-btn" onClick={handleToggleAllSections}>
          {areAllSectionsCollapsed ? 'Expand all' : 'Collapse all'}
        </button>
        {canSetUpChecklist && (
          <button
            type="button"
            className={`qcl-tool-btn${isEditingChecklist ? ' active' : ''}`}
            aria-pressed={isEditingChecklist}
            onClick={() => setIsEditingChecklist((isEditing) => !isEditing)}
          >
            {isEditingChecklist ? <Check size={14} /> : <Pencil size={14} />}
            {isEditingChecklist ? 'Done editing' : 'Edit checklist'}
          </button>
        )}
      </div>
      {isEditingChecklist && (
        <p className="qcl-edit-note">Changes apply to every house and to the next inspections.</p>
      )}
      {sections.map((section, sectionIndex) => (
        <QcChecklistSection
          key={section.id}
          section={section}
          sectionAnswers={answers[section.id] ?? {}}
          isCollapsed={collapsedSectionIds.has(section.id)}
          isEditingChecklist={isEditingChecklist}
          canAddTasks={canAddTasks}
          canEditTasks={canEditTasks}
          canRemoveTasks={canRemoveTasks}
          isFirstSection={sectionIndex === 0}
          isLastSection={sectionIndex === sections.length - 1}
          photos={renderSectionPhotos(section)}
          onToggleCollapsed={handleToggleCollapsed}
          onAnswer={onAnswer}
          onMoveSection={onMoveSection}
          onAddTask={onAddTask}
          onRenameTask={onRenameTask}
          onRemoveTask={onRemoveTask}
        />
      ))}
    </div>
  );
};

export default QcChecklist;
