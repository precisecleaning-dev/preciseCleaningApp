// ============================================================================
// ⭐ OWNER — la página de inicio del dueño (diseño "Owner" que pasó el
//    usuario). Vista de toda la empresa:
//      · "Your day in 30 seconds": dinero, trabajos, equipo y QC, cada uno con
//        su acción (reglas automáticas sobre los datos reales, no IA)
//      · Indicadores: ingresos del mes, facturas sin cobrar, trabajos de hoy,
//        cola de QC, utilidad bruta del mes y payroll de la semana
//      · Open tasks: las tareas pendientes del Task list (todas, o solo las
//        propias si el Scope de Task List en Roles es "Own"). Aquí solo se
//        ven y se marcan hechas; se crean y editan en el Task list
//      · Today's time: el día por hora + quién está trabajando ahora
//      · Finance: números del mes salidos de la app y facturas más viejas
//    Banco y gastos no se muestran: la app no tiene esos datos (decisión del
//    usuario, 10/2026). Las reglas viven en src/utils/homeData.ts.
// ============================================================================
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { Sparkles } from 'lucide-react';
import type { TabOptions } from '../App';
import type { TaskAssignee, Property, Role, SystemUser } from '../types/index';
import HomeHeader from '../components/HomeHeader';
import TaskChecklist from '../components/TaskChecklist';
import {
  fullName, greeting, headerDate, moneyShort, startOfDay, useHomeData, type HomeJob,
} from '../utils/homeData';
import { useHomeTasks } from '../features/ops/hooks/useHomeTasks';
import { sectionOf } from '../features/ops/opsDates';
import { getFirstName, namesSummary } from '../features/ops/opsOptions';
import { isAssignee } from '../features/ops/opsPermissions';
import UndoToast from '../features/ops/components/UndoToast';
import { fmtClock, openEntryOf, weekHours, weekStart } from '../services/timeClockService';
import { toDate } from '../utils/dateGrouping';
import { pct } from '../utils/jobFinancials';
import { todayIso } from '../utils/dateFormat';
import './HomeViews.css';

interface OwnerViewProps {
  onOpenMenu: () => void;
  properties: Property[];
  currentUser: SystemUser | null;
  activeRole: Role | null;
  isSuperAdmin: boolean;
  /** Ir a otra vista de la app (Invoices, Overview, QC Dashboard, Task list…). */
  onNavigate: (tab: Extract<TabOptions, 'invoices' | 'houses' | 'qc_dashboard' | 'task_list'>) => void;
  onOpenHouseDetail: (house: Property) => void;
}

interface TimelineItem {
  id: string;
  minutesFromMidnight: number;
  time: string;
  title: string;
  subtitle: string;
  tone: 'jobs' | 'task' | 'alert';
}

const DAY_MS = 86400000;

/** ¿La casa está agendada entre `rangeStart` (incluido) y `rangeEnd` (excluido)? */
const isScheduledInRange = (house: Property, rangeStart: Date, rangeEnd: Date) => {
  const scheduledTime = toDate(house.scheduleDate)?.getTime();
  return scheduledTime !== undefined && scheduledTime >= rangeStart.getTime() && scheduledTime < rangeEnd.getTime();
};

/** Nombre corto de una persona de la tarea ("You" si es uno mismo). */
const getAssigneeShortName = (assignee: TaskAssignee, currentUserId: string) =>
  (assignee.userId === currentUserId ? 'You' : getFirstName(assignee.userName) || 'Someone');

