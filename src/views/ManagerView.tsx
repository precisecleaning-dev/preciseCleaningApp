// ============================================================================
// ⭐ MANAGER — la página de inicio del gerente (diseño "Manager" que pasó el
//    usuario). Todo es del día de hoy y del gerente que la abre:
//      · "Your day in 30 seconds": lo primero que hay que atender, trabajos,
//        tareas y QC (reglas automáticas sobre los datos reales)
//      · My shift: reloj de entrada/salida y horas de la semana
//      · Manager tasks: tareas pendientes del Task list de los gerentes
//        (usuarios cuyo rol tiene Manager → View). Con Scope "Own" en Task
//        List, solo las propias ("My tasks"). Aquí solo se ven y se marcan
//        hechas; se crean en el Task list.
//      · Houses Today: trabajos de hoy por hora; si no tienen equipo se
//        asigna ahí mismo
//      · Quality check: casas que esperan inspección (Pass rápido = "Invoice"
//        de la inspección completa, sin checklist; o inspección completa si no pasó)
//      · On recall: casas en Recall y si su re-clean ya está agendado
//      · All jobs: tabla de hoy con la acción sugerida
//    Las reglas viven en src/utils/homeData.ts.
// ============================================================================
import { useMemo, useState, type CSSProperties } from 'react';
import { ChevronDown, ChevronRight, ClipboardCheck, RotateCcw, Sparkles } from 'lucide-react';
import type { Property, Role, SystemUser } from '../types/index';
import HomeHeader from '../components/HomeHeader';
import TaskChecklist from '../components/TaskChecklist';
import TeamPill from '../components/TeamPill';
import {
  fullName, greeting, headerDate, startOfDay, TODAY_STATE_LABEL, useHomeData, type HomeJob,
} from '../utils/homeData';
import { useHomeTasks } from '../features/ops/hooks/useHomeTasks';
import { sectionOf } from '../features/ops/opsDates';
import { getFirstName } from '../features/ops/opsOptions';
import { isOnlyAssignee } from '../features/ops/opsPermissions';
import UndoToast from '../features/ops/components/UndoToast';
import { usePendingById } from '../shared/hooks/usePendingById';
import { qualityChecks } from '../features/quality-check/services/qualityChecks';
import {
  addStatusChange, afterStatusHistoryWrite, houseLogLabel, logStatusChange,
} from '../features/houses/services/houseStatus';
import { fmtClock, openEntryOf, timeClockService, weekHours } from '../services/timeClockService';
import { propertiesService } from '../services/propertiesService';
import { logActivity } from '../services/activityLogService';
import { qcInfoFor } from '../utils/jobQuality';
import { jobInsight } from '../utils/jobInsights';
import { formatDate, todayIso } from '../utils/dateFormat';
import { isInvoiceStatus } from '../utils/invoiceEntry';
import { isQualityCheckStatus } from '../utils/qcStatus';
import { groupByDate } from '../utils/dateGrouping';
import './HomeViews.css';

interface ManagerViewProps {
  onOpenMenu: () => void;
  properties: Property[];
  currentUser: SystemUser | null;
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
  /** Abre la inspección completa en Quality Check. */
  onOpenInspection?: (house: Property) => void;
  onOpenHouseDetail: (house: Property) => void;
  onOpenHouseEdit: (house: Property) => void;
}

const BILLING_TONE: Record<string, string> = { 'needs invoice': 'warn', pending: 'info', paid: 'good', 'pre-paid': 'good' };
const INSIGHT_TONE: Record<string, string> = { 'Action needed': 'bad', 'Follow up': 'warn', 'All good': 'good' };
const JOB_STATE_TONE: Record<string, string> = { done: 'good', progress: 'good', late: 'warn', scheduled: 'muted', nocrew: 'warn' };
const JOBS_PAGE_SIZE = 5;

/** Id de la acción del reloj en `pendingActionIds` (las demás usan el id de la casa). */
const CLOCK_ACTION_ID = 'clock';

