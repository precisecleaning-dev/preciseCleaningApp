// Tareas abiertas agrupadas por vencimiento: Overdue, Today, This week,
// Later y No date (en ese orden; las secciones vacías no se muestran).
import type { UserTask } from '../../../types/index';
import { SECTION_LABEL, SECTION_ORDER, sectionOf, type TaskSection } from '../opsDates';
import TaskRow from './TaskRow';

interface TaskSectionsProps {
  tasks: UserTask[];
  today: string;
  selectedId: string | null;
  busyId: string | null;
  projectName: (task: UserTask) => string | null;
  projectColor: (task: UserTask) => string;
  personLabel: (task: UserTask) => string;
  assignedByLabel: (task: UserTask) => string | null;
  onOpen: (task: UserTask) => void;
  onComplete: (task: UserTask) => void;
}

// Dentro de cada sección: por fecha, luego por hora (sin hora al final) y por
// fecha de creación.
const byDue = (a: UserTask, b: UserTask) =>
  (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
  || (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99')
  || (a.createdAt || '').localeCompare(b.createdAt || '');

export default function TaskSections({
  tasks, today, selectedId, busyId, projectName, projectColor, personLabel, assignedByLabel, onOpen, onComplete,
}: TaskSectionsProps) {
  const groups = new Map<TaskSection, UserTask[]>();
  tasks.forEach((t) => {
    const s = sectionOf(t.dueDate, today);
    const list = groups.get(s);
    if (list) list.push(t);
    else groups.set(s, [t]);
  });

  return (
    <>
      {SECTION_ORDER.map((section) => {
        const list = groups.get(section);
        if (!list || list.length === 0) return null;
        return (
          <section key={section} className="otl-section" aria-label={SECTION_LABEL[section]}>
            <h2 className={`otl-section-title ${section}`}>
              {SECTION_LABEL[section]} · {list.length}
            </h2>
            <ul className="otl-rows">
              {[...list].sort(byDue).map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  todayIsoDate={today}
                  assigneesLabel={personLabel(task)}
                  assignedByName={assignedByLabel(task)}
                  projectTitle={projectName(task)}
                  projectColor={projectColor(task)}
                  isSelected={task.id === selectedId}
                  isBusy={busyId === task.id}
                  onOpen={onOpen}
                  onMarkDone={onComplete}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
