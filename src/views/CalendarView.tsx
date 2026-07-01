import { useState, useEffect } from 'react';
import { 
  ChevronLeft, ChevronRight, X, Edit2, Trash2, 
  Activity, FileText, CalendarDays, Clock, User, Wrench, Hash, Flag, Users, StickyNote, PenTool, Home, ChevronDown, ClipboardCheck, MapPin, Filter, RotateCcw
} from 'lucide-react';
import type { Property, Status, Team, Priority, Service, Customer } from '../types/index';

// --- FIREBASE SERVICES ---
import { propertiesService } from '../services/propertiesService';
import { settingsService } from '../services/settingsService';
import { customersService } from '../services/customersService';

// Settings Collections Map
const collectionMap: Record<string, string> = {
  team: 'settings_teams',
  priority: 'settings_priorities',
  status: 'settings_statuses',
  service: 'settings_services',
};

// --- CUSTOM COMPONENTS & HELPERS (A Prueba de Balas) ---
const CustomSelect = ({ options, value, onChange, placeholder, icon: Icon, returnKey = 'id' }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Búsqueda inteligente: ignora mayúsculas y espacios para compatibilidad con registros viejos
  const safeValue = String(value || '').toLowerCase().trim();
  const selected = options.find((o: any) => 
    String(o.id).toLowerCase().trim() === safeValue || 
    String(o.name).toLowerCase().trim() === safeValue
  );

  return (
    <div tabIndex={0} onBlur={() => setIsOpen(false)} style={{ position: 'relative', width: '100%', outline: 'none' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ backgroundColor: '#ffffff', padding: '12px 14px 12px 40px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.95rem', color: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', position: 'relative' }}
      >
        <Icon size={16} style={{ position: 'absolute', left: '14px', color: '#6b7280' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {selected?.color && <span style={{ backgroundColor: selected.color, width: '12px', height: '12px', borderRadius: '50%', display: 'inline-block' }}></span>}
          <span style={{ color: selected ? '#111827' : '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
            {selected ? selected.name : placeholder}
          </span>
        </div>
        <ChevronDown size={16} color="#9ca3af" style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
      </div>

      {isOpen && (
        <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '6px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 1000, maxHeight: '220px', overflowY: 'auto', marginTop: '4px' }}>
          <div style={{ padding: '12px 14px', cursor: 'pointer', color: '#9ca3af', borderBottom: '1px solid #f3f4f6' }} onMouseDown={(e) => { e.preventDefault(); onChange(''); setIsOpen(false); }}>
            None / Unassigned
          </div>
          {options.map((o: any) => (
            <div 
              key={o.id} 
              style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid #f9fafb' }}
              onMouseDown={(e) => { e.preventDefault(); onChange(o[returnKey] || o.id); setIsOpen(false); }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {o.color && <span style={{ backgroundColor: o.color, display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', flexShrink: 0 }}></span>}
              <span style={{ color: '#111827', fontWeight: 500 }}>{o.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Funciones de mapeo seguras
const getRelationName = (list: any[], idOrName: string, fallback = '-') => {
  if (!idOrName) return fallback;
  const safeVal = String(idOrName).toLowerCase().trim();
  const found = list.find(item => 
    String(item.id).toLowerCase().trim() === safeVal || 
    String(item.name).toLowerCase().trim() === safeVal
  );
  return found ? found.name : fallback;
};

const getRelationColor = (list: any[], idOrName: string) => {
  if (!idOrName) return undefined;
  const safeVal = String(idOrName).toLowerCase().trim();
  return list.find(item => 
    String(item.id).toLowerCase().trim() === safeVal || 
    String(item.name).toLowerCase().trim() === safeVal
  )?.color;
};

// Statuses que NUNCA se ocultan con el filtro de fechas (Quality Check / Recall)
const isAlwaysVisibleStatusName = (name?: string) => {
  const n = String(name || '').toLowerCase();
  return n.includes('quality') || n.includes('recall');
};

// --- TIME CALCULATION HELPERS ---
const START_HOUR = 6; // El calendario empieza a las 6 AM
const PIXELS_PER_HOUR = 60; // 1 hora = 60px de alto

const parseTimeToMinutes = (timeStr: string) => {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
};

interface CalendarViewProps {
  onOpenMenu: () => void;
  onCheckHouse?: (house: Property) => void;
  properties?: Property[]; 
}

export default function CalendarView({ onOpenMenu, onCheckHouse }: CalendarViewProps) {
  
  // --- FIREBASE STATES ---
  const [propertiesList, setPropertiesList] = useState<Property[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [customersList, setCustomersList] = useState<Customer[]>([]);

  // --- UI STATES ---
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month'); // Selector de vistas, default Month para ver el arreglo

  // --- FILTRO DE FECHAS (rango Desde / Hasta) ---
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const filterActive = !!(filterFrom || filterTo);
  const clearFilter = () => { setFilterFrom(''); setFilterTo(''); };

  // --- MODAL STATES ---
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState<Property | null>(null);
  
  const [formData, setFormData] = useState<Property>({
    id: '', statusId: '', invoiceStatus: 'Pending', receiveDate: '', scheduleDate: '', client: '', note: '', address: '', employeeNote: '', serviceId: '', rooms: '1', bathrooms: '1', priorityId: '', teamId: '', timeIn: '', timeOut: ''
  });

  // --- FETCH DATA ---
  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoading(true);
      try {
        const [ propsData, statusData, teamData, prioData, servData, custData ] = await Promise.all([
          propertiesService.getAll(),
          settingsService.getAll(collectionMap.status),
          settingsService.getAll(collectionMap.team),
          settingsService.getAll(collectionMap.priority),
          settingsService.getAll(collectionMap.service),
          customersService.getAll() 
        ]);

        if (propsData) setPropertiesList(propsData);
        if (statusData) setStatuses((statusData as Status[]).sort((a, b) => Number(a.order) - Number(b.order)));
        if (teamData) setTeams(teamData as Team[]);
        if (prioData) setPriorities(prioData as Priority[]);
        if (servData) setServices(servData as Service[]);
        if (custData) setCustomersList(custData);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAllData();
  }, []);

  // --- CALENDAR LOGIC ---
  const prevTime = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') newDate.setMonth(newDate.getMonth() - 1);
    if (viewMode === 'week') newDate.setDate(newDate.getDate() - 7);
    if (viewMode === 'day') newDate.setDate(newDate.getDate() - 1);
    setCurrentDate(newDate);
  };
  
  const nextTime = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') newDate.setMonth(newDate.getMonth() + 1);
    if (viewMode === 'week') newDate.setDate(newDate.getDate() + 7);
    if (viewMode === 'day') newDate.setDate(newDate.getDate() + 1);
    setCurrentDate(newDate);
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
    for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i));
    return days;
  };

  const getStartOfWeek = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day;
    return new Date(date.setDate(diff));
  };

  const getDaysInWeek = (date: Date) => {
    const start = getStartOfWeek(date);
    return Array.from({ length: 7 }).map((_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  };

  const calendarDays = getDaysInMonth(currentDate);
  const weekDaysDates = getDaysInWeek(currentDate);
  const hoursOfDay = Array.from({ length: 18 }).map((_, i) => i + START_HOUR); // 6 AM a 11 PM

  // Dynamic Header Title
  const getHeaderTitle = () => {
    if (viewMode === 'month') return currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    if (viewMode === 'day') return currentDate.toLocaleString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    if (viewMode === 'week') {
      const start = weekDaysDates[0];
      const end = weekDaysDates[6];
      return `${start.getDate()} ${start.toLocaleString('es-ES', {month: 'short'})} - ${end.getDate()} ${end.toLocaleString('es-ES', {month: 'short', year: 'numeric'})}`;
    }
    return '';
  };
  const headerTitleRaw = getHeaderTitle();
  const headerTitle = headerTitleRaw.charAt(0).toUpperCase() + headerTitleRaw.slice(1);
  const weekDaysLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  // --- MODAL HANDLERS ---
  const handleOpenForm = (house?: Property) => {
    if (house) {
      setFormData(house);
    } else {
      const defaultStatus = statuses.length > 0 ? statuses[0].id : '';
      setFormData({ 
        id: '', statusId: defaultStatus, invoiceStatus: 'Pending', receiveDate: new Date().toISOString().split('T')[0], 
        scheduleDate: '', client: '', note: '', address: '', employeeNote: '', serviceId: '', 
        rooms: '1', bathrooms: '1', priorityId: '', teamId: '', timeIn: '', timeOut: '' 
      });
    }
    setSelectedHouse(house || null);
    setIsDetailModalOpen(false);
    setIsFormModalOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormModalOpen(false);
    setSelectedHouse(null);
  };

  const handleCustomerSelect = (customerName: string) => {
    const selectedCust = customersList.find(c => c.name === customerName);
    if (selectedCust) {
      setFormData({ ...formData, client: customerName, address: selectedCust.address || formData.address });
    } else {
      setFormData({ ...formData, client: customerName });
    }
  };

  const handleSave = async () => {
    if (!formData.client) return alert("Client is required.");
    if (!formData.address) return alert("Address is required.");
    
    setIsSaving(true);
    try {
      if (selectedHouse && selectedHouse.id) {
        const { id, ...dataToUpdate } = formData; 
        await propertiesService.update(selectedHouse.id, dataToUpdate as any);
        setPropertiesList(propertiesList.map(p => p.id === selectedHouse.id ? { ...formData } : p));
      } else {
        const { id, ...dataToAdd } = formData; 
        const completeData = {
          ...dataToAdd,
          description: `${formData.client} - ${formData.rooms} rooms`,
          city: 'TBD', size: 'TBD'
        };
        const newId = await propertiesService.create(completeData as any);
        setPropertiesList([...propertiesList, { ...formData, id: newId, description: completeData.description, city: completeData.city, size: completeData.size }]);
      }
      handleCloseForm();
    } catch (error) {
      console.error("Error saving to Firebase:", error);
      alert("Error trying to save property.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if(!selectedHouse) return;
    const confirmDelete = window.confirm("Are you sure you want to completely delete this job?");
    if (!confirmDelete) return;

    setIsSaving(true);
    try {
      await propertiesService.delete(selectedHouse.id);
      setPropertiesList(propertiesList.filter(p => p.id !== selectedHouse.id));
      setIsDetailModalOpen(false);
    } catch (error) {
      console.error("Error deleting:", error);
      alert("Error trying to delete property.");
    } finally {
      setIsSaving(false);
    }
  };

  const invoiceOptions = [{ id: 'Needs Invoice', name: 'Needs Invoice' }, { id: 'Pending', name: 'Pending' }, { id: 'Paid', name: 'Paid' }];
  const roomOptions = [1, 2, 3, 4, 5].map(n => ({ id: String(n), name: String(n) }));

  // Resuelve el cliente por ID o por nombre. En registros viejos, job.client
  // guarda el ID (ej. "4ea3f7ae"); en los nuevos guarda el nombre. Si no se
  // encuentra, devuelve el valor original en vez de un ID opaco.
  const getClientName = (idOrName?: string | null) => {
    if (!idOrName) return '-';
    return getRelationName(customersList, idOrName, String(idOrName));
  };

  // --- RENDER HELPERS ---
  const renderEventBlocks = (date: Date) => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    const dateString = localDate.toISOString().split('T')[0];

    // Trabajos del día. Aplica el filtro de rango EXCEPTO en Quality Check / Recall,
    // que siempre se siguen viendo aunque la fecha quede fuera del rango.
    const dailyJobs = propertiesList.filter(p => {
      const raw = (p.scheduleDate || p.receiveDate);
      if (raw !== dateString) return false; // pertenece a este día
      const stName = getRelationName(statuses, p.statusId, '');
      if (isAlwaysVisibleStatusName(stName)) return true; // QC / Recall: siempre visibles
      if (!filterActive) return true;
      const d = String(raw).slice(0, 10);
      if (filterFrom && d < filterFrom) return false;
      if (filterTo && d > filterTo) return false;
      return true;
    });

    if (viewMode === 'month') {
      // ESTILO MES: Simple stack de eventos
      return dailyJobs.map(job => {
        const statusColor = getRelationColor(statuses, job.statusId) || '#cbd5e1';
        return (
          <div 
            key={job.id} 
            className="calendar-event-month"
            style={{ backgroundColor: `${statusColor}15`, color: '#1e293b', borderLeft: `3px solid ${statusColor}` }}
            onClick={(e) => { e.stopPropagation(); setSelectedHouse(job); setIsDetailModalOpen(true); }}
          >
            <span style={{ fontWeight: 700 }}>{job.timeIn || '--:--'}</span> {getClientName(job.client)}
          </div>
        );
      });
    }

    // ESTILO GOOGLE CALENDAR (DÍA Y SEMANA): Posicionamiento Absoluto
    return dailyJobs.map(job => {
      const statusColor = getRelationColor(statuses, job.statusId) || '#3b82f6';
      
      const startMin = parseTimeToMinutes(job.timeIn) || (8 * 60); // Default 8 AM
      let endMin = parseTimeToMinutes(job.timeOut);
      
      if (!endMin || endMin <= startMin) endMin = startMin + 60; // Si no hay fin, asume 1 hora
      
      const topOffset = ((startMin - (START_HOUR * 60)) / 60) * PIXELS_PER_HOUR;
      const height = ((endMin - startMin) / 60) * PIXELS_PER_HOUR;

      return (
        <div 
          key={job.id} 
          className="calendar-event-absolute"
          style={{ 
            top: `${topOffset}px`, 
            height: `${height}px`,
            backgroundColor: `${statusColor}20`, 
            border: `1px solid ${statusColor}50`,
            borderLeft: `4px solid ${statusColor}`
          }}
          onClick={(e) => { e.stopPropagation(); setSelectedHouse(job); setIsDetailModalOpen(true); }}
        >
          <div className="event-title">{getClientName(job.client)}</div>
          <div className="event-time">{job.timeIn} - {job.timeOut || '?'}</div>
        </div>
      );
    });
  };

  // --- STYLES OBJECT ---
  const s = {
    overlayCentered: { position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px', boxSizing: 'border-box' } as React.CSSProperties,
    modal70: { backgroundColor: '#ffffff', width: '100%', maxWidth: '1000px', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' } as React.CSSProperties,
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 },
    title: { fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: 0 },
    body: { padding: '30px', overflowY: 'auto', paddingBottom: '60px' } as React.CSSProperties,
    footer: { display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', borderRadius: '0 0 12px 12px', flexShrink: 0, flexWrap: 'wrap' } as React.CSSProperties,
    footerBetween: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '16px 24px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', borderRadius: '0 0 12px 12px', flexShrink: 0, flexWrap: 'wrap' } as React.CSSProperties,
    label: { fontSize: '0.85rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', display: 'block' } as React.CSSProperties,
    inputWrapper: { position: 'relative', display: 'flex', alignItems: 'center', width: '100%' } as React.CSSProperties,
    icon: { position: 'absolute', left: '14px', color: '#6b7280', pointerEvents: 'none' } as React.CSSProperties,
    input: { backgroundColor: '#ffffff', padding: '12px 14px 12px 40px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.95rem', color: '#111827', width: '100%', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.2s' } as React.CSSProperties,
    btnPrimary: { backgroundColor: '#3b82f6', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s', opacity: isSaving ? 0.7 : 1 } as React.CSSProperties,
    btnOutline: { backgroundColor: 'white', border: '1px solid #e5e7eb', color: '#111827', padding: '10px 20px', borderRadius: '6px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' } as React.CSSProperties,
    btnDangerLight: { backgroundColor: '#fef2f2', color: '#ef4444', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' } as React.CSSProperties,
    closeBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '4px' },
    detailBanner: { border: '1px solid #bfdbfe', borderRadius: '8px', padding: '24px', backgroundColor: '#eff6ff', display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '24px' } as React.CSSProperties,
    detailItem: { display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' } as React.CSSProperties,
    detailLabel: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280', fontWeight: 600 } as React.CSSProperties,
    detailValue: { fontSize: '1.05rem', color: '#111827', fontWeight: 500, marginTop: '4px', whiteSpace: 'pre-wrap' } as React.CSSProperties,
    noteBoxGray: { backgroundColor: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb', width: '100%' } as React.CSSProperties,
    noteBoxOrange: { backgroundColor: '#fff7ed', padding: '16px', borderRadius: '8px', border: '1px solid #ffedd5', width: '100%' } as React.CSSProperties,
    // Filtro de fechas
    filterCard: { display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '10px 14px', marginBottom: '20px' } as React.CSSProperties,
    filterFieldLabel: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 600, color: '#64748b' } as React.CSSProperties,
    filterDateInput: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '7px 10px', fontSize: '0.85rem', color: '#111827', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' } as React.CSSProperties,
  };

  return (
    <div className="fade-in" style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* INJECTED CALENDAR CSS PARA LAS VISTAS GOOGLE CALENDAR Y MES */}
      <style>{`
        .calendar-wrapper { display: flex; flex-direction: column; flex: 1; background: white; border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden; }
        
        /* Controles de vista */
        .view-toggles { display: flex; background: #f1f5f9; border-radius: 8px; padding: 4px; border: 1px solid #e2e8f0; }
        .view-btn { padding: 6px 16px; border-radius: 6px; font-size: 0.85rem; font-weight: 600; border: none; cursor: pointer; color: #64748b; background: transparent; transition: all 0.2s; }
        .view-btn.active { background: white; color: #0f172a; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

        /* Mes View */
        .calendar-header-grid { display: grid; grid-template-columns: repeat(7, 1fr); background-color: #f8fafc; border-bottom: 1px solid #e5e7eb; }
        .calendar-header-cell { padding: 12px; text-align: center; font-weight: 600; font-size: 0.85rem; color: #64748b; text-transform: uppercase; }
        .calendar-body-grid { display: grid; grid-template-columns: repeat(7, 1fr); flex: 1; background-color: #e5e7eb; gap: 1px; }
        .calendar-day-cell { background-color: #ffffff; min-height: 120px; padding: 8px; display: flex; flex-direction: column; gap: 4px; transition: background-color 0.2s; }
        .calendar-day-cell:hover { background-color: #f8fafc; }
        .calendar-day-cell.empty { background-color: #f9fafb; cursor: default; }
        .calendar-date-number { font-weight: 600; font-size: 0.95rem; color: #1e293b; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; }
        .calendar-event-month { padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; transition: transform 0.2s, box-shadow 0.2s; border: 1px solid rgba(0,0,0,0.05); }
        .calendar-event-month:hover { transform: translateY(-1px); box-shadow: 0 2px 4px rgba(0,0,0,0.1); filter: brightness(0.95); }

        /* Time Grid (Día / Semana) */
        .week-scroll-container { display: flex; flex-direction: column; flex: 1; overflow-x: auto; overflow-y: hidden; }
        .week-grid-inner { display: flex; flex-direction: column; flex: 1; min-height: 0; }
        .week-view-active { min-width: 750px; } /* Fuerza el scroll horizontal en móvil para la semana */
        .day-view-active { min-width: 100%; }

        .time-grid-container { display: flex; flex: 1; overflow-y: auto; position: relative; }
        .time-axis { width: 60px; flex-shrink: 0; background: white; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; }
        .time-label { height: 60px; padding-right: 8px; text-align: right; font-size: 0.75rem; color: #64748b; border-bottom: 1px solid #f1f5f9; box-sizing: border-box; display: flex; align-items: flex-start; justify-content: flex-end; padding-top: 4px;}
        
        .day-columns-wrapper { display: flex; flex: 1; flex-direction: row; }
        .day-column-time { flex: 1; border-right: 1px solid #e5e7eb; position: relative; min-width: 0; }
        .day-column-time:last-child { border-right: none; }
        .hour-grid-line { height: 60px; border-bottom: 1px solid #f1f5f9; box-sizing: border-box; width: 100%; }
        
        /* Eventos Absolutos (Google Calendar Style) */
        .calendar-event-absolute { position: absolute; left: 4px; right: 4px; border-radius: 6px; padding: 6px 8px; font-size: 0.75rem; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); z-index: 10; cursor: pointer; transition: transform 0.1s, filter 0.2s; display: flex; flex-direction: column; gap: 2px; }
        .calendar-event-absolute:hover { transform: scale(1.02); z-index: 20; filter: brightness(0.95); }
        .calendar-event-absolute .event-title { font-weight: 700; color: #0f172a; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;}
        .calendar-event-absolute .event-time { font-size: 0.7rem; color: #475569; }

        .grid-3-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 24px; }
        .col-span-full { grid-column: 1 / -1; }
        
        /* Ajustes Responsivos */
        @media (max-width: 768px) {
          .view-header-title-group { flex-direction: row-reverse; justify-content: space-between; width: 100%; }
          .grid-3-cols { grid-template-columns: 1fr; gap: 16px; }
          
          /* En vista de mes, PERMITIR SCROLL HORIZONTAL en vez de colapsar verticalmente */
          .month-scroll-container {
            overflow-x: auto;
            width: 100%;
          }
          .month-grid-inner {
            min-width: 800px; /* Fuerza el ancho mínimo para mantener la cuadrícula de 7 días */
          }
        }
      `}</style>

      {/* HEADER */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div className="view-header-title-group">
          <button onClick={onOpenMenu} className="hamburger-btn" aria-label="Open menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.8rem', color: '#111827', fontWeight: 700 }}>Calendar</h1>
            <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '0.95rem' }}>Schedule & Planning</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          {/* VIEW TOGGLES */}
          <div className="view-toggles">
            <button className={`view-btn ${viewMode === 'day' ? 'active' : ''}`} onClick={() => setViewMode('day')}>Day</button>
            <button className={`view-btn ${viewMode === 'week' ? 'active' : ''}`} onClick={() => setViewMode('week')}>Week</button>
            <button className={`view-btn ${viewMode === 'month' ? 'active' : ''}`} onClick={() => setViewMode('month')}>Month</button>
          </div>

          {/* DATE NAVIGATION */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', backgroundColor: 'white', padding: '6px 12px', borderRadius: '24px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <button onClick={prevTime} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', color: '#64748b' }}><ChevronLeft size={20}/></button>
            <span style={{ fontWeight: 700, color: '#1e293b', minWidth: '160px', textAlign: 'center', textTransform: 'capitalize', fontSize: '0.9rem' }}>{headerTitle}</span>
            <button onClick={nextTime} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', color: '#64748b' }}><ChevronRight size={20}/></button>
          </div>
        </div>
      </header>

      {/* --- BARRA DE FILTRO DE FECHAS --- */}
      <div style={s.filterCard}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
          <Filter size={15} color="#3b82f6" /> Filtrar por fecha
        </span>

        <label style={s.filterFieldLabel}>
          Desde
          <input type="date" value={filterFrom} max={filterTo || undefined}
            onChange={e => setFilterFrom(e.target.value)} style={s.filterDateInput} />
        </label>

        <label style={s.filterFieldLabel}>
          Hasta
          <input type="date" value={filterTo} min={filterFrom || undefined}
            onChange={e => setFilterTo(e.target.value)} style={s.filterDateInput} />
        </label>

        {filterActive && (
          <button onClick={clearFilter} style={{
            display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid #e5e7eb',
            borderRadius: '8px', padding: '7px 12px', fontSize: '0.82rem', fontWeight: 600, color: '#475569', cursor: 'pointer',
          }}>
            <RotateCcw size={14} /> Limpiar
          </button>
        )}

        {filterActive && (
          <span style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem',
            fontWeight: 700, color: '#0369a1', background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: '999px', padding: '3px 10px',
          }}>
            <ClipboardCheck size={12} /> Quality Check y Recall siempre visibles
          </span>
        )}
      </div>

      {/* CALENDAR RENDER */}
      {isLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>Loading calendar data...</div>
      ) : (
        <div className="calendar-wrapper">
          
          {/* === VISTA DE MES === */}
          {viewMode === 'month' && (
            <div className="month-scroll-container">
              <div className="month-grid-inner">
                <div className="calendar-header-grid">
                  {weekDaysLabels.map(day => <div key={day} className="calendar-header-cell">{day}</div>)}
                </div>
                <div className="calendar-body-grid">
                  {calendarDays.map((date, index) => {
                    if (!date) return <div key={`empty-${index}`} className="calendar-day-cell empty"></div>;
                    return (
                      <div key={date.toISOString()} className="calendar-day-cell">
                        <div className="calendar-date-number">
                          <span>{date.getDate()}</span>
                        </div>
                        {renderEventBlocks(date)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* === VISTA DE SEMANA / DÍA (Estilo Google Calendar) === */}
          {(viewMode === 'week' || viewMode === 'day') && (
            <div className="week-scroll-container">
              <div className={`week-grid-inner ${viewMode === 'week' ? 'week-view-active' : 'day-view-active'}`}>
                
                {/* Header de la semana/día */}
                <div style={{ paddingLeft: '60px', display: 'flex', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f8fafc' }}>
                  {(viewMode === 'week' ? weekDaysDates : [currentDate]).map((date, i) => (
                    <div key={i} style={{ flex: 1, padding: '12px', textAlign: 'center', borderRight: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>{weekDaysLabels[date.getDay()]}</div>
                      <div style={{ fontSize: '1.2rem', color: '#1e293b', fontWeight: 800, marginTop: '2px' }}>{date.getDate()}</div>
                    </div>
                  ))}
                </div>

                {/* Grid Horario */}
                <div className="time-grid-container">
                  {/* Eje Y de Horas */}
                  <div className="time-axis">
                    {hoursOfDay.map(h => (
                      <div key={`h-${h}`} className="time-label">
                        {h > 12 ? `${h-12} PM` : h === 12 ? '12 PM' : `${h} AM`}
                      </div>
                    ))}
                  </div>

                  {/* Columnas de Días */}
                  <div className="day-columns-wrapper">
                    {(viewMode === 'week' ? weekDaysDates : [currentDate]).map((date, i) => (
                      <div key={`day-${i}`} className="day-column-time">
                        {/* Líneas de fondo */}
                        {hoursOfDay.map(h => <div key={`bg-${h}`} className="hour-grid-line"></div>)}
                        {/* Eventos Posicionados */}
                        {renderEventBlocks(date)}
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      )}

      {/* --- FORM MODAL --- */}
      {isFormModalOpen && (
        <div style={s.overlayCentered} onClick={handleCloseForm}>
          <div style={s.modal70} onClick={e => e.stopPropagation()}>
            <header style={s.header}>
              <h3 style={s.title}>{selectedHouse ? 'Edit Property Details' : 'Register New Property'}</h3>
              <button style={s.closeBtn} onClick={handleCloseForm}><X size={24} /></button>
            </header>

            <div style={s.body}>
              <div className="grid-3-cols">

                <div>
                  <label style={s.label}>Client <span style={{ color: '#3b82f6' }}>*</span></label>
                  <CustomSelect 
                    options={customersList} 
                    value={formData.client} 
                    onChange={handleCustomerSelect} 
                    placeholder="Select Client..." 
                    icon={User} 
                    returnKey="name" 
                  />
                </div>
                <div>
                  <label style={s.label}>Address <span style={{ color: '#3b82f6' }}>*</span></label>
                  <div style={s.inputWrapper}>
                    <MapPin style={s.icon} size={16} />
                    <input type="text" style={s.input} placeholder="Enter full address..." value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label style={s.label}>Status <span style={{ color: '#3b82f6' }}>*</span></label>
                  <CustomSelect options={statuses} value={formData.statusId} onChange={(val: string) => setFormData({ ...formData, statusId: val })} placeholder="Select Status..." icon={Activity} />
                </div>

                <div>
                  <label style={s.label}>Invoice Status</label>
                  <CustomSelect options={invoiceOptions} value={formData.invoiceStatus} onChange={(val: any) => setFormData({ ...formData, invoiceStatus: val })} placeholder="Select Invoice Status..." icon={FileText} />
                </div>
                <div>
                  <label style={s.label}>Services</label>
                  <CustomSelect options={services} value={formData.serviceId} onChange={(val: string) => setFormData({ ...formData, serviceId: val })} placeholder="Select Service..." icon={Wrench} />
                </div>
                <div>
                  <label style={s.label}>Priority</label>
                  <CustomSelect options={priorities} value={formData.priorityId} onChange={(val: string) => setFormData({ ...formData, priorityId: val })} placeholder="Select Priority..." icon={Flag} />
                </div>

                <div>
                  <label style={s.label}>Receive Date</label>
                  <div style={s.inputWrapper}>
                    <CalendarDays style={s.icon} size={16} />
                    <input type="date" style={s.input} value={formData.receiveDate} onChange={e => setFormData({ ...formData, receiveDate: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label style={s.label}>Schedule Date</label>
                  <div style={s.inputWrapper}>
                    <CalendarDays style={s.icon} size={16} />
                    <input type="date" style={s.input} value={formData.scheduleDate} onChange={e => setFormData({ ...formData, scheduleDate: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label style={s.label}>Team</label>
                  <CustomSelect options={teams} value={formData.teamId} onChange={(val: string) => setFormData({ ...formData, teamId: val })} placeholder="Assign Team..." icon={Users} />
                </div>

                <div>
                  <label style={s.label}>Time In</label>
                  <div style={s.inputWrapper}>
                    <Clock style={s.icon} size={16} />
                    <input type="time" style={s.input} value={formData.timeIn} onChange={e => setFormData({ ...formData, timeIn: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label style={s.label}>Time Out</label>
                  <div style={s.inputWrapper}>
                    <Clock style={s.icon} size={16} />
                    <input type="time" style={s.input} value={formData.timeOut} onChange={e => setFormData({ ...formData, timeOut: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label style={s.label}>Rooms</label>
                  <CustomSelect options={roomOptions} value={formData.rooms} onChange={(val: string) => setFormData({ ...formData, rooms: val })} placeholder="Rooms..." icon={Hash} />
                </div>
                
                <div>
                  <label style={s.label}>Bathrooms</label>
                  <CustomSelect options={roomOptions} value={formData.bathrooms} onChange={(val: string) => setFormData({ ...formData, bathrooms: val })} placeholder="Bathrooms..." icon={Hash} />
                </div>

                <div className="col-span-full">
                  <label style={s.label}>Note</label>
                  <div style={{ ...s.inputWrapper, alignItems: 'flex-start' }}>
                    <StickyNote style={{ ...s.icon, top: '14px' }} size={16} />
                    <textarea style={{ ...s.input, minHeight: '80px', resize: 'vertical' }} placeholder="General instructions or notes..." value={formData.note} onChange={e => setFormData({ ...formData, note: e.target.value })}></textarea>
                  </div>
                </div>

                <div className="col-span-full">
                  <label style={s.label}>Employee's Note</label>
                  <div style={{ ...s.inputWrapper, alignItems: 'flex-start' }}>
                    <PenTool style={{ ...s.icon, top: '14px' }} size={16} />
                    <textarea style={{ ...s.input, minHeight: '80px', resize: 'vertical' }} placeholder="Employee performance notes..." value={formData.employeeNote} onChange={e => setFormData({ ...formData, employeeNote: e.target.value })}></textarea>
                  </div>
                </div>

              </div>
            </div>
            
            <footer style={s.footer}>
              <button style={s.btnOutline} onClick={handleCloseForm} disabled={isSaving}>Cancel</button>
              <button style={s.btnPrimary} onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Property'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* --- DETAIL MODAL --- */}
      {isDetailModalOpen && selectedHouse && (
        <div style={s.overlayCentered} onClick={() => setIsDetailModalOpen(false)}>
          <div style={s.modal70} onClick={e => e.stopPropagation()}>
            <header style={s.header}>
              <h3 style={s.title}>Property Overview</h3>
              <button style={s.closeBtn} onClick={() => setIsDetailModalOpen(false)}><X size={24} /></button>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <span style={{ backgroundColor: getRelationColor(statuses, selectedHouse.statusId) || '#ccc', width: '12px', height: '12px', borderRadius: '50%', display: 'inline-block' }}></span>
                    <span style={s.detailValue}>{getRelationName(statuses, selectedHouse.statusId, 'UNASSIGNED')}</span>
                  </div>
                </div>
                <div style={s.detailItem}>
                  <span style={s.detailLabel}><FileText size={14} /> INVOICE STATUS</span>
                  <span style={s.detailValue}>{selectedHouse.invoiceStatus || '-'}</span>
                </div>
                <div style={s.detailItem}>
                  <span style={s.detailLabel}><User size={14} /> CLIENT</span>
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

                <div className="col-span-full">
                  <div style={s.noteBoxGray}>
                    <span style={{ ...s.detailLabel, marginBottom: '8px' }}><StickyNote size={14} /> GENERAL NOTE</span>
                    <span style={{ ...s.detailValue, fontSize: '0.95rem' }}>{selectedHouse.note || 'No notes provided.'}</span>
                  </div>
                </div>

                <div className="col-span-full">
                  <div style={s.noteBoxOrange}>
                    <span style={{ ...s.detailLabel, marginBottom: '8px', color: '#c2410c' }}><PenTool size={14} /> EMPLOYEE'S NOTE</span>
                    <span style={{ ...s.detailValue, fontSize: '0.95rem' }}>{selectedHouse.employeeNote || 'No employee notes provided.'}</span>
                  </div>
                </div>

              </div>
            </div>

            <footer style={s.footerBetween}>
              <button style={s.btnDangerLight} onClick={handleDelete} disabled={isSaving}>
                <Trash2 size={16} style={{ marginRight: '6px' }} /> {isSaving ? 'Deleting...' : 'Delete Property'}
              </button>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button style={s.btnOutline} onClick={() => setIsDetailModalOpen(false)}>Close</button>
                
                <button 
                  onClick={() => { setIsDetailModalOpen(false); onCheckHouse && onCheckHouse(selectedHouse); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', padding: '10px 20px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  <ClipboardCheck size={16} /> Quality Check
                </button>

                <button style={s.btnPrimary} onClick={() => handleOpenForm(selectedHouse)}><Edit2 size={16} /> Edit Details</button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}