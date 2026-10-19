// Una sección de tareas: su título con el total y una tarjeta (TaskRow) por
// tarea. La usan las pestañas de la lista (Overdue, Daily, Needs Approval…) y
// la ventana de las tareas de un proyecto; las tareas llegan ya ordenadas.
import type { UserTask } from '../../../types/index';
import TaskRow from './TaskRow';

interface TaskSectionProps {
  title: string;
  /** Clase del color del título ('overdue', 'daily', 'approval'…; '' = gris). */
  tone: string;
  tasks: UserTask[];
  /** Hoy, AAAA-MM-DD. */
  todayIsoDate: string;
  selectedTaskId: string | null;
  busyTaskId: string | null;
  getProjectTitle: (task: UserTask) => string | null;
  getProjectColor: (task: UserTask) => string;
  getAssigneesLabel: (task: UserTask) => string;
  getAssignedByName: (task: UserTask) => string | null;
  onOpen: (task: UserTask) => void;
  onMarkDone: (task: UserTask) => void;
  /** Filas sin casilla: p. ej. las que esperan MI visto bueno (quien aprueba
   *  revisa la tarea, no la marca hecha). Sin esta función todas la llevan. */
  isReviewOnly?: (task: UserTask) => boolean;
}

const TaskSection = ({
  title, tone, tasks, todayIsoDate, selectedTaskId, busyTaskId, getProjectTitle, getProjectColor, getAssigneesLabel,
  getAssignedByName, onOpen, onMarkDone, isReviewOnly,
}: TaskSectionProps) => (
  <section className="otl-section" aria-label={title}>
    <h2 className={`otl-section-title${tone ? ` ${tone}` : ''}`}>
      {title} · {tasks.length}
    </h2>
    <ul className="otl-rows">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          todayIsoDate={todayIsoDate}
          assigneesLabel={getAssigneesLabel(task)}
          assignedByName={getAssignedByName(task)}
          projectTitle={getProjectTitle(task)}
          projectColor={getProjectColor(task)}
          isSelected={task.id === selectedTaskId}
          isBusy={busyTaskId === task.id}
          onOpen={onOpen}
          onMarkDone={isReviewOnly?.(task) ? undefined : onMarkDone}
        />
      ))}
    </ul>
  </section>
);

export default TaskSection;
