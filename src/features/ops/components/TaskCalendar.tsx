// Calendario del mes en "My projects": un punto azul los días con tareas
// abiertas y uno rojo si alguna de ese día ya está vencida. Hoy va marcado.
// Las flechas cambian de mes.
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { UserTask } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import { ymdToDate } from '../opsDates';
import { MONTH_NAMES, WEEKDAY_LETTERS, WEEKDAY_NAMES } from '../opsOptions';
import './TaskCalendar.css';

interface TaskCalendarProps {
  /** Tareas abiertas que se marcan en el calendario (por `dueDate`). */
  tasks: UserTask[];
  /** Hoy, AAAA-MM-DD. */
  todayIsoDate: string;
}

const padTwoDigits = (value: number) => String(value).padStart(2, '0');

const TaskCalendar = ({ tasks, todayIsoDate }: TaskCalendarProps) => {
  // 0 = el mes de hoy; -1 = el anterior; 1 = el siguiente.
  const [monthOffset, setMonthOffset] = useState(0);

  const today = ymdToDate(todayIsoDate);
  const shownMonthStart = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1, 12);
  const shownYear = shownMonthStart.getFullYear();
  const shownMonth = shownMonthStart.getMonth();
  const daysInShownMonth = new Date(shownYear, shownMonth + 1, 0).getDate();
  const leadingBlankDays = shownMonthStart.getDay();
  const monthTitle = `${MONTH_NAMES[shownMonth]} ${shownYear}`;

  const taskCountByDate = new Map<string, number>();
  tasks.forEach((task) => {
    if (task.dueDate) taskCountByDate.set(task.dueDate, (taskCountByDate.get(task.dueDate) ?? 0) + 1);
  });

  const calendarDays = Array.from({ length: daysInShownMonth }, (_, dayIndex) => {
    const dayOfMonth = dayIndex + 1;
    const isoDate = `${shownYear}-${padTwoDigits(shownMonth + 1)}-${padTwoDigits(dayOfMonth)}`;
    const taskCount = taskCountByDate.get(isoDate) ?? 0;
    const isOverdue = taskCount > 0 && isoDate < todayIsoDate;
    const taskSummary = taskCount > 0 ? ` · ${taskCount} task${taskCount === 1 ? '' : 's'}${isOverdue ? ' overdue' : ''}` : '';
    const dayClasses = [isoDate < todayIsoDate ? 'past' : '', isoDate === todayIsoDate ? 'today' : '']
      .filter(Boolean)
      .join(' ');
    return { dayOfMonth, isoDate, taskCount, isOverdue, dayClasses, ariaLabel: `${formatDate(isoDate)}${taskSummary}` };
  });

  return (
    <div className="task-calendar">
      <div className="task-calendar-head">
        <button type="button" className="task-calendar-nav" aria-label="Previous month"
          onClick={() => setMonthOffset((offset) => offset - 1)}>
          <ChevronLeft size={16} />
        </button>
        <h3 className="task-calendar-title">{monthTitle}</h3>
        <button type="button" className="task-calendar-nav" aria-label="Next month"
          onClick={() => setMonthOffset((offset) => offset + 1)}>
          <ChevronRight size={16} />
        </button>
        <span className="task-calendar-legend">
          <span className="task-calendar-dot" /> Tasks
          <span className="overdue task-calendar-dot" /> Overdue
        </span>
      </div>
      <div className="task-calendar-grid">
        {WEEKDAY_LETTERS.map((letter, weekdayIndex) => (
          <abbr key={WEEKDAY_NAMES[weekdayIndex]} className="task-calendar-weekday" title={WEEKDAY_NAMES[weekdayIndex]}>
            {letter}
          </abbr>
        ))}
        {Array.from({ length: leadingBlankDays }, (_, blankIndex) => (
          <span key={`blank-${blankIndex}`} className="task-calendar-blank" aria-hidden="true" />
        ))}
        {calendarDays.map((calendarDay) => (
          <span
            key={calendarDay.isoDate}
            className={`task-calendar-day${calendarDay.dayClasses ? ` ${calendarDay.dayClasses}` : ''}`}
            aria-label={calendarDay.ariaLabel}
          >
            {calendarDay.dayOfMonth}
            {calendarDay.taskCount > 0 && (
              <span className={`task-calendar-dot${calendarDay.isOverdue ? ' overdue' : ''}`} />
            )}
          </span>
        ))}
      </div>
    </div>
  );
};

export default TaskCalendar;
