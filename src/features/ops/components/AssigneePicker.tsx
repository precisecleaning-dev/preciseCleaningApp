// Selector de varias personas ("Assign to" / "Assignee"): una tarea la pueden
// hacer una o más personas. El botón muestra a quiénes está asignada y abre
// la lista con casillas. Siempre queda al menos una persona. Se cierra al
// tocar fuera o con Escape (sin cerrar el panel de la tarea).
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AssignableUser, TaskAssignee } from '../../../types/index';
import { namesSummary } from '../opsOptions';
import { toTaskAssignee } from '../opsPermissions';
import OpsAvatar from './OpsAvatar';
import './AssigneePicker.css';

interface AssigneePickerProps {
  /** Personas asignadas, en orden. */
  assignees: TaskAssignee[];
  /** A quiénes se les puede asignar (AssignableUser de assignablePeople). */
  assignableUsers: AssignableUser[];
  currentUserId: string;
  label: string;
  onAssigneesChange: (assignees: TaskAssignee[]) => void;
}

const getFirstName = (name: string) => name.split(' ')[0] || name;

const AssigneePicker = ({ assignees, assignableUsers, currentUserId, label, onAssigneesChange }: AssigneePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Tocar fuera del selector lo cierra.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  const selectedIds = new Set(assignees.map((assignee) => assignee.userId));
  // Las personas guardadas que ya no están en la lista (p. ej. inactivas) se
  // siguen mostrando para poder quitarlas.
  const unlistedAssignees = assignees.filter((assignee) => !assignableUsers.some((user) => user.id === assignee.userId));
  const options: TaskAssignee[] = [...assignableUsers.map(toTaskAssignee), ...unlistedAssignees];
  const getOptionLabel = (assignee: TaskAssignee) =>
    (assignee.userId === currentUserId ? `Me (${getFirstName(assignee.userName)})` : assignee.userName);
  const assigneesSummary = namesSummary(
    assignees.map((assignee) => (assignee.userId === currentUserId ? 'Me' : getFirstName(assignee.userName))),
    3,
  );

  const handleToggleAssignee = (assignee: TaskAssignee) => {
    const nextSelectedIds = new Set(selectedIds);
    if (nextSelectedIds.has(assignee.userId)) nextSelectedIds.delete(assignee.userId);
    else nextSelectedIds.add(assignee.userId);
    if (nextSelectedIds.size === 0) return; // al menos una persona
    onAssigneesChange(options.filter((option) => nextSelectedIds.has(option.userId)));
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !isOpen) return;
    event.stopPropagation(); // que Escape no cierre también el panel
    setIsOpen(false);
  };

  return (
    <div ref={pickerRef} className="assignee-picker" onKeyDown={handleKeyDown}>
      <button
        type="button"
        className="assignee-picker-trigger task-panel-input"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={`${label}: ${assigneesSummary || 'nobody'}`}
        onClick={() => setIsOpen((wasOpen) => !wasOpen)}
      >
        <span className="assignee-picker-summary">{assigneesSummary || 'Choose people'}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {isOpen && (
        <ul className="assignee-picker-menu" role="group" aria-label={label}>
          {options.map((assignee) => {
            const isChecked = selectedIds.has(assignee.userId);
            return (
              <li key={assignee.userId}>
                <label className={`assignee-picker-option${isChecked ? ' checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isChecked && selectedIds.size === 1}
                    onChange={() => handleToggleAssignee(assignee)}
                  />
                  <OpsAvatar id={assignee.userId} name={assignee.userName} size="xs" />
                  <span className="assignee-picker-name">{getOptionLabel(assignee)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default AssigneePicker;
