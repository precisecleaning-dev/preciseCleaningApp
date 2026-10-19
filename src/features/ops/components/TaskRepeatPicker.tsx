// "Repeat" de una tarea: No / Yes. Con Yes se elige "Every day" o "Every day
// except" y los días que NO toca (S M T W T F S). Las viejas mensuales siguen
// diciendo "Every month" hasta que alguien las cambie. Cada cambio sale entero
// por `onRepeatChange` (null = no se repite) y sin fin: "After N times" se quitó
// (10/2026).
import type { Repeat } from '../../../types/index';
import { isDailyRepeat, repeatExceptDays, repeatFromExceptDays } from '../opsDates';
import { WEEKDAY_LETTERS, WEEKDAY_NAMES } from '../opsOptions';
import './TaskRepeatPicker.css';

interface TaskRepeatPickerProps {
  repeat: Repeat | null;
  canEdit: boolean;
  onRepeatChange: (repeat: Repeat | null) => void;
}

/** Días que se proponen al elegir "Every day except": sábado y domingo. */
const DEFAULT_EXCEPT_DAYS = [0, 6];
/** Siempre tiene que quedar al menos un día de la semana en que toca. */
const MAX_EXCEPT_DAYS = 6;

interface RepeatOptionButtonProps {
  label: string;
  isSelected: boolean;
  isDisabled: boolean;
  onSelect: () => void;
}

const RepeatOptionButton = ({ label, isSelected, isDisabled, onSelect }: RepeatOptionButtonProps) => (
  <button
    type="button"
    className={`task-repeat-option${isSelected ? ' selected' : ''}`}
    aria-pressed={isSelected}
    disabled={isDisabled}
    onClick={onSelect}
  >
    {label}
  </button>
);

const TaskRepeatPicker = ({ repeat, canEdit, onRepeatChange }: TaskRepeatPickerProps) => {
  const isRepeating = !!repeat;
  const isLegacyMonthly = !!repeat && !isDailyRepeat(repeat);
  const exceptDays = repeat && !isLegacyMonthly ? repeatExceptDays(repeat) : [];
  const isEveryDayExcept = exceptDays.length > 0;
  const isEveryDay = isRepeating && !isLegacyMonthly && !isEveryDayExcept;

  const handleToggleExceptDay = (weekday: number) => {
    const nextExceptDays = exceptDays.includes(weekday)
      ? exceptDays.filter((exceptDay) => exceptDay !== weekday)
      : [...exceptDays, weekday];
    onRepeatChange(repeatFromExceptDays(nextExceptDays));
  };

  return (
    <div className="task-repeat">
      <div className="task-repeat-options" role="group" aria-label="Repeat">
        <span className="task-panel-field-lbl">Repeat</span>
        <RepeatOptionButton label="No" isSelected={!isRepeating} isDisabled={!canEdit}
          onSelect={() => onRepeatChange(null)} />
        <RepeatOptionButton label="Yes" isSelected={isRepeating} isDisabled={!canEdit || isRepeating}
          onSelect={() => onRepeatChange(repeatFromExceptDays([]))} />
      </div>

      {isRepeating && (
        <div className="task-repeat-options" role="group" aria-label="How often">
          <RepeatOptionButton label="Every day" isSelected={isEveryDay} isDisabled={!canEdit}
            onSelect={() => onRepeatChange(repeatFromExceptDays([]))} />
          <RepeatOptionButton label="Every day except" isSelected={isEveryDayExcept} isDisabled={!canEdit || isEveryDayExcept}
            onSelect={() => onRepeatChange(repeatFromExceptDays(DEFAULT_EXCEPT_DAYS))} />
          {isLegacyMonthly && <RepeatOptionButton label="Every month" isSelected isDisabled onSelect={() => undefined} />}
        </div>
      )}

      {isEveryDayExcept && (
        <div className="task-repeat-days" role="group" aria-label="Except on">
          {WEEKDAY_LETTERS.map((letter, weekdayIndex) => {
            const isExcepted = exceptDays.includes(weekdayIndex);
            // El último día exceptuado no se quita aquí (eso es "Every day") y
            // no se exceptúan los 7.
            const isLocked = isExcepted ? exceptDays.length === 1 : exceptDays.length >= MAX_EXCEPT_DAYS;
            return (
              <button
                key={WEEKDAY_NAMES[weekdayIndex]}
                type="button"
                className={`task-repeat-day${isExcepted ? ' selected' : ''}`}
                aria-pressed={isExcepted}
                aria-label={`Except ${WEEKDAY_NAMES[weekdayIndex]}`}
                disabled={!canEdit || isLocked}
                onClick={() => handleToggleExceptDay(weekdayIndex)}
              >
                {letter}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TaskRepeatPicker;
