// src/shared/components/TimeInput.tsx
// ============================================================================
// ⭐ CAMPO DE HORA SIEMPRE EN h:mm AM/PM (regla del negocio, como DateInput).
//
// El `<input type="time">` nativo muestra la hora según el idioma del
// navegador: en un equipo en español sale 17:00. Este campo muestra la hora en
// h:mm AM/PM y deja escribirla como salga ("8:00 AM", "5 pm", "530p", "17:00");
// el botón del reloj abre el selector nativo del sistema.
//
// Valor de entrada y salida: "HH:mm" en 24 h (o '' sin hora), igual que el
// input nativo. Lo escrito se guarda al salir del campo (o con Enter); si no
// es una hora, vuelve la que había. Borrar el campo = sin hora.
// Mismo armado y estilos que DateInput (DateInput.css).
// ============================================================================
import { useState, type ChangeEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Clock } from 'lucide-react';
import { formatHm } from '../../utils/dateFormat';
import './DateInput.css';

interface TimeInputProps {
  value: string | null | undefined;
  onChange: (hm: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  'aria-label'?: string;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** "8", "8am", "8:30 p.m.", "530p", "17:00" → "HH:mm" (24 h); null si no es una hora. */
const parseTime = (text: string): string | null => {
  const match = text.toLowerCase().replace(/[\s.]/g, '').match(/^(\d{1,2})(?::?(\d{2}))?([ap])?m?$/);
  if (!match) return null;
  const minutes = Number(match[2] ?? '0');
  let hours = Number(match[1]);
  if (minutes > 59) return null;
  if (match[3]) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (match[3] === 'p' ? 12 : 0);
  } else if (hours > 23) {
    return null;
  }
  return `${pad(hours)}:${pad(minutes)}`;
};

const TimeInput = ({
  value, onChange, className = '', disabled, id, placeholder = 'No time', 'aria-label': ariaLabel,
}: TimeInputProps) => {
  // Mientras se escribe se muestra el borrador; fuera de foco, la hora guardada.
  const [draft, setDraft] = useState<string | null>(null);
  const savedValue = value ?? '';
  const shownText = draft ?? formatHm(savedValue);

  const handleBlur = () => {
    if (draft === null) return;
    setDraft(null);
    const text = draft.trim();
    if (!text) {
      if (savedValue) onChange('');
      return;
    }
    const parsedTime = parseTime(text);
    if (parsedTime && parsedTime !== savedValue) onChange(parsedTime);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  const openPicker = (event: MouseEvent<HTMLInputElement>) => {
    // Chrome/Edge/Firefox/Safari 16+: abre el reloj del sistema. En los demás,
    // tocar el campo nativo (que cubre el botón) ya lo abre solo.
    try { event.currentTarget.showPicker?.(); } catch { /* ya abierto o sin soporte */ }
  };

  return (
    <span className={`dti${disabled ? ' disabled' : ''}`}>
      <input
        type="text"
        id={id}
        className={`${className} dti-text`.trim()}
        autoComplete="off"
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={shownText}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      <span className="dti-pick" aria-hidden="true">
        <Clock size={16} />
      </span>
      <input
        type="time"
        className="dti-native"
        tabIndex={-1}
        aria-label="Open time picker"
        value={savedValue}
        disabled={disabled}
        onClick={openPicker}
        onChange={(event) => onChange(event.target.value)}
      />
    </span>
  );
};

export default TimeInput;
