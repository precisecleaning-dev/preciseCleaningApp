// Una sección de la lista (Daily, Overdue, Today, This week, Later o No date):
// su título con el total y una tarjeta (TaskRow) por tarea. La misma para todas
// las pestañas; las tareas llegan ya ordenadas (groupTasksBySection).
import type { UserTask } from '../../../types/index';
import { SECTION_LABEL, type TaskSection as TaskSectionId } from '../opsDates';
import TaskRow from './TaskRow';

interface TaskSectionProps {
  section: TaskSectionId;
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
}

const TaskSection = ({
  section, tasks, todayIsoDate, selectedTaskId, busyTaskId, getProjectTitle, getProjectColor, getAssigneesLabel,
  getAssignedByName, onOpen, onMarkDone,
}: TaskSectionProps) => (
  <section className="otl-section" aria-label={SECTION_LABEL[section]}>
    <h2 className={`otl-section-title ${section}`}>
      {SECTION_LABEL[section]} · {tasks.length}
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
          onMarkDone={onMarkDone}
        />
      ))}
    </ul>
  </section>
);

export default TaskSection;
