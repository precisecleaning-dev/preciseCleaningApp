// Selector de varias personas ("Assign to" / "Assignee"): una tarea la pueden
// hacer una o más personas. El botón muestra a quiénes está asignada y abre
// la lista con casillas. Siempre queda al menos una persona. Se cierra al
// tocar fuera o con Escape (sin cerrar el panel de la tarea).
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AssignableUser, TaskAssignee } from '../../../types/index';
import { namesSummary } from '../opsOptions';
import OpsAvatar from './OpsAvatar';
import './AssigneePicker.css';

interface AssigneePickerProps {
  /** Personas asignadas (id y nombre guardado), en orden. */
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

  const selectedIds = new Set(assignees.map((person) => person.id));
  // Las personas guardadas que ya no están en la lista (p. ej. inactivas) se
  // siguen mostrando para poder quitarlas.
  const unlistedAssignees = assignees.filter((person) => !assignableUsers.some((option) => option.id === person.id));
  const options: TaskAssignee[] = [...assignableUsers, ...unlistedAssignees];
  const getOptionLabel = (person: TaskAssignee) =>
    (person.id === currentUserId ? `Me (${getFirstName(person.name)})` : person.name);
  const assigneesSummary = namesSummary(
    assignees.map((person) => (person.id === currentUserId ? 'Me' : getFirstName(person.name))),
    3,
  );

  const handleToggleAssignee = (person: TaskAssignee) => {
    const nextSelectedIds = new Set(selectedIds);
    if (nextSelectedIds.has(person.id)) nextSelectedIds.delete(person.id);
    else nextSelectedIds.add(person.id);
    if (nextSelectedIds.size === 0) return; // al menos una persona
    onAssigneesChange(options.filter((option) => nextSelectedIds.has(option.id)).map(({ id, name }) => ({ id, name })));
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !isOpen) return;
    event.stopPropagation(); // que Escape no cierre también el panel
    setIsOpen(false);
  };

  return (
    <div ref={pickerRef} className="oap" onKeyDown={handleKeyDown}>
      <button
        type="button"
        className="oap-trigger otp-input"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={`${label}: ${assigneesSummary || 'nobody'}`}
        onClick={() => setIsOpen((wasOpen) => !wasOpen)}
      >
        <span className="oap-summary">{assigneesSummary || 'Choose people'}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {isOpen && (
        <ul className="oap-menu" role="group" aria-label={label}>
          {options.map((person) => {
            const isChecked = selectedIds.has(person.id);
            return (
              <li key={person.id}>
                <label className={`oap-option${isChecked ? ' checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isChecked && selectedIds.size === 1}
                    onChange={() => handleToggleAssignee(person)}
                  />
                  <OpsAvatar id={person.id} name={person.name} size="xs" />
                  <span className="oap-name">{getOptionLabel(person)}</span>
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
