import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X, Clock, Users, MapPin } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Property, Customer } from '../types/index';
import { getRelationName, getRelationColor } from '../utils/relations';
import HistoryWindowNotice from '../components/HistoryWindowNotice';
import { formatDate, formatDateRange } from '../utils/dateFormat';
import { useLiveCollection, useLiveData } from '../shared/data/liveCollections';
import MenuButton from '../shared/components/MenuButton';
import './CalendarView.css';

// El detalle y la edición de una casa los abre HousesView (modals-only) desde
// App.tsx, igual que en Quality Check y Owner/Manager: un solo detalle y un
// solo formulario en toda la app (decisión de Omar, 10/13/2026).

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
  properties: Property[];
  /** Abre el detalle de la casa (HousesView en modo modals-only). */
  onOpenHouseDetail: (house: Property) => void;
}

const NO_JOBS: Property[] = [];

export default function CalendarView({ onOpenMenu, properties, onOpenHouseDetail }: CalendarViewProps) {

  // --- FIREBASE STATES ---
  // `properties` viene de App.tsx (lista en tiempo real vía onSnapshot, compartida con
  // el resto de las vistas) — antes este componente hacía su propio fetch desconectado.
  // ⭐ Catálogos del store compartido (antes: 4 getAll de settings + customers
  //    completos en cada visita). El store ya aplica mapCustomerDoc (id real +
  //    legacyId).
  const statusesLive = useLiveCollection('statuses');
  const statuses = useMemo(
    () => [...statusesLive.data].sort((a, b) => Number(a.order) - Number(b.order)),
    [statusesLive.data],
  );
  const teams = useLiveData('teams');
  // Los clientes solo dan el nombre: el calendario se dibuja sin esperarlos.
  const customersLive = useLiveCollection('customers');
  const customersList = customersLive.data;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month'); // Selector de vistas, default Month para ver el arreglo
  const [dayDetailDate, setDayDetailDate] = useState<Date | null>(null); // Modal "todos los trabajos del día"

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
    // Fechas siempre MM/DD/AAAA (regla del negocio); el mes se nombra solo en la vista de mes.
    if (viewMode === 'day') return `${currentDate.toLocaleDateString('es-ES', { weekday: 'long' })} ${formatDate(currentDate)}`;
    if (viewMode === 'week') return formatDateRange(weekDaysDates[0], weekDaysDates[6]);
    return '';
  };
  const headerTitleRaw = getHeaderTitle();
  const headerTitle = headerTitleRaw.charAt(0).toUpperCase() + headerTitleRaw.slice(1);
  const weekDaysLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  // ⭐ ¿Pantalla chica? La cuadricula de 7 columnas en un telefono de 360px da
  //    celdas de ~45px: no cabe ni la fecha, y obligaba a scroll horizontal.
  //    Por debajo de 48rem (768px) la vista de mes pasa a AGENDA vertical, que
  //    es el patron que usan Google Calendar y Apple Calendar en telefono.
  const [isCompact, setIsCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 48rem)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 48rem)');
    const onChange = (e: MediaQueryListEvent) => setIsCompact(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // ⭐ INDICE DE CLIENTES por TODAS sus claves posibles.
  //
  //    Aqui se veian IDs crudos ("4ea3f7ae") en vez del nombre. La causa:
  //    `properties.client` guarda el id LEGACY de AppSheet, que en los
  //    documentos de `customers` quedo como un campo interno `id`. Pero
  //    un mapeo ingenuo `{ ...d.data(), id: d.id }` hace que el id real del
  //    documento PISE al legacy y este se pierda (hoy mapCustomerDoc lo
  //    conserva aparte como `legacyId`).
  //
  //    El indice registra el id de documento, el legacy y el nombre, asi
  //    resuelve sin importar cual de los tres tenga guardado la casa.
  const customerIndex = useMemo(() => {
    const map = new Map<string, Customer>();
    const put = (key: unknown, cust: Customer) => {
      const k = String(key ?? '').toLowerCase().trim();
      if (k && !map.has(k)) map.set(k, cust);
    };
    customersList.forEach(c => {
      put(c.id, c);
      put((c as Customer & { legacyId?: string }).legacyId, c);
      put(c.name, c);
    });
    return map;
  }, [customersList]);

  const findCustomer = (idOrName?: string | null): Customer | undefined => {
    if (!idOrName) return undefined;
    return customerIndex.get(String(idOrName).toLowerCase().trim());
  };

  // Nombre del cliente. Si el cliente fue borrado del catalogo, se muestra un
  // texto explicito en vez del id opaco: un hex de 8 caracteres no le dice
  // nada a quien usa la app.
  const getClientName = (idOrName?: string | null) => {
    if (!idOrName) return '-';
    if (!customersLive.loaded) return '…';
    const cust = findCustomer(idOrName);
    if (cust?.name) return cust.name;
    const raw = String(idOrName).trim();
    // Un valor que parece id (hex sin espacios) no sirve como etiqueta.
    return /^[0-9a-f]{6,}$/i.test(raw) ? 'Cliente sin registrar' : raw;
  };

  // --- RENDER HELPERS ---
  const MAX_MONTH_EVENTS = 5; // Máximo de eventos visibles por día en la vista de mes

  // ⭐ PERF: trabajos agrupados por fecha UNA vez por cambio de casas. Antes
  //    cada celda del calendario (hasta 42 en la vista de mes) recorría las
  //    ~3,600 casas en cada render. Mismo criterio y mismo orden que antes.
  const jobsByDate = useMemo(() => {
    const map = new Map<string, Property[]>();
    properties.forEach(p => {
      const key = p.scheduleDate || p.receiveDate;
      if (!key) return;
      const list = map.get(key);
      if (list) list.push(p);
      else map.set(key, [p]);
    });
    map.forEach(list => list.sort((a, b) => {
      const ta = parseTimeToMinutes(a.timeIn || '');
      const tb = parseTimeToMinutes(b.timeIn || '');
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1; // sin hora al final
      if (tb === null) return -1;
      return ta - tb;
    }));
    return map;
  }, [properties]);

  // Trabajos que pertenecen a una fecha, ordenados por hora de entrada
  const getJobsForDate = (date: Date): Property[] => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    const dateString = localDate.toISOString().split('T')[0];
    return jobsByDate.get(dateString) ?? NO_JOBS;
  };

  const openJobDetail = (job: Property) => {
    setDayDetailDate(null);
    onOpenHouseDetail(job);
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
                <span className="cv-event-time">{job.timeIn || '--:--'}</span>
                <span className="cv-event-text">
                  <span className="cv-event-client">{getClientName(job.client)}</span>
                  {job.address && (
                    <span className="cv-event-address">{job.address}</span>
                  )}
                </span>
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
          onClick={(e) => { e.stopPropagation(); openJobDetail(job); }}
        >
          <div className="event-title">{getClientName(job.client)}</div>
          {job.address && <div className="event-address">{job.address}</div>}
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
<MenuButton onClick={onOpenMenu} />
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
      <HistoryWindowNotice />
      <div className="calendar-wrapper">

        {/* === VISTA DE MES — CUADRICULA (tablet / escritorio) === */}
        {viewMode === 'month' && !isCompact && (
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

        {/* === VISTA DE MES — AGENDA (movil) ===
            Solo se listan los dias CON trabajos: en un mes tipico eso reduce
            31 bloques a 10-15, y cada trabajo se ve completo (hora, cliente y
            direccion) sin scroll horizontal ni textos recortados. */}
        {viewMode === 'month' && isCompact && (() => {
          const daysWithJobs = calendarDays
            .filter((d): d is Date => !!d)
            .map(date => ({ date, jobs: getJobsForDate(date) }))
            .filter(d => d.jobs.length > 0);

          if (daysWithJobs.length === 0) {
            return (
              <div className="cv-agenda-empty">
                No hay trabajos programados este mes.
              </div>
            );
          }

          const today = new Date();
          const isToday = (d: Date) =>
            d.getDate() === today.getDate() &&
            d.getMonth() === today.getMonth() &&
            d.getFullYear() === today.getFullYear();

          return (
            <div className="cv-agenda">
              {daysWithJobs.map(({ date, jobs }) => (
                <section key={date.toISOString()} className="cv-agenda-day">
                  <header className={`cv-agenda-daybar${isToday(date) ? ' today' : ''}`}>
                    <span className="cv-agenda-daynum">{date.getDate()}</span>
                    <span className="cv-agenda-dayname">
                      {date.toLocaleDateString('es-ES', { weekday: 'long' })}
                    </span>
                    <span className="cv-agenda-daycount">
                      {jobs.length} {jobs.length === 1 ? 'trabajo' : 'trabajos'}
                    </span>
                  </header>

                  <div className="cv-agenda-jobs">
                    {jobs.map(job => {
                      const statusColor = getRelationColor(statuses, job.statusId) || '#cbd5e1';
                      return (
                        <button
                          key={job.id}
                          type="button"
                          className="cv-agenda-job"
                          style={{ '--event-color': statusColor } as CSSProperties}
                          onClick={() => openJobDetail(job)}
                        >
                          <span className="cv-agenda-time">
                            <Clock size={13} /> {job.timeIn || '--:--'}
                          </span>
                          <span className="cv-agenda-info">
                            <span className="cv-agenda-client">{getClientName(job.client)}</span>
                            {job.address && (
                              <span className="cv-agenda-address">
                                <MapPin size={12} /> {job.address}
                              </span>
                            )}
                          </span>
                          <ChevronRight size={16} className="cv-agenda-chevron" />
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          );
        })()}

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

      {/* --- DAY DETAIL MODAL (todos los trabajos del día) --- */}
      {dayDetailDate && (() => {
        const dayJobs = getJobsForDate(dayDetailDate);
        const dayTitleRaw = `${dayDetailDate.toLocaleDateString('es-ES', { weekday: 'long' })} ${formatDate(dayDetailDate)}`;
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

    </div>
  );
}
