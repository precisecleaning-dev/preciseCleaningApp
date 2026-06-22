import { useState, useEffect } from 'react';
import { 
  Search, MapPin, CalendarDays, ChevronDown, Users, Edit2, Trash2, Eye,
  X, Home, Activity, FileText, Clock, Wrench, Hash, Flag, StickyNote, PenTool, User
} from 'lucide-react';

import type { Property, Team, SystemUser, Role, Status, Customer, Priority, Service } from '../types/index';
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

// Resolver color de una relación (priority / team)
const getRelationColor = (list: any[], idOrName?: string | null) => {
  if (!idOrName) return undefined;
  const safeVal = String(idOrName).toLowerCase().trim();
  return list.find(item => String(item.id).toLowerCase().trim() === safeVal || String(item.name).toLowerCase().trim() === safeVal)?.color;
};

// ⭐ FIX (payroll): los documentos de `payroll` NO guardan `totalAmount`, solo
//    baseAmount / extraAmount / discountAmount. Calculamos el total al vuelo.
//    Si existiera totalAmount guardado y distinto de 0, se respeta.
const getPayrollTotal = (pay: any): number => {
  if (!pay) return 0;
  if (pay.totalAmount != null && Number(pay.totalAmount) !== 0) return Number(pay.totalAmount);
  return Number(pay.baseAmount || 0) + Number(pay.extraAmount || 0) - Number(pay.discountAmount || 0);
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
const InvoiceStatusPill = ({ currentStatus, onChange, disabled, fullWidth = false }: { currentStatus: string, onChange: (s: string) => void, disabled: boolean, fullWidth?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const statusObj = INVOICE_STATUSES.find(s => s.id === currentStatus || s.name === currentStatus) 
    || { id: currentStatus, name: currentStatus || 'Pending', color: '#64748b' };

  return (
    <div tabIndex={0} onBlur={() => setTimeout(() => setIsOpen(false), 200)} style={{ position: 'relative', display: fullWidth ? 'block' : 'inline-block', width: fullWidth ? '100%' : 'auto', outline: 'none' }}>
      <div 
        onClick={(e) => { e.stopPropagation(); if(!disabled) setIsOpen(!isOpen); }}
        style={{ 
          color: '#111827', padding: fullWidth ? '11px 14px' : '6px 14px', borderRadius: fullWidth ? '12px' : '20px', 
          fontSize: '0.8rem', fontWeight: 700, display: fullWidth ? 'flex' : 'inline-flex', alignItems: 'center', justifyContent: fullWidth ? 'space-between' : 'flex-start', gap: '8px',
          width: fullWidth ? '100%' : 'auto', boxSizing: 'border-box',
          cursor: disabled ? 'not-allowed' : 'pointer', border: `1px solid ${statusObj.color}40`, transition: 'all 0.2s',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)', backgroundColor: `${statusObj.color}10`
        }}
        onMouseEnter={(e) => { if(!disabled) e.currentTarget.style.backgroundColor = `${statusObj.color}20`; }}
        onMouseLeave={(e) => { if(!disabled) e.currentTarget.style.backgroundColor = `${statusObj.color}10`; }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: statusObj.color, flexShrink: 0 }}></span>
          <span style={{ color: statusObj.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{statusObj.name}</span>
        </span>
        <ChevronDown size={14} color={statusObj.color} style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
      </div>

      {isOpen && (
        <div style={{ 
          position: 'absolute', top: '100%', left: 0, right: fullWidth ? 0 : 'auto', marginTop: '4px', backgroundColor: 'white', 
          border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', 
          zIndex: 9999, minWidth: fullWidth ? '100%' : '160px', boxSizing: 'border-box', overflow: 'hidden', textAlign: 'left'
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
const JobStatusPill = ({ currentStatusId, statuses, onChange, disabled, fullWidth = false }: { currentStatusId: string, statuses: Status[], onChange: (id: string) => void, disabled: boolean, fullWidth?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const safeValue = String(currentStatusId || '').toLowerCase().trim();
  const status = statuses.find(s => String(s.id).toLowerCase().trim() === safeValue || String(s.name).toLowerCase().trim() === safeValue);

  const pointColor = status ? status.color : '#64748b';
  const text = status ? status.name : 'Unassigned';

  return (
    <div tabIndex={0} onBlur={() => setTimeout(() => setIsOpen(false), 200)} style={{ position: 'relative', display: fullWidth ? 'block' : 'inline-block', width: fullWidth ? '100%' : 'auto', outline: 'none' }}>
      <div 
        onClick={(e) => { e.stopPropagation(); if(!disabled) setIsOpen(!isOpen); }}
        style={{ 
          backgroundColor: 'white', color: '#111827', padding: fullWidth ? '11px 14px' : '6px 12px', borderRadius: fullWidth ? '12px' : '20px', 
          fontSize: '0.8rem', fontWeight: 600, display: fullWidth ? 'flex' : 'inline-flex', alignItems: 'center', justifyContent: fullWidth ? 'space-between' : 'flex-start', gap: '8px',
          width: fullWidth ? '100%' : 'auto', boxSizing: 'border-box',
          cursor: disabled ? 'not-allowed' : 'pointer', border: '1px solid #e5e7eb', transition: 'all 0.2s',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
        }}
        onMouseEnter={(e) => { if(!disabled) e.currentTarget.style.backgroundColor = '#f8fafc'; }}
        onMouseLeave={(e) => { if(!disabled) e.currentTarget.style.backgroundColor = 'white'; }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: pointColor, flexShrink: 0 }}></span>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
        </span>
        <ChevronDown size={14} color="#9ca3af" style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
      </div>

      {isOpen && (
        <div style={{ 
          position: 'absolute', top: '100%', left: 0, right: fullWidth ? 0 : 'auto', marginTop: '4px', backgroundColor: 'white', 
          border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', 
          zIndex: 9999, minWidth: fullWidth ? '100%' : '180px', boxSizing: 'border-box', overflow: 'hidden', textAlign: 'left'
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
  // ⭐ Opcional: si el padre lo pasa, se usa; si no, abrimos el modal interno.
  onViewProperty?: (property: Property) => void;
}

export default function InvoicesView({ onOpenMenu, properties, setProperties, currentUser, activeRole, isSuperAdmin, onEditProperty }: InvoicesViewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [teams, setTeams] = useState<Team[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);       // ⭐ Job statuses
  const [customers, setCustomers] = useState<Customer[]>([]);   // ⭐ Para resolver nombre del cliente
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [billedServices, setBilledServices] = useState<any[]>([]);
  // ⭐ NUEVO: catálogos necesarios para el modal de detalle (igual que House view)
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [employees, setEmployees] = useState<SystemUser[]>([]);

  // ⭐ NUEVO: estado del modal de detalle interno (no depende del padre)
  const [detailHouse, setDetailHouse] = useState<Property | null>(null);

  // Filtros UI
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchClient, setSearchClient] = useState('');
  // ⭐ Default 'All' para que TODAS las casas se vean al entrar (antes 'Pending' las ocultaba)
  const [filterStatus, setFilterStatus] = useState<string>('All');

  const canEdit = isSuperAdmin || activeRole?.permissions?.find(p => p.module === 'Houses')?.canEdit;
  const canDelete = isSuperAdmin || activeRole?.permissions?.find(p => p.module === 'Houses')?.canDelete;

  // ⭐ Resolver el nombre del cliente a partir del ID guardado en la propiedad.
  //    Retrocompatible: si el valor es un nombre legacy se devuelve igual.
  const getClientName = (clientIdOrName?: string | null) => {
    if (!clientIdOrName) return 'Unknown';
    return getRelationName(customers, clientIdOrName, String(clientIdOrName));
  };

  // ⭐ Abrir detalle: SIEMPRE usamos el modal interno propio para no depender de que
  //    el padre conecte onViewProperty (esa dependencia era la que dejaba el detalle vacío).
  const openDetail = (prop: Property) => {
    setDetailHouse(prop);
  };

  useEffect(() => {
    setIsLoading(true);
    const unsubscribes: (() => void)[] = [];
    let loaded = 0;
    const TOTAL = 9; // ⭐ ahora cargamos 9 colecciones
    const tick = () => { loaded++; if (loaded >= TOTAL) setIsLoading(false); };

    // ⭐ cargar properties acá también, no sólo en HousesView.
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

    // ⭐ NUEVO: priorities
    unsubscribes.push(onSnapshot(
      collection(db, 'settings_priorities'),
      (snap) => { setPriorities(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Priority[]); tick(); },
      (err) => { console.error("Error priorities:", err); tick(); }
    ));

    // ⭐ NUEVO: services (catálogo)
    unsubscribes.push(onSnapshot(
      collection(db, 'settings_services'),
      (snap) => { setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Service[]); tick(); },
      (err) => { console.error("Error services catalog:", err); tick(); }
    ));

    // ⭐ NUEVO: system_users (para nombres de workers en el detalle)
    unsubscribes.push(onSnapshot(
      collection(db, 'system_users'),
      (snap) => { setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })) as SystemUser[]); tick(); },
      (err) => { console.error("Error users:", err); tick(); }
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

  // ⭐ cambiar el job status (statusId) de la propiedad
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

  // Filtrado completo + ordenado por Schedule Date DESCENDENTE (más reciente primero)
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
  }).sort((a, b) => {
    // Sin fecha => siempre al final, sin importar la dirección del orden
    const hasA = !!a.scheduleDate;
    const hasB = !!b.scheduleDate;
    if (!hasA && !hasB) return 0;
    if (!hasA) return 1;
    if (!hasB) return -1;
    // Ambas con fecha: descendente (más reciente primero)
    return parseDateForSort(b.scheduleDate) - parseDateForSort(a.scheduleDate);
  });

  // Estilos compartidos
  const s = {
    label: { fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, marginBottom: '6px', display: 'block', letterSpacing: '0.05em' },
    inputWrapper: { position: 'relative' as const, display: 'flex', alignItems: 'center', width: '100%' },
    icon: { position: 'absolute' as const, left: '12px', color: '#94a3b8', pointerEvents: 'none' as const },
    input: { backgroundColor: '#ffffff', padding: '10px 14px 10px 36px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', color: '#1e293b', width: '100%', boxSizing: 'border-box' as const, outline: 'none', transition: 'border-color 0.2s' },
    th: { padding: '14px 18px', textAlign: 'left' as const, fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' as const, backgroundColor: '#fafbfc' },
    td: { padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontSize: '0.92rem', color: '#1e293b', verticalAlign: 'middle' as const },

    // Estilos del modal de detalle (igual que Payroll/House overview)
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 } as React.CSSProperties,
    title: { fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: 0 } as React.CSSProperties,
    body: { padding: '30px', overflowY: 'auto', paddingBottom: '30px' } as React.CSSProperties,
    closeBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '4px' } as React.CSSProperties,
    detailBanner: { border: '1px solid #bfdbfe', borderRadius: '8px', padding: '24px', backgroundColor: '#eff6ff', display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '24px' } as React.CSSProperties,
    detailItem: { display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' } as React.CSSProperties,
    detailLabel: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280', fontWeight: 600 } as React.CSSProperties,
    detailValue: { fontSize: '1.05rem', color: '#111827', fontWeight: 500, marginTop: '4px', whiteSpace: 'pre-wrap' } as React.CSSProperties,
    noteBoxGray: { backgroundColor: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb', width: '100%' } as React.CSSProperties,
    noteBoxOrange: { backgroundColor: '#fff7ed', padding: '16px', borderRadius: '8px', border: '1px solid #ffedd5', width: '100%' } as React.CSSProperties,
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

  // ⭐ Helper para los cálculos financieros de una propiedad (reutilizado en tabla y tarjetas)
  const calcFinancials = (prop: Property) => {
    const propServices = billedServices.filter(srv => srv.propertyId === prop.id);
    const totalCost = propServices.reduce((sum, srv) => sum + (Number(srv.total) || 0), 0);
    const propPayrolls = payrolls.filter(pay => pay.propertyId === prop.id);
    const payrollTotal = propPayrolls.reduce((sum, pay) => sum + getPayrollTotal(pay), 0);
    const profit = totalCost - payrollTotal;
    return { totalCost, payrollTotal, profit };
  };

  return (
    <div className="fade-in invoices-view" style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto', boxSizing: 'border-box' }}>
      
      {/* Scrollbars elegantes + estilos de modal + RESPONSIVE */}
      <style>{`
        .fade-in *::-webkit-scrollbar { width: 6px; height: 6px; }
        .fade-in *::-webkit-scrollbar-track { background: transparent; }
        .fade-in *::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.25); border-radius: 10px; transition: background 0.2s ease; }
        .fade-in *::-webkit-scrollbar-thumb:hover { background: rgba(100, 116, 139, 0.55); }
        .fade-in * { scrollbar-width: thin; scrollbar-color: rgba(148, 163, 184, 0.25) transparent; }

        .modal-overlay-centered { position: fixed; inset: 0; background-color: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px; box-sizing: border-box; }
        .modal-70 { background-color: #ffffff; width: 100%; max-width: 1000px; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); display: flex; flex-direction: column; max-height: 90vh; }
        @media (min-width: 769px) { .modal-70 { width: 70%; } }
        .grid-3-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 24px; }
        .col-span-full { grid-column: 1 / -1; }

        /* Por defecto (escritorio): tabla visible, tarjetas ocultas */
        .inv-cards-wrap { display: none; }

        /* ====== RESPONSIVE PRO · SIN SCROLL HORIZONTAL ====== */
        .invoices-view { overflow-x: hidden; max-width: 100%; }

        @media (max-width: 820px) {
          html, body { overflow-x: hidden; max-width: 100%; }
          .invoices-view { padding: 14px !important; }

          /* Ocultar la tabla y mostrar las tarjetas */
          .inv-table-wrap { display: none !important; }
          .inv-cards-wrap { display: flex !important; }

          /* Filtros secundarios apilados */
          .inv-secondary-filters { grid-template-columns: 1fr !important; }
          .inv-secondary-filters .inv-search-cell { grid-column: auto !important; }

          /* Detalle: el grid de 3 columnas pasa a 1 */
          .grid-3-cols { grid-template-columns: 1fr !important; gap: 16px; }

          /* Modal a pantalla completa */
          .modal-overlay-centered { padding: 0 !important; }
          .modal-70 { width: 100vw !important; max-width: 100vw !important; max-height: 100vh; max-height: 100dvh; border-radius: 0; }
          .modal-70 > div { padding: 18px 16px !important; }
          .modal-70 > header { padding: 16px !important; }
          .modal-70 > footer { padding: 14px 16px !important; }
          .modal-70 > footer button { min-height: 46px; padding: 12px 18px !important; border-radius: 10px !important; }
        }

        @media (max-width: 480px) {
          .invoices-view { padding: 10px !important; }
        }
      `}</style>

      {/* HEADER */}
      <header style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button onClick={onOpenMenu} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', color: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', flexShrink: 0 }}>
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
      <div className="inv-secondary-filters" style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px' }}>
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
        <div className="inv-search-cell" style={{ gridColumn: 'span 2' }}>
          <label style={s.label}>Search (client or address)</label>
          <div style={s.inputWrapper}>
            <Search style={s.icon} size={16} />
            <input type="text" style={s.input} placeholder="Buscar por cliente o dirección..." value={searchClient} onChange={e => setSearchClient(e.target.value)} />
          </div>
        </div>
      </div>

      {/* TABLA PRINCIPAL (escritorio) */}
      <div className="inv-table-wrap" style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1200px' }}>
          <thead>
            <tr>
              {/* ⭐ Actions movido a la primera columna */}
              <th style={{...s.th, textAlign: 'center'}}>Actions</th>
              <th style={s.th}>Invoice Status</th>
              <th style={s.th}>Job Status</th>
              <th style={s.th}>Client / Address</th>
              <th style={s.th}>Schedule Date</th>
              <th style={s.th}>Team</th>
              <th style={{...s.th, textAlign: 'right'}}>Total Cost</th>
              <th style={{...s.th, textAlign: 'right'}}>Payroll Total</th>
              <th style={{...s.th, textAlign: 'right'}}>Profit</th>
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

              const { totalCost, payrollTotal, profit } = calcFinancials(prop);
              const clientName = getClientName(prop.client);

              return (
                <tr 
                  key={prop.id} 
                  onClick={() => openDetail(prop)}
                  style={{ cursor: 'pointer', transition: 'background-color 0.2s' }} 
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'} 
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >

                  {/* ⭐ ACTIONS — ahora en la primera columna */}
                  <td style={{ ...s.td, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); openDetail(prop); }} 
                        title="View Details"
                        style={{ background: 'transparent', border: 'none', color: '#0ea5e9', cursor: 'pointer', padding: '6px', display: 'flex', borderRadius: '4px' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f9ff'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <Eye size={16} />
                      </button>
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

                  <td style={s.td} onClick={(e) => e.stopPropagation()}>
                    <InvoiceStatusPill 
                      currentStatus={prop.invoiceStatus || 'Pending'} 
                      onChange={(newSt: string) => handleStatusChange(prop.id, newSt)} 
                      disabled={isSaving || (!isSuperAdmin && !canEdit)} 
                    />
                  </td>

                  {/* JOB STATUS editable inline */}
                  <td style={s.td} onClick={(e) => e.stopPropagation()}>
                    <JobStatusPill 
                      currentStatusId={prop.statusId} 
                      statuses={statuses}
                      onChange={(newId: string) => handleJobStatusChange(prop.id, newId)} 
                      disabled={isSaving || (!isSuperAdmin && !canEdit)}
                    />
                  </td>

                  <td style={s.td}>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ====== VISTA TARJETAS (MÓVIL) ====== */}
      <div className="inv-cards-wrap" style={{ flexDirection: 'column', gap: '14px' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontStyle: 'italic', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>Loading financial data...</div>
        ) : properties.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontStyle: 'italic', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>No properties in database. Add one from the Houses view.</div>
        ) : filteredProperties.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontStyle: 'italic', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>No properties match your filters. Try clicking "All" above or clearing the search.</div>
        ) : filteredProperties.map(prop => {

          const { totalCost, payrollTotal, profit } = calcFinancials(prop);
          const clientName = getClientName(prop.client);

          return (
            <div
              key={prop.id}
              onClick={() => openDetail(prop)}
              style={{
                background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '18px',
                cursor: 'pointer', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
                display: 'flex', flexDirection: 'column', gap: '14px',
              }}
            >
              {/* Título + profit */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.15rem', lineHeight: 1.25, minWidth: 0 }}>
                  {clientName}
                </span>
                <span style={{ flexShrink: 0, fontWeight: 800, fontSize: '1.05rem', color: profit >= 0 ? '#047857' : '#e11d48' }}>
                  ${profit.toFixed(2)}
                </span>
              </div>

              {/* Info con iconos */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#475569' }}>
                  <MapPin size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{prop.address || '—'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#475569' }}>
                  <CalendarDays size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
                  <span>{prop.scheduleDate || 'Sin fecha'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#475569' }}>
                  <Users size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
                  <span>{getTeamName(prop.teamId)}</span>
                </div>
              </div>

              {/* Pills de estado (ancho completo) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                <InvoiceStatusPill 
                  fullWidth
                  currentStatus={prop.invoiceStatus || 'Pending'} 
                  onChange={(newSt: string) => handleStatusChange(prop.id, newSt)} 
                  disabled={isSaving || (!isSuperAdmin && !canEdit)} 
                />
                <JobStatusPill 
                  fullWidth
                  currentStatusId={prop.statusId} 
                  statuses={statuses}
                  onChange={(newId: string) => handleJobStatusChange(prop.id, newId)} 
                  disabled={isSaving || (!isSuperAdmin && !canEdit)}
                />
              </div>

              {/* Mini resumen financiero */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ backgroundColor: '#eff6ff', padding: '10px 12px', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                  <div style={{ fontSize: '0.68rem', color: '#1e40af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Total Cost</div>
                  <div style={{ fontSize: '1.05rem', color: '#1e3a8a', fontWeight: 800, marginTop: '2px' }}>${totalCost.toFixed(2)}</div>
                </div>
                <div style={{ backgroundColor: '#fef2f2', padding: '10px 12px', borderRadius: '10px', border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: '0.68rem', color: '#991b1b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Payroll</div>
                  <div style={{ fontSize: '1.05rem', color: '#7f1d1d', fontWeight: 800, marginTop: '2px' }}>${payrollTotal.toFixed(2)}</div>
                </div>
              </div>

              {/* Acciones */}
              <div style={{ display: 'flex', gap: '10px', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }} onClick={(e) => e.stopPropagation()}>
                <button 
                  onClick={(e) => { e.stopPropagation(); openDetail(prop); }} 
                  style={{ flex: 1, height: '44px', borderRadius: '12px', background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
                  <Eye size={16} /> Ver
                </button>
                {canEdit && onEditProperty && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); onEditProperty(prop); }} 
                    style={{ flex: 1, height: '44px', borderRadius: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
                    <Edit2 size={16} /> Editar
                  </button>
                )}
                {canDelete && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(prop.id); }} 
                    style={{ flex: 1, height: '44px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
                    <Trash2 size={16} /> Borrar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* --- ⭐ MODAL DETALLE DE PROPIEDAD (READ ONLY) — igual al de House view --- */}
      {detailHouse && (
        <div className="modal-overlay-centered" onClick={() => setDetailHouse(null)}>
          <div className="modal-70" onClick={e => e.stopPropagation()}>
            <header style={s.header}>
              <h3 style={s.title}>Property Overview</h3>
              <button style={s.closeBtn} onClick={() => setDetailHouse(null)}><X size={24} /></button>
            </header>

            <div style={s.body}>
              <div style={s.detailBanner}>
                <div style={s.detailItem}>
                  <span style={{ ...s.detailLabel, color: '#1e40af' }}><Home size={14} /> PROPERTY ADDRESS</span>
                  <span style={{ fontSize: '1.25rem', color: '#1e3a8a', fontWeight: 600, marginTop: '4px' }}>{detailHouse.address || '-'}</span>
                </div>
              </div>

              <div className="grid-3-cols">
                <div style={s.detailItem}>
                  <span style={s.detailLabel}><Activity size={14} /> STATUS</span>
                  <div style={{ marginTop: '4px' }}>
                    <span style={{ backgroundColor: '#f1f5f9', padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
                      {getRelationName(statuses, detailHouse.statusId, detailHouse.statusId)}
                    </span>
                  </div>
                </div>
                <div style={s.detailItem}>
                  <span style={s.detailLabel}><FileText size={14} /> INVOICE STATUS</span>
                  <span style={s.detailValue}>{detailHouse.invoiceStatus || '-'}</span>
                </div>
                <div style={s.detailItem}>
                  <span style={s.detailLabel}><User size={14} /> CLIENT</span>
                  <span style={s.detailValue}>{getClientName(detailHouse.client)}</span>
                </div>

                <div style={s.detailItem}>
                  <span style={s.detailLabel}><CalendarDays size={14} /> RECEIVE DATE</span>
                  <span style={s.detailValue}>{detailHouse.receiveDate || '-'}</span>
                </div>
                <div style={s.detailItem}>
                  <span style={s.detailLabel}><CalendarDays size={14} /> SCHEDULE DATE</span>
                  <span style={s.detailValue}>{detailHouse.scheduleDate || '-'}</span>
                </div>
                <div style={s.detailItem}>
                  <span style={s.detailLabel}><Wrench size={14} /> SERVICE</span>
                  <span style={s.detailValue}>{getRelationName(services, detailHouse.serviceId)}</span>
                </div>

                <div style={s.detailItem}>
                  <span style={s.detailLabel}><Clock size={14} /> TIME IN</span>
                  <span style={s.detailValue}>{detailHouse.timeIn || '-'}</span>
                </div>
                <div style={s.detailItem}>
                  <span style={s.detailLabel}><Clock size={14} /> TIME OUT</span>
                  <span style={s.detailValue}>{detailHouse.timeOut || '-'}</span>
                </div>
                <div style={s.detailItem}>
                  <span style={s.detailLabel}><Flag size={14} /> PRIORITY</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    {getRelationColor(priorities, detailHouse.priorityId) && <span style={{ backgroundColor: getRelationColor(priorities, detailHouse.priorityId), width: '12px', height: '12px', borderRadius: '50%', display: 'inline-block' }}></span>}
                    <span style={s.detailValue}>{getRelationName(priorities, detailHouse.priorityId)}</span>
                  </div>
                </div>

                <div style={s.detailItem}>
                  <span style={s.detailLabel}><Hash size={14} /> ROOMS</span>
                  <span style={s.detailValue}>{detailHouse.rooms || '-'}</span>
                </div>
                <div style={s.detailItem}>
                  <span style={s.detailLabel}><Hash size={14} /> BATHROOMS</span>
                  <span style={s.detailValue}>{detailHouse.bathrooms || '-'}</span>
                </div>
                <div style={s.detailItem}>
                  <span style={s.detailLabel}><Users size={14} /> TEAM</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    {getRelationColor(teams, detailHouse.teamId) && <span style={{ backgroundColor: getRelationColor(teams, detailHouse.teamId), width: '12px', height: '12px', borderRadius: '50%', display: 'inline-block' }}></span>}
                    <span style={s.detailValue}>{getRelationName(teams, detailHouse.teamId, 'Unassigned')}</span>
                  </div>
                </div>

                {/* Resumen financiero del job dentro del detalle */}
                <div className="col-span-full" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '16px', marginTop: '8px' }}>
                  {(() => {
                    const { totalCost, payrollTotal, profit } = calcFinancials(detailHouse);
                    return (
                      <>
                        <div style={{ backgroundColor: '#eff6ff', padding: '16px', borderRadius: '8px', border: '1px solid #bfdbfe', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: 700, textTransform: 'uppercase' }}>Total Cost</div>
                          <div style={{ fontSize: '1.3rem', color: '#1e3a8a', fontWeight: 800, marginTop: '4px' }}>${totalCost.toFixed(2)}</div>
                        </div>
                        <div style={{ backgroundColor: '#fef2f2', padding: '16px', borderRadius: '8px', border: '1px solid #fecaca', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: 700, textTransform: 'uppercase' }}>Payroll Total</div>
                          <div style={{ fontSize: '1.3rem', color: '#7f1d1d', fontWeight: 800, marginTop: '4px' }}>${payrollTotal.toFixed(2)}</div>
                        </div>
                        <div style={{ backgroundColor: profit >= 0 ? '#ecfdf5' : '#fef2f2', padding: '16px', borderRadius: '8px', border: `1px solid ${profit >= 0 ? '#a7f3d0' : '#fecaca'}`, textAlign: 'center' }}>
                          <div style={{ fontSize: '0.75rem', color: profit >= 0 ? '#065f46' : '#991b1b', fontWeight: 700, textTransform: 'uppercase' }}>Net Profit</div>
                          <div style={{ fontSize: '1.3rem', color: profit >= 0 ? '#047857' : '#7f1d1d', fontWeight: 800, marginTop: '4px' }}>${profit.toFixed(2)}</div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div className="col-span-full" style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={s.detailLabel}><User size={14} style={{display: 'inline', verticalAlign: 'middle', marginRight: '4px'}}/> ASSIGNED WORKERS</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {!(detailHouse.assignedWorkers && detailHouse.assignedWorkers.length > 0) ? (
                      <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>No workers assigned.</span>
                    ) : (
                      detailHouse.assignedWorkers.map(workerId => {
                        const emp = employees.find(e => e.id === workerId);
                        if (!emp) return null;
                        return (
                          <div key={workerId} style={{ backgroundColor: 'white', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <User size={12} color="#64748b" />
                            {emp.firstName} {emp.lastName}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                <div className="col-span-full"><div style={s.noteBoxGray}><span style={{ ...s.detailLabel, marginBottom: '8px' }}><StickyNote size={14} /> GENERAL NOTE</span><span style={{ ...s.detailValue, fontSize: '0.95rem' }}>{detailHouse.note || 'No notes.'}</span></div></div>
                <div className="col-span-full"><div style={s.noteBoxOrange}><span style={{ ...s.detailLabel, marginBottom: '8px', color: '#c2410c' }}><PenTool size={14} /> EMPLOYEE'S NOTE</span><span style={{ ...s.detailValue, fontSize: '0.95rem' }}>{detailHouse.employeeNote || 'No employee notes.'}</span></div></div>

              </div>
            </div>

            <footer style={{ padding: '16px 24px', backgroundColor: '#f8fafc', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderRadius: '0 0 12px 12px', flexWrap: 'wrap' }}>
              {canEdit && onEditProperty && (
                <button 
                  onClick={() => { const p = detailHouse; setDetailHouse(null); if (p) onEditProperty(p); }} 
                  style={{ backgroundColor: '#3b82f6', border: 'none', color: 'white', padding: '10px 20px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Edit2 size={16} /> Edit Details
                </button>
              )}
              <button style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', color: '#111827', padding: '10px 20px', borderRadius: '6px', fontWeight: 500, cursor: 'pointer' }} onClick={() => setDetailHouse(null)}>Close</button>
            </footer>
          </div>
        </div>
      )}

    </div>
  );
}