import { useState, useEffect, useMemo } from 'react';
import {
  BarChart3, ShieldCheck, Home as HomeIcon, AlertTriangle, Repeat, Wrench,
  TrendingUp, Users, Award, Activity, Filter, RefreshCw, MapPin, Layers,
  XCircle, Flame, Calendar
} from 'lucide-react';
import { db } from '../config/firebase';
import { collection, getDocs } from 'firebase/firestore';

// ============================================================================
//  Dashboard de Gestión — Quality Check & Recall
//  Lee quality_checks + catálogos (places, tasks, teams, customers, statuses)
//  y calcula indicadores de gestión:
//   - Qué TAREAS se están fallando (marcadas "No") -> actividades no realizadas
//   - Por ÁREA (mapa de calor) y por EQUIPO (rendimiento y recalls)
//   - Tasa de recall, reincidencias, score promedio, tendencias, etc.
// ============================================================================

interface QCRecord {
  id?: string;
  houseId: string;
  date: string;
  address: string;
  client: string;
  team?: string;
  status: 'Finished' | 'Pending';
  result?: 'passed' | 'failed' | null;
  inspector?: string;
  qcData?: Record<string, any>;
}
interface Place { id: string; name: string }
interface Task { id: string; name: string; placeId: string }
interface NamedDoc { id: string; name?: string }

interface Props {
  onOpenMenu: () => void;
  currentUser?: any;
}

type RangeKey = '30' | '90' | '180' | '365' | 'all';
type TabKey = 'qc' | 'recall';

const PALETTE = {
  blue: '#3b82f6', indigo: '#4338ca', green: '#16a34a', greenSoft: '#22c55e',
  red: '#ef4444', amber: '#f59e0b', purple: '#7c3aed', slate: '#64748b',
};

const RANGE_LABEL: Record<RangeKey, string> = {
  '30': 'Últimos 30 días', '90': 'Últimos 90 días', '180': 'Últimos 6 meses',
  '365': 'Último año', 'all': 'Todo el historial',
};

const toDate = (s?: string): Date | null => {
  if (!s) return null;
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  return isNaN(d.getTime()) ? null : d;
};

const fmtDate = (s?: string) => {
  const d = toDate(s);
  if (!d) return '-';
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
};

