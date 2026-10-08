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
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { Menu, Search, Mail, Printer, RotateCcw, Sparkles } from 'lucide-react';
import { db } from '../config/firebase';
import type { Customer, Property, Role, Status, SystemUser, Team } from '../types/index';
import { mapCustomerDoc } from '../utils/customerDocs';
import { getRelationName } from '../utils/relations';
import { formatDate } from '../utils/dateFormat';
import { inPeriod, loadPeriod, periodRange, savePeriod, type PeriodState } from '../utils/periods';
import { isRecallText } from '../utils/recallStatus';
import { useRecallHouses } from '../utils/jobRecall';
import {
  dashboardSummary, failedAreas, followUp, latestByHouse, recordScore, resultOf, RESULT_LABEL,
  type QcDashRow, type QcPlace, type QcRecordLite, type QcResult, type QcTask,
} from '../utils/qcDashboard';
import { exportQCReportPDF, type QCPdfBranding } from '../utils/qcReportPdf';
import { prepareQCShare, type PreparedQCShare } from '../utils/shareQCReport';
import { sendMailAndConfirm, mailResultMessage } from '../utils/sendMail';
import PeriodBar from '../components/PeriodBar';
import KpiGrid from '../components/KpiGrid';
import QcInspectionPanel from '../components/QcInspectionPanel';
import ShareReportSheet from '../components/ShareReportSheet';
import WhatsAppIcon from '../components/WhatsAppIcon';
import './QualityDashboardView.css';

type Tab = 'todo' | 'reclean' | 'passed' | 'all';
const TABS: { id: Tab; label: string }[] = [
  { id: 'todo', label: 'Needs inspection' },
  { id: 'reclean', label: 'Re-clean' },
  { id: 'passed', label: 'Passed' },
  { id: 'all', label: 'All' },
];
const RESULT_TONE: Record<QcResult, string> = { passed: 'good', reclean: 'bad', todo: 'warn' };

