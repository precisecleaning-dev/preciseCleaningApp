// Proyectos del Task list: crear, editar, cambiar estado y borrar (solo los
// que no tienen tareas; los demás se archivan).
import { useState, type CSSProperties, type FormEvent } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import type { OpsProject, OpsProjectStatus, Team } from '../../../types/index';
import DateInput from '../../../shared/components/DateInput';
import { formatDate } from '../../../utils/dateFormat';
import { PROJECT_COLORS, colorFor, projectHex } from '../opsOptions';
import type { ProjectInput } from '../services/opsTasksService';
import type { PersonOption } from '../opsPermissions';
import './OpsModals.css';

interface ProjectsModalProps {
  projects: OpsProject[];
  people: PersonOption[];
  /** Equipos de Settings (settings_teams) para `teamId`. */
  teams: Team[];
  defaultOwnerId: string;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSave: (input: ProjectInput, project: OpsProject | null) => Promise<boolean>;
  onStatus: (project: OpsProject, status: OpsProjectStatus) => void;
  onDelete: (project: OpsProject) => void;
}

const STATUS_ORDER: Record<OpsProjectStatus, number> = { active: 0, done: 1, archived: 2 };
const STATUS_LABEL: Record<OpsProjectStatus, string> = { active: 'Active', done: 'Done', archived: 'Archived' };

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
const shownColor = (p: OpsProject): string | null =>
  p.color || PROJECT_COLORS.find((c) => c.hex === colorFor(p.id))?.id || null;

export default function ProjectsModal({
  projects, people, teams, defaultOwnerId, canEdit, canDelete, onClose, onSave, onStatus, onDelete,
}: ProjectsModalProps) {
  // Un proyecto nuevo toma el siguiente color de la lista (se puede cambiar).
  const nextColor = PROJECT_COLORS[projects.length % PROJECT_COLORS.length].id;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectForm>(() => emptyForm(defaultOwnerId, nextColor));
  const [saving, setSaving] = useState(false);

  const sorted = [...projects].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.title.localeCompare(b.title),
  );

  const startEdit = (p: OpsProject) => {
    setEditingId(p.id);
    setForm({
      title: p.title,
      description: p.description,
      ownerUserId: p.ownerUserId,
      teamId: p.teamId || '',
      startDate: p.startDate || '',
      dueDate: p.dueDate,
      color: shownColor(p),
    });
  };
  const reset = () => {
    setEditingId(null);
    setForm(emptyForm(defaultOwnerId, nextColor));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || saving) return;
    const owner = people.find((p) => p.id === form.ownerUserId);
    const current = projects.find((p) => p.id === editingId);
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
    }, current || null);
    setSaving(false);
    if (ok) reset();
  };

  return (
    <div className="modal-overlay-centered" onClick={onClose}>
      <div className="modal-50 opm" role="dialog" aria-modal="true" aria-label="Projects" onClick={(e) => e.stopPropagation()}>
        <header className="opm-head">
          <h2 className="opm-title">Projects</h2>
          <button type="button" className="opm-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="opm-body">
          {canEdit && (
            <form className="opm-form" onSubmit={submit}>
              <p className="opm-form-title">{editingId ? 'Edit project' : 'New project'}</p>
              <label className="opm-field">
                <span className="opm-lbl">Name</span>
                <input className="opm-input" value={form.title} maxLength={80}
                  onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Hire new cleaners" />
              </label>
              <label className="opm-field">
                <span className="opm-lbl">Goal</span>
                <input className="opm-input" value={form.description} maxLength={160}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Applicants → interviews → hires each week" />
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
                  <DateInput className="opm-input" value={form.startDate} onChange={(iso) => setForm({ ...form, startDate: iso })} />
                </label>
                <label className="opm-field">
                  <span className="opm-lbl">Due date</span>
                  <DateInput className="opm-input" value={form.dueDate} onChange={(iso) => setForm({ ...form, dueDate: iso })} />
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
              <div className="opm-actions">
                {editingId && <button type="button" className="opm-btn ghost" onClick={reset}>Cancel</button>}
                <button type="submit" className="opm-btn primary" disabled={!form.title.trim() || saving}>
                  {editingId ? 'Save changes' : 'Add project'}
                </button>
              </div>
            </form>
          )}

          {sorted.length === 0 ? (
            <p className="opm-empty">No projects yet.</p>
          ) : (
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
                        onChange={(e) => onStatus(p, e.target.value as OpsProjectStatus)}>
                        {(Object.keys(STATUS_LABEL) as OpsProjectStatus[]).map((s) => (
                          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="opm-status-text">{STATUS_LABEL[p.status]}</span>
                    )}
                    {canEdit && (
                      <button type="button" className="opm-icon" onClick={() => startEdit(p)} aria-label={`Edit ${p.title}`}>
                        <Pencil size={14} />
                      </button>
                    )}
                    {canDelete && (p.taskCount || 0) === 0 && (
                      <button type="button" className="opm-icon danger" onClick={() => onDelete(p)} aria-label={`Delete ${p.title}`}>
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
}
