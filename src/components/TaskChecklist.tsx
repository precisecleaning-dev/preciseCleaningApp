// ⭐ Tareas pendientes del Task list con casilla (vistas Owner y Manager).
//    Aquí solo se ven y se marcan hechas (salen de la lista); crear, editar y
//    borrar es en el Task list. Con varias personas se muestra a quiénes está
//    asignada.
import type { UserTask } from '../types/index';
import { addDays, sectionOf, ymdToDate } from '../features/ops/opsDates';
import { namesSummary } from '../features/ops/opsOptions';
import { isOnlyAssignee } from '../features/ops/opsPermissions';
import { formatDate } from '../utils/dateFormat';

interface TaskChecklistProps {
  tasks: UserTask[];
  /** Hoy, AAAA-MM-DD. */
  today: string;
  meId: string;
  /** Etiqueta con las personas asignadas (cuando la lista es de varias). */
  showAssignee: boolean;
  busyId: string | null;
  canComplete: boolean;
  onComplete: (t: UserTask) => void;
  emptyText: string;
}

const firstName = (name: string) => name.split(' ')[0] || name;

/** "Me, Sandy +1": nombres cortos de las personas de la tarea. */
const assigneesText = (t: UserTask, meId: string): string =>
  namesSummary(t.assigneeUserIds.map((id, index) => (id === meId ? 'Me' : firstName(t.assigneeUserNames[index] ?? ''))));

/** "14:30" → "2:30 PM"; "14:00" → "2 PM". */
function shortTime(hm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm || '');
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 || 12}${m[2] === '00' ? '' : `:${m[2]}`} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Vencimiento corto: "Overdue", "Today 2 PM", "Fri", "10/24/2026" o "—". */
function dueText(t: UserTask, today: string): { text: string; tone: 'overdue' | 'today' | 'later' } {
  const section = sectionOf(t.dueDate, today);
  if (section === 'nodate') return { text: '—', tone: 'later' };
  if (section === 'overdue') return { text: 'Overdue', tone: 'overdue' };
  const time = shortTime(t.dueTime);
  if (section === 'today') return { text: time ? `Today ${time}` : 'Today', tone: 'today' };
  if (t.dueDate < addDays(today, 6)) {
    return { text: ymdToDate(t.dueDate).toLocaleDateString('en-US', { weekday: 'short' }), tone: 'later' };
  }
  return { text: formatDate(t.dueDate), tone: 'later' };
}

export default function TaskChecklist({
  tasks, today, meId, showAssignee, busyId, canComplete, onComplete, emptyText,
}: TaskChecklistProps) {
  if (tasks.length === 0) return <p className="hm-empty">{emptyText}</p>;
  return (
    <ul className="hm-tasks">
      {tasks.map((t) => {
        const due = dueText(t, today);
        const fromOther = !!t.createdByUserId && !isOnlyAssignee(t, t.createdByUserId);
        return (
          <li key={t.id} className="hm-task">
            <label className="hm-task-main">
              <input
                type="checkbox"
                className="hm-check"
                checked={false}
                disabled={!canComplete || busyId === t.id}
                onChange={() => onComplete(t)}
                aria-label={`Mark "${t.title}" as done`}
              />
              <span className="hm-task-text">
                <span className="hm-task-title">{t.title}</span>
                {fromOther && <span className="hm-task-sub">From {firstName(t.createdByUserName) || 'the office'}</span>}
              </span>
            </label>
            {showAssignee && (
              <span className="hm-tag">{assigneesText(t, meId)}</span>
            )}
            <span className={`hm-due ${due.tone}`}>{due.text}</span>
          </li>
        );
      })}
    </ul>
  );
}
