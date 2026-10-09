// ============================================================================
// ⭐ QC DASHBOARD — vista NUEVA (las vistas Quality Check y Quality Check
//    Reports se mantienen tal cual). Diseño "Quality Check dashboard" del lienzo
//    "Precise Cleaning – Unified Jobs View":
//      · barra de periodo (Day/Week/Month/Year/Custom) + Team + Inspector
//      · indicadores: completados, inspeccionados, pass rate, promedio,
//        re-cleans y sin inspeccionar
//      · pestañas Needs inspection / Re-clean / Passed / All
//      · tabla de inspecciones con score, resultado, áreas con fallas,
//        seguimiento sugerido y envío del reporte (WhatsApp / email / PDF)
//      · scorecard por equipo, áreas que más fallan y resumen escrito
//      · panel lateral con el detalle de la inspección
//    Las reglas viven en src/utils/qcDashboard.ts.
// ============================================================================
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ChevronRight, Filter, Menu, Search, Mail, Printer, RotateCcw, Sparkles, X } from 'lucide-react';
import type { Property, Role } from '../types/index';
import { useLiveCollection, useLiveData } from '../shared/data/liveCollections';
import { getCompanySettings } from '../services/companyService';
import { getRelationName } from '../utils/relations';
import { formatDate } from '../utils/dateFormat';
import { inPeriod, loadPeriod, periodRange, savePeriod, type PeriodState } from '../utils/periods';
import { isRecallText } from '../utils/recallStatus';
import { groupByDate } from '../utils/dateGrouping';
import { useRecallHouses } from '../utils/jobRecall';
import {
  dashboardSummary, failedAreas, followUp, latestByHouse, recordScore, resultOf, RESULT_LABEL,
  type QcDashRow, type QcPlace, type QcResult, type QcTask,
} from '../utils/qcDashboard';
import { exportQCReportPDF, type QCPdfBranding } from '../utils/qcReportPdf';
import { prepareQCShare, type PreparedQCShare } from '../utils/shareQCReport';
import { sendMailAndConfirm, mailResultMessage } from '../utils/sendMail';
import PeriodBar from '../components/PeriodBar';
import KpiGrid from '../components/KpiGrid';
import QcInspectionPanel from '../components/QcInspectionPanel';
import ShareReportSheet from '../components/ShareReportSheet';
import WhatsAppIcon from '../components/WhatsAppIcon';
import HistoryWindowNotice from '../components/HistoryWindowNotice';
import './QualityDashboardView.css';

type Tab = 'todo' | 'reclean' | 'passed' | 'all';
const TABS: { id: Tab; label: string }[] = [
  { id: 'todo', label: 'Needs inspection' },
  { id: 'reclean', label: 'Re-clean' },
  { id: 'passed', label: 'Passed' },
  { id: 'all', label: 'All' },
];
const RESULT_TONE: Record<QcResult, string> = { passed: 'good', reclean: 'bad', todo: 'warn' };


interface Props {
  onOpenMenu: () => void;
  properties: Property[];
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
  /** Abre la inspección de la casa en la vista Quality Check. */
  onInspect?: (house: Property) => void;
  /** Abre el detalle de la casa (modales de HousesView). */
  onOpenHouseDetail: (house: Property) => void;
}

const norm = (s: unknown) => String(s || '').toLowerCase().trim();

