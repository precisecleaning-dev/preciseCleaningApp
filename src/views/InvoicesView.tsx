import { useState, useEffect } from 'react';
import { 
  Search, MapPin, CalendarDays, ChevronDown, FileText, Users, Edit2, Trash2
} from 'lucide-react';

import type { Property, Team, SystemUser, Role } from '../types/index';
import { propertiesService } from '../services/propertiesService';
import { settingsService } from '../services/settingsService';
import { db } from '../config/firebase';
import { collection, getDocs } from 'firebase/firestore';

const INVOICE_STATUSES = [
  { id: 'Pre-Paid', name: 'Pre-Paid', color: '#8b5cf6' },
  { id: 'Needs Invoice', name: 'Needs Invoice', color: '#f59e0b' },
  { id: 'Pending', name: 'Pending', color: '#ef4444' },
  { id: 'Paid', name: 'Paid', color: '#10b981' }
];

// --- INVOICE STATUS PILL SELECTOR ---
const InvoiceStatusPill = ({ currentStatus, onChange, disabled }: { currentStatus: string, onChange: (s: string) => void, disabled: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const statusObj = INVOICE_STATUSES.find(s => s.id === currentStatus || s.name === currentStatus) || { id: currentStatus, name: currentStatus || 'Pending', color: '#64748b' };

  return (
    <div tabIndex={0} onBlur={() => setTimeout(() => setIsOpen(false), 200)} style={{ position: 'relative', display: 'inline-block', outline: 'none' }}>
      <div 
        onClick={(e) => { e.stopPropagation(); if(!disabled) setIsOpen(!isOpen); }}
        style={{ 
          color: '#111827', padding: '6px 16px', borderRadius: '20px', 
          fontSize: '0.85rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px',
          cursor: disabled ? 'not-allowed' : 'pointer', border: `1px solid ${statusObj.color}40`, transition: 'all 0.2s',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)', backgroundColor: `${statusObj.color}10`
        }}
        onMouseEnter={(e) => { if(!disabled) e.currentTarget.style.backgroundColor = `${statusObj.color}20`; }}
        onMouseLeave={(e) => { if(!disabled) e.currentTarget.style.backgroundColor = `${statusObj.color}10`; }}
      >
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: statusObj.color }}></span>
        <span style={{ color: statusObj.color }}>{statusObj.name}</span>
        <ChevronDown size={14} color={statusObj.color} style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
      </div>

      {isOpen && (
        <div style={{ 
          position: 'absolute', top: '100%', left: 0, marginTop: '4px', backgroundColor: 'white', 
          border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', 
          zIndex: 9999, minWidth: '160px', overflow: 'hidden', textAlign: 'left'
        }}>
          {INVOICE_STATUSES.map((s) => (
            <div 
              key={s.id}
              onClick={(e) => { 
                e.preventDefault(); e.stopPropagation();
                if(s.id !== currentStatus) onChange(s.id); 
                setIsOpen(false); 
              }}
              style={{ 
                padding: '12px 14px', fontSize: '0.85rem', fontWeight: 600, color: '#334155', 
                display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                backgroundColor: currentStatus === s.id ? '#f8fafc' : 'transparent',
                borderBottom: '1px solid #f1f5f9'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = currentStatus === s.id ? '#f8fafc' : 'transparent'}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: s.color, flexShrink: 0 }}></span>
              {s.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};


interface InvoicesViewProps {
  onOpenMenu: () => void;
  properties: Property[];
  setProperties: React.Dispatch<React.SetStateAction<Property[]>>;
  currentUser?: SystemUser | null;
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
  onEditProperty?: (property: Property) => void;
}

export default function InvoicesView({ onOpenMenu, properties, setProperties, currentUser, activeRole, isSuperAdmin, onEditProperty }: InvoicesViewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [teams, setTeams] = useState<Team[]>([]);
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [billedServices, setBilledServices] = useState<any[]>([]);

  // Filtros
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchClient, setSearchClient] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');

  const canEdit = isSuperAdmin || activeRole?.permissions?.find(p => p.module === 'Houses')?.canEdit;
  const canDelete = isSuperAdmin || activeRole?.permissions?.find(p => p.module === 'Houses')?.canDelete;

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [teamsSnap, payrollSnap, servicesSnap] = await Promise.all([
          settingsService.getAll('settings_teams').catch(() => []),
          getDocs(collection(db, 'payroll')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'billing_services')).catch(() => ({ docs: [] }))
        ]);
        
        setTeams(teamsSnap as Team[]);
        setPayrolls((payrollSnap as any).docs.map((d: any) => ({id: d.id, ...d.data()})));
        setBilledServices((servicesSnap as any).docs.map((d: any) => ({id: d.id, ...d.data()})));
      } catch (error) {
        console.error("Error fetching financial data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleStatusChange = async (propertyId: string, newStatus: string) => {
    setIsSaving(true);
    try {
      await propertiesService.update(propertyId, { invoiceStatus: newStatus } as any);
      setProperties(properties.map(p => p.id === propertyId ? { ...p, invoiceStatus: newStatus } : p));
    } catch (error) {
      console.error("Error updating invoice status:", error);
      alert("Failed to update status.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (propertyId: string) => {
    if (!window.confirm("Are you sure you want to completely delete this job?")) return;
    setIsSaving(true);
    try {
      await propertiesService.delete(propertyId);
      setProperties(properties.filter(p => p.id !== propertyId));
      alert("Job deleted successfully.");
    } catch (error) {
      console.error("Error deleting property:", error);
      alert("Failed to delete property.");
    } finally {
      setIsSaving(false);
    }
  };

  const getTeamName = (teamId?: string) => {
    if (!teamId) return 'Unassigned';
    const team = teams.find(t => t.id === teamId || t.name === teamId);
    return team ? team.name : 'Unassigned';
  };

  // Filtrado de propiedades
  const filteredProperties = properties.filter(prop => {
    // Solo mostrar las que el usuario tiene permitido ver
    const isAssigned = prop.assignedWorkers?.includes(currentUser?.id || '');
    const isSameTeam = currentUser?.teamId && (prop.teamId === currentUser.teamId);
    if (!isSuperAdmin && !isAssigned && !isSameTeam) return false;

    // Filtros de UI
    if (filterStatus !== 'All' && prop.invoiceStatus !== filterStatus) return false;
    if (searchClient && !prop.client.toLowerCase().includes(searchClient.toLowerCase())) return false;
    if (startDate && prop.scheduleDate && prop.scheduleDate < startDate) return false;
    if (endDate && prop.scheduleDate && prop.scheduleDate > endDate) return false;

    return true;
  });

  const s = {
    label: { fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, marginBottom: '6px', display: 'block', letterSpacing: '0.05em' },
    inputWrapper: { position: 'relative' as const, display: 'flex', alignItems: 'center', width: '100%' },
    icon: { position: 'absolute' as const, left: '12px', color: '#94a3b8', pointerEvents: 'none' as const },
    input: { backgroundColor: '#ffffff', padding: '10px 14px 10px 36px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', color: '#1e293b', width: '100%', boxSizing: 'border-box' as const, outline: 'none', transition: 'border-color 0.2s' },
    
    th: { padding: '16px 20px', textAlign: 'left' as const, fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' as const },
    td: { padding: '16px 20px', borderBottom: '1px solid #f1f5f9', fontSize: '0.95rem', color: '#1e293b', verticalAlign: 'middle' as const },
  };

  return (
    <div className="fade-in" style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* HEADER */}
      <header style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button onClick={onOpenMenu} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', color: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
        <div>
          <h1 style={{ margin: 0, color: '#0f172a', fontSize: '1.8rem', fontWeight: 800 }}>Invoices</h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.95rem' }}>Financial tracking and billing status</p>
        </div>
      </header>

      {/* FILTROS (Fondo Blanco) */}
      <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        
        <div>
          <label style={s.label}>Start Date</label>
          <div style={s.inputWrapper}>
            <CalendarDays style={s.icon} size={16} />
            <input type="date" style={s.input} value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label style={s.label}>End Date</label>
          <div style={s.inputWrapper}>
            <CalendarDays style={s.icon} size={16} />
            <input type="date" style={s.input} value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label style={s.label}>Client Name</label>
          <div style={s.inputWrapper}>
            <Search style={s.icon} size={16} />
            <input type="text" style={s.input} placeholder="Search by client..." value={searchClient} onChange={e => setSearchClient(e.target.value)} />
          </div>
        </div>

        <div>
          <label style={s.label}>Invoice Status</label>
          <div style={s.inputWrapper}>
            <FileText style={s.icon} size={16} />
            <select style={{...s.input, cursor: 'pointer', appearance: 'none'}} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="All">All Statuses</option>
              {INVOICE_STATUSES.map(st => (
                <option key={st.id} value={st.id}>{st.name}</option>
              ))}
            </select>
            <ChevronDown size={16} color="#94a3b8" style={{ position: 'absolute', right: '14px', pointerEvents: 'none' }} />
          </div>
        </div>

      </div>

      {/* TABLA PRINCIPAL */}
      <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
          <thead>
            <tr>
              <th style={s.th}>Invoice Status</th>
              <th style={s.th}>Client / Address</th>
              <th style={s.th}>Schedule Date</th>
              <th style={s.th}>Team</th>
              <th style={{...s.th, textAlign: 'right'}}>Total Cost</th>
              <th style={{...s.th, textAlign: 'right'}}>Payroll Total</th>
              <th style={{...s.th, textAlign: 'right'}}>Profit</th>
              <th style={{...s.th, textAlign: 'center'}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} style={{textAlign: 'center', padding: '40px', color: '#94a3b8', fontStyle: 'italic'}}>Loading financial data...</td></tr>
            ) : filteredProperties.length === 0 ? (
              <tr><td colSpan={8} style={{textAlign: 'center', padding: '40px', color: '#94a3b8', fontStyle: 'italic'}}>No properties match your filters.</td></tr>
            ) : filteredProperties.map(prop => {
              
              // Cálculos Financieros
              const propServices = billedServices.filter(srv => srv.propertyId === prop.id);
              const totalCost = propServices.reduce((sum, srv) => sum + (Number(srv.total) || 0), 0);

              const propPayrolls = payrolls.filter(pay => pay.propertyId === prop.id);
              const payrollTotal = propPayrolls.reduce((sum, pay) => sum + (Number(pay.totalAmount) || 0), 0);

              const profit = totalCost - payrollTotal;

              return (
                <tr key={prop.id} style={{ transition: 'background-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                  
                  <td style={s.td}>
                    <InvoiceStatusPill 
                      currentStatus={prop.invoiceStatus || 'Pending'} 
                      onChange={(newSt: string) => handleStatusChange(prop.id, newSt)} 
                      disabled={isSaving || (!isSuperAdmin && !canEdit)} 
                    />
                  </td>

                  <td style={s.td}>
                    <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>{prop.client}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <MapPin size={12} /> {prop.address}
                    </div>
                  </td>

                  <td style={{ ...s.td, color: '#475569', fontWeight: 500 }}>
                    {prop.scheduleDate || '-'}
                  </td>

                  <td style={{ ...s.td, color: '#64748b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Users size={14} /> {getTeamName(prop.teamId)}
                    </div>
                  </td>

                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>
                    ${totalCost.toFixed(2)}
                  </td>

                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, color: '#b91c1c' }}>
                    ${payrollTotal.toFixed(2)}
                  </td>

                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 800, color: profit >= 0 ? '#047857' : '#e11d48', fontSize: '1.05rem' }}>
                    ${profit.toFixed(2)}
                  </td>

                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                      {canEdit && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); if(onEditProperty) onEditProperty(prop); }} 
                          title="Edit Job"
                          style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '6px', display: 'flex', borderRadius: '4px' }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#eff6ff'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <Edit2 size={16} />
                        </button>
                      )}
                      {canDelete && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(prop.id); }} 
                          title="Delete Job"
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '6px', display: 'flex', borderRadius: '4px' }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fef2f2'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>

                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}