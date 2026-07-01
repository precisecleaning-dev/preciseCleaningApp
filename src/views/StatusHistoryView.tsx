import { useState, useEffect, useMemo } from 'react';
import {
  History, Search, X, MapPin, ChevronRight, SlidersHorizontal, ArrowUpDown, Filter,
  Repeat, LogIn, LogOut, Users, DollarSign, Receipt, Clock, ArrowRight, Route, Calendar, StickyNote, User
} from 'lucide-react';
import type { Property, Status, Customer } from '../types/index';
import { db } from '../config/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import StatusHistoryPanel from '../components/StatusHistoryPanel';
import { statusHistoryService } from '../services/statusHistoryService';

interface StatusHistoryViewProps {
  onOpenMenu: () => void;
  properties: Property[];
  currentUser?: any;
}

const PAGE_SIZE = 40;

// Colecciones para los totales de la tabla.
// billing_services es seguro (mismo nombre que en HousesView).
// Si tu colección de nómina se llama distinto (p.ej. 'payrolls' o 'payroll_records'),
// solo cambia el valor de PAYROLL_COLLECTION en esta línea.
const BILLING_COLLECTION = 'billing_services';
const PAYROLL_COLLECTION = 'payroll';

const RECALL_STATUS_HINTS = ['recall', 're-call', 're call', 'recleaning', 're-clean', 'callback', 'call back'];
const isRecallText = (txt?: any): boolean => {
  if (!txt) return false;
  const t = String(txt).toLowerCase();
  return RECALL_STATUS_HINTS.some(h => t.includes(h));
};

interface RecallEpisode {
  enteredAt: string;
  enteredBy?: string;
  exitedAt: string | null;
  exitedTo?: string | null;
}

interface JourneyNode {
  name: string;
  color: string;
  at: string | null;
  by?: string;
  duration?: string;
  initial?: boolean;
  isLast?: boolean;
}

