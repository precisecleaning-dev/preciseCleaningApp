// "Repeat" de una tarea, como la alarma de Android: cada cuánto se repite
// (Every day, Every weekday, Every week con sus días S M T W T F S, Every month)
// y cuántas veces ("Ends: Never" o "After N times"). Cada cambio sale entero
// por `onRepeatChange` (null = no se repite).
import { useState, type KeyboardEvent } from 'react';
import type { Repeat, RepeatFreq } from '../../../types/index';
import { MAX_REPEAT_TIMES } from '../../../services/userTasksService';
import { ymdToDate } from '../opsDates';
import { REPEAT_OPTIONS, repeatValue, WEEKDAY_LETTERS, WEEKDAY_NAMES } from '../opsOptions';
import './TaskRepeatPicker.css';

interface TaskRepeatPickerProps {
  repeat: Repeat | null;
  /** Fecha de la tarea (AAAA-MM-DD o ''): da el día que se propone con "Every week". */
  dueDate: string;
  canEdit: boolean;
  onRepeatChange: (repeat: Repeat | null) => void;
}

/** Veces que se proponen al elegir "After N times". */
const DEFAULT_REPEAT_TIMES = 5;

/** "12" → 12 si es un entero de 1 a MAX_REPEAT_TIMES; si no, null. */
const parseRepeatTimes = (text: string): number | null => {
  const repeatTimes = Number(text);
  const isValid = Number.isInteger(repeatTimes) && repeatTimes >= 1 && repeatTimes <= MAX_REPEAT_TIMES;
  return isValid ? repeatTimes : null;
};

const TaskRepeatPicker = ({ repeat, dueDate, canEdit, onRepeatChange }: TaskRepeatPickerProps) => {
  // Lo que se escribe en "After N times" mientras no se confirma (null = muestra el guardado).
  const [repeatTimesDraft, setRepeatTimesDraft] = useState<string | null>(null);

  const timesLeft = repeat?.timesLeft ?? null;
  const endsAfterTimes = timesLeft !== null;
  const selectedDays = repeat?.days ?? [];

  const handleFrequencyChange = (frequency: '' | RepeatFreq) => {
    if (!frequency) {
      onRepeatChange(null);
      return;
    }
    const days = frequency === 'weekly'
      ? [dueDate ? ymdToDate(dueDate).getDay() : new Date().getDay()]
      : undefined;
    onRepeatChange({ freq: frequency, ...(days ? { days } : {}), timesLeft });
  };

  const handleToggleDay = (weekday: number) => {
    if (!repeat) return;
    const nextDays = selectedDays.includes(weekday)
      ? selectedDays.filter((selectedDay) => selectedDay !== weekday)
      : [...selectedDays, weekday].sort((firstDay, secondDay) => firstDay - secondDay);
    if (nextDays.length === 0) return; // al menos un día
    onRepeatChange({ ...repeat, days: nextDays });
  };

  const handleEndsChange = (shouldEndAfterTimes: boolean) => {
    if (!repeat) return;
    setRepeatTimesDraft(null);
    onRepeatChange({ ...repeat, timesLeft: shouldEndAfterTimes ? DEFAULT_REPEAT_TIMES : null });
  };

  const handleSaveRepeatTimes = () => {
    if (repeatTimesDraft === null || !repeat) return;
    const repeatTimes = parseRepeatTimes(repeatTimesDraft);
    setRepeatTimesDraft(null);
    if (repeatTimes !== null && repeatTimes !== timesLeft) onRepeatChange({ ...repeat, timesLeft: repeatTimes });
  };

  const handleRepeatTimesKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  const repeatTimesValue = repeatTimesDraft ?? String(timesLeft ?? DEFAULT_REPEAT_TIMES);

  return (
    <div className="task-repeat">
      <label className="task-panel-field">
        <span className="task-panel-field-lbl">Repeat</span>
        <select className="task-panel-input" value={repeatValue(repeat)} disabled={!canEdit}
          onChange={(event) => handleFrequencyChange(event.target.value as '' | RepeatFreq)}>
          {REPEAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      {repeat?.freq === 'weekly' && (
        <div className="task-repeat-days" role="group" aria-label="Repeat on">
          {WEEKDAY_LETTERS.map((letter, weekdayIndex) => {
            const isSelected = selectedDays.includes(weekdayIndex);
            const isLastSelected = isSelected && selectedDays.length === 1;
            return (
              <button
                key={WEEKDAY_NAMES[weekdayIndex]}
                type="button"
                className={`task-repeat-day${isSelected ? ' selected' : ''}`}
                aria-pressed={isSelected}
                aria-label={WEEKDAY_NAMES[weekdayIndex]}
                disabled={!canEdit || isLastSelected}
                onClick={() => handleToggleDay(weekdayIndex)}
              >
                {letter}
              </button>
            );
          })}
        </div>
      )}

      {repeat && (
        <div className="task-repeat-ends" role="group" aria-label="Ends">
          <span className="task-panel-field-lbl">Ends</span>
          <button
            type="button"
            className={`task-repeat-end${endsAfterTimes ? '' : ' selected'}`}
            aria-pressed={!endsAfterTimes}
            disabled={!canEdit}
            onClick={() => handleEndsChange(false)}
          >
            Never
          </button>
          <button
            type="button"
            className={`task-repeat-end${endsAfterTimes ? ' selected' : ''}`}
            aria-pressed={endsAfterTimes}
            disabled={!canEdit}
            onClick={() => handleEndsChange(true)}
          >
            After
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_REPEAT_TIMES}
            className="task-panel-input task-repeat-times"
            value={repeatTimesValue}
            disabled={!canEdit || !endsAfterTimes}
            aria-label="How many times"
            onChange={(event) => setRepeatTimesDraft(event.target.value)}
            onBlur={handleSaveRepeatTimes}
            onKeyDown={handleRepeatTimesKeyDown}
          />
          <span className="task-repeat-times-lbl">times</span>
        </div>
      )}
    </div>
  );
};

export default TaskRepeatPicker;
