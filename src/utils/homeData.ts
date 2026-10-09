// src/utils/homeData.ts
// ⭐ Datos y reglas compartidas por las vistas OWNER y MANAGER.
//    · useHomeData: catálogos, último QC por casa, finanzas por trabajo,
//      tareas de gerentes y reloj — todo en tiempo real.
//    · Reglas puras (sin React): trabajos de hoy y su estado, casas que
//      esperan inspección, casas en Recall y su re-clean, facturas sin cobrar.
//    El "Your day in 30 seconds" se arma con REGLAS sobre estos datos (igual
//    que el resumen del Overview), no con un modelo de IA.
import { useEffect, useMemo, useState } from 'react';
import type { Property, SystemUser } from '../types/index';
import { displayClientName } from './customerDocs';
import { useLiveData } from '../shared/data/liveCollections';
import { getRelationName } from './relations';
import { toDate } from './dateGrouping';
import { isRecallText } from './recallStatus';
import { isQualityCheckStatus } from './qcStatus';
import { useJobFinancials } from './jobFinancials';
import { failedAreas, latestByHouse } from './qcDashboard';
import { managerTasksService, type ManagerTask } from '../services/managerTasksService';
import { timeClockService, type ClockEntry } from '../services/timeClockService';
import { subscribeCompanySettings, getCachedCompanySettings } from '../services/companyService';
import { formatDate, formatTime } from './dateFormat';

const norm = (s: unknown) => String(s || '').toLowerCase().trim();
const DAY = 86400000;

export const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
export const fullName = (u?: Pick<SystemUser, 'firstName' | 'lastName' | 'email'> | null) =>
  (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || String(u.email || '').split('@')[0] : '') || 'Unknown';

/** "Good morning" / "Good afternoon" / "Good evening". */
export const greeting = (d = new Date()) =>
  d.getHours() < 12 ? 'Good morning' : d.getHours() < 18 ? 'Good afternoon' : 'Good evening';

/** "8:00" a partir de timeIn ("08:00", "8:00 AM", "14:30"). */
function timeLabel(timeIn: string): string {
  const m = String(timeIn || '').trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return String(timeIn || '').trim();
  let h = Number(m[1]);
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  const h12 = h % 12 || 12;
  return `${h12}:${m[2]}`;
}
/** Minutos desde medianoche (para ordenar). Sin hora → al final. */
function timeMinutes(timeIn: string): number {
  const m = String(timeIn || '').trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return 24 * 60;
  let h = Number(m[1]);
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h * 60 + Number(m[2]);
}

/** Estado del trabajo de HOY para "Houses Today". */
export type TodayState = 'done' | 'progress' | 'late' | 'scheduled' | 'nocrew';
export const TODAY_STATE_LABEL: Record<TodayState, string> = {
  done: 'Done',
  progress: 'In progress',
  late: 'Not started',
  scheduled: 'Scheduled',
  nocrew: 'No crew assigned',
};

export interface HomeJob {
  prop: Property;
  time: string;
  minutes: number;
  client: string;
  type: string;
  teamName: string;
  teamColor: string;
  statusName: string;
  statusColor: string;
  state: TodayState;
}

interface RecallJob {
  prop: Property;
  client: string;
  teamName: string;
  teamColor: string;
  failed: string[];
  /** 'progress' re-clean en marcha · 'scheduled' con fecha · 'open' sin agendar */
  reclean: 'progress' | 'scheduled' | 'open';
  detail: string;
  daysOpen: number;
}

interface UnpaidJob {
  prop: Property;
  client: string;
  days: number;
  amount: number;
}

