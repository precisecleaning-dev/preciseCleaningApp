import { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, User, DollarSign, CheckCircle, Activity, MapPin, 
  X, Home, FileText, CalendarDays, Clock, Wrench, Hash, Flag, Users, StickyNote, PenTool, Edit2, Trash2, Save
} from 'lucide-react';
import { payrollService } from '../services/payrollService';
import { db, auth } from '../config/firebase';
import { collection, onSnapshot, query, limit } from 'firebase/firestore';
import type { PayrollRecord, Property, SystemUser, Status, Team, Priority, Service, Customer } from '../types/index';

interface PayrollViewProps {
  onOpenMenu: () => void;
}

const collectionMap: Record<string, string> = {
  team: 'settings_teams',
  priority: 'settings_priorities',
  status: 'settings_statuses',
  service: 'settings_services',
};

// Helper Functions
const getRelationName = (list: any[], idOrName?: string | null, fallback = '-') => {
  if (!idOrName) return fallback;
  const safeVal = String(idOrName).toLowerCase().trim();
  const found = list.find(item => String(item.id).toLowerCase().trim() === safeVal || String(item.name).toLowerCase().trim() === safeVal);
  return found ? found.name : fallback;
};

const getRelationColor = (list: any[], idOrName?: string | null) => {
  if (!idOrName) return undefined;
  const safeVal = String(idOrName).toLowerCase().trim();
  return list.find(item => String(item.id).toLowerCase().trim() === safeVal || String(item.name).toLowerCase().trim() === safeVal)?.color;
};

