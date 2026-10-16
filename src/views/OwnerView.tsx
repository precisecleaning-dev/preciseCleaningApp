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
import type { UserTask, Property, Role, SystemUser } from '../types/index';
import HomeHeader from '../components/HomeHeader';
import TaskChecklist from '../components/TaskChecklist';
import {
  fullName, greeting, headerDate, moneyShort, useHomeData,
} from '../utils/homeData';
import { useHomeTasks } from '../features/ops/hooks/useHomeTasks';
import { sectionOf } from '../features/ops/opsDates';
import { namesSummary } from '../features/ops/opsOptions';
import { isAssignee } from '../features/ops/opsPermissions';
import UndoToast from '../features/ops/components/UndoToast';
import { fmtClock, openEntryOf, weekHours, weekStart } from '../services/timeClockService';
import { toDate } from '../utils/dateGrouping';
import { pct } from '../utils/jobFinancials';
import { todayIso } from '../utils/dateFormat';
import './HomeViews.css';

interface Props {
  onOpenMenu: () => void;
  properties: Property[];
  currentUser: SystemUser | null;
  activeRole: Role | null;
  isSuperAdmin: boolean;
  /** Ir a otra vista de la app (Invoices, Overview, QC Dashboard, Task list…). */
  onNavigate: (tab: 'invoices' | 'houses' | 'qc_dashboard' | 'task_list') => void;
  onOpenHouseDetail: (p: Property) => void;
}

interface TimelineItem {
  key: string;
  minutes: number;
  time: string;
  title: string;
  sub: string;
  tone: 'jobs' | 'task' | 'alert';
}

