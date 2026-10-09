// src/features/houses/components/SearchableSelect.tsx
// Selector con búsqueda por texto del formulario de casas. Extraído de HousesView.tsx.
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown, X } from 'lucide-react';
import './SearchableSelect.css';

export interface SelectOption {
  id: string;
  name: string;
  color?: string;
}

export default function SearchableSelect<T extends SelectOption>({
  options,
  value,
  onChange,
  placeholder,
  icon: Icon,
  returnKey = "id" as keyof T,
  disabled = false,
  allowClear = false,
  clearLabel = "— None —",
}: {
  options: T[];
  value?: string;
  onChange: (value: string) => void;
  placeholder: string;
  icon: LucideIcon;
  returnKey?: keyof T;
  disabled?: boolean;
  // ⭐ Permite DEJAR EL CAMPO VACIO despues de haber elegido algo. Sin esto el
  //    control no tiene forma de volver a "", que era el bug al duplicar una casa:
  //    el Team se heredaba de la casa original y no se podia quitar.
  allowClear?: boolean;
  clearLabel?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = options.find((o) => String(o[returnKey]) === String(value));
  const displayValue = isOpen ? search : selected ? selected.name : value || "";

  const filteredOptions = options.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div
      tabIndex={0}
      onBlur={() => setTimeout(() => setIsOpen(false), 200)}
      className={`hv-searchsel-wrap${disabled ? " disabled" : ""}`}
    >
      <div className="hv-searchsel-trigger">
        <Icon size={16} className="hv-searchsel-icon" />
        <input
          className="hv-searchsel-input"
          placeholder={placeholder}
          value={displayValue}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onClick={() => {
            if (disabled) return;
            setIsOpen(true);
            setSearch("");
          }}
          disabled={disabled}
        />
        {allowClear && !disabled && String(value || "") !== "" && (
          <button
            type="button"
            className="hv-searchsel-clear"
            title={clearLabel}
            aria-label={clearLabel}
            onMouseDown={(e) => {
              e.preventDefault();
              onChange("");
              setSearch("");
              setIsOpen(false);
            }}
          >
            <X size={14} />
          </button>
        )}
        <ChevronDown
          size={16}
          color="#9ca3af"
          className={`hv-select-chevron clickable${isOpen ? " open" : ""}`}
          onClick={() => {
            if (!disabled) setIsOpen(!isOpen);
          }}
        />
      </div>
      {isOpen && (
        <div className="hv-searchsel-dropdown">
          {allowClear && (
            <div
              className="hv-searchsel-option clear"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange("");
                setIsOpen(false);
                setSearch("");
              }}
            >
              {clearLabel}
            </div>
          )}
          {filteredOptions.length === 0 ? (
            <div className="hv-searchsel-empty">No results found</div>
          ) : null}
          {filteredOptions.map((o) => (
            <div
              key={o.id}
              className="hv-searchsel-option"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(String(o[returnKey] ?? o.id));
                setIsOpen(false);
                setSearch("");
              }}
            >
              {o.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
