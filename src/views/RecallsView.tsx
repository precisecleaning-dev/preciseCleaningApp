import { useState, useEffect, useMemo } from 'react';
import {
  Repeat, AlertTriangle, Trophy, Award, Users, MapPin, CalendarDays,
  Search, X, TrendingUp, BarChart3, Loader2
} from 'lucide-react';
import type { Property, SystemUser } from '../types/index';
import { settingsService } from '../services/settingsService';
import { db } from '../config/firebase';
import { collection, getDocs } from 'firebase/firestore';

/* =========================================================================
   CONFIG / HEURÍSTICAS  (ajusta a tu modelo de datos si los nombres difieren)
   - RECALL_PENALTY_PER: puntos que se restan al rendimiento por cada recall.
   - RECALL_STATUS_HINTS: textos que, si aparecen en el estado/tipo de una casa,
     la marcan como recall.
   También se detectan recalls por: isRecall / recall / hasRecall / recalled === true,
   recallCount > 0, y/o documentos en la colección "recalls".
   ========================================================================= */
const RECALL_PENALTY_PER = 6;
const RECALL_STATUS_HINTS = ['recall', 're-call', 're call', 'recleaning', 're-clean', 'callback', 'call back'];

interface RecallItem {
  id: string;
  houseId?: string;
  client: string;
  address: string;
  team: string;
  date: string;
  reason: string;
  source: 'property' | 'collection';
}

interface TeamStat {
  team: string;
  recalls: number;
  qcCount: number;
  avgPass: number | null; // promedio de pass rate de QC (0-100) o null si no hay QC
  overall: number;        // rendimiento general (0-100)
}

interface RecallsViewProps {
  onOpenMenu: () => void;
  properties: Property[];
  currentUser?: SystemUser | null;
}

