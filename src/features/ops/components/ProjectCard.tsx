// Tarjeta de un proyecto en "My projects": color, título, si va atrasado
// (OFF TRACK = alguna de sus tareas abiertas está vencida, también las que se
// dieron a otras personas), responsable, fecha límite, avance (hechas / total)
// y la siguiente tarea. Al tocarla se abre el proyecto.
import type { CSSProperties } from 'react';
import type { TaskProject, UserTask } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import { compareByDue } from '../opsDates';
import { getFirstName, namesSummary, projectHex } from '../opsOptions';
import './ProjectCard.css';

interface ProjectCardProps {
  project: TaskProject;
  /** Tareas abiertas del proyecto que se tienen cargadas. */
  openProjectTasks: UserTask[];
  /** Hoy, AAAA-MM-DD. */
  todayIsoDate: string;
  currentUserId: string;
  onOpen: (project: TaskProject) => void;
}

const ProjectCard = ({ project, openProjectTasks, todayIsoDate, currentUserId, onOpen }: ProjectCardProps) => {
  const isOffTrack = openProjectTasks.some((task) => !!task.dueDate && task.dueDate < todayIsoDate);
  const ownerName = project.ownerUserId === currentUserId ? 'Me' : getFirstName(project.ownerUserName) || '—';
  const dueText = project.dueDate ? `Due ${formatDate(project.dueDate)}` : 'No due date';
  const doneTaskCount = Math.max(0, project.doneCount ?? 0);
  const totalTaskCount = Math.max(doneTaskCount, project.taskCount ?? 0);
  const progressPercent = totalTaskCount > 0 ? Math.round((doneTaskCount / totalTaskCount) * 100) : 0;
  const nextTask = [...openProjectTasks].sort(compareByDue)[0];
  const nextTaskAssignees = nextTask
    ? namesSummary(nextTask.assignees.map((assignee) =>
      (assignee.userId === currentUserId ? 'me' : getFirstName(assignee.userName))))
    : '';
  const cardStyle = {
    '--project-color': projectHex(project),
    '--project-progress': `${progressPercent}%`,
  } as CSSProperties;

  return (
    <button type="button" className="project-card" style={cardStyle} onClick={() => onOpen(project)}>
      <span className="project-card-head">
        <span className="project-card-dot" aria-hidden="true" />
        <span className="project-card-title">{project.title}</span>
        <span className={`project-card-status${isOffTrack ? ' off' : ''}`}>{isOffTrack ? 'Off track' : 'On track'}</span>
      </span>
      <span className="project-card-meta">
        Owner: <strong>{ownerName}</strong> · {dueText}
      </span>
      <span className="project-card-progress">
        <span
          className="project-card-bar"
          role="progressbar"
          aria-label={`${doneTaskCount} of ${totalTaskCount} tasks done`}
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span className="project-card-bar-fill" />
        </span>
        <span className="project-card-count">{doneTaskCount} / {totalTaskCount}</span>
      </span>
      {nextTask && (
        <span className="project-card-next">
          <strong>Next:</strong> {nextTask.title}{nextTaskAssignees ? ` (${nextTaskAssignees})` : ''}
        </span>
      )}
    </button>
  );
};

export default ProjectCard;
