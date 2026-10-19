// Pestañas de la lista (Overdue · Daily · Needs Approval · This week · Later ·
// No date · ALL · Done) en el orden que eligió quien edita Task List. Cada una
// con su total; "Done" sin total (se pide por páginas al abrirla). Quien puede
// cambiar el orden ve al final el botón para hacerlo.
import { CheckCircle2, SlidersHorizontal } from 'lucide-react';
import type { TaskListTabId } from '../../../types/index';
import { TASK_LIST_TAB_LABEL } from '../taskListTabs';
import './TaskSectionTabs.css';

interface TaskSectionTabsProps {
  /** Pestañas que se muestran, en orden, con su total (null = sin total). */
  tabs: { tabId: TaskListTabId; taskCount: number | null }[];
  selectedTabId: TaskListTabId;
  onSelectTab: (tabId: TaskListTabId) => void;
  /** Sin este handler no se muestra el botón de ordenar pestañas. */
  onEditTabOrder?: () => void;
}

const TaskSectionTabs = ({ tabs, selectedTabId, onSelectTab, onEditTabOrder }: TaskSectionTabsProps) => (
  <div className="task-section-tabs" role="tablist" aria-label="Task sections">
    {tabs.map(({ tabId, taskCount }) => {
      const isSelected = tabId === selectedTabId;
      return (
        <button
          key={tabId}
          type="button"
          role="tab"
          aria-selected={isSelected}
          className={`${tabId} task-section-tab${isSelected ? ' active' : ''}`}
          onClick={() => onSelectTab(tabId)}
        >
          {tabId === 'done' && <CheckCircle2 size={14} />}
          {TASK_LIST_TAB_LABEL[tabId]}
          {taskCount !== null && <span className="task-section-tab-count">{taskCount}</span>}
        </button>
      );
    })}
    {onEditTabOrder && (
      <button type="button" className="task-section-tabs-order" onClick={onEditTabOrder}
        aria-label="Change tab order" title="Change tab order">
        <SlidersHorizontal size={16} />
      </button>
    )}
  </div>
);

export default TaskSectionTabs;
