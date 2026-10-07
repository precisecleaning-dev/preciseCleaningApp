// ⭐ Selector "Agrupar por: Sin agrupar · Año · Mes · Semana · Día".
//    Compartido por Invoices y la tabla Daily Jobs del Overview.
import { Layers } from 'lucide-react';
import { DATE_GROUP_MODES, type DateGroupMode } from '../utils/dateGrouping';
import './DateGroupBar.css';

interface DateGroupBarProps {
  mode: DateGroupMode;
  onChange: (mode: DateGroupMode) => void;
  /** false cuando la vista ya pone su propia etiqueta (p. ej. Invoices). */
  showLabel?: boolean;
}

export default function DateGroupBar({ mode, onChange, showLabel = true }: DateGroupBarProps) {
  return (
    <div className="dgb-bar">
      {showLabel && (
        <span className="dgb-label">
          <Layers size={14} /> Agrupar por
        </span>
      )}
      <div className="dgb-segmented" role="radiogroup" aria-label="Agrupar por fecha">
        {DATE_GROUP_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            className={`dgb-option${mode === m.id ? ' active' : ''}`}
            onClick={() => onChange(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