export default function RecallsView({ onOpenMenu, properties }: RecallsViewProps) {
  const [teams, setTeams] = useState<any[]>([]);
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [qcList, setQcList] = useState<any[]>([]);
  const [recallDocs, setRecallDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('All');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [teamsData, customersSnap, qcSnap, recallsSnap] = await Promise.all([
          settingsService.getAll('settings_teams').catch(() => []),
          getDocs(collection(db, 'customers')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'quality_checks')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'recalls')).catch(() => ({ docs: [] })),
        ]);
        setTeams(teamsData as any[]);
        setCustomersList(((customersSnap as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })));
        setQcList(((qcSnap as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })));
        setRecallDocs(((recallsSnap as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('Error loading recalls data:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ---- Helpers ----
  const getClientName = (idOrName?: string | null): string => {
    if (!idOrName) return 'Unknown';
    const safe = String(idOrName).toLowerCase().trim();
    const f = customersList.find((c: any) => String(c.id).toLowerCase().trim() === safe || String(c.name).toLowerCase().trim() === safe);
    return f ? f.name : String(idOrName);
  };

  const getTeamName = (house?: any): string => {
    if (!house) return 'Unassigned';
    const tid = house.teamId;
    if (tid) {
      const f = teams.find((t: any) => String(t.id) === String(tid) || String(t.name) === String(tid));
      if (f) return f.name;
    }
    if (house.team) {
      const f2 = teams.find((t: any) => String(t.name) === String(house.team) || String(t.id) === String(house.team));
      return f2 ? f2.name : String(house.team);
    }
    return 'Unassigned';
  };

  const formatDate = (d?: string) => {
    if (!d) return '-';
    const parts = String(d).split('T')[0].split('-');
    if (parts.length === 3) { const [y, m, dd] = parts; return `${m.padStart(2, '0')}/${dd.padStart(2, '0')}/${y}`; }
    return String(d);
  };

  const isRecallProperty = (p: any): boolean => {
    if (!p) return false;
    if (p.isRecall === true || p.recall === true || p.hasRecall === true || p.recalled === true) return true;
    if (typeof p.recallCount === 'number' && p.recallCount > 0) return true;
    const text = [p.status, p.stage, p.pipelineStatus, p.jobStatus, p.type, p.serviceType]
      .filter(Boolean).map((x: any) => String(x).toLowerCase()).join(' ');
    return RECALL_STATUS_HINTS.some(h => text.includes(h));
  };

  // ---- Lista unificada de recalls (casas marcadas + colección recalls) ----
  const recalls: RecallItem[] = useMemo(() => {
    const items: RecallItem[] = [];
    (properties || []).forEach((p: any) => {
      if (isRecallProperty(p)) {
        items.push({
          id: `prop-${p.id}`,
          houseId: p.id,
          client: getClientName(p.client),
          address: p.address || '-',
          team: getTeamName(p),
          date: p.recallDate || p.scheduleDate || p.date || p.updatedAt || '',
          reason: p.recallReason || (p.status ? String(p.status) : 'Recall'),
          source: 'property',
        });
      }
    });
    recallDocs.forEach((r: any) => {
      const house = (properties || []).find((p: any) => p.id === r.houseId);
      items.push({
        id: `rec-${r.id}`,
        houseId: r.houseId,
        client: getClientName(r.client || (house as any)?.client),
        address: r.address || (house as any)?.address || '-',
        team: r.team || getTeamName(house),
        date: r.date || r.recallDate || r.createdAt || '',
        reason: r.reason || r.notes || 'Recall',
        source: 'collection',
      });
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, recallDocs, customersList, teams]);

  // ---- Pass rate de un QC a partir de su qcData ----
  const qcPassRate = (qcData: any): { pass: number; total: number } => {
    let yes = 0, no = 0;
    if (qcData) {
      Object.keys(qcData).forEach(pid => {
        const d = qcData[pid];
        if (!d || !d.tasks) return;
        Object.values(d.tasks).forEach((v: any) => { if (v === 'Yes') yes++; else if (v === 'No') no++; });
      });
    }
    return { pass: yes, total: yes + no };
  };

  // ---- Estadísticas por equipo ----
  const teamStats: TeamStat[] = useMemo(() => {
    const map: Record<string, { recalls: number; qcPassSum: number; qcCount: number }> = {};
    const ensure = (t: string) => { if (!map[t]) map[t] = { recalls: 0, qcPassSum: 0, qcCount: 0 }; return map[t]; };

    teams.forEach((t: any) => ensure(t.name));
    recalls.forEach(r => { ensure(r.team).recalls++; });

    qcList.forEach((qc: any) => {
      const house = (properties || []).find((p: any) => p.id === qc.houseId);
      const team = qc.team || getTeamName(house);
      const { pass, total } = qcPassRate(qc.qcData);
      if (total > 0) { const e = ensure(team); e.qcPassSum += (pass / total) * 100; e.qcCount++; }
      else { ensure(team); }
    });

    return Object.keys(map).map(team => {
      const m = map[team];
      const avgPass = m.qcCount > 0 ? Math.round(m.qcPassSum / m.qcCount) : null;
      const base = avgPass != null ? avgPass : 100; // sin QC asumimos base 100 y solo penalizan los recalls
      const overall = Math.max(0, Math.round(base - m.recalls * RECALL_PENALTY_PER));
      return { team, recalls: m.recalls, qcCount: m.qcCount, avgPass, overall };
    }).filter(s => s.recalls > 0 || s.qcCount > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recalls, qcList, teams, properties]);

  const ranked = useMemo(() => [...teamStats].sort((a, b) => b.overall - a.overall || a.recalls - b.recalls), [teamStats]);
  const byRecalls = useMemo(() => [...teamStats].sort((a, b) => b.recalls - a.recalls), [teamStats]);

  const bestTeam = ranked[0] || null;
  const mostRecallsTeam = byRecalls[0] && byRecalls[0].recalls > 0 ? byRecalls[0] : null;
  const totalRecalls = recalls.length;
  const teamsWithRecalls = teamStats.filter(s => s.recalls > 0).length;
  const maxRecallBar = Math.max(1, ...byRecalls.map(s => s.recalls));

  // ---- Filtro de la lista ----
  const teamOptions = useMemo(() => ['All', ...Array.from(new Set(recalls.map(r => r.team)))], [recalls]);
  const filteredRecalls = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recalls.filter(r => {
      if (teamFilter !== 'All' && r.team !== teamFilter) return false;
      if (!q) return true;
      return [r.client, r.address, r.team, r.reason, formatDate(r.date)].filter(Boolean).join(' ').toLowerCase().includes(q);
    }).sort((a, b) => (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recalls, search, teamFilter]);

  // ---- Color del score ----
  const scoreColor = (v: number) => v >= 85 ? '#047857' : v >= 70 ? '#b45309' : '#b91c1c';
  const scoreBg = (v: number) => v >= 85 ? '#ecfdf5' : v >= 70 ? '#fffbeb' : '#fef2f2';

  const s = {
    th: { backgroundColor: '#f9fafb', padding: '12px 16px', color: '#6b7280', fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb', textAlign: 'left' as const },
    td: { padding: '12px 16px', borderBottom: '1px solid #f1f5f9', color: '#111827', fontSize: '0.92rem' },
  };

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <style>{`
        .rc-spin { animation: rc-spin 1s linear infinite; }
        @keyframes rc-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .rc-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
        .rc-highlights { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px; }
        .rc-cols { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 16px; margin-bottom: 24px; align-items: start; }
        .rc-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .rc-bar-track { flex: 1; height: 10px; background: #f1f5f9; border-radius: 6px; overflow: hidden; }
        .rc-table-search { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #e5e7eb; border-radius: 20px; padding: 0 16px; height: 42px; flex: 1; min-width: 240px; }
        .rc-table-search input { flex: 1; border: none; outline: none; background: transparent; color: #111827; font-size: 0.9rem; }
        .rc-select { height: 42px; border: 1px solid #e5e7eb; border-radius: 20px; padding: 0 14px; background: #fff; color: #374151; font-size: 0.9rem; cursor: pointer; outline: none; }
        @media (max-width: 900px) {
          .rc-kpis { grid-template-columns: repeat(2, 1fr); }
          .rc-highlights { grid-template-columns: 1fr; }
          .rc-cols { grid-template-columns: 1fr; }
        }
        @media (max-width: 560px) {
          .rc-kpis { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* HEADER */}
      <header className="main-header" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="hamburger-btn" onClick={onOpenMenu} aria-label="Open menu" style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div>
            <h1 style={{ margin: 0, color: '#111827', fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Repeat size={26} color="#7c3aed" /> Recalls
            </h1>
            <p style={{ marginTop: '4px', color: '#6b7280' }}>Re-cleaning callbacks and team performance ranking</p>
          </div>
        </div>
      </header>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <Loader2 size={20} className="rc-spin" /> Loading recall data...
        </div>
      ) : (
        <>
          {/* HIGHLIGHTS: mejor equipo / más recalls */}
          <div className="rc-highlights">
            <div className="rc-card" style={{ padding: '20px', background: 'linear-gradient(135deg, #ecfdf5, #ffffff)', borderColor: '#a7f3d0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#047857', fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Trophy size={16} /> Best Performing Team
              </div>
              {bestTeam ? (
                <>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#065f46', marginTop: '8px' }}>{bestTeam.team}</div>
                  <div style={{ display: 'flex', gap: '18px', marginTop: '10px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '0.85rem', color: '#475569' }}>Score: <strong style={{ color: '#047857' }}>{bestTeam.overall}</strong></div>
                    <div style={{ fontSize: '0.85rem', color: '#475569' }}>QC: <strong>{bestTeam.avgPass != null ? bestTeam.avgPass + '%' : '—'}</strong></div>
                    <div style={{ fontSize: '0.85rem', color: '#475569' }}>Recalls: <strong>{bestTeam.recalls}</strong></div>
                  </div>
                </>
              ) : <div style={{ color: '#94a3b8', marginTop: '10px' }}>No data yet.</div>}
            </div>

            <div className="rc-card" style={{ padding: '20px', background: 'linear-gradient(135deg, #fef2f2, #ffffff)', borderColor: '#fecaca' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b91c1c', fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <AlertTriangle size={16} /> Most Recalls
              </div>
              {mostRecallsTeam ? (
                <>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#991b1b', marginTop: '8px' }}>{mostRecallsTeam.team}</div>
                  <div style={{ display: 'flex', gap: '18px', marginTop: '10px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '0.85rem', color: '#475569' }}>Recalls: <strong style={{ color: '#b91c1c' }}>{mostRecallsTeam.recalls}</strong></div>
                    <div style={{ fontSize: '0.85rem', color: '#475569' }}>QC: <strong>{mostRecallsTeam.avgPass != null ? mostRecallsTeam.avgPass + '%' : '—'}</strong></div>
                    <div style={{ fontSize: '0.85rem', color: '#475569' }}>Score: <strong>{mostRecallsTeam.overall}</strong></div>
                  </div>
                </>
              ) : <div style={{ color: '#94a3b8', marginTop: '10px' }}>No recalls recorded.</div>}
            </div>
          </div>

          {/* KPIs */}
          <div className="rc-kpis">
            {[
              { label: 'Total Recalls', value: totalRecalls, color: '#7c3aed', Icon: Repeat },
              { label: 'Teams w/ Recalls', value: teamsWithRecalls, color: '#b91c1c', Icon: Users },
              { label: 'Teams Tracked', value: teamStats.length, color: '#2563eb', Icon: BarChart3 },
              { label: 'Avg. Team Score', value: teamStats.length ? Math.round(teamStats.reduce((a, b) => a + b.overall, 0) / teamStats.length) : '—', color: '#047857', Icon: TrendingUp },
            ].map((k, i) => (
              <div key={i} className="rc-card" style={{ padding: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
                  <k.Icon size={18} color={k.color} />
                </div>
                <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#0f172a', marginTop: '6px' }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* RANKING + BAR CHART */}
          <div className="rc-cols">
            {/* Ranking de rendimiento */}
            <div className="rc-card" style={{ padding: '20px' }}>
              <h2 style={{ margin: '0 0 4px', fontSize: '1.1rem', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Award size={18} color="#2563eb" /> Team Performance Ranking
              </h2>
              <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#94a3b8' }}>Higher Quality Check, fewer recalls = better score.</p>
              {ranked.length === 0 ? (
                <div style={{ color: '#94a3b8', padding: '20px', textAlign: 'center' }}>No team data available.</div>
              ) : ranked.map((t, i) => (
                <div key={t.team} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: i < ranked.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem', background: i === 0 ? '#fef9c3' : '#f1f5f9', color: i === 0 ? '#a16207' : '#64748b', border: i === 0 ? '1px solid #fde68a' : '1px solid #e5e7eb' }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.team}</span>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: scoreColor(t.overall) }}>{t.overall}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                      <div className="rc-bar-track">
                        <div style={{ width: `${t.overall}%`, height: '100%', background: scoreColor(t.overall), borderRadius: '6px' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '14px', marginTop: '6px', fontSize: '0.74rem', color: '#64748b' }}>
                      <span>QC {t.avgPass != null ? t.avgPass + '%' : '—'}</span>
                      <span style={{ color: t.recalls > 0 ? '#b91c1c' : '#64748b' }}>{t.recalls} recall{t.recalls === 1 ? '' : 's'}</span>
                      <span>{t.qcCount} QC{t.qcCount === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Recalls por equipo */}
            <div className="rc-card" style={{ padding: '20px' }}>
              <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} color="#b91c1c" /> Recalls by Team
              </h2>
              {byRecalls.filter(t => t.recalls > 0).length === 0 ? (
                <div style={{ color: '#94a3b8', padding: '20px', textAlign: 'center' }}>No recalls recorded.</div>
              ) : byRecalls.filter(t => t.recalls > 0).map((t) => (
                <div key={t.team} style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                    <span style={{ color: '#334155', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.team}</span>
                    <span style={{ color: '#b91c1c', fontWeight: 800 }}>{t.recalls}</span>
                  </div>
                  <div className="rc-bar-track">
                    <div style={{ width: `${(t.recalls / maxRecallBar) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #f87171, #dc2626)', borderRadius: '6px' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* LISTA DE RECALLS */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
            <div className="rc-table-search">
              <Search size={16} color="#9ca3af" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente, dirección, equipo, motivo..." />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Limpiar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}>
                  <X size={16} />
                </button>
              )}
            </div>
            <select className="rc-select" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
              {teamOptions.map(t => <option key={t} value={t}>{t === 'All' ? 'All teams' : t}</option>)}
            </select>
          </div>

          <div className="rc-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '760px' }}>
                <thead>
                  <tr>
                    <th style={{ ...s.th, width: '120px' }}><CalendarDays size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} /> Date</th>
                    <th style={s.th}><Users size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} /> Client</th>
                    <th style={s.th}><MapPin size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} /> Address</th>
                    <th style={s.th}>Team</th>
                    <th style={s.th}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecalls.length === 0 ? (
                    <tr><td colSpan={5} style={{ ...s.td, textAlign: 'center', color: '#6b7280', fontStyle: 'italic', padding: '30px' }}>No recalls found.</td></tr>
                  ) : filteredRecalls.map((r) => (
                    <tr key={r.id} style={{ transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                      <td style={s.td}>{formatDate(r.date)}</td>
                      <td style={{ ...s.td, fontWeight: 600 }}>{r.client}</td>
                      <td style={{ ...s.td, color: '#6b7280' }}>{r.address}</td>
                      <td style={s.td}>
                        <span style={{ backgroundColor: '#ede9fe', color: '#6d28d9', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.team}</span>
                      </td>
                      <td style={{ ...s.td, color: '#475569' }}>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p style={{ marginTop: '14px', fontSize: '0.78rem', color: '#94a3b8' }}>
            Score = Quality Check pass rate − ({RECALL_PENALTY_PER} × recalls). Recalls are detected from job status/flags and the optional “recalls” collection.
          </p>
        </>
      )}
    </div>
  );
}