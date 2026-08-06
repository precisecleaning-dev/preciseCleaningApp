import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Menu, Search, MapPin, Users, CalendarDays, Clock, User, Check, Repeat,
  Printer, Loader2, ChevronDown, X, Activity, CheckCircle, ClipboardCheck, StickyNote,
} from 'lucide-react';
import { db } from '../config/firebase';
import { collection, onSnapshot, query, limit, doc, getDoc } from 'firebase/firestore';
import type { Customer, Property, Status, Team, Role, SystemUser } from '../types/index';
import type { QCRecord } from './QualityCheckView';
import { propertiesService } from '../services/propertiesService';
import { statusHistoryService } from '../services/statusHistoryService';
import { exportQCReportPDF, type QCPdfPlace, type QCPdfTask, type QCPdfBranding } from '../utils/qcReportPdf';
import { formatDate } from '../utils/dateFormat';
import './QCReportsTableView.css';

// ============================================================================
// ⭐ QUALITY CHECK REPORTS — vista propia del menú lateral.
//
//   Lista los reportes de QC ya FINALIZADOS con el mismo formato de tabla que
//   Invoices (filtros arriba, tabla en escritorio, tarjetas en móvil), pero SIN
//   NINGUNA COLUMNA DE DINERO: esta vista es para la manager de calidad, no para
//   facturación, y los costos no le corresponden.
//
//   Diferencia clave con la pestaña "Reportes" del hub de Quality Check: aquella
//   es un listado de tarjetas centrado en métricas de la inspección (demora en
//   abrir, duración). Esta es operativa: qué casa, en qué estado está AHORA, y
//   poder moverla entre Quality Check y Recall sin salir de aquí.
//
//   El cambio de estado está DELIBERADAMENTE limitado a "Quality Check" y
//   "Recall": desde un reporte de calidad solo tiene sentido re-inspeccionar o
//   mandar a corregir. Mover una casa a Invoice o Paid desde aquí seria saltarse
//   el flujo de facturación.
// ============================================================================

// ⭐ Los estados a los que esta vista permite mover una casa. Se resuelven por
//    NOMBRE contra settings_statuses (los ids son generados, los nombres son los
//    que el usuario configura), igual que el resto de la app.
const ALLOWED_STATUS_NAMES = ['quality check', 'recall'];

const isAllowedStatus = (st: Status): boolean => {
  const n = String(st.name || '').toLowerCase().trim();
  return ALLOWED_STATUS_NAMES.includes(n) || n === 'qc';
};

type QCReportRow = QCRecord & {
  id: string;
  createdAt?: string | null;
  correctionsDoneAt?: string | null;
  correctionsDoneBy?: string | null;
};

const toMs = (iso?: string | null): number => {
  if (!iso) return NaN;
  const t = new Date(iso).getTime();
  return isNaN(t) ? NaN : t;
};

