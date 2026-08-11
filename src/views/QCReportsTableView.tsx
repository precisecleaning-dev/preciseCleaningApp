import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Menu, Search, MapPin, Users, CalendarDays, Clock, User, Check, Repeat,
  Printer, Loader2, ChevronDown, ClipboardCheck, StickyNote, FileText, Send, Mail,
} from 'lucide-react';
import { db } from '../config/firebase';
import { collection, onSnapshot, query, limit, doc, getDoc } from 'firebase/firestore';
import type { Customer, Property, Status, Team, Role, SystemUser } from '../types/index';
import type { QCRecord } from './QualityCheckView';
import { propertiesService } from '../services/propertiesService';
import { statusHistoryService } from '../services/statusHistoryService';
import { exportQCReportPDF, type QCPdfPlace, type QCPdfTask, type QCPdfBranding } from '../utils/qcReportPdf';
import { formatDate } from '../utils/dateFormat';
import { computeQCScore, passRateColors } from '../utils/qcScore';
import { prepareQCShare, buildQCMessage, type PreparedQCShare } from '../utils/shareQCReport';
import ShareReportSheet from '../components/ShareReportSheet';
import { qcReportsAllowedStatuses, isQualityCheckName, isRecallName, isInvoiceName } from '../utils/statusFilters';
import StatusChangeModal, { type StatusModalConfig } from '../components/StatusChangeModal';
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

// ⭐ Pestañas de la vista: agrupan los reportes por el ESTADO ACTUAL de la casa,
//    no por el resultado de la inspeccion. Asi la manager ve de un vistazo que
//    casas siguen en calidad, cuales ya se facturan y cuales hay que corregir.
type ReportTab = 'quality_check' | 'invoice' | 'recall';

const TAB_LABEL: Record<ReportTab, string> = {
  quality_check: 'Quality Checks',
  invoice: 'Invoice',
  recall: 'Recall',
};

