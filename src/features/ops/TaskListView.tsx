// src/features/ops/TaskListView.tsx
// ============================================================================
// ⭐ TASK LIST DE GERENTES (diseño "Sandy's tasks", 10/2026).
//
// Encabezado con la persona y sus tareas abiertas · pestañas "Assigned to"
// (las que le asignaron) y "Assigned by" (las que asignó a otros) con el botón
// "Add Task", que abre el panel lateral para crear una tarea · tareas abiertas
// por vencimiento (Overdue, Today, This week, Later, No date) · panel lateral
// de la tarea (horario, fecha, prioridad, personas, proyecto, archivos y
// comentarios). Una tarea puede estar asignada a varias personas.
//
// Con Scope "All" (Roles → Task List) el selector del encabezado cambia de
// persona (o "Everyone"); con "Own" solo se ven las tareas propias y las que
// esperan su OK. Datos en user_tasks y task_projects.
// (El top 3 de proyectos se quitó de esta vista el 10/2026; user_priorities y
// su service siguen en el código, sin pantalla que los use.)
// Al marcar hecha una tarea que se repite, sale la siguiente. En "Waiting for
// your OK" la fila no tiene casilla: quien da el visto bueno solo la revisa.
// ============================================================================
import { useMemo, useState } from 'react';
import { FolderKanban, Loader2, Plus } from 'lucide-react';
import type { Role, SystemUser, TaskProject, UserTask } from '../../types/index';
import MenuButton from '../../shared/components/MenuButton';
import { useLiveCollection, useLiveData } from '../../shared/data/liveCollections';
import { todayIso } from '../../utils/dateFormat';
import NewTaskPanel from './components/NewTaskPanel';
import OpsAvatar from './components/OpsAvatar';
import ProjectsModal from './components/ProjectsModal';
import TaskPanel from './components/TaskPanel';
import TaskSections from './components/TaskSections';
import { ALL_USERS, useApprovalQueue, useCreatedTasks, useLiveTask, useOpenTasks } from './hooks/useOpsData';
import { useTaskActions } from './hooks/useTaskActions';
import {
  assignablePeople, canReassignTask, isAssignee, isOnlyAssignee, taskListRights, toTaskAssignee, userName,
} from './opsPermissions';
import { getFirstName, namesSummary, projectHex } from './opsOptions';
import TaskRow from './components/TaskRow';
import UndoToast from './components/UndoToast';
import './TaskListView.css';

interface TaskListViewProps {
  onOpenMenu: () => void;
  currentUser: SystemUser | null;
  activeRole: Role | null;
  isSuperAdmin: boolean;
}

/** Pestaña de la lista: las que le asignaron o las que asignó a otros. */
type ListTab = 'assignedTo' | 'assignedBy';

