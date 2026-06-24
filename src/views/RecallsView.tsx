import { useState, useEffect, useMemo, useRef } from 'react';
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
    <div ref={btnRef} style={{ position: 'relative', display: fullWidth ? 'block' : 'inline-block', width: fullWidth ? '100%' : 'auto' }}>
      <div
        onClick={toggle}
        style={{ background: '#fff', color: '#111827', padding: '6px 10px 6px 12px', borderRadius: fullWidth ? '12px' : '20px', fontSize: '0.8rem', fontWeight: 600, display: fullWidth ? 'flex' : 'inline-flex', alignItems: 'center', justifyContent: fullWidth ? 'space-between' : 'flex-start', gap: '8px', width: fullWidth ? '100%' : 'auto', boxSizing: 'border-box', cursor: disabled ? 'not-allowed' : 'pointer', border: `1px solid ${open ? color : '#e5e7eb'}`, boxShadow: open ? `0 0 0 3px ${color}22` : '0 1px 2px rgba(0,0,0,0.05)', whiteSpace: 'nowrap', transition: 'all .15s' }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
        </span>
        <ChevronDown size={14} color="#94a3b8" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }} />
      </div>

      {open && (
        <>
          {/* Backdrop transparente para cerrar al hacer clic fuera */}
          <div onClick={(e) => { e.stopPropagation(); setOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 1000 }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', top: coords.top, left: coords.left, width: coords.width,
              background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px',
              boxShadow: '0 16px 40px rgba(0,0,0,0.18)', zIndex: 1001, overflow: 'hidden',
              animation: 'rc-pop .12s ease-out',
            }}
          >
            <div style={{ padding: '10px 14px', fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
              Cambiar status
            </div>
            <div style={{ maxHeight: '290px', overflowY: 'auto' }}>
              {statuses.map((s: any) => {
                const isCurrent = String(s.id) === String(statusId) || String(s.name) === String(statusId);
                return (
                  <div key={s.id}
                    onClick={(e) => { e.stopPropagation(); if (!isCurrent) onChange(s.id); setOpen(false); }}
                    style={{ padding: '11px 14px', fontSize: '0.88rem', color: '#111827', display: 'flex', alignItems: 'center', gap: '10px', cursor: isCurrent ? 'default' : 'pointer', borderBottom: '1px solid #f6f7f9', background: isCurrent ? '#f8fafc' : 'transparent', fontWeight: isCurrent ? 700 : 500 }}
                    onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = '#f1f5f9'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = isCurrent ? '#f8fafc' : 'transparent'; }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: s.color, flexShrink: 0, boxShadow: `0 0 0 3px ${s.color}1f` }} />
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
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
      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#7c3aed', color: '#fff', padding: compact ? '3px 8px' : '4px 10px', borderRadius: '10px', fontSize: compact ? '0.66rem' : '0.7rem', fontWeight: 800, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.03em' }}
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

  const s = {
    th: { backgroundColor: '#f9fafb', padding: '12px 16px', color: '#6b7280', fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb', textAlign: 'left' as const },
    td: { padding: '12px 16px', borderBottom: '1px solid #f1f5f9', color: '#111827', fontSize: '0.92rem' },
  };

  return (
    <div className="fade-in recalls-view" style={{ padding: '20px', boxSizing: 'border-box' }}>
      <style>{`
        .rc-spin { animation: rc-spin 1s linear infinite; }
        @keyframes rc-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes rc-pop { from { opacity: 0; transform: translateY(-4px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .rc-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
        .rc-highlights { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px; }
        .rc-cols { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 16px; margin-bottom: 24px; align-items: start; }
        .rc-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .rc-bar-track { flex: 1; height: 10px; background: #f1f5f9; border-radius: 6px; overflow: hidden; }
        .rc-table-search { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #e5e7eb; border-radius: 20px; padding: 0 16px; height: 42px; flex: 1; min-width: 240px; }
        .rc-table-search input { flex: 1; border: none; outline: none; background: transparent; color: #111827; font-size: 0.9rem; min-width: 0; }
        .rc-select { height: 42px; border: 1px solid #e5e7eb; border-radius: 20px; padding: 0 14px; background: #fff; color: #374151; font-size: 0.9rem; cursor: pointer; outline: none; }
        .rc-tab { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 10px; border: 1px solid transparent; background: transparent; color: #64748b; font-weight: 600; font-size: 0.92rem; cursor: pointer; transition: all .15s; }
        .rc-tab.active { background: #fff; color: #7c3aed; border-color: #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
        .rc-date { height: 42px; border: 1px solid #e5e7eb; border-radius: 10px; padding: 0 12px; background: #fff; color: #374151; font-size: 0.9rem; outline: none; }

        /* Por defecto (escritorio): tablas visibles, tarjetas ocultas */
        .rc-cards-wrap { display: none; }
        .recalls-view { overflow-x: hidden; max-width: 100%; }

        @media (max-width: 900px) {
          .rc-kpis { grid-template-columns: repeat(2, 1fr); }
          .rc-highlights { grid-template-columns: 1fr; }
          .rc-cols { grid-template-columns: 1fr; }
        }

        /* ====== MÓVIL: tarjetas en vez de tablas, sin scroll horizontal ====== */
        @media (max-width: 820px) {
          html, body { overflow-x: hidden; max-width: 100%; }
          .recalls-view { padding: 14px !important; }
          .rc-table-wrap { display: none !important; }
          .rc-cards-wrap { display: flex !important; }
          .rc-toolbar { flex-direction: column; align-items: stretch !important; }
          .rc-table-search { width: 100%; }
          .rc-select { width: 100%; }
          .rc-toolbar .rc-count { margin-left: 0 !important; }
        }

        @media (max-width: 560px) {
          .rc-kpis { grid-template-columns: 1fr; }
          .recalls-view { padding: 10px !important; }
        }
      `}</style>

      {/* HEADER */}
      <header className="main-header" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="hamburger-btn" onClick={onOpenMenu} aria-label="Open menu" style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', flexShrink: 0 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div>
            <h1 style={{ margin: 0, color: '#111827', fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Repeat size={26} color="#7c3aed" /> Recalls
            </h1>
            <p style={{ marginTop: '4px', color: '#6b7280' }}>Re-cleaning callbacks and team performance ranking</p>
          </div>
        </div>
      </header>

      {/* TABS */}
      <div style={{ display: 'inline-flex', gap: '6px', background: '#f1f5f9', padding: '5px', borderRadius: '12px', marginBottom: '20px' }}>
        <button className={`rc-tab ${tab === 'recalls' ? 'active' : ''}`} onClick={() => setTab('recalls')}>
          <ListChecks size={17} /> Recalls
        </button>
        <button className={`rc-tab ${tab === 'report' ? 'active' : ''}`} onClick={() => setTab('report')}>
          <FileBarChart size={17} /> Reporte
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <Loader2 size={20} className="rc-spin" /> Loading recall data...
        </div>
      ) : tab === 'recalls' ? (
        /* ====================== SUB-VISTA 1: TABLA ====================== */
        <>
          <div className="rc-toolbar" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
            <div className="rc-table-search">
              <Search size={16} color="#9ca3af" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente, dirección, equipo, motivo..." />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Limpiar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}>
                  <X size={16} />
                </button>
              )}
            </div>
            <select className="rc-select" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
              {teamOptions.map(t => <option key={t} value={t}>{t === 'All' ? 'All teams' : t}</option>)}
            </select>
            <span className="rc-count" style={{ fontSize: '0.82rem', color: '#94a3b8', marginLeft: 'auto' }}>
              {filteredRecalls.length} registro{filteredRecalls.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* TABLA (escritorio) */}
          <div className="rc-card rc-table-wrap" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '760px' }}>
                <thead>
                  <tr>
                    <th style={s.th}><Users size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} /> Client</th>
                    <th style={s.th}><MapPin size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} /> Address</th>
                    <th style={s.th}>Team</th>
                    <th style={{ ...s.th, width: '180px' }}><CalendarDays size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} /> Entró a Recall</th>
                    <th style={{ ...s.th, width: '180px' }}>Salió de Recall</th>
                    <th style={s.th}>Current Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecalls.length === 0 ? (
                    <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', color: '#6b7280', fontStyle: 'italic', padding: '30px' }}>No recalls found.</td></tr>
                  ) : filteredRecalls.map((r) => {
                    const houseObj = houses.find((p: any) => p.id === r.houseId) || null;
                    const fromQC = cameFromFailedQC(r.houseId);
                    return (
                      <tr key={r.id} onClick={() => houseObj && setDetailHouse(houseObj as Property)} style={{ transition: 'background-color 0.2s', cursor: houseObj ? 'pointer' : 'default', background: fromQC ? '#faf5ff' : 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = fromQC ? '#faf5ff' : 'transparent'}>
                        <td style={{ ...s.td, fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {r.client}
                            {fromQC && <FailedQCBadge compact />}
                          </div>
                        </td>
                        <td style={{ ...s.td, color: '#6b7280' }}>{r.address}</td>
                        <td style={s.td}>
                          <span style={{ backgroundColor: '#ede9fe', color: '#6d28d9', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.team}</span>
                        </td>
                        <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#b45309', fontWeight: 600 }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#dc2626' }} /> {formatDateTime(r.enteredAt || r.date)}
                          </span>
                        </td>
                        <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                          {r.exitedAt ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#047857', fontWeight: 600 }}>
                              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#16a34a' }} /> {formatDateTime(r.exitedAt)}
                            </span>
                          ) : (
                            <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '3px 10px', borderRadius: '12px', fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Aún en recall</span>
                          )}
                        </td>
                        <td style={s.td} onClick={(e) => e.stopPropagation()}>
                          {houseObj ? (
                            <RowStatusPill statusId={(houseObj as any).statusId} statuses={statuses} onChange={(newId) => changeStatus(houseObj.id, (houseObj as any).statusId, newId)} />
                          ) : <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* TARJETAS (móvil) */}
          <div className="rc-cards-wrap" style={{ flexDirection: 'column', gap: '14px' }}>
            {filteredRecalls.length === 0 ? (
              <div className="rc-card" style={{ textAlign: 'center', color: '#6b7280', fontStyle: 'italic', padding: '30px' }}>No recalls found.</div>
            ) : filteredRecalls.map((r) => {
              const houseObj = houses.find((p: any) => p.id === r.houseId) || null;
              const fromQC = cameFromFailedQC(r.houseId);
              return (
                <div key={r.id} className="rc-card" onClick={() => houseObj && setDetailHouse(houseObj as Property)} style={{ padding: '16px', cursor: houseObj ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: '12px', border: `1px solid ${fromQC ? '#ddd6fe' : '#e5e7eb'}`, background: fromQC ? '#faf5ff' : '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                    <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.1rem', lineHeight: 1.25, minWidth: 0 }}>{r.client}</span>
                    <span style={{ flexShrink: 0, backgroundColor: '#ede9fe', color: '#6d28d9', padding: '4px 12px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{r.team}</span>
                  </div>

                  {fromQC && <div><FailedQCBadge /></div>}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#475569' }}>
                    <MapPin size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.address || '—'}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '10px 12px' }}>
                      <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Entró a Recall</div>
                      <div style={{ fontSize: '0.82rem', color: '#b45309', fontWeight: 700, marginTop: '3px' }}>{formatDateTime(r.enteredAt || r.date)}</div>
                    </div>
                    <div style={{ background: r.exitedAt ? '#ecfdf5' : '#fef2f2', border: `1px solid ${r.exitedAt ? '#a7f3d0' : '#fecaca'}`, borderRadius: '10px', padding: '10px 12px' }}>
                      <div style={{ fontSize: '0.66rem', fontWeight: 700, color: r.exitedAt ? '#065f46' : '#991b1b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Salió de Recall</div>
                      <div style={{ fontSize: '0.82rem', color: r.exitedAt ? '#047857' : '#b91c1c', fontWeight: 700, marginTop: '3px' }}>{r.exitedAt ? formatDateTime(r.exitedAt) : 'Aún en recall'}</div>
                    </div>
                  </div>

                  <div onClick={(e) => e.stopPropagation()}>
                    {houseObj ? (
                      <RowStatusPill fullWidth statusId={(houseObj as any).statusId} statuses={statuses} onChange={(newId) => changeStatus(houseObj.id, (houseObj as any).statusId, newId)} />
                    ) : <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <p style={{ marginTop: '14px', fontSize: '0.78rem', color: '#94a3b8' }}>
            Histórico permanente: se registra la fecha y hora de cuándo cada casa entró a Recall y cuándo salió (vía status_history). Si aún no ha salido, se marca “Aún en recall”. Las marcadas con “Vino de QC · No pasó” llegaron a Recall por no pasar un Quality Check. La columna “Current Status” muestra el status actual y puedes cambiarlo aquí mismo.
          </p>
        </>
      ) : (
        /* ====================== SUB-VISTA 2: REPORTE ====================== */
        <>
          {/* Filtro de fechas */}
          <div className="rc-card" style={{ padding: '16px 20px', marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Desde</label>
              <input type="date" className="rc-date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hasta</label>
              <input type="date" className="rc-date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            {(startDate || endDate) && (
              <button type="button" onClick={() => { setStartDate(''); setEndDate(''); }} style={{ height: '42px', padding: '0 16px', borderRadius: '10px', border: '1px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <X size={15} /> Limpiar fechas
              </button>
            )}
            <span style={{ fontSize: '0.82rem', color: '#94a3b8', marginLeft: 'auto' }}>
              {startDate || endDate ? 'Reporte filtrado por fechas' : 'Mostrando todo el periodo'}
            </span>
          </div>

          {/* HIGHLIGHTS */}
          <div className="rc-highlights">
            <div className="rc-card" style={{ padding: '20px', background: 'linear-gradient(135deg, #ecfdf5, #ffffff)', borderColor: '#a7f3d0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#047857', fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Trophy size={16} /> Best Performing Team
              </div>
              {bestTeam ? (
                <>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#065f46', marginTop: '8px' }}>{bestTeam.team}</div>
                  <div style={{ display: 'flex', gap: '18px', marginTop: '10px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '0.85rem', color: '#475569' }}>Score: <strong style={{ color: '#047857' }}>{bestTeam.overall}</strong></div>
                    <div style={{ fontSize: '0.85rem', color: '#475569' }}>QC: <strong>{bestTeam.avgPass != null ? bestTeam.avgPass + '%' : '—'}</strong></div>
                    <div style={{ fontSize: '0.85rem', color: '#475569' }}>Recalls: <strong>{bestTeam.recalls}</strong></div>
                  </div>
                </>
              ) : <div style={{ color: '#94a3b8', marginTop: '10px' }}>No data yet.</div>}
            </div>

            <div className="rc-card" style={{ padding: '20px', background: 'linear-gradient(135deg, #fef2f2, #ffffff)', borderColor: '#fecaca' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b91c1c', fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <AlertTriangle size={16} /> Most Recalls
              </div>
              {mostRecallsTeam ? (
                <>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#991b1b', marginTop: '8px' }}>{mostRecallsTeam.team}</div>
                  <div style={{ display: 'flex', gap: '18px', marginTop: '10px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '0.85rem', color: '#475569' }}>Recalls: <strong style={{ color: '#b91c1c' }}>{mostRecallsTeam.recalls}</strong></div>
                    <div style={{ fontSize: '0.85rem', color: '#475569' }}>QC: <strong>{mostRecallsTeam.avgPass != null ? mostRecallsTeam.avgPass + '%' : '—'}</strong></div>
                    <div style={{ fontSize: '0.85rem', color: '#475569' }}>Score: <strong>{mostRecallsTeam.overall}</strong></div>
                  </div>
                </>
              ) : <div style={{ color: '#94a3b8', marginTop: '10px' }}>No recalls recorded.</div>}
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
              <div key={i} className="rc-card" style={{ padding: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
                  <k.Icon size={18} color={k.color} />
                </div>
                <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#0f172a', marginTop: '6px' }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* RANKING + BAR CHART */}
          <div className="rc-cols">
            <div className="rc-card" style={{ padding: '20px' }}>
              <h2 style={{ margin: '0 0 4px', fontSize: '1.1rem', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Award size={18} color="#2563eb" /> Team Performance Ranking
              </h2>
              <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#94a3b8' }}>Higher Quality Check, fewer recalls = better score.</p>
              {ranked.length === 0 ? (
                <div style={{ color: '#94a3b8', padding: '20px', textAlign: 'center' }}>No team data available.</div>
              ) : ranked.map((t, i) => (
                <div key={t.team} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: i < ranked.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem', background: i === 0 ? '#fef9c3' : '#f1f5f9', color: i === 0 ? '#a16207' : '#64748b', border: i === 0 ? '1px solid #fde68a' : '1px solid #e5e7eb' }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.team}</span>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: scoreColor(t.overall) }}>{t.overall}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                      <div className="rc-bar-track">
                        <div style={{ width: `${t.overall}%`, height: '100%', background: scoreColor(t.overall), borderRadius: '6px' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '14px', marginTop: '6px', fontSize: '0.74rem', color: '#64748b' }}>
                      <span>QC {t.avgPass != null ? t.avgPass + '%' : '—'}</span>
                      <span style={{ color: t.recalls > 0 ? '#b91c1c' : '#64748b' }}>{t.recalls} recall{t.recalls === 1 ? '' : 's'}</span>
                      <span>{t.qcCount} QC{t.qcCount === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rc-card" style={{ padding: '20px' }}>
              <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} color="#b91c1c" /> Recalls by Team
              </h2>
              {byRecalls.filter(t => t.recalls > 0).length === 0 ? (
                <div style={{ color: '#94a3b8', padding: '20px', textAlign: 'center' }}>No recalls recorded.</div>
              ) : byRecalls.filter(t => t.recalls > 0).map((t) => (
                <div key={t.team} style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                    <span style={{ color: '#334155', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.team}</span>
                    <span style={{ color: '#b91c1c', fontWeight: 800 }}>{t.recalls}</span>
                  </div>
                  <div className="rc-bar-track">
                    <div style={{ width: `${(t.recalls / maxRecallBar) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #f87171, #dc2626)', borderRadius: '6px' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* LISTA DE CASAS EN / QUE ESTUVIERON EN RECALL */}
          <div className="rc-card" style={{ overflow: 'hidden', marginBottom: '24px' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Repeat size={18} color="#7c3aed" /> Casas en / que estuvieron en Recall
              </h2>
              <div style={{ display: 'flex', gap: '14px', fontSize: '0.8rem', color: '#64748b' }}>
                <span><strong style={{ color: '#b91c1c' }}>{currentlyInRecall}</strong> en recall ahora</span>
                <span><strong style={{ color: '#0f172a' }}>{reportRecallHouses.length}</strong> en total</span>
              </div>
            </div>

            {/* TABLA (escritorio) */}
            <div className="rc-table-wrap" style={{ overflowX: 'auto', width: '100%' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '960px' }}>
                <thead>
                  <tr>
                    <th style={{ ...s.th, width: '140px' }}>Estado</th>
                    <th style={s.th}>Client</th>
                    <th style={s.th}>Address</th>
                    <th style={s.th}>Team</th>
                    <th style={{ ...s.th, width: '170px' }}>Entró a Recall</th>
                    <th style={{ ...s.th, width: '170px' }}>Salió de Recall</th>
                    <th style={{ ...s.th, width: '60px', textAlign: 'center' }}>Veces</th>
                    <th style={s.th}>Current Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRecallHouses.length === 0 ? (
                    <tr><td colSpan={8} style={{ ...s.td, textAlign: 'center', color: '#6b7280', fontStyle: 'italic', padding: '30px' }}>No hay casas en recall en este periodo.</td></tr>
                  ) : reportRecallHouses.map((h) => {
                    const fromQC = cameFromFailedQC(h.houseId);
                    return (
                    <tr key={String(h.houseId || h.client)} onClick={() => h.houseObj && setDetailHouse(h.houseObj as Property)}
                      style={{ transition: 'background-color 0.2s', cursor: h.houseObj ? 'pointer' : 'default', background: h.current ? '#fef2f2' : (fromQC ? '#faf5ff' : 'transparent') }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = h.current ? '#fee2e2' : '#f8fafc'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = h.current ? '#fef2f2' : (fromQC ? '#faf5ff' : 'transparent')}>
                      <td style={s.td}>
                        {h.current ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fee2e2', color: '#b91c1c', padding: '4px 10px', borderRadius: '12px', fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#dc2626' }} /> En recall
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', color: '#64748b', padding: '4px 10px', borderRadius: '12px', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
                            Estuvo
                          </span>
                        )}
                      </td>
                      <td style={{ ...s.td, fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          {h.client}
                          {fromQC && <FailedQCBadge compact />}
                        </div>
                      </td>
                      <td style={{ ...s.td, color: '#6b7280' }}>{h.address}</td>
                      <td style={s.td}>
                        <span style={{ backgroundColor: '#ede9fe', color: '#6d28d9', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{h.team}</span>
                      </td>
                      <td style={{ ...s.td, color: '#b45309', whiteSpace: 'nowrap' }}>{formatDateTime(h.lastEntered)}</td>
                      <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                        {h.lastExited
                          ? <span style={{ color: '#047857' }}>{formatDateTime(h.lastExited)}</span>
                          : <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '3px 10px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' }}>Aún en recall</span>}
                      </td>
                      <td style={{ ...s.td, textAlign: 'center', fontWeight: 700, color: h.count > 1 ? '#b91c1c' : '#0f172a' }}>{h.count}</td>
                      <td style={s.td} onClick={(e) => e.stopPropagation()}>
                        {h.houseObj ? (
                          <RowStatusPill statusId={(h.houseObj as any).statusId} statuses={statuses} onChange={(newId) => changeStatus(h.houseObj!.id, (h.houseObj as any).statusId, newId)} />
                        ) : <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* TARJETAS (móvil) */}
            <div className="rc-cards-wrap" style={{ flexDirection: 'column', gap: '14px', padding: '14px' }}>
              {reportRecallHouses.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#6b7280', fontStyle: 'italic', padding: '20px' }}>No hay casas en recall en este periodo.</div>
              ) : reportRecallHouses.map((h) => {
                const fromQC = cameFromFailedQC(h.houseId);
                return (
                <div key={String(h.houseId || h.client)} onClick={() => h.houseObj && setDetailHouse(h.houseObj as Property)}
                  style={{ background: h.current ? '#fef2f2' : (fromQC ? '#faf5ff' : '#ffffff'), border: `1px solid ${h.current ? '#fecaca' : (fromQC ? '#ddd6fe' : '#e5e7eb')}`, borderRadius: '14px', padding: '16px', cursor: h.houseObj ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                    <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.1rem', lineHeight: 1.25, minWidth: 0 }}>{h.client}</span>
                    {h.current ? (
                      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fee2e2', color: '#b91c1c', padding: '4px 10px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#dc2626' }} /> En recall
                      </span>
                    ) : (
                      <span style={{ flexShrink: 0, background: '#f1f5f9', color: '#64748b', padding: '4px 10px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>Estuvo</span>
                    )}
                  </div>

                  {fromQC && <div><FailedQCBadge /></div>}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#475569' }}>
                    <MapPin size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.address || '—'}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ backgroundColor: '#ede9fe', color: '#6d28d9', padding: '4px 12px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>{h.team}</span>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Veces en recall: <strong style={{ color: h.count > 1 ? '#b91c1c' : '#0f172a' }}>{h.count}</strong></span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '10px 12px' }}>
                      <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Entró a Recall</div>
                      <div style={{ fontSize: '0.82rem', color: '#b45309', fontWeight: 700, marginTop: '3px' }}>{formatDateTime(h.lastEntered)}</div>
                    </div>
                    <div style={{ background: h.lastExited ? '#ecfdf5' : '#fef2f2', border: `1px solid ${h.lastExited ? '#a7f3d0' : '#fecaca'}`, borderRadius: '10px', padding: '10px 12px' }}>
                      <div style={{ fontSize: '0.66rem', fontWeight: 700, color: h.lastExited ? '#065f46' : '#991b1b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Salió de Recall</div>
                      <div style={{ fontSize: '0.82rem', color: h.lastExited ? '#047857' : '#b91c1c', fontWeight: 700, marginTop: '3px' }}>{h.lastExited ? formatDateTime(h.lastExited) : 'Aún en recall'}</div>
                    </div>
                  </div>

                  <div onClick={(e) => e.stopPropagation()}>
                    {h.houseObj ? (
                      <RowStatusPill fullWidth statusId={(h.houseObj as any).statusId} statuses={statuses} onChange={(newId) => changeStatus(h.houseObj!.id, (h.houseObj as any).statusId, newId)} />
                    ) : <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>}
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          <p style={{ marginTop: '4px', fontSize: '0.78rem', color: '#94a3b8' }}>
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