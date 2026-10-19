// src/features/ops/TaskListView.tsx
// ============================================================================
// ⭐ TASK LIST DE GERENTES (diseño "Sandy's tasks", 10/2026).
//
// Encabezado con la persona y sus tareas abiertas y vencidas · pestañas
// "Assigned to" (las que le asignaron) y "Assigned by" (las que asignó a otros)
// · botones "+ Add task" (panel lateral para crear) y "+ New project" ·
// pestañas (taskListTabs.ts: Overdue, Daily = hoy y las diarias, Needs
// Approval, This week, Later, No date, ALL y Done) en el orden que eligió quien
// edita Task List (app_settings/task_list_tabs); cada una con TaskSection y
// "Done" con las hechas por páginas (DoneTaskList) · a la derecha "My
// projects" (calendario del mes y una tarjeta por proyecto activo; al tocarla
// se abre la ventana con sus tareas pendientes, ProjectTasksModal; tocar un
// día del calendario filtra la vista a ese día)
// · panel lateral de la tarea (horario y repetición, fecha, prioridad, personas,
// proyecto, archivos y comentarios). Una tarea puede estar asignada a varias personas.
//
// Con Scope "All" (Roles → Task List) el selector del encabezado cambia de
// persona (o "Everyone"); con "Own" solo se ven las tareas propias y las que
// esperan su OK. Datos en user_tasks y task_projects.
// (El top 3 de proyectos se quitó de esta vista el 10/2026; user_priorities y
// su service siguen en el código, sin pantalla que los use.)
// Al marcar hecha una tarea que se repite, sale la siguiente (una diaria
// aparece el día que le toca). En "Needs Approval" las que esperan MI OK no
// tienen casilla: quien da el visto bueno solo la revisa.
// ============================================================================
import { useMemo, useState } from 'react';
import { FolderKanban, Loader2, Plus } from 'lucide-react';
import type { Role, SystemUser, TaskListTabId, TaskProject, UserTask } from '../../types/index';
import MenuButton from '../../shared/components/MenuButton';
import { useLiveCollection, useLiveData } from '../../shared/data/liveCollections';
import { formatDate, todayIso } from '../../utils/dateFormat';
import NewTaskPanel from './components/NewTaskPanel';
import OpsAvatar from './components/OpsAvatar';
import ProjectsModal from './components/ProjectsModal';
import ProjectTasksModal from './components/ProjectTasksModal';
import TaskPanel from './components/TaskPanel';
import TaskSection from './components/TaskSection';
import TaskSectionTabs from './components/TaskSectionTabs';
import ActionButton from './components/ActionButton';
import MyProjectsPanel from './components/MyProjectsPanel';
import {
  ALL_USERS, useApprovalQueue, useCreatedTasks, useDoneTasks, useLiveTask, useOpenTasks, useProjectOpenTasks,
} from './hooks/useOpsData';
import { useTaskActions } from './hooks/useTaskActions';
import { useTaskListTabOrder } from './hooks/useTaskListTabOrder';
import {
  assignablePeople, canReassignTask, isAssignee, isOnlyAssignee, taskListRights, taskProjectRights, toTaskAssignee, userName,
} from './opsPermissions';
import { getFirstName, namesSummary, projectHex } from './opsOptions';
import { isUpcomingDailyRepeat } from './opsDates';
import { groupTasksByTab, projectTasksByNewest, TASK_LIST_TAB_LABEL, tasksDueOn, visibleTabsOf } from './taskListTabs';
import DateFilterChip from './components/DateFilterChip';
import DoneTaskList from './components/DoneTaskList';
import TaskTabOrderModal from './components/TaskTabOrderModal';
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

/** Ventana de Projects abierta: para crear uno o la lista (con `projectId`, editando ese). */
interface ProjectsModalState {
  mode: 'create' | 'manage';
  projectId: string | null;
}