type QCReportRow = QCRecord & {
  id: string;
  createdAt?: string | null;
  correctionsDoneAt?: string | null;
  correctionsDoneBy?: string | null;
  // ⭐ Resultado (%) guardado al cerrar la inspeccion. Los registros anteriores a
  //    este cambio no lo tienen: se recalcula al vuelo desde qcData.
  passRate?: number | null;
  passRateAnswered?: number | null;
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
  const [activeTab, setActiveTab] = useState<ReportTab>('quality_check');

  const [exportingId, setExportingId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
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

  // ⭐ Estados a los que ESTA vista deja mover una casa (ver statusFilters.ts):
  //    Quality Check · Recall · Invoice. Sin "In Progress": un reporte terminado
  //    no devuelve la casa a trabajo en curso.
  const allowedStatuses = useMemo(() => qcReportsAllowedStatuses(statuses), [statuses]);

  const resolveStatusName = (statusId?: string | null): string => {
    const raw = String(statusId || '').trim();
    if (!raw) return '';
    const st = statuses.find(s => String(s.id) === raw || String(s.name) === raw);
    return st?.name || raw;
  };

  const handleStatusChange = async (house: Property, newStatusId: string) => {
    // ⭐ Doble candado: el modal ya solo ofrece los permitidos, pero si en el futuro
    //    alguien invoca esto desde otro lado, la regla se sigue cumpliendo aquí.
    const target = allowedStatuses.find(s => s.id === newStatusId);
    if (!target) {
      alert('Desde esta vista una casa solo puede moverse a "Quality Check", "Recall" o "Invoice".');
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

  // ⭐ ENVIAR POR WHATSAPP. Se genera el MISMO HTML que el PDF (returnHtml) y se
  //    comparte: en movil sale la hoja del sistema con el archivo adjunto; en
  //    escritorio se descarga y se abre WhatsApp Web con el resumen.
  // ⭐ ENVIAR POR EMAIL. Se usa `mailto:` de forma SINCRONA dentro del onClick:
  //    cualquier `await` previo consumiria la activacion por gesto y en iOS el
  //    correo no llegaria a abrirse (mismo motivo que en shareQCReport.ts).
  //    El PDF se prepara DESPUES, para que quede descargado y se pueda adjuntar.
  const handleSendEmail = (r: QCReportRow) => {
    const clientName = getClientName(r.client);
    const score = reportScore(r);
    const subject = `Quality Check Report - ${clientName} (${formatDate(r.date)})`;
    const body = buildQCMessage({
      clientName,
      address: r.address || '',
      date: r.date,
      inspectorName: r.inspector || 'Unknown',
      teamName: r.team || getTeamName(houseFor(r)?.teamId),
      passRate: score.hasData ? score.passRate : null,
      failed: r.result === 'failed',
      // El asterisco es formato de WhatsApp; en un correo se veria literal.
    }).replace(/\*/g, '');

    const to = branding.email || '';
    window.location.href = `mailto:${encodeURIComponent(to)}`
      + `?subject=${encodeURIComponent(subject)}`
      + `&body=${encodeURIComponent(body + '\n\nAdjunto el reporte completo en PDF.')}`;

    // Se genera el PDF en segundo plano para tenerlo listo al adjuntar.
    setTimeout(() => { handleExportPdf(r).catch(() => { /* ya se avisa dentro */ }); }, 800);
  };

  const [shareReady, setShareReady] = useState<PreparedQCShare | null>(null);
  const [shareClient, setShareClient] = useState('');

  const handleShareWhatsApp = async (r: QCReportRow) => {
    setSharingId(r.id);
    try {
      const html = await exportQCReportPDF({
        house: { address: r.address || '' },
        clientName: getClientName(r.client),
        teamName: r.team || getTeamName(houseFor(r)?.teamId) || '—',
        qcData: r.qcData || {},
        inspectorName: r.inspector || 'Unknown',
        recordDate: r.date,
        places,
        tasks,
        branding,
        returnHtml: true,
      });
      if (!html || typeof html !== 'string') {
        alert('Este reporte no tiene datos para enviar.');
        return;
      }
      const score = reportScore(r);
      const clientName = getClientName(r.client);
      // ⭐ Solo se PREPARA el PDF. El envio lo dispara el segundo toque desde
      //    ShareReportSheet, porque iOS exige activacion por gesto fresca para
      //    navigator.share (ver src/utils/shareQCReport.ts).
      const prepared = await prepareQCShare(html, {
        clientName,
        address: r.address || '',
        date: r.date,
        inspectorName: r.inspector || 'Unknown',
        teamName: r.team || getTeamName(houseFor(r)?.teamId),
        passRate: score.hasData ? score.passRate : null,
        failed: r.result === 'failed',
      });
      setShareClient(clientName);
      setShareReady(prepared);
    } catch (e) {
      console.error('Error preparando el reporte:', e);
      alert('No se pudo generar el PDF del reporte.');
    } finally {
      setSharingId(null);
    }
  };

  // ⭐ Resultado (%) del reporte. Se prefiere el valor GUARDADO al cerrar la
  //    inspeccion; los registros viejos no lo tienen, asi que se recalcula desde
  //    qcData con el mismo util que usa el PDF (mismo numero, sin generarlo).
  const reportScore = (r: QCReportRow) => {
    if (typeof r.passRate === 'number' && (r.passRateAnswered ?? 1) > 0) {
      return { passRate: r.passRate, hasData: true };
    }
    const s = computeQCScore(r.qcData || {}, tasks);
    return { passRate: s.passRate, hasData: s.hasData };
  };

  // ⭐ ¿A que pestana pertenece un reporte? Se decide por el ESTADO ACTUAL de la
  //    casa. Si la casa ya no existe o su estado es otro, cae en "Quality Checks",
  //    que es donde la manager espera encontrar todo lo inspeccionado.
  const tabForReport = (r: QCReportRow): ReportTab => {
    const house = houseFor(r);
    const raw = String(house?.statusId || '').trim();
    const st = statuses.find(x => String(x.id) === raw || String(x.name) === raw);
    const name = st?.name || raw;
    if (isRecallName(name)) return 'recall';
    if (isInvoiceName(name)) return 'invoice';
    if (isQualityCheckName(name)) return 'quality_check';
    return 'quality_check';
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
  // ⭐ ORDEN: lo mas RECIENTE arriba. Se usa la hora de cierre de la inspeccion;
  //    si falta (registros viejos) se cae a createdAt y por ultimo a la fecha.
  //    Antes `toMs(...) || toMs(...)` fallaba con NaN: NaN es falsy y arrastraba
  //    al siguiente valor, pero un 0 valido tambien, y NaN acababa como 0 en la
  //    comparacion, mandando esos reportes al fondo sin orden real.
  const reportTimeMs = (r: QCReportRow): number => {
    const candidates = [r.checkOutAt, r.createdAt, r.checkInAt, r.date ? `${r.date}T00:00:00` : null];
    for (const c of candidates) {
      const t = toMs(c);
      if (!isNaN(t)) return t;
    }
    return 0;
  };

  const finishedReports = useMemo(() => {
    return reports
      .filter(r => r.status === 'Finished')
      .sort((a, b) => reportTimeMs(b) - reportTimeMs(a));
  }, [reports]);

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return finishedReports.filter(r => {
      if (tabForReport(r) !== activeTab) return false;
      if (startDate && r.date < startDate) return false;
      if (endDate && r.date > endDate) return false;
      if (!q) return true;
      return [getClientName(r.client), r.address, r.inspector, r.team, r.date]
        .some(v => String(v || '').toLowerCase().includes(q));
    });
    // getClientName depende solo de customers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedReports, search, startDate, endDate, activeTab, customers, properties, statuses]);

  const counts = useMemo(() => {
    const acc: Record<ReportTab, number> = { quality_check: 0, invoice: 0, recall: 0 };
    finishedReports.forEach(r => { acc[tabForReport(r)] += 1; });
    return acc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedReports, properties, statuses]);

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
          <p className="qcrt-header-subtitle">Inspecciones finalizadas · WhatsApp, email y PDF · v3</p>
        </div>
      </header>

      <button className="hamburger-btn qcrt-hamburger-btn" onClick={onOpenMenu} aria-label="Open menu">
        <Menu size={24} />
      </button>

      {/* ===== FILTROS ===== */}
      <div className="qcrt-filters-card">
        {/* ⭐ PESTAÑAS por estado ACTUAL de la casa: Quality Checks · Invoice · Recall.
            Agrupan por dónde está la casa ahora, no por el resultado de la
            inspección: una casa puede haber pasado y estar ya en facturación. */}
        <div className="qcrt-tabs">
          {(['quality_check', 'invoice', 'recall'] as ReportTab[]).map(tab => (
            <button
              key={tab}
              type="button"
              className={`qcrt-tab ${tab}${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'quality_check' && <ClipboardCheck size={15} />}
              {tab === 'invoice' && <FileText size={15} />}
              {tab === 'recall' && <Repeat size={15} />}
              {TAB_LABEL[tab]}
              <span className="qcrt-tab-count">{counts[tab]}</span>
            </button>
          ))}
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
              {/* ⭐ ENVIAR va PRIMERO y fijo a la izquierda. Antes estaba al final:
                  la tabla mide 980px minimo, asi que en un portatil con el menu
                  abierto esa columna quedaba fuera de pantalla y los botones no
                  se veian nunca. Aqui son lo primero que aparece y no se pierden
                  al desplazar horizontalmente. */}
              <th className="qcrt-th center actions">Enviar</th>
              <th className="qcrt-th">Result</th>
              <th className="qcrt-th center">Score</th>
              <th className="qcrt-th">House Status</th>
              <th className="qcrt-th">Client / Address</th>
              <th className="qcrt-th">Inspection Date</th>
              <th className="qcrt-th">Team</th>
              <th className="qcrt-th">Inspector</th>
              <th className="qcrt-th">Duration</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="qcrt-empty-row">Cargando reportes de calidad...</td></tr>
            ) : finishedReports.length === 0 ? (
              <tr><td colSpan={9} className="qcrt-empty-row">
                Todavía no hay inspecciones finalizadas. Al terminar una inspección en Quality Check aparecerá aquí.
              </td></tr>
            ) : filteredReports.length === 0 ? (
              <tr><td colSpan={9} className="qcrt-empty-row">
                Ningún reporte en esta pestaña coincide con los filtros. Limpia la búsqueda o revisa las otras pestañas.
              </td></tr>
            ) : filteredReports.map(r => {
              const badge = resultBadge(r);
              const notes = reportNotes(r);
              const score = reportScore(r);
              const scoreColors = passRateColors(score.passRate, score.hasData);
              return (
                <tr key={r.id} className="qcrt-row">
                  {/* ⭐ PRIMERA columna: los tres envíos, siempre a la vista. */}
                  <td className="qcrt-td center actions">
                    <div className="qcrt-actions-row">
                      <button
                        type="button"
                        className="qcrt-wa-btn"
                        onClick={() => handleShareWhatsApp(r)}
                        disabled={sharingId === r.id}
                        title="Enviar por WhatsApp"
                        aria-label="Enviar por WhatsApp"
                      >
                        {sharingId === r.id ? <Loader2 size={16} className="qcrt-spin" /> : <Send size={16} />}
                      </button>
                      <button
                        type="button"
                        className="qcrt-mail-btn"
                        onClick={() => handleSendEmail(r)}
                        title="Enviar por email"
                        aria-label="Enviar por email"
                      >
                        <Mail size={16} />
                      </button>
                      <button
                        type="button"
                        className="qcrt-pdf-icon-btn"
                        onClick={() => handleExportPdf(r)}
                        disabled={exportingId === r.id}
                        title="Ver el reporte en PDF"
                        aria-label="Ver el reporte en PDF"
                      >
                        {exportingId === r.id ? <Loader2 size={16} className="qcrt-spin" /> : <Printer size={16} />}
                      </button>
                    </div>
                  </td>
                  <td className="qcrt-td">
                    <span
                      className="qcrt-badge"
                      style={{ '--badge-bg': badge.bg, '--badge-fg': badge.fg } as CSSProperties}
                    >
                      <badge.Icon size={12} /> {badge.label}
                    </span>
                  </td>
                  <td className="qcrt-td center">
                    {/* ⭐ El MISMO % que imprime el PDF (src/utils/qcScore.ts). */}
                    <span
                      className="qcrt-score"
                      style={{ '--badge-bg': scoreColors.bg, '--badge-fg': scoreColors.fg } as CSSProperties}
                      title="Tareas aprobadas sobre las respondidas"
                    >
                      {score.hasData ? `${score.passRate}%` : '—'}
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
                  <span className="qcrt-card-meta-label"><Check size={13} /> Resultado</span>
                  <span className="qcrt-card-meta-value">
                    {(() => {
                      const sc = reportScore(r);
                      return sc.hasData ? `${sc.passRate}%` : '—';
                    })()}
                  </span>
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
              <button
                type="button"
                className="qcrt-wa-btn full"
                onClick={() => handleShareWhatsApp(r)}
                disabled={sharingId === r.id}
              >
                {sharingId === r.id ? <Loader2 size={15} className="qcrt-spin" /> : <Send size={15} />} Enviar por WhatsApp
              </button>
              <button
                type="button"
                className="qcrt-mail-btn full"
                onClick={() => handleSendEmail(r)}
              >
                <Mail size={15} /> Enviar por email
              </button>
            </div>
          );
        })}
      </div>

      {shareReady && (
        <ShareReportSheet
          prepared={shareReady}
          clientName={shareClient}
          onClose={() => setShareReady(null)}
        />
      )}

      {statusModal && (
        <StatusChangeModal
          config={statusModal}
          statuses={allowedStatuses}
          note='Desde los reportes de calidad una casa solo puede moverse a "Quality Check", "Recall" o "Invoice".'
          onClose={() => setStatusModal(null)}
        />
      )}
    </div>
  );
}