const fmtTime = (iso?: string | null): string => {
  const t = toMs(iso);
  if (isNaN(t)) return '—';
  return new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

const fmtDuration = (mins?: number | null): string => {
  if (typeof mins !== 'number' || !isFinite(mins) || mins < 0) return '—';
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
};

// ⭐ Modal de cambio de estado. Recibe YA FILTRADA la lista de estados permitidos,
//    así la restricción vive en un solo sitio (quien lo invoca) y el modal no
//    necesita conocer las reglas de negocio.
type StatusModalConfig = {
  currentId: string;
  onSelect: (id: string) => void;
  title?: string;
  subtitle?: string;
};

const StatusChangeModal = ({
  config, statuses, onClose,
}: { config: StatusModalConfig; statuses: Status[]; onClose: () => void }) => {
  const cur = String(config.currentId || '').toLowerCase().trim();

  const resolveCurrentId = () => {
    const match = statuses.find(
      st => String(st.id).toLowerCase().trim() === cur || String(st.name).toLowerCase().trim() === cur,
    );
    return match ? match.id : '';
  };
  const [selectedId, setSelectedId] = useState<string>(resolveCurrentId());
  useEffect(() => {
    setSelectedId(resolveCurrentId());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const selectedIsCurrent = (() => {
    const selStatus = statuses.find(st => st.id === selectedId);
    const selName = String(selStatus?.name || '').toLowerCase().trim();
    return String(selectedId).toLowerCase().trim() === cur || (selName !== '' && selName === cur);
  })();

  const handleAccept = () => {
    if (selectedId && !selectedIsCurrent) config.onSelect(selectedId);
    onClose();
  };

  return (
    <div className="modal-overlay-centered status-modal-overlay" onClick={onClose}>
      <div className="status-modal" onClick={e => e.stopPropagation()}>
        <header className="status-modal-head">
          <div className="hv-statuschange-head-info">
            <div className="hv-statuschange-icon">
              <Activity size={20} color="#2563eb" />
            </div>
            <div className="hv-min-w-0">
              <h3 className="hv-statuschange-title">Cambiar estado</h3>
              {config.title && (
                <p className="hv-statuschange-subtitle">
                  {config.title}{config.subtitle ? ` · ${config.subtitle}` : ''}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="hv-statuschange-close">
            <X size={22} />
          </button>
        </header>

        {/* ⭐ Aviso explícito de por qué hay solo dos opciones: sin esto parece que
            faltan estados por un error. */}
        <div className="qcrt-status-note">
          Desde los reportes de calidad una casa solo puede moverse a
          {' '}<strong>Quality Check</strong> (re-inspeccionar) o <strong>Recall</strong> (corregir).
        </div>

        <div className="status-modal-grid">
          {statuses.length === 0 ? (
            <div className="hv-statuschange-empty">
              No se encontraron los estados "Quality Check" ni "Recall" en la configuración.
            </div>
          ) : statuses.map(st => {
            const isCurrent = String(st.id).toLowerCase().trim() === cur
              || String(st.name).toLowerCase().trim() === cur;
            const isSelected = st.id === selectedId;
            return (
              <button
                key={st.id}
                className={`status-option${isSelected ? ' selected' : ''}`}
                onClick={() => setSelectedId(st.id)}
              >
                <span
                  className="hv-statuschange-dot"
                  style={{ '--dot-color': st.color, '--dot-ring': `${st.color}1f` } as CSSProperties}
                />
                <span className="hv-statuschange-name">{st.name}</span>
                {isCurrent && !isSelected && (
                  <span className="hv-statuschange-current-badge">Actual</span>
                )}
                {isSelected && <CheckCircle size={18} color="#2563eb" className="hv-shrink-0" />}
              </button>
            );
          })}
        </div>

        <footer className="status-modal-foot">
          <button onClick={onClose} className="status-btn-cancel">Cancelar</button>
          <button onClick={handleAccept} disabled={selectedIsCurrent} className="status-btn-accept">
            <CheckCircle size={16} /> Aceptar
          </button>
        </footer>
      </div>
    </div>
  );
};

interface Props {
  onOpenMenu: () => void;
  properties: Property[];
  setProperties?: React.Dispatch<React.SetStateAction<Property[]>>;
  currentUser?: SystemUser | null;
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
}

export default function QCReportsTableView({
  onOpenMenu, properties, setProperties, currentUser, activeRole, isSuperAdmin = false,
}: Props) {
  const [reports, setReports] = useState<QCReportRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [places, setPlaces] = useState<QCPdfPlace[]>([]);
  const [tasks, setTasks] = useState<QCPdfTask[]>([]);
  const [branding, setBranding] = useState<QCPdfBranding>({ name: 'Precise Cleaning' });
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [resultFilter, setResultFilter] = useState<'All' | 'passed' | 'failed'>('All');

  const [exportingId, setExportingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [statusModal, setStatusModal] = useState<StatusModalConfig | null>(null);

  // ⭐ Permiso de edición: mismo criterio que Invoices (módulo "Quality Check").
  const canEdit = isSuperAdmin
    || !!activeRole?.permissions?.find(p => p.module === 'Quality Check')?.canEdit;

  useEffect(() => {
    const unsubQC = onSnapshot(
      query(collection(db, 'quality_checks'), limit(2000)),
      snap => {
        setReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as QCReportRow)));
        setIsLoading(false);
      },
      err => { console.error('Error cargando reportes QC:', err); setIsLoading(false); },
    );
    const unsubCust = onSnapshot(collection(db, 'customers'),
      snap => setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer))),
      err => console.error('Error cargando clientes:', err));
    const unsubStatuses = onSnapshot(collection(db, 'settings_statuses'),
      snap => setStatuses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Status))),
      err => console.error('Error cargando estados:', err));
    const unsubTeams = onSnapshot(collection(db, 'settings_teams'),
      snap => setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() } as Team))),
      err => console.error('Error cargando equipos:', err));
    const unsubPlaces = onSnapshot(collection(db, 'settings_places'),
      snap => setPlaces(snap.docs.map(d => ({ id: d.id, ...d.data() } as QCPdfPlace))),
      err => console.error('Error cargando áreas:', err));
    const unsubTasks = onSnapshot(collection(db, 'settings_tasks'),
      snap => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as QCPdfTask))),
      err => console.error('Error cargando tareas:', err));
    getDoc(doc(db, 'settings_company', 'main'))
      .then(s => {
        if (!s.exists()) return;
        const d = s.data();
        setBranding({ name: d.name || 'Precise Cleaning', address: d.address || '', logo: d.logo || '', email: d.email || '' });
      })
      .catch(() => { /* branding por defecto */ });
    return () => { unsubQC(); unsubCust(); unsubStatuses(); unsubTeams(); unsubPlaces(); unsubTasks(); };
  }, []);

  const getClientName = (idOrName?: string): string => {
    if (!idOrName) return 'Unknown Client';
    const c = customers.find(x => x.id === idOrName) as
      (Customer & { name?: string; firstName?: string; lastName?: string }) | undefined;
    if (c) return c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || idOrName;
    return idOrName;
  };

  const getTeamName = (teamId?: string | null): string => {
    if (!teamId) return 'Unassigned';
    return teams.find(t => t.id === teamId)?.name || 'Unassigned';
  };

  const houseFor = (r: QCReportRow): Property | undefined =>
    properties.find(p => p.id === r.houseId);

  // ⭐ Estados a los que ESTA vista deja mover una casa.
  const allowedStatuses = useMemo(() => statuses.filter(isAllowedStatus), [statuses]);

  const resolveStatusName = (statusId?: string | null): string => {
    const raw = String(statusId || '').trim();
    if (!raw) return '';
    const st = statuses.find(s => String(s.id) === raw || String(s.name) === raw);
    return st?.name || raw;
  };

  const handleStatusChange = async (house: Property, newStatusId: string) => {
    // ⭐ Doble candado: el modal ya solo ofrece los permitidos, pero si en el futuro
    //    alguien invoca esto desde otro lado, la regla se sigue cumpliendo aquí.
    const target = statuses.find(s => s.id === newStatusId);
    if (!target || !isAllowedStatus(target)) {
      alert('Desde esta vista una casa solo puede moverse a "Quality Check" o "Recall".');
      return;
    }
    setIsSaving(true);
    try {
      const prevStatusId = house.statusId;
      await propertiesService.update(house.id, { statusId: newStatusId });
      setProperties?.(prev => prev.map(p => (p.id === house.id ? { ...p, statusId: newStatusId } : p)));
      try {
        await statusHistoryService.log({
          propertyId: house.id,
          fromStatusId: prevStatusId || null,
          fromStatusName: resolveStatusName(prevStatusId) || null,
          toStatusId: newStatusId,
          toStatusName: target.name,
          changedBy: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown',
        });
      } catch (e) { console.error('No se pudo registrar el historial de status:', e); }
    } catch (e) {
      console.error('Error cambiando el estado:', e);
      alert('No se pudo cambiar el estado de la casa.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportPdf = async (r: QCReportRow) => {
    setExportingId(r.id);
    try {
      await exportQCReportPDF({
        house: { address: r.address || '' },
        clientName: getClientName(r.client),
        teamName: r.team || getTeamName(houseFor(r)?.teamId) || '—',
        qcData: r.qcData || {},
        inspectorName: r.inspector || 'Unknown',
        recordDate: r.date,
        places,
        tasks,
        branding,
      });
    } catch (e) {
      console.error('Error generando el PDF:', e);
      alert('No se pudo generar el PDF del reporte.');
    } finally {
      setExportingId(null);
    }
  };

  // ⭐ Notas capturadas durante la inspección, resumidas para la fila.
  const reportNotes = (r: QCReportRow): string => {
    const data = r.qcData || {};
    const parts: string[] = [];
    Object.values(data).forEach(entry => {
      const e = entry as { notes?: string; damage?: string };
      if (e?.notes) parts.push(String(e.notes).replace(/\n/g, ' · '));
      if (e?.damage) parts.push(`⚠ ${e.damage}`);
    });
    return parts.join(' · ').trim();
  };

  // Solo FINALIZADOS, del más reciente al más antiguo.
  const finishedReports = useMemo(() => {
    return reports
      .filter(r => r.status === 'Finished')
      .sort((a, b) => {
        const ta = toMs(a.checkOutAt) || toMs(`${a.date}T00:00:00`);
        const tb = toMs(b.checkOutAt) || toMs(`${b.date}T00:00:00`);
        return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
      });
  }, [reports]);

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return finishedReports.filter(r => {
      if (resultFilter === 'passed' && r.result === 'failed') return false;
      if (resultFilter === 'failed' && r.result !== 'failed') return false;
      if (startDate && r.date < startDate) return false;
      if (endDate && r.date > endDate) return false;
      if (!q) return true;
      return [getClientName(r.client), r.address, r.inspector, r.team, r.date]
        .some(v => String(v || '').toLowerCase().includes(q));
    });
    // getClientName depende solo de customers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedReports, search, startDate, endDate, resultFilter, customers]);

  const counts = useMemo(() => ({
    All: finishedReports.length,
    passed: finishedReports.filter(r => r.result !== 'failed').length,
    failed: finishedReports.filter(r => r.result === 'failed').length,
  }), [finishedReports]);

  const resultBadge = (r: QCReportRow) => (r.result === 'failed'
    ? { bg: '#f3e8ff', fg: '#7c3aed', label: 'Did Not Pass', Icon: Repeat }
    : { bg: '#dcfce7', fg: '#166534', label: 'Passed', Icon: Check });

  // ⭐ Píldora de estado ACTUAL de la casa. Si el reporte apunta a una casa que ya
  //    no existe, se muestra estática: no hay nada que actualizar.
  const renderStatusPill = (r: QCReportRow) => {
    const house = houseFor(r);
    if (!house) {
      return <span className="qcrt-status-pill missing">Casa no encontrada</span>;
    }
    const raw = String(house.statusId || '').toLowerCase().trim();
    const st = statuses.find(s => String(s.id).toLowerCase().trim() === raw
      || String(s.name).toLowerCase().trim() === raw);
    const disabled = isSaving || !canEdit;
    return (
      <button
        type="button"
        className={`qcrt-status-pill${disabled ? ' disabled' : ''}`}
        disabled={disabled}
        onClick={() => setStatusModal({
          currentId: house.statusId || '',
          onSelect: (newId: string) => handleStatusChange(house, newId),
          title: getClientName(r.client),
          subtitle: r.address,
        })}
      >
        <span className="qcrt-pill-dot" style={{ '--dot-color': st?.color || '#64748b' } as CSSProperties} />
        <span className="qcrt-pill-text">{st?.name || 'Unassigned'}</span>
        {!disabled && <ChevronDown size={14} className="qcrt-pill-chevron" />}
      </button>
    );
  };

  return (
    <div className="fade-in qcrt-page">
      <header className="main-header qcrt-header">
        <div>
          <h1 className="qcrt-header-title">Quality Check Reports</h1>
          <p className="qcrt-header-subtitle">Inspecciones finalizadas · reporte PDF y estado de la casa</p>
        </div>
      </header>

      <button className="hamburger-btn qcrt-hamburger-btn" onClick={onOpenMenu} aria-label="Open menu">
        <Menu size={24} />
      </button>

      {/* ===== FILTROS ===== */}
      <div className="qcrt-filters-card">
        <div className="qcrt-filter-pills">
          <button
            className={`qcrt-filter-pill${resultFilter === 'All' ? ' active' : ''}`}
            onClick={() => setResultFilter('All')}
          >
            All <span className="qcrt-filter-count">{counts.All}</span>
          </button>
          <button
            className={`qcrt-filter-pill passed${resultFilter === 'passed' ? ' active' : ''}`}
            onClick={() => setResultFilter('passed')}
          >
            <span className="qcrt-filter-dot" /> Passed <span className="qcrt-filter-count">{counts.passed}</span>
          </button>
          <button
            className={`qcrt-filter-pill failed${resultFilter === 'failed' ? ' active' : ''}`}
            onClick={() => setResultFilter('failed')}
          >
            <span className="qcrt-filter-dot" /> Did Not Pass <span className="qcrt-filter-count">{counts.failed}</span>
          </button>
        </div>

        <div className="qcrt-secondary-filters">
          <div>
            <label className="qcrt-label">Start Date</label>
            <div className="qcrt-input-wrap">
              <CalendarDays className="qcrt-input-icon" size={16} />
              <input type="date" className="qcrt-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="qcrt-label">End Date</label>
            <div className="qcrt-input-wrap">
              <CalendarDays className="qcrt-input-icon" size={16} />
              <input type="date" className="qcrt-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="qcrt-search-cell">
            <label className="qcrt-label">Search (client, address or inspector)</label>
            <div className="qcrt-input-wrap">
              <Search className="qcrt-input-icon" size={16} />
              <input
                type="text"
                className="qcrt-input"
                placeholder="Buscar por cliente, dirección o inspector..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ===== TABLA (escritorio) ===== */}
      <div className="qcrt-table-wrap">
        <table className="qcrt-table">
          <thead>
            <tr>
              <th className="qcrt-th">Result</th>
              <th className="qcrt-th">House Status</th>
              <th className="qcrt-th">Client / Address</th>
              <th className="qcrt-th">Inspection Date</th>
              <th className="qcrt-th">Team</th>
              <th className="qcrt-th">Inspector</th>
              <th className="qcrt-th">Duration</th>
              <th className="qcrt-th center">Report</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="qcrt-empty-row">Cargando reportes de calidad...</td></tr>
            ) : finishedReports.length === 0 ? (
              <tr><td colSpan={8} className="qcrt-empty-row">
                Todavía no hay inspecciones finalizadas. Al terminar una inspección en Quality Check aparecerá aquí.
              </td></tr>
            ) : filteredReports.length === 0 ? (
              <tr><td colSpan={8} className="qcrt-empty-row">
                Ningún reporte coincide con los filtros. Prueba con "All" o limpia la búsqueda.
              </td></tr>
            ) : filteredReports.map(r => {
              const badge = resultBadge(r);
              const notes = reportNotes(r);
              return (
                <tr key={r.id} className="qcrt-row">
                  <td className="qcrt-td">
                    <span
                      className="qcrt-badge"
                      style={{ '--badge-bg': badge.bg, '--badge-fg': badge.fg } as CSSProperties}
                    >
                      <badge.Icon size={12} /> {badge.label}
                    </span>
                  </td>
                  <td className="qcrt-td">{renderStatusPill(r)}</td>
                  <td className="qcrt-td">
                    <div className="qcrt-client-name">{getClientName(r.client)}</div>
                    <div className="qcrt-client-address"><MapPin size={12} /> {r.address || '—'}</div>
                    {notes !== '' && (
                      <div className="qcrt-note-line" title={notes}>
                        <StickyNote size={11} className="qcrt-note-icon" />
                        <span className="qcrt-note-text">{notes}</span>
                      </div>
                    )}
                  </td>
                  <td className="qcrt-td strong">
                    {formatDate(r.date)}
                    <div className="qcrt-td-sub">{fmtTime(r.checkInAt)} – {fmtTime(r.checkOutAt)}</div>
                  </td>
                  <td className="qcrt-td muted">
                    <span className="qcrt-inline-cell"><Users size={14} /> {r.team || getTeamName(houseFor(r)?.teamId)}</span>
                  </td>
                  <td className="qcrt-td muted">
                    <span className="qcrt-inline-cell"><User size={14} /> {r.inspector || 'Unknown'}</span>
                  </td>
                  <td className="qcrt-td muted">
                    <span className="qcrt-inline-cell"><Clock size={14} /> {fmtDuration(r.durationMinutes)}</span>
                  </td>
                  <td className="qcrt-td center">
                    <button
                      type="button"
                      className="qcrt-pdf-btn"
                      onClick={() => handleExportPdf(r)}
                      disabled={exportingId === r.id}
                      title="Ver el reporte en PDF"
                    >
                      {exportingId === r.id ? <Loader2 size={15} className="qcrt-spin" /> : <Printer size={15} />} PDF
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ===== TARJETAS (móvil) ===== */}
      <div className="qcrt-cards-wrap">
        {isLoading ? (
          <div className="qcrt-card-empty">Cargando reportes de calidad...</div>
        ) : filteredReports.length === 0 ? (
          <div className="qcrt-card-empty">No hay reportes para mostrar con estos filtros.</div>
        ) : filteredReports.map(r => {
          const badge = resultBadge(r);
          const notes = reportNotes(r);
          return (
            <div key={r.id} className="qcrt-card">
              <div className="qcrt-card-top">
                <div className="qcrt-min-w-0">
                  <div className="qcrt-client-name">{getClientName(r.client)}</div>
                  <div className="qcrt-client-address"><MapPin size={12} /> {r.address || '—'}</div>
                </div>
                <span
                  className="qcrt-badge"
                  style={{ '--badge-bg': badge.bg, '--badge-fg': badge.fg } as CSSProperties}
                >
                  <badge.Icon size={12} /> {badge.label}
                </span>
              </div>

              <div className="qcrt-card-status-row">
                <span className="qcrt-card-status-label"><ClipboardCheck size={13} /> Estado de la casa</span>
                {renderStatusPill(r)}
              </div>

              <div className="qcrt-card-meta">
                <div className="qcrt-card-meta-pair">
                  <span className="qcrt-card-meta-label"><CalendarDays size={13} /> Fecha</span>
                  <span className="qcrt-card-meta-value">{formatDate(r.date)}</span>
                </div>
                <div className="qcrt-card-meta-pair">
                  <span className="qcrt-card-meta-label"><Clock size={13} /> Duración</span>
                  <span className="qcrt-card-meta-value">{fmtDuration(r.durationMinutes)}</span>
                </div>
                <div className="qcrt-card-meta-pair">
                  <span className="qcrt-card-meta-label"><Users size={13} /> Equipo</span>
                  <span className="qcrt-card-meta-value">{r.team || getTeamName(houseFor(r)?.teamId)}</span>
                </div>
                <div className="qcrt-card-meta-pair">
                  <span className="qcrt-card-meta-label"><User size={13} /> Inspector</span>
                  <span className="qcrt-card-meta-value">{r.inspector || 'Unknown'}</span>
                </div>
              </div>

              {notes !== '' && (
                <div className="qcrt-card-notes"><StickyNote size={12} /> {notes}</div>
              )}

              <button
                type="button"
                className="qcrt-pdf-btn full"
                onClick={() => handleExportPdf(r)}
                disabled={exportingId === r.id}
              >
                {exportingId === r.id ? <Loader2 size={15} className="qcrt-spin" /> : <Printer size={15} />} Ver reporte PDF
              </button>
            </div>
          );
        })}
      </div>

      {statusModal && (
        <StatusChangeModal
          config={statusModal}
          statuses={allowedStatuses}
          onClose={() => setStatusModal(null)}
        />
      )}
    </div>
  );
}