// Columna "My projects" del Task list: botón "+ New project", calendario del
// mes con las tareas abiertas (tocar un día filtra la vista a ese día) y una
// tarjeta por proyecto activo. Sin "View" en Projects queda solo el calendario.
import { Plus } from 'lucide-react';
import type { TaskProject, UserTask } from '../../../types/index';
import ActionButton from './ActionButton';
import ProjectCard from './ProjectCard';
import TaskCalendar from './TaskCalendar';
import './MyProjectsPanel.css';

interface MyProjectsPanelProps {
  /** "My projects", "Sandy's projects"… */
  title: string;
  /** Proyectos activos que se muestran: los que la persona que se mira tiene a
   *  cargo y aquellos donde tiene tareas abiertas o que asignó. */
  projects: TaskProject[];
  /** Tareas abiertas cargadas: van al calendario y dan el avance de cada proyecto. */
  openTasks: UserTask[];
  /** Hoy, AAAA-MM-DD. */
  todayIsoDate: string;
  currentUserId: string;
  /** Día del calendario por el que se filtra (null = ninguno). */
  selectedIsoDate: string | null;
  onSelectDate: (isoDate: string | null) => void;
  /** Sin "View" en Projects solo se ve el calendario (ni tarjetas ni botón). */
  canViewProjects: boolean;
  canCreateProject: boolean;
  onOpenProject: (project: TaskProject) => void;
  onCreateProject: () => void;
}

const MyProjectsPanel = ({
  title, projects, openTasks, todayIsoDate, currentUserId, selectedIsoDate, onSelectDate, canViewProjects, canCreateProject,
  onOpenProject, onCreateProject,
}: MyProjectsPanelProps) => {
  const openTasksByProjectId = new Map<string, UserTask[]>();
  openTasks.forEach((task) => {
    if (!task.projectId) return;
    openTasksByProjectId.set(task.projectId, [...(openTasksByProjectId.get(task.projectId) ?? []), task]);
  });

  const emptyProjectsMessage = selectedIsoDate ? 'No active projects with tasks that day.' : 'No active projects.';
  const panelTitle = canViewProjects ? title : 'Calendar';

  return (
    <aside className="my-projects" aria-label={panelTitle}>
      <div className="my-projects-head">
        <h2 className="my-projects-title">{panelTitle}</h2>
        {canCreateProject && (
          <ActionButton variant="secondary" size="sm" icon={<Plus size={14} />} onClick={onCreateProject}>
            New project
          </ActionButton>
        )}
      </div>

      <TaskCalendar tasks={openTasks} todayIsoDate={todayIsoDate} selectedIsoDate={selectedIsoDate} onSelectDate={onSelectDate} />

      {canViewProjects && (
        <>
          {projects.length === 0 && <p className="my-projects-empty">{emptyProjectsMessage}</p>}
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              openProjectTasks={openTasksByProjectId.get(project.id) ?? []}
              todayIsoDate={todayIsoDate}
              currentUserId={currentUserId}
              onOpen={onOpenProject}
            />
          ))}
          <p className="my-projects-note">
            Click a project to open it. A project is off track when one of its tasks is overdue — including tasks you
            gave to others.
          </p>
        </>
      )}
    </aside>
  );
};

export default MyProjectsPanel;
