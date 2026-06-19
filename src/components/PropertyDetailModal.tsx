import { useState, useEffect } from 'react';
import {
  X, MapPin, CalendarDays, Clock, Wrench, Hash, Users, User, Activity,
  FileText, StickyNote, PenTool, ChevronDown, CheckCircle, Edit2, Image as ImageIcon
} from 'lucide-react';
import type { Property } from '../types/index';
import { db } from '../config/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { propertiesService } from '../services/propertiesService';
import { statusHistoryService } from '../services/statusHistoryService';
import StatusHistoryPanel from './StatusHistoryPanel';

interface PropertyDetailModalProps {
  property: Property | null;
  onClose: () => void;
  currentUser?: any;
  canEdit?: boolean;
  /** Si se pasa, muestra el botón "Edit Details" que llama a esta función. */
  onEdit?: (p: Property) => void;
  /** Notifica al padre cuando cambió el status (para sincronizar su lista). */
  onStatusChanged?: (propertyId: string, newStatusId: string) => void;
}

export default function PropertyDetailModal({ property, onClose, currentUser, canEdit = false, onEdit, onStatusChanged }: PropertyDetailModalProps) {
  const [house, setHouse] = useState<Property | null>(property);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [priorities, setPriorities] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [billed, setBilled] = useState<any[]>([]);
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [statusOpen, setStatusOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setHouse(property); }, [property]);

  useEffect(() => {
    if (!property) return;
    let active = true;
    (async () => {
      try {
        const [stS, tS, pS, svS, cS, uS] = await Promise.all([
          getDocs(collection(db, 'settings_statuses')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'settings_teams')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'settings_priorities')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'settings_services')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'customers')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'system_users')).catch(() => ({ docs: [] })),
        ]);
        if (!active) return;
        setStatuses(((stS as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => Number(a.order || 0) - Number(b.order || 0)));
        setTeams(((tS as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })));
        setPriorities(((pS as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })));
        setServices(((svS as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })));
        setCustomers(((cS as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })));
        setEmployees(((uS as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })));

        const [bS, paS] = await Promise.all([
          getDocs(query(collection(db, 'billing_services'), where('propertyId', '==', property.id))).catch(() => ({ docs: [] })),
          getDocs(query(collection(db, 'payroll'), where('propertyId', '==', property.id))).catch(() => ({ docs: [] })),
        ]);
        if (!active) return;
        setBilled(((bS as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })));
        setPayrolls(((paS as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error('PropertyDetailModal load error', e); }
    })();
    return () => { active = false; };
  }, [property]);

  if (!property || !house) return null;

  const rel = (list: any[], idOrName?: string | null, fb = '-') => {
    if (!idOrName) return fb;
    const safe = String(idOrName).toLowerCase().trim();
    const f = list.find(i => String(i.id).toLowerCase().trim() === safe || String(i.name).toLowerCase().trim() === safe);
    return f ? f.name : fb;
  };
  const relColor = (list: any[], idOrName?: string | null) => {
    if (!idOrName) return undefined;
    const safe = String(idOrName).toLowerCase().trim();
    return list.find(i => String(i.id).toLowerCase().trim() === safe || String(i.name).toLowerCase().trim() === safe)?.color;
  };
  const statusName = (idOrName?: string | null) => rel(statuses, idOrName, String(idOrName || '—'));
  const clientName = rel(customers, house.client, String(house.client || 'Unknown'));
  const statusObj = statuses.find(s => String(s.id).toLowerCase().trim() === String(house.statusId || '').toLowerCase().trim() || String(s.name).toLowerCase().trim() === String(house.statusId || '').toLowerCase().trim());

  const getPayrollTotal = (p: any) => (p.totalAmount != null && Number(p.totalAmount) !== 0) ? Number(p.totalAmount) : Number(p.baseAmount || 0) + Number(p.extraAmount || 0) - Number(p.discountAmount || 0);
  const totalBilled = billed.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const totalPayroll = payrolls.reduce((s, r) => s + getPayrollTotal(r), 0);
  const profit = totalBilled - totalPayroll;

  const fmtDT = (iso?: string | null) => {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return String(iso); }
  };

  const changeStatus = async (newId: string) => {
    setStatusOpen(false);
    if (!house || String(newId) === String(house.statusId)) return;
    setSaving(true);
    const prev = house.statusId;
    try {
      await propertiesService.update(house.id, { statusId: newId } as any);
      await statusHistoryService.log({
        propertyId: house.id,
        fromStatusId: prev || null,
        fromStatusName: statusName(prev) || null,
        toStatusId: newId,
        toStatusName: statusName(newId),
        changedBy: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown',
      });
      setHouse({ ...house, statusId: newId });
      setHistoryKey(k => k + 1);
      onStatusChanged?.(house.id, newId);
    } catch (e) { console.error(e); alert('No se pudo actualizar el status.'); }
    finally { setSaving(false); }
  };

  const st = {
    infoCard: { backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' as const },
    infoHeader: { backgroundColor: '#f8fafc', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#334155', fontSize: '0.8rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
    infoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f1f5f9' },
    infoLabel: { color: '#64748b', fontSize: '0.85rem', fontWeight: 600 },
    infoValue: { color: '#1e293b', fontSize: '0.9rem', fontWeight: 600, textAlign: 'right' as const, display: 'flex', alignItems: 'center', gap: '6px' },
    detailLabel: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: '#6b7280', fontWeight: 600 },
    detailValue: { fontSize: '1.05rem', color: '#111827', fontWeight: 500, marginTop: '4px', whiteSpace: 'pre-wrap' as const },
    noteBoxGray: { backgroundColor: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb', width: '100%' },
    noteBoxOrange: { backgroundColor: '#fff7ed', padding: '16px', borderRadius: '8px', border: '1px solid #ffedd5', width: '100%' },
    th: { padding: '10px 16px', textAlign: 'left' as const, fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc' },
    td: { padding: '12px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem', color: '#111827' },
  };

  const beforePhotos: string[] = (house as any).beforePhotos || [];
  const afterPhotos: string[] = (house as any).afterPhotos || [];

  return (
    <div className="pdm-overlay" onClick={onClose}>
      <style>{`
        .pdm-overlay { position: fixed; inset: 0; background-color: rgba(15,23,42,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px; box-sizing: border-box; }
        .pdm-modal { background-color: #fff; width: 100%; max-width: 1100px; border-radius: 14px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); display: flex; flex-direction: column; max-height: 92vh; }
        .pdm-body { padding: 24px 28px; overflow-y: auto; }
        .pdm-grid3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px,1fr)); gap: 18px; margin-bottom: 22px; }
        @media (max-width: 640px) { .pdm-body { padding: 16px; } }
      `}</style>
      <div className="pdm-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e5e7eb', flexShrink: 0, gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clientName}</h3>
            {(house as any).employeeFinishedBy && (
              <span style={{ backgroundColor: '#d1fae5', color: '#047857', padding: '4px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                <CheckCircle size={14} /> Finished
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Status selector (cambia + registra en historial) */}
            <div style={{ position: 'relative' }}>
              <div
                onClick={() => { if (canEdit && !saving) setStatusOpen(o => !o); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '7px 14px', borderRadius: '20px', border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', fontWeight: 600, color: '#111827', cursor: canEdit ? (saving ? 'wait' : 'pointer') : 'default', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusObj?.color || '#64748b' }} />
                {statusObj?.name || 'Unassigned'}
                {canEdit && <ChevronDown size={14} color="#9ca3af" style={{ transform: statusOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
              </div>
              {statusOpen && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.12)', zIndex: 5, minWidth: '200px', overflow: 'hidden' }}>
                  {statuses.map(s => (
                    <div key={s.id} onClick={() => changeStatus(s.id)}
                      style={{ padding: '11px 14px', fontSize: '0.85rem', color: '#111827', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: (house.statusId === s.id || house.statusId === s.name) ? '#f8fafc' : 'transparent' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                      onMouseLeave={e => e.currentTarget.style.background = (house.statusId === s.id || house.statusId === s.name) ? '#f8fafc' : 'transparent'}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color }} /> {s.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {onEdit && canEdit && (
              <button onClick={() => { const p = house; onClose(); if (p) onEdit(p as Property); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '7px 14px', borderRadius: '8px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                <Edit2 size={15} /> Edit
              </button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px', display: 'flex' }}><X size={24} /></button>
          </div>
        </header>

        <div className="pdm-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '1rem', fontWeight: 500, paddingBottom: '16px' }}>
            <MapPin size={18} color="#3b82f6" /> {house.address || '-'}
          </div>

          {/* Info cards */}
          <div className="pdm-grid3">
            <div style={st.infoCard}>
              <div style={st.infoHeader}><CalendarDays size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '6px' }} /> Schedule & Timing</div>
              <div style={st.infoRow}><span style={st.infoLabel}>Receive Date</span><span style={st.infoValue}>{house.receiveDate || '-'}</span></div>
              <div style={st.infoRow}><span style={st.infoLabel}>Schedule Date</span><span style={st.infoValue}>{house.scheduleDate || '-'}</span></div>
              <div style={st.infoRow}><span style={st.infoLabel}>Time In</span><span style={st.infoValue}><Clock size={12} color="#94a3b8" /> {house.timeIn || '-'}</span></div>
              <div style={{ ...st.infoRow, borderBottom: 'none' }}><span style={st.infoLabel}>Time Out</span><span style={st.infoValue}><Clock size={12} color="#94a3b8" /> {house.timeOut || '-'}</span></div>
            </div>

            <div style={st.infoCard}>
              <div style={st.infoHeader}><Wrench size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '6px' }} /> Job Specifications</div>
              <div style={st.infoRow}><span style={st.infoLabel}>Service</span><span style={st.infoValue}>{rel(services, house.serviceId)}</span></div>
              <div style={st.infoRow}><span style={st.infoLabel}>Priority</span><span style={st.infoValue}>{relColor(priorities, house.priorityId) && <span style={{ background: relColor(priorities, house.priorityId), width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block' }} />}{rel(priorities, house.priorityId)}</span></div>
              <div style={st.infoRow}><span style={st.infoLabel}>Rooms</span><span style={st.infoValue}><Hash size={12} color="#94a3b8" /> {house.rooms || '-'}</span></div>
              <div style={{ ...st.infoRow, borderBottom: 'none' }}><span style={st.infoLabel}>Bathrooms</span><span style={st.infoValue}><Hash size={12} color="#94a3b8" /> {house.bathrooms || '-'}</span></div>
            </div>

            <div style={st.infoCard}>
              <div style={st.infoHeader}><Activity size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '6px' }} /> Status & Assignment</div>
              <div style={st.infoRow}><span style={st.infoLabel}>Job Status</span><span style={st.infoValue}><span style={{ width: '10px', height: '10px', borderRadius: '50%', background: statusObj?.color || '#64748b', display: 'inline-block' }} />{statusObj?.name || '-'}</span></div>
              <div style={st.infoRow}><span style={st.infoLabel}>Invoice Status</span><span style={{ ...st.infoValue, color: '#475569', backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>{house.invoiceStatus || '-'}</span></div>
              <div style={{ ...st.infoRow, borderBottom: 'none' }}><span style={st.infoLabel}>Team</span><span style={st.infoValue}>{relColor(teams, house.teamId) && <span style={{ background: relColor(teams, house.teamId), width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block' }} />}{rel(teams, house.teamId, 'Unassigned')}</span></div>
            </div>
          </div>

          {/* Workers + Work log */}
          <div className="pdm-grid3">
            <div style={{ ...st.noteBoxGray }}>
              <span style={st.detailLabel}><User size={14} /> ASSIGNED WORKERS</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                {!(house.assignedWorkers && house.assignedWorkers.length > 0) ? (
                  <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>No workers assigned.</span>
                ) : house.assignedWorkers.map(wid => {
                  const emp = employees.find(e => e.id === wid);
                  if (!emp) return null;
                  return <div key={wid} style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}><User size={12} color="#64748b" /> {emp.firstName} {emp.lastName}</div>;
                })}
              </div>
            </div>

            <div>
              <span style={st.detailLabel}><Activity size={14} /> WORK LOG</span>
              <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={st.th}>Event</th><th style={st.th}>Employee</th><th style={{ ...st.th, textAlign: 'right' }}>Time</th></tr></thead>
                  <tbody>
                    {(!(house as any).employeeStartedBy && !(house as any).employeeFinishedBy) && (
                      <tr><td colSpan={3} style={{ ...st.td, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>No activity logged yet.</td></tr>
                    )}
                    {(house as any).employeeStartedBy && (
                      <tr><td style={{ ...st.td, fontWeight: 600, color: '#3b82f6' }}>Job Started</td><td style={st.td}>{String((house as any).employeeStartedBy).split(' ')[0]}</td><td style={{ ...st.td, color: '#64748b', fontSize: '0.8rem', textAlign: 'right' }}>{fmtDT((house as any).employeeStartedAt)}</td></tr>
                    )}
                    {(house as any).employeeFinishedBy && (
                      <tr><td style={{ ...st.td, fontWeight: 600, color: '#10b981' }}>Job Finished</td><td style={st.td}>{String((house as any).employeeFinishedBy).split(' ')[0]}</td><td style={{ ...st.td, color: '#64748b', fontSize: '0.8rem', textAlign: 'right' }}>{fmtDT((house as any).employeeFinishedAt)}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.72rem', color: '#1e40af', fontWeight: 700, textTransform: 'uppercase' }}>Total Billed</div>
                <div style={{ fontSize: '1.3rem', color: '#1e3a8a', fontWeight: 800 }}>${totalBilled.toFixed(2)}</div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', color: '#991b1b', fontWeight: 700, textTransform: 'uppercase' }}>Payroll</div>
                  <div style={{ fontSize: '1.05rem', color: '#7f1d1d', fontWeight: 800 }}>${totalPayroll.toFixed(2)}</div>
                </div>
                <div style={{ flex: 1, background: profit >= 0 ? '#ecfdf5' : '#fef2f2', border: `1px solid ${profit >= 0 ? '#a7f3d0' : '#fecaca'}`, borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', color: profit >= 0 ? '#065f46' : '#991b1b', fontWeight: 700, textTransform: 'uppercase' }}>Profit</div>
                  <div style={{ fontSize: '1.05rem', color: profit >= 0 ? '#047857' : '#7f1d1d', fontWeight: 800 }}>${profit.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Billed services + Payments */}
          {(billed.length > 0 || payrolls.length > 0) && (
            <div className="pdm-grid3">
              {billed.length > 0 && (
                <div>
                  <span style={st.detailLabel}><FileText size={14} /> BILLED SERVICES</span>
                  <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '10px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr><th style={st.th}>Service</th><th style={{ ...st.th, textAlign: 'center' }}>Qty</th><th style={{ ...st.th, textAlign: 'right' }}>Total</th></tr></thead>
                      <tbody>
                        {billed.map(r => (
                          <tr key={r.id}><td style={{ ...st.td, fontWeight: 600 }}>{rel(services, r.serviceId, 'Unknown')}</td><td style={{ ...st.td, textAlign: 'center' }}>{r.quantity}</td><td style={{ ...st.td, textAlign: 'right', fontWeight: 700 }}>${Number(r.total || 0).toFixed(2)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {payrolls.length > 0 && (
                <div>
                  <span style={st.detailLabel}><Users size={14} /> PAYMENTS</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                    {payrolls.map(r => {
                      const emp = employees.find(e => e.id === r.employeeId);
                      return (
                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                          <div><div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>{emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown'}</div><div style={{ fontSize: '0.72rem', color: '#64748b' }}>{r.date}</div></div>
                          <div style={{ fontWeight: 800, color: '#10b981' }}>${getPayrollTotal(r).toFixed(2)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="pdm-grid3">
            <div style={st.noteBoxGray}><span style={st.detailLabel}><StickyNote size={14} /> GENERAL NOTE</span><p style={{ ...st.detailValue, fontSize: '0.95rem', marginTop: '8px' }}>{house.note || 'No notes.'}</p></div>
            <div style={st.noteBoxOrange}><span style={{ ...st.detailLabel, color: '#c2410c' }}><PenTool size={14} /> EMPLOYEE'S NOTE</span><p style={{ ...st.detailValue, color: '#9a3412', fontSize: '0.95rem', marginTop: '8px' }}>{house.employeeNote || 'No employee notes.'}</p></div>
          </div>

          {/* Photos (solo lectura) */}
          {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
            <div className="pdm-grid3">
              {[{ label: 'Before', list: beforePhotos }, { label: 'After', list: afterPhotos }].filter(b => b.list.length > 0).map(block => (
                <div key={block.label}>
                  <span style={st.detailLabel}><ImageIcon size={14} /> {block.label.toUpperCase()} PHOTOS ({block.list.length})</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px,1fr))', gap: '8px', marginTop: '10px' }}>
                    {block.list.map((u, i) => (
                      <a key={i} href={u} target="_blank" rel="noreferrer" style={{ display: 'block', aspectRatio: '1/1', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                        <img src={u} alt={`${block.label} ${i + 1}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Historial de status (lo mismo que aparece en Status History) */}
          <div style={{ marginTop: '8px' }}>
            <StatusHistoryPanel propertyId={house.id} statuses={statuses as any} refreshKey={historyKey} />
          </div>
        </div>
      </div>
    </div>
  );
}