export default function TaskListView({ onOpenMenu, currentUser, activeRole, isSuperAdmin }: TaskListViewProps) {
  const users = useLiveData('users');
  const roles = useLiveData('roles');
  const priorityCatalog = useLiveData('priorities');
  const teams = useLiveData('teams');
  const { data: projects } = useLiveCollection('taskProjects');

  const currentUserId = currentUser?.id ?? '';
  const currentUserName = userName(currentUser) || 'Me';
  const taskListAccess = taskListRights(activeRole, isSuperAdmin);

  const [selectedPersonId, setSelectedPersonId] = useState(currentUserId);
  // Scope "Own": siempre las propias, sin selector de persona.
  const viewedUserId = taskListAccess.seesAll ? selectedPersonId : currentUserId;
  // "Ver como otro usuario" cambia quién soy: la vista vuelve a "mis tareas".
  const [previousCurrentUserId, setPreviousCurrentUserId] = useState(currentUserId);
  if (currentUserId !== previousCurrentUserId) {
    setPreviousCurrentUserId(currentUserId);
    setSelectedPersonId(currentUserId);
  }
  const [selectedTab, setSelectedTab] = useState<ListTab>('assignedTo');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isProjectsModalOpen, setIsProjectsModalOpen] = useState(false);
  const [isNewTaskPanelOpen, setIsNewTaskPanelOpen] = useState(false);

  // Personas a las que se les asignan tareas (las que tienen la vista).
  const assignableUsers = useMemo(
    () => assignablePeople(users, roles, currentUserId, currentUserName),
    [users, roles, currentUserId, currentUserName],
  );

  // Quienes pueden dar el visto bueno: los mismos, menos uno mismo. Por
  // defecto se propone al dueño (rol con Owner o Administrator).
  const approvers = useMemo(
    () => assignableUsers.filter((person) => person.id !== currentUserId),
    [assignableUsers, currentUserId],
  );
  const defaultApproverUserId = useMemo(() => {
    const getUserRole = (personId: string) =>
      roles.find((role) => role.id === users.find((user) => user.id === personId)?.roleId);
    const defaultApprover = approvers.find((person) =>
      getUserRole(person.id)?.permissions?.some((permission) => permission.module === 'Owner' && permission.canView))
      ?? approvers.find((person) => getUserRole(person.id)?.name === 'Administrator');
    return defaultApprover?.id ?? approvers[0]?.id ?? '';
  }, [approvers, users, roles]);

  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project] as const)), [projects]);
  const knownProjectIds = useMemo(() => new Set(projectsById.keys()), [projectsById]);
  const activeProjects = useMemo(
    () => projects
      .filter((project) => project.status === 'active')
      .sort((firstProject, secondProject) => firstProject.title.localeCompare(secondProject.title)),
    [projects],
  );

  const actions = useTaskActions({ id: currentUserId, name: currentUserName }, knownProjectIds);
  const isEveryoneView = viewedUserId === ALL_USERS;
  const assignedToResult = useOpenTasks(viewedUserId || null);
  // Las que asignó a otros (las que se asignó solo a sí mismo ya salen en
  // "Assigned to"; las que comparte con otras personas salen en las dos).
  const createdTasksResult = useCreatedTasks(!isEveryoneView && viewedUserId ? viewedUserId : null);
  const assignedByTasks = useMemo(
    () => createdTasksResult.tasks.filter((task) => task.assignees.some((assignee) => assignee.userId !== viewedUserId)),
    [createdTasksResult.tasks, viewedUserId],
  );
  // Con "Everyone" no hay pestañas: se ven todas las abiertas.
  const visibleTab: ListTab = isEveryoneView ? 'assignedTo' : selectedTab;
  const { tasks, loaded, error: listError } = visibleTab === 'assignedBy'
    ? { tasks: assignedByTasks, loaded: createdTasksResult.loaded, error: createdTasksResult.error }
    : assignedToResult;
  // Lo que otros esperan que YO apruebe (se muestra arriba en "mis tareas").
  const approvalQueue = useApprovalQueue(viewedUserId === currentUserId ? currentUserId : null);
  const approvalTasks = approvalQueue.tasks.filter((task) => !isAssignee(task, currentUserId));
  // Un listener que falla no se muestra como "no hay tareas".
  const loadError = listError ?? approvalQueue.error;

  const liveTask = useLiveTask(selectedTaskId);
  const openedTask = liveTask.task;
  // La tarea abierta que no se pudo leer o que se borró (p. ej. otra persona la
  // borró con el panel abierto) avisa en vez de dejar el panel sin abrir.
  const openedTaskStatus = (() => {
    if (!selectedTaskId) return 'closed';
    if (liveTask.error) return 'error';
    if (!liveTask.loaded) return 'loading';
    if (openedTask) return 'ready';
    // Borrada desde este panel: el listener la ve borrada antes de que termine el borrado.
    return actions.busyId === selectedTaskId ? 'closing' : 'deleted';
  })();

  const todayIsoDate = todayIso();
  const viewedUser = users.find((user) => user.id === viewedUserId)
    ?? (viewedUserId === currentUserId ? currentUser : null);
  const viewedUserName = isEveryoneView ? 'Everyone' : userName(viewedUser) || currentUserName;
  const viewedRoleName = isEveryoneView
    ? 'All managers'
    : roles.find((role) => role.id === viewedUser?.roleId)?.name ?? '';
  // La tarea nueva va para la persona que se está mirando (con "Everyone", para uno mismo).
  const newTaskUser = assignableUsers.find((person) => person.id === (isEveryoneView ? currentUserId : viewedUserId));
  const newTaskAssignee = newTaskUser
    ? toTaskAssignee(newTaskUser)
    : { userId: currentUserId, userName: currentUserName };

  /** "Me, Sandy +1": las personas de la tarea, con su nombre en vivo si existe. */
  const getAssigneesLabel = (task: UserTask) => {
    const names = task.assignees.map((assignee) => {
      if (assignee.userId === currentUserId) return 'Me';
      const user = users.find((systemUser) => systemUser.id === assignee.userId);
      return getFirstName(user ? userName(user) : assignee.userName);
    });
    return namesSummary(names);
  };
  // "From X": quién la asignó, si no se la asignó solo a sí mismo ni es la que se mira.
  const getAssignedByName = (task: UserTask): string | null => {
    if (!task.createdByUserId || isOnlyAssignee(task, task.createdByUserId) || task.createdByUserId === viewedUserId) {
      return null;
    }
    if (task.createdByUserId === currentUserId) return 'Me';
    const user = users.find((systemUser) => systemUser.id === task.createdByUserId);
    return getFirstName(user ? userName(user) : task.createdByUserName) || null;
  };
  const getProjectTitle = (task: UserTask) =>
    (task.projectId ? projectsById.get(task.projectId)?.title ?? task.projectTitle : null);
  const getProjectColor = (task: UserTask) =>
    projectHex(task.projectId ? projectsById.get(task.projectId) : null, task.projectId ?? '');
  const canEditTask = (task: UserTask) =>
    taskListAccess.canEdit || isAssignee(task, currentUserId) || task.createdByUserId === currentUserId;

  const handleViewedUserChange = (personId: string) => {
    setSelectedPersonId(personId);
    setSelectedTaskId(null);
  };

  const handleToggleDone = (task: UserTask) => {
    if (task.status === 'done') actions.reopen(task);
    else actions.complete(task);
  };

  const handleDeleteTask = async (task: UserTask) => {
    if (!window.confirm(`Delete "${task.title}"? Its comments and files are deleted too.`)) return;
    if (await actions.remove(task)) setSelectedTaskId(null);
  };

  const handleDeleteProject = (project: TaskProject) => {
    if (window.confirm(`Delete the project "${project.title}"?`)) actions.removeProject(project);
  };

  const listStatus = (() => {
    if (loadError) return 'error';
    if (!loaded) return 'loading';
    return tasks.length === 0 ? 'empty' : 'ready';
  })();

  const emptyListMessage = (() => {
    if (visibleTab === 'assignedTo') return 'No open tasks. Use "Add Task" to create one.';
    if (viewedUserId === currentUserId) return "You haven't assigned open tasks to anyone.";
    return `${getFirstName(viewedUserName)} hasn't assigned open tasks to anyone.`;
  })();

  const openedTaskMessage = openedTaskStatus === 'error'
    ? 'Could not open the task. Check your connection and try again.'
    : 'This task was deleted.';

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
            <OpsAvatar id={isEveryoneView ? 'everyone' : viewedUserId} name={viewedUserName} size="lg" />
            <div>
              <h1 className="otl-title">
                {isEveryoneView ? "Everyone's tasks" : `${getFirstName(viewedUserName)}'s tasks`}
              </h1>
              {viewedRoleName && <p className="otl-sub">{viewedRoleName}</p>}
            </div>
          </div>
        </div>
        <div className="otl-head-actions">
          <span className="otl-open">{loaded ? tasks.length : '…'} open</span>
          {taskListAccess.seesAll && (
            <select className="otl-select" value={viewedUserId}
              onChange={(event) => handleViewedUserChange(event.target.value)} aria-label="Whose tasks">
              {assignableUsers.map((person) => (
                <option key={person.id} value={person.id}>{person.id === currentUserId ? 'My tasks' : person.name}</option>
              ))}
              <option value={ALL_USERS}>Everyone</option>
            </select>
          )}
          <button type="button" className="otl-btn" onClick={() => setIsProjectsModalOpen(true)}>
            <FolderKanban size={16} /> Projects
          </button>
        </div>
      </header>

      <div className="otl-stack">
        <div className="otl-toolbar">
          {!isEveryoneView && (
            <div className="otl-tabs" role="tablist" aria-label="Tasks">
              <button type="button" role="tab" aria-selected={visibleTab === 'assignedTo'}
                className={`otl-tab${visibleTab === 'assignedTo' ? ' active' : ''}`}
                onClick={() => setSelectedTab('assignedTo')}>
                {viewedUserId === currentUserId ? 'Assigned to me' : `Assigned to ${getFirstName(viewedUserName)}`}
                <span className="otl-tab-count">{assignedToResult.loaded ? assignedToResult.tasks.length : '…'}</span>
              </button>
              <button type="button" role="tab" aria-selected={visibleTab === 'assignedBy'}
                className={`otl-tab${visibleTab === 'assignedBy' ? ' active' : ''}`}
                onClick={() => setSelectedTab('assignedBy')}>
                {viewedUserId === currentUserId ? 'Assigned by me' : `Assigned by ${getFirstName(viewedUserName)}`}
                <span className="otl-tab-count">{createdTasksResult.loaded ? assignedByTasks.length : '…'}</span>
              </button>
            </div>
          )}
          <button type="button" className="otl-add-btn" onClick={() => setIsNewTaskPanelOpen(true)}>
            <Plus size={16} /> Add Task
          </button>
        </div>

        {(openedTaskStatus === 'error' || openedTaskStatus === 'deleted') && (
          <p className="error otl-empty" role="alert">
            {openedTaskMessage}
            <button type="button" className="otl-btn" onClick={() => setSelectedTaskId(null)}>OK</button>
          </p>
        )}

        {visibleTab === 'assignedTo' && approvalTasks.length > 0 && (
          <section className="otl-section" aria-label="Waiting for your OK">
            <h2 className="approval otl-section-title">Waiting for your OK · {approvalTasks.length}</h2>
            <ul className="otl-rows">
              {approvalTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  todayIsoDate={todayIsoDate}
                  assigneesLabel={getAssigneesLabel(task)}
                  assignedByName={getAssignedByName(task)}
                  projectTitle={getProjectTitle(task)}
                  projectColor={getProjectColor(task)}
                  isSelected={task.id === selectedTaskId}
                  isBusy={actions.busyId === task.id}
                  onOpen={(rowTask) => setSelectedTaskId(rowTask.id)}
                />
              ))}
            </ul>
          </section>
        )}

        {listStatus === 'error' && (
          <p className="error otl-empty" role="alert">Could not load the tasks. Check your connection and try again.</p>
        )}
        {listStatus === 'loading' && <p className="otl-empty"><Loader2 size={16} className="otl-spin" /> Loading tasks…</p>}
        {listStatus === 'empty' && <p className="otl-empty">{emptyListMessage}</p>}
        {listStatus === 'ready' && (
          <TaskSections
            tasks={tasks}
            today={todayIsoDate}
            selectedId={selectedTaskId}
            busyId={actions.busyId}
            projectName={getProjectTitle}
            projectColor={getProjectColor}
            personLabel={getAssigneesLabel}
            assignedByLabel={getAssignedByName}
            onOpen={(task) => setSelectedTaskId(task.id)}
            onComplete={actions.complete}
          />
        )}
      </div>

      {openedTaskStatus === 'ready' && openedTask && (
        <TaskPanel
          task={openedTask}
          comments={openedTask.comments ?? []}
          assignableUsers={assignableUsers}
          projects={activeProjects}
          priorities={priorityCatalog}
          currentUser={{ id: currentUserId, name: currentUserName }}
          canEdit={canEditTask(openedTask)}
          canReassign={canEditTask(openedTask) && canReassignTask(openedTask, currentUserId, taskListAccess)}
          canDelete={taskListAccess.canDelete}
          isBusy={actions.busyId === openedTask.id}
          isUploading={actions.uploading}
          onClose={() => setSelectedTaskId(null)}
          onPatch={(patch) => actions.patch(openedTask, patch)}
          onToggleDone={() => handleToggleDone(openedTask)}
          onDelete={() => handleDeleteTask(openedTask)}
          onAddComment={(text) => actions.comment(openedTask.id, text)}
          onAttachFiles={(files) => actions.attach(openedTask.id, files)}
          onRemoveAttachment={(attachment) => actions.removeFile(openedTask.id, attachment)}
          approvers={approvers}
          defaultApproverUserId={defaultApproverUserId}
          onSendApproval={(approver) => actions.sendForApproval(openedTask, { id: approver.id, name: approver.name })}
          onDecideApproval={(decision, note) => actions.decide(openedTask, decision, note)}
          onSetApproval={(approval) => actions.setApproval(openedTask, approval)}
        />
      )}

      {isNewTaskPanelOpen && (
        <NewTaskPanel
          key={newTaskAssignee.userId}
          people={assignableUsers}
          projects={activeProjects}
          priorities={priorityCatalog}
          me={{ id: currentUserId, name: currentUserName }}
          defaultAssignee={newTaskAssignee}
          approvers={approvers}
          onClose={() => setIsNewTaskPanelOpen(false)}
          onCreate={actions.add}
        />
      )}

      {actions.undo && <UndoToast title={actions.undo.task.title} onUndo={actions.undoComplete} />}

      {isProjectsModalOpen && (
        <ProjectsModal
          projects={projects}
          people={assignableUsers}
          teams={teams}
          defaultOwnerId={currentUserId}
          canEdit={taskListAccess.canEdit}
          canDelete={taskListAccess.canDelete}
          onClose={() => setIsProjectsModalOpen(false)}
          onSave={actions.saveProject}
          onStatus={actions.setProjectStatus}
          onDelete={handleDeleteProject}
        />
      )}
    </div>
  );
}
