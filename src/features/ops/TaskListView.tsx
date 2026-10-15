// src/features/ops/TaskListView.tsx
// ============================================================================
// ⭐ TASK LIST DE GERENTES (diseño "Sandy's tasks", 10/2026).
//
// Encabezado con la persona y sus tareas abiertas · su top 3 de proyectos ·
// fila para agregar tareas · pestañas "Assigned to" (las que le asignaron) y
// "Assigned by" (las que asignó a otros) · tareas abiertas por vencimiento
// (Overdue, Today, This week, Later, No date) · panel lateral de la tarea
// (horario, fecha, prioridad, persona, proyecto, archivos y comentarios).
//
// Con Scope "All" (Roles → Task List) el selector del encabezado cambia de
// persona (o "Everyone"); con "Own" solo se ven las tareas propias y las que
// esperan su OK. Datos en user_tasks, task_projects y user_priorities.
// Al marcar hecha una tarea que se repite, sale la siguiente.
// ============================================================================
import { useMemo, useState } from 'react';
import { FolderKanban, Loader2 } from 'lucide-react';
import type { OpsTask, Role, SystemUser } from '../../types/index';
import MenuButton from '../../shared/components/MenuButton';
import { useLiveCollection, useLiveData } from '../../shared/data/liveCollections';
import { todayIso } from '../../utils/dateFormat';
import OpsAvatar from './components/OpsAvatar';
import PrioritiesCard from './components/PrioritiesCard';
import PrioritiesModal from './components/PrioritiesModal';
import ProjectsModal from './components/ProjectsModal';
import QuickAddTask, { type QuickAddValues } from './components/QuickAddTask';
import TaskPanel from './components/TaskPanel';
import TaskSections from './components/TaskSections';
import { EVERYONE, useApprovalQueue, useCreatedTasks, useOpenTasks, useOpsTask, usePriorities } from './hooks/useOpsData';
import { useTaskActions } from './hooks/useTaskActions';
import { assignablePeople, canReassignTask, taskListRights, userName } from './opsPermissions';
import { projectHex } from './opsOptions';
import { draftApproval } from './services/opsTasksService';
import TaskRow from './components/TaskRow';
import UndoToast from './components/UndoToast';
import './TaskListView.css';

interface TaskListViewProps {
  onOpenMenu: () => void;
  currentUser: SystemUser | null;
  activeRole: Role | null;
  isSuperAdmin: boolean;
}

const firstName = (name: string) => name.split(' ')[0] || name;

/** Pestaña de la lista: las que le asignaron ('to') o las que asignó ('by'). */
type ListTab = 'to' | 'by';

