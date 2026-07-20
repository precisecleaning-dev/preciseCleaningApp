import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  FileBarChart, Search, User, Clock, CalendarDays, Check, Repeat, Timer, MapPin,
  Printer, Edit2, Trash2, Loader2, Mail,
} from 'lucide-react';
import { db } from '../config/firebase';
import { collection, onSnapshot, query, limit, doc, getDoc, deleteDoc, addDoc } from 'firebase/firestore';
import type { Customer } from '../types/index';
import { exportQCReportPDF, type QCPdfPlace, type QCPdfTask, type QCPdfBranding } from '../utils/qcReportPdf';
import './QCReportsView.css';

// ============================================================================
// ⭐ PESTAÑA "REPORTES" del hub de Quality Check (punto 9 del pedido):
//   acumula TODOS los reportes de calidad guardados (Finished, pasados o no),
//   del más reciente al más antiguo. Por cada reporte se ve:
//     · CUÁNDO se hizo (fecha + hora de cierre de la inspección)
//     · QUIÉN lo hizo (inspector)
//     · CUÁNTO DEMORÓ EN ABRIRLO tras crearse (createdAt → checkInAt)
//     · más contexto útil: resultado, duración de la inspección, cliente/dirección.
//   Los registros creados antes de que existiera `createdAt` muestran "—" en la
//   demora (no hay dato para calcularla).
//   Mobile-first: SIEMPRE tarjetas, sin tablas — cero scroll horizontal.
// ============================================================================

interface Props {
  // ⭐ "Editar" abre el registro en el editor de la pestaña Quality Check (vía hub)
  onEditReport?: (qc: QCReportRecord) => void;
}

export interface QCReportRecord {
  id: string;
  houseId: string;
  date: string;
  address?: string;
  client?: string;
  team?: string;
  status: 'Finished' | 'Pending';
  result?: 'passed' | 'failed' | null;
  inspector?: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  durationMinutes?: number | null;
  createdAt?: string | null;
  correctionsDoneAt?: string | null;
  correctionsDoneBy?: string | null;
  // Payload completo de la inspección (necesario para regenerar el PDF)
  selectedPlaces?: string[];
  // Excepción documentada (CLAUDE.md): estructura dinámica por configuración
  qcData?: Record<string, any>;
}

const toMs = (iso?: string | null): number => {
  if (!iso) return NaN;
  const t = new Date(iso).getTime();
  return isNaN(t) ? NaN : t;
};

const fmtDateTime = (iso?: string | null): string => {
  const t = toMs(iso);
  if (isNaN(t)) return '—';
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
};

