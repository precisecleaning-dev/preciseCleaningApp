import { useState, useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import {
  Repeat, AlertTriangle, Trophy, Award, Users, MapPin, CalendarDays,
  Search, X, TrendingUp, BarChart3, Loader2, ListChecks, FileBarChart, Check, ChevronDown
} from 'lucide-react';
import type { Property, SystemUser } from '../types/index';
import { settingsService } from '../services/settingsService';
import { db } from '../config/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { propertiesService } from '../services/propertiesService';
import { statusHistoryService } from '../services/statusHistoryService';
import PropertyDetailModal from '../components/PropertyDetailModal';
import './RecallsView.css';

/* =========================================================================
   CONFIG / HEURÍSTICAS
   - RECALL_PENALTY_PER: puntos que se restan al rendimiento por cada recall.
   - RECALL_STATUS_HINTS: textos que, si aparecen en un status, lo marcan recall.

   HISTÓRICO PERSISTENTE:
   La lista de recalls se construye principalmente desde `status_history`:
   cada vez que una casa cambió A un status de Recall queda un registro con su
   fecha. Así, aunque la casa pase luego a otro status, la fila permanece como
   histórico ("esta casa estuvo en Recall el día X"). Se complementa con las
   casas que actualmente están en Recall pero aún no tienen historial (legacy)
   y con la colección opcional "recalls".
   ========================================================================= */
const RECALL_PENALTY_PER = 6;
const RECALL_STATUS_HINTS = ['recall', 're-call', 're call', 'recleaning', 're-clean', 'callback', 'call back'];
const isRecallText = (txt?: any): boolean => {
  if (!txt) return false;
  const t = String(txt).toLowerCase();
  return RECALL_STATUS_HINTS.some(h => t.includes(h));
};

interface RecallItem {
  id: string;
  houseId?: string;
  client: string;
  address: string;
  team: string;
  date: string;
  reason: string;
  source: 'history' | 'property' | 'collection';
  enteredAt?: string;
  exitedAt?: string | null;
}

interface TeamStat {
  team: string;
  recalls: number;
  qcCount: number;
  avgPass: number | null;
  overall: number;
}

interface RecallsViewProps {
  onOpenMenu: () => void;
  properties: Property[];
  currentUser?: SystemUser | null;
}

// ⭐ Pill editable de status para la tabla.
// El menú se renderiza con posición FIJA respecto a la pantalla para que no lo
// recorte el overflow de la tabla, con diseño mejorado (encabezado, check del
// status actual, dot de color y scroll si hay muchos status).
function RowStatusPill({ statusId, statuses, onChange, disabled, fullWidth = false }: { statusId?: string; statuses: any[]; onChange: (id: string) => void; disabled?: boolean; fullWidth?: boolean }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; openUp: boolean }>({ top: 0, left: 0, width: 240, openUp: false });
  const btnRef = useRef<HTMLDivElement>(null);

  const safe = String(statusId || '').toLowerCase().trim();
  const st = statuses.find((s: any) => String(s.id).toLowerCase().trim() === safe || String(s.name).toLowerCase().trim() === safe);
  const color = st ? st.color : '#64748b';
  const text = st ? st.name : 'Unassigned';

  const computePosition = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuW = Math.max(240, r.width);
    const menuH = Math.min(statuses.length * 46 + 46, 340);
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < menuH + 12 && r.top > menuH;
    let left = r.left;
    if (left + menuW > window.innerWidth - 12) left = window.innerWidth - menuW - 12;
    if (left < 12) left = 12;
    setCoords({ top: openUp ? r.top - menuH - 8 : r.bottom + 8, left, width: menuW, openUp });
  };

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    if (!open) computePosition();
    setOpen(o => !o);
  };

  // Cerrar al hacer scroll o redimensionar (la posición fija quedaría desfasada)
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <div ref={btnRef} className={`rcv-pill-wrap${fullWidth ? ' full' : ''}`}>
      <div
        onClick={toggle}
        className={`rcv-pill-trigger${fullWidth ? ' full' : ''}${open ? ' open' : ''}${disabled ? ' disabled' : ''}`}
        style={{ '--dot-color': color, '--pill-ring': `${color}22` } as CSSProperties}
      >
        <span className="rcv-pill-label">
          <span className="rcv-pill-dot" />
          <span className="rcv-pill-text">{text}</span>
        </span>
        <ChevronDown size={14} color="#94a3b8" className={`rcv-pill-chevron${open ? ' open' : ''}`} />
      </div>

      {open && (
        <>
          {/* Backdrop transparente para cerrar al hacer clic fuera */}
          <div onClick={(e) => { e.stopPropagation(); setOpen(false); }} className="rcv-pill-backdrop" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="rcv-pill-menu"
            style={{ top: coords.top, left: coords.left, width: coords.width }}
          >
            <div className="rcv-pill-menu-header">
              Cambiar status
            </div>
            <div className="rcv-pill-menu-list">
              {statuses.map((s: any) => {
                const isCurrent = String(s.id) === String(statusId) || String(s.name) === String(statusId);
                return (
                  <div key={s.id}
                    onClick={(e) => { e.stopPropagation(); if (!isCurrent) onChange(s.id); setOpen(false); }}
                    className={`rcv-pill-option${isCurrent ? ' current' : ''}`}>
                    <span className="rcv-pill-option-dot" style={{ '--dot-color': s.color, '--dot-ring': `${s.color}1f` } as CSSProperties} />
                    <span className="rcv-pill-option-name">{s.name}</span>
                    {isCurrent && <Check size={16} color="#16a34a" />}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function RecallsView({ onOpenMenu, properties, currentUser }: RecallsViewProps) {
  const [tab, setTab] = useState<'recalls' | 'report'>('recalls');

  const [teams, setTeams] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [qcList, setQcList] = useState<any[]>([]);
  const [recallDocs, setRecallDocs] = useState<any[]>([]);
  const [historyDocs, setHistoryDocs] = useState<any[]>([]);
  const [loadedProps, setLoadedProps] = useState<Property[]>(properties || []);
  const [detailHouse, setDetailHouse] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);

  const houses = (loadedProps && loadedProps.length) ? loadedProps : (properties || []);

  // Filtros de la TABLA
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('All');
  // Filtros del REPORTE (rango de fechas)
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [teamsData, statusesSnap, customersSnap, qcSnap, recallsSnap, propsSnap, historySnap] = await Promise.all([
          settingsService.getAll('settings_teams').catch(() => []),
          getDocs(collection(db, 'settings_statuses')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'customers')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'quality_checks')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'recalls')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'properties')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'status_history')).catch(() => ({ docs: [] })),
        ]);
        setTeams(teamsData as any[]);
        const propsData = ((propsSnap as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })) as Property[];
        if (propsData.length) setLoadedProps(propsData);
        setStatuses(((statusesSnap as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })));
        setCustomersList(((customersSnap as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })));
        setQcList(((qcSnap as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })));
        setRecallDocs(((recallsSnap as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })));
        setHistoryDocs(((historySnap as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('Error loading recalls data:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ---- Helpers ----
  const getClientName = (idOrName?: string | null): string => {
    if (!idOrName) return 'Unknown';
    const safe = String(idOrName).toLowerCase().trim();
    const f = customersList.find((c: any) => String(c.id).toLowerCase().trim() === safe || String(c.name).toLowerCase().trim() === safe);
    return f ? f.name : String(idOrName);
  };

  const getTeamName = (house?: any): string => {
    if (!house) return 'Unassigned';
    const tid = house.teamId;
    if (tid) {
      const f = teams.find((t: any) => String(t.id) === String(tid) || String(t.name) === String(tid));
      if (f) return f.name;
    }
    if (house.team) {
      const f2 = teams.find((t: any) => String(t.name) === String(house.team) || String(t.id) === String(house.team));
      return f2 ? f2.name : String(house.team);
    }
    return 'Unassigned';
  };

  const getStatusName = (house?: any): string => {
    if (!house) return '';
    const raw = house.statusId ?? house.status;
    if (!raw) return '';
    const safe = String(raw).toLowerCase().trim();
    const f = statuses.find((st: any) => String(st.id).toLowerCase().trim() === safe || String(st.name).toLowerCase().trim() === safe);
    return f ? f.name : String(raw);
  };

  const statusNameById = (id?: string): string => {
    const safe = String(id || '').toLowerCase().trim();
    const f = statuses.find((st: any) => String(st.id).toLowerCase().trim() === safe || String(st.name).toLowerCase().trim() === safe);
    return f ? f.name : String(id || '');
  };

  const formatDate = (d?: string) => {
    if (!d) return '-';
    const parts = String(d).split('T')[0].split('-');
    if (parts.length === 3) { const [y, m, dd] = parts; return `${m.padStart(2, '0')}/${dd.padStart(2, '0')}/${y}`; }
    return String(d);
  };
  // ⭐ Fecha + hora (para entrada/salida de Recall)
  const formatDateTime = (d?: string | null) => {
    if (!d) return '—';
    const str = String(d);
    const hasTime = str.includes('T') || str.includes(':');
    const dt = new Date(str);
    if (isNaN(dt.getTime())) return formatDate(str);
    if (!hasTime) return formatDate(str);
    return dt.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  };
  const dateKey = (d?: string) => String(d || '').split('T')[0]; // YYYY-MM-DD

  // ⭐ Casas cuyo ÚLTIMO Quality Check fue "Did not pass" (result === 'failed').
  // Se usa para enfatizar en Recall que la casa viene de un QC que NO pasó.
  const failedQCHouseIds = useMemo(() => {
    const latestByHouse: Record<string, any> = {};
    (qcList || []).forEach((qc: any) => {
      const hid = String(qc.houseId || '');
      if (!hid) return;
      const prev = latestByHouse[hid];
      const tNew = new Date(qc.date || qc.createdAt || 0).getTime() || 0;
      const tPrev = prev ? (new Date(prev.date || prev.createdAt || 0).getTime() || 0) : -1;
      if (!prev || tNew >= tPrev) latestByHouse[hid] = qc;
    });
    const set = new Set<string>();
    Object.keys(latestByHouse).forEach(hid => {
      if (latestByHouse[hid]?.result === 'failed') set.add(hid);
    });
    return set;
  }, [qcList]);

  const cameFromFailedQC = (houseId?: string): boolean => !!houseId && failedQCHouseIds.has(String(houseId));

  // ⭐ Badge reutilizable: "Vino de QC · No pasó" (morado, mismo tono que Recall)
  const FailedQCBadge = ({ compact = false }: { compact?: boolean }) => (
    <span
      title="Esta casa viene de Quality Check y NO pasó la inspección"
      className={`rcv-failed-qc-badge${compact ? ' compact' : ''}`}
    >
      <Repeat size={compact ? 11 : 12} /> Vino de QC · No pasó
    </span>
  );

  // ⭐ Encuentra cuándo salió de Recall: la primera transición DESDE Recall
  // posterior a la fecha de entrada. Si no existe, sigue en Recall.
  const findRecallExit = (propertyId?: string, enteredAt?: string): string | null => {
    if (!propertyId || !enteredAt) return null;
    const enteredMs = new Date(enteredAt).getTime() || 0;
    const exits = historyDocs
      .filter((h: any) => String(h.propertyId) === String(propertyId) && (new Date(h.changedAt).getTime() || 0) > enteredMs)
      .filter((h: any) => isRecallText(h.fromStatusName) || isRecallText(statusNameById(h.fromStatusId)))
      .sort((a: any, b: any) => (new Date(a.changedAt).getTime() || 0) - (new Date(b.changedAt).getTime() || 0));
    return exits.length ? exits[0].changedAt : null;
  };

  const isRecallProperty = (p: any): boolean => {
    if (!p) return false;
    if (p.isRecall === true || p.recall === true || p.hasRecall === true || p.recalled === true) return true;
    if (typeof p.recallCount === 'number' && p.recallCount > 0) return true;
    const statusName = getStatusName(p);
    const text = [statusName, p.status, p.stage, p.pipelineStatus, p.jobStatus].filter(Boolean).map((x: any) => String(x).toLowerCase()).join(' ');
    return RECALL_STATUS_HINTS.some(h => text.includes(h));
  };

  // ---- Cambio de status desde la tabla (registra en status_history) ----
  const changeStatus = async (houseId: string, prevStatusId: string | undefined, newId: string) => {
    if (!houseId || String(newId) === String(prevStatusId || '')) return;
    try {
      await propertiesService.update(houseId, { statusId: newId } as any);
      const toName = statusNameById(newId);
      await statusHistoryService.log({
        propertyId: houseId,
        fromStatusId: prevStatusId || null,
        fromStatusName: statusNameById(prevStatusId) || null,
        toStatusId: newId,
        toStatusName: toName,
        changedBy: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown',
      });
      setLoadedProps(prev => prev.map(p => p.id === houseId ? { ...p, statusId: newId } as Property : p));
      // Si el nuevo status es Recall, lo agregamos al histórico local para que aparezca al instante
      if (isRecallText(toName)) {
        setHistoryDocs(prev => [...prev, {
          id: `local-${Date.now()}`,
          propertyId: houseId,
          toStatusId: newId,
          toStatusName: toName,
          changedAt: new Date().toISOString(),
          changedBy: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown',
        }]);
      }
    } catch (e) {
      console.error('Error updating status from Recalls:', e);
      alert('No se pudo cambiar el status.');
    }
  };

  // ---- HISTÓRICO PERSISTENTE de recalls ----
  const recallHistory: RecallItem[] = useMemo(() => {
    const items: RecallItem[] = [];
    const housesWithHistory = new Set<string>();

    // 1) Desde status_history: cada transición A Recall = una fila histórica
    historyDocs.forEach((h: any) => {
      if (isRecallText(h.toStatusName) || isRecallText(statusNameById(h.toStatusId))) {
        const house = houses.find((p: any) => p.id === h.propertyId);
        items.push({
          id: `hist-${h.id}`,
          houseId: h.propertyId,
          client: getClientName((house as any)?.client),
          address: (house as any)?.address || '-',
          team: getTeamName(house),
          date: h.changedAt || '',
          reason: 'Recall',
          source: 'history',
          enteredAt: h.changedAt || '',
          exitedAt: findRecallExit(h.propertyId, h.changedAt),
        });
        if (h.propertyId) housesWithHistory.add(String(h.propertyId));
      }
    });

    // 2) Casas actualmente en Recall sin historial (legacy: ocurrió antes del logging)
    houses.forEach((p: any) => {
      if (isRecallProperty(p) && !housesWithHistory.has(String(p.id))) {
        const d = p.recallDate || p.scheduleDate || p.date || p.updatedAt || '';
        items.push({
          id: `prop-${p.id}`,
          houseId: p.id,
          client: getClientName(p.client),
          address: p.address || '-',
          team: getTeamName(p),
          date: d,
          reason: p.recallReason || getStatusName(p) || 'Recall',
          source: 'property',
          enteredAt: d,
          exitedAt: null, // sigue en Recall
        });
      }
    });

    // 3) Colección "recalls" (si se usa)
    recallDocs.forEach((r: any) => {
      const house = houses.find((p: any) => p.id === r.houseId);
      const d = r.date || r.recallDate || r.createdAt || '';
      items.push({
        id: `rec-${r.id}`,
        houseId: r.houseId,
        client: getClientName(r.client || (house as any)?.client),
        address: r.address || (house as any)?.address || '-',
        team: r.team || getTeamName(house),
        date: d,
        reason: r.reason || r.notes || 'Recall',
        source: 'collection',
        enteredAt: d,
        exitedAt: r.exitDate || r.exitedAt || null,
      });
    });

    return items.sort((a, b) => (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyDocs, houses, recallDocs, customersList, teams, statuses]);

  // ---- TABLA: filtro por búsqueda + equipo ----
  const teamOptions = useMemo(() => ['All', ...Array.from(new Set(recallHistory.map(r => r.team)))], [recallHistory]);
  const filteredRecalls = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recallHistory.filter(r => {
      if (teamFilter !== 'All' && r.team !== teamFilter) return false;
      if (!q) return true;
      return [r.client, r.address, r.team, r.reason, formatDate(r.date)].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recallHistory, search, teamFilter]);

  // ---- REPORTE: recalls y QCs filtrados por rango de fechas ----
  const inRange = (d?: string): boolean => {
    const dk = dateKey(d);
    if (!dk) return !(startDate || endDate);
    if (startDate && dk < startDate) return false;
    if (endDate && dk > endDate) return false;
    return true;
  };

  const reportRecalls = useMemo(() => recallHistory.filter(r => inRange(r.date)), [recallHistory, startDate, endDate]);
  const reportQCs = useMemo(() => qcList.filter((qc: any) => inRange(qc.date || qc.createdAt)), [qcList, startDate, endDate]);

  const qcPassRate = (qcData: any): { pass: number; total: number } => {
    let yes = 0, no = 0;
    if (qcData) {
      Object.keys(qcData).forEach(pid => {
        const d = qcData[pid];
        if (!d || !d.tasks) return;
        Object.values(d.tasks).forEach((v: any) => { if (v === 'Yes') yes++; else if (v === 'No') no++; });
      });
    }
    return { pass: yes, total: yes + no };
  };

  const teamStats: TeamStat[] = useMemo(() => {
    const map: Record<string, { recalls: number; qcPassSum: number; qcCount: number }> = {};
    const ensure = (t: string) => { if (!map[t]) map[t] = { recalls: 0, qcPassSum: 0, qcCount: 0 }; return map[t]; };

    teams.forEach((t: any) => ensure(t.name));
    reportRecalls.forEach(r => { ensure(r.team).recalls++; });

    reportQCs.forEach((qc: any) => {
      const house = houses.find((p: any) => p.id === qc.houseId);
      const team = qc.team || getTeamName(house);
      const { pass, total } = qcPassRate(qc.qcData);
      if (total > 0) { const e = ensure(team); e.qcPassSum += (pass / total) * 100; e.qcCount++; }
      else { ensure(team); }
    });

    return Object.keys(map).map(team => {
      const m = map[team];
      const avgPass = m.qcCount > 0 ? Math.round(m.qcPassSum / m.qcCount) : null;
      const base = avgPass != null ? avgPass : 100;
      const overall = Math.max(0, Math.round(base - m.recalls * RECALL_PENALTY_PER));
      return { team, recalls: m.recalls, qcCount: m.qcCount, avgPass, overall };
    }).filter(st => st.recalls > 0 || st.qcCount > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportRecalls, reportQCs, teams, houses]);

  const ranked = useMemo(() => [...teamStats].sort((a, b) => b.overall - a.overall || a.recalls - b.recalls), [teamStats]);
  const byRecalls = useMemo(() => [...teamStats].sort((a, b) => b.recalls - a.recalls), [teamStats]);

  const bestTeam = ranked[0] || null;
  const mostRecallsTeam = byRecalls[0] && byRecalls[0].recalls > 0 ? byRecalls[0] : null;
  const totalRecalls = reportRecalls.length;
  const teamsWithRecalls = teamStats.filter(st => st.recalls > 0).length;
  const maxRecallBar = Math.max(1, ...byRecalls.map(st => st.recalls));

  // ⭐ Lista de casas (agrupadas) en/que estuvieron en Recall, acorde al filtro de
  // fechas del reporte. Las que están AHORA en Recall van primero.
  const reportRecallHouses = useMemo(() => {
    const byHouse: Record<string, { houseId?: string; client: string; address: string; team: string; lastDate: string; lastEntered: string; lastExited: string | null; count: number }> = {};
    reportRecalls.forEach(r => {
      const key = String(r.houseId || r.id);
      if (!byHouse[key]) byHouse[key] = { houseId: r.houseId, client: r.client, address: r.address, team: r.team, lastDate: r.date, lastEntered: r.enteredAt || r.date, lastExited: r.exitedAt || null, count: 0 };
      byHouse[key].count++;
      if ((new Date(r.date).getTime() || 0) > (new Date(byHouse[key].lastDate).getTime() || 0)) {
        byHouse[key].lastDate = r.date;
        byHouse[key].lastEntered = r.enteredAt || r.date;
        byHouse[key].lastExited = r.exitedAt || null;
      }
    });
    return Object.values(byHouse).map(h => {
      const houseObj = houses.find((p: any) => p.id === h.houseId) || null;
      return { ...h, houseObj, current: houseObj ? isRecallProperty(houseObj) : false };
    }).sort((a, b) => (Number(b.current) - Number(a.current)) || ((new Date(b.lastDate).getTime() || 0) - (new Date(a.lastDate).getTime() || 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportRecalls, houses, statuses]);

  const currentlyInRecall = reportRecallHouses.filter(h => h.current).length;

  const scoreColor = (v: number) => v >= 85 ? '#047857' : v >= 70 ? '#b45309' : '#b91c1c';

  return (
    <div className="fade-in recalls-view rcv-page">

      {/* HEADER */}
      <header className="main-header rcv-header">
        <div className="rcv-header-title-group">
          <button className="hamburger-btn rcv-hamburger-btn" onClick={onOpenMenu} aria-label="Open menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div>
            <h1 className="rcv-title">
              <Repeat size={26} color="#7c3aed" /> Recalls
            </h1>
            <p className="rcv-subtitle">Re-cleaning callbacks and team performance ranking</p>
          </div>
        </div>
      </header>

      {/* TABS */}
      <div className="rcv-tabs-wrap">
        <button className={`rc-tab ${tab === 'recalls' ? 'active' : ''}`} onClick={() => setTab('recalls')}>
          <ListChecks size={17} /> Recalls
        </button>
        <button className={`rc-tab ${tab === 'report' ? 'active' : ''}`} onClick={() => setTab('report')}>
          <FileBarChart size={17} /> Reporte
        </button>
      </div>

      {loading ? (
        <div className="rcv-loading">
          <Loader2 size={20} className="rc-spin" /> Loading recall data...
        </div>
      ) : tab === 'recalls' ? (
        /* ====================== SUB-VISTA 1: TABLA ====================== */
        <>
          <div className="rc-toolbar">
            <div className="rc-table-search">
              <Search size={16} color="#9ca3af" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente, dirección, equipo, motivo..." />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Limpiar" className="rcv-clear-search-btn">
                  <X size={16} />
                </button>
              )}
            </div>
            <select className="rc-select" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
              {teamOptions.map(t => <option key={t} value={t}>{t === 'All' ? 'All teams' : t}</option>)}
            </select>
            <span className="rc-count">
              {filteredRecalls.length} registro{filteredRecalls.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* TABLA (escritorio) */}
          <div className="rc-card rc-table-wrap rcv-table-wrap-inner">
            <div className="rcv-table-scroll">
              <table className="rcv-table min-760">
                <thead>
                  <tr>
                    <th className="rcv-th"><Users size={14} className="rcv-th-icon" /> Client</th>
                    <th className="rcv-th"><MapPin size={14} className="rcv-th-icon" /> Address</th>
                    <th className="rcv-th">Team</th>
                    <th className="rcv-th w-180"><CalendarDays size={14} className="rcv-th-icon" /> Entró a Recall</th>
                    <th className="rcv-th w-180">Salió de Recall</th>
                    <th className="rcv-th">Current Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecalls.length === 0 ? (
                    <tr><td colSpan={6} className="rcv-td empty">No recalls found.</td></tr>
                  ) : filteredRecalls.map((r) => {
                    const houseObj = houses.find((p: any) => p.id === r.houseId) || null;
                    const fromQC = cameFromFailedQC(r.houseId);
                    return (
                      <tr key={r.id} onClick={() => houseObj && setDetailHouse(houseObj as Property)} className={`rcv-row${houseObj ? ' clickable' : ''}${fromQC ? ' from-qc' : ''}`}>
                        <td className="rcv-td strong">
                          <div className="rcv-client-cell">
                            {r.client}
                            {fromQC && <FailedQCBadge compact />}
                          </div>
                        </td>
                        <td className="rcv-td muted">{r.address}</td>
                        <td className="rcv-td">
                          <span className="rcv-team-chip">{r.team}</span>
                        </td>
                        <td className="rcv-td nowrap">
                          <span className="rcv-date-entered">
                            <span className="rcv-dot-7 red" /> {formatDateTime(r.enteredAt || r.date)}
                          </span>
                        </td>
                        <td className="rcv-td nowrap">
                          {r.exitedAt ? (
                            <span className="rcv-date-exited">
                              <span className="rcv-dot-7 green" /> {formatDateTime(r.exitedAt)}
                            </span>
                          ) : (
                            <span className="rcv-still-badge">Aún en recall</span>
                          )}
                        </td>
                        <td className="rcv-td" onClick={(e) => e.stopPropagation()}>
                          {houseObj ? (
                            <RowStatusPill statusId={(houseObj as any).statusId} statuses={statuses} onChange={(newId) => changeStatus(houseObj.id, (houseObj as any).statusId, newId)} />
                          ) : <span className="rcv-no-house">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* TARJETAS (móvil) */}
          <div className="rc-cards-wrap rcv-recall-houses-cards">
            {filteredRecalls.length === 0 ? (
              <div className="rc-card rcv-empty-note-30">No recalls found.</div>
            ) : filteredRecalls.map((r) => {
              const houseObj = houses.find((p: any) => p.id === r.houseId) || null;
              const fromQC = cameFromFailedQC(r.houseId);
              return (
                <div key={r.id} className={`rc-card rcv-recall-card${houseObj ? ' clickable' : ''}${fromQC ? ' from-qc' : ''}`} onClick={() => houseObj && setDetailHouse(houseObj as Property)}>
                  <div className="rcv-recall-card-top">
                    <span className="rcv-recall-client-name">{r.client}</span>
                    <span className="rcv-team-chip card rcv-shrink-0">{r.team}</span>
                  </div>

                  {fromQC && <div><FailedQCBadge /></div>}

                  <div className="rcv-address-row">
                    <MapPin size={16} color="#94a3b8" className="rcv-shrink-0" />
                    <span className="rcv-ellipsis">{r.address || '—'}</span>
                  </div>

                  <div className="rcv-mini-grid">
                    <div className="rcv-mini-box entered">
                      <div className="rcv-mini-label entered">Entró a Recall</div>
                      <div className="rcv-mini-value entered">{formatDateTime(r.enteredAt || r.date)}</div>
                    </div>
                    <div className={`rcv-mini-box ${r.exitedAt ? 'exited' : 'still'}`}>
                      <div className={`rcv-mini-label ${r.exitedAt ? 'exited' : 'still'}`}>Salió de Recall</div>
                      <div className={`rcv-mini-value ${r.exitedAt ? 'exited' : 'still'}`}>{r.exitedAt ? formatDateTime(r.exitedAt) : 'Aún en recall'}</div>
                    </div>
                  </div>

                  <div onClick={(e) => e.stopPropagation()}>
                    {houseObj ? (
                      <RowStatusPill fullWidth statusId={(houseObj as any).statusId} statuses={statuses} onChange={(newId) => changeStatus(houseObj.id, (houseObj as any).statusId, newId)} />
                    ) : <span className="rcv-no-house">—</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="rcv-footnote">
            Histórico permanente: se registra la fecha y hora de cuándo cada casa entró a Recall y cuándo salió (vía status_history). Si aún no ha salido, se marca “Aún en recall”. Las marcadas con “Vino de QC · No pasó” llegaron a Recall por no pasar un Quality Check. La columna “Current Status” muestra el status actual y puedes cambiarlo aquí mismo.
          </p>
        </>
      ) : (
        /* ====================== SUB-VISTA 2: REPORTE ====================== */
        <>
          {/* Filtro de fechas */}
          <div className="rc-card rcv-report-filter-card">
            <div className="rcv-date-field">
              <label className="rcv-date-label">Desde</label>
              <input type="date" className="rc-date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="rcv-date-field">
              <label className="rcv-date-label">Hasta</label>
              <input type="date" className="rc-date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            {(startDate || endDate) && (
              <button type="button" onClick={() => { setStartDate(''); setEndDate(''); }} className="rcv-clear-dates-btn">
                <X size={15} /> Limpiar fechas
              </button>
            )}
            <span className="rcv-filter-status-note">
              {startDate || endDate ? 'Reporte filtrado por fechas' : 'Mostrando todo el periodo'}
            </span>
          </div>

          {/* HIGHLIGHTS */}
          <div className="rc-highlights">
            <div className="rc-card rcv-highlight-card best">
              <div className="rcv-highlight-header best">
                <Trophy size={16} /> Best Performing Team
              </div>
              {bestTeam ? (
                <>
                  <div className="rcv-highlight-team-name best">{bestTeam.team}</div>
                  <div className="rcv-highlight-stats-row">
                    <div className="rcv-highlight-stat">Score: <strong className="rcv-highlight-inline-accent">{bestTeam.overall}</strong></div>
                    <div className="rcv-highlight-stat">QC: <strong>{bestTeam.avgPass != null ? bestTeam.avgPass + '%' : '—'}</strong></div>
                    <div className="rcv-highlight-stat">Recalls: <strong>{bestTeam.recalls}</strong></div>
                  </div>
                </>
              ) : <div className="rcv-highlight-empty">No data yet.</div>}
            </div>

            <div className="rc-card rcv-highlight-card worst">
              <div className="rcv-highlight-header worst">
                <AlertTriangle size={16} /> Most Recalls
              </div>
              {mostRecallsTeam ? (
                <>
                  <div className="rcv-highlight-team-name worst">{mostRecallsTeam.team}</div>
                  <div className="rcv-highlight-stats-row">
                    <div className="rcv-highlight-stat">Recalls: <strong className="rcv-highlight-inline-accent-red">{mostRecallsTeam.recalls}</strong></div>
                    <div className="rcv-highlight-stat">QC: <strong>{mostRecallsTeam.avgPass != null ? mostRecallsTeam.avgPass + '%' : '—'}</strong></div>
                    <div className="rcv-highlight-stat">Score: <strong>{mostRecallsTeam.overall}</strong></div>
                  </div>
                </>
              ) : <div className="rcv-highlight-empty">No recalls recorded.</div>}
            </div>
          </div>

          {/* KPIs */}
          <div className="rc-kpis">
            {[
              { label: 'Total Recalls', value: totalRecalls, color: '#7c3aed', Icon: Repeat },
              { label: 'Teams w/ Recalls', value: teamsWithRecalls, color: '#b91c1c', Icon: Users },
              { label: 'Teams Tracked', value: teamStats.length, color: '#2563eb', Icon: BarChart3 },
              { label: 'Avg. Team Score', value: teamStats.length ? Math.round(teamStats.reduce((a, b) => a + b.overall, 0) / teamStats.length) : '—', color: '#047857', Icon: TrendingUp },
            ].map((k, i) => (
              <div key={i} className="rc-card rcv-kpi-card">
                <div className="rcv-kpi-top-row">
                  <div className="rcv-kpi-label">{k.label}</div>
                  <k.Icon size={18} color={k.color} />
                </div>
                <div className="rcv-kpi-value">{k.value}</div>
              </div>
            ))}
          </div>

          {/* RANKING + BAR CHART */}
          <div className="rc-cols">
            <div className="rc-card rcv-ranking-card">
              <h2 className="rcv-ranking-title">
                <Award size={18} color="#2563eb" /> Team Performance Ranking
              </h2>
              <p className="rcv-ranking-hint">Higher Quality Check, fewer recalls = better score.</p>
              {ranked.length === 0 ? (
                <div className="rcv-ranking-empty">No team data available.</div>
              ) : ranked.map((t, i) => (
                <div key={t.team} className={`rcv-ranking-row${i === ranked.length - 1 ? ' last' : ''}`}>
                  <div className={`rcv-ranking-rank${i === 0 ? ' top' : ''}`}>
                    {i + 1}
                  </div>
                  <div className="rcv-ranking-body">
                    <div className="rcv-ranking-top-line">
                      <span className="rcv-ranking-team-name">{t.team}</span>
                      <span className="rcv-ranking-score" style={{ '--score-color': scoreColor(t.overall) } as CSSProperties}>{t.overall}</span>
                    </div>
                    <div className="rcv-ranking-bar-row">
                      <div className="rc-bar-track">
                        <div className="rcv-ranking-bar-fill" style={{ '--bar-width': `${t.overall}%`, '--score-color': scoreColor(t.overall) } as CSSProperties} />
                      </div>
                    </div>
                    <div className="rcv-ranking-meta-row">
                      <span>QC {t.avgPass != null ? t.avgPass + '%' : '—'}</span>
                      <span className="rcv-ranking-meta-recalls" style={{ '--recalls-color': t.recalls > 0 ? '#b91c1c' : '#64748b' } as CSSProperties}>{t.recalls} recall{t.recalls === 1 ? '' : 's'}</span>
                      <span>{t.qcCount} QC{t.qcCount === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rc-card rcv-ranking-card">
              <h2 className="rcv-ranking-title no-hint">
                <AlertTriangle size={18} color="#b91c1c" /> Recalls by Team
              </h2>
              {byRecalls.filter(t => t.recalls > 0).length === 0 ? (
                <div className="rcv-ranking-empty">No recalls recorded.</div>
              ) : byRecalls.filter(t => t.recalls > 0).map((t) => (
                <div key={t.team} className="rcv-recalls-by-team">
                  <div className="rcv-recalls-by-team-top">
                    <span className="rcv-recalls-by-team-name">{t.team}</span>
                    <span className="rcv-recalls-by-team-count">{t.recalls}</span>
                  </div>
                  <div className="rc-bar-track">
                    <div className="rcv-recalls-bar-fill" style={{ '--bar-width': `${(t.recalls / maxRecallBar) * 100}%` } as CSSProperties} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* LISTA DE CASAS EN / QUE ESTUVIERON EN RECALL */}
          <div className="rc-card rcv-recall-houses-card">
            <div className="rcv-recall-houses-header">
              <h2 className="rcv-recall-houses-title">
                <Repeat size={18} color="#7c3aed" /> Casas en / que estuvieron en Recall
              </h2>
              <div className="rcv-recall-houses-stats">
                <span><strong className="red">{currentlyInRecall}</strong> en recall ahora</span>
                <span><strong className="dark">{reportRecallHouses.length}</strong> en total</span>
              </div>
            </div>

            {/* TABLA (escritorio) */}
            <div className="rc-table-wrap rcv-table-scroll">
              <table className="rcv-table min-960">
                <thead>
                  <tr>
                    <th className="rcv-th w-140">Estado</th>
                    <th className="rcv-th">Client</th>
                    <th className="rcv-th">Address</th>
                    <th className="rcv-th">Team</th>
                    <th className="rcv-th w-170">Entró a Recall</th>
                    <th className="rcv-th w-170">Salió de Recall</th>
                    <th className="rcv-th w-60-center">Veces</th>
                    <th className="rcv-th">Current Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRecallHouses.length === 0 ? (
                    <tr><td colSpan={8} className="rcv-td empty">No hay casas en recall en este periodo.</td></tr>
                  ) : reportRecallHouses.map((h) => {
                    const fromQC = cameFromFailedQC(h.houseId);
                    return (
                    <tr key={String(h.houseId || h.client)} onClick={() => h.houseObj && setDetailHouse(h.houseObj as Property)}
                      className={`rcv-recall-row${h.houseObj ? ' clickable' : ''}${h.current ? ' current' : (fromQC ? ' from-qc' : '')}`}>
                      <td className="rcv-td">
                        {h.current ? (
                          <span className="rcv-status-chip current">
                            <span className="rcv-dot-7 red" /> En recall
                          </span>
                        ) : (
                          <span className="rcv-status-chip was">
                            Estuvo
                          </span>
                        )}
                      </td>
                      <td className="rcv-td strong">
                        <div className="rcv-client-cell">
                          {h.client}
                          {fromQC && <FailedQCBadge compact />}
                        </div>
                      </td>
                      <td className="rcv-td muted">{h.address}</td>
                      <td className="rcv-td">
                        <span className="rcv-team-chip">{h.team}</span>
                      </td>
                      <td className="rcv-td nowrap rcv-entered-cell">{formatDateTime(h.lastEntered)}</td>
                      <td className="rcv-td nowrap">
                        {h.lastExited
                          ? <span className="rcv-exited-cell">{formatDateTime(h.lastExited)}</span>
                          : <span className="rcv-still-badge">Aún en recall</span>}
                      </td>
                      <td className={`rcv-td center-tone ${h.count > 1 ? 'high' : 'dark'}`}>{h.count}</td>
                      <td className="rcv-td" onClick={(e) => e.stopPropagation()}>
                        {h.houseObj ? (
                          <RowStatusPill statusId={(h.houseObj as any).statusId} statuses={statuses} onChange={(newId) => changeStatus(h.houseObj!.id, (h.houseObj as any).statusId, newId)} />
                        ) : <span className="rcv-no-house">—</span>}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* TARJETAS (móvil) */}
            <div className="rc-cards-wrap rcv-recall-houses-cards">
              {reportRecallHouses.length === 0 ? (
                <div className="rcv-empty-note-20">No hay casas en recall en este periodo.</div>
              ) : reportRecallHouses.map((h) => {
                const fromQC = cameFromFailedQC(h.houseId);
                return (
                <div key={String(h.houseId || h.client)} onClick={() => h.houseObj && setDetailHouse(h.houseObj as Property)}
                  className={`rcv-recall-card${h.houseObj ? ' clickable' : ''}${h.current ? ' current' : (fromQC ? ' from-qc' : '')}`}>
                  <div className="rcv-recall-card-top">
                    <span className="rcv-recall-client-name">{h.client}</span>
                    {h.current ? (
                      <span className="rcv-status-chip current card rcv-shrink-0">
                        <span className="rcv-dot-7 red" /> En recall
                      </span>
                    ) : (
                      <span className="rcv-status-chip was card rcv-shrink-0">Estuvo</span>
                    )}
                  </div>

                  {fromQC && <div><FailedQCBadge /></div>}

                  <div className="rcv-address-row">
                    <MapPin size={16} color="#94a3b8" className="rcv-shrink-0" />
                    <span className="rcv-ellipsis">{h.address || '—'}</span>
                  </div>

                  <div className="rcv-recall-card-team-row">
                    <span className="rcv-team-chip">{h.team}</span>
                    <span className="rcv-count-text">Veces en recall: <strong className={h.count > 1 ? 'high' : ''}>{h.count}</strong></span>
                  </div>

                  <div className="rcv-mini-grid">
                    <div className="rcv-mini-box entered">
                      <div className="rcv-mini-label entered">Entró a Recall</div>
                      <div className="rcv-mini-value entered">{formatDateTime(h.lastEntered)}</div>
                    </div>
                    <div className={`rcv-mini-box ${h.lastExited ? 'exited' : 'still'}`}>
                      <div className={`rcv-mini-label ${h.lastExited ? 'exited' : 'still'}`}>Salió de Recall</div>
                      <div className={`rcv-mini-value ${h.lastExited ? 'exited' : 'still'}`}>{h.lastExited ? formatDateTime(h.lastExited) : 'Aún en recall'}</div>
                    </div>
                  </div>

                  <div onClick={(e) => e.stopPropagation()}>
                    {h.houseObj ? (
                      <RowStatusPill fullWidth statusId={(h.houseObj as any).statusId} statuses={statuses} onChange={(newId) => changeStatus(h.houseObj!.id, (h.houseObj as any).statusId, newId)} />
                    ) : <span className="rcv-no-house">—</span>}
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          <p className="rcv-footnote tight">
            Score = Quality Check pass rate − ({RECALL_PENALTY_PER} × recalls). El reporte considera los recalls y Quality Checks dentro del rango de fechas seleccionado.
          </p>
        </>
      )}

      <PropertyDetailModal
        property={detailHouse}
        onClose={() => setDetailHouse(null)}
        currentUser={currentUser}
        canEdit={true}
      />
    </div>
  );
}