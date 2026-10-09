// ============================================================================
// ⭐ MANAGER — la página de inicio del gerente (diseño "Manager" que pasó el
//    usuario). Todo es del día de hoy y del gerente que la abre:
//      · "Your day in 30 seconds": lo primero que hay que atender, trabajos,
//        tareas y QC (reglas automáticas sobre los datos reales)
//      · My shift: reloj de entrada/salida y horas de la semana
//      · My tasks: tareas que le asignó el Owner (las marca hechas aquí)
//      · Houses Today: trabajos de hoy por hora; si no tienen equipo se
//        asigna ahí mismo
//      · Quality check: casas que esperan inspección (Pass rápido o
//        inspección completa si no pasó)
//      · On recall: casas en Recall y si su re-clean ya está agendado
//      · All jobs: tabla de hoy con la acción sugerida
//    Las reglas viven en src/utils/homeData.ts.
// ============================================================================
import { useMemo, useState, type CSSProperties } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { ChevronDown, ChevronRight, ClipboardCheck, RotateCcw, Sparkles } from 'lucide-react';
import { db } from '../config/firebase';
import type { Property, Role, SystemUser } from '../types/index';
import HomeHeader, { type HomeTab } from '../components/HomeHeader';
import TaskChecklist from '../components/TaskChecklist';
import {
  fullName, greeting, headerDate, startOfDay, TODAY_STATE_LABEL, useHomeData, type HomeJob,
} from '../utils/homeData';
import { isTaskOverdue, managerTasksService, type ManagerTask } from '../services/managerTasksService';
import { fmtClock, openEntryOf, timeClockService, weekHours } from '../services/timeClockService';
import { propertiesService } from '../services/propertiesService';
import { logActivity } from '../services/activityLogService';
import { qcInfoFor } from '../utils/jobQuality';
import { jobInsight } from '../utils/jobInsights';
import { formatDate } from '../utils/dateFormat';
import { groupByDate } from '../utils/dateGrouping';
import './HomeViews.css';

interface Props {
  onOpenMenu: () => void;
  properties: Property[];
  currentUser: SystemUser | null;
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
  available: HomeTab[];
  onSwitch: (tab: HomeTab) => void;
  /** Abre la inspección completa en Quality Check. */
  onInspect?: (p: Property) => void;
  onOpenHouseDetail: (p: Property) => void;
  onOpenHouseEdit: (p: Property) => void;
}

const BILLING_TONE: Record<string, string> = { 'needs invoice': 'warn', pending: 'info', paid: 'good', 'pre-paid': 'good' };
const INSIGHT_TONE: Record<string, string> = { 'Action needed': 'bad', 'Follow up': 'warn', 'All good': 'good' };
const STATE_TONE: Record<string, string> = { done: 'good', progress: 'good', late: 'warn', scheduled: 'muted', nocrew: 'warn' };
const JOBS_PAGE = 5;

