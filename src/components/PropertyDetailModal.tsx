import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import {
  X, MapPin, CalendarDays, Clock, Wrench, Hash, Users, User, Activity,
  FileText, StickyNote, PenTool, ChevronDown, CheckCircle, Edit2, Image as ImageIcon
} from 'lucide-react';
import type { Property, Status, Team, Priority, Service, Customer, SystemUser, PayrollRecord } from '../types/index';
import { db } from '../config/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { propertiesService } from '../services/propertiesService';
import { statusHistoryService } from '../services/statusHistoryService';
import { getRelationName, getRelationColor } from '../utils/relations';
import StatusHistoryPanel from './StatusHistoryPanel';
import './PropertyDetailModal.css';

// El documento de `billing_services` no tiene un tipo compartido en types/index.ts todavía.
interface BilledService {
  id: string;
  serviceId?: string;
  quantity?: number;
  total?: number;
}

interface PropertyDetailModalProps {
  property: Property | null;
  onClose: () => void;
  currentUser?: SystemUser | null;
  canEdit?: boolean;
  /** Si se pasa, muestra el botón "Edit Details" que llama a esta función. */
  onEdit?: (p: Property) => void;
  /** Notifica al padre cuando cambió el status (para sincronizar su lista). */
  onStatusChanged?: (propertyId: string, newStatusId: string) => void;
}

