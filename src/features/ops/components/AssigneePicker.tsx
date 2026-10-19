// Campo de búsqueda de personas ("Assign to" / "Assignee"): una tarea la
// pueden hacer una o más personas. Las asignadas se ven como chips dentro del
// campo; al escribir se filtra la lista de todas las personas (de la A a la Z)
// y cada una se marca o desmarca con su casilla. Siempre queda al menos una
// persona. La lista se cierra al tocar fuera o con Escape (sin cerrar el panel
// de la tarea).
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import type { AssignableUser, TaskAssignee } from '../../../types/index';
import { compareByUserName, getFirstName, matchesSearch } from '../opsOptions';
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

const AssigneePicker = ({ assignees, assignableUsers, currentUserId, label, onAssigneesChange }: AssigneePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const searchInputId = useId();
  const resultsListId = useId();

  // Tocar fuera del selector cierra la lista.
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
  // Todas las personas, de la A a la Z por nombre.
  const allPeople: TaskAssignee[] = [...assignableUsers.map(toTaskAssignee), ...unlistedAssignees].sort(compareByUserName);
  const getOptionLabel = (assignee: TaskAssignee) =>
    (assignee.userId === currentUserId ? `Me (${getFirstName(assignee.userName)})` : assignee.userName);
  // Se busca por el nombre completo; a uno mismo también por "Me".
  const getSearchableText = (assignee: TaskAssignee) =>
    (assignee.userId === currentUserId ? `Me ${assignee.userName}` : assignee.userName);
  const matchingPeople = allPeople.filter((assignee) => matchesSearch(getSearchableText(assignee), searchQuery));
  const canRemoveAssignee = assignees.length > 1;

  // Marcar agrega a la persona al final (la primera asignada no cambia);
  // desmarcar la quita, salvo si es la única.
  const handleToggleAssignee = (assignee: TaskAssignee) => {
    if (!selectedIds.has(assignee.userId)) {
      onAssigneesChange([...assignees, assignee]);
      return;
    }
    if (!canRemoveAssignee) return; // al menos una persona
    onAssigneesChange(assignees.filter((selected) => selected.userId !== assignee.userId));
  };

  const handleSearchChange = (nextSearchQuery: string) => {
    setSearchQuery(nextSearchQuery);
    setIsOpen(true);
  };

  // Enter marca o desmarca el primer resultado de la búsqueda.
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || !searchQuery.trim() || matchingPeople.length === 0) return;
    event.preventDefault();
    handleToggleAssignee(matchingPeople[0]);
    setSearchQuery('');
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !isOpen) return;
    event.stopPropagation(); // que Escape no cierre también el panel
    setIsOpen(false);
  };

  return (
    <div ref={pickerRef} className="assignee-picker" onKeyDown={handleKeyDown}>
      <label className="assignee-picker-field task-panel-input" htmlFor={searchInputId}>
        {assignees.map((assignee) => (
          <span key={assignee.userId} className="assignee-picker-chip">
            <span className="assignee-picker-chip-name">{getOptionLabel(assignee)}</span>
            {canRemoveAssignee && (
              <button
                type="button"
                className="assignee-picker-chip-remove"
                aria-label={`Remove ${assignee.userName}`}
                onClick={() => handleToggleAssignee(assignee)}
              >
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </span>
        ))}
        <span className="assignee-picker-search">
          <Search size={14} className="assignee-picker-search-icon" aria-hidden="true" />
          <input
            id={searchInputId}
            type="text"
            className="assignee-picker-search-input"
            role="combobox"
            aria-autocomplete="list"
            aria-controls={resultsListId}
            aria-expanded={isOpen}
            aria-label={`${label}: search people`}
            autoComplete="off"
            placeholder="Search people…"
            value={searchQuery}
            onChange={(event) => handleSearchChange(event.target.value)}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleSearchKeyDown}
          />
        </span>
      </label>
      {isOpen && (
        <ul id={resultsListId} className="assignee-picker-menu" role="group" aria-label={label}>
          {matchingPeople.length === 0 && (
            <li className="assignee-picker-empty">No one matches “{searchQuery.trim()}”</li>
          )}
          {matchingPeople.map((assignee) => {
            const isChecked = selectedIds.has(assignee.userId);
            return (
              <li key={assignee.userId}>
                <label className={`assignee-picker-option${isChecked ? ' checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isChecked && !canRemoveAssignee}
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