export function useHomeData(properties: Property[]) {
  // ⭐ Catálogos y QC desde el store compartido (un listener por colección).
  const statuses = useLiveData('statuses');
  const teams = useLiveData('teams');
  const customers = useLiveData('customers');
  const products = useLiveData('products');
  const svcCatalog = useLiveData('services');
  const places = useLiveData('places');
  const users = useLiveData('users');
  const roles = useLiveData('roles');
  const qcRecords = useLiveData('qualityChecks');
  const [tasks, setTasks] = useState<ManagerTask[]>([]);
  const [clock, setClock] = useState<ClockEntry[]>([]);
  const [companyAddress, setCompanyAddress] = useState(getCachedCompanySettings().address || '');
  const [now, setNow] = useState(() => new Date());
  const fin = useJobFinancials();

  useEffect(() => {
    const subs = [
      managerTasksService.subscribe(setTasks),
      timeClockService.subscribeWeek(setClock),
      subscribeCompanySettings((c) => setCompanyAddress(c.address || '')),
    ];
    // Reloj de la pantalla: saludo, "vencidas" y horas trabajadas se ponen al día solos.
    const tick = window.setInterval(() => setNow(new Date()), 60000);
    return () => { subs.forEach((u) => u()); window.clearInterval(tick); };
  }, []);

  const services = useMemo(() => [...products, ...svcCatalog], [products, svcCatalog]);
  const latestQc = useMemo(() => latestByHouse(qcRecords), [qcRecords]);

  // ---- Resolución de catálogos ----
  const statusOf = (p: Property) => statuses.find((s) => String(s.id) === String(p.statusId) || s.name === p.statusId);
  const clientName = (p: Property) => displayClientName(customers, p.client);
  const teamOf = (p: Property) => (p.teamId ? teams.find((t) => t.id === p.teamId || t.name === p.teamId) : undefined);
  const typeName = (p: Property) => getRelationName(services, p.serviceId, 'Regular');

  /** Gerentes = usuarios activos cuyo rol tiene el módulo "Manager" (View). */
  const managers = useMemo(() => {
    const managerRoles = new Set(
      roles.filter((r) => r.permissions?.some((p) => p.module === 'Manager' && p.canView)).map((r) => r.id),
    );
    return users
      .filter((u) => u.status !== 'Inactive' && managerRoles.has(u.roleId))
      .sort((a, b) => fullName(a).localeCompare(fullName(b)));
  }, [users, roles]);

  const toJob = (p: Property): HomeJob => {
    const st = statusOf(p);
    const t = teamOf(p);
    const minutes = timeMinutes(p.timeIn);
    let state: TodayState = 'scheduled';
    if (p.employeeFinishedAt) state = 'done';
    else if (p.employeeStartedAt) state = 'progress';
    else if (!t) state = 'nocrew';
    else if (minutes < 24 * 60 && minutes + 15 < now.getHours() * 60 + now.getMinutes()) state = 'late';
    return {
      prop: p,
      time: timeLabel(p.timeIn),
      minutes,
      client: clientName(p),
      type: typeName(p),
      teamName: t?.name || '',
      teamColor: t?.color || '#64748b',
      statusName: st?.name || String(p.statusId || ''),
      statusColor: st?.color || '#94a3b8',
      state,
    };
  };

  // ---- Trabajos de hoy (por hora) ----
  const today = startOfDay(now);
  const todayJobs = useMemo(
    () =>
      properties
        .filter((p) => { const d = toDate(p.scheduleDate); return !!d && sameDay(d, today); })
        .map(toJob)
        .sort((a, b) => a.minutes - b.minutes || a.client.localeCompare(b.client)),
    // toJob depende de catálogos y de la hora
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [properties, statuses, teams, customers, services, now.getTime()],
  );

  // ---- Esperan inspección: status Quality Check, o terminados en los
  //      últimos 7 días sin un QC terminado posterior. Fuera Recall. ----
  const waitingQc = useMemo(() => {
    const out: HomeJob[] = [];
    properties.forEach((p) => {
      const st = statusOf(p);
      if (isRecallText(st?.name || p.statusId)) return;
      const rec = latestQc.get(p.id);
      const finishedAt = p.employeeFinishedAt ? new Date(p.employeeFinishedAt) : null;
      const recentFinish = !!finishedAt && now.getTime() - finishedAt.getTime() < 7 * DAY;
      const inQcStatus = isQualityCheckStatus(p.statusId, statuses);
      if (!inQcStatus && !recentFinish) return;
      if (rec && rec.status === 'Finished') {
        const recAt = new Date(rec.createdAt || rec.date || 0).getTime();
        if (!finishedAt || recAt >= finishedAt.getTime()) return;
      }
      out.push(toJob(p));
    });
    return out.sort((a, b) =>
      String(b.prop.employeeFinishedAt || b.prop.scheduleDate).localeCompare(String(a.prop.employeeFinishedAt || a.prop.scheduleDate)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, statuses, teams, customers, services, latestQc, now.getTime()]);

  // ---- Casas en Recall y su re-clean ----
  const recalls = useMemo(() => {
    const out: RecallJob[] = [];
    properties.forEach((p) => {
      const st = statusOf(p);
      if (!isRecallText(st?.name || p.statusId)) return;
      const rec = latestQc.get(p.id) || null;
      const t = teamOf(p);
      const failedAt = new Date(rec?.createdAt || rec?.date || p.scheduleDate || now).getTime();
      const daysOpen = Math.max(0, Math.floor((today.getTime() - startOfDay(new Date(failedAt)).getTime()) / DAY));
      const sched = toDate(p.scheduleDate);
      const started = p.employeeStartedAt ? new Date(p.employeeStartedAt).getTime() : 0;
      let reclean: RecallJob['reclean'] = 'open';
      let detail = `Re-clean not scheduled · ${daysOpen} day${daysOpen === 1 ? '' : 's'} open`;
      if (started > failedAt && !p.employeeFinishedAt) {
        reclean = 'progress';
        detail = `Re-clean in progress · started ${new Date(started).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
      } else if (sched && sched.getTime() >= today.getTime() && sched.getTime() >= startOfDay(new Date(failedAt)).getTime()) {
        reclean = 'scheduled';
        const when = sameDay(sched, today) ? 'today' : `${sched.toLocaleDateString('en-US', { weekday: 'short' })} ${formatDate(sched)}`;
        detail = `Re-clean scheduled · ${when}${p.timeIn ? ` ${timeLabel(p.timeIn)}` : ''}`;
      }
      out.push({
        prop: p,
        client: clientName(p),
        teamName: t?.name || '',
        teamColor: t?.color || '#64748b',
        failed: failedAreas(rec, places),
        reclean,
        detail,
        daysOpen,
      });
    });
    // Sin agendar primero, luego los más viejos
    const rank = { open: 0, scheduled: 1, progress: 2 } as const;
    return out.sort((a, b) => rank[a.reclean] - rank[b.reclean] || b.daysOpen - a.daysOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, statuses, teams, customers, latestQc, places, now.getTime()]);

  // ---- Facturas sin cobrar (Pending / Needs Invoice), las más viejas primero ----
  const unpaid = useMemo(() => {
    const out: UnpaidJob[] = [];
    properties.forEach((p) => {
      const inv = norm(p.invoiceStatus);
      if (inv !== 'pending' && inv !== 'needs invoice') return;
      const d = toDate(p.scheduleDate);
      if (!d || d.getTime() > now.getTime()) return;
      const amount = fin.calc(p).servicePrice;
      out.push({ prop: p, client: clientName(p), days: Math.floor((today.getTime() - startOfDay(d).getTime()) / DAY), amount });
    });
    return out.sort((a, b) => b.days - a.days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, customers, fin.calc, now.getTime()]);

  /** "Killeen, TX" desde la dirección de la empresa (Settings → Empresa). */
  const cityState = useMemo(() => {
    const m = companyAddress.match(/([A-Za-zÀ-ÿ .'-]+),\s*([A-Z]{2})\b/g);
    return m ? m[m.length - 1].trim() : '';
  }, [companyAddress]);

  return {
    now, today, statuses, teams, customers, users, roles, places, latestQc, fin, tasks, clock, managers, cityState,
    statusOf, clientName, teamOf, typeName, todayJobs, waitingQc, recalls, unpaid,
  };
}

/** Fecha del encabezado: "Thursday 10/08/2026 · 7:30 AM" (fechas siempre MM/DD/AAAA). */
export const headerDate = (d: Date) =>
  `${d.toLocaleDateString('en-US', { weekday: 'long' })} ${formatDate(d)} · ${formatTime(d)}`;

export const moneyShort = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
