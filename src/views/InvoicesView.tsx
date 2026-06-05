import { useState, useEffect } from 'react';
import { 
  Search, MapPin, CalendarDays, ChevronDown, Users, Edit2, Trash2, Eye, AlertTriangle
} from 'lucide-react';

import type { Property, Team, SystemUser, Role, Status, Customer } from '../types/index';
import { propertiesService } from '../services/propertiesService';
import { db } from '../config/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

const INVOICE_STATUSES = [
  { id: 'Pre-Paid', name: 'Pre-Paid', color: '#8b5cf6' },
  { id: 'Needs Invoice', name: 'Needs Invoice', color: '#f59e0b' },
  { id: 'Pending', name: 'Pending', color: '#ef4444' },
  { id: 'Paid', name: 'Paid', color: '#10b981' }
];

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────

// Resolver id ó nombre contra una colección (retrocompatible con datos legacy)
const getRelationName = (list: any[], idOrName?: string | null, fallback = '-') => {
  if (!idOrName) return fallback;
  const safeVal = String(idOrName).toLowerCase().trim();
  const found = list.find(item => 
    String(item.id).toLowerCase().trim() === safeVal || 
    String(item.name).toLowerCase().trim() === safeVal
  );
  return found ? found.name : fallback;
};

// Parser de fecha robusto: acepta "YYYY-MM-DD" y "DD/MM/YYYY"; vacíos al final
const parseDateForSort = (dateStr?: string | null): number => {
  if (!dateStr) return Number.MAX_SAFE_INTEGER;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return new Date(dateStr).getTime();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [d, m, y] = dateStr.split('/');
    return new Date(`${y}-${m}-${d}`).getTime();
  }
  const t = new Date(dateStr).getTime();
  return isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
};

