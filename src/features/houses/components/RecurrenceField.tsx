// src/features/houses/components/RecurrenceField.tsx
// Campo "Repeat" del formulario de la casa: cómo se repite la visita (todos los
// días, ciertos días de la semana, un día del mes), cada cuántas semanas, y a
// qué hora de Texas y con cuántos días de anticipación aparece la orden de la
// siguiente visita. La crea la Cloud Function `createrecurringhouses`; las
// reglas están en houseRecurrence.ts.
import { Repeat } from 'lucide-react';
import CustomSelect from '../../../components/CustomSelect';
import TimeInput from '../../../shared/components/TimeInput';
import type { HouseRecurrence } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import {
  DEFAULT_CREATE_TIME, MAX_INTERVAL_WEEKS, MAX_LEAD_DAYS, RECURRENCE_PATTERN_OPTIONS, WEEKDAY_OPTIONS,
  describeCreateMoment, describeRecurrence, getNextVisitDate, normalizeRecurrence,
} from '../houseRecurrence';
import './RecurrenceField.css';

const INTERVAL_WEEK_OPTIONS = Array.from({ length: MAX_INTERVAL_WEEKS }, (_, index) => index + 1);
const MONTH_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => index + 1);
const LEAD_DAY_OPTIONS = Array.from({ length: MAX_LEAD_DAYS + 1 }, (_, index) => index);

const getLeadDaysLabel = (leadDays: number): string => {
  if (leadDays === 0) return 'The same day';
  return leadDays === 1 ? '1 day before' : `${leadDays} days before`;
};

interface RecurrenceFieldProps {
  recurrence?: HouseRecurrence | null;
  /** Schedule Date del formulario (AAAA-MM-DD): la visita de esta orden. */
  scheduleDate: string;
  isReadOnly: boolean;
  onChange: (recurrence: HouseRecurrence | null) => void;
}

const RecurrenceField = ({ recurrence: storedRecurrence, scheduleDate, isReadOnly, onChange }: RecurrenceFieldProps) => {
  const recurrence = normalizeRecurrence(storedRecurrence, scheduleDate);
  const nextVisitDate = recurrence ? getNextVisitDate(recurrence, scheduleDate) : '';
  const isNextVisitCreated = !!recurrence?.nextHouseId;

  const getHint = (): string => {
    if (!recurrence) return '';
    if (isNextVisitCreated) return 'The next visit was already created. Change the repeat on that one to affect future visits.';
    if (!scheduleDate) return 'Set the Schedule Date: the next visit is counted from it.';
    if (!nextVisitDate) return 'Choose at least one day of the week.';
    return `Next visit: ${formatDate(nextVisitDate)}. Its work order appears on ${describeCreateMoment(recurrence, nextVisitDate)} (Texas time).`;
  };
  const hint = getHint();

  const handlePatternChange = (value: string) => {
    const pattern = RECURRENCE_PATTERN_OPTIONS.find((option) => option.id === value)?.id;
    // '' = la opción "None" del selector: deja de repetirse.
    if (!pattern) return onChange(null);
    onChange(normalizeRecurrence({ ...recurrence, createTime: recurrence?.createTime ?? DEFAULT_CREATE_TIME, pattern }, scheduleDate));
  };

  const handleChange = (changes: Partial<HouseRecurrence>) => {
    if (recurrence) onChange({ ...recurrence, ...changes });
  };

  const handleToggleWeekday = (weekday: number) => {
    const weekdays = recurrence?.weekdays ?? [];
    const nextWeekdays = weekdays.includes(weekday) ? weekdays.filter((day) => day !== weekday) : [...weekdays, weekday];
    handleChange({ weekdays: nextWeekdays.sort((dayA, dayB) => dayA - dayB) });
  };

  if (isReadOnly) {
    return (
      <div>
        <label className="hv-label">Repeat</label>
        <p className="rcf-value">{describeRecurrence(recurrence) || 'Does not repeat'}</p>
      </div>
    );
  }

  return (
    <div className="rcf-field">
      <label className="hv-label">Repeat</label>
      <CustomSelect
        options={[...RECURRENCE_PATTERN_OPTIONS]}
        value={recurrence?.pattern ?? ''}
        onChange={handlePatternChange}
        placeholder="Does not repeat"
        icon={Repeat}
      />

      {recurrence && (
        <div className="rcf-options">
          {recurrence.pattern === 'weekly' && (
            <>
              <div className="rcf-row" role="group" aria-label="Days of the week">
                {WEEKDAY_OPTIONS.map((weekday) => {
                  const isSelected = !!recurrence.weekdays?.includes(weekday.id);
                  return (
                    <button
                      key={weekday.id}
                      type="button"
                      className={`rcf-day${isSelected ? ' is-selected' : ''}`}
                      aria-pressed={isSelected}
                      onClick={() => handleToggleWeekday(weekday.id)}
                    >
                      {weekday.shortName}
                    </button>
                  );
                })}
              </div>
              <label className="rcf-inline">
                <span>Every</span>
                <select
                  className="rcf-select"
                  value={recurrence.intervalWeeks ?? 1}
                  onChange={(event) => handleChange({ intervalWeeks: Number(event.target.value) })}
                >
                  {INTERVAL_WEEK_OPTIONS.map((weeks) => <option key={weeks} value={weeks}>{weeks}</option>)}
                </select>
                <span>{(recurrence.intervalWeeks ?? 1) === 1 ? 'week' : 'weeks'}</span>
              </label>
            </>
          )}

          {recurrence.pattern === 'monthly' && (
            <label className="rcf-inline">
              <span>On day</span>
              <select
                className="rcf-select"
                value={recurrence.monthDay ?? 1}
                onChange={(event) => handleChange({ monthDay: Number(event.target.value) })}
              >
                {MONTH_DAY_OPTIONS.map((day) => <option key={day} value={day}>{day}</option>)}
              </select>
              <span>of the month</span>
            </label>
          )}

          <label className="rcf-inline">
            <span>Order appears</span>
            <select
              className="rcf-select"
              value={recurrence.leadDays}
              onChange={(event) => handleChange({ leadDays: Number(event.target.value) })}
            >
              {LEAD_DAY_OPTIONS.map((leadDays) => <option key={leadDays} value={leadDays}>{getLeadDaysLabel(leadDays)}</option>)}
            </select>
          </label>
          <label className="rcf-inline">
            <span>At (Texas time)</span>
            <TimeInput
              className="rcf-time"
              value={recurrence.createTime}
              aria-label="Time the order appears, Texas time"
              onChange={(createTime) => handleChange({ createTime: createTime || DEFAULT_CREATE_TIME })}
            />
          </label>
        </div>
      )}

      {hint && <p className="rcf-hint">{hint}</p>}
    </div>
  );
};

export default RecurrenceField;
