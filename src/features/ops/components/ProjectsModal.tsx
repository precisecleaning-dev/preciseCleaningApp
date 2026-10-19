// Proyectos del Task list, en dos modos:
//   · 'create' ("New project"): solo el formulario, con las tareas que se
//     crean junto con el proyecto (ProjectTaskDraftList). Sin la lista de
//     proyectos (pedido de Omar, 10/2026).
//   · 'manage' (botón "Projects"): la lista por pestañas Active · Done ·
//     Archived para ver sus tareas, editar, cambiar estado y borrar. El lápiz y
//     el bote se ven siempre que el rol tenga Edit / Delete en "Projects"
//     (Roles); al borrar un proyecto con tareas, sus tareas quedan sin proyecto.
//     Con `initialProjectId` abre editando ese proyecto.
import { useState, type CSSProperties, type FormEvent } from 'react';
import { ListChecks, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { AssignableUser, ProjectTaskDraft, TaskProject, TaskProjectStatus, Team } from '../../../types/index';
import DateInput from '../../../shared/components/DateInput';
import { formatDate } from '../../../utils/dateFormat';
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
  people: AssignableUser[];
  /** Equipos de Settings (settings_teams) para `teamId`. */
  teams: Team[];
  defaultOwnerId: string;
  /** Permisos de "Projects" en Roles: Add = crear · Edit = editar y cambiar estado · Delete = borrar. */
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  /** `newProjectTasks` solo al crear: se crean junto con el proyecto. */
  onSave: (input: ProjectInput, project: TaskProject | null, newProjectTasks: TaskInput[]) => Promise<boolean>;
  onStatus: (project: TaskProject, status: TaskProjectStatus) => void;
  onDelete: (project: TaskProject) => void;
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

const emptyForm = (ownerUserId: string, color: string): ProjectForm => ({
  title: '', description: '', ownerUserId, teamId: '', startDate: '', dueDate: '', color,
});

/** El color que se ve hoy: el elegido o, si no tiene, el automático por id. */
const shownColor = (p: TaskProject): string | null =>
  p.color || PROJECT_COLORS.find((c) => c.hex === colorFor(p.id))?.id || null;

/** Tarea que se crea con el proyecto: sin fecha, con la duración de siempre. */
const taskInputFromDraft = (taskDraft: ProjectTaskDraft, people: AssignableUser[]): TaskInput | null => {
  const title = taskDraft.title.trim();
  const assignee = people.find((person) => person.id === taskDraft.assigneeUserId);
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

/** Formulario lleno con los datos de un proyecto (para editarlo). */
const formFromProject = (project: TaskProject): ProjectForm => ({
  title: project.title,
  description: project.description,
  ownerUserId: project.ownerUserId,
  teamId: project.teamId ?? '',
  startDate: project.startDate ?? '',
  dueDate: project.dueDate,
  color: shownColor(project),
});

const ProjectsModal = ({
  projects, people, teams, defaultOwnerId, canAdd, canEdit, canDelete, onClose, onSave, onStatus, onDelete,
  onOpenProjectTasks, initialMode, initialProjectId,
}: ProjectsModalProps) => {
  // Un proyecto nuevo toma el siguiente color de la lista (se puede cambiar).
  const nextColor = PROJECT_COLORS[projects.length % PROJECT_COLORS.length].id;
  const initialProject = initialMode === 'manage' ? projects.find((project) => project.id === initialProjectId) : undefined;
  const [mode, setMode] = useState<ProjectsModalMode>(initialMode);
  const [editingId, setEditingId] = useState<string | null>(initialProject?.id ?? null);
  const [form, setForm] = useState<ProjectForm>(() =>
    (initialProject ? formFromProject(initialProject) : emptyForm(defaultOwnerId, nextColor)));
  const [taskDrafts, setTaskDrafts] = useState<ProjectTaskDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedStatusTab, setSelectedStatusTab] = useState<TaskProjectStatus>(initialProject?.status ?? 'active');
  const isCreating = mode === 'create';
  const isFormVisible = isCreating ? canAdd : canEdit && !!editingId;

  const projectCountByStatus = Object.fromEntries(
    STATUS_TABS.map((status) => [status, projects.filter((project) => project.status === status).length]),
  ) as Record<TaskProjectStatus, number>;
  const sorted = projects
    .filter((project) => project.status === selectedStatusTab)
    .sort((firstProject, secondProject) => firstProject.title.localeCompare(secondProject.title));
  const emptyListMessage = `No ${STATUS_LABEL[selectedStatusTab].toLowerCase()} projects.`;

  const startEdit = (p: TaskProject) => {
    setEditingId(p.id);
    setForm(formFromProject(p));
  };
  const reset = () => {
    setEditingId(null);
    setForm(emptyForm(defaultOwnerId, nextColor));
    setTaskDrafts([]);
  };

  const handleStartCreating = () => {
    reset();
    setMode('create');
  };

  // Cancelar un proyecto nuevo: si se abrió desde la lista, vuelve a ella.
  const handleCancelForm = () => {
    reset();
    if (isCreating && initialMode === 'create') onClose();
    else setMode('manage');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || saving) return;
    const owner = people.find((p) => p.id === form.ownerUserId);
    const current = projects.find((p) => p.id === editingId);
    const newProjectTasks = current ? [] : taskDrafts
      .map((taskDraft) => taskInputFromDraft(taskDraft, people))
      .filter((taskInput): taskInput is TaskInput => taskInput !== null);
    setSaving(true);
    const ok = await onSave({
      title: form.title.trim(),
      description: form.description.trim(),
      ownerUserId: form.ownerUserId,
      ownerUserName: owner?.name || current?.ownerUserName || '',
      teamId: form.teamId || null,
      startDate: form.startDate,
      dueDate: form.dueDate,
      color: form.color,
      status: current?.status || 'active',
    }, current || null, newProjectTasks);
    setSaving(false);
    if (!ok) return;
    // Un proyecto nuevo cierra la ventana (no hay lista que mostrar).
    if (isCreating) onClose();
    else reset();
  };

  const modalTitle = isCreating ? 'New project' : 'Projects';
  const formTitle = editingId ? 'Edit project' : 'New project';
  const submitLabel = editingId ? 'Save changes' : 'Add project';

  return (
    <div className="modal-overlay-centered" onClick={onClose}>
      <div className="modal-50 opm" role="dialog" aria-modal="true" aria-label={modalTitle} onClick={(e) => e.stopPropagation()}>
        <header className="opm-head">
          <h2 className="opm-title">{modalTitle}</h2>
          <button type="button" className="opm-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="opm-body">
          {!isCreating && canAdd && !editingId && (
            <span className="opm-new-project">
              <ActionButton variant="secondary" size="sm" icon={<Plus size={14} />} onClick={handleStartCreating}>
                New project
              </ActionButton>
            </span>
          )}

          {isFormVisible && (
            <form className="opm-form" onSubmit={submit}>
              {!isCreating && <p className="opm-form-title">{formTitle}</p>}
              <label className="opm-field">
                <span className="opm-lbl">Name</span>
                <input className="opm-input" value={form.title} maxLength={80}
                  onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </label>
              <label className="opm-field">
                <span className="opm-lbl">Goal</span>
                <input className="opm-input" value={form.description} maxLength={160}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </label>
              <div className="opm-two">
                <label className="opm-field">
                  <span className="opm-lbl">Owner</span>
                  <select className="opm-input" value={form.ownerUserId} onChange={(e) => setForm({ ...form, ownerUserId: e.target.value })}>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </label>
                <label className="opm-field">
                  <span className="opm-lbl">Team</span>
                  <select className="opm-input" value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
                    <option value="">No team</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="opm-two">
                <label className="opm-field">
                  <span className="opm-lbl">Start date</span>
                  <DateInput className="opm-input" placeholder="" value={form.startDate}
                    onChange={(iso) => setForm({ ...form, startDate: iso })} />
                </label>
                <label className="opm-field">
                  <span className="opm-lbl">Due date</span>
                  <DateInput className="opm-input" placeholder="" value={form.dueDate}
                    onChange={(iso) => setForm({ ...form, dueDate: iso })} />
                </label>
              </div>
              <fieldset className="opm-field opm-colors">
                <legend className="opm-lbl">Color</legend>
                <div className="opm-swatches">
                  {PROJECT_COLORS.map((c) => (
                    <button key={c.id} type="button" aria-label={c.label} aria-pressed={form.color === c.id}
                      className={`opm-swatch${form.color === c.id ? ' active' : ''}`}
                      style={{ '--chip-color': c.hex } as CSSProperties}
                      onClick={() => setForm({ ...form, color: c.id })} />
                  ))}
                </div>
              </fieldset>
              {isCreating && (
                <ProjectTaskDraftList
                  taskDrafts={taskDrafts}
                  people={people}
                  defaultAssigneeUserId={form.ownerUserId}
                  maxTaskDrafts={MAX_TASKS_WITH_NEW_PROJECT}
                  onTaskDraftsChange={setTaskDrafts}
                />
              )}
              <div className="opm-actions">
                <button type="button" className="opm-btn ghost" onClick={handleCancelForm}>Cancel</button>
                <button type="submit" className="opm-btn primary" disabled={!form.title.trim() || saving}>
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

          {!isCreating && sorted.length === 0 && <p className="opm-empty">{emptyListMessage}</p>}
          {!isCreating && sorted.length > 0 && (
            <ul className="opm-list">
              {sorted.map((p) => (
                <li key={p.id} className={`opm-item${p.status !== 'active' ? ' muted' : ''}`}>
                  <span className="opm-dot" style={{ '--chip-color': projectHex(p) } as CSSProperties} />
                  <div className="opm-item-text">
                    <p className="opm-item-name">{p.title}</p>
                    {p.description && <p className="opm-item-goal">{p.description}</p>}
                    <p className="opm-item-meta">
                      {p.ownerUserName || '—'}
                      {p.teamId ? ` · ${teams.find((t) => t.id === p.teamId)?.name || 'Team'}` : ''}
                      {p.startDate ? ` · Starts ${formatDate(p.startDate)}` : ''}
                      {p.dueDate ? ` · Due ${formatDate(p.dueDate)}` : ''}
                      {` · ${p.doneCount || 0}/${p.taskCount || 0} done`}
                    </p>
                  </div>
                  <div className="opm-item-actions">
                    {canEdit ? (
                      <select className="opm-status" value={p.status} aria-label={`Status of ${p.title}`}
                        onChange={(e) => onStatus(p, e.target.value as TaskProjectStatus)}>
                        {(Object.keys(STATUS_LABEL) as TaskProjectStatus[]).map((s) => (
                          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="opm-status-text">{STATUS_LABEL[p.status]}</span>
                    )}
                    <button type="button" className="opm-icon" onClick={() => onOpenProjectTasks(p)}
                      aria-label={`Tasks of ${p.title}`} title="Tasks">
                      <ListChecks size={14} />
                    </button>
                    {canEdit && (
                      <button type="button" className="opm-icon" onClick={() => startEdit(p)} aria-label={`Edit ${p.title}`}>
                        <Pencil size={14} />
                      </button>
                    )}
                    {canDelete && (
                      <button type="button" className="danger opm-icon" onClick={() => onDelete(p)} aria-label={`Delete ${p.title}`}>
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
