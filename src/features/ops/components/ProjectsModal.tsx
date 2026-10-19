// Proyectos del Task list, en dos modos:
//   · 'create' ("New project"): solo el formulario, con las tareas que se
//     crean junto con el proyecto (ProjectTaskDraftList). Sin la lista de
//     proyectos (pedido de Omar, 10/2026).
//   · 'manage' (botón "Projects"): la lista por pestañas Active · Done ·
//     Archived para ver sus tareas, editar, cambiar estado y borrar. El lápiz y
//     el bote se ven siempre que el rol tenga Edit / Delete en "Projects"
//     (Roles); al borrar un proyecto con tareas, sus tareas quedan sin proyecto.
//     Con `initialProjectId` abre editando ese proyecto.
// Cerrar con la X o tocando fuera pregunta si hay cambios sin guardar, y un
// proyecto nuevo no se guarda si alguna tarea escrita no se puede crear (sin
// título o con una persona que ya no está en la lista): se avisa cuál.
import { useState, type CSSProperties, type FormEvent } from 'react';
import { ListChecks, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { AssignableUser, ProjectTaskDraft, TaskProject, TaskProjectStatus, Team } from '../../../types/index';
import DateInput from '../../../shared/components/DateInput';
import { formatDate } from '../../../utils/dateFormat';
import { getRelationName } from '../../../utils/relations';
import { PROJECT_COLORS, colorFor, projectHex } from '../opsOptions';
import { toTaskAssignee } from '../opsPermissions';
import type { ProjectInput } from '../../../services/taskProjectsService';
import {
  DEFAULT_DURATION_MINUTES, MAX_TASKS_WITH_NEW_PROJECT, type TaskInput,
} from '../../../services/userTasksService';
import ActionButton from './ActionButton';
import ProjectTaskDraftList from './ProjectTaskDraftList';
import './OpsModals.css';

/** 'create' = formulario de un proyecto nuevo · 'manage' = lista de proyectos. */
type ProjectsModalMode = 'create' | 'manage';

interface ProjectsModalProps {
  projects: TaskProject[];
  assignableUsers: AssignableUser[];
  /** Equipos de Settings (settings_teams) para `teamId`. */
  teams: Team[];
  defaultOwnerUserId: string;
  /** Permisos de "Projects" en Roles: Add = crear · Edit = editar y cambiar estado · Delete = borrar. */
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  /** `newProjectTasks` solo al crear: se crean junto con el proyecto. */
  onSaveProject: (input: ProjectInput, project: TaskProject | null, newProjectTasks: TaskInput[]) => Promise<boolean>;
  onProjectStatusChange: (project: TaskProject, status: TaskProjectStatus) => void;
  onDeleteProject: (project: TaskProject) => void;
  /** Abre la ventana con las tareas del proyecto (también de los archivados). */
  onOpenProjectTasks: (project: TaskProject) => void;
  initialMode: ProjectsModalMode;
  /** En 'manage': proyecto que se abre ya en edición. */
  initialProjectId?: string | null;
}

/** Pestañas de la lista, en orden. */
const STATUS_TABS: TaskProjectStatus[] = ['active', 'done', 'archived'];
const STATUS_LABEL: Record<TaskProjectStatus, string> = { active: 'Active', done: 'Done', archived: 'Archived' };

interface ProjectForm {
  title: string;
  description: string;
  ownerUserId: string;
  teamId: string;
  startDate: string;
  dueDate: string;
  color: string | null;
}

const createEmptyProjectForm = (ownerUserId: string, color: string): ProjectForm => ({
  title: '', description: '', ownerUserId, teamId: '', startDate: '', dueDate: '', color,
});

/** El color que se ve hoy: el elegido o, si no tiene, el automático por id. */
const getDisplayedColorId = (project: TaskProject): string | null =>
  project.color || PROJECT_COLORS.find((color) => color.hex === colorFor(project.id))?.id || null;

/** Tarea que se crea con el proyecto: sin fecha, con la duración de siempre. */
const taskInputFromDraft = (taskDraft: ProjectTaskDraft, assignableUsers: AssignableUser[]): TaskInput | null => {
  const title = taskDraft.title.trim();
  const assignee = assignableUsers.find((person) => person.id === taskDraft.assigneeUserId);
  if (!title || !assignee) return null;
  return {
    title,
    assignees: [toTaskAssignee(assignee)],
    dueDate: '',
    dueTime: '',
    durationMinutes: DEFAULT_DURATION_MINUTES,
    priorityId: null,
    projectId: null,
    projectTitle: null,
    repeat: null,
    approval: null,
  };
};

/** Números de las tareas escritas (1, 2…) que no se pueden crear: sin título o
 *  con una persona que ya no está en la lista. */
const getInvalidTaskDraftNumbers = (taskDrafts: ProjectTaskDraft[], assignableUsers: AssignableUser[]): number[] =>
  taskDrafts.flatMap((taskDraft, draftIndex) => (
    taskInputFromDraft(taskDraft, assignableUsers) ? [] : [draftIndex + 1]
  ));

/** "Task 2 needs…" / "Tasks 2, 4 need…": qué tareas escritas hay que corregir o quitar. */
const getInvalidTaskDraftsMessage = (invalidDraftNumbers: number[]): string => {
  const draftNumbersText = invalidDraftNumbers.join(', ');
  if (invalidDraftNumbers.length === 1) {
    return `Task ${draftNumbersText} needs a title and a person from the list. Fix it or remove it.`;
  }
  return `Tasks ${draftNumbersText} need a title and a person from the list. Fix them or remove them.`;
};

/** ¿Los dos formularios tienen los mismos valores? (para saber si hay cambios sin guardar). */
const isSameProjectForm = (firstForm: ProjectForm, secondForm: ProjectForm): boolean =>
  Object.entries(firstForm).every(([fieldName, fieldValue]) =>
    secondForm[fieldName as keyof ProjectForm] === fieldValue);

/** Formulario lleno con los datos de un proyecto (para editarlo). */
const formFromProject = (project: TaskProject): ProjectForm => ({
  title: project.title,
  description: project.description,
  ownerUserId: project.ownerUserId,
  teamId: project.teamId ?? '',
  startDate: project.startDate ?? '',
  dueDate: project.dueDate,
  color: getDisplayedColorId(project),
});

const ProjectsModal = ({
  projects, assignableUsers, teams, defaultOwnerUserId, canAdd, canEdit, canDelete, onClose, onSaveProject,
  onProjectStatusChange, onDeleteProject, onOpenProjectTasks, initialMode, initialProjectId,
}: ProjectsModalProps) => {
  // Un proyecto nuevo toma el siguiente color de la lista (se puede cambiar).
  const nextColorId = PROJECT_COLORS[projects.length % PROJECT_COLORS.length].id;
  const initialProject = initialMode === 'manage' ? projects.find((project) => project.id === initialProjectId) : undefined;
  const [mode, setMode] = useState<ProjectsModalMode>(initialMode);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(initialProject?.id ?? null);
  // Lo que tenía el formulario al abrirlo: si projectForm difiere, hay cambios sin guardar.
  const [savedProjectForm, setSavedProjectForm] = useState<ProjectForm>(() =>
    (initialProject ? formFromProject(initialProject) : createEmptyProjectForm(defaultOwnerUserId, nextColorId)));
  const [projectForm, setProjectForm] = useState<ProjectForm>(savedProjectForm);
  const [taskDrafts, setTaskDrafts] = useState<ProjectTaskDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  // Se intentó guardar con tareas que no se pueden crear: desde ahí se muestra el aviso.
  const [hasTriedToSubmit, setHasTriedToSubmit] = useState(false);
  const [selectedStatusTab, setSelectedStatusTab] = useState<TaskProjectStatus>(initialProject?.status ?? 'active');
  const isCreating = mode === 'create';
  const isFormVisible = isCreating ? canAdd : canEdit && !!editingProjectId;
  const hasUnsavedChanges = isFormVisible && (!isSameProjectForm(projectForm, savedProjectForm) || taskDrafts.length > 0);
  const invalidTaskDraftNumbers = isCreating ? getInvalidTaskDraftNumbers(taskDrafts, assignableUsers) : [];
  const invalidTaskDraftsMessage = hasTriedToSubmit && invalidTaskDraftNumbers.length > 0
    ? getInvalidTaskDraftsMessage(invalidTaskDraftNumbers)
    : null;

  const projectCountByStatus = Object.fromEntries(
    STATUS_TABS.map((status) => [status, projects.filter((project) => project.status === status).length]),
  ) as Record<TaskProjectStatus, number>;
  const visibleProjects = projects
    .filter((project) => project.status === selectedStatusTab)
    .sort((firstProject, secondProject) => firstProject.title.localeCompare(secondProject.title));
  const emptyListMessage = `No ${STATUS_LABEL[selectedStatusTab].toLowerCase()} projects.`;

  const handleStartEditing = (project: TaskProject) => {
    const editedProjectForm = formFromProject(project);
    setEditingProjectId(project.id);
    setSavedProjectForm(editedProjectForm);
    setProjectForm(editedProjectForm);
  };
  const resetForm = () => {
    const emptyProjectForm = createEmptyProjectForm(defaultOwnerUserId, nextColorId);
    setEditingProjectId(null);
    setSavedProjectForm(emptyProjectForm);
    setProjectForm(emptyProjectForm);
    setTaskDrafts([]);
    setHasTriedToSubmit(false);
  };

  // La X y tocar fuera: con cambios sin guardar, pregunta antes de perderlos.
  const handleRequestClose = () => {
    if (hasUnsavedChanges && !window.confirm('Discard the changes you haven\'t saved?')) return;
    onClose();
  };

  const handleStartCreating = () => {
    resetForm();
    setMode('create');
  };

  // Cancelar un proyecto nuevo: si se abrió desde la lista, vuelve a ella.
  const handleCancelForm = () => {
    resetForm();
    if (isCreating && initialMode === 'create') onClose();
    else setMode('manage');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!projectForm.title.trim() || isSaving) return;
    // Ninguna tarea escrita se pierde en silencio: si alguna no se puede crear, no se guarda.
    if (invalidTaskDraftNumbers.length > 0) {
      setHasTriedToSubmit(true);
      return;
    }
    const selectedOwner = assignableUsers.find((person) => person.id === projectForm.ownerUserId);
    const editedProject = projects.find((project) => project.id === editingProjectId);
    const newProjectTasks = editedProject ? [] : taskDrafts
      .map((taskDraft) => taskInputFromDraft(taskDraft, assignableUsers))
      .filter((taskInput): taskInput is TaskInput => taskInput !== null);
    const projectInput: ProjectInput = {
      title: projectForm.title.trim(),
      description: projectForm.description.trim(),
      ownerUserId: projectForm.ownerUserId,
      ownerUserName: selectedOwner?.name || editedProject?.ownerUserName || '',
      teamId: projectForm.teamId || null,
      startDate: projectForm.startDate,
      dueDate: projectForm.dueDate,
      color: projectForm.color,
      status: editedProject?.status ?? 'active',
    };
    setIsSaving(true);
    let isSaved = false;
    // Con finally el botón se vuelve a habilitar aunque onSaveProject lance.
    try {
      isSaved = await onSaveProject(projectInput, editedProject ?? null, newProjectTasks);
    } catch (error) {
      console.error('No se pudo guardar el proyecto:', error);
    } finally {
      setIsSaving(false);
    }
    if (!isSaved) return;
    // Un proyecto nuevo cierra la ventana (no hay lista que mostrar).
    if (isCreating) onClose();
    else resetForm();
  };

  const modalTitle = isCreating ? 'New project' : 'Projects';
  const formTitle = editingProjectId ? 'Edit project' : 'New project';
  const submitLabel = editingProjectId ? 'Save changes' : 'Add project';

  return (
    <div className="modal-overlay-centered" onClick={handleRequestClose}>
      <div className="modal-50 opm" role="dialog" aria-modal="true" aria-label={modalTitle}
        onClick={(event) => event.stopPropagation()}>
        <header className="opm-head">
          <h2 className="opm-title">{modalTitle}</h2>
          <button type="button" className="opm-close" onClick={handleRequestClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="opm-body">
          {!isCreating && canAdd && !editingProjectId && (
            <span className="opm-new-project">
              <ActionButton variant="secondary" size="sm" icon={<Plus size={14} />} onClick={handleStartCreating}>
                New project
              </ActionButton>
            </span>
          )}

          {isFormVisible && (
            <form className="opm-form" onSubmit={handleSubmit}>
              {!isCreating && <p className="opm-form-title">{formTitle}</p>}
              <label className="opm-field">
                <span className="opm-lbl">Name</span>
                <input className="opm-input" value={projectForm.title} maxLength={80}
                  onChange={(event) => setProjectForm({ ...projectForm, title: event.target.value })} />
              </label>
              <label className="opm-field">
                <span className="opm-lbl">Goal</span>
                <input className="opm-input" value={projectForm.description} maxLength={160}
                  onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })} />
              </label>
              <div className="opm-two">
                <label className="opm-field">
                  <span className="opm-lbl">Owner</span>
                  <select className="opm-input" value={projectForm.ownerUserId}
                    onChange={(event) => setProjectForm({ ...projectForm, ownerUserId: event.target.value })}>
                    {assignableUsers.map((person) => <option key={person.id} value={person.id}>{person.label}</option>)}
                  </select>
                </label>
                <label className="opm-field">
                  <span className="opm-lbl">Team</span>
                  <select className="opm-input" value={projectForm.teamId}
                    onChange={(event) => setProjectForm({ ...projectForm, teamId: event.target.value })}>
                    <option value="">No team</option>
                    {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="opm-two">
                <label className="opm-field">
                  <span className="opm-lbl">Start date</span>
                  <DateInput className="opm-input" placeholder="" value={projectForm.startDate}
                    onChange={(isoDate) => setProjectForm({ ...projectForm, startDate: isoDate })} />
                </label>
                <label className="opm-field">
                  <span className="opm-lbl">Due date</span>
                  <DateInput className="opm-input" placeholder="" value={projectForm.dueDate}
                    onChange={(isoDate) => setProjectForm({ ...projectForm, dueDate: isoDate })} />
                </label>
              </div>
              <fieldset className="opm-field opm-colors">
                <legend className="opm-lbl">Color</legend>
                <div className="opm-swatches">
                  {PROJECT_COLORS.map((color) => (
                    <button key={color.id} type="button" aria-label={color.label} aria-pressed={projectForm.color === color.id}
                      className={`opm-swatch${projectForm.color === color.id ? ' active' : ''}`}
                      style={{ '--chip-color': color.hex } as CSSProperties}
                      onClick={() => setProjectForm({ ...projectForm, color: color.id })} />
                  ))}
                </div>
              </fieldset>
              {isCreating && (
                <ProjectTaskDraftList
                  taskDrafts={taskDrafts}
                  assignableUsers={assignableUsers}
                  defaultAssigneeUserId={projectForm.ownerUserId}
                  maxTaskDrafts={MAX_TASKS_WITH_NEW_PROJECT}
                  onTaskDraftsChange={setTaskDrafts}
                />
              )}
              {invalidTaskDraftsMessage && <p className="error opm-form-error" role="alert">{invalidTaskDraftsMessage}</p>}
              <div className="opm-actions">
                <button type="button" className="opm-btn ghost" onClick={handleCancelForm}>Cancel</button>
                <button type="submit" className="opm-btn primary" disabled={!projectForm.title.trim() || isSaving}>
                  {submitLabel}
                </button>
              </div>
            </form>
          )}

          {!isCreating && (
            <div className="otl-tabs" role="tablist" aria-label="Project status">
              {STATUS_TABS.map((status) => (
                <button key={status} type="button" role="tab" aria-selected={status === selectedStatusTab}
                  className={`otl-tab${status === selectedStatusTab ? ' active' : ''}`}
                  onClick={() => setSelectedStatusTab(status)}>
                  {STATUS_LABEL[status]}
                  <span className="otl-tab-count">{projectCountByStatus[status]}</span>
                </button>
              ))}
            </div>
          )}

          {!isCreating && visibleProjects.length === 0 && <p className="opm-empty">{emptyListMessage}</p>}
          {!isCreating && visibleProjects.length > 0 && (
            <ul className="opm-list">
              {visibleProjects.map((project) => (
                <li key={project.id} className={`opm-item${project.status !== 'active' ? ' muted' : ''}`}>
                  <span className="opm-dot" style={{ '--chip-color': projectHex(project) } as CSSProperties} />
                  <div className="opm-item-text">
                    <p className="opm-item-name">{project.title}</p>
                    {project.description && <p className="opm-item-goal">{project.description}</p>}
                    <p className="opm-item-meta">
                      {project.ownerUserName || '—'}
                      {project.teamId ? ` · ${getRelationName(teams, project.teamId, 'Team')}` : ''}
                      {project.startDate ? ` · Starts ${formatDate(project.startDate)}` : ''}
                      {project.dueDate ? ` · Due ${formatDate(project.dueDate)}` : ''}
                      {` · ${project.doneCount ?? 0}/${project.taskCount ?? 0} done`}
                    </p>
                  </div>
                  <div className="opm-item-actions">
                    {canEdit ? (
                      <select className="opm-status" value={project.status} aria-label={`Status of ${project.title}`}
                        onChange={(event) => onProjectStatusChange(project, event.target.value as TaskProjectStatus)}>
                        {STATUS_TABS.map((status) => (
                          <option key={status} value={status}>{STATUS_LABEL[status]}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="opm-status-text">{STATUS_LABEL[project.status]}</span>
                    )}
                    <button type="button" className="opm-icon" onClick={() => onOpenProjectTasks(project)}
                      aria-label={`Tasks of ${project.title}`} title="Tasks">
                      <ListChecks size={14} />
                    </button>
                    {canEdit && (
                      <button type="button" className="opm-icon" onClick={() => handleStartEditing(project)}
                        aria-label={`Edit ${project.title}`}>
                        <Pencil size={14} />
                      </button>
                    )}
                    {canDelete && (
                      <button type="button" className="danger opm-icon" onClick={() => onDeleteProject(project)}
                        aria-label={`Delete ${project.title}`}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectsModal;
