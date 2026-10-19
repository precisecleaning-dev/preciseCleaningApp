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
import { Loader2, Plus } from 'lucide-react';
import type { AssignmentTab, Role, SystemUser, TaskListTabId, TaskProject, UserTask } from '../../types/index';
import { useLiveCollection, useLiveData } from '../../shared/data/liveCollections';
import { formatDate, todayIso } from '../../utils/dateFormat';
import NewTaskPanel from './components/NewTaskPanel';
import ProjectsModal from './components/ProjectsModal';
import ProjectTasksModal from './components/ProjectTasksModal';
import TaskPanel from './components/TaskPanel';
import TaskSection from './components/TaskSection';
import TaskSectionTabs from './components/TaskSectionTabs';
import ActionButton from './components/ActionButton';
import AssignmentTabs from './components/AssignmentTabs';
import TaskListHeader from './components/TaskListHeader';
import MyProjectsPanel from './components/MyProjectsPanel';
import {
  ALL_USERS, useApprovalQueue, useCreatedTasks, useDoneTasks, useLiveTask, useOpenTasks,
} from './hooks/useOpsData';
import { useOpenedProjectTasks } from './hooks/useOpenedProjectTasks';
import { useTaskActions } from './hooks/useTaskActions';
import { useTaskListLabels } from './hooks/useTaskListLabels';
import { useTaskListTabOrder } from './hooks/useTaskListTabOrder';
import {
  assignablePeople, canReassignTask, getDefaultApproverUserId, isAssignee, taskListRights, taskProjectRights, toTaskAssignee, userName,
} from './opsPermissions';
import { getFirstName } from './opsOptions';
import { isUpcomingDailyRepeat } from './opsDates';
import { groupTasksByTab, TASK_LIST_TAB_LABEL, tasksDueOn, visibleTabsOf } from './taskListTabs';
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
  const [selectedAssignmentTab, setSelectedAssignmentTab] = useState<AssignmentTab>('assignedTo');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  // Pestaña elegida (null = la primera que se muestra).
  const [selectedSectionTabId, setSelectedSectionTabId] = useState<TaskListTabId | null>(null);
  const [isTabOrderModalOpen, setIsTabOrderModalOpen] = useState(false);
  const sectionTabOrder = useTaskListTabOrder();
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
  const defaultApproverUserId = useMemo(
    () => getDefaultApproverUserId(approvers, users, roles),
    [approvers, users, roles],
  );

  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project] as const)), [projects]);
  const knownProjectIds = useMemo(() => new Set(projectsById.keys()), [projectsById]);
  const activeProjects = useMemo(
    () => projects
      .filter((project) => project.status === 'active')
      .sort((firstProject, secondProject) => firstProject.title.localeCompare(secondProject.title)),
    [projects],
  );

  const taskActions = useTaskActions({ id: currentUserId, name: currentUserName }, knownProjectIds);
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
  const visibleAssignmentTab: AssignmentTab = isEveryoneView ? 'assignedTo' : selectedAssignmentTab;
  const { tasks, loaded: isListLoaded, error: listError } = visibleAssignmentTab === 'assignedBy'
    ? { tasks: assignedByTasks, loaded: createdTasksResult.loaded, error: createdTasksResult.error }
    : assignedToResult;
  // Lo que otros esperan que YO apruebe (va en "Needs Approval" de "mis tareas").
  const approvalQueue = useApprovalQueue(viewedUserId === currentUserId ? currentUserId : null);
  const tasksToApprove = useMemo(
    () => (visibleAssignmentTab === 'assignedTo' ? approvalQueue.tasks.filter((task) => !isAssignee(task, currentUserId)) : []),
    [visibleAssignmentTab, approvalQueue.tasks, currentUserId],
  );
  const tasksToApproveIds = new Set(tasksToApprove.map((task) => task.id));
  // Un listener que falla no se muestra como "no hay tareas". Si solo falla el
  // de las aprobaciones, la lista se ve igual y se avisa aparte.
  const loadError = listError;
  const hasApprovalQueueError = visibleAssignmentTab === 'assignedTo' && !!approvalQueue.error;
  // Pendientes: sin las diarias de otro día (aparecen el día que les toca).
  const isPendingToday = (task: UserTask) => !isUpcomingDailyRepeat(task, todayIsoDate);
  const pendingTasks = tasks.filter(isPendingToday);
  const assignedToPendingCount = assignedToResult.tasks.filter(isPendingToday).length;
  const assignedByPendingCount = assignedByTasks.filter(isPendingToday).length;

  // Pestañas en el orden elegido; las que no tienen tareas no se ven (ALL y
  // Done siempre). Si la elegida se queda sin tareas, se ve la primera.
  const tasksBySectionTab = useMemo(
    () => groupTasksByTab(tasks, tasksToApprove, todayIsoDate),
    [tasks, tasksToApprove, todayIsoDate],
  );
  const visibleSectionTabs = visibleTabsOf(sectionTabOrder, tasksBySectionTab);
  const isSelectedTabVisible = visibleSectionTabs.some((tab) => tab.tabId === selectedSectionTabId);
  const visibleSectionTabId: TaskListTabId = (isSelectedTabVisible ? selectedSectionTabId : null) ?? visibleSectionTabs[0]?.tabId ?? 'all';
  // Pestaña "Done" abierta: solo entonces se piden las tareas hechas.
  const isDoneTabSelected = visibleSectionTabId === 'done';
  const visibleSectionTasks = visibleSectionTabId === 'done' ? [] : tasksBySectionTab[visibleSectionTabId];

  // Hechas de la pestaña elegida. Como en las abiertas, "Assigned by" deja fuera
  // las que la persona se asignó solo a sí misma (lo filtra getDonePage).
  const doneTasksResult = useDoneTasks(
    visibleAssignmentTab === 'assignedBy' ? 'created' : 'assigned', viewedUserId || null, isDoneTabSelected,
  );
  const overdueTaskCount = tasksBySectionTab.overdue.length;

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

  // Ventana de un proyecto (con Scope "Own", solo las que ya están cargadas).
  const openedProjectTasks = useOpenedProjectTasks({
    openedProjectId,
    projectsById,
    canQueryAllTasks: taskListAccess.seesAll,
    loadedOpenTasks: {
      tasks: loadedOpenTasks,
      loaded: assignedToResult.loaded && createdTasksResult.loaded,
      error: assignedToResult.error ?? createdTasksResult.error,
    },
  });

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
    return taskActions.busyId === selectedTaskId ? 'closing' : 'deleted';
  })();

  const viewedUser = users.find((user) => user.id === viewedUserId)
    ?? (viewedUserId === currentUserId ? currentUser : null);
  const viewedUserName = isEveryoneView ? 'Everyone' : userName(viewedUser) || currentUserName;
  const viewedRoleName = isEveryoneView
    ? 'All managers'
    : roles.find((role) => role.id === viewedUser?.roleId)?.name ?? '';
  // La tarea nueva va para la persona que se está mirando (con "Everyone", para uno mismo).
  const newTaskAssigneeUser = assignableUsers.find((person) => person.id === (isEveryoneView ? currentUserId : viewedUserId));
  const newTaskAssignee = newTaskAssigneeUser
    ? toTaskAssignee(newTaskAssigneeUser)
    : { userId: currentUserId, userName: currentUserName };

  const { getAssigneesLabel, getAssignedByName, getProjectTitle, getProjectColor } = useTaskListLabels({
    users, projectsById, currentUserId, viewedUserId,
  });
  const canEditTask = (task: UserTask) =>
    taskListAccess.canEdit || isAssignee(task, currentUserId) || task.createdByUserId === currentUserId;

  const handleOpenTask = (task: UserTask) => setSelectedTaskId(task.id);

  const handleViewedUserChange = (personId: string) => {
    setSelectedPersonId(personId);
    setSelectedTaskId(null);
  };

  // Reabrir desde la pestaña Done la saca de la lista: se vuelve a pedir la primera página.
  const handleToggleDone = async (task: UserTask) => {
    if (task.status !== 'done') {
      void taskActions.complete(task);
      return;
    }
    const reopenResult = await taskActions.reopen(task);
    if (reopenResult.ok && isDoneTabSelected) doneTasksResult.reload();
  };

  const handleDeleteTask = async (task: UserTask) => {
    if (!window.confirm(`Delete "${task.title}"? Its comments and files are deleted too.`)) return;
    if (await taskActions.remove(task)) setSelectedTaskId(null);
  };

  const handleCreateProject = () => setProjectsModalState({ mode: 'create', projectId: null });
  const handleManageProjects = () => setProjectsModalState({ mode: 'manage', projectId: null });

  const handleEditProject = (project: TaskProject) => {
    setOpenedProjectId(null);
    setProjectsModalState({ mode: 'manage', projectId: project.id });
  };

  // Con tareas, el aviso dice que se quedan (sin proyecto).
  const handleDeleteProject = (project: TaskProject) => {
    const taskCount = project.taskCount ?? 0;
    const tasksNote = taskCount > 0
      ? `\n\nIts ${taskCount} task${taskCount === 1 ? '' : 's'} will stay, without a project.`
      : '';
    if (window.confirm(`Delete the project "${project.title}"?${tasksNote}`)) taskActions.removeProject(project);
  };

  // Desde la lista de Projects (también los archivados): abre la ventana de sus tareas.
  const handleOpenProjectTasks = (project: TaskProject) => {
    setProjectsModalState(null);
    setOpenedProjectId(project.id);
  };

  const listStatus = (() => {
    if (loadError) return 'error';
    if (!isListLoaded) return 'loading';
    return visibleSectionTasks.length === 0 ? 'empty' : 'ready';
  })();

  const viewedFirstName = getFirstName(viewedUserName);
  const isViewingSelf = viewedUserId === currentUserId;

  const emptyListMessage = (() => {
    if (tasks.length > 0) return 'No tasks in this tab.';
    if (visibleAssignmentTab === 'assignedTo') return 'No open tasks. Use "Add Task" to create one.';
    if (isViewingSelf) return "You haven't assigned open tasks to anyone.";
    return `${viewedFirstName} hasn't assigned open tasks to anyone.`;
  })();

  const projectsPanelTitle = (() => {
    if (isEveryoneView) return 'All projects';
    if (isViewingSelf) return 'My projects';
    return `${viewedFirstName}'s projects`;
  })();

  const headerTitle = isEveryoneView ? "Everyone's tasks" : `${viewedFirstName}'s tasks`;
  const openSummary = isListLoaded ? `${pendingTasks.length} open · ${overdueTaskCount} overdue` : '…';
  const assignedToTabLabel = isViewingSelf ? 'Assigned to me' : `Assigned to ${viewedFirstName}`;
  const assignedByTabLabel = isViewingSelf ? 'Assigned by me' : `Assigned by ${viewedFirstName}`;

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
      <TaskListHeader
        onOpenMenu={onOpenMenu}
        viewedUserId={viewedUserId}
        everyoneOptionId={ALL_USERS}
        isEveryoneView={isEveryoneView}
        title={headerTitle}
        viewedUserName={viewedUserName}
        viewedRoleName={viewedRoleName}
        openSummary={openSummary}
        currentUserId={currentUserId}
        canChoosePerson={taskListAccess.seesAll}
        assignableUsers={assignableUsers}
        onViewedUserChange={handleViewedUserChange}
        canViewProjects={projectAccess.canView}
        onManageProjects={handleManageProjects}
      />

      <div className="otl-layout">
        <div className="otl-stack">
          {!isEveryoneView && !filterIsoDate && (
            <AssignmentTabs
              selectedTab={visibleAssignmentTab}
              assignedToLabel={assignedToTabLabel}
              assignedByLabel={assignedByTabLabel}
              assignedToCount={assignedToResult.loaded ? assignedToPendingCount : null}
              assignedByCount={createdTasksResult.loaded ? assignedByPendingCount : null}
              onSelectTab={setSelectedAssignmentTab}
            />
          )}

          <div className="otl-taskActions">
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
              busyTaskId={taskActions.busyId}
              getProjectTitle={getProjectTitle}
              getProjectColor={getProjectColor}
              getAssigneesLabel={getAssigneesLabel}
              getAssignedByName={getAssignedByName}
              onOpen={handleOpenTask}
              onMarkDone={taskActions.complete}
            />
          )}

          {!filterIsoDate && (
            <>
            {listStatus === 'error' && (
              <p className="error otl-empty" role="alert">Could not load the tasks. Check your connection and try again.</p>
            )}
            {listStatus === 'loading' && <p className="otl-empty"><Loader2 size={16} className="otl-spin" /> Loading tasks…</p>}
            {hasApprovalQueueError && listStatus !== 'error' && (
              <p className="error otl-inline-error" role="alert">
                Could not load the tasks waiting for your OK. The rest of the list is up to date.
              </p>
            )}
            {(listStatus === 'ready' || listStatus === 'empty') && (
              <TaskSectionTabs
                tabs={visibleSectionTabs}
                selectedTabId={visibleSectionTabId}
                onSelectTab={setSelectedSectionTabId}
                onEditTabOrder={taskListAccess.canEdit ? () => setIsTabOrderModalOpen(true) : undefined}
              />
            )}
            {isDoneTabSelected && listStatus !== 'error' && (
              <DoneTaskList
                tasks={doneTasksResult.tasks}
                pageNumber={doneTasksResult.pageNumber}
                hasPreviousPage={doneTasksResult.hasPreviousPage}
                hasNextPage={doneTasksResult.hasNextPage}
                isLoading={doneTasksResult.isLoading}
                isLoadingPage={doneTasksResult.isLoadingPage}
                loadError={doneTasksResult.error}
                nextPageError={doneTasksResult.nextPageError}
                todayIsoDate={todayIsoDate}
                selectedTaskId={selectedTaskId}
                getProjectTitle={getProjectTitle}
                getProjectColor={getProjectColor}
                getAssigneesLabel={getAssigneesLabel}
                getAssignedByName={getAssignedByName}
                onOpen={handleOpenTask}
                onPreviousPage={doneTasksResult.goToPreviousPage}
                onNextPage={doneTasksResult.goToNextPage}
                onRetry={doneTasksResult.reload}
              />
            )}
            {!isDoneTabSelected && listStatus === 'empty' && <p className="otl-empty">{emptyListMessage}</p>}
            {!isDoneTabSelected && listStatus === 'ready' && (
              <TaskSection
                title={TASK_LIST_TAB_LABEL[visibleSectionTabId]}
                tone={visibleSectionTabId}
                tasks={visibleSectionTasks}
                todayIsoDate={todayIsoDate}
                selectedTaskId={selectedTaskId}
                busyTaskId={taskActions.busyId}
                getProjectTitle={getProjectTitle}
                getProjectColor={getProjectColor}
                getAssigneesLabel={getAssigneesLabel}
                getAssignedByName={getAssignedByName}
                onOpen={handleOpenTask}
                onMarkDone={taskActions.complete}
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
          isBusy={taskActions.busyId === openedTask.id}
          isUploading={taskActions.uploading}
          onClose={() => setSelectedTaskId(null)}
          onPatch={(patch) => taskActions.patch(openedTask, patch)}
          onToggleDone={() => handleToggleDone(openedTask)}
          onDelete={() => handleDeleteTask(openedTask)}
          onAddComment={(text) => taskActions.comment(openedTask.id, text)}
          onAttachFiles={(files) => taskActions.attach(openedTask.id, files)}
          onRemoveAttachment={(attachment) => taskActions.removeFile(openedTask.id, attachment)}
          approvers={approvers}
          defaultApproverUserId={defaultApproverUserId}
          onSendApproval={(approver) => taskActions.sendForApproval(openedTask, approver)}
          onDecideApproval={async (decision, note) => (await taskActions.decide(openedTask, decision, note)).ok}
          onSetApproval={(approval) => taskActions.setApproval(openedTask, approval)}
        />
      )}

      {isNewTaskPanelOpen && (
        <NewTaskPanel
          key={newTaskAssignee.userId}
          assignableUsers={assignableUsers}
          projects={activeProjects}
          priorities={priorityCatalog}
          currentUser={{ id: currentUserId, name: currentUserName }}
          defaultAssignee={newTaskAssignee}
          approvers={approvers}
          onClose={() => setIsNewTaskPanelOpen(false)}
          onCreate={taskActions.add}
        />
      )}

      {taskActions.undo && <UndoToast title={taskActions.undo.task.title} onUndo={taskActions.undoComplete} />}

      {isTabOrderModalOpen && (
        <TaskTabOrderModal
          tabOrder={sectionTabOrder}
          onClose={() => setIsTabOrderModalOpen(false)}
          onSave={taskActions.saveTabOrder}
        />
      )}

      {/* Con una tarea abierta la ventana se esconde; al cerrar la tarea, vuelve. */}
      {openedProjectTasks.openedProject && !selectedTaskId && (
        <ProjectTasksModal
          project={openedProjectTasks.openedProject}
          pendingTasks={openedProjectTasks.openedProjectTasks}
          isLoading={openedProjectTasks.isLoading}
          hasLoadError={openedProjectTasks.hasLoadError}
          todayIsoDate={todayIsoDate}
          currentUserId={currentUserId}
          busyTaskId={taskActions.busyId}
          canEditProject={projectAccess.canEdit}
          getProjectTitle={getProjectTitle}
          getProjectColor={getProjectColor}
          getAssigneesLabel={getAssigneesLabel}
          getAssignedByName={getAssignedByName}
          onOpenTask={handleOpenTask}
          onMarkDone={taskActions.complete}
          onEditProject={handleEditProject}
          onClose={() => setOpenedProjectId(null)}
        />
      )}

      {projectsModalState && (
        <ProjectsModal
          projects={projects}
          assignableUsers={assignableUsers}
          teams={teams}
          defaultOwnerUserId={currentUserId}
          canAdd={projectAccess.canAdd}
          canEdit={projectAccess.canEdit}
          canDelete={projectAccess.canDelete}
          onClose={() => setProjectsModalState(null)}
          onSaveProject={taskActions.saveProject}
          onProjectStatusChange={taskActions.setProjectStatus}
          onDeleteProject={handleDeleteProject}
          onOpenProjectTasks={handleOpenProjectTasks}
          initialMode={projectsModalState.mode}
          initialProjectId={projectsModalState.projectId}
        />
      )}
    </div>
  );
};

export default TaskListView;
