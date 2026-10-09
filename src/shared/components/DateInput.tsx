// src/shared/components/DateInput.tsx
// ============================================================================
// ⭐ CAMPO DE FECHA SIEMPRE EN MM/DD/AAAA (regla del negocio, 10/2026).
//
// El `<input type="date">` nativo muestra la fecha según el idioma del
// navegador: en un teléfono en español sale DD/MM/AAAA. Este componente
// muestra y deja escribir MM/DD/AAAA en cualquier equipo, y el botón de
// calendario abre el selector nativo del sistema.
//
// Valor de entrada y salida: AAAA-MM-DD (o '' sin fecha), igual que el input
// nativo, así que se cambia uno por otro sin tocar cómo se guarda.
// `className` va al campo de texto (se conservan los estilos de cada vista).
// ============================================================================
import { useRef, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatDate } from '../../utils/dateFormat';
import './DateInput.css';

interface DateInputProps {
  value: string | null | undefined;
  onChange: (iso: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const SEGMENT_LENGTHS = [2, 2, 4]; // MM / DD / AAAA

/** Solo dígitos: "10092026" → "10/09/2026" (las barras se ponen solas). */
const mask = (digits: string): string => {
  const d = digits.slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
};

/**
 * Normaliza lo escrito o pegado a MM/DD/AAAA.
 *  · "2026-10-09" o "2026/10/09" pegado (año primero) → "10/09/2026".
 *  · Con barras (o guiones/puntos) se respeta cada parte: corregir solo el
 *    día ("10/1/2026") no corre los demás dígitos, y mes/día de un dígito
 *    valen ("1/5/2024"). Una parte que se pasa de largo sigue en la siguiente.
 *  · Solo dígitos: se ponen las barras por posición.
 */
const normalize = (raw: string): string => {
  const yearFirst = raw.trim().match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (yearFirst) return `${pad(+yearFirst[2])}/${pad(+yearFirst[3])}/${yearFirst[1]}`;
  const parts = raw.split(/[/.-]/).map((p) => p.replace(/\D/g, ''));
  if (parts.length === 1) return mask(parts[0]);
  const out: string[] = [];
  let carry = '';
  for (let i = 0; i < SEGMENT_LENGTHS.length; i++) {
    const seg = carry + (parts[i] ?? '');
    if (i >= parts.length && !seg) break;
    out.push(seg.slice(0, SEGMENT_LENGTHS[i]));
    carry = seg.slice(SEGMENT_LENGTHS[i]);
  }
  return out.join('/');
};

/** "10/09/2026" o "1/5/2024" → AAAA-MM-DD; null si está incompleta, la fecha
 *  no existe (02/30) o el año queda fuera de 1900–2100. */
const toIso = (text: string): string | null => {
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const mon = +m[1], day = +m[2], y = +m[3];
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  const d = new Date(y, mon - 1, day);
  if (d.getFullYear() !== y || d.getMonth() !== mon - 1 || d.getDate() !== day) return null;
  return `${y}-${pad(mon)}-${pad(day)}`;
};

/** El valor guardado puede venir en un formato viejo: el picker solo entiende AAAA-MM-DD. */
const isoOrEmpty = (value: string | null | undefined): string => {
  const v = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const shown = formatDate(v);
  return toIso(shown) || '';
};

export default function DateInput({ value, onChange, className = '', disabled, id, 'aria-label': ariaLabel }: DateInputProps) {
  // Mientras se escribe se muestra el borrador; fuera de foco, el valor guardado.
  const [draft, setDraft] = useState<string | null>(null);
  // Valor al entrar al campo: si se sale con una fecha incompleta, se vuelve a él.
  const valueAtFocus = useRef<string>('');
  const shown = draft ?? formatDate(value);

  // Una fecha completa y válida se guarda al instante, y borrar el campo
  // también (así Enter guarda el campo vacío). Si al salir quedó una fecha
  // incompleta o imposible (02/30), se restaura la que había al entrar.
  const handleText = (e: ChangeEvent<HTMLInputElement>) => {
    const next = normalize(e.target.value);
    setDraft(next);
    if (next === '') {
      if (value) onChange('');
      return;
    }
    const iso = toIso(next);
    if (iso && iso !== value) onChange(iso);
  };

  const handleFocus = () => {
    valueAtFocus.current = String(value || '');
    setDraft(formatDate(value));
  };

  const handleBlur = () => {
    if (draft && !toIso(draft) && String(value || '') !== valueAtFocus.current) {
      onChange(valueAtFocus.current);
    }
    setDraft(null);
  };

  const openPicker = (e: MouseEvent<HTMLInputElement>) => {
    // Chrome/Edge/Firefox/Safari 16+: abre el calendario del sistema. En los
    // demás, tocar el campo nativo (que cubre el botón) ya lo abre solo.
    try { e.currentTarget.showPicker?.(); } catch { /* ya abierto o sin soporte */ }
  };

  return (
    <span className={`dti${disabled ? ' disabled' : ''}`}>
      <input
        type="text"
        id={id}
        className={`${className} dti-text`.trim()}
        inputMode="numeric"
        autoComplete="off"
        placeholder="MM/DD/YYYY"
        aria-label={ariaLabel}
        value={shown}
        disabled={disabled}
        onFocus={handleFocus}
        onChange={handleText}
        onBlur={handleBlur}
      />
      <span className="dti-pick" aria-hidden="true">
        <CalendarDays size={16} />
      </span>
      <input
        type="date"
        className="dti-native"
        tabIndex={-1}
        aria-label="Abrir calendario"
        value={isoOrEmpty(value)}
        disabled={disabled}
        onClick={openPicker}
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  );
}
