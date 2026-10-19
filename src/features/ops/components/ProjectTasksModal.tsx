// Ventana de un proyecto (clic en su tarjeta de "My projects"): sus datos y
// todas sus tareas pendientes con la misma sección y las mismas filas de la
// lista (TaskSection + TaskRow). Desde aquí se abre una tarea, se marca hecha
// o se edita el proyecto.
import type { CSSProperties } from 'react';
import { Loader2, Pencil, X } from 'lucide-react';
import type { TaskProject, UserTask } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import { getFirstName, projectHex } from '../opsOptions';
import ActionButton from './ActionButton';
import TaskSection from './TaskSection';
import './OpsModals.css';

interface ProjectTasksModalProps {
  project: TaskProject;
  /** Tareas pendientes del proyecto, ya ordenadas. */
  pendingTasks: UserTask[];
  isLoading: boolean;
  hasLoadError: boolean;
  /** Hoy, AAAA-MM-DD. */
  todayIsoDate: string;
  currentUserId: string;
  busyTaskId: string | null;
  canEditProject: boolean;
  getProjectTitle: (task: UserTask) => string | null;
  getProjectColor: (task: UserTask) => string;
  getAssigneesLabel: (task: UserTask) => string;
  getAssignedByName: (task: UserTask) => string | null;
  onOpenTask: (task: UserTask) => void;
  onMarkDone: (task: UserTask) => void;
  onEditProject: (project: TaskProject) => void;
  onClose: () => void;
}

const ProjectTasksModal = ({
  project, pendingTasks, isLoading, hasLoadError, todayIsoDate, currentUserId, busyTaskId, canEditProject,
  getProjectTitle, getProjectColor, getAssigneesLabel, getAssignedByName, onOpenTask, onMarkDone, onEditProject, onClose,
}: ProjectTasksModalProps) => {
  const ownerName = project.ownerUserId === currentUserId ? 'Me' : getFirstName(project.ownerUserName) || '—';
  const dueText = project.dueDate ? `Due ${formatDate(project.dueDate)}` : 'No due date';
  const projectMeta = `Owner: ${ownerName} · ${dueText} · ${project.doneCount ?? 0}/${project.taskCount ?? 0} done`;
  const titleStyle = { '--chip-color': projectHex(project) } as CSSProperties;

  const tasksContent = (() => {
    if (hasLoadError) {
      return <p className="error opm-empty" role="alert">Could not load the tasks. Check your connection and try again.</p>;
    }
    if (isLoading) return <p className="opm-empty"><Loader2 size={14} className="otl-spin" /> Loading tasks…</p>;
    if (pendingTasks.length === 0) return <p className="opm-empty">This project has no pending tasks.</p>;
    return (
      <TaskSection
        title="Pending tasks"
        tone=""
        tasks={pendingTasks}
        todayIsoDate={todayIsoDate}
        selectedTaskId={null}
        busyTaskId={busyTaskId}
        getProjectTitle={getProjectTitle}
        getProjectColor={getProjectColor}
        getAssigneesLabel={getAssigneesLabel}
        getAssignedByName={getAssignedByName}
        onOpen={onOpenTask}
        onMarkDone={onMarkDone}
      />
    );
  })();

  return (
    <div className="modal-overlay-centered" onClick={onClose}>
      <div className="modal-50 opm" role="dialog" aria-modal="true" aria-label={project.title}
        onClick={(event) => event.stopPropagation()}>
        <header className="opm-head">
          <div className="opm-project-head">
            <h2 className="opm-project-title opm-title" style={titleStyle}>
              <span className="opm-dot" aria-hidden="true" />
              {project.title}
            </h2>
            {project.description && <p className="opm-item-goal">{project.description}</p>}
            <p className="opm-item-meta">{projectMeta}</p>
          </div>
          <div className="opm-item-actions">
            {canEditProject && (
              <ActionButton variant="outline" size="sm" icon={<Pencil size={14} />} onClick={() => onEditProject(project)}>
                Edit project
              </ActionButton>
            )}
            <button type="button" className="opm-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        </header>
        <div className="opm-body">{tasksContent}</div>
      </div>
    </div>
  );
};

export default ProjectTasksModal;
