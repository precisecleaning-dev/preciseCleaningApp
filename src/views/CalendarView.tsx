import { useState, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, X, Edit2, Trash2,
  Activity, FileText, CalendarDays, Clock, User, Wrench, Hash, Flag, Users, StickyNote, PenTool, Home, ClipboardCheck, MapPin, Menu
} from 'lucide-react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import type { Property, Status, Team, Priority, Service, Customer } from '../types/index';
import { getRelationName, getRelationColor } from '../utils/relations';
import CustomSelect from '../components/CustomSelect';
import './CalendarView.css';

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
  properties: Property[];
  setProperties: Dispatch<SetStateAction<Property[]>>;
}

export default function CalendarView({ onOpenMenu, onCheckHouse, properties, setProperties }: CalendarViewProps) {

  // --- FIREBASE STATES ---
  // `properties` viene de App.tsx (lista en tiempo real vía onSnapshot, compartida con
  // el resto de las vistas) — antes este componente hacía su propio fetch desconectado.
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

  // --- MODAL STATES ---
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState<Property | null>(null);
  const [dayDetailDate, setDayDetailDate] = useState<Date | null>(null); // Modal "todos los trabajos del día"
  
  const [formData, setFormData] = useState<Property>({
    id: '', statusId: '', invoiceStatus: 'Pending', receiveDate: '', scheduleDate: '', client: '', note: '', address: '', employeeNote: '', serviceId: '', rooms: '1', bathrooms: '1', priorityId: '', teamId: '', timeIn: '', timeOut: ''
  });

  // --- FETCH DATA ---
  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoading(true);
      try {
        const [ statusData, teamData, prioData, servData, custData ] = await Promise.all([
          settingsService.getAll(collectionMap.status),
          settingsService.getAll(collectionMap.team),
          settingsService.getAll(collectionMap.priority),
          settingsService.getAll(collectionMap.service),
          customersService.getAll()
        ]);

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
        await propertiesService.update(selectedHouse.id, dataToUpdate);
        setProperties(properties.map(p => p.id === selectedHouse.id ? { ...formData } : p));
      } else {
        const { id, ...dataToAdd } = formData;
        const completeData = {
          ...dataToAdd,
          description: `${formData.client} - ${formData.rooms} rooms`,
          city: 'TBD', size: 'TBD'
        };
        const newId = await propertiesService.create(completeData);
        setProperties([...properties, { ...formData, id: newId, description: completeData.description, city: completeData.city, size: completeData.size }]);
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
      setProperties(properties.filter(p => p.id !== selectedHouse.id));
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
  const MAX_MONTH_EVENTS = 5; // Máximo de eventos visibles por día en la vista de mes

  // Trabajos que pertenecen a una fecha, ordenados por hora de entrada
  const getJobsForDate = (date: Date) => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    const dateString = localDate.toISOString().split('T')[0];

    // Trabajos del dia (prop `properties` en tiempo real), ordenados por hora de entrada.
    return properties
      .filter(p => (p.scheduleDate || p.receiveDate) === dateString)
      .sort((a, b) => {
        const ta = parseTimeToMinutes(a.timeIn || '');
        const tb = parseTimeToMinutes(b.timeIn || '');
        if (ta === null && tb === null) return 0;
        if (ta === null) return 1; // sin hora al final
        if (tb === null) return -1;
        return ta - tb;
      });
  };

  const openJobDetail = (job: Property) => {
    setSelectedHouse(job);
    setDayDetailDate(null);
    setIsDetailModalOpen(true);
  };

  const renderEventBlocks = (date: Date) => {
    const dailyJobs = getJobsForDate(date);

    if (viewMode === 'month') {
      // ESTILO MES: Stack de eventos limitado a MAX_MONTH_EVENTS + botón "Show more"
      const visibleJobs = dailyJobs.slice(0, MAX_MONTH_EVENTS);
      const hiddenCount = dailyJobs.length - visibleJobs.length;

      return (
        <>
          {visibleJobs.map(job => {
            const statusColor = getRelationColor(statuses, job.statusId) || '#cbd5e1';
            return (
              <div
                key={job.id}
                className="calendar-event-month"
                style={{ '--event-bg': `${statusColor}15`, '--event-color': statusColor } as CSSProperties}
                onClick={(e) => { e.stopPropagation(); openJobDetail(job); }}
              >
                <span className="cv-event-time">{job.timeIn || '--:--'}</span> {getClientName(job.client)}
              </div>
            );
          })}
          {hiddenCount > 0 && (
            <button
              className="cv-show-more-btn"
              onClick={(e) => { e.stopPropagation(); setDayDetailDate(date); }}
            >
              Show more (+{hiddenCount})
            </button>
          )}
        </>
      );
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
            '--event-top': `${topOffset}px`,
            '--event-height': `${height}px`,
            '--event-bg': `${statusColor}20`,
            '--event-border': `${statusColor}50`,
            '--event-color': statusColor
          } as CSSProperties}
          onClick={(e) => { e.stopPropagation(); setSelectedHouse(job); setIsDetailModalOpen(true); }}
        >
          <div className="event-title">{getClientName(job.client)}</div>
          <div className="event-time">{job.timeIn} - {job.timeOut || '?'}</div>
        </div>
      );
    });
  };

  return (
    <div className="fade-in cv-page">
      {/* HEADER */}
      <header className="cv-header">
        <div className="view-header-title-group">
          <button onClick={onOpenMenu} className="hamburger-btn" aria-label="Open menu">
            <Menu size={24} />
          </button>
          <div>
            <h1 className="cv-title">Calendar</h1>
            <p className="cv-subtitle">Schedule & Planning</p>
          </div>
        </div>

        <div className="cv-header-actions">
          {/* VIEW TOGGLES */}
          <div className="view-toggles">
            <button className={`view-btn ${viewMode === 'day' ? 'active' : ''}`} onClick={() => setViewMode('day')}>Day</button>
            <button className={`view-btn ${viewMode === 'week' ? 'active' : ''}`} onClick={() => setViewMode('week')}>Week</button>
            <button className={`view-btn ${viewMode === 'month' ? 'active' : ''}`} onClick={() => setViewMode('month')}>Month</button>
          </div>

          {/* DATE NAVIGATION */}
          <div className="cv-date-nav">
            <button onClick={prevTime} className="cv-nav-btn"><ChevronLeft size={20}/></button>
            <span className="cv-date-label">{headerTitle}</span>
            <button onClick={nextTime} className="cv-nav-btn"><ChevronRight size={20}/></button>
          </div>
        </div>
      </header>

      {/* CALENDAR RENDER */}
      {isLoading ? (
        <div className="cv-loading">Loading calendar data...</div>
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
                <div className="cv-week-header-row">
                  {(viewMode === 'week' ? weekDaysDates : [currentDate]).map((date, i) => (
                    <div key={i} className="cv-week-header-cell">
                      <div className="cv-week-day-label">{weekDaysLabels[date.getDay()]}</div>
                      <div className="cv-week-day-number">{date.getDate()}</div>
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

      {/* --- DAY DETAIL MODAL (todos los trabajos del día) --- */}
      {dayDetailDate && (() => {
        const dayJobs = getJobsForDate(dayDetailDate);
        const dayTitleRaw = dayDetailDate.toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const dayTitle = dayTitleRaw.charAt(0).toUpperCase() + dayTitleRaw.slice(1);
        return (
          <div className="cv-modal-overlay" onClick={() => setDayDetailDate(null)}>
            <div className="cv-modal cv-day-modal" onClick={e => e.stopPropagation()}>
              <header className="cv-modal-header">
                <div>
                  <h3 className="cv-modal-title">{dayTitle}</h3>
                  <span className="cv-day-modal-count">{dayJobs.length} {dayJobs.length === 1 ? 'trabajo' : 'trabajos'}</span>
                </div>
                <button className="cv-modal-close" onClick={() => setDayDetailDate(null)}><X size={24} /></button>
              </header>

              <div className="cv-modal-body cv-day-modal-body">
                {dayJobs.map(job => {
                  const statusColor = getRelationColor(statuses, job.statusId) || '#cbd5e1';
                  return (
                    <div
                      key={job.id}
                      className="cv-day-job-row"
                      style={{ '--event-color': statusColor } as CSSProperties}
                      onClick={() => openJobDetail(job)}
                    >
                      <div className="cv-day-job-time">
                        <Clock size={14} />
                        <span>{job.timeIn || '--:--'}{job.timeOut ? ` - ${job.timeOut}` : ''}</span>
                      </div>
                      <div className="cv-day-job-info">
                        <span className="cv-day-job-client">{getClientName(job.client)}</span>
                        <span className="cv-day-job-address"><MapPin size={12} /> {job.address || '-'}</span>
                      </div>
                      <div className="cv-day-job-meta">
                        <span className="cv-day-job-status">
                          <span className="cv-dot-12" style={{ '--dot-color': statusColor } as CSSProperties}></span>
                          {getRelationName(statuses, job.statusId, 'Unassigned')}
                        </span>
                        {getRelationName(teams, job.teamId, '') && (
                          <span className="cv-day-job-team"><Users size={12} /> {getRelationName(teams, job.teamId)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <footer className="cv-modal-footer">
                <button className="cv-btn-outline" onClick={() => setDayDetailDate(null)}>Close</button>
              </footer>
            </div>
          </div>
        );
      })()}

      {/* --- FORM MODAL --- */}
      {isFormModalOpen && (
        <div className="cv-modal-overlay" onClick={handleCloseForm}>
          <div className="cv-modal" onClick={e => e.stopPropagation()}>
            <header className="cv-modal-header">
              <h3 className="cv-modal-title">{selectedHouse ? 'Edit Property Details' : 'Register New Property'}</h3>
              <button className="cv-modal-close" onClick={handleCloseForm}><X size={24} /></button>
            </header>

            <div className="cv-modal-body">
              <div className="grid-3-cols">

                <div>
                  <label className="cv-label">Client <span className="cv-required">*</span></label>
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
                  <label className="cv-label">Address <span className="cv-required">*</span></label>
                  <div className="cv-input-wrap">
                    <MapPin className="cv-input-icon" size={16} />
                    <input type="text" className="cv-input" placeholder="Enter full address..." value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="cv-label">Status <span className="cv-required">*</span></label>
                  <CustomSelect options={statuses} value={formData.statusId} onChange={(val: string) => setFormData({ ...formData, statusId: val })} placeholder="Select Status..." icon={Activity} />
                </div>

                <div>
                  <label className="cv-label">Invoice Status</label>
                  <CustomSelect options={invoiceOptions} value={formData.invoiceStatus} onChange={(val: string) => setFormData({ ...formData, invoiceStatus: val })} placeholder="Select Invoice Status..." icon={FileText} />
                </div>
                <div>
                  <label className="cv-label">Services</label>
                  <CustomSelect options={services} value={formData.serviceId} onChange={(val: string) => setFormData({ ...formData, serviceId: val })} placeholder="Select Service..." icon={Wrench} />
                </div>
                <div>
                  <label className="cv-label">Priority</label>
                  <CustomSelect options={priorities} value={formData.priorityId} onChange={(val: string) => setFormData({ ...formData, priorityId: val })} placeholder="Select Priority..." icon={Flag} />
                </div>

                <div>
                  <label className="cv-label">Receive Date</label>
                  <div className="cv-input-wrap">
                    <CalendarDays className="cv-input-icon" size={16} />
                    <input type="date" className="cv-input" value={formData.receiveDate} onChange={e => setFormData({ ...formData, receiveDate: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="cv-label">Schedule Date</label>
                  <div className="cv-input-wrap">
                    <CalendarDays className="cv-input-icon" size={16} />
                    <input type="date" className="cv-input" value={formData.scheduleDate} onChange={e => setFormData({ ...formData, scheduleDate: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="cv-label">Team</label>
                  <CustomSelect options={teams} value={formData.teamId} onChange={(val: string) => setFormData({ ...formData, teamId: val })} placeholder="Assign Team..." icon={Users} />
                </div>

                <div>
                  <label className="cv-label">Time In</label>
                  <div className="cv-input-wrap">
                    <Clock className="cv-input-icon" size={16} />
                    <input type="time" className="cv-input" value={formData.timeIn} onChange={e => setFormData({ ...formData, timeIn: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="cv-label">Time Out</label>
                  <div className="cv-input-wrap">
                    <Clock className="cv-input-icon" size={16} />
                    <input type="time" className="cv-input" value={formData.timeOut} onChange={e => setFormData({ ...formData, timeOut: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="cv-label">Rooms</label>
                  <CustomSelect options={roomOptions} value={formData.rooms} onChange={(val: string) => setFormData({ ...formData, rooms: val })} placeholder="Rooms..." icon={Hash} />
                </div>

                <div>
                  <label className="cv-label">Bathrooms</label>
                  <CustomSelect options={roomOptions} value={formData.bathrooms} onChange={(val: string) => setFormData({ ...formData, bathrooms: val })} placeholder="Bathrooms..." icon={Hash} />
                </div>

                <div className="col-span-full">
                  <label className="cv-label">Note</label>
                  <div className="cv-input-wrap align-top">
                    <StickyNote className="cv-input-icon textarea" size={16} />
                    <textarea className="cv-input textarea" placeholder="General instructions or notes..." value={formData.note} onChange={e => setFormData({ ...formData, note: e.target.value })}></textarea>
                  </div>
                </div>

                <div className="col-span-full">
                  <label className="cv-label">Employee's Note</label>
                  <div className="cv-input-wrap align-top">
                    <PenTool className="cv-input-icon textarea" size={16} />
                    <textarea className="cv-input textarea" placeholder="Employee performance notes..." value={formData.employeeNote} onChange={e => setFormData({ ...formData, employeeNote: e.target.value })}></textarea>
                  </div>
                </div>

              </div>
            </div>

            <footer className="cv-modal-footer">
              <button className="cv-btn-outline" onClick={handleCloseForm} disabled={isSaving}>Cancel</button>
              <button className="cv-btn-primary" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Property'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* --- DETAIL MODAL --- */}
      {isDetailModalOpen && selectedHouse && (
        <div className="cv-modal-overlay" onClick={() => setIsDetailModalOpen(false)}>
          <div className="cv-modal" onClick={e => e.stopPropagation()}>
            <header className="cv-modal-header">
              <h3 className="cv-modal-title">Property Overview</h3>
              <button className="cv-modal-close" onClick={() => setIsDetailModalOpen(false)}><X size={24} /></button>
            </header>

            <div className="cv-modal-body">
              <dl className="cv-detail-banner">
                <div className="cv-detail-item">
                  <dt className="cv-detail-label blue"><Home size={14} /> PROPERTY ADDRESS</dt>
                  <dd className="cv-address-value">{selectedHouse.address}</dd>
                </div>
              </dl>

              <dl className="grid-3-cols">

                <div className="cv-detail-item">
                  <dt className="cv-detail-label"><Activity size={14} /> STATUS</dt>
                  <dd className="cv-dot-row">
                    <span className="cv-dot-12" style={{ '--dot-color': getRelationColor(statuses, selectedHouse.statusId) || '#ccc' } as CSSProperties}></span>
                    <span className="cv-detail-value">{getRelationName(statuses, selectedHouse.statusId, 'UNASSIGNED')}</span>
                  </dd>
                </div>
                <div className="cv-detail-item">
                  <dt className="cv-detail-label"><FileText size={14} /> INVOICE STATUS</dt>
                  <dd className="cv-detail-value">{selectedHouse.invoiceStatus || '-'}</dd>
                </div>
                <div className="cv-detail-item">
                  <dt className="cv-detail-label"><User size={14} /> CLIENT</dt>
                  <dd className="cv-detail-value">{getClientName(selectedHouse.client)}</dd>
                </div>

                <div className="cv-detail-item">
                  <dt className="cv-detail-label"><CalendarDays size={14} /> RECEIVE DATE</dt>
                  <dd className="cv-detail-value">{selectedHouse.receiveDate || '-'}</dd>
                </div>
                <div className="cv-detail-item">
                  <dt className="cv-detail-label"><CalendarDays size={14} /> SCHEDULE DATE</dt>
                  <dd className="cv-detail-value">{selectedHouse.scheduleDate || '-'}</dd>
                </div>
                <div className="cv-detail-item">
                  <dt className="cv-detail-label"><Wrench size={14} /> SERVICE</dt>
                  <dd className="cv-detail-value">{getRelationName(services, selectedHouse.serviceId)}</dd>
                </div>

                <div className="cv-detail-item">
                  <dt className="cv-detail-label"><Clock size={14} /> TIME IN</dt>
                  <dd className="cv-detail-value">{selectedHouse.timeIn || '-'}</dd>
                </div>
                <div className="cv-detail-item">
                  <dt className="cv-detail-label"><Clock size={14} /> TIME OUT</dt>
                  <dd className="cv-detail-value">{selectedHouse.timeOut || '-'}</dd>
                </div>
                <div className="cv-detail-item">
                  <dt className="cv-detail-label"><Flag size={14} /> PRIORITY</dt>
                  <dd className="cv-dot-row">
                    {getRelationColor(priorities, selectedHouse.priorityId) && <span className="cv-dot-12" style={{ '--dot-color': getRelationColor(priorities, selectedHouse.priorityId) } as CSSProperties}></span>}
                    <span className="cv-detail-value">{getRelationName(priorities, selectedHouse.priorityId)}</span>
                  </dd>
                </div>

                <div className="cv-detail-item">
                  <dt className="cv-detail-label"><Hash size={14} /> ROOMS</dt>
                  <dd className="cv-detail-value">{selectedHouse.rooms || '-'}</dd>
                </div>
                <div className="cv-detail-item">
                  <dt className="cv-detail-label"><Hash size={14} /> BATHROOMS</dt>
                  <dd className="cv-detail-value">{selectedHouse.bathrooms || '-'}</dd>
                </div>
                <div className="cv-detail-item">
                  <dt className="cv-detail-label"><Users size={14} /> TEAM</dt>
                  <dd className="cv-dot-row">
                    {getRelationColor(teams, selectedHouse.teamId) && <span className="cv-dot-12" style={{ '--dot-color': getRelationColor(teams, selectedHouse.teamId) } as CSSProperties}></span>}
                    <span className="cv-detail-value">{getRelationName(teams, selectedHouse.teamId, 'Unassigned')}</span>
                  </dd>
                </div>

                <div className="col-span-full">
                  <div className="cv-note-box">
                    <dt className="cv-detail-label spaced"><StickyNote size={14} /> GENERAL NOTE</dt>
                    <dd className="cv-detail-value small">{selectedHouse.note || 'No notes provided.'}</dd>
                  </div>
                </div>

                <div className="col-span-full">
                  <div className="cv-note-box orange">
                    <dt className="cv-detail-label spaced orange"><PenTool size={14} /> EMPLOYEE'S NOTE</dt>
                    <dd className="cv-detail-value small">{selectedHouse.employeeNote || 'No employee notes provided.'}</dd>
                  </div>
                </div>

              </dl>
            </div>

            <footer className="cv-modal-footer between">
              <button className="cv-btn-danger-light" onClick={handleDelete} disabled={isSaving}>
                <Trash2 size={16} className="cv-icon-mr" /> {isSaving ? 'Deleting...' : 'Delete Property'}
              </button>
              <div className="cv-footer-actions">
                <button className="cv-btn-outline" onClick={() => setIsDetailModalOpen(false)}>Close</button>

                <button
                  onClick={() => { setIsDetailModalOpen(false); onCheckHouse && onCheckHouse(selectedHouse); }}
                  className="cv-btn-qc"
                >
                  <ClipboardCheck size={16} /> Quality Check
                </button>

                <button className="cv-btn-primary" onClick={() => handleOpenForm(selectedHouse)}><Edit2 size={16} /> Edit Details</button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}