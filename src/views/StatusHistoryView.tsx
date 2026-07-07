import { useState, useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import {
  History, Search, X, MapPin, ChevronRight, SlidersHorizontal, ArrowUpDown, Filter,
  Repeat, LogIn, LogOut, Users, DollarSign, Receipt, Clock, ArrowRight, Route, Calendar, StickyNote, User, TrendingUp
} from 'lucide-react';
import type { Property, Status, Customer } from '../types/index';
import { db } from '../config/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import StatusHistoryPanel from '../components/StatusHistoryPanel';
import { statusHistoryService } from '../services/statusHistoryService';
import './StatusHistoryView.css';

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

  // Contraste: elige texto legible según qué tan claro sea el color de fondo.
  const hexToRgb = (hex: string) => {
    let h = String(hex || '').replace('#', '').trim();
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length !== 6) return { r: 100, g: 116, b: 139 };
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  };
  const luminance = (hex: string) => {
    const { r, g, b } = hexToRgb(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255; // brillo percibido 0..1
  };
  // Texto sobre fondo SÓLIDO del color (ej. badge con número)
  const onSolid = (bg?: string) => (luminance(String(bg || '')) > 0.6 ? '#1e293b' : '#ffffff');
  // Texto sobre fondo TENUE del color (ej. pastilla con tinte). Si el color es muy claro
  // (amarillo, etc.), usa un gris oscuro para que se lea; si es oscuro, usa el propio color.
  const onTint = (color?: string) => (luminance(String(color || '')) > 0.62 ? '#334155' : String(color || '#334155'));

  const invoicePill = (status?: string | null) => {
    const v = String(status || '').toLowerCase().trim();
    if (v === 'paid') return { label: 'Paid', bg: '#dcfce7', color: '#166534', border: '#86efac' };
    if (v === 'pre-paid') return { label: 'Pre-Paid', bg: '#ccfbf1', color: '#0f766e', border: '#5eead4' };
    if (v === 'pending') return { label: 'Pending', bg: '#fef3c7', color: '#92400e', border: '#fcd34d' };
    if (v === 'needs invoice') return { label: 'Needs Invoice', bg: '#ffedd5', color: '#9a3412', border: '#fdba74' };
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

  return (
    <div className="fade-in shv-page">

      {/* Cabecera */}
      <header className="shv-header">
        <button className="hamburger-btn shv-hamburger-btn" onClick={onOpenMenu} aria-label="Open menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
        <div className="shv-header-title-group">
          <div className="shv-header-icon-box">
            <History size={22} color="#fff" />
          </div>
          <div>
            <h1 className="shv-title">Status History</h1>
            <p className="shv-subtitle">Toca una fila para ver el recorrido completo de la casa por todos sus estados.</p>
          </div>
        </div>
      </header>

      {/* Barra de filtros */}
      <div className="sh-card shv-filters-card">
        <div className="shv-filters-title-row">
          <SlidersHorizontal size={15} color="#2563eb" /> Filtros
        </div>
        <div className="shv-filters-grid">
          <div className="shv-input-base shv-search-box">
            <Search size={16} color="#9ca3af" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente, dirección o nota..." className="shv-search-input" />
            {search && <button onClick={() => setSearch('')} className="shv-clear-search-btn"><X size={15} /></button>}
          </div>
          <div className="shv-select-wrap">
            <Filter size={15} color="#9ca3af" className="shv-select-icon" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="shv-input-base shv-select">
              <option value="">Todos los status</option>
              {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
          <div className="shv-select-wrap">
            <ArrowUpDown size={15} color="#9ca3af" className="shv-select-icon" />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="shv-input-base shv-select">
              <option value="client">Ordenar: Cliente</option>
              <option value="address">Ordenar: Dirección</option>
              <option value="schedule">Ordenar: Schedule</option>
            </select>
          </div>
        </div>

        {statusSummary.length > 0 && (
          <div className="shv-status-summary-row">
            <span className="shv-status-summary-label">Status:</span>
            {statusSummary.map(s => {
              const active = statusFilter.toLowerCase() === s.name.toLowerCase();
              return (
                <button key={s.name} className={`sh-chip${active ? ' active-tinted' : ' tinted'}`}
                  onClick={() => setStatusFilter(active ? '' : s.name)}
                  style={{ '--chip-border': `${s.color}55`, '--chip-color': s.color, '--chip-shadow': `${s.color}33` } as CSSProperties}>
                  <span className="shv-chip-dot" style={{ '--dot-color': s.color } as CSSProperties} />
                  {s.name}
                  <span className="shv-chip-count" style={{ '--dot-color': s.color, '--on-solid': onSolid(s.color) } as CSSProperties}>{s.count}</span>
                  {active && <X size={12} />}
                </button>
              );
            })}
          </div>
        )}

        {hasFilter && (
          <div className="shv-active-filters-row">
            <span className="shv-active-filters-label">Activos:</span>
            {search.trim() && (
              <span className="sh-chip tinted" style={{ '--chip-border': '#bfdbfe' } as CSSProperties}>
                «{search.trim()}» <X size={13} className="shv-chip-x" onClick={() => setSearch('')} />
              </span>
            )}
            {statusFilter && (
              <span className="sh-chip tinted" style={{ '--chip-border': `${statusColor(statusFilter)}55` } as CSSProperties}>
                <span className="shv-chip-dot" style={{ '--dot-color': statusColor(statusFilter) } as CSSProperties} />
                {statusFilter} <X size={13} className="shv-chip-x" onClick={() => setStatusFilter('')} />
              </span>
            )}
            <button onClick={clearAll} className="shv-clear-filters-btn">Limpiar filtros</button>
          </div>
        )}
      </div>

      {/* TABLA ESTILO HOJA (P&L) */}
      <div className="sh-card shv-table-card">
        <div className="shv-table-header-row">
          <span className="shv-table-count">
            {filtered.length} {filtered.length === 1 ? 'casa' : 'casas'}{hasFilter ? ' (filtradas)' : ''}
          </span>
          {filtered.length > visible.length && <span className="shv-table-showing">Mostrando {visible.length}</span>}
        </div>

        <div className="sh-tablewrap shv-table-scroll-body">
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
                <th className="sh-num">Profit</th>
                <th>Status Paid</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={11} className="shv-empty-row">No se encontraron casas con esos filtros.</td></tr>
              ) : visible.map(p => {
                const bill = billingByProp[p.id] || { total: 0, taxes: 0 };
                const pay = payrollByProp[p.id] || 0;
                const profit = bill.total - pay;
                const team = teamInfo(p.teamId);
                const inv = invoicePill((p as any).invoiceStatus);
                return (
                  <tr key={p.id} onClick={() => setSelectedId(p.id)}>
                    <td>
                      <div className="shv-address-cell">
                        <span className="shv-status-dot-9" style={{ '--dot-color': statusColor(p.statusId) } as CSSProperties} />
                        <span className="shv-address-text sh-ellip">{p.address || '-'}</span>
                      </div>
                    </td>
                    <td className="sh-ellip">{getClientName(p.client)}</td>
                    <td className="sh-ellip shv-note-cell">{(p as any).note || '—'}</td>
                    <td className="shv-nowrap-muted">{p.scheduleDate || '—'}</td>
                    <td>
                      {team ? (
                        <span className="shv-team-chip">
                          <span className="shv-team-dot" style={{ '--dot-color': team.color } as CSSProperties} /> {team.name}
                        </span>
                      ) : (
                        <span className="shv-team-chip none">Sin Equipo</span>
                      )}
                    </td>
                    <td className="sh-num shv-td-total">{fmtMoney(bill.total)}</td>
                    <td className="sh-num shv-td-tone" style={{ '--tone-color': bill.taxes > 0 ? '#b91c1c' : '#94a3b8' } as CSSProperties}>{fmtMoney(bill.taxes)}</td>
                    <td className="sh-num shv-td-tone" style={{ '--tone-color': pay > 0 ? '#0f766e' : '#94a3b8' } as CSSProperties}>{fmtMoney(pay)}</td>
                    <td className="sh-num shv-td-profit" style={{ '--tone-color': profit > 0 ? '#166534' : profit < 0 ? '#b91c1c' : '#64748b' } as CSSProperties}>{fmtMoney(profit)}</td>
                    <td>
                      <span className="shv-invoice-pill" style={{ '--pill-bg': inv.bg, '--pill-color': inv.color, '--pill-border': inv.border } as CSSProperties}>{inv.label}</span>
                    </td>
                    <td className="shv-chevron-cell"><ChevronRight size={16} color="#cbd5e1" /></td>
                  </tr>
                );
              })}
            </tbody>
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
              <div className="shv-modal-head-left">
                <div className="shv-modal-icon-box" style={{ '--icon-bg': `${statusColor(selected.statusId)}18` } as CSSProperties}>
                  <MapPin size={20} color={statusColor(selected.statusId)} />
                </div>
                <div className="shv-modal-title-col">
                  <h2 className="shv-modal-client-name">{getClientName(selected.client)}</h2>
                  <p className="shv-modal-address"><MapPin size={13} /> {selected.address || '-'}</p>
                </div>
              </div>
              <div className="shv-modal-head-right">
                <span className="shv-modal-status-chip" style={{ '--tint-color': onTint(statusColor(selected.statusId)), '--tint-bg': `${statusColor(selected.statusId)}22` } as CSSProperties}>
                  {statusName(selected.statusId)}
                </span>
                <button onClick={() => setSelectedId(null)} aria-label="Cerrar" className="shv-modal-close"><X size={22} /></button>
              </div>
            </div>

            <div className="sh-modal-body">

              {/* Resumen financiero + datos */}
              <div className="shv-fin-summary-grid">
                <div className="shv-fin-box">
                  <div className="shv-fin-label icon-row"><Receipt size={12} /> Total</div>
                  <div className="shv-fin-value">{fmtMoney((billingByProp[selected.id] || { total: 0, taxes: 0 }).total)}</div>
                </div>
                <div className="shv-fin-box">
                  <div className="shv-fin-label taxes">Taxes</div>
                  <div className="shv-fin-value taxes">{fmtMoney((billingByProp[selected.id] || { total: 0, taxes: 0 }).taxes)}</div>
                </div>
                <div className="shv-fin-box">
                  <div className="shv-fin-label icon-row"><DollarSign size={12} /> Payroll</div>
                  <div className="shv-fin-value payroll">{fmtMoney(payrollByProp[selected.id] || 0)}</div>
                </div>
                {(() => {
                  const t = (billingByProp[selected.id] || { total: 0, taxes: 0 }).total;
                  const pr = t - (payrollByProp[selected.id] || 0);
                  return (
                    <div className="shv-fin-box profit" style={{ '--profit-border': pr >= 0 ? '#bbf7d0' : '#fecaca', '--profit-bg': pr >= 0 ? '#f0fdf4' : '#fef2f2' } as CSSProperties}>
                      <div className="shv-fin-label profit" style={{ '--profit-color': pr >= 0 ? '#15803d' : '#b91c1c' } as CSSProperties}><TrendingUp size={12} /> Profit</div>
                      <div className="shv-fin-value profit" style={{ '--profit-value-color': pr >= 0 ? '#166534' : '#991b1b' } as CSSProperties}>{fmtMoney(pr)}</div>
                    </div>
                  );
                })()}
                <div className="shv-fin-box">
                  <div className="shv-fin-label">Status Paid</div>
                  <div className="shv-fin-status-wrap">
                    {(() => { const inv = invoicePill((selected as any).invoiceStatus); return (
                      <span className="shv-invoice-pill small" style={{ '--pill-bg': inv.bg, '--pill-color': inv.color, '--pill-border': inv.border } as CSSProperties}>{inv.label}</span>
                    ); })()}
                  </div>
                </div>
              </div>

              {(selected.scheduleDate || (selected as any).note || selected.teamId) && (
                <div className="shv-meta-row">
                  {selected.scheduleDate && <span className="shv-meta-item"><Calendar size={14} color="#94a3b8" /> {selected.scheduleDate}</span>}
                  {selected.teamId && (() => { const t = teamInfo(selected.teamId); return t ? <span className="shv-meta-item"><Users size={14} color={t.color} /> {t.name}</span> : null; })()}
                  {(selected as any).note && <span className="shv-meta-item note"><StickyNote size={14} color="#94a3b8" className="shv-meta-note-icon" /> {(selected as any).note}</span>}
                </div>
              )}

              {/* ⭐ RECORRIDO COMPLETO POR TODOS LOS STATUS */}
              <div className="sh-card shv-section-card">
                <div className={`shv-section-header-row${journey.length ? ' has-content' : ''}`}>
                  <h3 className="shv-section-title">
                    <Route size={17} color="#2563eb" /> Recorrido completo
                  </h3>
                  {historyAsc.length > 0 && <span className="shv-section-count">{historyAsc.length} {historyAsc.length === 1 ? 'cambio' : 'cambios'} de estado</span>}
                </div>

                {episodesLoading ? (
                  <div className="shv-section-empty">Cargando historial…</div>
                ) : journey.length === 0 ? (
                  <div className="shv-section-empty">Aún no hay historial de cambios de estado registrado para esta casa.</div>
                ) : (
                  <div className="shv-journey-list">
                    <div className="shv-journey-line" />
                    {journey.map((n, i) => (
                      <div key={i} className={`shv-journey-node${i === journey.length - 1 ? ' last' : ''}`}>
                        <span className="shv-journey-dot" style={{ '--dot-color': n.color, '--dot-ring': `${n.color}55` } as CSSProperties} />
                        <div className="shv-journey-top-row">
                          <span className="shv-journey-name">{n.name}</span>
                          {n.initial && <span className="shv-journey-badge initial">Estado inicial</span>}
                          {n.isLast && <span className="shv-journey-badge current">Estado actual</span>}
                        </div>
                        <div className="shv-journey-meta-row">
                          {n.at && <span className="shv-journey-meta-item"><Clock size={12} /> {formatDateTime(n.at)}</span>}
                          {n.by && <span className="shv-journey-meta-item"><User size={12} /> {n.by}</span>}
                          {n.duration && <span className={`shv-journey-duration${n.isLast ? ' last' : ''}`}>
                            {n.isLast ? 'aquí desde hace' : 'estuvo'} {n.duration}
                          </span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Episodios de Recall */}
              <div className="sh-card shv-section-card">
                <div className={`shv-section-header-row${recallEpisodes.length ? ' has-content' : ''}`}>
                  <h3 className="shv-section-title semibold">
                    <Repeat size={17} color="#7c3aed" /> Recall — entradas y salidas
                  </h3>
                  {recallEpisodes.length > 0 && <span className="shv-section-count">{recallEpisodes.length} {recallEpisodes.length === 1 ? 'vez' : 'veces'} en Recall</span>}
                </div>

                {episodesLoading ? (
                  <div className="shv-section-empty">Cargando…</div>
                ) : recallEpisodes.length === 0 ? (
                  <div className="shv-section-empty">Esta casa no tiene registros de Recall.</div>
                ) : (
                  <div className="shv-recall-episodes">
                    {recallEpisodes.map((ep, i) => {
                      const stillIn = !ep.exitedAt;
                      return (
                        <div key={i} className="shv-recall-card">
                          <div className={`shv-recall-card-head${stillIn ? ' still-in' : ''}`}>
                            <span className="shv-recall-card-label">Recall #{recallEpisodes.length - i}</span>
                            {stillIn
                              ? <span className="shv-recall-status-badge in">Aún en recall</span>
                              : <span className="shv-recall-status-badge out">{formatDuration(ep.enteredAt, ep.exitedAt)}</span>}
                          </div>
                          <div className="shv-recall-card-grid">
                            <div className="shv-recall-col entered">
                              <div className="shv-recall-col-label">
                                <LogIn size={13} color="#dc2626" /> Entró
                              </div>
                              <div className="shv-recall-col-value">{formatDateTime(ep.enteredAt)}</div>
                              {ep.enteredBy && <div className="shv-recall-col-sub">por {ep.enteredBy}</div>}
                            </div>
                            <div className="shv-recall-col">
                              <div className="shv-recall-col-label">
                                <LogOut size={13} color="#16a34a" /> Salió
                              </div>
                              {stillIn ? (
                                <div className="shv-recall-col-value still">Todavía en Recall</div>
                              ) : (
                                <>
                                  <div className="shv-recall-col-value">{formatDateTime(ep.exitedAt)}</div>
                                  {ep.exitedTo && <div className="shv-recall-col-sub arrow-row"><ArrowRight size={11} /> pasó a {ep.exitedTo}</div>}
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