const fmtMinutes = (mins: number): string => {
  if (!isFinite(mins) || mins < 0) return '—';
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d ${h % 24} h`;
};

export default function QCReportsView({ onEditReport }: Props) {
  const [reports, setReports] = useState<QCReportRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  // ⭐ Contexto para regenerar el PDF (mismo generador que la vista Quality Check)
  const [places, setPlaces] = useState<QCPdfPlace[]>([]);
  const [tasks, setTasks] = useState<QCPdfTask[]>([]);
  const [branding, setBranding] = useState<QCPdfBranding>({ name: 'Precise Cleaning' });
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    const unsubQC = onSnapshot(
      query(collection(db, 'quality_checks'), limit(2000)),
      (snap) => {
        setReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as QCReportRecord)));
        setLoading(false);
      },
      (err) => { console.error('Error cargando reportes QC:', err); setLoading(false); }
    );
    const unsubCust = onSnapshot(
      collection(db, 'customers'),
      (snap) => setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer))),
      (err) => console.error('Error cargando clientes:', err)
    );
    const unsubPlaces = onSnapshot(collection(db, 'settings_places'),
      snap => setPlaces(snap.docs.map(d => ({ id: d.id, ...d.data() } as QCPdfPlace)).sort((a, b) => a.name.localeCompare(b.name))),
      err => console.error('Error cargando áreas:', err));
    const unsubTasks = onSnapshot(collection(db, 'settings_tasks'),
      snap => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as QCPdfTask)).sort((a, b) => a.name.localeCompare(b.name))),
      err => console.error('Error cargando tareas:', err));
    getDoc(doc(db, 'settings_company', 'main'))
      .then(s => { if (s.exists()) { const d = s.data(); setBranding({ name: d.name || 'Precise Cleaning', address: d.address || '', logo: d.logo || '', email: d.email || '' }); } })
      .catch(() => { /* branding por defecto */ });
    return () => { unsubQC(); unsubCust(); unsubPlaces(); unsubTasks(); };
  }, []);

  // ⭐ Ver/descargar el PDF del reporte (mismo generador compartido)
  const handleExportPdf = async (r: QCReportRecord) => {
    setExportingId(r.id);
    try {
      await exportQCReportPDF({
        house: { address: r.address || '' },
        clientName: getClientName(r.client),
        teamName: r.team || '—',
        qcData: r.qcData || {},
        inspectorName: r.inspector || 'Unknown',
        recordDate: r.date,
        places,
        tasks,
        branding,
      });
    } finally {
      setExportingId(null);
    }
  };

  // ⭐ Enviar el reporte por email a la dirección de la empresa (misma mecánica que
  //    el envío automático de la vista Quality Check: colección "mail" + extensión
  //    "Trigger Email" de Firebase). El asunto replica el formato estándar.
  const handleSendEmail = async (r: QCReportRecord) => {
    const to = branding.email;
    if (!to) {
      alert('No hay un email de empresa configurado. Ve a la sección Empresa y captura el email para poder enviar reportes.');
      return;
    }
    if (!window.confirm(`¿Enviar este reporte por email a ${to}?`)) return;
    setSendingId(r.id);
    try {
      const html = await exportQCReportPDF({
        house: { address: r.address || '' },
        clientName: getClientName(r.client),
        teamName: r.team || '—',
        qcData: r.qcData || {},
        inspectorName: r.inspector || 'Unknown',
        recordDate: r.date,
        places,
        tasks,
        branding,
        returnHtml: true,
      });
      if (!html || typeof html !== 'string') {
        alert('Este reporte no tiene datos para enviar (sin tareas, notas ni fotos).');
        return;
      }
      const subject = `Quality Check Report - ${getClientName(r.client)} (${r.date})`;
      await addDoc(collection(db, 'mail'), { to, message: { subject, html } });
      alert(`📧 Reporte enviado a ${to}.`);
    } catch (e) {
      console.error('Error enviando el reporte por email:', e);
      alert('No se pudo enviar el reporte por email.');
    } finally {
      setSendingId(null);
    }
  };

  const handleDelete = async (r: QCReportRecord) => {
    if (!window.confirm(`¿Eliminar el reporte de ${getClientName(r.client)} (${r.date})? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteDoc(doc(db, 'quality_checks', r.id));
    } catch (e) {
      console.error('Error eliminando el reporte:', e);
      alert('No se pudo eliminar el reporte.');
    }
  };

  const getClientName = (idOrName?: string): string => {
    if (!idOrName) return 'Unknown Client';
    const c = customers.find(x => x.id === idOrName);
    // Customer puede tener name o firstName/lastName según el origen del dato
    const cx = c as (Customer & { name?: string; firstName?: string; lastName?: string }) | undefined;
    if (cx) return cx.name || [cx.firstName, cx.lastName].filter(Boolean).join(' ') || idOrName;
    return idOrName;
  };

  // Solo reportes TERMINADOS (los Pending viven en la vista Quality Check),
  // ordenados del más reciente al más antiguo por cierre de inspección.
  const finishedReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports
      .filter(r => r.status === 'Finished')
      .filter(r => {
        if (!q) return true;
        return [getClientName(r.client), r.address, r.inspector, r.team, r.date]
          .some(v => String(v || '').toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const ta = toMs(a.checkOutAt) || toMs(a.createdAt) || toMs(a.date + 'T00:00:00');
        const tb = toMs(b.checkOutAt) || toMs(b.createdAt) || toMs(b.date + 'T00:00:00');
        return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
      });
    // getClientName depende solo de customers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports, search, customers]);

  return (
    <div className="qcr-root">
      <div className="qcr-header">
        <h2 className="qcr-title"><FileBarChart size={20} /> Reportes de Quality Check</h2>
        <p className="qcr-subtitle">{finishedReports.length} reporte(s) · del más reciente al más antiguo</p>
      </div>

      <div className="qcr-search-wrap">
        <Search size={16} className="qcr-search-icon" />
        <input
          className="qcr-search"
          placeholder="Buscar por cliente, dirección, inspector..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="qcr-empty">Cargando reportes…</div>
      ) : finishedReports.length === 0 ? (
        <div className="qcr-empty">
          Aún no hay reportes de calidad guardados. Al terminar una inspección en la pestaña
          Quality Check, el reporte aparecerá aquí automáticamente.
        </div>
      ) : (
        <ul className="qcr-list">
          {finishedReports.map(r => {
            const failed = r.result === 'failed';
            const badge = failed
              ? { bg: '#f3e8ff', fg: '#7c3aed', label: 'Recall', Icon: Repeat }
              : { bg: '#dcfce7', fg: '#166534', label: 'Passed', Icon: Check };
            // ⭐ Demora en ABRIR la inspección después de crear el registro
            const openDelayMin = (toMs(r.checkInAt) - toMs(r.createdAt)) / 60000;
            const hasDelay = isFinite(openDelayMin) && openDelayMin >= 0;
            return (
              <li key={r.id} className="qcr-card">
                <div className="qcr-card-top">
                  <div className="qcr-card-id">
                    <div className="qcr-client">{getClientName(r.client)}</div>
                    <div className="qcr-address"><MapPin size={12} /> {r.address || '—'}</div>
                  </div>
                  <span className="qcr-badge" style={{ '--qcr-bg': badge.bg, '--qcr-fg': badge.fg } as CSSProperties}>
                    <badge.Icon size={12} /> {badge.label}
                  </span>
                </div>

                <dl className="qcr-meta">
                  <div className="qcr-meta-pair">
                    <dt><CalendarDays size={13} /> Cuándo</dt>
                    <dd>{fmtDateTime(r.checkOutAt) !== '—' ? fmtDateTime(r.checkOutAt) : r.date}</dd>
                  </div>
                  <div className="qcr-meta-pair">
                    <dt><User size={13} /> Quién</dt>
                    <dd>{r.inspector || 'Unknown'}</dd>
                  </div>
                  <div className="qcr-meta-pair">
                    <dt><Timer size={13} /> Demora en abrir</dt>
                    <dd title="Tiempo entre crear el registro y abrir la inspección">{hasDelay ? fmtMinutes(openDelayMin) : '—'}</dd>
                  </div>
                  <div className="qcr-meta-pair">
                    <dt><Clock size={13} /> Duración</dt>
                    <dd>{typeof r.durationMinutes === 'number' ? fmtMinutes(r.durationMinutes) : '—'}</dd>
                  </div>
                </dl>

                {r.correctionsDoneAt && (
                  <div className="qcr-corr">
                    <Check size={12} /> Correcciones hechas · {fmtDateTime(r.correctionsDoneAt)}{r.correctionsDoneBy ? ` · ${r.correctionsDoneBy}` : ''}
                  </div>
                )}
                {/* ⭐ Acciones: PDF · Editar · Eliminar */}
                <div className="qcr-actions">
                  <button className="qcr-action-btn pdf" onClick={() => handleExportPdf(r)} disabled={exportingId === r.id} title="Ver el PDF (desde ahí se imprime o guarda)">
                    {exportingId === r.id ? <Loader2 size={15} className="qcr-spin" /> : <Printer size={15} />} PDF
                  </button>
                  <button className="qcr-action-btn email" onClick={() => handleSendEmail(r)} disabled={sendingId === r.id} title="Enviar el reporte al email de la empresa">
                    {sendingId === r.id ? <Loader2 size={15} className="qcr-spin" /> : <Mail size={15} />} Email
                  </button>
                  {onEditReport && (
                    <button className="qcr-action-btn edit" onClick={() => onEditReport(r)}>
                      <Edit2 size={15} /> Editar
                    </button>
                  )}
                  <button className="qcr-action-btn delete" onClick={() => handleDelete(r)}>
                    <Trash2 size={15} /> Eliminar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}