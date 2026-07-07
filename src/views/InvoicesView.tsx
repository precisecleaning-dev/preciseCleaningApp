import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import {
  Search, MapPin, CalendarDays, ChevronDown, Users, Edit2, Trash2, Eye,
  X, Home, Activity, FileText, Clock, Wrench, Hash, Flag, StickyNote, PenTool, User
} from 'lucide-react';

import type { Property, Team, SystemUser, Role, Status, Customer, Priority, Service } from '../types/index';
import { propertiesService } from '../services/propertiesService';
import { db } from '../config/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import './InvoicesView.css';

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
  const str = String(dateStr).trim();
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
    <div tabIndex={0} onBlur={() => setTimeout(() => setIsOpen(false), 200)} className={`inv-pill-wrap${fullWidth ? ' full' : ''}`}>
      <div
        onClick={(e) => { e.stopPropagation(); if(!disabled) setIsOpen(!isOpen); }}
        className={`inv-status-pill dynamic${fullWidth ? ' full' : ''}${disabled ? ' disabled' : ''}`}
        style={{
          '--pill-border': `${statusObj.color}40`,
          '--pill-bg': `${statusObj.color}10`,
          '--pill-bg-hover': `${statusObj.color}20`,
          '--dot-color': statusObj.color,
        } as CSSProperties}
      >
        <span className="inv-pill-label-wrap">
          <span className="inv-pill-dot"></span>
          <span className="inv-pill-text colored">{statusObj.name}</span>
        </span>
        <ChevronDown size={14} color={statusObj.color} className={`inv-pill-chevron${isOpen ? ' open' : ''}`} />
      </div>

      {isOpen && (
        <div className={`inv-pill-dropdown${fullWidth ? ' full' : ''}`}>
          {INVOICE_STATUSES.map((s) => (
            <div
              key={s.id}
              onClick={(e) => {
                e.preventDefault(); e.stopPropagation();
                if(s.id !== currentStatus) onChange(s.id);
                setIsOpen(false);
              }}
              className={`inv-pill-option${currentStatus === s.id ? ' current' : ''}`}
            >
              <span className="inv-pill-dot" style={{ '--dot-color': s.color } as CSSProperties}></span>
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
    <div tabIndex={0} onBlur={() => setTimeout(() => setIsOpen(false), 200)} className={`inv-pill-wrap${fullWidth ? ' full' : ''}`}>
      <div
        onClick={(e) => { e.stopPropagation(); if(!disabled) setIsOpen(!isOpen); }}
        className={`inv-status-pill static${fullWidth ? ' full' : ''}${disabled ? ' disabled' : ''}`}
      >
        <span className="inv-pill-label-wrap">
          <span className="inv-pill-dot" style={{ '--dot-color': pointColor } as CSSProperties}></span>
          <span className="inv-pill-text">{text}</span>
        </span>
        <ChevronDown size={14} color="#9ca3af" className={`inv-pill-chevron${isOpen ? ' open' : ''}`} />
      </div>

      {isOpen && (
        <div className={`inv-pill-dropdown${fullWidth ? ' full' : ''}`}>
          {statuses.map((s) => (
            <div
              key={s.id}
              onClick={(e) => {
                e.preventDefault(); e.stopPropagation();
                if(s.id !== currentStatusId && s.name !== currentStatusId) onChange(s.id);
                setIsOpen(false);
              }}
              className={`inv-pill-option job${(currentStatusId === s.id || currentStatusId === s.name) ? ' current' : ''}`}
            >
              <span className="inv-pill-dot" style={{ '--dot-color': s.color } as CSSProperties}></span>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // ⭐ SuperAdmin o modo Bypass (sin usuario): se ven TODOS los registros.
    if (isSuperAdmin || !currentUser) return true;
    const isAssigned = prop.assignedWorkers?.includes(currentUser.id || '');
    const isSameTeam = currentUser.teamId && (prop.teamId === currentUser.teamId);
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
    // ⭐ Filtro de fechas por TIMESTAMP (antes comparaba strings y fallaba con
    //    formatos mixtos). Si hay filtro activo, las casas sin fecha quedan fuera.
    if (startDate || endDate) {
      if (!prop.scheduleDate) return false;
      const recT = parseDateForSort(prop.scheduleDate);
      if (startDate && recT < parseDateForSort(startDate)) return false;
      if (endDate && recT > parseDateForSort(endDate) + (24 * 60 * 60 * 1000 - 1)) return false;
    }
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
    <div className="fade-in invoices-view inv-page">

      {/* HEADER */}
      <header className="inv-header">
        <button onClick={onOpenMenu} className="inv-hamburger-btn">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
        <div>
          <h1 className="inv-title">Invoices</h1>
          <p className="inv-subtitle">Financial tracking and billing status</p>
        </div>
      </header>

      {/* ⭐ PILL BUTTONS — Filtro por Invoice Status (un botón por cada status + All) */}
      <div className="inv-status-filters-row">
        <button
          onClick={() => setFilterStatus('All')}
          className={`inv-filter-pill${filterStatus === 'All' ? ' active' : ''}`}
          style={{ '--pill-color': '#64748b', '--pill-color-15': '#64748b15', '--pill-color-20': '#64748b20' } as CSSProperties}
        >
          All <span className={`inv-filter-count-badge${filterStatus === 'All' ? ' active' : ''}`}>{totalScopedCount}</span>
        </button>
        {INVOICE_STATUSES.map(st => (
          <button
            key={st.id}
            onClick={() => setFilterStatus(st.id)}
            className={`inv-filter-pill${filterStatus === st.id ? ' active' : ''}`}
            style={{ '--pill-color': st.color, '--pill-color-15': `${st.color}15`, '--pill-color-20': `${st.color}20`, '--dot-color': st.color } as CSSProperties}
          >
            <span className="inv-filter-dot"></span>
            {st.name} <span className={`inv-filter-count-badge${filterStatus === st.id ? ' active' : ''}`}>{invoiceCounts[st.id] || 0}</span>
          </button>
        ))}
      </div>

      {/* Filtros secundarios */}
      <div className="inv-secondary-filters">
        <div>
          <label className="inv-label">Start Date</label>
          <div className="inv-input-wrap">
            <CalendarDays className="inv-input-icon" size={16} />
            <input type="date" className="inv-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="inv-label">End Date</label>
          <div className="inv-input-wrap">
            <CalendarDays className="inv-input-icon" size={16} />
            <input type="date" className="inv-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="inv-search-cell">
          <label className="inv-label">Search (client or address)</label>
          <div className="inv-input-wrap">
            <Search className="inv-input-icon" size={16} />
            <input type="text" className="inv-input" placeholder="Buscar por cliente o dirección..." value={searchClient} onChange={e => setSearchClient(e.target.value)} />
          </div>
        </div>
      </div>

      {/* TABLA PRINCIPAL (escritorio) */}
      <div className="inv-table-wrap">
        <table className="inv-table">
          <thead>
            <tr>
              {/* ⭐ Actions movido a la primera columna */}
              <th className="inv-th center">Actions</th>
              <th className="inv-th">Invoice Status</th>
              <th className="inv-th">Job Status</th>
              <th className="inv-th">Client / Address</th>
              <th className="inv-th">Schedule Date</th>
              <th className="inv-th">Team</th>
              <th className="inv-th right">Total Cost</th>
              <th className="inv-th right">Payroll Total</th>
              <th className="inv-th right">Profit</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="inv-empty-row">Loading financial data...</td></tr>
            ) : properties.length === 0 ? (
              <tr><td colSpan={9} className="inv-empty-row">No properties in database. Add one from the Houses view.</td></tr>
            ) : filteredProperties.length === 0 ? (
              <tr><td colSpan={9} className="inv-empty-row">No properties match your filters. Try clicking "All" above or clearing the search.</td></tr>
            ) : filteredProperties.map(prop => {

              const { totalCost, payrollTotal, profit } = calcFinancials(prop);
              const clientName = getClientName(prop.client);

              return (
                <tr
                  key={prop.id}
                  onClick={() => openDetail(prop)}
                  className="inv-row"
                >

                  {/* ⭐ ACTIONS — ahora en la primera columna */}
                  <td className="inv-td center" onClick={(e) => e.stopPropagation()}>
                    <div className="inv-actions-cell">
                      <button
                        onClick={(e) => { e.stopPropagation(); openDetail(prop); }}
                        title="View Details"
                        className="inv-icon-btn view"
                      >
                        <Eye size={16} />
                      </button>
                      {canEdit && onEditProperty && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onEditProperty(prop); }}
                          title="Edit Job"
                          className="inv-icon-btn edit"
                        >
                          <Edit2 size={16} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(prop.id); }}
                          title="Delete Job"
                          className="inv-icon-btn delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>

                  <td className="inv-td" onClick={(e) => e.stopPropagation()}>
                    <InvoiceStatusPill
                      currentStatus={prop.invoiceStatus || 'Pending'}
                      onChange={(newSt: string) => handleStatusChange(prop.id, newSt)}
                      disabled={isSaving || (!isSuperAdmin && !canEdit)}
                    />
                  </td>

                  {/* JOB STATUS editable inline */}
                  <td className="inv-td" onClick={(e) => e.stopPropagation()}>
                    <JobStatusPill
                      currentStatusId={prop.statusId}
                      statuses={statuses}
                      onChange={(newId: string) => handleJobStatusChange(prop.id, newId)}
                      disabled={isSaving || (!isSuperAdmin && !canEdit)}
                    />
                  </td>

                  <td className="inv-td">
                    <div className="inv-client-name">{clientName}</div>
                    <div className="inv-client-address">
                      <MapPin size={12} /> {prop.address || '-'}
                    </div>
                  </td>

                  <td className="inv-td strong">
                    {prop.scheduleDate || '-'}
                  </td>

                  <td className="inv-td muted">
                    <div className="inv-team-cell">
                      <Users size={14} /> {getTeamName(prop.teamId)}
                    </div>
                  </td>

                  <td className="inv-td right cost">
                    ${totalCost.toFixed(2)}
                  </td>

                  <td className="inv-td right payroll">
                    ${payrollTotal.toFixed(2)}
                  </td>

                  <td className={`inv-td right profit ${profit >= 0 ? 'positive' : 'negative'}`}>
                    ${profit.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ====== VISTA TARJETAS (MÓVIL) ====== */}
      <div className="inv-cards-wrap">
        {isLoading ? (
          <div className="inv-empty-row">Loading financial data...</div>
        ) : properties.length === 0 ? (
          <div className="inv-empty-row">No properties in database. Add one from the Houses view.</div>
        ) : filteredProperties.length === 0 ? (
          <div className="inv-empty-row">No properties match your filters. Try clicking "All" above or clearing the search.</div>
        ) : filteredProperties.map(prop => {

          const { totalCost, payrollTotal, profit } = calcFinancials(prop);
          const clientName = getClientName(prop.client);

          return (
            <div
              key={prop.id}
              onClick={() => openDetail(prop)}
              className="inv-job-card"
            >
              {/* Título + profit */}
              <div className="inv-card-top-row">
                <span className="inv-card-client-name">
                  {clientName}
                </span>
                <span className={`inv-card-profit ${profit >= 0 ? 'positive' : 'negative'}`}>
                  ${profit.toFixed(2)}
                </span>
              </div>

              {/* Info con iconos */}
              <div className="inv-card-info-col">
                <div className="inv-card-info-row">
                  <MapPin size={16} color="#94a3b8" className="inv-shrink-0" />
                  <span className="inv-card-info-text">{prop.address || '—'}</span>
                </div>
                <div className="inv-card-info-row">
                  <CalendarDays size={16} color="#94a3b8" className="inv-shrink-0" />
                  <span>{prop.scheduleDate || 'Sin fecha'}</span>
                </div>
                <div className="inv-card-info-row">
                  <Users size={16} color="#94a3b8" className="inv-shrink-0" />
                  <span>{getTeamName(prop.teamId)}</span>
                </div>
              </div>

              {/* Pills de estado (ancho completo) */}
              <div className="inv-card-pills-col" onClick={(e) => e.stopPropagation()}>
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
              <div className="inv-card-mini-summary">
                <div className="inv-card-mini-box cost">
                  <div className="inv-card-mini-label cost">Total Cost</div>
                  <div className="inv-card-mini-value cost">${totalCost.toFixed(2)}</div>
                </div>
                <div className="inv-card-mini-box payroll">
                  <div className="inv-card-mini-label payroll">Payroll</div>
                  <div className="inv-card-mini-value payroll">${payrollTotal.toFixed(2)}</div>
                </div>
              </div>

              {/* Acciones */}
              <div className="inv-card-actions-row" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={(e) => { e.stopPropagation(); openDetail(prop); }}
                  className="inv-card-btn view">
                  <Eye size={16} /> Ver
                </button>
                {canEdit && onEditProperty && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditProperty(prop); }}
                    className="inv-card-btn edit">
                    <Edit2 size={16} /> Editar
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(prop.id); }}
                    className="inv-card-btn delete">
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
            <header className="inv-modal-header">
              <h3 className="inv-modal-title">Property Overview</h3>
              <button className="inv-modal-close" onClick={() => setDetailHouse(null)}><X size={24} /></button>
            </header>

            <div className="inv-modal-body">
              <div className="inv-detail-banner">
                <div className="inv-detail-item">
                  <span className="inv-detail-label blue"><Home size={14} /> PROPERTY ADDRESS</span>
                  <span className="inv-address-value">{detailHouse.address || '-'}</span>
                </div>
              </div>

              <div className="grid-3-cols">
                <div className="inv-detail-item">
                  <span className="inv-detail-label"><Activity size={14} /> STATUS</span>
                  <div className="inv-mt-4">
                    <span className="inv-status-chip">
                      {getRelationName(statuses, detailHouse.statusId, detailHouse.statusId)}
                    </span>
                  </div>
                </div>
                <div className="inv-detail-item">
                  <span className="inv-detail-label"><FileText size={14} /> INVOICE STATUS</span>
                  <span className="inv-detail-value">{detailHouse.invoiceStatus || '-'}</span>
                </div>
                <div className="inv-detail-item">
                  <span className="inv-detail-label"><User size={14} /> CLIENT</span>
                  <span className="inv-detail-value">{getClientName(detailHouse.client)}</span>
                </div>

                <div className="inv-detail-item">
                  <span className="inv-detail-label"><CalendarDays size={14} /> RECEIVE DATE</span>
                  <span className="inv-detail-value">{detailHouse.receiveDate || '-'}</span>
                </div>
                <div className="inv-detail-item">
                  <span className="inv-detail-label"><CalendarDays size={14} /> SCHEDULE DATE</span>
                  <span className="inv-detail-value">{detailHouse.scheduleDate || '-'}</span>
                </div>
                <div className="inv-detail-item">
                  <span className="inv-detail-label"><Wrench size={14} /> SERVICE</span>
                  <span className="inv-detail-value">{getRelationName(services, detailHouse.serviceId)}</span>
                </div>

                <div className="inv-detail-item">
                  <span className="inv-detail-label"><Clock size={14} /> TIME IN</span>
                  <span className="inv-detail-value">{detailHouse.timeIn || '-'}</span>
                </div>
                <div className="inv-detail-item">
                  <span className="inv-detail-label"><Clock size={14} /> TIME OUT</span>
                  <span className="inv-detail-value">{detailHouse.timeOut || '-'}</span>
                </div>
                <div className="inv-detail-item">
                  <span className="inv-detail-label"><Flag size={14} /> PRIORITY</span>
                  <div className="inv-dot-row">
                    {getRelationColor(priorities, detailHouse.priorityId) && <span className="inv-dot-12" style={{ '--dot-color': getRelationColor(priorities, detailHouse.priorityId) } as CSSProperties}></span>}
                    <span className="inv-detail-value">{getRelationName(priorities, detailHouse.priorityId)}</span>
                  </div>
                </div>

                <div className="inv-detail-item">
                  <span className="inv-detail-label"><Hash size={14} /> ROOMS</span>
                  <span className="inv-detail-value">{detailHouse.rooms || '-'}</span>
                </div>
                <div className="inv-detail-item">
                  <span className="inv-detail-label"><Hash size={14} /> BATHROOMS</span>
                  <span className="inv-detail-value">{detailHouse.bathrooms || '-'}</span>
                </div>
                <div className="inv-detail-item">
                  <span className="inv-detail-label"><Users size={14} /> TEAM</span>
                  <div className="inv-dot-row">
                    {getRelationColor(teams, detailHouse.teamId) && <span className="inv-dot-12" style={{ '--dot-color': getRelationColor(teams, detailHouse.teamId) } as CSSProperties}></span>}
                    <span className="inv-detail-value">{getRelationName(teams, detailHouse.teamId, 'Unassigned')}</span>
                  </div>
                </div>

                {/* Resumen financiero del job dentro del detalle */}
                <div className="col-span-full inv-fin-summary-grid">
                  {(() => {
                    const { totalCost, payrollTotal, profit } = calcFinancials(detailHouse);
                    return (
                      <>
                        <div className="inv-fin-summary-box cost">
                          <div className="inv-fin-summary-label cost">Total Cost</div>
                          <div className="inv-fin-summary-value cost">${totalCost.toFixed(2)}</div>
                        </div>
                        <div className="inv-fin-summary-box payroll">
                          <div className="inv-fin-summary-label payroll">Payroll Total</div>
                          <div className="inv-fin-summary-value payroll">${payrollTotal.toFixed(2)}</div>
                        </div>
                        <div className={`inv-fin-summary-box profit ${profit >= 0 ? 'positive' : 'negative'}`}>
                          <div className={`inv-fin-summary-label profit ${profit >= 0 ? 'positive' : 'negative'}`}>Net Profit</div>
                          <div className={`inv-fin-summary-value profit ${profit >= 0 ? 'positive' : 'negative'}`}>${profit.toFixed(2)}</div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div className="col-span-full inv-workers-box">
                  <div className="inv-workers-header">
                    <span className="inv-detail-label"><User size={14} className="inv-label-icon-inline"/> ASSIGNED WORKERS</span>
                  </div>
                  <div className="inv-worker-chips">
                    {!(detailHouse.assignedWorkers && detailHouse.assignedWorkers.length > 0) ? (
                      <span className="inv-workers-none-text">No workers assigned.</span>
                    ) : (
                      detailHouse.assignedWorkers.map(workerId => {
                        const emp = employees.find(e => e.id === workerId);
                        if (!emp) return null;
                        return (
                          <div key={workerId} className="inv-worker-chip">
                            <User size={12} color="#64748b" />
                            {emp.firstName} {emp.lastName}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                <div className="col-span-full"><div className="inv-note-box"><span className="inv-detail-label spaced"><StickyNote size={14} /> GENERAL NOTE</span><span className="inv-detail-value small">{detailHouse.note || 'No notes.'}</span></div></div>
                <div className="col-span-full"><div className="inv-note-box orange"><span className="inv-detail-label orange spaced"><PenTool size={14} /> EMPLOYEE'S NOTE</span><span className="inv-detail-value small">{detailHouse.employeeNote || 'No employee notes.'}</span></div></div>

              </div>
            </div>

            <footer className="inv-modal-footer">
              {canEdit && onEditProperty && (
                <button
                  onClick={() => { const p = detailHouse; setDetailHouse(null); if (p) onEditProperty(p); }}
                  className="inv-btn-primary-modal"
                >
                  <Edit2 size={16} /> Edit Details
                </button>
              )}
              <button className="inv-btn-outline-modal" onClick={() => setDetailHouse(null)}>Close</button>
            </footer>
          </div>
        </div>
      )}

    </div>
  );
}