export default function ManagerView({
  onOpenMenu, properties, currentUser, activeRole, isSuperAdmin = false,
  onOpenInspection, onOpenHouseDetail, onOpenHouseEdit,
}: ManagerViewProps) {
  const homeData = useHomeData(properties);
  const homeTasks = useHomeTasks(currentUser, activeRole, isSuperAdmin);
  const { pending: pendingActionIds, run: runPendingAction } = usePendingById();
  const [isShowingAllJobs, setIsShowingAllJobs] = useState(false);
  const [isJobsTableOpen, setIsJobsTableOpen] = useState(true);

  const getModulePermission = (module: string) =>
    activeRole?.permissions?.find((permission) => permission.module === module);
  const canEditHouses = isSuperAdmin || !!getModulePermission('Houses')?.canEdit;
  const canInspect = isSuperAdmin || !!getModulePermission('Quality Check')?.canEdit;
  const currentUserFullName = fullName(currentUser);

  // ---- Reloj ----
  const openClockEntry = currentUser ? openEntryOf(homeData.clock, currentUser.id) : undefined;
  const hoursThisWeek = currentUser ? weekHours(homeData.clock, currentUser.id, homeData.now) : 0;
  const handleToggleClock = () => {
    if (!currentUser) return;
    runPendingAction(
      CLOCK_ACTION_ID,
      () => (openClockEntry
        ? timeClockService.clockOut(openClockEntry.id)
        : timeClockService.clockIn(currentUser.id, currentUserFullName)),
      'No se pudo registrar la hora. Revisa tu conexión e inténtalo de nuevo.',
    );
  };

  // ---- Tareas pendientes (Task list) ----
  // Scope "All": las de los gerentes (y las propias). "Own": solo las propias
  // (el listener ya trae solo esas).
  const currentUserId = currentUser?.id ?? '';
  const todayIsoDate = todayIso();
  const managerIds = useMemo(() => new Set(homeData.managers.map((user) => user.id)), [homeData.managers]);
  const visibleOpenTasks = useMemo(
    () => (homeTasks.rights.seesAll
      ? homeTasks.tasks.filter((task) =>
        task.assignees.some((assignee) => assignee.userId === currentUserId || managerIds.has(assignee.userId)))
      : homeTasks.tasks),
    [homeTasks.tasks, homeTasks.rights.seesAll, managerIds, currentUserId],
  );
  const overdueTasks = visibleOpenTasks.filter((task) => sectionOf(task.dueDate, todayIsoDate) === 'overdue');

  // ---- Asignar equipo desde "Houses Today" ----
  const handleAssignTeam = (job: HomeJob, teamId: string) => {
    if (!teamId) return;
    runPendingAction(job.prop.id, async () => {
      await propertiesService.update(job.prop.id, { teamId });
      const team = homeData.teams.find((catalogTeam) => catalogTeam.id === teamId);
      void logActivity({
        action: 'update', module: 'Houses', user: currentUser, targetId: job.prop.id,
        targetLabel: `${job.client} · ${job.prop.address}`,
        changes: [{ field: 'teamId', before: job.teamName ?? '', after: team?.name ?? teamId }],
      });
    }, 'No se pudo asignar el equipo.');
  };

  // ---- QC rápido: "Pass" = el resultado "Invoice" de la inspección completa, sin checklist ----
  // Como en Quality Check, todo en un batch: el reporte aprobado, la casa a
  // "Quality Check" (salvo que ya esté en Invoice) con la factura liberada si
  // estaba retenida, y su status_history (de ahí salen las métricas).
  const handleQuickPass = (job: HomeJob) => {
    if (!window.confirm(`¿Marcar ${job.client} · ${job.prop.address} como aprobada (Pass)?\n\nSe guarda un reporte de QC aprobado sin checklist, igual que "Invoice" en la inspección completa: la casa pasa a Quality Check y se libera su factura si estaba retenida. Para revisar área por área usa la inspección completa.`)) return;
    const houseLabel = houseLogLabel(job.client, job.prop.address);
    runPendingAction(job.prop.id, async () => {
      const nowIso = new Date().toISOString();
      const { batch } = qualityChecks.saveBatch(null, {
        houseId: job.prop.id,
        date: todayIso(),
        address: job.prop.address,
        client: job.prop.client,
        team: job.teamName,
        status: 'Finished',
        result: 'passed',
        outcome: 'invoice',
        inspector: currentUserFullName,
        inspectorId: currentUserId,
        checkInAt: nowIso,
        checkOutAt: nowIso,
        durationMinutes: 0,
        selectedPlaces: [],
        qcData: {},
        passRate: null,
        passRateAnswered: 0,
        quickPass: true,
        createdAt: nowIso,
      });
      const qualityCheckStatusId = homeData.statuses
        .find((status) => isQualityCheckStatus(status.id, homeData.statuses))?.id ?? null;
      const targetStatusId = isInvoiceStatus(homeData.statuses, job.prop.statusId) ? null : qualityCheckStatusId;
      const isHouseMoved = addStatusChange(
        batch,
        job.prop,
        targetStatusId,
        { statuses: homeData.statuses, actor: currentUser, source: 'quality_check' },
        job.prop.invoiceHold ? { invoiceHold: false } : {},
      );
      await batch.commit();
      void logActivity({ action: 'create', module: 'Quality Check', user: currentUser, targetId: job.prop.id, targetLabel: houseLabel, detail: 'Pass rápido desde Manager' });
      if (isHouseMoved && targetStatusId) {
        afterStatusHistoryWrite();
        logStatusChange(job.prop, targetStatusId, {
          statuses: homeData.statuses, actor: currentUser, source: 'quality_check', module: 'Quality Check', label: houseLabel,
        });
      }
    }, 'No se pudo guardar el resultado: no se escribió nada (ni el reporte ni el status de la casa).');
  };

  // ---- "Your day in 30 seconds" ----
  const lateJobs = homeData.todayJobs.filter((job) => job.state === 'late');
  const jobsWithoutCrew = homeData.todayJobs.filter((job) => job.state === 'nocrew');
  const unscheduledRecalls = homeData.recalls.filter((recall) => recall.reclean === 'open');
  const dailyBriefLines: { tag: string; tone: string; text: string }[] = [];
  if (jobsWithoutCrew.length) {
    const job = jobsWithoutCrew[0];
    dailyBriefLines.push({ tag: 'First', tone: 'first', text: `The ${job.time ? `${job.time} ` : ''}${job.type.toLowerCase()} at ${job.client} has no crew. Assign it${job.time ? ` before ${job.time}` : ' today'}.` });
  } else if (overdueTasks.length) {
    const task = overdueTasks[0];
    const requesterFirstName = isOnlyAssignee(task, task.createdByUserId) ? '' : getFirstName(task.createdByUserName);
    dailyBriefLines.push({ tag: 'First', tone: 'first', text: `“${task.title}” is overdue${requesterFirstName ? ` — ${requesterFirstName} asked for it` : ''}.` });
  } else if (unscheduledRecalls.length) {
    dailyBriefLines.push({ tag: 'First', tone: 'first', text: `${unscheduledRecalls[0].client} failed QC and the re-clean isn't scheduled yet.` });
  }
  dailyBriefLines.push({
    tag: 'Jobs', tone: 'jobs',
    text: homeData.todayJobs.length === 0
      ? 'No cleanings scheduled today.'
      : `You dispatch ${homeData.todayJobs.length} cleaning${homeData.todayJobs.length === 1 ? '' : 's'} today.${lateJobs.length ? ` ${lateJobs.length} crew${lateJobs.length === 1 ? ' is' : 's are'} late to start.` : ''}${jobsWithoutCrew.length ? ` ${jobsWithoutCrew.length} without a crew.` : ''}`,
  });
  if (homeTasks.canView) dailyBriefLines.push({
    tag: 'Tasks', tone: 'tasks',
    text: overdueTasks.length
      ? `${overdueTasks.length} task${overdueTasks.length === 1 ? ' is' : 's are'} overdue: ${overdueTasks.map((task) => task.title.toLowerCase()).slice(0, 2).join('; ')}.`
      : visibleOpenTasks.length ? `${visibleOpenTasks.length} open task${visibleOpenTasks.length === 1 ? '' : 's'}, none overdue.` : 'No open tasks.',
  });
  dailyBriefLines.push({
    tag: 'QC', tone: 'qc',
    text: `${homeData.waitingQc.length} house${homeData.waitingQc.length === 1 ? '' : 's'} wait${homeData.waitingQc.length === 1 ? 's' : ''} for inspection.`
      + (homeData.recalls.length ? ` ${homeData.recalls.length} on recall${unscheduledRecalls.length ? `; ${unscheduledRecalls.length} re-clean${unscheduledRecalls.length === 1 ? " isn't" : "s aren't"} scheduled yet` : ''}.` : ''),
  });

  // ---- All jobs (hoy) ----
  const jobRows = homeData.todayJobs.map((job) => {
    const qc = qcInfoFor(job.prop.id, job.prop.statusId, homeData.statuses, homeData.latestQc);
    const financials = homeData.fin.calc(job.prop);
    const insight = jobInsight({
      statusName: job.statusName, teamName: job.teamName || null, client: job.client,
      dateLabel: formatDate(job.prop.scheduleDate), isPast: false, isDuplicate: false,
      qc, billing: String(job.prop.invoiceStatus ?? ''), fin: financials,
    });
    return { job, qc, insight };
  });
  const actionNeededCount = jobRows.filter((row) => row.insight.tag === 'Action needed').length;
  const visibleJobRows = isShowingAllJobs ? jobRows : jobRows.slice(0, JOBS_PAGE_SIZE);

  // Texto de la lista de tareas cuando no hay filas (o no se pudieron cargar).
  const taskEmptyText = (() => {
    if (homeTasks.error) return 'Could not load the tasks.';
    if (!homeTasks.loaded) return 'Loading tasks…';
    return homeTasks.rights.seesAll ? 'No open tasks for managers.' : 'No tasks assigned to you. Enjoy the quiet.';
  })();

  return (
    <div className="fade-in hm-page">
      <HomeHeader
        title={`${greeting(homeData.now)}, ${currentUser?.firstName || 'there'}`}
        subtitle={headerDate(homeData.now)}
        onOpenMenu={onOpenMenu}
      />

      <div className="hm-grid hm-grid-top">
        <section className="hm-brief" aria-label="Your day in 30 seconds">
          <h2 className="hm-brief-title"><Sparkles size={18} /> Your day in 30 seconds</h2>
          <ul className="hm-brief-list">
            {dailyBriefLines.map((line) => (
              <li key={line.tag} className="hm-brief-line">
                <span className={`hm-btag ${line.tone}`}>{line.tag}</span>
                <span>{line.text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="hm-card hm-shift" aria-label="My shift">
          <h2 className="hm-card-title">My shift</h2>
          {openClockEntry ? (
            <p className="hm-clock on"><span className="hm-dot on" /> Clocked in since {fmtClock(openClockEntry.inAt)}</p>
          ) : (
            <p className="hm-clock"><span className="hm-dot" /> Not clocked in</p>
          )}
          <p className="hm-muted">{hoursThisWeek} h this week</p>
          <button
            type="button"
            className={`hm-clock-btn${openClockEntry ? ' out' : ''}`}
            disabled={!currentUser || pendingActionIds.has(CLOCK_ACTION_ID)}
            onClick={handleToggleClock}
          >
            {openClockEntry ? 'Clock out' : 'Clock in'}
          </button>
        </section>
      </div>

      <div className="hm-grid hm-grid-wide">
        {homeTasks.canView && (
          <section className="hm-card" aria-label={homeTasks.rights.seesAll ? 'Manager tasks' : 'My tasks'}>
            <div className="hm-card-head">
              <h2 className="hm-card-title">{homeTasks.rights.seesAll ? 'Manager tasks' : 'My tasks'}</h2>
              <span className="hm-muted">{homeTasks.loaded ? `${visibleOpenTasks.length} open` : '…'}</span>
            </div>
            <TaskChecklist
              tasks={visibleOpenTasks}
              today={todayIsoDate}
              meId={currentUserId}
              showAssignee={homeTasks.rights.seesAll}
              busyId={homeTasks.actions.busyId}
              canComplete={!!currentUser}
              onComplete={homeTasks.actions.complete}
              emptyText={taskEmptyText}
            />
          </section>
        )}

        <section className="hm-card" aria-label="Houses today">
          <div className="hm-card-head">
            <h2 className="hm-card-title">Houses Today</h2>
            <span className="hm-muted">{homeData.todayJobs.length} jobs</span>
          </div>
          {homeData.todayJobs.length === 0 ? <p className="hm-empty">No houses scheduled today.</p> : (
            <ul className="hm-scroll-list hm-today">
              {homeData.todayJobs.map((job) => (
                <li key={job.prop.id} className={`hm-slot${job.state === 'nocrew' ? ' alert' : ''}`}>
                  <span className="hm-slot-time">{job.time || '—'}</span>
                  <button type="button" className="hm-slot-main" onClick={() => onOpenHouseDetail(job.prop)}>
                    <span className="hm-slot-title">{job.client}</span>
                    <span className="hm-slot-sub">{job.prop.address}</span>
                    <span className={`hm-slot-sub${job.state === 'nocrew' ? ' warn' : ''}`}>
                      {job.state === 'nocrew' ? 'No crew assigned' : [job.type, job.teamName].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                  {job.state === 'nocrew' && canEditHouses ? (
                    <select
                      className="hm-assign"
                      value=""
                      disabled={pendingActionIds.has(job.prop.id)}
                      aria-label={`Assign crew to ${job.client}`}
                      onChange={(event) => handleAssignTeam(job, event.target.value)}
                    >
                      <option value="">Assign</option>
                      {homeData.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                    </select>
                  ) : (
                    <span className={`hm-pill ${JOB_STATE_TONE[job.state]}`}>{TODAY_STATE_LABEL[job.state]}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="hm-grid hm-grid-wide">
        <section className="hm-card" aria-label="Quality check">
          <div className="hm-card-head">
            <h2 className="hm-card-title"><ClipboardCheck size={18} className="hm-ic qc" /> Quality check</h2>
            <span className="hm-muted">{homeData.waitingQc.length} waiting</span>
          </div>
          {homeData.waitingQc.length === 0 ? <p className="hm-empty">Nothing waiting for inspection.</p> : (
            <ul className="hm-qc hm-scroll-list">
              {homeData.waitingQc.map((job) => (
                <li key={job.prop.id} className="hm-qc-row">
                  <button type="button" className="hm-qc-main" onClick={() => onOpenHouseDetail(job.prop)}>
                    <span className="hm-slot-title">{job.client} · {job.prop.address}</span>
                    <span className="hm-slot-sub">
                      {[job.type, job.prop.employeeFinishedAt ? `finished ${getFinishedLabel(job.prop.employeeFinishedAt, homeData.today)}` : job.statusName].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                  <TeamPill name={job.teamName} color={job.teamColor} />
                  {canInspect && (
                    <span className="hm-qc-actions">
                      <button type="button" className="hm-btn pass" disabled={pendingActionIds.has(job.prop.id)} onClick={() => handleQuickPass(job)}>Pass</button>
                      {onOpenInspection && (
                        <button type="button" className="fail hm-btn" onClick={() => onOpenInspection(job.prop)} title="Abre la inspección completa">Did not pass</button>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="hm-card hm-recall-card" aria-label="On recall">
          <div className="hm-card-head">
            <h2 className="hm-card-title"><RotateCcw size={18} className="bad hm-ic" /> On recall</h2>
            {homeData.recalls.length > 0 && <span className="bad hm-pill">{homeData.recalls.length} open</span>}
          </div>
          {homeData.recalls.length === 0 ? <p className="hm-empty">No houses on recall.</p> : (
            <ul className="hm-recalls hm-scroll-list">
              {homeData.recalls.map((recall) => (
                <li key={recall.prop.id} className="hm-recall">
                  <div className="hm-recall-top">
                    <button type="button" className="hm-link-title" onClick={() => onOpenHouseDetail(recall.prop)}>
                      {recall.client} · {recall.prop.address}
                    </button>
                    <TeamPill name={recall.teamName} color={recall.teamColor} />
                  </div>
                  {recall.failed.length > 0 && <p className="hm-recall-failed">Failed: {recall.failed.join(', ').toLowerCase()}</p>}
                  <p className={`hm-recall-detail ${recall.reclean}`}>{recall.detail}</p>
                  {recall.reclean === 'open' && canEditHouses && (
                    <button type="button" className="danger hm-btn" onClick={() => onOpenHouseEdit(recall.prop)}>Schedule re-clean</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {homeTasks.actions.undo && <UndoToast title={homeTasks.actions.undo.task.title} onUndo={homeTasks.actions.undoComplete} />}

      <section className="hm-card hm-jobs" aria-label="All jobs today">
        <h2 className="hm-card-title hm-jobs-title">All jobs</h2>
        <button type="button" className="hm-jobs-group" aria-expanded={isJobsTableOpen} onClick={() => setIsJobsTableOpen((isOpen) => !isOpen)}>
          <span className="hm-jobs-group-title">
            {isJobsTableOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {groupByDate([homeData.today], (item) => item, 'day')[0]?.label}
            <span className="hm-count">{jobRows.length} jobs</span>
          </span>
          {actionNeededCount > 0 && <span className="hm-jobs-ai"><Sparkles size={13} /> {actionNeededCount} need action</span>}
        </button>
        {isJobsTableOpen && (
          <div className="hm-table-scroll">
            <table className="hm-table">
              <thead>
                <tr>
                  <th>Date</th><th>Client</th><th>Service</th><th>Team</th><th>Status</th><th>QC</th><th>Billing</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleJobRows.length === 0 ? (
                  <tr><td colSpan={8} className="hm-empty-cell">No jobs today.</td></tr>
                ) : visibleJobRows.map(({ job, qc, insight }) => (
                  <tr key={job.prop.id} className="hm-row" onClick={() => onOpenHouseDetail(job.prop)}>
                    <td><div className="strong">{formatDate(job.prop.scheduleDate)}</div><div className="hm-muted">{job.time}</div></td>
                    <td className="hm-client">
                      <div className="strong">{job.client}</div>
                      <div className="hm-muted">{job.prop.address}</div>
                      {job.prop.note && <div className="hm-ellipsis hm-muted">{job.prop.note}</div>}
                    </td>
                    <td>{job.type}</td>
                    <td>{job.teamName ? <TeamPill name={job.teamName} color={job.teamColor} /> : <span className="hm-muted">Unassigned</span>}</td>
                    <td><span className="hm-status" style={{ '--st-color': job.statusColor } as CSSProperties}>{job.statusName || '—'}</span></td>
                    <td>{qc.state === 'none' ? <span className="hm-muted">—</span> : <span className={`hm-pill ${qc.tone}`}>{qc.label}</span>}</td>
                    <td>{job.prop.invoiceStatus ? <span className={`hm-pill ${BILLING_TONE[String(job.prop.invoiceStatus).toLowerCase()] ?? 'muted'}`}>{job.prop.invoiceStatus}</span> : <span className="hm-muted">—</span>}</td>
                    <td className="hm-action">
                      <span className={`hm-atag ${INSIGHT_TONE[insight.tag]}`}>{insight.tag}</span>
                      <div>{insight.text}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {isJobsTableOpen && jobRows.length > JOBS_PAGE_SIZE && (
          <button type="button" className="hm-more" onClick={() => setIsShowingAllJobs((isShowing) => !isShowing)}>
            {isShowingAllJobs ? 'Show less' : `Show all ${jobRows.length} jobs`}
          </button>
        )}
      </section>
    </div>
  );
}

/** "10:40" si terminó hoy; "yesterday" o la fecha si fue antes. */
function getFinishedLabel(finishedIso: string, today: Date): string {
  const finishedAt = new Date(finishedIso);
  if (Number.isNaN(finishedAt.getTime())) return '';
  const daysAgo = Math.round((today.getTime() - startOfDay(finishedAt).getTime()) / 86400000);
  if (daysAgo <= 0) return finishedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (daysAgo === 1) return 'yesterday';
  return formatDate(finishedAt);
}
