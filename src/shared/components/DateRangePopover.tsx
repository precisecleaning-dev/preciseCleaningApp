// src/shared/components/DateRangePopover.tsx
// Filtro de rango de fechas: botón que muestra el periodo aplicado y un panel
// con el campo a filtrar, From / To (DateInput), periodos rápidos, Cancel y
// Apply range. Los cambios del panel son provisionales hasta Apply; Cancel,
// Escape, la X o un clic afuera conservan el rango aplicado.
import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import DateInput from './DateInput';
import { formatDateRange, formatDate } from '../../utils/dateFormat';
import { DATE_RANGE_PRESETS, getDateRangePreset, type DateRangePresetKey } from '../utils/dateRangePresets';
import './DateRangePopover.css';

export interface DateRangeValue<Field extends string> {
  field: Field;
  from: string;
  to: string;
}

interface DateRangePopoverProps<Field extends string> {
  value: DateRangeValue<Field>;
  fieldOptions: { value: Field; label: string }[];
  onApply: (value: DateRangeValue<Field>) => void;
}

/** Texto del botón: "All dates" o "Issue date: 10/01/2026 – 10/31/2026". */
const describeRange = <Field extends string>(
  value: DateRangeValue<Field>, fieldOptions: { value: Field; label: string }[],
): string => {
  if (!value.from && !value.to) return 'All dates';
  const fieldLabel = fieldOptions.find((option) => option.value === value.field)?.label ?? '';
  let rangeText = formatDateRange(value.from, value.to);
  if (!value.to) rangeText = `From ${formatDate(value.from)}`;
  else if (!value.from) rangeText = `Until ${formatDate(value.to)}`;
  return `${fieldLabel}: ${rangeText}`;
};

const DateRangePopover = <Field extends string>({ value, fieldOptions, onApply }: DateRangePopoverProps<Field>) => {
  const panelId = useId();
  const fieldSelectId = useId();
  const fromId = useId();
  const toId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const isRangeInvalid = !!draft.from && !!draft.to && draft.from > draft.to;

  const handleToggle = () => {
    setDraft(value);
    setIsOpen((wasOpen) => !wasOpen);
  };

  const handleApply = () => {
    if (isRangeInvalid) return;
    onApply(draft);
    setIsOpen(false);
  };

  const handlePreset = (presetKey: DateRangePresetKey) => {
    setDraft((currentDraft) => ({ ...currentDraft, ...getDateRangePreset(presetKey) }));
  };

  // Escape cierra sin aplicar.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Un clic fuera del panel cierra sin aplicar.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  return (
    <div className="drp-wrap" ref={containerRef}>
      <button
        type="button"
        className={`drp-trigger${value.from || value.to ? ' active' : ''}`}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={handleToggle}
      >
        <CalendarDays size={16} aria-hidden="true" />
        <span className="drp-trigger-text">{describeRange(value, fieldOptions)}</span>
      </button>
      {isOpen && (
        <div className="drp-panel" id={panelId} role="dialog" aria-label="Date range">
          <div className="drp-panel-head">
            <strong className="drp-title">Date range</strong>
            <button type="button" className="drp-icon-btn" aria-label="Close date range" onClick={() => setIsOpen(false)}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <label className="drp-label" htmlFor={fieldSelectId}>Filter by</label>
          <select
            id={fieldSelectId}
            className="drp-input"
            value={draft.field}
            onChange={(event) => setDraft({ ...draft, field: event.target.value as Field })}
          >
            {fieldOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <div className="drp-dates">
            <div className="drp-date-field">
              <label className="drp-label" htmlFor={fromId}>From</label>
              <DateInput id={fromId} className="drp-input" value={draft.from} onChange={(from) => setDraft({ ...draft, from })} />
            </div>
            <div className="drp-date-field">
              <label className="drp-label" htmlFor={toId}>To</label>
              <DateInput id={toId} className="drp-input" value={draft.to} onChange={(to) => setDraft({ ...draft, to })} />
            </div>
          </div>
          {isRangeInvalid && <p className="drp-error" role="alert">"From" cannot be after "To".</p>}
          <div className="drp-presets">
            {DATE_RANGE_PRESETS.map((preset) => (
              <button key={preset.key} type="button" className="drp-preset" onClick={() => handlePreset(preset.key)}>
                {preset.label}
              </button>
            ))}
          </div>
          <div className="drp-actions">
            <button type="button" className="drp-secondary-btn" onClick={() => setIsOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary drp-apply-btn" disabled={isRangeInvalid} onClick={handleApply}>
              Apply range
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangePopover;