const TaskListView = ({ onOpenMenu, currentUser, activeRole, isSuperAdmin }: TaskListViewProps) => {
  const users = useLiveData('users');
  const roles = useLiveData('roles');
  const priorityCatalog = useLiveData('priorities');
  const teams = useLiveData('teams');
  const { data: projects } = useLiveCollection('taskProjects');

  const currentUserId = currentUser?.id ?? '';
  const currentUserName = userName(currentUser) || 'Me';
  const taskListAccess = taskListRights(activeRole, isSuperAdmin);
  // Proyectos: módulo "Projects" de Roles (sin declararlo, lo de Task List).
  const projectAccess = taskProjectRights(activeRole, isSuperAdmin);

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
  // Pestaña elegida (null = la primera que se muestra).
  const [selectedTabId, setSelectedTabId] = useState<TaskListTabId | null>(null);
  const [isTabOrderModalOpen, setIsTabOrderModalOpen] = useState(false);
  const tabOrder = useTaskListTabOrder();
  const [projectsModalState, setProjectsModalState] = useState<ProjectsModalState | null>(null);
  // Proyecto cuya ventana de tareas está abierta (tarjeta de "My projects").
  const [openedProjectId, setOpenedProjectId] = useState<string | null>(null);
  // Día del calendario por el que se filtra la vista (null = sin filtro).
  const [filterIsoDate, setFilterIsoDate] = useState<string | null>(null);
  const [isNewTaskPanelOpen, setIsNewTaskPanelOpen] = useState(false);
  const todayIsoDate = todayIso();

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
  // Lo que otros esperan que YO apruebe (va en "Needs Approval" de "mis tareas").
  const approvalQueue = useApprovalQueue(viewedUserId === currentUserId ? currentUserId : null);
  const tasksToApprove = useMemo(
    () => (visibleTab === 'assignedTo' ? approvalQueue.tasks.filter((task) => !isAssignee(task, currentUserId)) : []),
    [visibleTab, approvalQueue.tasks, currentUserId],
  );
  const tasksToApproveIds = new Set(tasksToApprove.map((task) => task.id));
  // Un listener que falla no se muestra como "no hay tareas".
  const loadError = listError ?? approvalQueue.error;
  // Pendientes: sin las diarias de otro día (aparecen el día que les toca).
  const isPendingToday = (task: UserTask) => !isUpcomingDailyRepeat(task, todayIsoDate);
  const pendingTasks = tasks.filter(isPendingToday);
  const assignedToPendingCount = assignedToResult.tasks.filter(isPendingToday).length;
  const assignedByPendingCount = assignedByTasks.filter(isPendingToday).length;

  // Pestañas en el orden elegido; las que no tienen tareas no se ven (ALL y
  // Done siempre). Si la elegida se queda sin tareas, se ve la primera.
  const tasksByTab = useMemo(
    () => groupTasksByTab(tasks, tasksToApprove, todayIsoDate),
    [tasks, tasksToApprove, todayIsoDate],
  );
  const visibleTabs = visibleTabsOf(tabOrder, tasksByTab);
  const isSelectedTabVisible = visibleTabs.some((tab) => tab.tabId === selectedTabId);
  const visibleTabId: TaskListTabId = (isSelectedTabVisible ? selectedTabId : null) ?? visibleTabs[0]?.tabId ?? 'all';
  // Pestaña "Done" abierta: solo entonces se piden las tareas hechas.
  const isDoneSelected = visibleTabId === 'done';
  const visibleTabTasks = visibleTabId === 'done' ? [] : tasksByTab[visibleTabId];

  // Hechas de la pestaña elegida (como en las abiertas, "Assigned by" deja
  // fuera las que la persona se asignó solo a sí misma).
  const doneTasksResult = useDoneTasks(visibleTab === 'assignedBy' ? 'created' : 'assigned', viewedUserId || null, isDoneSelected);
  const visibleDoneTasks = visibleTab === 'assignedBy'
    ? doneTasksResult.tasks.filter((task) => task.assignees.some((assignee) => assignee.userId !== viewedUserId))
    : doneTasksResult.tasks;
  const overdueTaskCount = tasksByTab.overdue.length;

  // "My projects": las tareas abiertas que se tienen cargadas (asignadas y dadas
  // a otros) van al calendario y al avance; los proyectos activos son los que
  // la persona que se mira tiene a cargo Y aquellos donde tiene tareas abiertas
  // o que asignó (decisión de Omar, 10/2026: antes solo los que tenía a cargo,
  // y quien solo trabajaba en proyectos de otros veía "No active projects").
  // Con "Everyone", todos.
  const loadedOpenTasks = useMemo(() => {
    const tasksById = new Map<string, UserTask>();
    [...assignedToResult.tasks, ...createdTasksResult.tasks].forEach((task) => tasksById.set(task.id, task));
    return [...tasksById.values()];
  }, [assignedToResult.tasks, createdTasksResult.tasks]);
  const projectIdsWithTasks = new Set(loadedOpenTasks.map((task) => task.projectId).filter(Boolean));
  // Con un día del calendario elegido, la vista entera se filtra a ese día: las
  // tareas cargadas (asignadas y dadas a otros, como los puntos del calendario)
  // que vencen ese día, y los proyectos con alguna de ellas o que vencen ese día.
  const dateFilteredTasks = filterIsoDate ? tasksDueOn(loadedOpenTasks, filterIsoDate) : [];
  const dateFilteredProjectIds = new Set(dateFilteredTasks.map((task) => task.projectId).filter(Boolean));
  const panelProjects = activeProjects
    .filter((project) => isEveryoneView || project.ownerUserId === viewedUserId || projectIdsWithTasks.has(project.id))
    .filter((project) => !filterIsoDate || dateFilteredProjectIds.has(project.id) || project.dueDate === filterIsoDate);

  // Ventana de un proyecto: con Scope "All", TODAS sus pendientes (listener por
  // projectId); con "Own" las reglas no dejan pedirlas: las que se tienen cargadas.
  const projectOpenTasksResult = useProjectOpenTasks(taskListAccess.seesAll ? openedProjectId : null);
  const openedProject = openedProjectId ? projectsById.get(openedProjectId) ?? null : null;
  const openedProjectTasksResult = taskListAccess.seesAll
    ? projectOpenTasksResult
    : {
      tasks: loadedOpenTasks.filter((task) => task.projectId === openedProjectId),
      loaded: assignedToResult.loaded && createdTasksResult.loaded,
      error: assignedToResult.error ?? createdTasksResult.error,
    };
  const openedProjectPendingTasks = projectTasksByNewest(openedProjectTasksResult.tasks);

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

  // Reabrir desde la pestaña Done la saca de la lista: se vuelve a pedir la primera página.
  const handleToggleDone = async (task: UserTask) => {
    if (task.status !== 'done') {
      void actions.complete(task);
      return;
    }
    const reopenResult = await actions.reopen(task);
    if (reopenResult.ok && isDoneSelected) doneTasksResult.reload();
  };

  const handleDeleteTask = async (task: UserTask) => {
    if (!window.confirm(`Delete "${task.title}"? Its comments and files are deleted too.`)) return;
    if (await actions.remove(task)) setSelectedTaskId(null);
  };

  const handleCreateProject = () => setProjectsModalState({ mode: 'create', projectId: null });
  const handleManageProjects = () => setProjectsModalState({ mode: 'manage', projectId: null });

  const handleEditProject = (project: TaskProject) => {
    setOpenedProjectId(null);
    setProjectsModalState({ mode: 'manage', projectId: project.id });
  };

  // Con tareas, el aviso dice que se quedan (sin proyecto).
  const handleDeleteProject = (project: TaskProject) => {
    const taskCount = project.taskCount || 0;
    const tasksNote = taskCount > 0
      ? `\n\nIts ${taskCount} task${taskCount === 1 ? '' : 's'} will stay, without a project.`
      : '';
    if (window.confirm(`Delete the project "${project.title}"?${tasksNote}`)) actions.removeProject(project);
  };

  // Desde la lista de Projects (también los archivados): abre la ventana de sus tareas.
  const handleOpenProjectTasks = (project: TaskProject) => {
    setProjectsModalState(null);
    setOpenedProjectId(project.id);
  };

  const listStatus = (() => {
    if (loadError) return 'error';
    if (!loaded) return 'loading';
    return visibleTabTasks.length === 0 ? 'empty' : 'ready';
  })();

  const emptyListMessage = (() => {
    if (tasks.length > 0) return 'No tasks in this tab.';
    if (visibleTab === 'assignedTo') return 'No open tasks. Use "Add Task" to create one.';
    if (viewedUserId === currentUserId) return "You haven't assigned open tasks to anyone.";
    return `${getFirstName(viewedUserName)} hasn't assigned open tasks to anyone.`;
  })();

  const projectsPanelTitle = (() => {
    if (isEveryoneView) return 'All projects';
    if (viewedUserId === currentUserId) return 'My projects';
    return `${getFirstName(viewedUserName)}'s projects`;
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
          <span className="otl-open">{loaded ? `${pendingTasks.length} open · ${overdueTaskCount} overdue` : '…'}</span>
          {taskListAccess.seesAll && (
            <select className="otl-select" value={viewedUserId}
              onChange={(event) => handleViewedUserChange(event.target.value)} aria-label="Whose tasks">
              {assignableUsers.map((person) => (
                <option key={person.id} value={person.id}>{person.id === currentUserId ? 'My tasks' : person.name}</option>
              ))}
              <option value={ALL_USERS}>Everyone</option>
            </select>
          )}
          {projectAccess.canView && (
            <ActionButton variant="outline" icon={<FolderKanban size={16} />} onClick={handleManageProjects}>
              Projects
            </ActionButton>
          )}
        </div>
      </header>

      <div className="otl-layout">
        <div className="otl-stack">
          {!isEveryoneView && !filterIsoDate && (
            <div className="otl-tabs" role="tablist" aria-label="Tasks">
              <button type="button" role="tab" aria-selected={visibleTab === 'assignedTo'}
                className={`otl-tab${visibleTab === 'assignedTo' ? ' active' : ''}`}
                onClick={() => setSelectedTab('assignedTo')}>
                {viewedUserId === currentUserId ? 'Assigned to me' : `Assigned to ${getFirstName(viewedUserName)}`}
                <span className="otl-tab-count">{assignedToResult.loaded ? assignedToPendingCount : '…'}</span>
              </button>
              <button type="button" role="tab" aria-selected={visibleTab === 'assignedBy'}
                className={`otl-tab${visibleTab === 'assignedBy' ? ' active' : ''}`}
                onClick={() => setSelectedTab('assignedBy')}>
                {viewedUserId === currentUserId ? 'Assigned by me' : `Assigned by ${getFirstName(viewedUserName)}`}
                <span className="otl-tab-count">{createdTasksResult.loaded ? assignedByPendingCount : '…'}</span>
              </button>
            </div>
          )}

          <div className="otl-actions">
            <ActionButton size="lg" icon={<Plus size={18} />} onClick={() => setIsNewTaskPanelOpen(true)}>
              Add task
            </ActionButton>
            {projectAccess.canAdd && (
              <ActionButton size="lg" variant="secondary" icon={<Plus size={18} />} onClick={handleCreateProject}>
                New project
              </ActionButton>
            )}
          </div>

          {(openedTaskStatus === 'error' || openedTaskStatus === 'deleted') && (
            <p className="error otl-empty" role="alert">
              {openedTaskMessage}
              <ActionButton variant="outline" size="sm" onClick={() => setSelectedTaskId(null)}>OK</ActionButton>
            </p>
          )}

          {filterIsoDate && <DateFilterChip isoDate={filterIsoDate} onClear={() => setFilterIsoDate(null)} />}
          {filterIsoDate && dateFilteredTasks.length === 0 && <p className="otl-empty">No open tasks due that day.</p>}
          {filterIsoDate && dateFilteredTasks.length > 0 && (
            <TaskSection
              title={`Due ${formatDate(filterIsoDate)}`}
              tone=""
              tasks={dateFilteredTasks}
              todayIsoDate={todayIsoDate}
              selectedTaskId={selectedTaskId}
              busyTaskId={actions.busyId}
              getProjectTitle={getProjectTitle}
              getProjectColor={getProjectColor}
              getAssigneesLabel={getAssigneesLabel}
              getAssignedByName={getAssignedByName}
              onOpen={(task) => setSelectedTaskId(task.id)}
              onMarkDone={actions.complete}
            />
          )}

          {!filterIsoDate && (
            <>
            {listStatus === 'error' && (
              <p className="error otl-empty" role="alert">Could not load the tasks. Check your connection and try again.</p>
            )}
            {listStatus === 'loading' && <p className="otl-empty"><Loader2 size={16} className="otl-spin" /> Loading tasks…</p>}
            {(listStatus === 'ready' || listStatus === 'empty') && (
              <TaskSectionTabs
                tabs={visibleTabs}
                selectedTabId={visibleTabId}
                onSelectTab={setSelectedTabId}
                onEditTabOrder={taskListAccess.canEdit ? () => setIsTabOrderModalOpen(true) : undefined}
              />
            )}
            {isDoneSelected && listStatus !== 'error' && (
              <DoneTaskList
                tasks={visibleDoneTasks}
                pageNumber={doneTasksResult.pageNumber}
                hasPreviousPage={doneTasksResult.hasPreviousPage}
                hasNextPage={doneTasksResult.hasNextPage}
                isLoading={doneTasksResult.isLoading}
                isLoadingPage={doneTasksResult.isLoadingPage}
                loadError={doneTasksResult.error}
                todayIsoDate={todayIsoDate}
                selectedTaskId={selectedTaskId}
                getProjectTitle={getProjectTitle}
                getProjectColor={getProjectColor}
                getAssigneesLabel={getAssigneesLabel}
                getAssignedByName={getAssignedByName}
                onOpen={(task) => setSelectedTaskId(task.id)}
                onPreviousPage={doneTasksResult.goToPreviousPage}
                onNextPage={doneTasksResult.goToNextPage}
                onRetry={doneTasksResult.reload}
              />
            )}
            {!isDoneSelected && listStatus === 'empty' && <p className="otl-empty">{emptyListMessage}</p>}
            {!isDoneSelected && listStatus === 'ready' && (
              <TaskSection
                title={TASK_LIST_TAB_LABEL[visibleTabId]}
                tone={visibleTabId}
                tasks={visibleTabTasks}
                todayIsoDate={todayIsoDate}
                selectedTaskId={selectedTaskId}
                busyTaskId={actions.busyId}
                getProjectTitle={getProjectTitle}
                getProjectColor={getProjectColor}
                getAssigneesLabel={getAssigneesLabel}
                getAssignedByName={getAssignedByName}
                onOpen={(task) => setSelectedTaskId(task.id)}
                onMarkDone={actions.complete}
                isReviewOnly={(task) => tasksToApproveIds.has(task.id)}
              />
            )}
            </>
          )}
        </div>

        <MyProjectsPanel
          title={projectsPanelTitle}
          projects={panelProjects}
          openTasks={loadedOpenTasks}
          todayIsoDate={todayIsoDate}
          currentUserId={currentUserId}
          selectedIsoDate={filterIsoDate}
          onSelectDate={setFilterIsoDate}
          canViewProjects={projectAccess.canView}
          canCreateProject={projectAccess.canAdd}
          onOpenProject={(project) => setOpenedProjectId(project.id)}
          onCreateProject={handleCreateProject}
        />
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
          onSendApproval={(approver) => actions.sendForApproval(openedTask, approver)}
          onDecideApproval={async (decision, note) => (await actions.decide(openedTask, decision, note)).ok}
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

      {isTabOrderModalOpen && (
        <TaskTabOrderModal
          tabOrder={tabOrder}
          onClose={() => setIsTabOrderModalOpen(false)}
          onSave={actions.saveTabOrder}
        />
      )}

      {/* Con una tarea abierta la ventana se esconde; al cerrar la tarea, vuelve. */}
      {openedProject && !selectedTaskId && (
        <ProjectTasksModal
          project={openedProject}
          pendingTasks={openedProjectPendingTasks}
          isLoading={!openedProjectTasksResult.loaded}
          hasLoadError={!!openedProjectTasksResult.error}
          todayIsoDate={todayIsoDate}
          currentUserId={currentUserId}
          busyTaskId={actions.busyId}
          canEditProject={projectAccess.canEdit}
          getProjectTitle={getProjectTitle}
          getProjectColor={getProjectColor}
          getAssigneesLabel={getAssigneesLabel}
          getAssignedByName={getAssignedByName}
          onOpenTask={(task) => setSelectedTaskId(task.id)}
          onMarkDone={actions.complete}
          onEditProject={handleEditProject}
          onClose={() => setOpenedProjectId(null)}
        />
      )}

      {projectsModalState && (
        <ProjectsModal
          projects={projects}
          people={assignableUsers}
          teams={teams}
          defaultOwnerId={currentUserId}
          canAdd={projectAccess.canAdd}
          canEdit={projectAccess.canEdit}
          canDelete={projectAccess.canDelete}
          onClose={() => setProjectsModalState(null)}
          onSave={actions.saveProject}
          onStatus={actions.setProjectStatus}
          onDelete={handleDeleteProject}
          onOpenProjectTasks={handleOpenProjectTasks}
          initialMode={projectsModalState.mode}
          initialProjectId={projectsModalState.projectId}
        />
      )}
    </div>
  );
};

export default TaskListView;