export default function ManagerView({
  onOpenMenu, properties, currentUser, activeRole, isSuperAdmin = false, available, onSwitch,
  onInspect, onOpenHouseDetail, onOpenHouseEdit,
}: Props) {
  const d = useHomeData(properties);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAllJobs, setShowAllJobs] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(true);

  const perm = (module: string) => activeRole?.permissions?.find((p) => p.module === module);
  const canEditHouses = isSuperAdmin || !!perm('Houses')?.canEdit;
  const canInspect = isSuperAdmin || !!perm('Quality Check')?.canEdit;
  const me = currentUser;
  const myName = fullName(me);

  // ---- Reloj ----
  const myOpen = me ? openEntryOf(d.clock, me.id) : undefined;
  const myHours = me ? weekHours(d.clock, me.id, d.now) : 0;
  const toggleClock = async () => {
    if (!me) return;
    setBusy('clock');
    try {
      if (myOpen) await timeClockService.clockOut(myOpen.id);
      else await timeClockService.clockIn(me.id, myName);
    } catch (e) {
      console.error('Error en el reloj:', e);
      alert('No se pudo registrar la hora. Revisa tu conexión e inténtalo de nuevo.');
    } finally { setBusy(null); }
  };

  // ---- Tareas ----
  const myTasks = useMemo(() => {
    const twoDaysAgo = d.now.getTime() - 2 * 86400000;
    return d.tasks
      .filter((t) => me && t.assigneeId === me.id)
      .filter((t) => !t.done || new Date(t.doneAt || 0).getTime() > twoDaysAgo)
      .sort((a, b) =>
        Number(a.done) - Number(b.done)
        || Number(isTaskOverdue(b, d.now)) - Number(isTaskOverdue(a, d.now))
        || String(a.dueAt || '9').localeCompare(String(b.dueAt || '9')));
  }, [d.tasks, me, d.now]);
  const openTasks = myTasks.filter((t) => !t.done);
  const overdueTasks = openTasks.filter((t) => isTaskOverdue(t, d.now));
  const toggleTask = async (t: ManagerTask) => {
    if (!me) return;
    try { await managerTasksService.setDone(t.id, !t.done, me.id); }
    catch (e) { console.error('Error al marcar la tarea:', e); alert('No se pudo actualizar la tarea.'); }
  };

  // ---- Asignar equipo desde "Houses Today" ----
  const assignTeam = async (job: HomeJob, teamId: string) => {
    if (!teamId) return;
    setBusy(job.prop.id);
    try {
      await propertiesService.update(job.prop.id, { teamId });
      const t = d.teams.find((x) => x.id === teamId);
      void logActivity({
        action: 'update', module: 'Houses', user: me, targetId: job.prop.id,
        targetLabel: `${job.client} · ${job.prop.address}`,
        changes: [{ field: 'teamId', before: job.teamName || '', after: t?.name || teamId }],
      });
    } catch (e) {
      console.error('Error asignando equipo:', e);
      alert('No se pudo asignar el equipo.');
    } finally { setBusy(null); }
  };

  // ---- QC rápido: "Pass" guarda un reporte aprobado sin checklist ----
  const quickPass = async (job: HomeJob) => {
    if (!window.confirm(`¿Marcar ${job.client} · ${job.prop.address} como aprobada (Pass)?\n\nSe guarda un reporte de QC aprobado sin checklist. Para revisar área por área usa la inspección completa.`)) return;
    setBusy(job.prop.id);
    const nowIso = new Date().toISOString();
    try {
      await addDoc(collection(db, 'quality_checks'), {
        houseId: job.prop.id,
        date: nowIso.split('T')[0],
        address: job.prop.address,
        client: job.prop.client,
        team: job.teamName,
        status: 'Finished',
        result: 'passed',
        inspector: myName,
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
      void logActivity({ action: 'create', module: 'Quality Check', user: me, targetId: job.prop.id, targetLabel: `${job.client} · ${job.prop.address}`, detail: 'Pass rápido desde Manager' });
    } catch (e) {
      console.error('Error guardando el QC:', e);
      alert('No se pudo guardar el resultado.');
    } finally { setBusy(null); }
  };

  // ---- "Your day in 30 seconds" ----
  const late = d.todayJobs.filter((j) => j.state === 'late');
  const noCrew = d.todayJobs.filter((j) => j.state === 'nocrew');
  const openRecalls = d.recalls.filter((r) => r.reclean === 'open');
  const brief: { tag: string; tone: string; text: string }[] = [];
  if (noCrew.length) {
    const j = noCrew[0];
    brief.push({ tag: 'First', tone: 'first', text: `The ${j.time ? `${j.time} ` : ''}${j.type.toLowerCase()} at ${j.client} has no crew. Assign it${j.time ? ` before ${j.time}` : ' today'}.` });
  } else if (overdueTasks.length) {
    brief.push({ tag: 'First', tone: 'first', text: `“${overdueTasks[0].title}” is overdue${overdueTasks[0].createdByName ? ` — ${overdueTasks[0].createdByName} asked for it` : ''}.` });
  } else if (openRecalls.length) {
    brief.push({ tag: 'First', tone: 'first', text: `${openRecalls[0].client} failed QC and the re-clean isn't scheduled yet.` });
  }
  brief.push({
    tag: 'Jobs', tone: 'jobs',
    text: d.todayJobs.length === 0
      ? 'No cleanings scheduled today.'
      : `You dispatch ${d.todayJobs.length} cleaning${d.todayJobs.length === 1 ? '' : 's'} today.${late.length ? ` ${late.length} crew${late.length === 1 ? ' is' : 's are'} late to start.` : ''}${noCrew.length ? ` ${noCrew.length} without a crew.` : ''}`,
  });
  brief.push({
    tag: 'Tasks', tone: 'tasks',
    text: overdueTasks.length
      ? `${overdueTasks.length} task${overdueTasks.length === 1 ? ' is' : 's are'} overdue: ${overdueTasks.map((t) => t.title.toLowerCase()).slice(0, 2).join('; ')}.`
      : openTasks.length ? `${openTasks.length} open task${openTasks.length === 1 ? '' : 's'}, none overdue.` : 'No open tasks.',
  });
  brief.push({
    tag: 'QC', tone: 'qc',
    text: `${d.waitingQc.length} house${d.waitingQc.length === 1 ? '' : 's'} wait${d.waitingQc.length === 1 ? 's' : ''} for inspection.`
      + (d.recalls.length ? ` ${d.recalls.length} on recall${openRecalls.length ? `; ${openRecalls.length} re-clean${openRecalls.length === 1 ? " isn't" : "s aren't"} scheduled yet` : ''}.` : ''),
  });

  // ---- All jobs (hoy) ----
  const jobRows = d.todayJobs.map((j) => {
    const qc = qcInfoFor(j.prop.id, j.prop.statusId, d.statuses, d.latestQc);
    const fin = d.fin.calc(j.prop);
    const insight = jobInsight({
      statusName: j.statusName, teamName: j.teamName || null, client: j.client,
      dateLabel: formatDate(j.prop.scheduleDate), isPast: false, isDuplicate: false,
      qc, billing: String(j.prop.invoiceStatus || ''), fin,
    });
    return { j, qc, insight };
  });
  const needAction = jobRows.filter((r) => r.insight.tag === 'Action needed').length;
  const shownRows = showAllJobs ? jobRows : jobRows.slice(0, JOBS_PAGE);

  const teamPill = (name: string, color: string) =>
    name ? <span className="hm-team" style={{ '--team-color': color } as CSSProperties}>{name}</span> : null;

  return (
    <div className="fade-in hm-page">
      <HomeHeader
        title={`${greeting(d.now)}, ${me?.firstName || 'there'}`}
        subtitle={headerDate(d.now)}
        active="manager"
        available={available}
        onSwitch={onSwitch}
        onOpenMenu={onOpenMenu}
      />

      <div className="hm-grid hm-grid-top">
        <section className="hm-brief" aria-label="Your day in 30 seconds">
          <h2 className="hm-brief-title"><Sparkles size={18} /> Your day in 30 seconds</h2>
          <ul className="hm-brief-list">
            {brief.map((b) => (
              <li key={b.tag} className="hm-brief-line">
                <span className={`hm-btag ${b.tone}`}>{b.tag}</span>
                <span>{b.text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="hm-card hm-shift" aria-label="My shift">
          <h2 className="hm-card-title">My shift</h2>
          {myOpen ? (
            <p className="hm-clock on"><span className="hm-dot on" /> Clocked in since {fmtClock(myOpen.inAt)}</p>
          ) : (
            <p className="hm-clock"><span className="hm-dot" /> Not clocked in</p>
          )}
          <p className="hm-muted">{myHours} h this week</p>
          <button
            type="button"
            className={`hm-clock-btn${myOpen ? ' out' : ''}`}
            disabled={!me || busy === 'clock'}
            onClick={toggleClock}
          >
            {myOpen ? 'Clock out' : 'Clock in'}
          </button>
        </section>
      </div>

      <div className="hm-grid hm-grid-wide">
        <section className="hm-card" aria-label="My tasks">
          <div className="hm-card-head">
            <h2 className="hm-card-title">My tasks</h2>
            <span className="hm-muted">{openTasks.length} open</span>
          </div>
          <TaskChecklist
            tasks={myTasks}
            now={d.now}
            meta="author"
            canToggle={() => !!me}
            onToggle={toggleTask}
            emptyText="No tasks assigned to you. Enjoy the quiet."
          />
        </section>

        <section className="hm-card" aria-label="Houses today">
          <div className="hm-card-head">
            <h2 className="hm-card-title">Houses Today</h2>
            <span className="hm-muted">{d.todayJobs.length} jobs</span>
          </div>
          {d.todayJobs.length === 0 ? <p className="hm-empty">No houses scheduled today.</p> : (
            <ul className="hm-today hm-scroll-list">
              {d.todayJobs.map((j) => (
                <li key={j.prop.id} className={`hm-slot${j.state === 'nocrew' ? ' alert' : ''}`}>
                  <span className="hm-slot-time">{j.time || '—'}</span>
                  <button type="button" className="hm-slot-main" onClick={() => onOpenHouseDetail(j.prop)}>
                    <span className="hm-slot-title">{j.client}</span>
                    <span className="hm-slot-sub">{j.prop.address}</span>
                    <span className={`hm-slot-sub${j.state === 'nocrew' ? ' warn' : ''}`}>
                      {j.state === 'nocrew' ? 'No crew assigned' : [j.type, j.teamName].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                  {j.state === 'nocrew' && canEditHouses ? (
                    <select
                      className="hm-assign"
                      value=""
                      disabled={busy === j.prop.id}
                      aria-label={`Assign crew to ${j.client}`}
                      onChange={(e) => assignTeam(j, e.target.value)}
                    >
                      <option value="">Assign</option>
                      {d.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  ) : (
                    <span className={`hm-pill ${STATE_TONE[j.state]}`}>{TODAY_STATE_LABEL[j.state]}</span>
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
            <span className="hm-muted">{d.waitingQc.length} waiting</span>
          </div>
          {d.waitingQc.length === 0 ? <p className="hm-empty">Nothing waiting for inspection.</p> : (
            <ul className="hm-qc hm-scroll-list">
              {d.waitingQc.map((j) => (
                <li key={j.prop.id} className="hm-qc-row">
                  <button type="button" className="hm-qc-main" onClick={() => onOpenHouseDetail(j.prop)}>
                    <span className="hm-slot-title">{j.client} · {j.prop.address}</span>
                    <span className="hm-slot-sub">
                      {[j.type, j.prop.employeeFinishedAt ? `finished ${finishedLabel(j.prop.employeeFinishedAt, d.today)}` : j.statusName].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                  {teamPill(j.teamName, j.teamColor)}
                  {canInspect && (
                    <span className="hm-qc-actions">
                      <button type="button" className="hm-btn pass" disabled={busy === j.prop.id} onClick={() => quickPass(j)}>Pass</button>
                      {onInspect && (
                        <button type="button" className="hm-btn fail" onClick={() => onInspect(j.prop)} title="Abre la inspección completa">Did not pass</button>
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
            <h2 className="hm-card-title"><RotateCcw size={18} className="hm-ic bad" /> On recall</h2>
            {d.recalls.length > 0 && <span className="hm-pill bad">{d.recalls.length} open</span>}
          </div>
          {d.recalls.length === 0 ? <p className="hm-empty">No houses on recall.</p> : (
            <ul className="hm-recalls hm-scroll-list">
              {d.recalls.map((r) => (
                <li key={r.prop.id} className="hm-recall">
                  <div className="hm-recall-top">
                    <button type="button" className="hm-link-title" onClick={() => onOpenHouseDetail(r.prop)}>
                      {r.client} · {r.prop.address}
                    </button>
                    {teamPill(r.teamName, r.teamColor)}
                  </div>
                  {r.failed.length > 0 && <p className="hm-recall-failed">Failed: {r.failed.join(', ').toLowerCase()}</p>}
                  <p className={`hm-recall-detail ${r.reclean}`}>{r.detail}</p>
                  {r.reclean === 'open' && canEditHouses && (
                    <button type="button" className="hm-btn danger" onClick={() => onOpenHouseEdit(r.prop)}>Schedule re-clean</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="hm-card hm-jobs" aria-label="All jobs today">
        <h2 className="hm-card-title hm-jobs-title">All jobs</h2>
        <button type="button" className="hm-jobs-group" aria-expanded={jobsOpen} onClick={() => setJobsOpen((o) => !o)}>
          <span className="hm-jobs-group-title">
            {jobsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {groupByDate([d.today], (x) => x, 'day')[0]?.label}
            <span className="hm-count">{jobRows.length} jobs</span>
          </span>
          {needAction > 0 && <span className="hm-jobs-ai"><Sparkles size={13} /> {needAction} need action</span>}
        </button>
        {jobsOpen && (
          <div className="hm-table-scroll">
            <table className="hm-table">
              <thead>
                <tr>
                  <th>Date</th><th>Client</th><th>Service</th><th>Team</th><th>Status</th><th>QC</th><th>Billing</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {shownRows.length === 0 ? (
                  <tr><td colSpan={8} className="hm-empty-cell">No jobs today.</td></tr>
                ) : shownRows.map(({ j, qc, insight }) => (
                  <tr key={j.prop.id} className="hm-row" onClick={() => onOpenHouseDetail(j.prop)}>
                    <td><div className="strong">{formatDate(j.prop.scheduleDate)}</div><div className="hm-muted">{j.time}</div></td>
                    <td className="hm-client">
                      <div className="strong">{j.client}</div>
                      <div className="hm-muted">{j.prop.address}</div>
                      {j.prop.note && <div className="hm-muted hm-ellipsis">{j.prop.note}</div>}
                    </td>
                    <td>{j.type}</td>
                    <td>{teamPill(j.teamName, j.teamColor) || <span className="hm-muted">Unassigned</span>}</td>
                    <td><span className="hm-status" style={{ '--st-color': j.statusColor } as CSSProperties}>{j.statusName || '—'}</span></td>
                    <td>{qc.state === 'none' ? <span className="hm-muted">—</span> : <span className={`hm-pill ${qc.tone}`}>{qc.label}</span>}</td>
                    <td>{j.prop.invoiceStatus ? <span className={`hm-pill ${BILLING_TONE[String(j.prop.invoiceStatus).toLowerCase()] || 'muted'}`}>{j.prop.invoiceStatus}</span> : <span className="hm-muted">—</span>}</td>
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
        {jobsOpen && jobRows.length > JOBS_PAGE && (
          <button type="button" className="hm-more" onClick={() => setShowAllJobs((s) => !s)}>
            {showAllJobs ? 'Show less' : `Show all ${jobRows.length} jobs`}
          </button>
        )}
      </section>
    </div>
  );
}

/** "10:40" si terminó hoy; "yesterday" o la fecha si fue antes. */
function finishedLabel(iso: string, today: Date): string {
  const f = new Date(iso);
  if (isNaN(f.getTime())) return '';
  const days = Math.round((today.getTime() - startOfDay(f).getTime()) / 86400000);
  if (days <= 0) return f.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'yesterday';
  return formatDate(f);
}
