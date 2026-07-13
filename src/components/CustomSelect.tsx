import { useState } from 'react';
import type { CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import './CustomSelect.css';

interface CustomSelectOption {
  id: string;
  name: string;
  color?: string;
}

interface CustomSelectProps<T extends CustomSelectOption> {
  options: T[];
  value?: string;
  onChange: (value: string) => void;
  placeholder: string;
  icon: LucideIcon;
  /** Campo de la opción que se pasa a onChange (además de `id`, ej. `name` para clientes legacy). */
  returnKey?: keyof T;
}

// Antes reimplementado con comportamientos ligeramente distintos en SettingsView.tsx,
// CalendarView.tsx y HousesView.tsx (matching exacto por id vs. case-insensitive por
// id-o-nombre, con/sin `returnKey`, onClick vs. onMouseDown para cerrar). Esta versión usa
// el comportamiento más robusto de los tres en cada punto: matching case-insensitive por
// id-o-nombre (compatible con datos legacy) y onMouseDown+preventDefault en las opciones,
// que evita que el blur cierre el dropdown antes de que el click registre (no hace falta el
// setTimeout de debounce que dos de las tres copias necesitaban por usar onClick).
export default function CustomSelect<T extends CustomSelectOption>({ options, value, onChange, placeholder, icon: Icon, returnKey = 'id' as keyof T }: CustomSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);

  const safeValue = String(value || '').toLowerCase().trim();
  const selected = options.find(o =>
    String(o.id).toLowerCase().trim() === safeValue ||
    String(o.name).toLowerCase().trim() === safeValue
  );

  return (
    <div tabIndex={0} onBlur={() => setIsOpen(false)} className="cust-sel-wrap">
      <div onClick={() => setIsOpen(!isOpen)} className="cust-sel-trigger">
        <Icon size={16} className="cust-sel-trigger-icon" />
        <div className="cust-sel-selected-wrap">
          {selected?.color && <span className="cust-sel-dot" style={{ '--dot-color': selected.color } as CSSProperties}></span>}
          <span className={`cust-sel-label${selected ? ' selected' : ''}`}>
            {selected ? selected.name : placeholder}
          </span>
        </div>
        <ChevronDown size={16} color="#9ca3af" className={`cust-sel-chevron${isOpen ? ' open' : ''}`} />
      </div>

      {isOpen && (
        <div className="cust-sel-dropdown">
          <div className="cust-sel-option-none" onMouseDown={(e) => { e.preventDefault(); onChange(''); setIsOpen(false); }}>
            None / Unassigned
          </div>
          {options.map(o => (
            <div
              key={o.id}
              className={`cust-sel-option${selected?.id === o.id ? ' selected' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); onChange(String(o[returnKey] ?? o.id)); setIsOpen(false); }}
            >
              {o.color && <span className="cust-sel-dot" style={{ '--dot-color': o.color } as CSSProperties}></span>}
              <span className="cust-sel-option-label">{o.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