export default function OwnerView({
  onOpenMenu, properties, currentUser, activeRole, isSuperAdmin, onNavigate, onOpenHouseDetail,
}: Props) {
  const d = useHomeData(properties);
  const ht = useHomeTasks(currentUser, activeRole, isSuperAdmin);
  const tasksRef = useRef<HTMLElement | null>(null);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const [taskFilter, setTaskFilter] = useState('all');

  const me = currentUser;
  const now = d.now;
  const today = d.today;
  const meId = me?.id || '';

  // ---- Periodos ----
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthSameDay = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), 28), 23, 59);
  const wStart = weekStart(now);
  const wEnd = new Date(wStart.getTime() + 7 * 86400000);
  const endToday = new Date(today.getTime() + 86400000);

  const inRange = (p: Property, a: Date, b: Date) => {
    const t = toDate(p.scheduleDate)?.getTime();
    return t !== undefined && t >= a.getTime() && t < b.getTime();
  };

  // ---- Indicadores ----
  const k = useMemo(() => {
    const month = properties.filter((p) => inRange(p, monthStart, endToday));
    const prev = properties.filter((p) => inRange(p, prevMonthStart, prevMonthSameDay));
    const week = properties.filter((p) => inRange(p, wStart, wEnd));
    const m = d.fin.sum(month);
    const pv = d.fin.sum(prev);
    const wk = d.fin.sum(week);
    const outstanding = d.unpaid.reduce((s, u) => s + u.amount, 0);
    const over30 = d.unpaid.filter((u) => u.days > 30);
    return {
      month: m,
      change: pv.servicePrice > 0 ? ((m.servicePrice - pv.servicePrice) / pv.servicePrice) * 100 : null,
      outstanding,
      over30Total: over30.reduce((s, u) => s + u.amount, 0),
      over30Count: over30.length,
      weekPayroll: wk.payroll,
      weekJobs: week.length,
    };
    // inRange/fechas dependen de `now`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, d.fin.sum, d.unpaid, now.getTime()]);

  const noCrew = d.todayJobs.filter((j) => j.state === 'nocrew');
  const openRecalls = d.recalls.filter((r) => r.reclean === 'open');

  // ---- Tareas pendientes (Task list) ----
  const todayYmd = todayIso();
  const openTasks = ht.tasks;
  const shownTasks = taskFilter === 'all' ? openTasks : openTasks.filter((t) => isAssignee(t, taskFilter));
  const overdue = openTasks.filter((t) => sectionOf(t.dueDate, todayYmd) === 'overdue');
  /** Nombre corto de la persona `index` de la tarea ("You" si es uno mismo). */
  const assigneeShortName = (t: UserTask, index: number) =>
    (t.assigneeUserIds[index] === meId ? 'You' : (t.assigneeUserNames[index] ?? '').split(' ')[0] || 'Someone');
  // Atrasadas por persona: una tarea de varias personas cuenta para cada una.
  const overdueBy = useMemo(() => {
    const m = new Map<string, number>();
    overdue.forEach((t) => t.assigneeUserIds.forEach((_id, index) => {
      const name = assigneeShortName(t, index);
      m.set(name, (m.get(name) || 0) + 1);
    }));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
    // assigneeShortName solo depende de meId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overdue, meId]);
  // Filtro por persona: quienes tienen tareas abiertas.
  const assignees = useMemo(() => {
    const m = new Map<string, string>();
    openTasks.forEach((t) => t.assigneeUserIds.forEach((id, index) => {
      m.set(id, id === meId ? 'Me' : (t.assigneeUserNames[index] ?? '').split(' ')[0] || '—');
    }));
    return [...m.entries()].sort((a, b) => (a[0] === meId ? -1 : b[0] === meId ? 1 : a[1].localeCompare(b[1])));
  }, [openTasks, meId]);

  // ---- Your day in 30 seconds ----
  const biggest = d.unpaid.filter((u) => u.days > 30).sort((a, b) => b.amount - a.amount)[0];
  const briefCards = [
    {
      tag: 'Money', tone: 'money',
      text: k.over30Count
        ? `${k.over30Count} invoice${k.over30Count === 1 ? ' is' : 's are'} past 30 days, ${moneyShort(k.over30Total)} total.${biggest ? ` The biggest is ${biggest.client}.` : ''}`
        : d.unpaid.length ? `${d.unpaid.length} invoices open (${moneyShort(k.outstanding)}), none past 30 days.` : 'Every completed job is paid.',
      link: 'Open invoices', onClick: () => onNavigate('invoices'),
    },
    {
      tag: 'Jobs', tone: 'jobs',
      text: d.todayJobs.length
        ? `${d.todayJobs.length} cleaning${d.todayJobs.length === 1 ? '' : 's'} today.${noCrew.length ? ` ${noCrew.length === 1 ? `The ${noCrew[0].time ? `${noCrew[0].time} ` : ''}job at ${noCrew[0].client} has` : `${noCrew.length} jobs have`} no crew assigned yet.` : ' Every job has a crew.'}`
        : 'No cleanings scheduled today.',
      link: noCrew.length ? 'Assign crew' : 'Open overview', onClick: () => onNavigate('houses'),
    },
    {
      tag: 'Team', tone: 'team',
      text: !ht.canView
        ? 'Task List is off for your role (Roles & Permissions).'
        : overdue.length
          ? `${overdue.length} overdue task${overdue.length === 1 ? '' : 's'}${overdueBy[0] && overdueBy.length > 1 ? `. ${overdueBy[0][0]} ${overdueBy[0][0] === 'You' ? 'have' : 'has'} ${overdueBy[0][1]} of them` : overdueBy[0] ? `, all ${overdueBy[0][0] === 'You' ? 'yours' : `${overdueBy[0][0]}'s`}` : ''}.`
          : `${openTasks.length} open task${openTasks.length === 1 ? '' : 's'}, none overdue.`,
      link: 'Review tasks',
      onClick: () => (ht.canView ? tasksRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : onNavigate('task_list')),
    },
    {
      tag: 'QC', tone: 'qc',
      text: `${d.waitingQc.length} inspection${d.waitingQc.length === 1 ? '' : 's'} waiting.${d.recalls.length ? ` ${d.recalls.length} on recall${openRecalls.length ? `, ${openRecalls.length} not re-cleaned or scheduled` : ''}.` : ''}`,
      link: 'Open QC queue', onClick: () => onNavigate('qc_dashboard'),
    },
  ];

  const tiles: { key: string; label: string; value: string; sub: string; tone: string }[] = [
    {
      key: 'rev', label: 'Revenue this month', value: moneyShort(k.month.servicePrice),
      sub: k.change === null ? 'month to date' : `${k.change >= 0 ? '+' : ''}${Math.round(k.change)}% vs. ${prevMonthStart.toLocaleDateString('en-US', { month: 'short' })}`,
      tone: k.change === null ? 'muted' : k.change >= 0 ? 'good' : 'bad',
    },
    {
      key: 'out', label: 'Outstanding invoices', value: moneyShort(k.outstanding),
      sub: k.over30Count ? `${moneyShort(k.over30Total)} over 30 days` : `${d.unpaid.length} open`, tone: k.over30Count ? 'warn' : 'muted',
    },
    { key: 'jobs', label: 'Jobs today', value: String(d.todayJobs.length), sub: noCrew.length ? `${noCrew.length} unassigned` : 'all assigned', tone: noCrew.length ? 'warn' : 'good' },
    { key: 'qc', label: 'QC queue', value: String(d.waitingQc.length), sub: `${d.recalls.length} recall${d.recalls.length === 1 ? '' : 's'} open`, tone: d.recalls.length ? 'bad' : 'muted' },
    {
      key: 'gp', label: 'Gross profit · month', value: moneyShort(k.month.profit),
      sub: k.month.margin === null ? '—' : `${pct(k.month.margin)} margin`, tone: (k.month.margin ?? 0) >= 35 ? 'good' : 'warn',
    },
    { key: 'pay', label: 'Payroll this week', value: moneyShort(k.weekPayroll), sub: `${k.weekJobs} jobs this week`, tone: 'muted' },
  ];

  // ---- Today's time: el día por hora (trabajos + tareas con hora) ----
  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];
    const slots = new Map<string, typeof d.todayJobs>();
    d.todayJobs.forEach((j) => {
      if (j.state === 'nocrew') {
        items.push({ key: `nc-${j.prop.id}`, minutes: j.minutes, time: j.time, title: `${j.client} · no crew yet`, sub: 'Needs assignment', tone: 'alert' });
        return;
      }
      const list = slots.get(j.time) || [];
      list.push(j);
      slots.set(j.time, list);
    });
    slots.forEach((list, time) => {
      const teamsInSlot = [...new Set(list.map((j) => j.teamName).filter(Boolean))];
      items.push({
        key: `s-${time}`, minutes: list[0].minutes, time,
        title: `Crews out · ${list.length} cleaning${list.length === 1 ? '' : 's'}`,
        sub: teamsInSlot.slice(0, 4).join(', ') + (teamsInSlot.length > 4 ? ` +${teamsInSlot.length - 4}` : ''),
        tone: 'jobs',
      });
    });
    // Tareas que vencen hoy: con hora, en su lugar; sin hora, al final del día.
    const ymd = todayIso();
    ht.tasks.forEach((t) => {
      if (t.dueDate !== ymd) return;
      const m = /^(\d{1,2}):(\d{2})$/.exec(t.dueTime || '');
      items.push({
        key: `t-${t.id}`, minutes: m ? Number(m[1]) * 60 + Number(m[2]) : 24 * 60 - 1,
        time: m ? `${Number(m[1]) % 12 || 12}:${m[2]}` : '',
        title: t.title, sub: `${namesSummary(t.assigneeUserNames.map((name) => name.split(' ')[0]))} · task due`, tone: 'task',
      });
    });
    return items.sort((a, b) => a.minutes - b.minutes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.todayJobs, ht.tasks, now.getTime()]);

  const started = d.todayJobs.filter((j) => j.state === 'progress' || j.state === 'done').length;

  // ---- Finance ----
  const maxBar = Math.max(1, k.month.servicePrice);
  const bar = (n: number) => ({ '--w': `${Math.max(0, Math.min(100, (n / maxBar) * 100))}%` } as CSSProperties);
  const monthName = now.toLocaleDateString('en-US', { month: 'long' });

  return (
    <div className="fade-in hm-page">
      <HomeHeader
        title={`${greeting(now)}, ${me?.firstName || 'there'}`}
        subtitle={[headerDate(now), d.cityState].filter(Boolean).join(' · ')}
        onOpenMenu={onOpenMenu}
      />

      <section className="hm-brief" aria-label="Your day in 30 seconds">
        <div className="hm-brief-head">
          <h2 className="hm-brief-title"><Sparkles size={18} /> Your day in 30 seconds</h2>
          <div className="hm-brief-meta">
            <span>Updated {updatedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
            <button type="button" className="hm-brief-btn" onClick={() => setUpdatedAt(new Date())}>Refresh</button>
          </div>
        </div>
        <ul className="hm-brief-cards">
          {briefCards.map((c) => (
            <li key={c.tag} className="hm-brief-card">
              <span className={`hm-btag ${c.tone}`}>{c.tag}</span>
              <p className="hm-brief-text">{c.text}</p>
              <button type="button" className="hm-brief-link" onClick={c.onClick}>{c.link}</button>
            </li>
          ))}
        </ul>
      </section>

      <ul className="hm-kpis" aria-label="Indicadores">
        {tiles.map((t) => (
          <li key={t.key} className="hm-kpi">
            <span className="hm-kpi-label">{t.label}</span>
            <span className="hm-kpi-value">{d.fin.loading && ['rev', 'out', 'gp', 'pay'].includes(t.key) ? '…' : t.value}</span>
            <span className={`hm-kpi-sub ${t.tone}`}>{t.sub}</span>
          </li>
        ))}
      </ul>

      <div className="hm-grid hm-grid-wide">
        {ht.canView && (
          <section className="hm-card" aria-label="Open tasks" ref={tasksRef}>
            <div className="hm-card-head">
              <h2 className="hm-card-title">{ht.rights.seesAll ? 'Open tasks' : 'My open tasks'}</h2>
              <span className="hm-muted">{ht.loaded ? `${openTasks.length} open · ${overdue.length} overdue` : '…'}</span>
            </div>
            {assignees.length > 1 && (
              <div className="hm-chips" role="tablist" aria-label="Filtrar por persona">
                <button type="button" role="tab" aria-selected={taskFilter === 'all'} className={`hm-chip${taskFilter === 'all' ? ' on' : ''}`} onClick={() => setTaskFilter('all')}>All</button>
                {assignees.map(([id, name]) => (
                  <button key={id} type="button" role="tab" aria-selected={taskFilter === id} className={`hm-chip${taskFilter === id ? ' on' : ''}`} onClick={() => setTaskFilter(id)}>
                    {name}
                  </button>
                ))}
              </div>
            )}
            <TaskChecklist
              tasks={shownTasks}
              today={todayYmd}
              meId={meId}
              showAssignee={ht.rights.seesAll}
              busyId={ht.actions.busyId}
              canComplete={!!me}
              onComplete={ht.actions.complete}
              emptyText={!ht.loaded ? 'Loading tasks…' : taskFilter === 'all' ? 'No open tasks.' : 'No open tasks for this person.'}
            />
            <button type="button" className="hm-more" onClick={() => onNavigate('task_list')}>Open Task List</button>
          </section>
        )}

        <section className="hm-card" aria-label="Today's time">
          <h2 className="hm-card-title">Today&apos;s time</h2>
          {timeline.length === 0 ? <p className="hm-empty">Nothing scheduled today.</p> : (
            <ol className="hm-timeline hm-scroll-list">
              {timeline.map((it) => (
                <li key={it.key} className="hm-tl">
                  <span className="hm-tl-time">{it.time || '—'}</span>
                  <div className={`hm-tl-card ${it.tone}`}>
                    <span className="hm-slot-title">{it.title}</span>
                    {it.sub && <span className={`hm-slot-sub${it.tone === 'alert' ? ' warn' : ''}`}>{it.sub}</span>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="hm-onclock">
            <h3 className="hm-sub-title">On the clock now</h3>
            <ul className="hm-onclock-list">
              {d.managers.map((u) => {
                const open = openEntryOf(d.clock, u.id);
                const hrs = weekHours(d.clock, u.id, now);
                return (
                  <li key={u.id} className="hm-onclock-row">
                    <span className="hm-onclock-name"><span className={`hm-dot${open ? ' on' : ''}`} /> {fullName(u)}</span>
                    <span className="hm-muted">{open ? `since ${fmtClock(open.inAt)}` : 'not clocked in'} · {hrs} h this week</span>
                  </li>
                );
              })}
              <li className="hm-onclock-row">
                <span className="hm-onclock-name"><span className={`hm-dot${started ? ' on' : ''}`} /> Crews</span>
                <span className="hm-muted">{started} of {d.todayJobs.length} jobs started</span>
              </li>
            </ul>
          </div>
        </section>
      </div>

      {ht.actions.undo && <UndoToast title={ht.actions.undo.task.title} onUndo={ht.actions.undoComplete} />}

      <h2 className="hm-section-title">Finance</h2>
      <div className="hm-grid hm-grid-half">
        <section className="hm-card" aria-label="Business numbers">
          <div className="hm-card-head">
            <h2 className="hm-card-title">Business · from the Precise Cleaning app</h2>
            <span className="hm-muted">{monthName} to date</span>
          </div>
          <dl className="hm-bars">
            <div className="hm-barrow">
              <dt>Revenue</dt><dd>{moneyShort(k.month.servicePrice)}</dd>
              <span className="hm-bar"><span className="hm-bar-fill rev" style={bar(k.month.servicePrice)} /></span>
            </div>
            <div className="hm-barrow">
              <dt>Sales tax (8.25%)</dt><dd>{moneyShort(k.month.taxes)}</dd>
              <span className="hm-bar"><span className="hm-bar-fill tax" style={bar(k.month.taxes)} /></span>
            </div>
            <div className="hm-barrow">
              <dt>Payroll</dt><dd>{moneyShort(k.month.payroll)}</dd>
              <span className="hm-bar"><span className="hm-bar-fill pay" style={bar(k.month.payroll)} /></span>
            </div>
          </dl>
          <div className="hm-profit">
            <span className="hm-profit-lbl">Gross profit</span>
            <span className={`hm-profit-num${k.month.profit < 0 ? ' neg' : ''}`}>
              {moneyShort(k.month.profit)}{k.month.margin !== null ? ` · ${Math.round(k.month.margin)}%` : ''}
            </span>
          </div>
        </section>

        <section className="hm-card" aria-label="Oldest unpaid invoices">
          <div className="hm-card-head">
            <h2 className="hm-card-title">Oldest unpaid invoices</h2>
            <span className="hm-muted">{d.unpaid.length} open · {moneyShort(k.outstanding)}</span>
          </div>
          {d.unpaid.length === 0 ? <p className="hm-empty">No unpaid invoices. 🎉</p> : (
            <table className="hm-mini">
              <thead><tr><th>Client</th><th className="n">Days</th><th className="n">Amount</th></tr></thead>
              <tbody>
                {d.unpaid.slice(0, 6).map((u) => (
                  <tr key={u.prop.id} className="hm-row" onClick={() => onOpenHouseDetail(u.prop)}>
                    <td><div className="strong">{u.client}</div><div className="hm-muted">{u.prop.address}</div></td>
                    <td className={`n${u.days > 30 ? ' late' : ''}`}>{u.days}</td>
                    <td className="n strong">{u.amount ? moneyShort(u.amount) : '—'}</td>
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