export default function QCDashboardView({ onOpenMenu, currentUser: _currentUser }: Props) {
  const [tab, setTab] = useState<TabKey>('qc');
  const [range, setRange] = useState<RangeKey>('90');
  const [teamFilter, setTeamFilter] = useState<string>('All');

  const [qcList, setQcList] = useState<QCRecord[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teams, setTeams] = useState<NamedDoc[]>([]);
  const [customers, setCustomers] = useState<NamedDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [qcSnap, placesSnap, tasksSnap, teamsSnap, custSnap] = await Promise.all([
        getDocs(collection(db, 'quality_checks')).catch(() => ({ docs: [] as any[] })),
        getDocs(collection(db, 'settings_places')).catch(() => ({ docs: [] as any[] })),
        getDocs(collection(db, 'settings_tasks')).catch(() => ({ docs: [] as any[] })),
        getDocs(collection(db, 'settings_teams')).catch(() => ({ docs: [] as any[] })),
        getDocs(collection(db, 'customers')).catch(() => ({ docs: [] as any[] })),
      ]);
      setQcList(((qcSnap as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })) as QCRecord[]);
      setPlaces(((placesSnap as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })) as Place[]);
      setTasks(((tasksSnap as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })) as Task[]);
      setTeams(((teamsSnap as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })) as NamedDoc[]);
      setCustomers(((custSnap as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })) as NamedDoc[]);
    } catch (e) {
      console.error('Error cargando dashboard QC:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // --- Mapas de resolución ---
  const taskMap = useMemo(() => {
    const m = new Map<string, Task>();
    tasks.forEach(t => m.set(String(t.id), t));
    return m;
  }, [tasks]);
  const placeMap = useMemo(() => {
    const m = new Map<string, string>();
    places.forEach(p => m.set(String(p.id), p.name));
    return m;
  }, [places]);
  const teamName = (idOrName?: string) => {
    if (!idOrName) return 'Sin equipo';
    const f = teams.find(t => String(t.id) === String(idOrName) || String(t.name) === String(idOrName));
    return f?.name || String(idOrName);
  };
  const clientName = (idOrName?: string) => {
    if (!idOrName) return 'Desconocido';
    const safe = String(idOrName).toLowerCase().trim();
    const f = customers.find(c => String(c.id).toLowerCase().trim() === safe || String(c.name).toLowerCase().trim() === safe);
    return f?.name || String(idOrName);
  };

  // --- Filtro por rango de fecha + equipo ---
  const rangeStart = useMemo(() => {
    if (range === 'all') return null;
    const d = new Date();
    d.setDate(d.getDate() - Number(range));
    d.setHours(0, 0, 0, 0);
    return d;
  }, [range]);

  const records = useMemo(() => {
    return qcList.filter(q => {
      const d = toDate(q.date);
      if (rangeStart && (!d || d < rangeStart)) return false;
      if (teamFilter !== 'All' && teamName(q.team) !== teamFilter) return false;
      return true;
    });
  }, [qcList, rangeStart, teamFilter, teams]);

  // --- Núcleo: por cada registro, extraer Yes/No por tarea y área ---
  type Parsed = {
    rec: QCRecord;
    yes: number; no: number; corrections: number;
    scores: number[];
    failedTasks: { taskName: string; placeName: string }[]; // tareas marcadas "No"
    noByPlace: Record<string, number>;
    isFailed: boolean;
  };

  const parsed: Parsed[] = useMemo(() => {
    return records.map(rec => {
      let yes = 0, no = 0, corrections = 0;
      const scores: number[] = [];
      const failedTasks: { taskName: string; placeName: string }[] = [];
      const noByPlace: Record<string, number> = {};
      const data = rec.qcData || {};
      Object.keys(data).forEach(placeId => {
        const pd = data[placeId] || {};
        const placeName = placeMap.get(String(placeId)) || 'Área';
        if (pd.corrections === 'Yes') corrections++;
        if (typeof pd.score === 'number' && pd.score > 0) scores.push(pd.score);
        const t = pd.tasks || {};
        Object.keys(t).forEach(taskId => {
          const v = t[taskId];
          if (v === 'Yes') yes++;
          else if (v === 'No') {
            no++;
            const tn = taskMap.get(String(taskId))?.name || 'Tarea';
            failedTasks.push({ taskName: tn, placeName });
            noByPlace[placeName] = (noByPlace[placeName] || 0) + 1;
          }
        });
      });
      return { rec, yes, no, corrections, scores, failedTasks, noByPlace, isFailed: rec.result === 'failed' };
    });
  }, [records, taskMap, placeMap]);

  // --- KPIs Quality Check ---
  const kpis = useMemo(() => {
    const totalYes = parsed.reduce((a, p) => a + p.yes, 0);
    const totalNo = parsed.reduce((a, p) => a + p.no, 0);
    const totalAnswered = totalYes + totalNo;
    const qualityScore = totalAnswered ? (totalYes / totalAnswered) * 100 : 0;

    const finished = parsed.filter(p => p.rec.status === 'Finished');
    const failed = parsed.filter(p => p.isFailed);
    const recallRate = finished.length ? (failed.length / finished.length) * 100 : 0;

    const recalledHouses = new Set(failed.map(p => p.rec.houseId));
    const failedHouses = new Set(failed.map(p => p.rec.houseId));
    const passedFirstTime = new Set(
      parsed.filter(p => p.rec.status === 'Finished' && !p.isFailed && !failedHouses.has(p.rec.houseId))
        .map(p => p.rec.houseId)
    );

    const correctionsTotal = parsed.reduce((a, p) => a + p.corrections, 0);
    const noInFailed = failed.reduce((a, p) => a + p.no, 0);
    const avgRecallItems = recalledHouses.size ? noInFailed / recalledHouses.size : 0;

    const allScores = parsed.flatMap(p => p.scores);
    const avgScore = allScores.length ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;

    return {
      qualityScore, recallRate,
      passedFirstTime: passedFirstTime.size,
      homesRecalled: recalledHouses.size,
      corrections: correctionsTotal,
      avgRecallItems, avgScore,
      totalInspections: finished.length,
    };
  }, [parsed]);

  // --- Actividades que más se fallan (tareas "No") ---
  const topFailedTasks = useMemo(() => {
    const m = new Map<string, number>();
    parsed.forEach(p => p.failedTasks.forEach(f => m.set(f.taskName, (m.get(f.taskName) || 0) + 1)));
    return Array.from(m.entries()).map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count).slice(0, 10);
  }, [parsed]);

  // --- Mapa de calor por área (fallos por lugar) ---
  const heatByPlace = useMemo(() => {
    const m = new Map<string, number>();
    parsed.forEach(p => Object.entries(p.noByPlace).forEach(([place, n]) => m.set(place, (m.get(place) || 0) + n)));
    return Array.from(m.entries()).map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count).slice(0, 12);
  }, [parsed]);

  // --- Rendimiento por equipo ---
  const teamPerf = useMemo(() => {
    const map = new Map<string, { homes: Set<string>; yes: number; no: number; recalls: number; scores: number[] }>();
    parsed.forEach(p => {
      const tn = teamName(p.rec.team);
      if (!map.has(tn)) map.set(tn, { homes: new Set(), yes: 0, no: 0, recalls: 0, scores: [] });
      const e = map.get(tn)!;
      e.homes.add(p.rec.houseId);
      e.yes += p.yes; e.no += p.no;
      if (p.isFailed) e.recalls++;
      e.scores.push(...p.scores);
    });
    return Array.from(map.entries()).map(([name, e]) => {
      const answered = e.yes + e.no;
      return {
        name,
        homes: e.homes.size,
        passRate: answered ? Math.round((e.yes / answered) * 100) : 0,
        recalls: e.recalls,
        avgScore: e.scores.length ? (e.scores.reduce((a, b) => a + b, 0) / e.scores.length) : 0,
      };
    }).sort((a, b) => b.recalls - a.recalls || a.passRate - b.passRate);
  }, [parsed, teams]);

  // --- Leaderboard de inspectores ---
  const inspectorBoard = useMemo(() => {
    const map = new Map<string, { homes: Set<string>; count: number }>();
    parsed.forEach(p => {
      const insp = p.rec.inspector || 'Desconocido';
      if (!map.has(insp)) map.set(insp, { homes: new Set(), count: 0 });
      const e = map.get(insp)!;
      e.homes.add(p.rec.houseId); e.count++;
    });
    return Array.from(map.entries()).map(([name, e]) => ({ name, homes: e.homes.size, count: e.count }))
      .sort((a, b) => b.count - a.count).slice(0, 6);
  }, [parsed]);

  // --- Tendencia (recall rate por semana) ---
  const trend = useMemo(() => {
    const buckets = new Map<string, { finished: number; failed: number; order: number }>();
    parsed.forEach(p => {
      const d = toDate(p.rec.date);
      if (!d) return;
      // semana (lunes) como clave
      const day = (d.getDay() + 6) % 7;
      const monday = new Date(d); monday.setDate(d.getDate() - day); monday.setHours(0, 0, 0, 0);
      const key = `${String(monday.getMonth() + 1).padStart(2, '0')}/${String(monday.getDate()).padStart(2, '0')}`;
      const order = monday.getTime();
      if (!buckets.has(key)) buckets.set(key, { finished: 0, failed: 0, order });
      const e = buckets.get(key)!;
      if (p.rec.status === 'Finished') e.finished++;
      if (p.isFailed) e.failed++;
    });
    return Array.from(buckets.entries())
      .map(([label, e]) => ({ label, rate: e.finished ? (e.failed / e.finished) * 100 : 0, failed: e.failed }))
      .sort((a, b) => (buckets.get(a.label)!.order - buckets.get(b.label)!.order))
      .slice(-12);
  }, [parsed]);

  // --- Datos del tab Recall ---
  const recall = useMemo(() => {
    const failed = parsed.filter(p => p.isFailed);
    const byTeam = new Map<string, number>();
    const byPlace = new Map<string, number>();
    const byTask = new Map<string, number>();
    const houseFailCount = new Map<string, number>();
    failed.forEach(p => {
      byTeam.set(teamName(p.rec.team), (byTeam.get(teamName(p.rec.team)) || 0) + 1);
      houseFailCount.set(p.rec.houseId, (houseFailCount.get(p.rec.houseId) || 0) + 1);
      p.failedTasks.forEach(f => {
        byTask.set(f.taskName, (byTask.get(f.taskName) || 0) + 1);
        byPlace.set(f.placeName, (byPlace.get(f.placeName) || 0) + 1);
      });
    });
    const sortDesc = (m: Map<string, number>) => Array.from(m.entries())
      .map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    const repeated = Array.from(houseFailCount.values()).filter(v => v > 1).length;
    return {
      total: failed.length,
      byTeam: sortDesc(byTeam),
      byPlace: sortDesc(byPlace).slice(0, 12),
      byTask: sortDesc(byTask).slice(0, 10),
      repeated,
      list: failed.map(p => ({
        id: p.rec.id, date: p.rec.date, client: clientName(p.rec.client), address: p.rec.address,
        team: teamName(p.rec.team), inspector: p.rec.inspector || 'Desconocido', items: p.no,
      })).sort((a, b) => (toDate(b.date)?.getTime() || 0) - (toDate(a.date)?.getTime() || 0)),
    };
  }, [parsed, teams, customers]);

  // ====================== UI HELPERS ======================
  const KPICard = ({ icon: Icon, label, value, sub, color, tone }: any) => (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
        <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: `${color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={17} color={color} />
        </div>
      </div>
      <div style={{ fontSize: '1.9rem', fontWeight: 800, color: tone || '#0f172a', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 500 }}>{sub}</div>}
    </div>
  );

  const BarList = ({ data, color, unit = '' }: { data: { name: string; count: number }[]; color: string; unit?: string }) => {
    const max = Math.max(1, ...data.map(d => d.count));
    if (data.length === 0) return <Empty text="Sin datos en este periodo." />;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 44px', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.name}>{d.name}</span>
            <div style={{ background: '#f1f5f9', borderRadius: '8px', height: '14px', overflow: 'hidden' }}>
              <div style={{ width: `${(d.count / max) * 100}%`, height: '100%', background: color, borderRadius: '8px', transition: 'width 0.4s' }} />
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', textAlign: 'right' }}>{d.count}{unit}</span>
          </div>
        ))}
      </div>
    );
  };

  const HeatList = ({ data }: { data: { name: string; count: number }[] }) => {
    const max = Math.max(1, ...data.map(d => d.count));
    if (data.length === 0) return <Empty text="Sin fallos registrados." />;
    const colorFor = (ratio: number) => {
      if (ratio > 0.66) return { bg: '#fee2e2', bar: '#ef4444', txt: '#991b1b' };
      if (ratio > 0.33) return { bg: '#fef3c7', bar: '#f59e0b', txt: '#92400e' };
      return { bg: '#dcfce7', bar: '#16a34a', txt: '#166534' };
    };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {data.map((d, i) => {
          const ratio = d.count / max;
          const c = colorFor(ratio);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: c.bg, borderRadius: '8px', padding: '8px 12px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: c.txt, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.name}>{d.name}</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: c.txt, flexShrink: 0, marginLeft: '8px' }}>{d.count}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const TrendChart = ({ data }: { data: { label: string; rate: number; failed: number }[] }) => {
    if (data.length === 0) return <Empty text="Sin datos suficientes para la tendencia." />;
    const W = 640, H = 180, padX = 36, padY = 24;
    const max = Math.max(10, ...data.map(d => d.rate));
    const stepX = data.length > 1 ? (W - padX * 2) / (data.length - 1) : 0;
    const x = (i: number) => padX + i * stepX;
    const y = (v: number) => H - padY - (v / max) * (H - padY * 2);
    const pts = data.map((d, i) => `${x(i)},${y(d.rate)}`).join(' ');
    const area = `${padX},${H - padY} ${pts} ${x(data.length - 1)},${H - padY}`;
    return (
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: '480px', height: 'auto' }}>
          {[0, 0.5, 1].map((g, i) => (
            <line key={i} x1={padX} x2={W - padX} y1={y(max * g)} y2={y(max * g)} stroke="#eef2f7" strokeWidth={1} />
          ))}
          <polygon points={area} fill="#3b82f615" />
          <polyline points={pts} fill="none" stroke={PALETTE.blue} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(d.rate)} r={3.5} fill="#fff" stroke={PALETTE.blue} strokeWidth={2} />
              <text x={x(i)} y={H - 6} fontSize={9} fill="#94a3b8" textAnchor="middle">{d.label}</text>
            </g>
          ))}
          <text x={padX - 6} y={y(max)} fontSize={9} fill="#cbd5e1" textAnchor="end">{Math.round(max)}%</text>
          <text x={padX - 6} y={y(0)} fontSize={9} fill="#cbd5e1" textAnchor="end">0%</text>
        </svg>
      </div>
    );
  };

  const Card = ({ title, icon: Icon, color, children, hint }: any) => (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '18px', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: hint ? '4px' : '16px' }}>
        {Icon && <Icon size={18} color={color || PALETTE.blue} />}
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{title}</h3>
      </div>
      {hint && <p style={{ margin: '0 0 14px 0', fontSize: '0.8rem', color: '#94a3b8' }}>{hint}</p>}
      {children}
    </div>
  );

  const Empty = ({ text }: { text: string }) => (
    <div style={{ textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', padding: '24px', fontSize: '0.88rem' }}>{text}</div>
  );

  const num = (n: number, dec = 0) => n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  // ====================== RENDER ======================
  return (
    <div className="fade-in" style={{ padding: '20px', boxSizing: 'border-box' }}>
      <style>{`
        .qcd-grid-kpi { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; }
        .qcd-grid-2 { display: grid; grid-template-columns: 1.4fr 1fr; gap: 18px; }
        .qcd-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        @media (max-width: 980px) { .qcd-grid-2, .qcd-grid-3 { grid-template-columns: 1fr; } }
        .qcd-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
        .qcd-tabs { display: inline-flex; background: #f1f5f9; border: 1px solid #e5e7eb; border-radius: 12px; padding: 4px; gap: 2px; }
        .qcd-tab { border: none; background: transparent; cursor: pointer; padding: 9px 20px; border-radius: 9px; font-weight: 700; font-size: 0.88rem; color: #64748b; transition: all 0.15s; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
        .qcd-tab.active { background: #fff; color: #1d4ed8; box-shadow: 0 1px 2px rgba(15,23,42,0.1); }
        .qcd-tab.active.recall { color: #6d28d9; }
        .qcd-sel { height: 40px; border: 1px solid #e5e7eb; border-radius: 10px; padding: 0 12px; background: #fff; color: #334155; font-weight: 600; font-size: 0.85rem; cursor: pointer; outline: none; }
        .qcd-table { width: 100%; border-collapse: collapse; }
        .qcd-table th { background: #f8fafc; padding: 10px 14px; text-align: left; font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #e5e7eb; }
        .qcd-table td { padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-size: 0.88rem; color: #1e293b; }
      `}</style>

      {/* HEADER */}
      <header style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
        <button onClick={onOpenMenu} aria-label="Open menu" style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, color: '#0f172a', fontSize: '1.7rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BarChart3 size={24} color={PALETTE.indigo} /> Quality Control Dashboard
          </h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '0.92rem' }}>Indicadores de gestión · {RANGE_LABEL[range]}{teamFilter !== 'All' ? ` · ${teamFilter}` : ''}</p>
        </div>
        <button onClick={loadData} title="Actualizar" style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.85rem' }}>
          <RefreshCw size={15} className={loading ? 'spin' : ''} /> <span style={{ }}>Actualizar</span>
        </button>
      </header>

      {/* TOOLBAR: tabs + filtros */}
      <div className="qcd-toolbar">
        <div className="qcd-tabs">
          <button className={`qcd-tab ${tab === 'qc' ? 'active' : ''}`} onClick={() => setTab('qc')}><ShieldCheck size={16} /> Quality Check</button>
          <button className={`qcd-tab recall ${tab === 'recall' ? 'active' : ''}`} onClick={() => setTab('recall')}><Repeat size={16} /> Recall</button>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={15} color="#94a3b8" />
            <select className="qcd-sel" value={range} onChange={e => setRange(e.target.value as RangeKey)}>
              <option value="30">Últimos 30 días</option>
              <option value="90">Últimos 90 días</option>
              <option value="180">Últimos 6 meses</option>
              <option value="365">Último año</option>
              <option value="all">Todo el historial</option>
            </select>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={15} color="#94a3b8" />
            <select className="qcd-sel" value={teamFilter} onChange={e => setTeamFilter(e.target.value)}>
              <option value="All">Todos los equipos</option>
              {teams.map(t => <option key={t.id} value={t.name || t.id}>{t.name || t.id}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>Cargando indicadores…</div>
      ) : records.length === 0 ? (
        <Empty text="No hay Quality Checks en este periodo. Cambia el rango de fechas o el equipo." />
      ) : tab === 'qc' ? (
        // ======================= TAB QUALITY CHECK =======================
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="qcd-grid-kpi">
            <KPICard icon={ShieldCheck} label="Quality Score" value={`${num(kpis.qualityScore, 1)}%`} sub="Tareas aprobadas (Yes)" color={PALETTE.green} tone={kpis.qualityScore >= 90 ? '#16a34a' : kpis.qualityScore >= 75 ? '#b45309' : '#b91c1c'} />
            <KPICard icon={HomeIcon} label="Pasaron 1ª vez" value={num(kpis.passedFirstTime)} sub="Casas sin recall" color={PALETTE.blue} />
            <KPICard icon={AlertTriangle} label="Casas con recall" value={num(kpis.homesRecalled)} sub="No pasaron QC" color={PALETTE.red} tone="#b91c1c" />
            <KPICard icon={Wrench} label="Correcciones in situ" value={num(kpis.corrections)} sub="Áreas corregidas" color={PALETTE.amber} />
            <KPICard icon={TrendingUp} label="Tasa de recall" value={`${num(kpis.recallRate, 1)}%`} sub={`${kpis.totalInspections} inspecciones`} color={PALETTE.purple} tone={kpis.recallRate <= 5 ? '#16a34a' : '#b91c1c'} />
            <KPICard icon={Layers} label="Ítems recall/casa" value={num(kpis.avgRecallItems, 1)} sub="Promedio de fallos" color={PALETTE.indigo} />
          </div>

          {/* Actividades que no se hacen + tendencia */}
          <div className="qcd-grid-2">
            <Card title="Actividades que más se fallan" icon={XCircle} color={PALETTE.red} hint='Tareas marcadas "No" en las inspecciones — lo que no se está haciendo.'>
              <BarList data={topFailedTasks} color={PALETTE.red} />
            </Card>
            <Card title="Tendencia de tasa de recall" icon={TrendingUp} color={PALETTE.blue} hint="Por semana (menor es mejor).">
              <TrendChart data={trend} />
            </Card>
          </div>

          {/* Heat map por área + leaderboard inspectores */}
          <div className="qcd-grid-2">
            <Card title="Mapa de calor por área" icon={Flame} color={PALETTE.amber} hint="Áreas con más fallos acumulados.">
              <HeatList data={heatByPlace} />
            </Card>
            <Card title="Inspectores" icon={Award} color={PALETTE.purple} hint="Inspecciones realizadas.">
              {inspectorBoard.length === 0 ? <Empty text="Sin inspectores." /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {inspectorBoard.map((ins, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 10px', background: i === 0 ? '#faf5ff' : '#f8fafc', borderRadius: '10px' }}>
                      <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: i === 0 ? '#7c3aed' : '#e2e8f0', color: i === 0 ? '#fff' : '#475569', fontSize: '0.78rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ flex: 1, fontWeight: 600, color: '#1e293b', fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ins.name}</span>
                      <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 700 }}>{ins.count} insp.</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Rendimiento por equipo */}
          <Card title="Rendimiento por equipo" icon={Users} color={PALETTE.blue} hint="Ordenado por más recalls / menor tasa de aprobación.">
            <div style={{ overflowX: 'auto' }}>
              <table className="qcd-table" style={{ minWidth: '560px' }}>
                <thead>
                  <tr>
                    <th>Equipo</th><th style={{ textAlign: 'center' }}>Casas</th>
                    <th style={{ textAlign: 'center' }}>% Aprob.</th>
                    <th style={{ textAlign: 'center' }}>Recalls</th>
                    <th style={{ textAlign: 'center' }}>Score prom.</th>
                  </tr>
                </thead>
                <tbody>
                  {teamPerf.map((t, i) => {
                    const passColor = t.passRate >= 90 ? '#16a34a' : t.passRate >= 75 ? '#b45309' : '#b91c1c';
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 700 }}>{t.name}</td>
                        <td style={{ textAlign: 'center' }}>{t.homes}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 800, color: passColor }}>{t.passRate}%</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 800, color: t.recalls > 0 ? '#b91c1c' : '#16a34a' }}>{t.recalls}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>{t.avgScore ? t.avgScore.toFixed(1) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        // ======================= TAB RECALL =======================
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="qcd-grid-kpi">
            <KPICard icon={Repeat} label="Total recalls" value={num(recall.total)} sub="Casas que no pasaron" color={PALETTE.purple} tone="#6d28d9" />
            <KPICard icon={TrendingUp} label="Tasa de recall" value={`${num(kpis.recallRate, 1)}%`} sub="Sobre inspecciones" color={PALETTE.red} tone={kpis.recallRate <= 5 ? '#16a34a' : '#b91c1c'} />
            <KPICard icon={AlertTriangle} label="Reincidencias" value={num(recall.repeated)} sub="Casas con +1 recall" color={PALETTE.amber} />
            <KPICard icon={MapPin} label="Área más crítica" value={recall.byPlace[0]?.name || '—'} sub={recall.byPlace[0] ? `${recall.byPlace[0].count} fallos` : ''} color={PALETTE.indigo} tone="#1e293b" />
            <KPICard icon={Wrench} label="Tarea más fallada" value={recall.byTask[0]?.name || '—'} sub={recall.byTask[0] ? `${recall.byTask[0].count} veces` : ''} color={PALETTE.red} tone="#1e293b" />
            <KPICard icon={Users} label="Equipo con más recalls" value={recall.byTeam[0]?.name || '—'} sub={recall.byTeam[0] ? `${recall.byTeam[0].count} recalls` : ''} color={PALETTE.blue} tone="#1e293b" />
          </div>

          <div className="qcd-grid-2">
            <Card title="Actividades que causan recall" icon={XCircle} color={PALETTE.red} hint="Tareas falladas en casas que NO pasaron.">
              <BarList data={recall.byTask} color={PALETTE.purple} />
            </Card>
            <Card title="Recalls por equipo" icon={Users} color={PALETTE.blue} hint="Quién genera más recalls.">
              <BarList data={recall.byTeam} color={PALETTE.blue} />
            </Card>
          </div>

          <div className="qcd-grid-2">
            <Card title="Recalls por área" icon={Flame} color={PALETTE.amber} hint="Dónde se concentran los fallos.">
              <HeatList data={recall.byPlace} />
            </Card>
            <Card title="Tendencia de recalls" icon={TrendingUp} color={PALETTE.purple} hint="Tasa semanal de recall.">
              <TrendChart data={trend} />
            </Card>
          </div>

          <Card title="Detalle de recalls" icon={Repeat} color={PALETTE.purple} hint="Casas que no pasaron, más recientes primero.">
            {recall.list.length === 0 ? <Empty text="Sin recalls en este periodo. ¡Bien!" /> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="qcd-table" style={{ minWidth: '700px' }}>
                  <thead>
                    <tr>
                      <th>Fecha</th><th>Cliente</th><th>Dirección</th><th>Equipo</th>
                      <th>Inspector</th><th style={{ textAlign: 'center' }}>Ítems fallados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recall.list.map((r, i) => (
                      <tr key={r.id || i}>
                        <td style={{ color: '#64748b' }}>{fmtDate(r.date)}</td>
                        <td style={{ fontWeight: 700 }}>{r.client}</td>
                        <td style={{ color: '#475569' }}>{r.address}</td>
                        <td>{r.team}</td>
                        <td style={{ color: '#64748b' }}>{r.inspector}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fef2f2', color: '#b91c1c', padding: '3px 10px', borderRadius: '12px', fontWeight: 800, fontSize: '0.8rem' }}>
                            <AlertTriangle size={12} /> {r.items}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #f1f5f9', fontSize: '0.78rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
        <Activity size={13} /> {kpis.totalInspections} inspecciones analizadas · {RANGE_LABEL[range]}
      </div>
    </div>
  );
}