export default function PayrollView({ onOpenMenu }: PayrollViewProps) {
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [employees, setEmployees] = useState<SystemUser[]>([]);
  
  // Catálogos para el detalle de la casa
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  // ⭐ FIX: cargar customers para resolver el nombre del cliente desde el ID
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Estados de Modales
  const [selectedPayroll, setSelectedPayroll] = useState<PayrollRecord | null>(null);
  const [isEditingPayroll, setIsEditingPayroll] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState<Property | null>(null);

  // Formulario temporal de edición
  const [editForm, setEditForm] = useState<PayrollRecord | null>(null);

  // ⭐ FIX: default a '' (All Statuses) en vez de 'Pending', para que se vean los registros
  //         existentes que aún no tienen el campo `status` o lo tienen como 'Paid'.
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedStatus, setSelectedStatus] = useState(''); 

  // ⭐ Resolver el nombre del cliente desde la colección customers (retrocompatible)
  const getClientName = (clientIdOrName?: string | null) => {
    if (!clientIdOrName) return 'Unknown';
    return getRelationName(customers, clientIdOrName, String(clientIdOrName));
  };

  // ⭐ FIX (amount): el documento en Firestore NO guarda `totalAmount`, solo
  //    baseAmount / extraAmount / discountAmount. Calculamos el total al vuelo:
  //    base + extra - discount. Si existiera totalAmount guardado y distinto de 0,
  //    se respeta ese valor.
  const getTotal = (r?: Partial<PayrollRecord> | null) => {
    if (!r) return 0;
    if (r.totalAmount != null && Number(r.totalAmount) !== 0) return Number(r.totalAmount);
    return Number(r.baseAmount || 0) + Number(r.extraAmount || 0) - Number(r.discountAmount || 0);
  };

  // ⭐ FIX: usar onSnapshot para carga viva. Esto también significa que los cambios
  //         hechos desde otras vistas (Houses, Invoices) se reflejan en tiempo real.
  useEffect(() => {
    setIsLoading(true);
    const unsubscribes: (() => void)[] = [];
    let loaded = 0;
    const TOTAL = 8;
    const tick = () => { loaded++; if (loaded >= TOTAL) setIsLoading(false); };

    // ⭐ FIX (lecturas + visibilidad): traemos hasta 100 registros con `limit(100)`,
    //    SIN orderBy en el servidor. Motivo: orderBy('date') en Firestore EXCLUYE los
    //    documentos que no tengan ese campo exacto (y puede exigir un índice), lo que
    //    dejaba la tabla vacía. El límite de 100 cuida la cuota del plan gratuito, y el
    //    orden por fecha (más reciente primero) se hace en el cliente, tolerando que
    //    algún documento no tenga `date`.
    unsubscribes.push(onSnapshot(
      query(collection(db, 'payroll'), limit(100)),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as PayrollRecord[];
        // ⭐ Orden de más reciente a más antigua. Convertimos la fecha a un valor de
        //    tiempo real para que funcione tanto con strings 'YYYY-MM-DD' como con
        //    Timestamps de Firestore u otros formatos parseables. Sin fecha => al final.
        const toTime = (val: any): number => {
          if (!val) return 0;
          if (typeof val === 'object' && typeof val.toDate === 'function') return val.toDate().getTime();
          const t = new Date(val).getTime();
          return isNaN(t) ? 0 : t;
        };
        data.sort((a, b) => toTime((b as any).date) - toTime((a as any).date));
        console.log(`[PayrollView] Loaded ${data.length} payroll records (max 100)`, data);
        setRecords(data);
        tick();
      },
      (err) => { console.error("[PayrollView] Error payroll:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, 'properties'),
      (snap) => { setProperties(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Property[]); tick(); },
      (err) => { console.error("Error properties:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, 'system_users'),
      (snap) => { setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })) as SystemUser[]); tick(); },
      (err) => { console.error("Error users:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, collectionMap.status),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Status[];
        setStatuses(data.sort((a, b) => Number((a as any).order || 0) - Number((b as any).order || 0)));
        tick();
      },
      (err) => { console.error("Error statuses:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, collectionMap.team),
      (snap) => { setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Team[]); tick(); },
      (err) => { console.error("Error teams:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, collectionMap.priority),
      (snap) => { setPriorities(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Priority[]); tick(); },
      (err) => { console.error("Error priorities:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, collectionMap.service),
      (snap) => { setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Service[]); tick(); },
      (err) => { console.error("Error services:", err); tick(); }
    ));

    // ⭐ NUEVO: customers
    unsubscribes.push(onSnapshot(
      collection(db, 'customers'),
      (snap) => { setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Customer[]); tick(); },
      (err) => { console.error("Error customers:", err); tick(); }
    ));

    return () => unsubscribes.forEach(u => u());
  }, []);

  // ⭐ Formateo de fecha a MM/DD/YYYY (autocontenido).
  const fmtDate = (val: any): string => {
    if (val === null || val === undefined || val === '') return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    if (typeof val === 'object' && typeof (val as any).toDate === 'function') {
      const d = (val as any).toDate(); return isNaN(d.getTime()) ? '' : `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
    }
    const str = String(val).trim();
    const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return `${pad(+iso[2])}/${pad(+iso[3])}/${iso[1]}`;
    const slash = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (slash) { const a = +slash[1], b = +slash[2]; if (a > 12 && b <= 12) return `${pad(b)}/${pad(a)}/${slash[3]}`; return `${pad(a)}/${pad(b)}/${slash[3]}`; }
    const d = new Date(str); return isNaN(d.getTime()) ? str : `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
  };

  // Lógica de Filtros
  const filteredRecords = useMemo(() => {
    // Tiempo real a partir de strings 'YYYY-MM-DD', Timestamps u otros formatos.
    const toTime = (val: any): number => {
      if (!val) return NaN;
      if (typeof val === 'object' && typeof val.toDate === 'function') return val.toDate().getTime();
      const t = new Date(val).getTime();
      return isNaN(t) ? NaN : t;
    };
    // ⭐ Filtro de fechas por TIMESTAMP (antes comparaba strings y fallaba con formatos mixtos).
    //    endDate es inclusivo (hasta el final de ese día).
    const startT = startDate ? toTime(startDate) : null;
    const endT = endDate ? toTime(endDate) + (24 * 60 * 60 * 1000 - 1) : null;

    return records.filter(record => {
      if (selectedEmployee && record.employeeId !== selectedEmployee) return false;
      if (selectedStatus && (record.status || 'Pending') !== selectedStatus) return false;
      if (startT !== null || endT !== null) {
        const recT = toTime((record as any).date);
        if (isNaN(recT)) return false; // sin fecha válida: fuera del rango
        if (startT !== null && recT < startT) return false;
        if (endT !== null && recT > endT) return false;
      }
      return true;
    }).sort((a, b) => {
      const ta = toTime((a as any).date), tb = toTime((b as any).date);
      return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
    });
  }, [records, startDate, endDate, selectedEmployee, selectedStatus]);

  // Cálculos dinámicos
  const totalPaid = filteredRecords.filter(r => r.status === 'Paid').reduce((sum, r) => sum + getTotal(r), 0);
  const totalPending = filteredRecords.filter(r => r.status !== 'Paid').reduce((sum, r) => sum + getTotal(r), 0);

  const handleMarkAsPaid = async (record: any) => {
    if (!window.confirm("Mark this record as Paid?")) return;
    const paidBy = auth.currentUser?.displayName || auth.currentUser?.email || 'Unknown';
    const paidAt = new Date().toISOString().split('T')[0]; // fecha en que se pagó (YYYY-MM-DD)
    try {
      const { id, ...rest } = record;
      // Esparcimos el registro completo para no perder campos aunque el service sobrescriba.
      await payrollService.update(id, { ...rest, status: 'Paid', paidAt, paidBy });
    } catch (error) {
      console.error("Error updating status", error);
      alert("Failed to update status.");
    }
  };

  const handleMarkAsPending = async (record: any) => {
    if (!window.confirm("Change status back to Pending?")) return;
    try {
      const { id, ...rest } = record;
      await payrollService.update(id, { ...rest, status: 'Pending', paidAt: '', paidBy: '' });
    } catch (error) {
      console.error("Error updating status", error);
      alert("Failed to update status.");
    }
  };

  const handleDeletePayroll = async (id: string) => {
    if (!window.confirm("Are you sure you want to completely delete this payment record? This action cannot be undone.")) return;
    setIsSaving(true);
    try {
      await payrollService.delete(id);
    } catch (error) {
      console.error("Error deleting payroll record:", error);
      alert("Failed to delete record.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenEditModal = (record: PayrollRecord) => {
    setEditForm({ ...record });
    setSelectedPayroll(null);
    setIsEditingPayroll(true);
  };

  const handleSaveEdit = async () => {
    if (!editForm || !editForm.id) return;
    
    const total = Number(editForm.baseAmount || 0) + Number(editForm.extraAmount || 0) - Number(editForm.discountAmount || 0);
    const finalData = { ...editForm, totalAmount: total };

    setIsSaving(true);
    try {
      await payrollService.update(editForm.id, finalData);
      setIsEditingPayroll(false);
      setEditForm(null);
    } catch (error) {
      console.error("Error saving payroll edit:", error);
      alert("Failed to save changes.");
    } finally {
      setIsSaving(false);
    }
  };

  // Efecto para actualizar el total automáticamente mientras se edita
  useEffect(() => {
    if (editForm) {
      const total = Number(editForm.baseAmount || 0) + Number(editForm.extraAmount || 0) - Number(editForm.discountAmount || 0);
      if (editForm.totalAmount !== total) {
        setEditForm({ ...editForm, totalAmount: total });
      }
    }
  }, [editForm?.baseAmount, editForm?.extraAmount, editForm?.discountAmount]);


  const s = {
    input: { padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.95rem', outline: 'none', width: '100%', boxSizing: 'border-box' as const, backgroundColor: '#ffffff', color: '#111827', colorScheme: 'light' as const },
    label: { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, marginBottom: '6px' },
    th: { padding: '12px 20px', textAlign: 'left' as const, fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, borderBottom: '1px solid #f1f5f9' },
    td: { padding: '16px 20px', borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem', color: '#111827', verticalAlign: 'middle' as const },
    
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 },
    title: { fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: 0 },
    body: { padding: '30px', overflowY: 'auto', paddingBottom: '30px' } as React.CSSProperties, 
    detailBanner: { border: '1px solid #bfdbfe', borderRadius: '8px', padding: '24px', backgroundColor: '#eff6ff', display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '24px' } as React.CSSProperties,
    detailItem: { display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' } as React.CSSProperties,
    detailLabel: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280', fontWeight: 600 } as React.CSSProperties,
    detailValue: { fontSize: '1.05rem', color: '#111827', fontWeight: 500, marginTop: '4px', whiteSpace: 'pre-wrap' } as React.CSSProperties,
    noteBoxGray: { backgroundColor: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb', width: '100%' } as React.CSSProperties,
    noteBoxOrange: { backgroundColor: '#fff7ed', padding: '16px', borderRadius: '8px', border: '1px solid #ffedd5', width: '100%' } as React.CSSProperties,
    
    btnPrimary: { backgroundColor: '#3b82f6', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' } as React.CSSProperties,
    btnOutline: { backgroundColor: 'white', border: '1px solid #cbd5e1', color: '#334155', padding: '10px 20px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' } as React.CSSProperties,
    closeBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '4px' } as React.CSSProperties
  };

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <style>{`
        .modal-overlay-centered { position: fixed; inset: 0; background-color: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px; box-sizing: border-box; }
        .modal-70 { background-color: #ffffff; width: 100%; max-width: 1000px; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); display: flex; flex-direction: column; max-height: 90vh; }
        @media (min-width: 769px) { .modal-70 { width: 70%; } }
        .grid-3-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 24px; }
        .col-span-full { grid-column: 1 / -1; }
        
        .hamburger-btn { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px; cursor: pointer; color: #111827; display: flex; align-items: center; justify-content: center; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .hamburger-btn:hover { background-color: #f8fafc; }
        
        .fade-in *::-webkit-scrollbar { width: 6px; height: 6px; }
        .fade-in *::-webkit-scrollbar-track { background: transparent; }
        .fade-in *::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.25); border-radius: 10px; }
        .fade-in *::-webkit-scrollbar-thumb:hover { background: rgba(100, 116, 139, 0.55); }
        .fade-in * { scrollbar-width: thin; scrollbar-color: rgba(148, 163, 184, 0.25) transparent; }

        @media (max-width: 768px) {
          .view-header-title-group { flex-direction: row-reverse; justify-content: space-between; width: 100%; }
        }
      `}</style>

      {/* HEADER */}
      <header className="main-header dashboard-header-container" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div className="view-header-title-group" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="hamburger-btn" onClick={onOpenMenu} aria-label="Open menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.8rem', color: '#111827', fontWeight: 700 }}>Payroll & Payments</h1>
            <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '0.95rem' }}>Manage employee payments and debts</p>
          </div>
        </div>
      </header>

      {/* FILTROS */}
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e5e7eb', marginBottom: '24px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 180px' }}>
          <label style={s.label}>Start Date</label>
          <div style={{ position: 'relative' }}>
            <Calendar size={16} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input type="date" style={{...s.input, paddingLeft: '36px'}} value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
        </div>
        <div style={{ flex: '1 1 180px' }}>
          <label style={s.label}>End Date</label>
          <div style={{ position: 'relative' }}>
            <Calendar size={16} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input type="date" style={{...s.input, paddingLeft: '36px'}} value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        <div style={{ flex: '1 1 250px' }}>
          <label style={s.label}>Employee</label>
          <div style={{ position: 'relative' }}>
            <User size={16} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <select style={{...s.input, paddingLeft: '36px', cursor: 'pointer'}} value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}>
              <option value="">All Employees...</option>
              {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
            </select>
          </div>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label style={s.label}>Status</label>
          <div style={{ position: 'relative' }}>
            <Activity size={16} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <select style={{...s.input, paddingLeft: '36px', cursor: 'pointer'}} value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Paid">Paid</option>
            </select>
          </div>
        </div>
      </div>

      {/* RESUMEN FINANCIERO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', padding: '24px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#d1fae5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckCircle size={24} /></div>
          <div>
            <div style={{ fontSize: '0.85rem', color: '#047857', fontWeight: 600, textTransform: 'uppercase' }}>Total Paid (Filtered)</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#065f46' }}>${totalPaid.toFixed(2)}</div>
          </div>
        </div>
        <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', padding: '24px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#ffedd5', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DollarSign size={24} /></div>
          <div>
            <div style={{ fontSize: '0.85rem', color: '#b45309', fontWeight: 600, textTransform: 'uppercase' }}>Total Pending (Filtered)</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#92400e' }}>${totalPending.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* REGISTROS */}
      <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
          <thead>
            <tr>
              <th style={{...s.th, width: '100px'}}>Actions</th>
              <th style={s.th}>Property</th>
              <th style={s.th}>Date</th>
              <th style={s.th}>Employee</th>
              <th style={{...s.th, textAlign: 'right'}}>Total Amount</th>
              <th style={{...s.th, textAlign: 'center'}}>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading payroll data...</td></tr>
            ) : records.length === 0 ? (
              // ⭐ Distinguir entre "BD vacía" y "filtros excluyen todo"
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No payroll records in database yet. Register payments from the Houses view.</td></tr>
            ) : filteredRecords.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontStyle: 'italic' }}>
                {records.length} records loaded but none match the current filters. Try resetting Status to "All Statuses" or clearing dates.
              </td></tr>
            ) : (
              filteredRecords.map(record => {
                const emp = employees.find(e => e.id === record.employeeId);
                const prop = properties.find(p => p.id === record.propertyId);
                const isPaid = record.status === 'Paid';
                // ⭐ Resolver nombre del cliente
                const clientName = prop ? getClientName(prop.client) : 'Unknown Property';

                return (
                  <tr 
                    key={record.id} 
                    onClick={() => setSelectedPayroll(record)}
                    style={{ transition: 'background-color 0.2s', cursor: 'pointer' }} 
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'} 
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={s.td} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => handleOpenEditModal(record)} style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '6px', display: 'flex' }}><Edit2 size={16} /></button>
                        <button onClick={() => handleDeletePayroll(record.id as string)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '6px', display: 'flex' }}><Trash2 size={16} /></button>
                      </div>
                    </td>

                    <td style={s.td}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{clientName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}><MapPin size={12} /> {prop ? prop.address : 'Unknown Address'}</div>
                    </td>
                    
                    <td style={s.td}>{fmtDate(record.date)}</td>
                    
                    <td style={{...s.td, fontWeight: 600}}>{emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown'}</td>
                    
                    <td style={{...s.td, fontWeight: 700, color: '#111827', textAlign: 'right', fontSize: '1.05rem'}}>${getTotal(record).toFixed(2)}</td>
                    
                    <td style={{...s.td, textAlign: 'center'}}>
                      {isPaid ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                          <button onClick={(e) => { e.stopPropagation(); handleMarkAsPending(record); }} style={{ background: 'none', border: 'none', color: '#10b981', padding: '4px 12px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle size={14}/> Paid
                          </button>
                          {((record as any).paidAt || (record as any).paidBy) && (
                            <span style={{ fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.2, textAlign: 'center' }}>
                              {(record as any).paidAt ? fmtDate((record as any).paidAt) : ''}{(record as any).paidBy ? ` · ${(record as any).paidBy}` : ''}
                            </span>
                          )}
                        </div>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); handleMarkAsPaid(record); }} style={{ backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '20px', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem', margin: '0 auto', display: 'block' }}>
                          Mark Paid
                        </button>
                      )}
                    </td>
                    
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* --- MODAL DETALLE DEL PAGO --- */}
      {selectedPayroll && (
        <div className="modal-overlay-centered" onClick={() => setSelectedPayroll(null)}>
          <div className="modal-70" style={{ maxWidth: '650px' }} onClick={e => e.stopPropagation()}>
            <header style={s.header}>
              <h3 style={s.title}>Payment Details</h3>
              <button style={s.closeBtn} onClick={() => setSelectedPayroll(null)}><X size={24} /></button>
            </header>

            <div style={s.body}>
              {(() => {
                const emp = employees.find(e => e.id === selectedPayroll.employeeId);
                const prop = properties.find(p => p.id === selectedPayroll.propertyId);
                const isPaid = selectedPayroll.status === 'Paid';
                const clientName = prop ? getClientName(prop.client) : 'Unknown Property';

                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                      <div>
                        <h4 style={{ margin: '0 0 6px 0', fontSize: '1.3rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <User size={22} color="#3b82f6" /> {emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown Employee'}
                        </h4>
                        <div style={{ color: '#64748b', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CalendarDays size={16} /> Paid on: {fmtDate((selectedPayroll as any).paidAt || selectedPayroll.date)}{(selectedPayroll as any).paidBy ? ` · by ${(selectedPayroll as any).paidBy}` : ''}
                        </div>
                      </div>
                      <span style={{ backgroundColor: isPaid ? '#d1fae5' : '#ffedd5', color: isPaid ? '#047857' : '#b45309', padding: '8px 16px', borderRadius: '20px', fontSize: '0.9rem', fontWeight: 700 }}>
                        {selectedPayroll.status || 'Pending'}
                      </span>
                    </div>

                    <div style={s.detailBanner}>
                      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ ...s.detailLabel, color: '#1e40af' }}><Home size={14} /> PROPERTY COMPLETED</span>
                          <span style={{ fontSize: '1.15rem', color: '#1e3a8a', fontWeight: 700, marginTop: '4px' }}>{clientName}</span>
                          <span style={{ fontSize: '0.85rem', color: '#3b82f6', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <MapPin size={14}/> {prop ? prop.address : 'Unknown Address'}
                          </span>
                        </div>
                        <button 
                          onClick={() => { setSelectedHouse(prop || null); setSelectedPayroll(null); }}
                          style={{ backgroundColor: 'white', border: '1px solid #bfdbfe', color: '#1e40af', padding: '10px 16px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#eff6ff'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
                        >
                          <FileText size={18} /> View Property
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                      <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Base Amount</span>
                        <span style={{ fontSize: '1.3rem', fontWeight: 700, color: '#1e293b', marginTop: '4px' }}>${Number(selectedPayroll.baseAmount || 0).toFixed(2)}</span>
                      </div>
                      <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Extra Amount</span>
                        <span style={{ fontSize: '1.3rem', fontWeight: 700, color: '#1e293b', marginTop: '4px' }}>+ ${Number(selectedPayroll.extraAmount || 0).toFixed(2)}</span>
                        {selectedPayroll.extraNote && <span style={{fontSize: '0.8rem', color: '#64748b', marginTop: '6px', fontStyle: 'italic'}}>"{selectedPayroll.extraNote}"</span>}
                      </div>
                      <div style={{ padding: '16px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca', display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase' }}>Discount</span>
                        <span style={{ fontSize: '1.3rem', fontWeight: 700, color: '#dc2626', marginTop: '4px' }}>- ${Number(selectedPayroll.discountAmount || 0).toFixed(2)}</span>
                        {selectedPayroll.discountNote && <span style={{fontSize: '0.8rem', color: '#991b1b', marginTop: '6px', fontStyle: 'italic'}}>"{selectedPayroll.discountNote}"</span>}
                      </div>
                      <div style={{ padding: '16px', backgroundColor: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#065f46', textTransform: 'uppercase' }}>TOTAL PAYOUT</span>
                        <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#047857', marginTop: '4px' }}>${getTotal(selectedPayroll).toFixed(2)}</span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
            
            <footer style={{ padding: '16px 24px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', borderRadius: '0 0 12px 12px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button style={s.btnOutline} onClick={() => setSelectedPayroll(null)}>Close</button>
              {selectedPayroll.status === 'Paid' ? (
                <button onClick={(e) => { e.stopPropagation(); handleMarkAsPending(selectedPayroll); setSelectedPayroll(null); }} style={s.btnOutline}>Mark as Pending</button>
              ) : (
                <button onClick={(e) => { e.stopPropagation(); handleMarkAsPaid(selectedPayroll); setSelectedPayroll(null); }} style={{...s.btnPrimary, backgroundColor: '#10b981'}}><CheckCircle size={18}/> Mark as Paid</button>
              )}
            </footer>
          </div>
        </div>
      )}

      {/* --- MODAL EDICIÓN DEL PAGO --- */}
      {isEditingPayroll && editForm && (
        <div className="modal-overlay-centered" onClick={() => setIsEditingPayroll(false)}>
          <div className="modal-70" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <header style={s.header}>
              <h3 style={s.title}>Edit Payment</h3>
              <button style={s.closeBtn} onClick={() => setIsEditingPayroll(false)}><X size={20} /></button>
            </header>
            
            <div style={s.body}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={s.label}>Base Amount ($) <span style={{ color: '#3b82f6' }}>*</span></label>
                    <input type="number" step="0.01" style={s.input} placeholder="0.00" value={editForm.baseAmount || ''} onChange={(e) => setEditForm({ ...editForm, baseAmount: Number(e.target.value) })} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={s.label}>Extra ($)</label>
                    <input type="number" step="0.01" style={s.input} placeholder="0.00" value={editForm.extraAmount || ''} onChange={(e) => setEditForm({ ...editForm, extraAmount: Number(e.target.value) })} />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={s.label}>Extra Note</label>
                    <input type="text" style={s.input} placeholder="Reason for extra..." value={editForm.extraNote || ''} onChange={(e) => setEditForm({ ...editForm, extraNote: e.target.value })} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={s.label}>Discount ($)</label>
                    <input type="number" step="0.01" style={s.input} placeholder="0.00" value={editForm.discountAmount || ''} onChange={(e) => setEditForm({ ...editForm, discountAmount: Number(e.target.value) })} />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={s.label}>Discount Note</label>
                    <input type="text" style={s.input} placeholder="Reason for discount..." value={editForm.discountNote || ''} onChange={(e) => setEditForm({ ...editForm, discountNote: e.target.value })} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: '#ecfdf5', border: '1px solid #10b981', borderRadius: '8px', marginTop: '8px' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#047857' }}>TOTAL TO PAY:</span>
                  <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#047857' }}>${(editForm.totalAmount || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <footer style={{ padding: '16px 24px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', borderRadius: '0 0 12px 12px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button style={s.btnOutline} onClick={() => setIsEditingPayroll(false)}>Cancel</button>
              <button style={{ ...s.btnPrimary, backgroundColor: '#3b82f6' }} onClick={handleSaveEdit} disabled={isSaving}>
                {isSaving ? 'Saving...' : <><Save size={18}/> Save Changes</>}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* --- MODAL DETALLE DE PROPIEDAD (READ ONLY) --- */}
      {selectedHouse && (
        <div className="modal-overlay-centered" onClick={() => setSelectedHouse(null)}>
          <div className="modal-70" onClick={e => e.stopPropagation()}>
            <header style={s.header}>
              <h3 style={s.title}>Property Overview</h3>
              <button style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '4px' }} onClick={() => setSelectedHouse(null)}><X size={24} /></button>
            </header>

            <div style={s.body}>
              <div style={s.detailBanner}>
                <div style={s.detailItem}>
                  <span style={{ ...s.detailLabel, color: '#1e40af' }}><Home size={14} /> PROPERTY ADDRESS</span>
                  <span style={{ fontSize: '1.25rem', color: '#1e3a8a', fontWeight: 600, marginTop: '4px' }}>{selectedHouse.address}</span>
                </div>
              </div>

              <div className="grid-3-cols">
                <div style={s.detailItem}>
                  <span style={s.detailLabel}><Activity size={14} /> STATUS</span>
                  <div style={{ marginTop: '4px' }}>
                    <span style={{ backgroundColor: '#f1f5f9', padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
                      {getRelationName(statuses, selectedHouse.statusId, selectedHouse.statusId)}
                    </span>
                  </div>
                </div>
                <div style={s.detailItem}>
                  <span style={s.detailLabel}><FileText size={14} /> INVOICE STATUS</span>
                  <span style={s.detailValue}>{selectedHouse.invoiceStatus || '-'}</span>
                </div>
                <div style={s.detailItem}>
                  <span style={s.detailLabel}><User size={14} /> CLIENT</span>
                  {/* ⭐ FIX: nombre del cliente resuelto desde customers */}
                  <span style={s.detailValue}>{getClientName(selectedHouse.client)}</span>
                </div>

                <div style={s.detailItem}>
                  <span style={s.detailLabel}><CalendarDays size={14} /> RECEIVE DATE</span>
                  <span style={s.detailValue}>{selectedHouse.receiveDate || '-'}</span>
                </div>
                <div style={s.detailItem}>
                  <span style={s.detailLabel}><CalendarDays size={14} /> SCHEDULE DATE</span>
                  <span style={s.detailValue}>{selectedHouse.scheduleDate || '-'}</span>
                </div>
                <div style={s.detailItem}>
                  <span style={s.detailLabel}><Wrench size={14} /> SERVICE</span>
                  <span style={s.detailValue}>{getRelationName(services, selectedHouse.serviceId)}</span>
                </div>

                <div style={s.detailItem}>
                  <span style={s.detailLabel}><Clock size={14} /> TIME IN</span>
                  <span style={s.detailValue}>{selectedHouse.timeIn || '-'}</span>
                </div>
                <div style={s.detailItem}>
                  <span style={s.detailLabel}><Clock size={14} /> TIME OUT</span>
                  <span style={s.detailValue}>{selectedHouse.timeOut || '-'}</span>
                </div>
                <div style={s.detailItem}>
                  <span style={s.detailLabel}><Flag size={14} /> PRIORITY</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    {getRelationColor(priorities, selectedHouse.priorityId) && <span style={{ backgroundColor: getRelationColor(priorities, selectedHouse.priorityId), width: '12px', height: '12px', borderRadius: '50%', display: 'inline-block' }}></span>}
                    <span style={s.detailValue}>{getRelationName(priorities, selectedHouse.priorityId)}</span>
                  </div>
                </div>

                <div style={s.detailItem}>
                  <span style={s.detailLabel}><Hash size={14} /> ROOMS</span>
                  <span style={s.detailValue}>{selectedHouse.rooms || '-'}</span>
                </div>
                <div style={s.detailItem}>
                  <span style={s.detailLabel}><Hash size={14} /> BATHROOMS</span>
                  <span style={s.detailValue}>{selectedHouse.bathrooms || '-'}</span>
                </div>
                <div style={s.detailItem}>
                  <span style={s.detailLabel}><Users size={14} /> TEAM</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    {getRelationColor(teams, selectedHouse.teamId) && <span style={{ backgroundColor: getRelationColor(teams, selectedHouse.teamId), width: '12px', height: '12px', borderRadius: '50%', display: 'inline-block' }}></span>}
                    <span style={s.detailValue}>{getRelationName(teams, selectedHouse.teamId, 'Unassigned')}</span>
                  </div>
                </div>

                <div className="col-span-full" style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={s.detailLabel}><User size={14} style={{display: 'inline', verticalAlign: 'middle', marginRight: '4px'}}/> ASSIGNED WORKERS</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {!(selectedHouse.assignedWorkers && selectedHouse.assignedWorkers.length > 0) ? (
                      <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>No workers assigned.</span>
                    ) : (
                      selectedHouse.assignedWorkers.map(workerId => {
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

                <div className="col-span-full"><div style={s.noteBoxGray}><span style={{ ...s.detailLabel, marginBottom: '8px' }}><StickyNote size={14} /> GENERAL NOTE</span><span style={{ ...s.detailValue, fontSize: '0.95rem' }}>{selectedHouse.note || 'No notes.'}</span></div></div>
                <div className="col-span-full"><div style={s.noteBoxOrange}><span style={{ ...s.detailLabel, marginBottom: '8px', color: '#c2410c' }}><PenTool size={14} /> EMPLOYEE'S NOTE</span><span style={{ ...s.detailValue, fontSize: '0.95rem' }}>{selectedHouse.employeeNote || 'No employee notes.'}</span></div></div>

              </div>
            </div>
            
            <footer style={{ padding: '16px 24px', backgroundColor: '#f8fafc', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderRadius: '0 0 12px 12px' }}>
              <button style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', color: '#111827', padding: '10px 20px', borderRadius: '6px', fontWeight: 500, cursor: 'pointer' }} onClick={() => setSelectedHouse(null)}>Close</button>
            </footer>
          </div>
        </div>
      )}

    </div>
  );
}