export default function StatusHistoryView({ onOpenMenu, properties }: StatusHistoryViewProps) {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [billingByProp, setBillingByProp] = useState<Record<string, { total: number; taxes: number }>>({});
  const [payrollByProp, setPayrollByProp] = useState<Record<string, number>>({});

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'client' | 'address' | 'schedule'>('client');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const [historyAsc, setHistoryAsc] = useState<any[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(collection(db, 'settings_statuses'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Status[];
      setStatuses(data.sort((a, b) => Number((a as any).order || 0) - Number((b as any).order || 0)));
    }, (e) => console.error('Error statuses:', e)));

    unsubs.push(onSnapshot(collection(db, 'customers'), (snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Customer[]);
    }, (e) => console.error('Error customers:', e)));

    unsubs.push(onSnapshot(collection(db, 'settings_teams'), (snap) => {
      setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (e) => console.error('Error teams:', e)));

    // Suma de facturación por propiedad (Total + Taxes)
    unsubs.push(onSnapshot(collection(db, BILLING_COLLECTION), (snap) => {
      const map: Record<string, { total: number; taxes: number }> = {};
      snap.docs.forEach(d => {
        const r: any = d.data();
        const pid = String(r.propertyId || '');
        if (!pid) return;
        if (!map[pid]) map[pid] = { total: 0, taxes: 0 };
        map[pid].total += Number(r.total) || 0;
        map[pid].taxes += Number(r.taxAmount) || 0;
      });
      setBillingByProp(map);
    }, (e) => console.error('Error billing:', e)));

    // Suma de nómina por propiedad (Payroll)
    unsubs.push(onSnapshot(collection(db, PAYROLL_COLLECTION), (snap) => {
      const map: Record<string, number> = {};
      snap.docs.forEach(d => {
        const r: any = d.data();
        const pid = String(r.propertyId || '');
        if (!pid) return;
        map[pid] = (map[pid] || 0) + (Number(r.totalAmount) || 0);
      });
      setPayrollByProp(map);
    }, (e) => console.error('Error payroll (revisa PAYROLL_COLLECTION):', e)));

    return () => unsubs.forEach(u => u());
  }, []);

  // ---------- Helpers ----------
  const getClientName = (idOrName?: string | null) => {
    if (!idOrName) return 'Unknown';
    const safe = String(idOrName).toLowerCase().trim();
    const f = customers.find((c: any) => String(c.id).toLowerCase().trim() === safe || String(c.name).toLowerCase().trim() === safe);
    return f ? f.name : String(idOrName);
  };
  const statusName = (idOrName?: string | null) => {
    if (!idOrName) return '—';
    const safe = String(idOrName).toLowerCase().trim();
    const st = statuses.find(s => String(s.id).toLowerCase().trim() === safe || String(s.name).toLowerCase().trim() === safe);
    return st?.name || String(idOrName);
  };
  const statusColor = (idOrName?: string | null) => {
    if (!idOrName) return '#94a3b8';
    const safe = String(idOrName).toLowerCase().trim();
    const st = statuses.find(s => String(s.id).toLowerCase().trim() === safe || String(s.name).toLowerCase().trim() === safe);
    return st?.color || '#64748b';
  };
  const teamInfo = (idOrName?: string | null) => {
    if (!idOrName) return null;
    const safe = String(idOrName).toLowerCase().trim();
    const t = teams.find((x: any) => String(x.id).toLowerCase().trim() === safe || String(x.name).toLowerCase().trim() === safe);
    return t ? { name: t.name as string, color: (t.color as string) || '#64748b' } : { name: String(idOrName), color: '#64748b' };
  };

  const fmtMoney = (n?: number) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const invoicePill = (status?: string | null) => {
    const v = String(status || '').toLowerCase().trim();
    if (v === 'paid') return { label: 'Paid', bg: '#dcfce7', color: '#15803d', border: '#86efac' };
    if (v === 'pre-paid') return { label: 'Pre-Paid', bg: '#ccfbf1', color: '#0f766e', border: '#5eead4' };
    if (v === 'pending') return { label: 'Pending', bg: '#fef9c3', color: '#a16207', border: '#fde047' };
    if (v === 'needs invoice') return { label: 'Needs Invoice', bg: '#ffedd5', color: '#c2410c', border: '#fdba74' };
    return { label: status ? String(status) : 'No status', bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' };
  };

  const formatDateTime = (d?: string | null) => {
    if (!d) return '—';
    const str = String(d);
    const dt = new Date(str);
    if (isNaN(dt.getTime())) return str;
    return dt.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const formatDuration = (from?: string | null, to?: string | null) => {
    if (!from) return '';
    const a = new Date(from).getTime();
    const b = to ? new Date(to).getTime() : Date.now();
    if (isNaN(a) || isNaN(b) || b < a) return '';
    let mins = Math.floor((b - a) / 60000);
    const days = Math.floor(mins / 1440); mins -= days * 1440;
    const hrs = Math.floor(mins / 60); mins -= hrs * 60;
    const parts: string[] = [];
    if (days) parts.push(`${days}d`);
    if (hrs) parts.push(`${hrs}h`);
    if (!days && mins) parts.push(`${mins}m`);
    return parts.join(' ') || '0m';
  };

  // ---------- Datos derivados ----------
  const hasFilter = search.trim().length > 0 || statusFilter.length > 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (properties || [])
      .filter(p => {
        if (statusFilter) {
          const sid = String(p.statusId || '').toLowerCase().trim();
          const sName = statusName(p.statusId).toLowerCase().trim();
          if (sid !== statusFilter.toLowerCase() && sName !== statusFilter.toLowerCase()) return false;
        }
        if (!q) return true;
        return [getClientName(p.client), p.address, (p as any).note].filter(Boolean).join(' ').toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (sortBy === 'address') return String(a.address || '').localeCompare(String(b.address || ''));
        if (sortBy === 'schedule') return String(b.scheduleDate || '').localeCompare(String(a.scheduleDate || ''));
        return getClientName(a.client).localeCompare(getClientName(b.client));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, search, statusFilter, sortBy, customers, statuses]);

  useEffect(() => { setLimit(PAGE_SIZE); }, [search, statusFilter, sortBy]);

  const visible = filtered.slice(0, limit);
  const selected = (properties || []).find(p => p.id === selectedId) || null;

  // Totales para el pie de la tabla (solo lo filtrado)
  const totals = useMemo(() => {
    return filtered.reduce((acc, p) => {
      const b = billingByProp[p.id] || { total: 0, taxes: 0 };
      acc.total += b.total;
      acc.taxes += b.taxes;
      acc.payroll += payrollByProp[p.id] || 0;
      return acc;
    }, { total: 0, taxes: 0, payroll: 0 });
  }, [filtered, billingByProp, payrollByProp]);

  // ⭐ Carga TODO el historial de la casa seleccionada (ascendente por fecha)
  useEffect(() => {
    if (!selectedId) { setHistoryAsc([]); return; }
    let active = true;
    (async () => {
      setEpisodesLoading(true);
      try {
        const entries = await statusHistoryService.getByProperty(selectedId);
        const asc = [...(entries || [])].sort((a: any, b: any) => (new Date(a.changedAt).getTime() || 0) - (new Date(b.changedAt).getTime() || 0));
        if (active) setHistoryAsc(asc);
      } catch (err) {
        console.error('Error loading history:', err);
        if (active) setHistoryAsc([]);
      } finally {
        if (active) setEpisodesLoading(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, statuses]);

  // Recorrido completo: cada estado por el que pasó, en orden cronológico
  const journey = useMemo<JourneyNode[]>(() => {
    if (!historyAsc.length) return [];
    const nodes: JourneyNode[] = [];
    const first: any = historyAsc[0];
    if (first.fromStatusId || first.fromStatusName) {
      nodes.push({
        name: first.fromStatusName || statusName(first.fromStatusId),
        color: statusColor(first.fromStatusId || first.fromStatusName),
        at: null, initial: true,
      });
    }
    historyAsc.forEach((e: any, i: number) => {
      const next: any = historyAsc[i + 1];
      nodes.push({
        name: e.toStatusName || statusName(e.toStatusId),
        color: statusColor(e.toStatusId || e.toStatusName),
        at: e.changedAt,
        by: e.changedBy,
        duration: formatDuration(e.changedAt, next ? next.changedAt : null),
        isLast: !next,
      });
    });
    return nodes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyAsc, statuses, customers]);

  // Episodios de Recall (entrada / salida)
  const recallEpisodes = useMemo<RecallEpisode[]>(() => {
    if (!historyAsc.length) return [];
    const eps: RecallEpisode[] = [];
    let open: RecallEpisode | null = null;
    historyAsc.forEach((e: any) => {
      const toR = isRecallText(e.toStatusName) || isRecallText(statusName(e.toStatusId));
      const fromR = isRecallText(e.fromStatusName) || isRecallText(statusName(e.fromStatusId));
      if (toR && !open) {
        open = { enteredAt: e.changedAt, enteredBy: e.changedBy, exitedAt: null, exitedTo: null };
      } else if (fromR && open) {
        open.exitedAt = e.changedAt;
        open.exitedTo = e.toStatusName || statusName(e.toStatusId);
        eps.push(open);
        open = null;
      }
    });
    if (open) eps.push(open);
    return eps.reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyAsc, statuses]);

  const clearAll = () => { setSearch(''); setStatusFilter(''); };

  const statusSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    (properties || []).forEach(p => {
      const k = statusName(p.statusId);
      counts[k] = (counts[k] || 0) + 1;
    });
    return statuses
      .map(s => ({ name: s.name, color: s.color || '#64748b', count: counts[s.name] || 0 }))
      .filter(s => s.count > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, statuses]);

  const inputBase: React.CSSProperties = {
    border: '1px solid #e5e7eb', borderRadius: '10px', height: '42px',
    background: '#fff', color: '#111827', fontSize: '0.9rem', outline: 'none',
  };

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <style>{`
        .sh-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; box-shadow: 0 1px 3px rgba(15,23,42,0.06); }
        .sh-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; font-size: 0.8rem; font-weight: 600; cursor: pointer; border: 1px solid #e5e7eb; transition: all .12s ease; background: #ffffff !important; color: #334155 !important; }
        .sh-chip:hover { background: #f8fafc !important; }

        .sh-tablewrap { overflow-x: auto; }
        .sh-table { width: 100%; border-collapse: collapse; min-width: 1120px; }
        .sh-table th { text-align: left; font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; padding: 12px 14px; border-bottom: 1px solid #eef2f7; position: sticky; top: 0; background: #fff; z-index: 1; white-space: nowrap; }
        .sh-table td { padding: 11px 14px; border-bottom: 1px solid #f1f5f9; font-size: 0.85rem; color: #0f172a; vertical-align: middle; }
        .sh-table tbody tr { cursor: pointer; transition: background .12s ease; }
        .sh-table tbody tr:hover { background: #f8fafc; }
        .sh-num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .sh-ellip { max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sh-loadmore { width: 100%; padding: 12px; background: #f8fafc; border: none; border-top: 1px solid #f1f5f9; color: #2563eb; font-weight: 700; cursor: pointer; font-size: 0.85rem; }
        .sh-loadmore:hover { background: #eff6ff; }

        .sh-modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.55); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px; box-sizing: border-box; }
        .sh-modal { background: #fff; width: 100%; max-width: 920px; max-height: 90vh; border-radius: 18px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 48px -12px rgba(15,23,42,0.4); }
        .sh-modal-head { padding: 20px 22px; border-bottom: 1px solid #eef2f7; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-shrink: 0; }
        .sh-modal-body { padding: 20px 22px; overflow-y: auto; }

        @media (max-width: 768px) {
          .sh-modal-overlay { padding: 0; }
          .sh-modal { max-width: 100%; height: 100vh; height: 100dvh; max-height: 100vh; border-radius: 0; }
        }
      `}</style>

      {/* Cabecera */}
      <header style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button className="hamburger-btn" onClick={onOpenMenu} aria-label="Open menu" style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: 'linear-gradient(135deg,#2563eb,#1e40af)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}>
            <History size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, color: '#0f172a', fontSize: '1.7rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Status History</h1>
            <p style={{ marginTop: '2px', color: '#64748b', fontSize: '0.9rem' }}>Toca una fila para ver el recorrido completo de la casa por todos sus estados.</p>
          </div>
        </div>
      </header>

      {/* Barra de filtros */}
      <div className="sh-card" style={{ padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: '#334155', fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <SlidersHorizontal size={15} color="#2563eb" /> Filtros
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1.6fr) minmax(160px,1fr) minmax(150px,0.8fr)', gap: '12px' }}>
          <div style={{ ...inputBase, display: 'flex', alignItems: 'center', gap: '8px', padding: '0 14px' }}>
            <Search size={16} color="#9ca3af" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente, dirección o nota..." style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: '#111827', fontSize: '0.9rem', height: '100%' }} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={15} /></button>}
          </div>
          <div style={{ position: 'relative' }}>
            <Filter size={15} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputBase, width: '100%', padding: '0 14px 0 34px', appearance: 'none', cursor: 'pointer' }}>
              <option value="">Todos los status</option>
              {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ position: 'relative' }}>
            <ArrowUpDown size={15} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} style={{ ...inputBase, width: '100%', padding: '0 14px 0 34px', appearance: 'none', cursor: 'pointer' }}>
              <option value="client">Ordenar: Cliente</option>
              <option value="address">Ordenar: Dirección</option>
              <option value="schedule">Ordenar: Schedule</option>
            </select>
          </div>
        </div>

        {statusSummary.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status:</span>
            {statusSummary.map(s => {
              const active = statusFilter.toLowerCase() === s.name.toLowerCase();
              return (
                <button key={s.name} className="sh-chip" onClick={() => setStatusFilter(active ? '' : s.name)}
                  style={{ borderColor: active ? s.color : `${s.color}55`, boxShadow: active ? `0 0 0 2px ${s.color}33` : 'none', fontWeight: active ? 800 : 600 }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color }} />
                  {s.name}
                  <span style={{ background: s.color, color: '#fff', borderRadius: '10px', minWidth: '20px', textAlign: 'center', padding: '0 6px', fontSize: '0.7rem', fontWeight: 800 }}>{s.count}</span>
                  {active && <X size={12} />}
                </button>
              );
            })}
          </div>
        )}

        {hasFilter && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Activos:</span>
            {search.trim() && (
              <span className="sh-chip" style={{ borderColor: '#bfdbfe' }}>
                «{search.trim()}» <X size={13} style={{ cursor: 'pointer' }} onClick={() => setSearch('')} />
              </span>
            )}
            {statusFilter && (
              <span className="sh-chip" style={{ borderColor: `${statusColor(statusFilter)}55` }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColor(statusFilter) }} />
                {statusFilter} <X size={13} style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('')} />
              </span>
            )}
            <button onClick={clearAll} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>Limpiar filtros</button>
          </div>
        )}
      </div>

      {/* TABLA ESTILO HOJA (P&L) */}
      <div className="sh-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 700 }}>
            {filtered.length} {filtered.length === 1 ? 'casa' : 'casas'}{hasFilter ? ' (filtradas)' : ''}
          </span>
          {filtered.length > visible.length && <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Mostrando {visible.length}</span>}
        </div>

        <div className="sh-tablewrap" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <table className="sh-table">
            <thead>
              <tr>
                <th>Address</th>
                <th>Client</th>
                <th>Note</th>
                <th>Schedule</th>
                <th>Team</th>
                <th className="sh-num">Total</th>
                <th className="sh-num">Taxes</th>
                <th className="sh-num">Payroll</th>
                <th>Status Paid</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontStyle: 'italic' }}>No se encontraron casas con esos filtros.</td></tr>
              ) : visible.map(p => {
                const bill = billingByProp[p.id] || { total: 0, taxes: 0 };
                const pay = payrollByProp[p.id] || 0;
                const team = teamInfo(p.teamId);
                const inv = invoicePill((p as any).invoiceStatus);
                return (
                  <tr key={p.id} onClick={() => setSelectedId(p.id)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0, backgroundColor: statusColor(p.statusId) }} />
                        <span style={{ fontWeight: 600 }} className="sh-ellip">{p.address || '-'}</span>
                      </div>
                    </td>
                    <td className="sh-ellip">{getClientName(p.client)}</td>
                    <td className="sh-ellip" style={{ color: '#64748b', maxWidth: '260px' }}>{(p as any).note || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', color: '#475569' }}>{p.scheduleDate || '—'}</td>
                    <td>
                      {team ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, background: `${team.color}1f`, color: team.color, whiteSpace: 'nowrap' }}>
                          <Users size={11} /> {team.name}
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, background: '#f1f5f9', color: '#64748b', whiteSpace: 'nowrap' }}>Sin Equipo</span>
                      )}
                    </td>
                    <td className="sh-num" style={{ fontWeight: 700 }}>{fmtMoney(bill.total)}</td>
                    <td className="sh-num" style={{ color: bill.taxes > 0 ? '#b91c1c' : '#94a3b8' }}>{fmtMoney(bill.taxes)}</td>
                    <td className="sh-num" style={{ color: pay > 0 ? '#0f766e' : '#94a3b8' }}>{fmtMoney(pay)}</td>
                    <td>
                      <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800, background: inv.bg, color: inv.color, border: `1px solid ${inv.border}`, whiteSpace: 'nowrap' }}>{inv.label}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}><ChevronRight size={16} color="#cbd5e1" /></td>
                  </tr>
                );
              })}
            </tbody>
            {visible.length > 0 && (
              <tfoot>
                <tr style={{ position: 'sticky', bottom: 0 }}>
                  <td colSpan={5} style={{ background: '#f8fafc', fontWeight: 800, color: '#0f172a', borderTop: '2px solid #e2e8f0' }}>Totales ({filtered.length})</td>
                  <td className="sh-num" style={{ background: '#f8fafc', fontWeight: 800, borderTop: '2px solid #e2e8f0' }}>{fmtMoney(totals.total)}</td>
                  <td className="sh-num" style={{ background: '#f8fafc', fontWeight: 800, color: '#b91c1c', borderTop: '2px solid #e2e8f0' }}>{fmtMoney(totals.taxes)}</td>
                  <td className="sh-num" style={{ background: '#f8fafc', fontWeight: 800, color: '#0f766e', borderTop: '2px solid #e2e8f0' }}>{fmtMoney(totals.payroll)}</td>
                  <td colSpan={2} style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {filtered.length > visible.length && (
          <button className="sh-loadmore" onClick={() => setLimit(l => l + PAGE_SIZE)}>
            Cargar más ({filtered.length - visible.length} restantes)
          </button>
        )}
      </div>

      {/* MODAL: RECORRIDO COMPLETO DE LA CASA */}
      {selected && (
        <div className="sh-modal-overlay" onClick={() => setSelectedId(null)}>
          <div className="sh-modal" onClick={e => e.stopPropagation()}>
            <div className="sh-modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `${statusColor(selected.statusId)}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MapPin size={20} color={statusColor(selected.statusId)} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem', fontWeight: 800 }}>{getClientName(selected.client)}</h2>
                  <p style={{ margin: '3px 0 0', color: '#64748b', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><MapPin size={13} /> {selected.address || '-'}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '5px 12px', borderRadius: '999px', color: statusColor(selected.statusId), background: `${statusColor(selected.statusId)}14`, whiteSpace: 'nowrap' }}>
                  {statusName(selected.statusId)}
                </span>
                <button onClick={() => setSelectedId(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '6px', display: 'flex', borderRadius: '8px' }}><X size={22} /></button>
              </div>
            </div>

            <div className="sh-modal-body">

              {/* Resumen financiero + datos */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '10px', marginBottom: '18px' }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '5px' }}><Receipt size={12} /> Total</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginTop: '3px' }}>{fmtMoney((billingByProp[selected.id] || { total: 0, taxes: 0 }).total)}</div>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Taxes</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#b91c1c', marginTop: '3px' }}>{fmtMoney((billingByProp[selected.id] || { total: 0, taxes: 0 }).taxes)}</div>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '5px' }}><DollarSign size={12} /> Payroll</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f766e', marginTop: '3px' }}>{fmtMoney(payrollByProp[selected.id] || 0)}</div>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status Paid</div>
                  <div style={{ marginTop: '5px' }}>
                    {(() => { const inv = invoicePill((selected as any).invoiceStatus); return (
                      <span style={{ display: 'inline-block', padding: '3px 12px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800, background: inv.bg, color: inv.color, border: `1px solid ${inv.border}` }}>{inv.label}</span>
                    ); })()}
                  </div>
                </div>
              </div>

              {(selected.scheduleDate || (selected as any).note || selected.teamId) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 20px', marginBottom: '18px', fontSize: '0.85rem', color: '#475569' }}>
                  {selected.scheduleDate && <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Calendar size={14} color="#94a3b8" /> {selected.scheduleDate}</span>}
                  {selected.teamId && (() => { const t = teamInfo(selected.teamId); return t ? <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Users size={14} color={t.color} /> {t.name}</span> : null; })()}
                  {(selected as any).note && <span style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', flex: '1 1 260px', minWidth: 0 }}><StickyNote size={14} color="#94a3b8" style={{ flexShrink: 0, marginTop: '2px' }} /> {(selected as any).note}</span>}
                </div>
              )}

              {/* ⭐ RECORRIDO COMPLETO POR TODOS LOS STATUS */}
              <div className="sh-card" style={{ padding: '18px 20px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: journey.length ? '16px' : '0' }}>
                  <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Route size={17} color="#2563eb" /> Recorrido completo
                  </h3>
                  {historyAsc.length > 0 && <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{historyAsc.length} {historyAsc.length === 1 ? 'cambio' : 'cambios'} de estado</span>}
                </div>

                {episodesLoading ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.88rem' }}>Cargando historial…</div>
                ) : journey.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.88rem' }}>Aún no hay historial de cambios de estado registrado para esta casa.</div>
                ) : (
                  <div style={{ position: 'relative', paddingLeft: '24px' }}>
                    <div style={{ position: 'absolute', left: '8px', top: '6px', bottom: '6px', width: '2px', background: '#e2e8f0' }} />
                    {journey.map((n, i) => (
                      <div key={i} style={{ position: 'relative', paddingBottom: i === journey.length - 1 ? '0' : '18px' }}>
                        <span style={{ position: 'absolute', left: '-24px', top: '2px', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: n.color, border: '2px solid #fff', boxShadow: `0 0 0 2px ${n.color}55`, boxSizing: 'border-box' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>{n.name}</span>
                          {n.initial && <span style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '999px' }}>Estado inicial</span>}
                          {n.isLast && <span style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: '999px' }}>Estado actual</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 12px', marginTop: '4px', fontSize: '0.8rem', color: '#64748b' }}>
                          {n.at && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Clock size={12} /> {formatDateTime(n.at)}</span>}
                          {n.by && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><User size={12} /> {n.by}</span>}
                          {n.duration && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: n.isLast ? '#eff6ff' : '#f8fafc', color: n.isLast ? '#1d4ed8' : '#475569', padding: '1px 9px', borderRadius: '999px', fontWeight: 700, fontSize: '0.72rem' }}>
                            {n.isLast ? 'aquí desde hace' : 'estuvo'} {n.duration}
                          </span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Episodios de Recall */}
              <div className="sh-card" style={{ padding: '18px 20px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: recallEpisodes.length ? '14px' : '0', flexWrap: 'wrap', gap: '8px' }}>
                  <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Repeat size={17} color="#7c3aed" /> Recall — entradas y salidas
                  </h3>
                  {recallEpisodes.length > 0 && <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{recallEpisodes.length} {recallEpisodes.length === 1 ? 'vez' : 'veces'} en Recall</span>}
                </div>

                {episodesLoading ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.88rem' }}>Cargando…</div>
                ) : recallEpisodes.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.88rem' }}>Esta casa no tiene registros de Recall.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {recallEpisodes.map((ep, i) => {
                      const stillIn = !ep.exitedAt;
                      return (
                        <div key={i} style={{ border: '1px solid #f1f5f9', borderRadius: '12px', overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: stillIn ? '#fef2f2' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>Recall #{recallEpisodes.length - i}</span>
                            {stillIn
                              ? <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '2px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase' }}>Aún en recall</span>
                              : <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 800 }}>{formatDuration(ep.enteredAt, ep.exitedAt)}</span>}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0' }}>
                            <div style={{ padding: '12px 14px', borderRight: '1px solid #f1f5f9' }}>
                              <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                                <LogIn size={13} color="#dc2626" /> Entró
                              </div>
                              <div style={{ fontSize: '0.88rem', color: '#0f172a', fontWeight: 600 }}>{formatDateTime(ep.enteredAt)}</div>
                              {ep.enteredBy && <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '2px' }}>por {ep.enteredBy}</div>}
                            </div>
                            <div style={{ padding: '12px 14px' }}>
                              <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                                <LogOut size={13} color="#16a34a" /> Salió
                              </div>
                              {stillIn ? (
                                <div style={{ fontSize: '0.88rem', color: '#b91c1c', fontWeight: 600 }}>Todavía en Recall</div>
                              ) : (
                                <>
                                  <div style={{ fontSize: '0.88rem', color: '#0f172a', fontWeight: 600 }}>{formatDateTime(ep.exitedAt)}</div>
                                  {ep.exitedTo && <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowRight size={11} /> pasó a {ep.exitedTo}</div>}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Historial detallado (componente existente) */}
              <StatusHistoryPanel propertyId={selected.id} statuses={statuses} />

            </div>
          </div>
        </div>
      )}

    </div>
  );
}