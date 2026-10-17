// Columna "My projects" del Task list: botón "+ New project", calendario del
// mes con las tareas abiertas y una tarjeta por proyecto activo.
import { Plus } from 'lucide-react';
import type { TaskProject, UserTask } from '../../../types/index';
import ActionButton from './ActionButton';
import ProjectCard from './ProjectCard';
import TaskCalendar from './TaskCalendar';
import './MyProjectsPanel.css';

interface MyProjectsPanelProps {
  /** "My projects", "Sandy's projects"… */
  title: string;
  /** Proyectos activos que se muestran (los de la persona que se mira). */
  projects: TaskProject[];
  /** Tareas abiertas cargadas: van al calendario y dan el avance de cada proyecto. */
  openTasks: UserTask[];
  /** Hoy, AAAA-MM-DD. */
  todayIsoDate: string;
  currentUserId: string;
  canCreateProject: boolean;
  onOpenProject: (project: TaskProject) => void;
  onCreateProject: () => void;
}

const MyProjectsPanel = ({
  title, projects, openTasks, todayIsoDate, currentUserId, canCreateProject, onOpenProject, onCreateProject,
}: MyProjectsPanelProps) => {
  const openTasksByProjectId = new Map<string, UserTask[]>();
  openTasks.forEach((task) => {
    if (!task.projectId) return;
    openTasksByProjectId.set(task.projectId, [...(openTasksByProjectId.get(task.projectId) ?? []), task]);
  });

  return (
    <aside className="my-projects" aria-label={title}>
      <div className="my-projects-head">
        <h2 className="my-projects-title">{title}</h2>
        {canCreateProject && (
          <ActionButton variant="secondary" size="sm" icon={<Plus size={14} />} onClick={onCreateProject}>
            New project
          </ActionButton>
        )}
      </div>

      <TaskCalendar tasks={openTasks} todayIsoDate={todayIsoDate} />

      {projects.length === 0 && <p className="my-projects-empty">No active projects.</p>}
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
        Click a project to open it. A project is off track when one of its tasks is overdue — including tasks you gave
        to others.
      </p>
    </aside>
  );
};

export default MyProjectsPanel;