export default function PropertyDetailModal({ property, onClose, currentUser, canEdit = false, onEdit, onStatusChanged }: PropertyDetailModalProps) {
  const [house, setHouse] = useState<Property | null>(property);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<SystemUser[]>([]);
  const [billed, setBilled] = useState<BilledService[]>([]);
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
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
          getDocs(collection(db, 'settings_statuses')).catch(() => null),
          getDocs(collection(db, 'settings_teams')).catch(() => null),
          getDocs(collection(db, 'settings_priorities')).catch(() => null),
          getDocs(collection(db, 'settings_services')).catch(() => null),
          getDocs(collection(db, 'customers')).catch(() => null),
          getDocs(collection(db, 'system_users')).catch(() => null),
        ]);
        if (!active) return;
        setStatuses((stS?.docs || []).map(d => ({ id: d.id, ...d.data() } as Status)).sort((a, b) => Number(a.order || 0) - Number(b.order || 0)));
        setTeams((tS?.docs || []).map(d => ({ id: d.id, ...d.data() } as Team)));
        setPriorities((pS?.docs || []).map(d => ({ id: d.id, ...d.data() } as Priority)));
        setServices((svS?.docs || []).map(d => ({ id: d.id, ...d.data() } as Service)));
        setCustomers((cS?.docs || []).map(d => ({ id: d.id, ...d.data() } as Customer)));
        setEmployees((uS?.docs || []).map(d => ({ id: d.id, ...d.data() } as SystemUser)));

        const [bS, paS] = await Promise.all([
          getDocs(query(collection(db, 'billing_services'), where('propertyId', '==', property.id))).catch(() => null),
          getDocs(query(collection(db, 'payroll'), where('propertyId', '==', property.id))).catch(() => null),
        ]);
        if (!active) return;
        setBilled((bS?.docs || []).map(d => ({ id: d.id, ...d.data() } as BilledService)));
        setPayrolls((paS?.docs || []).map(d => ({ id: d.id, ...d.data() } as PayrollRecord)));
      } catch (e) { console.error('PropertyDetailModal load error', e); }
    })();
    return () => { active = false; };
  }, [property]);

  if (!property || !house) return null;

  const statusName = (idOrName?: string | null) => getRelationName(statuses, idOrName, String(idOrName || '—'));
  const clientName = getRelationName(customers, house.client, String(house.client || 'Unknown'));
  const statusObj = statuses.find(s => String(s.id).toLowerCase().trim() === String(house.statusId || '').toLowerCase().trim() || String(s.name).toLowerCase().trim() === String(house.statusId || '').toLowerCase().trim());

  const getPayrollTotal = (p: PayrollRecord) => (p.totalAmount != null && Number(p.totalAmount) !== 0) ? Number(p.totalAmount) : Number(p.baseAmount || 0) + Number(p.extraAmount || 0) - Number(p.discountAmount || 0);
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
      await propertiesService.update(house.id, { statusId: newId });
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

  const beforePhotos: string[] = house.beforePhotos || [];
  const afterPhotos: string[] = house.afterPhotos || [];

  return (
    <div className="pdm-overlay" onClick={onClose}>
      <div className="pdm-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <header className="pdm-header">
          <div className="pdm-header-title-group">
            <h3 className="pdm-title">{clientName}</h3>
            {house.employeeFinishedBy && (
              <span className="pdm-badge-finished">
                <CheckCircle size={14} /> Finished
              </span>
            )}
          </div>
          <div className="pdm-header-actions">
            {/* Status selector (cambia + registra en historial) */}
            <div className="pdm-status-wrap">
              <div
                onClick={() => { if (canEdit && !saving) setStatusOpen(o => !o); }}
                className={`pdm-status-trigger${canEdit ? (saving ? ' saving' : ' editable') : ''}`}
              >
                <span className="pdm-dot-8" style={{ '--dot-color': statusObj?.color || '#64748b' } as CSSProperties} />
                {statusObj?.name || 'Unassigned'}
                {canEdit && <ChevronDown size={14} color="#9ca3af" className={`pdm-chevron${statusOpen ? ' open' : ''}`} />}
              </div>
              {statusOpen && (
                <div className="pdm-status-dropdown">
                  {statuses.map(s => (
                    <div key={s.id} onClick={() => changeStatus(s.id)}
                      className={`pdm-status-option${(house.statusId === s.id || house.statusId === s.name) ? ' active' : ''}`}>
                      <span className="pdm-dot-8" style={{ '--dot-color': s.color } as CSSProperties} /> {s.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {onEdit && canEdit && (
              <button onClick={() => { const p = house; onClose(); if (p) onEdit(p as Property); }} className="pdm-btn-edit">
                <Edit2 size={15} /> Edit
              </button>
            )}
            <button onClick={onClose} className="pdm-close-btn"><X size={24} /></button>
          </div>
        </header>

        <div className="pdm-body">
          <div className="pdm-address-row">
            <MapPin size={18} color="#3b82f6" /> {house.address || '-'}
          </div>

          {/* Info cards */}
          <div className="pdm-grid3">
            <div className="pdm-info-card">
              <div className="pdm-info-header"><CalendarDays size={14} className="pdm-header-icon" /> Schedule & Timing</div>
              <div className="pdm-info-row"><span className="pdm-info-label">Receive Date</span><span className="pdm-info-value">{house.receiveDate || '-'}</span></div>
              <div className="pdm-info-row"><span className="pdm-info-label">Schedule Date</span><span className="pdm-info-value">{house.scheduleDate || '-'}</span></div>
              <div className="pdm-info-row"><span className="pdm-info-label">Time In</span><span className="pdm-info-value"><Clock size={12} color="#94a3b8" /> {house.timeIn || '-'}</span></div>
              <div className="pdm-info-row no-border"><span className="pdm-info-label">Time Out</span><span className="pdm-info-value"><Clock size={12} color="#94a3b8" /> {house.timeOut || '-'}</span></div>
            </div>

            <div className="pdm-info-card">
              <div className="pdm-info-header"><Wrench size={14} className="pdm-header-icon" /> Job Specifications</div>
              <div className="pdm-info-row"><span className="pdm-info-label">Service</span><span className="pdm-info-value">{getRelationName(services, house.serviceId)}</span></div>
              <div className="pdm-info-row"><span className="pdm-info-label">Priority</span><span className="pdm-info-value">{getRelationColor(priorities, house.priorityId) && <span className="pdm-dot-10" style={{ '--dot-color': getRelationColor(priorities, house.priorityId) } as CSSProperties} />}{getRelationName(priorities, house.priorityId)}</span></div>
              <div className="pdm-info-row"><span className="pdm-info-label">Rooms</span><span className="pdm-info-value"><Hash size={12} color="#94a3b8" /> {house.rooms || '-'}</span></div>
              <div className="pdm-info-row no-border"><span className="pdm-info-label">Bathrooms</span><span className="pdm-info-value"><Hash size={12} color="#94a3b8" /> {house.bathrooms || '-'}</span></div>
            </div>

            <div className="pdm-info-card">
              <div className="pdm-info-header"><Activity size={14} className="pdm-header-icon" /> Status & Assignment</div>
              <div className="pdm-info-row"><span className="pdm-info-label">Job Status</span><span className="pdm-info-value"><span className="pdm-dot-10" style={{ '--dot-color': statusObj?.color || '#64748b' } as CSSProperties} />{statusObj?.name || '-'}</span></div>
              <div className="pdm-info-row"><span className="pdm-info-label">Invoice Status</span><span className="pdm-info-value pdm-invoice-badge">{house.invoiceStatus || '-'}</span></div>
              <div className="pdm-info-row no-border"><span className="pdm-info-label">Team</span><span className="pdm-info-value">{getRelationColor(teams, house.teamId) && <span className="pdm-dot-10" style={{ '--dot-color': getRelationColor(teams, house.teamId) } as CSSProperties} />}{getRelationName(teams, house.teamId, 'Unassigned')}</span></div>
            </div>
          </div>

          {/* Workers + Work log */}
          <div className="pdm-grid3">
            <div className="pdm-note-box">
              <span className="pdm-detail-label"><User size={14} /> ASSIGNED WORKERS</span>
              <div className="pdm-workers-wrap">
                {!(house.assignedWorkers && house.assignedWorkers.length > 0) ? (
                  <span className="pdm-empty-text">No workers assigned.</span>
                ) : house.assignedWorkers.map(wid => {
                  const emp = employees.find(e => e.id === wid);
                  if (!emp) return null;
                  return <div key={wid} className="pdm-worker-chip"><User size={12} color="#64748b" /> {emp.firstName} {emp.lastName}</div>;
                })}
              </div>
            </div>

            <div>
              <span className="pdm-detail-label"><Activity size={14} /> WORK LOG</span>
              <div className="pdm-table-card">
                <table className="pdm-table">
                  <thead><tr><th className="pdm-th">Event</th><th className="pdm-th">Employee</th><th className="pdm-th right">Time</th></tr></thead>
                  <tbody>
                    {(!house.employeeStartedBy && !house.employeeFinishedBy) && (
                      <tr><td colSpan={3} className="pdm-td empty">No activity logged yet.</td></tr>
                    )}
                    {house.employeeStartedBy && (
                      <tr><td className="pdm-td label-start">Job Started</td><td className="pdm-td">{String(house.employeeStartedBy).split(' ')[0]}</td><td className="pdm-td timestamp">{fmtDT(house.employeeStartedAt)}</td></tr>
                    )}
                    {house.employeeFinishedBy && (
                      <tr><td className="pdm-td label-end">Job Finished</td><td className="pdm-td">{String(house.employeeFinishedBy).split(' ')[0]}</td><td className="pdm-td timestamp">{fmtDT(house.employeeFinishedAt)}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pdm-stat-col">
              <div className="pdm-stat-billed">
                <div className="pdm-stat-billed-label">Total Billed</div>
                <div className="pdm-stat-billed-value">${totalBilled.toFixed(2)}</div>
              </div>
              <div className="pdm-stat-row">
                <div className="pdm-stat-payroll">
                  <div className="pdm-stat-payroll-label">Payroll</div>
                  <div className="pdm-stat-payroll-value">${totalPayroll.toFixed(2)}</div>
                </div>
                <div className={`pdm-stat-profit ${profit >= 0 ? 'positive' : 'negative'}`}>
                  <div className={`pdm-stat-profit-label ${profit >= 0 ? 'positive' : 'negative'}`}>Profit</div>
                  <div className={`pdm-stat-profit-value ${profit >= 0 ? 'positive' : 'negative'}`}>${profit.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Billed services + Payments */}
          {(billed.length > 0 || payrolls.length > 0) && (
            <div className="pdm-grid3">
              {billed.length > 0 && (
                <div>
                  <span className="pdm-detail-label"><FileText size={14} /> BILLED SERVICES</span>
                  <div className="pdm-table-card">
                    <table className="pdm-table">
                      <thead><tr><th className="pdm-th">Service</th><th className="pdm-th center">Qty</th><th className="pdm-th right">Total</th></tr></thead>
                      <tbody>
                        {billed.map(r => (
                          <tr key={r.id}><td className="pdm-td strong">{getRelationName(services, r.serviceId, 'Unknown')}</td><td className="pdm-td center">{r.quantity}</td><td className="pdm-td right strong">${Number(r.total || 0).toFixed(2)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {payrolls.length > 0 && (
                <div>
                  <span className="pdm-detail-label"><Users size={14} /> PAYMENTS</span>
                  <div className="pdm-payments-list">
                    {payrolls.map(r => {
                      const emp = employees.find(e => e.id === r.employeeId);
                      return (
                        <div key={r.id} className="pdm-payment-row">
                          <div><div className="pdm-payment-name">{emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown'}</div><div className="pdm-payment-date">{r.date}</div></div>
                          <div className="pdm-payment-amount">${getPayrollTotal(r).toFixed(2)}</div>
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
            <div className="pdm-note-box"><span className="pdm-detail-label"><StickyNote size={14} /> GENERAL NOTE</span><p className="pdm-note-text">{house.note || 'No notes.'}</p></div>
            <div className="pdm-note-box orange"><span className="pdm-detail-label orange"><PenTool size={14} /> EMPLOYEE'S NOTE</span><p className="pdm-note-text orange">{house.employeeNote || 'No employee notes.'}</p></div>
          </div>

          {/* Photos (solo lectura) */}
          {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
            <div className="pdm-grid3">
              {[{ label: 'Before', list: beforePhotos }, { label: 'After', list: afterPhotos }].filter(b => b.list.length > 0).map(block => (
                <div key={block.label}>
                  <span className="pdm-detail-label"><ImageIcon size={14} /> {block.label.toUpperCase()} PHOTOS ({block.list.length})</span>
                  <div className="pdm-photo-grid">
                    {block.list.map((u, i) => (
                      <a key={i} href={u} target="_blank" rel="noreferrer" className="pdm-photo-thumb">
                        <img src={u} alt={`${block.label} ${i + 1}`} loading="lazy" />
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Historial de status (lo mismo que aparece en Status History) */}
          <div className="pdm-history-wrap">
            <StatusHistoryPanel propertyId={house.id} statuses={statuses} refreshKey={historyKey} />
          </div>
        </div>
      </div>
    </div>
  );
}
