// Pestañas de las secciones de la lista (Daily · Overdue · Today · This week ·
// Later · No date), cada una con su total. Solo se muestran las que tienen tareas.
import { SECTION_LABEL, type TaskSection } from '../opsDates';
import './TaskSectionTabs.css';

interface TaskSectionTabsProps {
  /** Secciones con tareas, en orden, con cuántas tiene cada una. */
  sectionCounts: { section: TaskSection; taskCount: number }[];
  selectedSection: TaskSection;
  onSelectSection: (section: TaskSection) => void;
}

const TaskSectionTabs = ({ sectionCounts, selectedSection, onSelectSection }: TaskSectionTabsProps) => (
  <div className="task-section-tabs" role="tablist" aria-label="Task sections">
    {sectionCounts.map(({ section, taskCount }) => {
      const isSelected = section === selectedSection;
      return (
        <button
          key={section}
          type="button"
          role="tab"
          aria-selected={isSelected}
          className={`${section} task-section-tab${isSelected ? ' active' : ''}`}
          onClick={() => onSelectSection(section)}
        >
          {SECTION_LABEL[section]}
          <span className="task-section-tab-count">{taskCount}</span>
        </button>
      );
    })}
  </div>
);

export default TaskSectionTabs;
