import { useState, useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import {
  Calendar, User, DollarSign, CheckCircle, Activity, MapPin, 
  X, Home, FileText, CalendarDays, Clock, Wrench, Hash, Flag, Users, StickyNote, PenTool, Edit2, Trash2, Save
} from 'lucide-react';
import { payrollService } from '../services/payrollService';
import { db, auth } from '../config/firebase';
import { collection, onSnapshot, query, limit } from 'firebase/firestore';
import type { PayrollRecord, Property, SystemUser, Status, Team, Priority, Service, Customer } from '../types/index';
import './PayrollView.css';

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

  // ⭐ Nombre del empleado sin "undefined" cuando falta el apellido.
  const empName = (e: any) => e ? [e.firstName, e.lastName].filter(Boolean).join(' ').trim() : '';

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
    // Tiempo real robusto: soporta ISO 'YYYY-MM-DD', MM/DD/YYYY, DD/MM/YYYY,
    // Timestamps de Firestore y Date. Sin fecha válida => NaN.
    const toTime = (val: any): number => {
      if (val === null || val === undefined || val === '') return NaN;
      if (typeof val === 'object' && typeof val.toDate === 'function') { const d = val.toDate(); return isNaN(d.getTime()) ? NaN : d.getTime(); }
      if (val instanceof Date) return isNaN(val.getTime()) ? NaN : val.getTime();
      const str = String(val).trim();
      const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]).getTime();
      const slash = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (slash) {
        const a = +slash[1], b = +slash[2], y = +slash[3];
        let day: number, mon: number;
        if (a > 12 && b <= 12) { day = a; mon = b; } else { mon = a; day = b; }
        return new Date(y, mon - 1, day).getTime();
      }
      const t = new Date(str).getTime();
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


  return (
    <div className="fade-in pv-page">

      {/* HEADER */}
      <header className="main-header dashboard-header-container pv-header">
        <div className="view-header-title-group">
          <button className="hamburger-btn" onClick={onOpenMenu} aria-label="Open menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div>
            <h1 className="pv-title">Payroll & Payments</h1>
            <p className="pv-subtitle">Manage employee payments and debts</p>
          </div>
        </div>
      </header>

      {/* FILTROS */}
      <div className="pv-filters">
        <div className="pv-filter-item">
          <label className="pv-label">Start Date</label>
          <div className="pv-input-wrap">
            <Calendar size={16} color="#9ca3af" className="pv-input-icon" />
            <input type="date" className="pv-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
        </div>
        <div className="pv-filter-item">
          <label className="pv-label">End Date</label>
          <div className="pv-input-wrap">
            <Calendar size={16} color="#9ca3af" className="pv-input-icon" />
            <input type="date" className="pv-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="pv-filter-item employee">
          <label className="pv-label">Employee</label>
          <div className="pv-input-wrap">
            <User size={16} color="#9ca3af" className="pv-input-icon" />
            <select className="pv-input selectable" value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}>
              <option value="">All Employees...</option>
              {employees.map(emp => <option key={emp.id} value={emp.id}>{empName(emp)}</option>)}
            </select>
          </div>
        </div>
        <div className="pv-filter-item status">
          <label className="pv-label">Status</label>
          <div className="pv-input-wrap">
            <Activity size={16} color="#9ca3af" className="pv-input-icon" />
            <select className="pv-input selectable" value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Paid">Paid</option>
            </select>
          </div>
        </div>
      </div>

      {/* RESUMEN FINANCIERO */}
      <div className="pv-summary-grid">
        <div className="pv-summary-card paid">
          <div className="pv-summary-icon-box paid"><CheckCircle size={24} /></div>
          <div>
            <div className="pv-summary-label paid">Total Paid (Filtered)</div>
            <div className="pv-summary-value paid">${totalPaid.toFixed(2)}</div>
          </div>
        </div>
        <div className="pv-summary-card pending">
          <div className="pv-summary-icon-box pending"><DollarSign size={24} /></div>
          <div>
            <div className="pv-summary-label pending">Total Pending (Filtered)</div>
            <div className="pv-summary-value pending">${totalPending.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* REGISTROS */}
      <div className="pv-table-wrap">
        <table className="pv-table">
          <thead>
            <tr>
              <th className="pv-th actions">Actions</th>
              <th className="pv-th">Property</th>
              <th className="pv-th">Date</th>
              <th className="pv-th">Employee</th>
              <th className="pv-th right">Total Amount</th>
              <th className="pv-th center">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="pv-empty-cell">Loading payroll data...</td></tr>
            ) : records.length === 0 ? (
              // ⭐ Distinguir entre "BD vacía" y "filtros excluyen todo"
              <tr><td colSpan={6} className="pv-empty-cell">No payroll records in database yet. Register payments from the Houses view.</td></tr>
            ) : filteredRecords.length === 0 ? (
              <tr><td colSpan={6} className="pv-empty-cell italic">
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
                    className="pv-row"
                  >
                    <td className="pv-td" onClick={(e) => e.stopPropagation()}>
                      <div className="pv-row-actions">
                        <button onClick={() => handleOpenEditModal(record)} className="pv-icon-btn edit"><Edit2 size={16} /></button>
                        <button onClick={() => handleDeletePayroll(record.id as string)} className="pv-icon-btn delete"><Trash2 size={16} /></button>
                      </div>
                    </td>

                    <td className="pv-td">
                      <div className="pv-client-name">{clientName}</div>
                      <div className="pv-client-address"><MapPin size={12} /> {prop ? prop.address : 'Unknown Address'}</div>
                    </td>

                    <td className="pv-td">{fmtDate(record.date)}</td>

                    <td className="pv-td strong">{empName(emp) || 'Unknown'}</td>

                    <td className="pv-td amount">${getTotal(record).toFixed(2)}</td>

                    <td className="pv-td center">
                      {isPaid ? (
                        <div className="pv-paid-col">
                          <button onClick={(e) => { e.stopPropagation(); handleMarkAsPending(record); }} className="pv-paid-btn">
                            <CheckCircle size={14}/> Paid
                          </button>
                          {((record as any).paidAt || (record as any).paidBy) && (
                            <span className="pv-paid-meta">
                              {(record as any).paidAt ? fmtDate((record as any).paidAt) : ''}{(record as any).paidBy ? ` · ${(record as any).paidBy}` : ''}
                            </span>
                          )}
                        </div>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); handleMarkAsPaid(record); }} className="pv-mark-paid-btn">
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
          <div className="modal-70 pv-payment-modal" onClick={e => e.stopPropagation()}>
            <header className="pv-modal-header">
              <h3 className="pv-modal-title">Payment Details</h3>
              <button className="pv-modal-close" onClick={() => setSelectedPayroll(null)}><X size={24} /></button>
            </header>

            <div className="pv-modal-body">
              {(() => {
                const emp = employees.find(e => e.id === selectedPayroll.employeeId);
                const prop = properties.find(p => p.id === selectedPayroll.propertyId);
                const isPaid = selectedPayroll.status === 'Paid';
                const clientName = prop ? getClientName(prop.client) : 'Unknown Property';

                return (
                  <>
                    <div className="pv-payment-top-row">
                      <div>
                        <h4 className="pv-payment-employee-name">
                          <User size={22} color="#3b82f6" /> {empName(emp) || 'Unknown Employee'}
                        </h4>
                        <div className="pv-payment-paid-on">
                          <CalendarDays size={16} /> Paid on: {fmtDate((selectedPayroll as any).paidAt || selectedPayroll.date)}{(selectedPayroll as any).paidBy ? ` · by ${(selectedPayroll as any).paidBy}` : ''}
                        </div>
                      </div>
                      <span className={`pv-payment-status-chip ${isPaid ? 'paid' : 'pending'}`}>
                        {selectedPayroll.status || 'Pending'}
                      </span>
                    </div>

                    <div className="pv-detail-banner">
                      <div className="pv-property-banner-inner">
                        <div className="pv-property-banner-col">
                          <span className="pv-detail-label blue"><Home size={14} /> PROPERTY COMPLETED</span>
                          <span className="pv-property-banner-client">{clientName}</span>
                          <span className="pv-property-banner-address">
                            <MapPin size={14}/> {prop ? prop.address : 'Unknown Address'}
                          </span>
                        </div>
                        <button
                          onClick={() => { setSelectedHouse(prop || null); setSelectedPayroll(null); }}
                          className="pv-view-property-btn"
                        >
                          <FileText size={18} /> View Property
                        </button>
                      </div>
                    </div>

                    <div className="pv-amounts-grid">
                      <div className="pv-amount-box">
                        <span className="pv-amount-label">Base Amount</span>
                        <span className="pv-amount-value">${Number(selectedPayroll.baseAmount || 0).toFixed(2)}</span>
                      </div>
                      <div className="pv-amount-box">
                        <span className="pv-amount-label">Extra Amount</span>
                        <span className="pv-amount-value">+ ${Number(selectedPayroll.extraAmount || 0).toFixed(2)}</span>
                        {selectedPayroll.extraNote && <span className="pv-amount-note">"{selectedPayroll.extraNote}"</span>}
                      </div>
                      <div className="pv-amount-box discount">
                        <span className="pv-amount-label discount">Discount</span>
                        <span className="pv-amount-value discount">- ${Number(selectedPayroll.discountAmount || 0).toFixed(2)}</span>
                        {selectedPayroll.discountNote && <span className="pv-amount-note discount">"{selectedPayroll.discountNote}"</span>}
                      </div>
                      <div className="pv-amount-box total">
                        <span className="pv-amount-label total">TOTAL PAYOUT</span>
                        <span className="pv-amount-value total">${getTotal(selectedPayroll).toFixed(2)}</span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            <footer className="pv-modal-footer">
              <button className="pv-btn-outline-modal" onClick={() => setSelectedPayroll(null)}>Close</button>
              {selectedPayroll.status === 'Paid' ? (
                <button onClick={(e) => { e.stopPropagation(); handleMarkAsPending(selectedPayroll); setSelectedPayroll(null); }} className="pv-btn-outline-modal">Mark as Pending</button>
              ) : (
                <button onClick={(e) => { e.stopPropagation(); handleMarkAsPaid(selectedPayroll); setSelectedPayroll(null); }} className="pv-btn-primary-modal green"><CheckCircle size={18}/> Mark as Paid</button>
              )}
            </footer>
          </div>
        </div>
      )}

      {/* --- MODAL EDICIÓN DEL PAGO --- */}
      {isEditingPayroll && editForm && (
        <div className="modal-overlay-centered" onClick={() => setIsEditingPayroll(false)}>
          <div className="modal-70 pv-edit-modal" onClick={e => e.stopPropagation()}>
            <header className="pv-modal-header">
              <h3 className="pv-modal-title">Edit Payment</h3>
              <button className="pv-modal-close" onClick={() => setIsEditingPayroll(false)}><X size={20} /></button>
            </header>

            <div className="pv-modal-body">
              <div className="pv-edit-grid">
                <div className="pv-edit-row">
                  <div className="pv-edit-field">
                    <label className="pv-label">Base Amount ($) <span className="pv-required-mark">*</span></label>
                    <input type="number" step="0.01" className="pv-input" placeholder="0.00" value={editForm.baseAmount || ''} onChange={(e) => setEditForm({ ...editForm, baseAmount: Number(e.target.value) })} />
                  </div>
                </div>

                <div className="pv-edit-row">
                  <div className="pv-edit-field">
                    <label className="pv-label">Extra ($)</label>
                    <input type="number" step="0.01" className="pv-input" placeholder="0.00" value={editForm.extraAmount || ''} onChange={(e) => setEditForm({ ...editForm, extraAmount: Number(e.target.value) })} />
                  </div>
                  <div className="pv-edit-field wide">
                    <label className="pv-label">Extra Note</label>
                    <input type="text" className="pv-input" placeholder="Reason for extra..." value={editForm.extraNote || ''} onChange={(e) => setEditForm({ ...editForm, extraNote: e.target.value })} />
                  </div>
                </div>

                <div className="pv-edit-row">
                  <div className="pv-edit-field">
                    <label className="pv-label">Discount ($)</label>
                    <input type="number" step="0.01" className="pv-input" placeholder="0.00" value={editForm.discountAmount || ''} onChange={(e) => setEditForm({ ...editForm, discountAmount: Number(e.target.value) })} />
                  </div>
                  <div className="pv-edit-field wide">
                    <label className="pv-label">Discount Note</label>
                    <input type="text" className="pv-input" placeholder="Reason for discount..." value={editForm.discountNote || ''} onChange={(e) => setEditForm({ ...editForm, discountNote: e.target.value })} />
                  </div>
                </div>

                <div className="pv-total-row">
                  <span className="pv-total-label">TOTAL TO PAY:</span>
                  <span className="pv-total-value">${(editForm.totalAmount || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <footer className="pv-modal-footer">
              <button className="pv-btn-outline-modal" onClick={() => setIsEditingPayroll(false)}>Cancel</button>
              <button className="pv-btn-primary-modal" onClick={handleSaveEdit} disabled={isSaving}>
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
            <header className="pv-modal-header">
              <h3 className="pv-modal-title">Property Overview</h3>
              <button className="pv-modal-close" onClick={() => setSelectedHouse(null)}><X size={24} /></button>
            </header>

            <div className="pv-modal-body">
              <div className="pv-detail-banner">
                <div className="pv-detail-item">
                  <span className="pv-detail-label blue"><Home size={14} /> PROPERTY ADDRESS</span>
                  <span className="pv-property-banner-client-static">{selectedHouse.address}</span>
                </div>
              </div>

              <div className="grid-3-cols">
                <div className="pv-detail-item">
                  <span className="pv-detail-label"><Activity size={14} /> STATUS</span>
                  <div className="pv-mt-4">
                    <span className="pv-status-chip">
                      {getRelationName(statuses, selectedHouse.statusId, selectedHouse.statusId)}
                    </span>
                  </div>
                </div>
                <div className="pv-detail-item">
                  <span className="pv-detail-label"><FileText size={14} /> INVOICE STATUS</span>
                  <span className="pv-detail-value">{selectedHouse.invoiceStatus || '-'}</span>
                </div>
                <div className="pv-detail-item">
                  <span className="pv-detail-label"><User size={14} /> CLIENT</span>
                  {/* ⭐ FIX: nombre del cliente resuelto desde customers */}
                  <span className="pv-detail-value">{getClientName(selectedHouse.client)}</span>
                </div>

                <div className="pv-detail-item">
                  <span className="pv-detail-label"><CalendarDays size={14} /> RECEIVE DATE</span>
                  <span className="pv-detail-value">{selectedHouse.receiveDate || '-'}</span>
                </div>
                <div className="pv-detail-item">
                  <span className="pv-detail-label"><CalendarDays size={14} /> SCHEDULE DATE</span>
                  <span className="pv-detail-value">{selectedHouse.scheduleDate || '-'}</span>
                </div>
                <div className="pv-detail-item">
                  <span className="pv-detail-label"><Wrench size={14} /> SERVICE</span>
                  <span className="pv-detail-value">{getRelationName(services, selectedHouse.serviceId)}</span>
                </div>

                <div className="pv-detail-item">
                  <span className="pv-detail-label"><Clock size={14} /> TIME IN</span>
                  <span className="pv-detail-value">{selectedHouse.timeIn || '-'}</span>
                </div>
                <div className="pv-detail-item">
                  <span className="pv-detail-label"><Clock size={14} /> TIME OUT</span>
                  <span className="pv-detail-value">{selectedHouse.timeOut || '-'}</span>
                </div>
                <div className="pv-detail-item">
                  <span className="pv-detail-label"><Flag size={14} /> PRIORITY</span>
                  <div className="pv-dot-row">
                    {getRelationColor(priorities, selectedHouse.priorityId) && <span className="pv-dot-12" style={{ '--dot-color': getRelationColor(priorities, selectedHouse.priorityId) } as CSSProperties}></span>}
                    <span className="pv-detail-value">{getRelationName(priorities, selectedHouse.priorityId)}</span>
                  </div>
                </div>

                <div className="pv-detail-item">
                  <span className="pv-detail-label"><Hash size={14} /> ROOMS</span>
                  <span className="pv-detail-value">{selectedHouse.rooms || '-'}</span>
                </div>
                <div className="pv-detail-item">
                  <span className="pv-detail-label"><Hash size={14} /> BATHROOMS</span>
                  <span className="pv-detail-value">{selectedHouse.bathrooms || '-'}</span>
                </div>
                <div className="pv-detail-item">
                  <span className="pv-detail-label"><Users size={14} /> TEAM</span>
                  <div className="pv-dot-row">
                    {getRelationColor(teams, selectedHouse.teamId) && <span className="pv-dot-12" style={{ '--dot-color': getRelationColor(teams, selectedHouse.teamId) } as CSSProperties}></span>}
                    <span className="pv-detail-value">{getRelationName(teams, selectedHouse.teamId, 'Unassigned')}</span>
                  </div>
                </div>

                <div className="col-span-full pv-workers-box">
                  <div className="pv-workers-header">
                    <span className="pv-detail-label"><User size={14} className="pv-label-icon-inline"/> ASSIGNED WORKERS</span>
                  </div>
                  <div className="pv-worker-chips">
                    {!(selectedHouse.assignedWorkers && selectedHouse.assignedWorkers.length > 0) ? (
                      <span className="pv-workers-none-text">No workers assigned.</span>
                    ) : (
                      selectedHouse.assignedWorkers.map(workerId => {
                        const emp = employees.find(e => e.id === workerId);
                        if (!emp) return null;
                        return (
                          <div key={workerId} className="pv-worker-chip">
                            <User size={12} color="#64748b" />
                            {empName(emp)}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                <div className="col-span-full"><div className="pv-note-box"><span className="pv-detail-label spaced"><StickyNote size={14} /> GENERAL NOTE</span><span className="pv-detail-value small">{selectedHouse.note || 'No notes.'}</span></div></div>
                <div className="col-span-full"><div className="pv-note-box orange"><span className="pv-detail-label orange spaced"><PenTool size={14} /> EMPLOYEE'S NOTE</span><span className="pv-detail-value small">{selectedHouse.employeeNote || 'No employee notes.'}</span></div></div>

              </div>
            </div>

            <footer className="pv-modal-footer alt-bg">
              <button className="pv-btn-close-plain" onClick={() => setSelectedHouse(null)}>Close</button>
            </footer>
          </div>
        </div>
      )}

    </div>
  );
}