// ───────────────────────────────────────────────────────────────
// Invoice Status Pill (inline editable en cada fila)
// ───────────────────────────────────────────────────────────────
const InvoiceStatusPill = ({ currentStatus, onChange, disabled }: { currentStatus: string, onChange: (s: string) => void, disabled: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const statusObj = INVOICE_STATUSES.find(s => s.id === currentStatus || s.name === currentStatus) 
    || { id: currentStatus, name: currentStatus || 'Pending', color: '#64748b' };

  return (
    <div tabIndex={0} onBlur={() => setTimeout(() => setIsOpen(false), 200)} style={{ position: 'relative', display: 'inline-block', outline: 'none' }}>
      <div 
        onClick={(e) => { e.stopPropagation(); if(!disabled) setIsOpen(!isOpen); }}
        style={{ 
          color: '#111827', padding: '6px 14px', borderRadius: '20px', 
          fontSize: '0.8rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px',
          cursor: disabled ? 'not-allowed' : 'pointer', border: `1px solid ${statusObj.color}40`, transition: 'all 0.2s',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)', backgroundColor: `${statusObj.color}10`
        }}
        onMouseEnter={(e) => { if(!disabled) e.currentTarget.style.backgroundColor = `${statusObj.color}20`; }}
        onMouseLeave={(e) => { if(!disabled) e.currentTarget.style.backgroundColor = `${statusObj.color}10`; }}
      >
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: statusObj.color }}></span>
        <span style={{ color: statusObj.color }}>{statusObj.name}</span>
        <ChevronDown size={14} color={statusObj.color} style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
      </div>

      {isOpen && (
        <div style={{ 
          position: 'absolute', top: '100%', left: 0, marginTop: '4px', backgroundColor: 'white', 
          border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', 
          zIndex: 9999, minWidth: '160px', overflow: 'hidden', textAlign: 'left'
        }}>
          {INVOICE_STATUSES.map((s) => (
            <div 
              key={s.id}
              onClick={(e) => { 
                e.preventDefault(); e.stopPropagation();
                if(s.id !== currentStatus) onChange(s.id); 
                setIsOpen(false); 
              }}
              style={{ 
                padding: '12px 14px', fontSize: '0.85rem', fontWeight: 600, color: '#334155', 
                display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                backgroundColor: currentStatus === s.id ? '#f8fafc' : 'transparent',
                borderBottom: '1px solid #f1f5f9'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = currentStatus === s.id ? '#f8fafc' : 'transparent'}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: s.color, flexShrink: 0 }}></span>
              {s.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ───────────────────────────────────────────────────────────────
// ⭐ Job Status Pill — cambia el status de la CASA (no el del invoice)
// ───────────────────────────────────────────────────────────────
const JobStatusPill = ({ currentStatusId, statuses, onChange, disabled }: { currentStatusId: string, statuses: Status[], onChange: (id: string) => void, disabled: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const safeValue = String(currentStatusId || '').toLowerCase().trim();
  const status = statuses.find(s => String(s.id).toLowerCase().trim() === safeValue || String(s.name).toLowerCase().trim() === safeValue);

  const pointColor = status ? status.color : '#64748b';
  const text = status ? status.name : 'Unassigned';

  return (
    <div tabIndex={0} onBlur={() => setTimeout(() => setIsOpen(false), 200)} style={{ position: 'relative', display: 'inline-block', outline: 'none' }}>
      <div 
        onClick={(e) => { e.stopPropagation(); if(!disabled) setIsOpen(!isOpen); }}
        style={{ 
          backgroundColor: 'white', color: '#111827', padding: '6px 12px', borderRadius: '20px', 
          fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px',
          cursor: disabled ? 'not-allowed' : 'pointer', border: '1px solid #e5e7eb', transition: 'all 0.2s',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
        }}
        onMouseEnter={(e) => { if(!disabled) e.currentTarget.style.backgroundColor = '#f8fafc'; }}
        onMouseLeave={(e) => { if(!disabled) e.currentTarget.style.backgroundColor = 'white'; }}
      >
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: pointColor }}></span>
        {text}
        <ChevronDown size={14} color="#9ca3af" style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
      </div>

      {isOpen && (
        <div style={{ 
          position: 'absolute', top: '100%', left: 0, marginTop: '4px', backgroundColor: 'white', 
          border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', 
          zIndex: 9999, minWidth: '180px', overflow: 'hidden', textAlign: 'left'
        }}>
          {statuses.map((s) => (
            <div 
              key={s.id}
              onClick={(e) => { 
                e.preventDefault(); e.stopPropagation();
                if(s.id !== currentStatusId && s.name !== currentStatusId) onChange(s.id); 
                setIsOpen(false); 
              }}
              style={{ 
                padding: '12px 14px', fontSize: '0.85rem', fontWeight: 500, color: '#111827', 
                display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                backgroundColor: (currentStatusId === s.id || currentStatusId === s.name) ? '#f8fafc' : 'transparent',
                borderBottom: '1px solid #f1f5f9'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = (currentStatusId === s.id || currentStatusId === s.name) ? '#f8fafc' : 'transparent'}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: s.color, flexShrink: 0 }}></span>
              {s.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};


interface InvoicesViewProps {
  onOpenMenu: () => void;
  properties: Property[];
  setProperties: React.Dispatch<React.SetStateAction<Property[]>>;
  currentUser?: SystemUser | null;
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
  onEditProperty?: (property: Property) => void;
  // ⭐ NUEVO: callback que el parent debe wirear para abrir el Detail Modal de HousesView
  //          (ver el snippet al final del archivo en el mensaje de Claude)
  onViewProperty?: (property: Property) => void;
}

export default function InvoicesView({ onOpenMenu, properties, setProperties, currentUser, activeRole, isSuperAdmin, onEditProperty, onViewProperty }: InvoicesViewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [teams, setTeams] = useState<Team[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);       // ⭐ Job statuses
  const [customers, setCustomers] = useState<Customer[]>([]);   // ⭐ Para resolver nombre del cliente
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [billedServices, setBilledServices] = useState<any[]>([]);

  // Filtros UI
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchClient, setSearchClient] = useState('');
  // ⭐ Default 'Pending' como se pidió
  const [filterStatus, setFilterStatus] = useState<string>('Pending');

  const canEdit = isSuperAdmin || activeRole?.permissions?.find(p => p.module === 'Houses')?.canEdit;
  const canDelete = isSuperAdmin || activeRole?.permissions?.find(p => p.module === 'Houses')?.canDelete;

  // ⭐ Resolver el nombre del cliente a partir del ID guardado en la propiedad.
  //    Retrocompatible: si el valor es un nombre legacy se devuelve igual.
  const getClientName = (clientIdOrName?: string | null) => {
    if (!clientIdOrName) return 'Unknown';
    return getRelationName(customers, clientIdOrName, String(clientIdOrName));
  };

  useEffect(() => {
    setIsLoading(true);
    const unsubscribes: (() => void)[] = [];
    let loaded = 0;
    const TOTAL = 6;
    const tick = () => { loaded++; if (loaded >= TOTAL) setIsLoading(false); };

    // ⭐ FIX: cargar properties acá también, no sólo en HousesView.
    //    Esto resuelve el caso "entré directo a Invoices y no veo nada".
    unsubscribes.push(onSnapshot(
      collection(db, 'properties'),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Property[];
        setProperties(data);
        tick();
      },
      (err) => { console.error("Error properties:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, 'settings_teams'),
      (snap) => { setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Team[]); tick(); },
      (err) => { console.error("Error teams:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, 'settings_statuses'),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Status[];
        setStatuses(data.sort((a, b) => Number((a as any).order || 0) - Number((b as any).order || 0)));
        tick();
      },
      (err) => { console.error("Error statuses:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, 'customers'),
      (snap) => { setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Customer[]); tick(); },
      (err) => { console.error("Error customers:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, 'payroll'),
      (snap) => { setPayrolls(snap.docs.map(d => ({ id: d.id, ...d.data() }))); tick(); },
      (err) => { console.error("Error payroll:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, 'billing_services'),
      (snap) => { setBilledServices(snap.docs.map(d => ({ id: d.id, ...d.data() }))); tick(); },
      (err) => { console.error("Error services:", err); tick(); }
    ));

    return () => unsubscribes.forEach(u => u());
  }, [setProperties]);

  // Cambiar status de invoice
  const handleStatusChange = async (propertyId: string, newStatus: string) => {
    setIsSaving(true);
    try {
      await propertiesService.update(propertyId, { invoiceStatus: newStatus } as any);
      setProperties(properties.map(p => p.id === propertyId ? { ...p, invoiceStatus: newStatus } : p));
    } catch (error) {
      console.error("Error updating invoice status:", error);
      alert("Failed to update invoice status.");
    } finally {
      setIsSaving(false);
    }
  };

  // ⭐ NUEVO: cambiar el job status (statusId) de la propiedad
  const handleJobStatusChange = async (propertyId: string, newStatusId: string) => {
    setIsSaving(true);
    try {
      await propertiesService.update(propertyId, { statusId: newStatusId } as any);
      setProperties(properties.map(p => p.id === propertyId ? { ...p, statusId: newStatusId } : p));
    } catch (error) {
      console.error("Error updating job status:", error);
      alert("Failed to update job status.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (propertyId: string) => {
    if (!window.confirm("Are you sure you want to completely delete this job?")) return;
    setIsSaving(true);
    try {
      await propertiesService.delete(propertyId);
      setProperties(properties.filter(p => p.id !== propertyId));
    } catch (error) {
      console.error("Error deleting property:", error);
      alert("Failed to delete property.");
    } finally {
      setIsSaving(false);
    }
  };

  const getTeamName = (teamId?: string) => getRelationName(teams, teamId || '', 'Unassigned');

  // Filtro de scope (sólo lo que el usuario tiene permitido ver)
  const inScope = (prop: Property) => {
    if (isSuperAdmin) return true;
    const isAssigned = prop.assignedWorkers?.includes(currentUser?.id || '');
    const isSameTeam = currentUser?.teamId && (prop.teamId === currentUser.teamId);
    return isAssigned || isSameTeam;
  };

  // Conteos por status (para mostrar como badge en cada pill button)
  const invoiceCounts = INVOICE_STATUSES.reduce((acc, st) => {
    acc[st.id] = properties.filter(p => inScope(p) && p.invoiceStatus === st.id).length;
    return acc;
  }, {} as Record<string, number>);
  const totalScopedCount = properties.filter(inScope).length;

  // ⭐ Filtrado completo + ordenado por Schedule Date ascendente
  const filteredProperties = properties.filter(prop => {
    if (!inScope(prop)) return false;
    if (filterStatus !== 'All' && prop.invoiceStatus !== filterStatus) return false;
    if (searchClient) {
      const q = searchClient.toLowerCase();
      const clientName = getClientName(prop.client).toLowerCase();
      const address = (prop.address || '').toLowerCase();
      if (!clientName.includes(q) && !address.includes(q)) return false;
    }
    if (startDate && prop.scheduleDate && prop.scheduleDate < startDate) return false;
    if (endDate && prop.scheduleDate && prop.scheduleDate > endDate) return false;
    return true;
  }).sort((a, b) => parseDateForSort(a.scheduleDate) - parseDateForSort(b.scheduleDate));

  // Estilos compartidos
  const s = {
    label: { fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, marginBottom: '6px', display: 'block', letterSpacing: '0.05em' },
    inputWrapper: { position: 'relative' as const, display: 'flex', alignItems: 'center', width: '100%' },
    icon: { position: 'absolute' as const, left: '12px', color: '#94a3b8', pointerEvents: 'none' as const },
    input: { backgroundColor: '#ffffff', padding: '10px 14px 10px 36px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', color: '#1e293b', width: '100%', boxSizing: 'border-box' as const, outline: 'none', transition: 'border-color 0.2s' },
    th: { padding: '14px 18px', textAlign: 'left' as const, fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' as const, backgroundColor: '#fafbfc' },
    td: { padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontSize: '0.92rem', color: '#1e293b', verticalAlign: 'middle' as const },
  };

  // ⭐ Estilos de los pill buttons del filtro de Invoice Status
  const pillFilterBtn = (active: boolean, color: string): React.CSSProperties => ({
    padding: '8px 14px',
    borderRadius: '20px',
    fontSize: '0.85rem',
    fontWeight: 700,
    border: `1px solid ${active ? color : '#e5e7eb'}`,
    backgroundColor: active ? `${color}15` : 'white',
    color: active ? color : '#475569',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    whiteSpace: 'nowrap',
    boxShadow: active ? `0 0 0 2px ${color}20` : '0 1px 2px rgba(0,0,0,0.03)'
  });
  const countBadge = (active: boolean, color: string): React.CSSProperties => ({
    backgroundColor: active ? color : '#f1f5f9',
    color: active ? 'white' : '#64748b',
    borderRadius: '10px',
    padding: '1px 8px',
    fontSize: '0.7rem',
    fontWeight: 800,
    minWidth: '22px',
    textAlign: 'center'
  });

  return (
    <div className="fade-in" style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* Scrollbars elegantes */}
      <style>{`
        .fade-in *::-webkit-scrollbar { width: 6px; height: 6px; }
        .fade-in *::-webkit-scrollbar-track { background: transparent; }
        .fade-in *::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.25); border-radius: 10px; transition: background 0.2s ease; }
        .fade-in *::-webkit-scrollbar-thumb:hover { background: rgba(100, 116, 139, 0.55); }
        .fade-in * { scrollbar-width: thin; scrollbar-color: rgba(148, 163, 184, 0.25) transparent; }
      `}</style>

      {/* HEADER */}
      <header style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button onClick={onOpenMenu} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', color: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
        <div>
          <h1 style={{ margin: 0, color: '#0f172a', fontSize: '1.8rem', fontWeight: 800 }}>Invoices</h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.95rem' }}>Financial tracking and billing status</p>
        </div>
      </header>

      {/* ⭐ PILL BUTTONS — Filtro por Invoice Status (un botón por cada status + All) */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <button onClick={() => setFilterStatus('All')} style={pillFilterBtn(filterStatus === 'All', '#64748b')}>
          All <span style={countBadge(filterStatus === 'All', '#64748b')}>{totalScopedCount}</span>
        </button>
        {INVOICE_STATUSES.map(st => (
          <button key={st.id} onClick={() => setFilterStatus(st.id)} style={pillFilterBtn(filterStatus === st.id, st.color)}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: st.color }}></span>
            {st.name} <span style={countBadge(filterStatus === st.id, st.color)}>{invoiceCounts[st.id] || 0}</span>
          </button>
        ))}
      </div>

      {/* Filtros secundarios */}
      <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div>
          <label style={s.label}>Start Date</label>
          <div style={s.inputWrapper}>
            <CalendarDays style={s.icon} size={16} />
            <input type="date" style={s.input} value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label style={s.label}>End Date</label>
          <div style={s.inputWrapper}>
            <CalendarDays style={s.icon} size={16} />
            <input type="date" style={s.input} value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label style={s.label}>Search (client or address)</label>
          <div style={s.inputWrapper}>
            <Search style={s.icon} size={16} />
            <input type="text" style={s.input} placeholder="Buscar por cliente o dirección..." value={searchClient} onChange={e => setSearchClient(e.target.value)} />
          </div>
        </div>
      </div>

      {/* TABLA PRINCIPAL */}
      <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1200px' }}>
          <thead>
            <tr>
              <th style={s.th}>Invoice Status</th>
              {/* ⭐ NUEVA COLUMNA: Job Status */}
              <th style={s.th}>Job Status</th>
              <th style={s.th}>Client / Address</th>
              <th style={s.th}>Schedule Date</th>
              <th style={s.th}>Team</th>
              <th style={{...s.th, textAlign: 'right'}}>Total Cost</th>
              <th style={{...s.th, textAlign: 'right'}}>Payroll Total</th>
              <th style={{...s.th, textAlign: 'right'}}>Profit</th>
              <th style={{...s.th, textAlign: 'center'}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} style={{textAlign: 'center', padding: '40px', color: '#94a3b8', fontStyle: 'italic'}}>Loading financial data...</td></tr>
            ) : properties.length === 0 ? (
              <tr><td colSpan={9} style={{textAlign: 'center', padding: '40px', color: '#94a3b8', fontStyle: 'italic'}}>No properties in database. Add one from the Houses view.</td></tr>
            ) : filteredProperties.length === 0 ? (
              <tr><td colSpan={9} style={{textAlign: 'center', padding: '40px', color: '#94a3b8', fontStyle: 'italic'}}>No properties match your filters. Try clicking "All" above or clearing the search.</td></tr>
            ) : filteredProperties.map(prop => {

              // Cálculos financieros
              const propServices = billedServices.filter(srv => srv.propertyId === prop.id);
              const totalCost = propServices.reduce((sum, srv) => sum + (Number(srv.total) || 0), 0);
              const propPayrolls = payrolls.filter(pay => pay.propertyId === prop.id);
              const payrollTotal = propPayrolls.reduce((sum, pay) => sum + (Number(pay.totalAmount) || 0), 0);
              const profit = totalCost - payrollTotal;

              // ⭐ Cliente resuelto desde la colección customers
              const clientName = getClientName(prop.client);

              return (
                <tr 
                  key={prop.id} 
                  // ⭐ Click en la fila abre el Detail Modal (delegado al parent)
                  onClick={() => { if(onViewProperty) onViewProperty(prop); }}
                  style={{ cursor: onViewProperty ? 'pointer' : 'default', transition: 'background-color 0.2s' }} 
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'} 
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  
                  <td style={s.td}>
                    <InvoiceStatusPill 
                      currentStatus={prop.invoiceStatus || 'Pending'} 
                      onChange={(newSt: string) => handleStatusChange(prop.id, newSt)} 
                      disabled={isSaving || (!isSuperAdmin && !canEdit)} 
                    />
                  </td>

                  {/* ⭐ JOB STATUS editable inline */}
                  <td style={s.td}>
                    <JobStatusPill 
                      currentStatusId={prop.statusId} 
                      statuses={statuses}
                      onChange={(newId: string) => handleJobStatusChange(prop.id, newId)} 
                      disabled={isSaving || (!isSuperAdmin && !canEdit)}
                    />
                  </td>

                  <td style={s.td}>
                    {/* ⭐ Cliente con nombre resuelto (no ID) */}
                    <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>{clientName}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <MapPin size={12} /> {prop.address || '-'}
                    </div>
                  </td>

                  <td style={{ ...s.td, color: '#475569', fontWeight: 500 }}>
                    {prop.scheduleDate || '-'}
                  </td>

                  <td style={{ ...s.td, color: '#64748b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Users size={14} /> {getTeamName(prop.teamId)}
                    </div>
                  </td>

                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>
                    ${totalCost.toFixed(2)}
                  </td>

                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, color: '#b91c1c' }}>
                    ${payrollTotal.toFixed(2)}
                  </td>

                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 800, color: profit >= 0 ? '#047857' : '#e11d48', fontSize: '1.02rem' }}>
                    ${profit.toFixed(2)}
                  </td>

                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                      {/* ⭐ Ver detalle explícito */}
                      {onViewProperty && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); onViewProperty(prop); }} 
                          title="View Details"
                          style={{ background: 'transparent', border: 'none', color: '#0ea5e9', cursor: 'pointer', padding: '6px', display: 'flex', borderRadius: '4px' }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f9ff'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <Eye size={16} />
                        </button>
                      )}
                      {canEdit && onEditProperty && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); onEditProperty(prop); }} 
                          title="Edit Job"
                          style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '6px', display: 'flex', borderRadius: '4px' }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#eff6ff'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <Edit2 size={16} />
                        </button>
                      )}
                      {canDelete && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(prop.id); }} 
                          title="Delete Job"
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '6px', display: 'flex', borderRadius: '4px' }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fef2f2'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Aviso si el parent no pasó onViewProperty */}
      {!onViewProperty && (
        <div style={{ marginTop: '16px', padding: '10px 14px', backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', color: '#9a3412', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={14} /> Tip: pasa la prop <b>onViewProperty</b> desde el padre para que al hacer click se abra el Detail Modal de HousesView.
        </div>
      )}

    </div>
  );
}