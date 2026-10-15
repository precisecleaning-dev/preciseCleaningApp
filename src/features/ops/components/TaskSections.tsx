// Tareas abiertas agrupadas por vencimiento: Overdue, Today, This week,
// Later y No date (en ese orden; las secciones vacías no se muestran).
import type { OpsTask } from '../../../types/index';
import { SECTION_LABEL, SECTION_ORDER, sectionOf, type TaskSection } from '../opsDates';
import TaskRow from './TaskRow';

interface TaskSectionsProps {
  tasks: OpsTask[];
  today: string;
  selectedId: string | null;
  busyId: string | null;
  projectName: (task: OpsTask) => string | null;
  projectColor: (task: OpsTask) => string;
  personLabel: (task: OpsTask) => string;
  assignedByLabel: (task: OpsTask) => string | null;
  onOpen: (task: OpsTask) => void;
  onComplete: (task: OpsTask) => void;
}

// Dentro de cada sección: por fecha, luego por hora (sin hora al final) y por
// fecha de creación.
const byDue = (a: OpsTask, b: OpsTask) =>
  (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
  || (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99')
  || (a.createdAt || '').localeCompare(b.createdAt || '');

export default function TaskSections({
  tasks, today, selectedId, busyId, projectName, projectColor, personLabel, assignedByLabel, onOpen, onComplete,
}: TaskSectionsProps) {
  const groups = new Map<TaskSection, OpsTask[]>();
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
                  today={today}
                  assigneeLabel={personLabel(task)}
                  assignedByLabel={assignedByLabel(task)}
                  projectName={projectName(task)}
                  projectColor={projectColor(task)}
                  selected={task.id === selectedId}
                  busy={busyId === task.id}
                  onOpen={onOpen}
                  onComplete={onComplete}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
