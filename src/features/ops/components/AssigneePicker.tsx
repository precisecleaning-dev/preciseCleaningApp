// Selector de varias personas ("Assign to" / "Assignee"): una tarea la pueden
// hacer una o más personas. El botón muestra a quiénes está asignada y abre
// la lista con casillas. Siempre queda al menos una persona. Se cierra al
// tocar fuera o con Escape (sin cerrar el panel de la tarea).
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { namesSummary } from '../opsOptions';
import type { PersonOption } from '../opsPermissions';
import OpsAvatar from './OpsAvatar';
import './AssigneePicker.css';

type PickedPerson = Pick<PersonOption, 'id' | 'name'>;

interface AssigneePickerProps {
  /** Personas asignadas (id y nombre guardado), en orden. */
  selected: PickedPerson[];
  /** A quiénes se les puede asignar (PersonOption de assignablePeople). */
  people: PersonOption[];
  meId: string;
  ariaLabel: string;
  onChange: (selected: PickedPerson[]) => void;
}

const firstName = (name: string) => name.split(' ')[0] || name;

const AssigneePicker = ({ selected, people, meId, ariaLabel, onChange }: AssigneePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Tocar fuera del selector lo cierra.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  const selectedIds = new Set(selected.map((person) => person.id));
  // Las personas guardadas que ya no están en la lista (p. ej. inactivas) se
  // siguen mostrando para poder quitarlas.
  const missingPeople = selected.filter((person) => !people.some((option) => option.id === person.id));
  const options: PickedPerson[] = [...people, ...missingPeople];
  const labelOf = (person: PickedPerson) => (person.id === meId ? `Me (${firstName(person.name)})` : person.name);
  const summary = namesSummary(selected.map((person) => (person.id === meId ? 'Me' : firstName(person.name))), 3);

  const handleTogglePerson = (person: PickedPerson) => {
    const nextIds = new Set(selectedIds);
    if (nextIds.has(person.id)) nextIds.delete(person.id);
    else nextIds.add(person.id);
    if (nextIds.size === 0) return; // al menos una persona
    onChange(options.filter((option) => nextIds.has(option.id)).map(({ id, name }) => ({ id, name })));
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !isOpen) return;
    event.stopPropagation(); // que Escape no cierre también el panel
    setIsOpen(false);
  };

  return (
    <div ref={rootRef} className="oap" onKeyDown={handleKeyDown}>
      <button
        type="button"
        className="oap-trigger otp-input"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={`${ariaLabel}: ${summary || 'nobody'}`}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="oap-summary">{summary || 'Choose people'}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {isOpen && (
        <ul className="oap-menu" role="group" aria-label={ariaLabel}>
          {options.map((person) => {
            const isChecked = selectedIds.has(person.id);
            return (
              <li key={person.id}>
                <label className={`oap-option${isChecked ? ' checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isChecked && selectedIds.size === 1}
                    onChange={() => handleTogglePerson(person)}
                  />
                  <OpsAvatar id={person.id} name={person.name} size="xs" />
                  <span className="oap-name">{labelOf(person)}</span>
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