export default function TaskListView({ onOpenMenu, currentUser, activeRole, isSuperAdmin }: TaskListViewProps) {
  const users = useLiveData('users');
  const roles = useLiveData('roles');
  const priorityCatalog = useLiveData('priorities');
  const teams = useLiveData('teams');
  const { data: projects } = useLiveCollection('taskProjects');

  const meId = currentUser?.id || '';
  const meName = userName(currentUser) || 'Me';
  const rights = taskListRights(activeRole, isSuperAdmin);

  const [chosen, setViewing] = useState(meId);
  // Scope "Own": siempre las propias, sin selector de persona.
  const viewing = rights.seesAll ? chosen : meId;
  // "Ver como otro usuario" cambia quién soy: la vista vuelve a "mis tareas".
  const [lastMeId, setLastMeId] = useState(meId);
  if (meId !== lastMeId) {
    setLastMeId(meId);
    setViewing(meId);
  }
  const [tab, setTab] = useState<ListTab>('to');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [prioritiesOpen, setPrioritiesOpen] = useState(false);

  // Personas a las que se les asignan tareas (las que tienen la vista).
  const people = useMemo(() => assignablePeople(users, roles, meId, meName), [users, roles, meId, meName]);

  // Quienes pueden dar el visto bueno: los mismos, menos uno mismo. Por
  // defecto se propone al dueño (rol con Owner o Administrator).
  const approvers = useMemo(() => people.filter((p) => p.id !== meId), [people, meId]);
  const defaultApproverId = useMemo(() => {
    const roleOf = (personId: string) => roles.find((r) => r.id === users.find((u) => u.id === personId)?.roleId);
    const owner = approvers.find((p) => roleOf(p.id)?.permissions?.some((x) => x.module === 'Owner' && x.canView))
      || approvers.find((p) => roleOf(p.id)?.name === 'Administrator');
    return owner?.id || approvers[0]?.id || '';
  }, [approvers, users, roles]);

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p] as const)), [projects]);
  const known = useMemo(() => new Set(projectsById.keys()), [projectsById]);
  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === 'active').sort((a, b) => a.title.localeCompare(b.title)),
    [projects],
  );

  const actions = useTaskActions({ id: meId, name: meName }, known);
  const everyone = viewing === EVERYONE;
  const assignedTo = useOpenTasks(viewing || null);
  // Las que asignó a otros (las que se asignó a sí mismo ya salen en "to").
  const created = useCreatedTasks(!everyone && viewing ? viewing : null);
  const assignedBy = useMemo(
    () => created.tasks.filter((t) => t.assigneeUserId !== viewing),
    [created.tasks, viewing],
  );
  // Con "Everyone" no hay pestañas: se ven todas las abiertas.
  const listTab: ListTab = everyone ? 'to' : tab;
  const { tasks, loaded } = listTab === 'by' ? { tasks: assignedBy, loaded: created.loaded } : assignedTo;
  const priorityIds = usePriorities(viewing && viewing !== EVERYONE ? viewing : null);
  const panelTask = useOpsTask(selectedId);
  // Lo que otros esperan que YO apruebe (se muestra arriba en "mis tareas").
  const approvalQueue = useApprovalQueue(viewing === meId ? meId : null)
    .filter((t) => t.assigneeUserId !== meId);

  const today = todayIso();
  const viewedUser = users.find((u) => u.id === viewing) || (viewing === meId ? currentUser : null);
  const viewedName = everyone ? 'Everyone' : userName(viewedUser) || meName;
  const viewedRole = everyone ? 'All managers' : roles.find((r) => r.id === viewedUser?.roleId)?.name || '';
  const priorityProjects = priorityIds.map((id) => projectsById.get(id)).filter((p) => !!p);
  const canChangePriorities = !everyone && (viewing === meId || rights.canEdit);

  const personLabel = (t: OpsTask) => {
    if (t.assigneeUserId === meId) return 'Me';
    const u = users.find((x) => x.id === t.assigneeUserId);
    return firstName(u ? userName(u) : t.assigneeUserName);
  };
  // "From X": quién la asignó, si no fue la misma persona ni la que se mira.
  const assignedByLabel = (t: OpsTask): string | null => {
    if (!t.createdByUserId || t.createdByUserId === t.assigneeUserId || t.createdByUserId === viewing) return null;
    if (t.createdByUserId === meId) return 'Me';
    const u = users.find((x) => x.id === t.createdByUserId);
    return firstName(u ? userName(u) : t.createdByUserName) || null;
  };
  const projectName = (t: OpsTask) => (t.projectId ? projectsById.get(t.projectId)?.title || t.projectTitle : null);
  const projectColor = (t: OpsTask) => projectHex(t.projectId ? projectsById.get(t.projectId) : null, t.projectId || '');
  const canEditTask = (t: OpsTask) => rights.canEdit || t.assigneeUserId === meId || t.createdByUserId === meId;

  const addTask = (v: QuickAddValues) => {
    const person = people.find((p) => p.id === v.assigneeUserId);
    const project = v.projectId ? projectsById.get(v.projectId) : undefined;
    return actions.add({
      title: v.title,
      assigneeUserId: v.assigneeUserId,
      assigneeUserName: person?.name || '',
      dueDate: v.dueDate,
      dueTime: '',
      durationMinutes: v.durationMinutes,
      priorityId: null,
      projectId: project?.id || null,
      projectTitle: project?.title || null,
      repeat: null,
      approval: v.needsApproval && defaultApproverId
        ? draftApproval(defaultApproverId, approvers.find((p) => p.id === defaultApproverId)?.name || '')
        : null,
    });
  };

  if (!currentUser) {
    return (
      <div className="fade-in otl">
        <p className="otl-empty">Your user profile is not set up yet.</p>
      </div>
    );
  }

  return (
    <div className="fade-in otl">
      <header className="main-header otl-header">
        <div className="view-header-title-group">
          <MenuButton onClick={onOpenMenu} />
          <div className="otl-who">
            <OpsAvatar id={everyone ? 'everyone' : viewing} name={viewedName} size="lg" />
            <div>
              <h1 className="otl-title">{everyone ? "Everyone's tasks" : `${firstName(viewedName)}'s tasks`}</h1>
              {viewedRole && <p className="otl-sub">{viewedRole}</p>}
            </div>
          </div>
        </div>
        <div className="otl-head-actions">
          <span className="otl-open">{loaded ? tasks.length : '…'} open</span>
          {rights.seesAll && (
            <select className="otl-select" value={viewing} onChange={(e) => { setViewing(e.target.value); setSelectedId(null); }}
              aria-label="Whose tasks">
              {people.map((p) => <option key={p.id} value={p.id}>{p.id === meId ? 'My tasks' : p.name}</option>)}
              <option value={EVERYONE}>Everyone</option>
            </select>
          )}
          <button type="button" className="otl-btn" onClick={() => setProjectsOpen(true)}>
            <FolderKanban size={16} /> Projects
          </button>
        </div>
      </header>

      <div className="otl-stack">
        {!everyone && (
          <PrioritiesCard
            title={viewing === meId ? 'My top 3 priorities' : `${firstName(viewedName)}'s top 3 priorities`}
            projects={priorityProjects}
            canChange={canChangePriorities}
            onEdit={() => setPrioritiesOpen(true)}
          />
        )}

        <QuickAddTask
          people={people}
          defaultAssigneeId={everyone ? meId : viewing}
          projects={activeProjects}
          onAdd={addTask}
        />

        {!everyone && (
          <div className="otl-tabs" role="tablist" aria-label="Tasks">
            <button type="button" role="tab" aria-selected={listTab === 'to'}
              className={`otl-tab${listTab === 'to' ? ' active' : ''}`} onClick={() => setTab('to')}>
              {viewing === meId ? 'Assigned to me' : `Assigned to ${firstName(viewedName)}`}
              <span className="otl-tab-count">{assignedTo.loaded ? assignedTo.tasks.length : '…'}</span>
            </button>
            <button type="button" role="tab" aria-selected={listTab === 'by'}
              className={`otl-tab${listTab === 'by' ? ' active' : ''}`} onClick={() => setTab('by')}>
              {viewing === meId ? 'Assigned by me' : `Assigned by ${firstName(viewedName)}`}
              <span className="otl-tab-count">{created.loaded ? assignedBy.length : '…'}</span>
            </button>
          </div>
        )}

        {listTab === 'to' && approvalQueue.length > 0 && (
          <section className="otl-section" aria-label="Waiting for your OK">
            <h2 className="otl-section-title approval">Waiting for your OK · {approvalQueue.length}</h2>
            <ul className="otl-rows">
              {approvalQueue.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  today={today}
                  assigneeLabel={personLabel(task)}
                  assignedByLabel={assignedByLabel(task)}
                  projectName={projectName(task)}
                  projectColor={projectColor(task)}
                  selected={task.id === selectedId}
                  busy={actions.busyId === task.id}
                  onOpen={(t) => setSelectedId(t.id)}
                  onComplete={actions.complete}
                />
              ))}
            </ul>
          </section>
        )}

        {!loaded ? (
          <p className="otl-empty"><Loader2 size={16} className="otl-spin" /> Loading tasks…</p>
        ) : tasks.length === 0 ? (
          <p className="otl-empty">
            {listTab === 'to'
              ? 'No open tasks. Add one above.'
              : viewing === meId
                ? "You haven't assigned open tasks to anyone."
                : `${firstName(viewedName)} hasn't assigned open tasks to anyone.`}
          </p>
        ) : (
          <TaskSections
            tasks={tasks}
            today={today}
            selectedId={selectedId}
            busyId={actions.busyId}
            projectName={projectName}
            projectColor={projectColor}
            personLabel={personLabel}
            assignedByLabel={assignedByLabel}
            onOpen={(t) => setSelectedId(t.id)}
            onComplete={actions.complete}
          />
        )}
      </div>

      {selectedId && panelTask && (
        <TaskPanel
          task={panelTask}
          comments={panelTask.comments || []}
          people={people}
          projects={activeProjects}
          priorities={priorityCatalog}
          me={{ id: meId, name: meName }}
          canEdit={canEditTask(panelTask)}
          canReassign={canEditTask(panelTask) && canReassignTask(panelTask, meId, rights)}
          canDelete={rights.canDelete}
          busy={actions.busyId === panelTask.id}
          uploading={actions.uploading}
          onClose={() => setSelectedId(null)}
          onPatch={(patch) => actions.patch(panelTask, patch)}
          onToggleDone={() => (panelTask.status === 'done' ? actions.reopen(panelTask) : actions.complete(panelTask))}
          onDelete={async () => {
            if (!window.confirm(`Delete "${panelTask.title}"? Its comments and files are deleted too.`)) return;
            if (await actions.remove(panelTask)) setSelectedId(null);
          }}
          onAddComment={(text) => actions.comment(panelTask.id, text)}
          onAttach={(files) => actions.attach(panelTask.id, files)}
          onRemoveAttachment={(a) => actions.removeFile(panelTask.id, a)}
          approvers={approvers}
          defaultApproverId={defaultApproverId}
          onSendApproval={(p) => actions.sendForApproval(panelTask, { id: p.id, name: p.name })}
          onDecideApproval={(decision, note) => actions.decide(panelTask, decision, note)}
          onSetApproval={(approval) => actions.setApproval(panelTask, approval)}
        />
      )}

      {actions.undo && <UndoToast title={actions.undo.task.title} onUndo={actions.undoComplete} />}

      {projectsOpen && (
        <ProjectsModal
          projects={projects}
          people={people}
          teams={teams}
          defaultOwnerId={meId}
          canEdit={rights.canEdit}
          canDelete={rights.canDelete}
          onClose={() => setProjectsOpen(false)}
          onSave={actions.saveProject}
          onStatus={actions.setProjectStatus}
          onDelete={(p) => {
            if (window.confirm(`Delete the project "${p.title}"?`)) actions.removeProject(p);
          }}
        />
      )}

      {prioritiesOpen && !everyone && (
        <PrioritiesModal
          title={viewing === meId ? 'My top 3 priorities' : `${firstName(viewedName)}'s top 3 priorities`}
          projects={activeProjects}
          current={priorityIds}
          onClose={() => setPrioritiesOpen(false)}
          onSave={(ids) => actions.savePriorities(viewing, ids)}
        />
      )}
    </div>
  );
}