interface CatalogItem { id: string; name: string }

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
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [places, setPlaces] = useState<QcPlace[]>([]);
  const [tasks, setTasks] = useState<QcTask[]>([]);
  // Tipo de servicio: catálogo de productos con respaldo en settings_services
  //    (misma resolución que el Overview).
  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [svcCatalog, setSvcCatalog] = useState<CatalogItem[]>([]);
  const services = useMemo(() => [...products, ...svcCatalog], [products, svcCatalog]);
  const [employees, setEmployees] = useState<SystemUser[]>([]);
  const [records, setRecords] = useState<QcRecordLite[]>([]);
  const [branding, setBranding] = useState<QCPdfBranding>({ name: 'Precise Cleaning' });
  const [loading, setLoading] = useState(true);

  const PERIOD_KEY = 'pc.qcdash.period';
  const [period, setPeriodState] = useState<PeriodState>(() => loadPeriod(PERIOD_KEY, 'week'));
  const setPeriod = (p: PeriodState) => { setPeriodState(p); savePeriod(PERIOD_KEY, p); };
  const range = useMemo(() => periodRange(period), [period]);

  const [tab, setTab] = useState<Tab>('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [inspectorFilter, setInspectorFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [openRow, setOpenRow] = useState<QcDashRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [shareReady, setShareReady] = useState<PreparedQCShare | null>(null);
  const [shareClient, setShareClient] = useState('');

  const canSeeOfficeNotes = isSuperAdmin
    || !!activeRole?.permissions?.find((p) => p.module === 'Office Notes')?.canView;
  const canInspect = isSuperAdmin
    || !!activeRole?.permissions?.find((p) => p.module === 'Quality Check')?.canEdit;

  useEffect(() => {
    const subs = [
      onSnapshot(collection(db, 'quality_checks'), (snap) => {
        setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as QcRecordLite));
        setLoading(false);
      }, (err) => { console.error('Error quality_checks:', err); setLoading(false); }),
      onSnapshot(collection(db, 'settings_statuses'), (snap) => setStatuses(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Status))),
      onSnapshot(collection(db, 'settings_teams'), (snap) => setTeams(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Team))),
      onSnapshot(collection(db, 'customers'), (snap) => setCustomers(snap.docs.map(mapCustomerDoc))),
      onSnapshot(collection(db, 'settings_places'), (snap) => setPlaces(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as QcPlace))),
      onSnapshot(collection(db, 'settings_tasks'), (snap) => setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as QcTask))),
      onSnapshot(collection(db, 'settings_products'), (snap) => setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CatalogItem))),
      onSnapshot(collection(db, 'settings_services'), (snap) => setSvcCatalog(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CatalogItem))),
      onSnapshot(collection(db, 'system_users'), (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SystemUser))),
    ];
    getDoc(doc(db, 'settings_company', 'main'))
      .then((s) => {
        if (!s.exists()) return;
        const d = s.data();
        setBranding({ name: d.name || 'Precise Cleaning', address: d.address || '', logo: d.logo || '', email: d.email || '' });
      })
      .catch(() => { /* branding por defecto */ });
    return () => subs.forEach((u) => u());
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

  return (
    <div className="fade-in qd-page">
      <header className="qd-header">
        <div className="qd-title-group">
          <button type="button" className="qd-iconbtn menu" aria-label="Open menu" onClick={onOpenMenu}>
            <Menu size={20} />
          </button>
          <div>
            <h1 className="qd-title">QC Dashboard</h1>
            <p className="qd-subtitle">Inspections, re-cleans and team scores</p>
          </div>
        </div>
        <label className="qd-search">
          <Search size={16} className="qd-search-icon" />
          <input
            type="text"
            className="qd-search-input"
            placeholder="Search client or address"
            aria-label="Search client or address"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </header>

      <PeriodBar
        period={period}
        onChange={setPeriod}
        extra={
          <div className="qd-filters">
            <label className="qd-filter">
              <span className="qd-lbl">Team</span>
              <select className="qd-select" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
                <option value="all">All teams</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="qd-filter">
              <span className="qd-lbl">Inspector</span>
              <select className="qd-select" value={inspectorFilter} onChange={(e) => setInspectorFilter(e.target.value)}>
                <option value="all">All</option>
                {inspectors.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
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
                className={`qd-chip${tab === t.id ? ' on' : ''}`}
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
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="qd-empty">Loading inspections…</td></tr>
                ) : tabRows.length === 0 ? (
                  <tr><td colSpan={10} className="qd-empty">No jobs here for this period.</td></tr>
                ) : tabRows.map((r) => {
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
                        ) : <span className="qd-muted italic">Unassigned</span>}
                      </td>
                      <td className="qd-muted-strong">{r.inspector || '—'}</td>
                      <td>
                        {r.score === null ? <span className="qd-muted">—</span> : (
                          <div className="qd-scorecell">
                            <span className="qd-bar">
                              <span
                                className={`qd-bar-fill ${r.score >= 85 ? 'good' : r.score >= 70 ? 'warn' : 'bad'}`}
                                style={{ '--w': `${r.score}%` } as CSSProperties}
                              />
                            </span>
                            <span className="qd-score">{r.score}</span>
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
            </table>
          </div>
        </section>

        <aside className="qd-side">
          <section className="qd-card qd-pad" aria-label="Team scorecard">
            <p className="qd-lbl">Team scorecard</p>
            {teamCards.length === 0 ? <p className="qd-muted">No inspections in this period.</p> : (
              <ul className="qd-teamlist">
                {teamCards.map((tc) => (
                  <li key={tc.name} className="qd-teamrow">
                    <span className="qd-team" style={{ '--team-color': tc.color } as CSSProperties}>{tc.name}</span>
                    <dl className="qd-teamstats">
                      <div><dd>{tc.avg ?? '—'}</dd><dt>avg</dt></div>
                      <div><dd>{tc.n ? `${Math.round((tc.pass / tc.n) * 100)}%` : '—'}</dd><dt>pass</dt></div>
                      <div><dd className="bad">{tc.re}</dd><dt>re-clean</dt></div>
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
