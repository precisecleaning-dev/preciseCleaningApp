import { useState, useEffect, useMemo } from 'react';
import { History, Search, X, MapPin, ChevronRight, SlidersHorizontal, ArrowUpDown, Filter } from 'lucide-react';
import type { Property, Status, Customer } from '../types/index';
import { db } from '../config/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import StatusHistoryPanel from '../components/StatusHistoryPanel';

interface StatusHistoryViewProps {
  onOpenMenu: () => void;
  properties: Property[];
  currentUser?: any;
}

const PAGE_SIZE = 25;

export default function StatusHistoryView({ onOpenMenu, properties }: StatusHistoryViewProps) {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'client' | 'address'>('client');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(collection(db, 'settings_statuses'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Status[];
      setStatuses(data.sort((a, b) => Number((a as any).order || 0) - Number((b as any).order || 0)));
    }, (e) => console.error('Error statuses:', e)));
    unsubs.push(onSnapshot(collection(db, 'customers'), (snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Customer[]);
    }, (e) => console.error('Error customers:', e)));
    return () => unsubs.forEach(u => u());
  }, []);

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
        return [getClientName(p.client), p.address].filter(Boolean).join(' ').toLowerCase().includes(q);
      })
      .sort((a, b) => sortBy === 'client'
        ? getClientName(a.client).localeCompare(getClientName(b.client))
        : String(a.address || '').localeCompare(String(b.address || '')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, search, statusFilter, sortBy, customers, statuses]);

  // Reinicia la paginación al cambiar filtros
  useEffect(() => { setLimit(PAGE_SIZE); }, [search, statusFilter, sortBy]);

  const visible = filtered.slice(0, limit);
  const selected = (properties || []).find(p => p.id === selectedId) || null;

  const clearAll = () => { setSearch(''); setStatusFilter(''); };

  // Resumen de status disponibles (para chips rápidos en la bienvenida)
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
        .sh-cols { display: grid; grid-template-columns: 380px 1fr; gap: 20px; align-items: start; }
        .sh-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; box-shadow: 0 1px 3px rgba(15,23,42,0.06); }
        .sh-row { width: 100%; text-align: left; display: flex; align-items: center; gap: 12px; padding: 13px 16px; border: none; border-bottom: 1px solid #f1f5f9; cursor: pointer; background: transparent; transition: background .12s ease; }
        .sh-row:hover { background: #f8fafc; }
        .sh-row.active { background: #eff6ff; box-shadow: inset 3px 0 0 #2563eb; }
        .sh-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; font-size: 0.8rem; font-weight: 600; cursor: pointer; border: 1px solid #e5e7eb; transition: all .12s ease; background: #ffffff !important; color: #334155 !important; }
        .sh-chip:hover { background: #f8fafc !important; }
        .sh-loadmore { width: 100%; padding: 12px; background: #f8fafc; border: none; border-top: 1px solid #f1f5f9; color: #2563eb; font-weight: 700; cursor: pointer; font-size: 0.85rem; border-radius: 0 0 16px 16px; }
        .sh-loadmore:hover { background: #eff6ff; }
        @media (max-width: 980px) { .sh-cols { grid-template-columns: 1fr; } }
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
            <p style={{ marginTop: '2px', color: '#64748b', fontSize: '0.9rem' }}>Consulta cuántas veces una casa ha pasado por Recall, In Progress, etc.</p>
          </div>
        </div>
      </header>

      {/* Barra de filtros */}
      <div className="sh-card" style={{ padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: '#334155', fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <SlidersHorizontal size={15} color="#2563eb" /> Filtros
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1.6fr) minmax(160px,1fr) minmax(150px,0.8fr)', gap: '12px', flexWrap: 'wrap' }}>
          {/* Búsqueda */}
          <div style={{ ...inputBase, display: 'flex', alignItems: 'center', gap: '8px', padding: '0 14px' }}>
            <Search size={16} color="#9ca3af" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente o dirección..." style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: '#111827', fontSize: '0.9rem', height: '100%' }} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={15} /></button>}
          </div>
          {/* Status */}
          <div style={{ position: 'relative' }}>
            <Filter size={15} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputBase, width: '100%', padding: '0 14px 0 34px', appearance: 'none', cursor: 'pointer' }}>
              <option value="">Todos los status</option>
              {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
          {/* Orden */}
          <div style={{ position: 'relative' }}>
            <ArrowUpDown size={15} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} style={{ ...inputBase, width: '100%', padding: '0 14px 0 34px', appearance: 'none', cursor: 'pointer' }}>
              <option value="client">Ordenar: Cliente</option>
              <option value="address">Ordenar: Dirección</option>
            </select>
          </div>
        </div>

        {/* Chips de filtros activos */}
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

      {/* Cuerpo */}
      {!hasFilter ? (
        // Estado de bienvenida: NO se listan todas las casas
        <div className="sh-card" style={{ padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Search size={28} color="#2563eb" />
          </div>
          <h3 style={{ margin: '0 0 6px', color: '#0f172a', fontSize: '1.15rem', fontWeight: 700 }}>Busca una casa para ver su historial</h3>
          <p style={{ margin: '0 auto', color: '#64748b', fontSize: '0.92rem', maxWidth: '440px' }}>
            Usa el buscador o filtra por status. Las casas no se cargan todas de golpe para mantener la vista ágil y reducir lecturas innecesarias.
          </p>
          {statusSummary.length > 0 && (
            <div style={{ marginTop: '24px' }}>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', fontWeight: 700 }}>Filtrar rápido por status</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                {statusSummary.map(s => (
                  <button key={s.name} className="sh-chip" onClick={() => setStatusFilter(s.name)} style={{ borderColor: `${s.color}55` }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color }} />
                    {s.name}
                    <span style={{ background: s.color, color: '#fff', borderRadius: '10px', minWidth: '20px', textAlign: 'center', padding: '0 6px', fontSize: '0.7rem', fontWeight: 800 }}>{s.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="sh-cols">
          {/* Lista filtrada */}
          <div className="sh-card" style={{ display: 'flex', flexDirection: 'column', maxHeight: '74vh', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 700 }}>
                {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
              </span>
              {filtered.length > visible.length && (
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Mostrando {visible.length}</span>
              )}
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {visible.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>No se encontraron casas con esos filtros.</div>
              ) : visible.map(p => {
                const isSel = p.id === selectedId;
                return (
                  <button key={p.id} onClick={() => setSelectedId(p.id)} className={`sh-row${isSel ? ' active' : ''}`}>
                    <span style={{ width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0, backgroundColor: statusColor(p.statusId) }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 600, color: '#0f172a', fontSize: '0.92rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getClientName(p.client)}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}><MapPin size={11} /> {p.address || '-'}</span>
                    </span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap', padding: '3px 9px', borderRadius: '999px', color: statusColor(p.statusId), background: `${statusColor(p.statusId)}14` }}>{statusName(p.statusId)}</span>
                    <ChevronRight size={16} color="#cbd5e1" />
                  </button>
                );
              })}
            </div>
            {filtered.length > visible.length && (
              <button className="sh-loadmore" onClick={() => setLimit(l => l + PAGE_SIZE)}>
                Cargar más ({filtered.length - visible.length} restantes)
              </button>
            )}
          </div>

          {/* Panel del historial */}
          <div>
            {selected ? (
              <>
                <div className="sh-card" style={{ padding: '18px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `${statusColor(selected.statusId)}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <MapPin size={20} color={statusColor(selected.statusId)} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem', fontWeight: 700 }}>{getClientName(selected.client)}</h2>
                    <p style={{ margin: '3px 0 0', color: '#64748b', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={13} /> {selected.address || '-'}</p>
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '5px 12px', borderRadius: '999px', color: statusColor(selected.statusId), background: `${statusColor(selected.statusId)}14`, whiteSpace: 'nowrap' }}>
                    {statusName(selected.statusId)}
                  </span>
                </div>
                <StatusHistoryPanel propertyId={selected.id} statuses={statuses} />
              </>
            ) : (
              <div className="sh-card" style={{ padding: '60px 24px', textAlign: 'center', color: '#94a3b8' }}>
                <ChevronRight size={32} style={{ opacity: 0.4, marginBottom: '10px' }} />
                <div>Selecciona una casa de la lista para ver su historial de status.</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}