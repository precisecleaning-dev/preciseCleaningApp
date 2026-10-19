// Ventana para ordenar las pestañas del Task list (solo quien tiene Edit en
// Task List). El orden se guarda para TODOS en app_settings/task_list_tabs.
// Las pestañas sin tareas no se ven en la lista, pero aquí están todas. ALL
// va siempre primero: su fila no se mueve y nada sube por encima de ella.
import { useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import type { TaskListTabId } from '../../../types/index';
import { DEFAULT_TAB_ORDER, FIRST_TAB, TASK_LIST_TAB_LABEL } from '../taskListTabs';
import './OpsModals.css';

interface TaskTabOrderModalProps {
  tabOrder: TaskListTabId[];
  onClose: () => void;
  /** Guarda el orden; true = se guardó (la ventana se cierra). */
  onSave: (tabOrder: TaskListTabId[]) => Promise<boolean>;
}

/** Copia de `tabOrder` con la pestaña de `fromIndex` movida a `toIndex`. */
const moveTab = (tabOrder: TaskListTabId[], fromIndex: number, toIndex: number): TaskListTabId[] => {
  const reorderedTabs = [...tabOrder];
  const [movedTab] = reorderedTabs.splice(fromIndex, 1);
  reorderedTabs.splice(toIndex, 0, movedTab);
  return reorderedTabs;
};

const TaskTabOrderModal = ({ tabOrder, onClose, onSave }: TaskTabOrderModalProps) => {
  const [draftTabOrder, setDraftTabOrder] = useState<TaskListTabId[]>(tabOrder);
  const [isSaving, setIsSaving] = useState(false);
  const hasChanges = draftTabOrder.join() !== tabOrder.join();
  const isDefaultOrder = draftTabOrder.join() === DEFAULT_TAB_ORDER.join();

  const handleMoveTab = (fromIndex: number, toIndex: number) =>
    setDraftTabOrder((currentTabOrder) => moveTab(currentTabOrder, fromIndex, toIndex));

  const handleSave = async () => {
    setIsSaving(true);
    const wasSaved = await onSave(draftTabOrder);
    setIsSaving(false);
    if (wasSaved) onClose();
  };

  return (
    <div className="modal-overlay-centered" onClick={onClose}>
      <div className="modal-50 opm" role="dialog" aria-modal="true" aria-label="Tab order" onClick={(event) => event.stopPropagation()}>
        <header className="opm-head">
          <h2 className="opm-title">Tab order</h2>
          <button type="button" className="opm-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="opm-body">
          <p className="opm-hint">
            The order is the same for everyone. ALL is always first. Tabs without tasks are hidden in the list.
          </p>
          <ol className="opm-list">
            {draftTabOrder.map((tabId, tabIndex) => (
              <li key={tabId} className="opm-item opm-tab-item">
                <span className="opm-tab-position">{tabIndex + 1}</span>
                <span className="opm-item-name opm-item-text">{TASK_LIST_TAB_LABEL[tabId]}</span>
                {tabId === FIRST_TAB ? (
                  <span className="opm-tab-fixed">Always first</span>
                ) : (
                  <span className="opm-item-actions">
                    <button type="button" className="opm-icon" disabled={tabIndex <= 1}
                      aria-label={`Move ${TASK_LIST_TAB_LABEL[tabId]} up`}
                      onClick={() => handleMoveTab(tabIndex, tabIndex - 1)}>
                      <ArrowUp size={14} />
                    </button>
                    <button type="button" className="opm-icon" disabled={tabIndex === draftTabOrder.length - 1}
                      aria-label={`Move ${TASK_LIST_TAB_LABEL[tabId]} down`}
                      onClick={() => handleMoveTab(tabIndex, tabIndex + 1)}>
                      <ArrowDown size={14} />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ol>
          <div className="opm-actions">
            <button type="button" className="ghost opm-btn opm-btn-start" disabled={isDefaultOrder || isSaving}
              onClick={() => setDraftTabOrder(DEFAULT_TAB_ORDER)}>
              Reset to default
            </button>
            <button type="button" className="ghost opm-btn" onClick={onClose}>Cancel</button>
            <button type="button" className="opm-btn primary" disabled={!hasChanges || isSaving} onClick={handleSave}>
              Save order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskTabOrderModal;