export default function OwnerView({
  onOpenMenu, properties, currentUser, activeRole, isSuperAdmin, onNavigate, onOpenHouseDetail,
}: OwnerViewProps) {
  const homeData = useHomeData(properties);
  const homeTasks = useHomeTasks(currentUser, activeRole, isSuperAdmin);
  const tasksSectionRef = useRef<HTMLElement | null>(null);
  const [assigneeFilterId, setAssigneeFilterId] = useState('all');

  const now = homeData.now;
  const currentUserId = currentUser?.id ?? '';

  // ---- Periodos (se recalculan cuando avanza el reloj de la pantalla) ----
  const {
    monthStart, previousMonthStart, previousMonthSameDayEnd, weekStartDate, weekEndDate, tomorrowStart,
  } = useMemo(() => {
    const weekStartOfNow = weekStart(now);
    const todayStart = startOfDay(now);
    // Mismo día del mes anterior, sin pasarse de los días que tuvo (el 31 de
    // marzo se compara con el 28 o 29 de febrero, no con el 3 de marzo).
    const previousMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    return {
      monthStart: new Date(now.getFullYear(), now.getMonth(), 1),
      previousMonthStart: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      previousMonthSameDayEnd: new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), previousMonthDays), 23, 59),
      weekStartDate: weekStartOfNow,
      weekEndDate: new Date(weekStartOfNow.getTime() + 7 * DAY_MS),
      tomorrowStart: new Date(todayStart.getTime() + DAY_MS),
    };
  }, [now]);

  // ---- Indicadores ----
  const sumFinancials = homeData.fin.sum;
  const kpis = useMemo(() => {
    const monthJobs = properties.filter((house) => isScheduledInRange(house, monthStart, tomorrowStart));
    const previousMonthJobs = properties.filter((house) => isScheduledInRange(house, previousMonthStart, previousMonthSameDayEnd));
    const weekJobs = properties.filter((house) => isScheduledInRange(house, weekStartDate, weekEndDate));
    const monthTotals = sumFinancials(monthJobs);
    const previousMonthTotals = sumFinancials(previousMonthJobs);
    const weekTotals = sumFinancials(weekJobs);
    const outstanding = homeData.unpaid.reduce((total, invoice) => total + invoice.amount, 0);
    const invoicesOver30Days = homeData.unpaid.filter((invoice) => invoice.days > 30);
    return {
      monthTotals,
      revenueChangePercent: previousMonthTotals.servicePrice > 0
        ? ((monthTotals.servicePrice - previousMonthTotals.servicePrice) / previousMonthTotals.servicePrice) * 100
        : null,
      outstanding,
      over30Total: invoicesOver30Days.reduce((total, invoice) => total + invoice.amount, 0),
      over30Count: invoicesOver30Days.length,
      weekPayroll: weekTotals.payroll,
      weekJobs: weekJobs.length,
    };
  }, [
    properties, sumFinancials, homeData.unpaid,
    monthStart, previousMonthStart, previousMonthSameDayEnd, weekStartDate, weekEndDate, tomorrowStart,
  ]);

  const jobsWithoutCrew = homeData.todayJobs.filter((job) => job.state === 'nocrew');
  const unscheduledRecalls = homeData.recalls.filter((recall) => recall.reclean === 'open');

  // ---- Tareas pendientes (Task list) ----
  const todayIsoDate = todayIso();
  const openTasks = homeTasks.tasks;
  const overdueTasks = useMemo(
    () => openTasks.filter((task) => sectionOf(task.dueDate, todayIsoDate) === 'overdue'),
    [openTasks, todayIsoDate],
  );
  // Atrasadas por persona: una tarea de varias personas cuenta para cada una.
  const overdueCountByAssignee = useMemo(() => {
    const countByName = new Map<string, number>();
    overdueTasks.forEach((task) => task.assignees.forEach((assignee) => {
      const name = getAssigneeShortName(assignee, currentUserId);
      countByName.set(name, (countByName.get(name) ?? 0) + 1);
    }));
    return [...countByName.entries()].sort((first, second) => second[1] - first[1]);
  }, [overdueTasks, currentUserId]);
  // Filtro por persona: quienes tienen tareas abiertas.
  const assigneeFilterOptions = useMemo(() => {
    const nameById = new Map<string, string>();
    openTasks.forEach((task) => task.assignees.forEach((assignee) => {
      nameById.set(assignee.userId, assignee.userId === currentUserId ? 'Me' : getFirstName(assignee.userName) || '—');
    }));
    return [...nameById.entries()].sort(([firstId, firstName], [secondId, secondName]) => {
      if (firstId === currentUserId) return -1;
      if (secondId === currentUserId) return 1;
      return firstName.localeCompare(secondName);
    });
  }, [openTasks, currentUserId]);
  // Si la persona elegida ya no tiene tareas abiertas (o ya no hay chips), el
  // filtro vuelve a "All": si no, la lista queda vacía sin botón para salir.
  const isAssigneeFilterAvailable = assigneeFilterOptions.length > 1
    && assigneeFilterOptions.some(([assigneeId]) => assigneeId === assigneeFilterId);
  const activeAssigneeFilterId = isAssigneeFilterAvailable ? assigneeFilterId : 'all';
  const visibleTasks = activeAssigneeFilterId === 'all'
    ? openTasks
    : openTasks.filter((task) => isAssignee(task, activeAssigneeFilterId));

  // ---- Your day in 30 seconds ----
  const largestOverdueInvoice = homeData.unpaid
    .filter((invoice) => invoice.days > 30)
    .sort((first, second) => second.amount - first.amount)[0];
  // linkTarget: la vista a la que lleva el enlace ('tasks_section' = la lista de tareas de esta página).
  const briefCards = [
    {
      tag: 'Money', tone: 'money',
      text: kpis.over30Count
        ? `${kpis.over30Count} invoice${kpis.over30Count === 1 ? ' is' : 's are'} past 30 days, ${moneyShort(kpis.over30Total)} total.${largestOverdueInvoice ? ` The biggest is ${largestOverdueInvoice.client}.` : ''}`
        : homeData.unpaid.length ? `${homeData.unpaid.length} invoices open (${moneyShort(kpis.outstanding)}), none past 30 days.` : 'Every completed job is paid.',
      link: 'Open invoices', linkTarget: 'invoices' as const,
    },
    {
      tag: 'Jobs', tone: 'jobs',
      text: homeData.todayJobs.length
        ? `${homeData.todayJobs.length} cleaning${homeData.todayJobs.length === 1 ? '' : 's'} today.${jobsWithoutCrew.length ? ` ${jobsWithoutCrew.length === 1 ? `The ${jobsWithoutCrew[0].time ? `${jobsWithoutCrew[0].time} ` : ''}job at ${jobsWithoutCrew[0].client} has` : `${jobsWithoutCrew.length} jobs have`} no crew assigned yet.` : ' Every job has a crew.'}`
        : 'No cleanings scheduled today.',
      link: jobsWithoutCrew.length ? 'Assign crew' : 'Open overview', linkTarget: 'houses' as const,
    },
    {
      tag: 'Team', tone: 'team',
      text: !homeTasks.canView
        ? 'Task List is off for your role (Roles & Permissions).'
        : overdueTasks.length
          ? `${overdueTasks.length} overdue task${overdueTasks.length === 1 ? '' : 's'}${overdueCountByAssignee[0] && overdueCountByAssignee.length > 1 ? `. ${overdueCountByAssignee[0][0]} ${overdueCountByAssignee[0][0] === 'You' ? 'have' : 'has'} ${overdueCountByAssignee[0][1]} of them` : overdueCountByAssignee[0] ? `, all ${overdueCountByAssignee[0][0] === 'You' ? 'yours' : `${overdueCountByAssignee[0][0]}'s`}` : ''}.`
          : `${openTasks.length} open task${openTasks.length === 1 ? '' : 's'}, none overdue.`,
      link: 'Review tasks', linkTarget: homeTasks.canView ? 'tasks_section' as const : 'task_list' as const,
    },
    {
      tag: 'QC', tone: 'qc',
      text: `${homeData.waitingQc.length} inspection${homeData.waitingQc.length === 1 ? '' : 's'} waiting.${homeData.recalls.length ? ` ${homeData.recalls.length} on recall${unscheduledRecalls.length ? `, ${unscheduledRecalls.length} not re-cleaned or scheduled` : ''}.` : ''}`,
      link: 'Open QC queue', linkTarget: 'qc_dashboard' as const,
    },
  ];

  const kpiTiles: { key: string; label: string; value: string; sub: string; tone: string }[] = [
    {
      key: 'rev', label: 'Revenue this month', value: moneyShort(kpis.monthTotals.servicePrice),
      sub: kpis.revenueChangePercent === null ? 'month to date' : `${kpis.revenueChangePercent >= 0 ? '+' : ''}${Math.round(kpis.revenueChangePercent)}% vs. ${previousMonthStart.toLocaleDateString('en-US', { month: 'short' })}`,
      tone: kpis.revenueChangePercent === null ? 'muted' : kpis.revenueChangePercent >= 0 ? 'good' : 'bad',
    },
    {
      key: 'out', label: 'Outstanding invoices', value: moneyShort(kpis.outstanding),
      sub: kpis.over30Count ? `${moneyShort(kpis.over30Total)} over 30 days` : `${homeData.unpaid.length} open`, tone: kpis.over30Count ? 'warn' : 'muted',
    },
    { key: 'jobs', label: 'Jobs today', value: String(homeData.todayJobs.length), sub: jobsWithoutCrew.length ? `${jobsWithoutCrew.length} unassigned` : 'all assigned', tone: jobsWithoutCrew.length ? 'warn' : 'good' },
    { key: 'qc', label: 'QC queue', value: String(homeData.waitingQc.length), sub: `${homeData.recalls.length} recall${homeData.recalls.length === 1 ? '' : 's'} open`, tone: homeData.recalls.length ? 'bad' : 'muted' },
    {
      key: 'gp', label: 'Gross profit · month', value: moneyShort(kpis.monthTotals.profit),
      sub: kpis.monthTotals.margin === null ? '—' : `${pct(kpis.monthTotals.margin)} margin`, tone: (kpis.monthTotals.margin ?? 0) >= 35 ? 'good' : 'warn',
    },
    { key: 'pay', label: 'Payroll this week', value: moneyShort(kpis.weekPayroll), sub: `${kpis.weekJobs} jobs this week`, tone: 'muted' },
  ];

  // ---- Today's time: el día por hora (trabajos + tareas con hora) ----
  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];
    const jobsByTime = new Map<string, HomeJob[]>();
    homeData.todayJobs.forEach((job) => {
      if (job.state === 'nocrew') {
        items.push({ id: `nc-${job.prop.id}`, minutesFromMidnight: job.minutes, time: job.time, title: `${job.client} · no crew yet`, subtitle: 'Needs assignment', tone: 'alert' });
        return;
      }
      const jobsInSlot = jobsByTime.get(job.time) ?? [];
      jobsInSlot.push(job);
      jobsByTime.set(job.time, jobsInSlot);
    });
    jobsByTime.forEach((jobsInSlot, time) => {
      const teamsInSlot = [...new Set(jobsInSlot.map((job) => job.teamName).filter(Boolean))];
      items.push({
        id: `s-${time}`, minutesFromMidnight: jobsInSlot[0].minutes, time,
        title: `Crews out · ${jobsInSlot.length} cleaning${jobsInSlot.length === 1 ? '' : 's'}`,
        subtitle: teamsInSlot.slice(0, 4).join(', ') + (teamsInSlot.length > 4 ? ` +${teamsInSlot.length - 4}` : ''),
        tone: 'jobs',
      });
    });
    // Tareas que vencen hoy: con hora, en su lugar; sin hora, al final del día.
    homeTasks.tasks.forEach((task) => {
      if (task.dueDate !== todayIsoDate) return;
      const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(task.dueTime ?? '');
      items.push({
        id: `t-${task.id}`,
        minutesFromMidnight: timeMatch ? Number(timeMatch[1]) * 60 + Number(timeMatch[2]) : 24 * 60 - 1,
        time: timeMatch ? `${Number(timeMatch[1]) % 12 || 12}:${timeMatch[2]}` : '',
        title: task.title,
        subtitle: `${namesSummary(task.assignees.map((assignee) => getFirstName(assignee.userName)))} · task due`,
        tone: 'task',
      });
    });
    return items.sort((first, second) => first.minutesFromMidnight - second.minutesFromMidnight);
  }, [homeData.todayJobs, homeTasks.tasks, todayIsoDate]);

  const startedJobsCount = homeData.todayJobs.filter((job) => job.state === 'progress' || job.state === 'done').length;

  // ---- Finance ----
  const maxBarValue = Math.max(1, kpis.monthTotals.servicePrice);
  const getBarWidthStyle = (amount: number) =>
    ({ '--w': `${Math.max(0, Math.min(100, (amount / maxBarValue) * 100))}%` } as CSSProperties);
  const monthName = now.toLocaleDateString('en-US', { month: 'long' });

  const handleOpenBriefCardLink = (linkTarget: (typeof briefCards)[number]['linkTarget']) => {
    if (linkTarget === 'tasks_section') tasksSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else onNavigate(linkTarget);
  };

  // Texto de la lista de tareas cuando no hay filas (o no se pudieron cargar).
  const taskEmptyText = (() => {
    if (homeTasks.error) return 'Could not load the tasks.';
    if (!homeTasks.loaded) return 'Loading tasks…';
    return activeAssigneeFilterId === 'all' ? 'No open tasks.' : 'No open tasks for this person.';
  })();

  return (
    <div className="fade-in hm-page">
      <HomeHeader
        title={`${greeting(now)}, ${currentUser?.firstName || 'there'}`}
        subtitle={[headerDate(now), homeData.cityState].filter(Boolean).join(' · ')}
        onOpenMenu={onOpenMenu}
      />

      <section className="hm-brief" aria-label="Your day in 30 seconds">
        <h2 className="hm-brief-title"><Sparkles size={18} /> Your day in 30 seconds</h2>
        <ul className="hm-brief-cards">
          {briefCards.map((card) => (
            <li key={card.tag} className="hm-brief-card">
              <span className={`hm-btag ${card.tone}`}>{card.tag}</span>
              <p className="hm-brief-text">{card.text}</p>
              <button type="button" className="hm-brief-link" onClick={() => handleOpenBriefCardLink(card.linkTarget)}>
                {card.link}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <ul className="hm-kpis" aria-label="Indicadores">
        {kpiTiles.map((tile) => (
          <li key={tile.key} className="hm-kpi">
            <span className="hm-kpi-label">{tile.label}</span>
            <span className="hm-kpi-value">{homeData.fin.loading && ['rev', 'out', 'gp', 'pay'].includes(tile.key) ? '…' : tile.value}</span>
            <span className={`hm-kpi-sub ${tile.tone}`}>{tile.sub}</span>
          </li>
        ))}
      </ul>

      <div className="hm-grid hm-grid-wide">
        {homeTasks.canView && (
          <section className="hm-card" aria-label="Open tasks" ref={tasksSectionRef}>
            <div className="hm-card-head">
              <h2 className="hm-card-title">{homeTasks.rights.seesAll ? 'Open tasks' : 'My open tasks'}</h2>
              <span className="hm-muted">{homeTasks.loaded ? `${openTasks.length} open · ${overdueTasks.length} overdue` : '…'}</span>
            </div>
            {assigneeFilterOptions.length > 1 && (
              <div className="hm-chips" role="tablist" aria-label="Filtrar por persona">
                <button type="button" role="tab" aria-selected={activeAssigneeFilterId === 'all'} className={`hm-chip${activeAssigneeFilterId === 'all' ? ' on' : ''}`} onClick={() => setAssigneeFilterId('all')}>All</button>
                {assigneeFilterOptions.map(([assigneeId, name]) => (
                  <button key={assigneeId} type="button" role="tab" aria-selected={activeAssigneeFilterId === assigneeId} className={`hm-chip${activeAssigneeFilterId === assigneeId ? ' on' : ''}`} onClick={() => setAssigneeFilterId(assigneeId)}>
                    {name}
                  </button>
                ))}
              </div>
            )}
            <TaskChecklist
              tasks={visibleTasks}
              today={todayIsoDate}
              meId={currentUserId}
              showAssignee={homeTasks.rights.seesAll}
              busyId={homeTasks.actions.busyId}
              canComplete={!!currentUser}
              onComplete={homeTasks.actions.complete}
              emptyText={taskEmptyText}
            />
            <button type="button" className="hm-more" onClick={() => onNavigate('task_list')}>Open Task List</button>
          </section>
        )}

        <section className="hm-card" aria-label="Today's time">
          <h2 className="hm-card-title">Today&apos;s time</h2>
          {timeline.length === 0 ? <p className="hm-empty">Nothing scheduled today.</p> : (
            <ol className="hm-scroll-list hm-timeline">
              {timeline.map((item) => (
                <li key={item.id} className="hm-tl">
                  <span className="hm-tl-time">{item.time || '—'}</span>
                  <div className={`hm-tl-card ${item.tone}`}>
                    <span className="hm-slot-title">{item.title}</span>
                    {item.subtitle && <span className={`hm-slot-sub${item.tone === 'alert' ? ' warn' : ''}`}>{item.subtitle}</span>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="hm-onclock">
            <h3 className="hm-sub-title">On the clock now</h3>
            <ul className="hm-onclock-list">
              {homeData.managers.map((user) => {
                const openClockEntry = openEntryOf(homeData.clock, user.id);
                const hoursThisWeek = weekHours(homeData.clock, user.id, now);
                return (
                  <li key={user.id} className="hm-onclock-row">
                    <span className="hm-onclock-name"><span className={`hm-dot${openClockEntry ? ' on' : ''}`} /> {fullName(user)}</span>
                    <span className="hm-muted">{openClockEntry ? `since ${fmtClock(openClockEntry.inAt)}` : 'not clocked in'} · {hoursThisWeek} h this week</span>
                  </li>
                );
              })}
              <li className="hm-onclock-row">
                <span className="hm-onclock-name"><span className={`hm-dot${startedJobsCount ? ' on' : ''}`} /> Crews</span>
                <span className="hm-muted">{startedJobsCount} of {homeData.todayJobs.length} jobs started</span>
              </li>
            </ul>
          </div>
        </section>
      </div>

      {homeTasks.actions.undo && <UndoToast title={homeTasks.actions.undo.task.title} onUndo={homeTasks.actions.undoComplete} />}

      <h2 className="hm-section-title">Finance</h2>
      <div className="hm-grid hm-grid-half">
        <section className="hm-card" aria-label="Business numbers">
          <div className="hm-card-head">
            <h2 className="hm-card-title">Business · from the Precise Cleaning app</h2>
            <span className="hm-muted">{monthName} to date</span>
          </div>
          <dl className="hm-bars">
            <div className="hm-barrow">
              <dt>Revenue</dt><dd>{moneyShort(kpis.monthTotals.servicePrice)}</dd>
              <span className="hm-bar"><span className="hm-bar-fill rev" style={getBarWidthStyle(kpis.monthTotals.servicePrice)} /></span>
            </div>
            <div className="hm-barrow">
              <dt>Sales tax (8.25%)</dt><dd>{moneyShort(kpis.monthTotals.taxes)}</dd>
              <span className="hm-bar"><span className="hm-bar-fill tax" style={getBarWidthStyle(kpis.monthTotals.taxes)} /></span>
            </div>
            <div className="hm-barrow">
              <dt>Payroll</dt><dd>{moneyShort(kpis.monthTotals.payroll)}</dd>
              <span className="hm-bar"><span className="hm-bar-fill pay" style={getBarWidthStyle(kpis.monthTotals.payroll)} /></span>
            </div>
          </dl>
          <div className="hm-profit">
            <span className="hm-profit-lbl">Gross profit</span>
            <span className={`hm-profit-num${kpis.monthTotals.profit < 0 ? ' neg' : ''}`}>
              {moneyShort(kpis.monthTotals.profit)}{kpis.monthTotals.margin !== null ? ` · ${Math.round(kpis.monthTotals.margin)}%` : ''}
            </span>
          </div>
        </section>

        <section className="hm-card" aria-label="Oldest unpaid invoices">
          <div className="hm-card-head">
            <h2 className="hm-card-title">Oldest unpaid invoices</h2>
            <span className="hm-muted">{homeData.unpaid.length} open · {moneyShort(kpis.outstanding)}</span>
          </div>
          {homeData.unpaid.length === 0 ? <p className="hm-empty">No unpaid invoices. 🎉</p> : (
            <table className="hm-mini">
              <thead><tr><th>Client</th><th className="n">Days</th><th className="n">Amount</th></tr></thead>
              <tbody>
                {homeData.unpaid.slice(0, 6).map((invoice) => (
                  <tr key={invoice.prop.id} className="hm-row" onClick={() => onOpenHouseDetail(invoice.prop)}>
                    <td><div className="strong">{invoice.client}</div><div className="hm-muted">{invoice.prop.address}</div></td>
                    <td className={`n${invoice.days > 30 ? ' late' : ''}`}>{invoice.days}</td>
                    <td className="n strong">{invoice.amount ? moneyShort(invoice.amount) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button type="button" className="hm-more" onClick={() => onNavigate('invoices')}>Open Invoices</button>
        </section>
      </div>
    </div>
  );
}