export default function QualityDashboardView({
  onOpenMenu, properties, activeRole, isSuperAdmin = false, onInspect, onOpenHouseDetail,
}: Props) {
  // ⭐ Datos del store compartido (un listener por colección para toda la app).
  const statuses = useLiveData('statuses');
  const teams = useLiveData('teams');
  const customers = useLiveData('customers');
  const places = useLiveData('places') as QcPlace[];
  const tasks = useLiveData('tasks') as QcTask[];
  // Tipo de servicio: catálogo de productos con respaldo en settings_services
  //    (misma resolución que el Overview).
  const products = useLiveData('products');
  const svcCatalog = useLiveData('services');
  const services = useMemo(() => [...products, ...svcCatalog], [products, svcCatalog]);
  const employees = useLiveData('users');
  const { data: records, loaded: recordsLoaded } = useLiveCollection('qualityChecks');
  const loading = !recordsLoaded;
  const [branding, setBranding] = useState<QCPdfBranding>({ name: 'Precise Cleaning' });

  const PERIOD_KEY = 'pc.qcdash.period';
  const [period, setPeriodState] = useState<PeriodState>(() => loadPeriod(PERIOD_KEY, 'week'));
  const setPeriod = (p: PeriodState) => { setPeriodState(p); savePeriod(PERIOD_KEY, p); };
  const range = useMemo(() => periodRange(period), [period]);

  const [tab, setTab] = useState<Tab>('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [inspectorFilter, setInspectorFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  const [openRow, setOpenRow] = useState<QcDashRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [shareReady, setShareReady] = useState<PreparedQCShare | null>(null);
  const [shareClient, setShareClient] = useState('');

  const canSeeOfficeNotes = isSuperAdmin
    || !!activeRole?.permissions?.find((p) => p.module === 'Office Notes')?.canView;
  const canInspect = isSuperAdmin
    || !!activeRole?.permissions?.find((p) => p.module === 'Quality Check')?.canEdit;

  useEffect(() => {
    let alive = true;
    getCompanySettings()
      .then((c) => {
        if (alive) setBranding({ name: c.name || 'Precise Cleaning', address: c.address || '', logo: c.logo || '', email: c.email || '' });
      })
      .catch(() => { /* branding por defecto */ });
    return () => { alive = false; };
  }, []);

  const recallHouses = useRecallHouses(statuses);

  // ---- Catálogos ----
  const statusOf = (p: Property) => statuses.find((s) => String(s.id) === String(p.statusId) || s.name === p.statusId);
  const clientName = (p: Property) => getRelationName(customers, p.client, String(p.client || 'Unknown'));
  const team = (p: Property) => (p.teamId ? teams.find((t) => t.id === p.teamId) : undefined);
  const teamName = (p: Property) => team(p)?.name || 'Unassigned';
  const typeName = (p: Property) => getRelationName(services, p.serviceId, 'Regular');

  // ---- Trabajos completados del periodo ----
  const latest = useMemo(() => latestByHouse(records), [records]);

  const rows: QcDashRow[] = useMemo(() => {
    const out: QcDashRow[] = [];
    properties.forEach((p) => {
      if (!inPeriod(p.scheduleDate, range)) return;
      const stName = norm(statusOf(p)?.name || p.statusId);
      const rec = latest.get(p.id) || null;
      const done =
        !!rec ||
        !!p.employeeFinishedAt ||
        stName === 'invoice' ||
        stName === 'qc' ||
        stName.includes('quality check') ||
        stName.includes('complete') ||
        isRecallText(stName);
      if (!done) return;
      const result = resultOf(rec);
      out.push({
        prop: p,
        rec,
        result,
        score: recordScore(rec, tasks),
        issues: failedAreas(rec, places),
        inspector: rec?.inspector || '',
        date: formatDate(p.scheduleDate),
        follow: followUp(result, String(p.invoiceStatus || ''), teamName(p)),
        recall: recallHouses.has(p.id) || isRecallText(stName),
      });
    });
    return out.sort((a, b) => String(b.prop.scheduleDate).localeCompare(String(a.prop.scheduleDate)));
    // statusOf/teamName dependen de statuses/teams
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, range, latest, tasks, places, statuses, teams, recallHouses]);

  // Team / Inspector / búsqueda aplican a todo (KPIs, tabla y paneles laterales)
  const scoped = useMemo(() => {
    const q = norm(search);
    return rows.filter((r) => {
      if (teamFilter !== 'all' && String(r.prop.teamId || '') !== teamFilter) return false;
      if (inspectorFilter !== 'all' && r.inspector !== inspectorFilter) return false;
      if (q && !`${clientName(r.prop)} ${r.prop.address || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, teamFilter, inspectorFilter, search, customers]);

  const tabRows = scoped.filter((r) => tab === 'all' || r.result === tab);
  // Grupos por fecha, igual que el Overview (día en Day/Week/Custom, semana en
  // Month, mes en Year), con un resumen de cada grupo.
  const groups = useMemo(
    () => groupByDate(tabRows, (r) => r.prop.scheduleDate, range.groupBy, 'desc').map((g) => {
      const insp = g.items.filter((r) => r.result !== 'todo');
      const sc = insp.filter((r) => r.score !== null).map((r) => r.score as number);
      return {
        ...g,
        passed: g.items.filter((r) => r.result === 'passed').length,
        reclean: g.items.filter((r) => r.result === 'reclean').length,
        todo: g.items.length - insp.length,
        avg: sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null,
      };
    }),
    [tabRows, range.groupBy],
  );
  const filtersOn = teamFilter !== 'all' || inspectorFilter !== 'all';
  const inspectors = useMemo(() => [...new Set(rows.map((r) => r.inspector).filter(Boolean))].sort(), [rows]);

  // ---- Indicadores ----
  const inspected = scoped.filter((r) => r.result !== 'todo');
  const passed = scoped.filter((r) => r.result === 'passed');
  const recleans = scoped.filter((r) => r.result === 'reclean');
  const todo = scoped.filter((r) => r.result === 'todo');
  const scored = inspected.filter((r) => r.score !== null);
  const avg = scored.length ? Math.round(scored.reduce((s, r) => s + (r.score as number), 0) / scored.length) : null;
  const passRate = inspected.length ? Math.round((passed.length / inspected.length) * 100) : null;
  const coverage = scoped.length ? Math.round((inspected.length / scoped.length) * 100) : null;
  const onHold = recleans.filter((r) => norm(r.prop.invoiceStatus) !== 'paid').length;

  // ---- Scorecard por equipo y áreas que más fallan ----
  const teamCards = useMemo(() => {
    const m = new Map<string, { name: string; color: string; scores: number[]; n: number; pass: number; re: number }>();
    scoped.filter((r) => r.result !== 'todo').forEach((r) => {
      const key = String(r.prop.teamId || 'none');
      const t = team(r.prop);
      const e = m.get(key) || { name: teamName(r.prop), color: t?.color || '#64748b', scores: [], n: 0, pass: 0, re: 0 };
      e.n += 1;
      if (r.result === 'passed') e.pass += 1;
      if (r.result === 'reclean') e.re += 1;
      if (r.score !== null) e.scores.push(r.score);
      m.set(key, e);
    });
    return [...m.values()]
      .map((e) => ({ ...e, avg: e.scores.length ? Math.round(e.scores.reduce((a, b) => a + b, 0) / e.scores.length) : null }))
      .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, teams]);

  const areaCounts = useMemo(() => {
    const m = new Map<string, { count: number; failedInspections: number }>();
    scoped.forEach((r) => r.issues.forEach((a) => {
      const e = m.get(a) || { count: 0, failedInspections: 0 };
      e.count += 1;
      if (r.result === 'reclean') e.failedInspections += 1;
      m.set(a, e);
    }));
    return [...m.entries()].map(([name, e]) => ({ name, ...e })).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [scoped]);
  const maxArea = Math.max(1, ...areaCounts.map((a) => a.count));

  // ---- Envío del reporte (mismas utilidades que Quality Check Reports) ----
  const pdfArgs = (r: QcDashRow) => ({
    house: { address: r.prop.address || '' },
    clientName: clientName(r.prop),
    teamName: r.rec?.team || teamName(r.prop),
    qcData: r.rec?.qcData || {},
    inspectorName: r.inspector || 'Unknown',
    recordDate: r.rec?.date || '',
    places,
    tasks,
    branding,
  });

  const handlePrint = async (r: QcDashRow) => {
    setBusy(r.prop.id);
    try { await exportQCReportPDF(pdfArgs(r)); }
    catch (e) { console.error('Error generando el PDF:', e); alert('No se pudo generar el PDF del reporte.'); }
    finally { setBusy(null); }
  };

  const handleEmail = async (r: QcDashRow) => {
    const to = branding.email;
    if (!to) { alert('No hay un email de empresa configurado.\n\nVe a "Empresa" y captura el correo para poder enviar reportes.'); return; }
    const client = clientName(r.prop);
    if (!window.confirm(`¿Enviar el reporte de ${client} a ${to}?`)) return;
    setBusy(r.prop.id);
    try {
      const html = await exportQCReportPDF({ ...pdfArgs(r), returnHtml: true });
      if (!html || typeof html !== 'string') { alert('Este reporte no tiene datos para enviar.'); return; }
      const result = await sendMailAndConfirm(to, `Quality Check Report - ${client} (${formatDate(r.rec?.date)})`, html);
      alert(mailResultMessage(result, to));
    } catch (e) {
      console.error('Error enviando el reporte:', e);
      alert('No se pudo enviar el reporte por email.');
    } finally { setBusy(null); }
  };

  const handleWhatsApp = async (r: QcDashRow) => {
    setBusy(r.prop.id);
    try {
      const html = await exportQCReportPDF({ ...pdfArgs(r), returnHtml: true });
      if (!html || typeof html !== 'string') { alert('Este reporte no tiene datos para enviar.'); return; }
      const client = clientName(r.prop);
      const prepared = await prepareQCShare(html, {
        clientName: client,
        address: r.prop.address || '',
        date: r.rec?.date || '',
        inspectorName: r.inspector || 'Unknown',
        teamName: teamName(r.prop),
        passRate: r.score,
        failed: r.result === 'reclean',
      });
      setShareClient(client);
      setShareReady(prepared);
    } catch (e) {
      console.error('Error preparando el reporte:', e);
      alert('No se pudo generar el PDF del reporte.');
    } finally { setBusy(null); }
  };

  // Notas de los limpiadores para el panel: mensajes de Employee's Note
  const cleanerNotes = (p: Property) => {
    const authorName = (email: string) => {
      const u = employees.find((e) => norm(e.email) === norm(email));
      return (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '') || String(email || '?').split('@')[0];
    };
    const msgs = (p.notesHistory || [])
      .filter((e) => e.field === 'employeeNote' && String(e.text || '').trim() !== '')
      .map((e, i) => ({ key: `${i}-${e.at}`, author: `${authorName(e.user)} · ${teamName(p)}`, at: e.at, text: e.text }));
    if (msgs.length === 0 && String(p.employeeNote || '').trim()) {
      msgs.push({ key: 'legacy', author: teamName(p), at: '', text: String(p.employeeNote) });
    }
    return msgs;
  };

  const tiles = [
    { key: 'done', label: 'Jobs completed', value: String(scoped.length), sub: 'this period' },
    { key: 'insp', label: 'Inspected', value: String(inspected.length), sub: coverage === null ? '—' : `${coverage}% coverage` },
    {
      key: 'rate', label: 'Pass rate', value: passRate === null ? '—' : `${passRate}%`,
      sub: inspected.length ? `${passed.length} of ${inspected.length} passed` : 'no inspections',
      tone: 'good' as const, highlight: 'good' as const,
    },
    { key: 'avg', label: 'Avg score', value: avg === null ? '—' : String(avg), sub: 'out of 100' },
    {
      key: 're', label: 'Re-cleans', value: String(recleans.length),
      sub: `${onHold} invoice${onHold === 1 ? '' : 's'} on hold`, tone: 'bad' as const, highlight: 'bad' as const,
    },
    { key: 'todo', label: 'Not inspected', value: String(todo.length), sub: 'completed, no QC yet', tone: 'warn' as const },
  ];

  const scoreTone = (n: number) => (n >= 85 ? 'good' : n >= 70 ? 'warn' : 'bad');

  return (
    <div className="fade-in qd-page">
      {/* Encabezado igual al del Overview */}
      <header className="qd-header">
        <div className="qd-title-group">
          <button type="button" className="hamburger-btn" aria-label="Open menu" onClick={onOpenMenu}>
            <Menu size={24} />
          </button>
          <div>
            <h1 className="qd-title">QC Dashboard</h1>
            <p className="qd-subtitle">Inspections, re-cleans &amp; team scores</p>
          </div>
        </div>
        <label className="qd-search">
          <Search size={16} className="qd-search-icon" />
          <input
            type="text"
            className="qd-search-input"
            placeholder="Buscar cliente o dirección"
            aria-label="Buscar cliente o dirección"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </header>
      <HistoryWindowNotice />

      <PeriodBar
        period={period}
        onChange={setPeriod}
        extra={
          <div className="qd-filters">
            <button
              type="button"
              className={`qd-filters-btn${filtersOn ? ' on' : ''}`}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <Filter size={16} /> Filters
              {filtersOn && <span className="qd-filters-dot">{(teamFilter !== 'all' ? 1 : 0) + (inspectorFilter !== 'all' ? 1 : 0)}</span>}
            </button>
            {filtersOpen && (
              <div className="qd-filters-menu" role="dialog" aria-label="Filters">
                <label className="qd-field">
                  <span className="qd-field-lbl">Team</span>
                  <select className="qd-select" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
                    <option value="all">All teams</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label className="qd-field">
                  <span className="qd-field-lbl">Inspector</span>
                  <select className="qd-select" value={inspectorFilter} onChange={(e) => setInspectorFilter(e.target.value)}>
                    <option value="all">All inspectors</option>
                    {inspectors.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <div className="qd-filters-foot">
                  <button
                    type="button"
                    className="qd-btn"
                    disabled={!filtersOn}
                    onClick={() => { setTeamFilter('all'); setInspectorFilter('all'); }}
                  >
                    <X size={14} /> Clear
                  </button>
                  <button type="button" className="qd-btn primary" onClick={() => setFiltersOpen(false)}>Done</button>
                </div>
              </div>
            )}
          </div>
        }
      />

      <KpiGrid label="Indicadores de calidad" groups={[{ key: 'qc', title: 'Quality check', color: '#047857', tiles }]} />

      <div className="qd-body">
        <section className="qd-card qd-main" aria-label="Inspections">
          <div className="qd-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`qd-chip ${t.id}${tab === t.id ? ' on' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                <span className="qd-cnt">{t.id === 'all' ? scoped.length : scoped.filter((r) => r.result === t.id).length}</span>
              </button>
            ))}
          </div>
          <div className="qd-scroll">
            <table className="qd-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Client &amp; address</th>
                  <th>Type</th>
                  <th>Team</th>
                  <th>Inspector</th>
                  <th>Score</th>
                  <th>Result</th>
                  <th>Issues</th>
                  <th>Follow-up</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              {loading ? (
                <tbody><tr><td colSpan={10} className="qd-empty">Loading inspections…</td></tr></tbody>
              ) : groups.length === 0 ? (
                <tbody><tr><td colSpan={10} className="qd-empty">No jobs here for this period. Use ← → or Today to move the period.</td></tr></tbody>
              ) : groups.map((g) => {
                const open = !collapsed.has(g.key);
                return (
                  <tbody key={g.key}>
                    <tr className="qd-group" onClick={() => toggleGroup(g.key)}>
                      <td colSpan={5}>
                        <span className="qd-group-title">
                          <ChevronRight size={16} className={`qd-chevron${open ? ' open' : ''}`} />
                          {g.label}
                          {g.detail && <span className="qd-group-range">{g.detail}</span>}
                          <span className="qd-count">{g.items.length} {g.items.length === 1 ? 'job' : 'jobs'}</span>
                        </span>
                      </td>
                      <td>
                        {g.avg !== null && <span className="qd-group-avg">avg <strong>{g.avg}</strong></span>}
                      </td>
                      <td colSpan={4}>
                        <span className="qd-group-stats">
                          {g.passed > 0 && <span className="qd-pill good">{g.passed} passed</span>}
                          {g.reclean > 0 && <span className="qd-pill bad">{g.reclean} re-clean</span>}
                          {g.todo > 0 && <span className="qd-pill warn">{g.todo} not inspected</span>}
                        </span>
                      </td>
                    </tr>
                    {open && g.items.map((r) => {
                      const t = team(r.prop);
                      const tone = RESULT_TONE[r.result];
                      return (
                        <tr key={r.prop.id} className="qd-row" onClick={() => setOpenRow(r)}>
                          <td className="strong">{r.date}</td>
                          <td className="qd-client">
                            <div className="strong">{clientName(r.prop)}</div>
                            <div className="qd-muted">{r.prop.address}</div>
                          </td>
                          <td className="semibold">{typeName(r.prop)}</td>
                          <td>
                            {t ? (
                              <span className="qd-team" style={{ '--team-color': t.color || '#64748b' } as CSSProperties}>{t.name}</span>
                            ) : <span className="qd-team none">Unassigned</span>}
                          </td>
                          <td className="qd-muted-strong">{r.inspector || '—'}</td>
                          <td>
                            {r.score === null ? <span className="qd-muted">—</span> : (
                              <div className="qd-scorecell">
                                <span className="qd-bar">
                                  <span
                                    className={`qd-bar-fill ${scoreTone(r.score)}`}
                                    style={{ '--w': `${r.score}%` } as CSSProperties}
                                  />
                                </span>
                                <span className={`qd-score ${scoreTone(r.score)}`}>{r.score}%</span>
                              </div>
                            )}
                          </td>
                          <td>
                            <div className="qd-result-cell">
                              <span className={`qd-pill ${tone}`}>{RESULT_LABEL[r.result]}</span>
                              {r.recall && <span className="qd-recall" title="Esta casa estuvo en Recall"><RotateCcw size={11} /> Recall</span>}
                            </div>
                          </td>
                          <td className="qd-issues">
                            {r.issues.length === 0 ? <span className="qd-muted">—</span> : (
                              <ul className="qd-tags">{r.issues.map((i) => <li key={i} className="qd-tag">{i}</li>)}</ul>
                            )}
                          </td>
                          <td className="qd-follow">{r.follow}</td>
                          <td className="right" onClick={(e) => e.stopPropagation()}>
                            <div className="qd-actions">
                              {r.rec && r.result !== 'todo' && (
                                <>
                                  <button type="button" className="qd-iconbtn wa" disabled={busy === r.prop.id} onClick={() => handleWhatsApp(r)} aria-label="Enviar por WhatsApp" title="WhatsApp">
                                    <WhatsAppIcon size={15} />
                                  </button>
                                  <button type="button" className="qd-iconbtn" disabled={busy === r.prop.id} onClick={() => handleEmail(r)} aria-label="Enviar por email" title="Email">
                                    <Mail size={15} />
                                  </button>
                                  <button type="button" className="qd-iconbtn" disabled={busy === r.prop.id} onClick={() => handlePrint(r)} aria-label="Imprimir / PDF" title="PDF">
                                    <Printer size={15} />
                                  </button>
                                </>
                              )}
                              {r.result === 'passed' || !canInspect || !onInspect ? (
                                <button type="button" className="qd-btn" onClick={() => setOpenRow(r)}>View</button>
                              ) : (
                                <button type="button" className="qd-btn primary" onClick={() => onInspect(r.prop)}>
                                  {r.result === 'reclean' ? 'Re-inspect' : 'Inspect'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
            </table>
          </div>
        </section>

        <aside className="qd-side" aria-label="Resumen del periodo">
          <section className="qd-card qd-pad" aria-label="Team scorecard">
            <p className="qd-lbl">Team scorecard</p>
            {teamCards.length === 0 ? <p className="qd-muted">No inspections in this period.</p> : (
              <ul className="qd-teamlist">
                <li className="qd-teamrow head" aria-hidden="true">
                  <span>Team</span>
                  <span className="qd-teamstats-head"><span>Avg</span><span>Pass</span><span>Re-clean</span></span>
                </li>
                {teamCards.map((tc) => (
                  <li key={tc.name} className="qd-teamrow">
                    <span className="qd-team" style={{ '--team-color': tc.color } as CSSProperties}>{tc.name}</span>
                    <dl className="qd-teamstats">
                      <div><dt>Avg</dt><dd className={tc.avg === null ? '' : scoreTone(tc.avg)}>{tc.avg ?? '—'}</dd></div>
                      <div><dt>Pass</dt><dd>{tc.n ? `${Math.round((tc.pass / tc.n) * 100)}%` : '—'}</dd></div>
                      <div><dt>Re-clean</dt><dd className={tc.re > 0 ? 'bad' : ''}>{tc.re}</dd></div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="qd-card qd-pad" aria-label="Most failed areas">
            <p className="qd-lbl">Most failed areas</p>
            {areaCounts.length === 0 ? <p className="qd-muted">No failed items in this period.</p> : (
              <ul className="qd-arealist">
                {areaCounts.map((a) => (
                  <li key={a.name} className="qd-area">
                    <div className="qd-area-top"><span>{a.name}</span><span className="strong">{a.count}</span></div>
                    <span className="qd-bar wide">
                      <span
                        className={`qd-bar-fill ${a.failedInspections > 0 ? 'bad' : 'warn'}`}
                        style={{ '--w': `${Math.round((a.count / maxArea) * 100)}%` } as CSSProperties}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="qd-card qd-pad qd-ai" aria-label="AI summary">
            <p className="qd-lbl ai"><Sparkles size={12} /> AI summary</p>
            <p className="qd-ai-text">{dashboardSummary(scoped, teamName)}</p>
          </section>
        </aside>
      </div>

      {openRow && (
        <QcInspectionPanel
          row={openRow}
          client={clientName(openRow.prop)}
          type={typeName(openRow.prop)}
          team={teamName(openRow.prop)}
          places={places}
          tasks={tasks}
          officeNote={canSeeOfficeNotes ? String((openRow.prop as Property & { officeNote?: string }).officeNote || '') : null}
          cleanerNotes={cleanerNotes(openRow.prop)}
          busy={busy}
          onClose={() => setOpenRow(null)}
          onInspect={canInspect && onInspect ? (p) => { setOpenRow(null); onInspect(p); } : undefined}
          onOpenJob={(p) => { setOpenRow(null); onOpenHouseDetail(p); }}
          onWhatsApp={() => handleWhatsApp(openRow)}
          onEmail={() => handleEmail(openRow)}
          onPrint={() => handlePrint(openRow)}
        />
      )}

      {shareReady && (
        <ShareReportSheet prepared={shareReady} clientName={shareClient} onClose={() => setShareReady(null)} />
      )}
    </div>
  );
}
