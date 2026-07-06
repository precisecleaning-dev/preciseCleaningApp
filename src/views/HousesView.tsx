import { useState, useEffect, useRef } from 'react';
import { 
  Search, MapPin, Plus, X, Edit2, Trash2, 
  Activity, FileText, CalendarDays, Clock, User, Wrench, Hash, Flag, Users, StickyNote, PenTool, ChevronDown,
  Briefcase, ShieldCheck, AlertTriangle, Image as ImageIcon, Copy, CheckSquare, DollarSign, Filter, CheckCircle, Calendar, Percent, PlayCircle, BarChart3, FileImage,
  Save, XCircle, Layers, Settings, Receipt, CalendarClock, CloudOff, Camera
} from 'lucide-react';

import type { Property as BaseProperty, Status, Team, Priority, Service, Customer, SystemUser, Role, PayrollRecord, Tax } from '../types/index';

import { propertiesService } from '../services/propertiesService';
import { storageService } from '../services/storageService';
import { payrollService } from '../services/payrollService';
import { DEFAULT_PHOTO_CONFIG } from '../services/photoConfigService';
import type { PhotoConfig } from '../services/photoConfigService';
import { compressImage } from '../utils/imageCompression';
import { db } from '../config/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot, getDocs, setDoc, getDoc } from 'firebase/firestore';
import { formatDate, dateSortValue } from '../utils/dateFormat';

// Importación corregida a ../components/PhotoSection
import PhotoSection from '../components/PhotoSection';
import PipelineBoardView from '../components/PipelineBoardView';
import { enqueuePhotos, getAllPending, getPendingByProperty, removePending, countPending, makePendingId, type PendingPhoto } from '../utils/offlinePhotoQueue';

type Property = BaseProperty & {
  employeeStartedBy?: string | null;
  employeeStartedAt?: string | null;
  employeeFinishedBy?: string | null;
  employeeFinishedAt?: string | null;
  beforePhotosExcluded?: string[]; // URLs que NO van al PDF
  afterPhotosExcluded?: string[];
  dateOfIssue?: string;   // ⭐ Fecha de emisión
  dueDate?: string;       // ⭐ Fecha de vencimiento
};

interface ServiceRecord {
  id?: string; 
  propertyId: string;
  serviceId: string;
  quantity: number;
  price: number;
  subtotal: number;
  applyTax: 'Yes' | 'No';
  minusTax: 'Yes' | 'No';
  taxPercentage: number;
  taxAmount: number;
  total: number;
  totalMinusTax: number;   // ⭐ AppSheet "Total Minus Tax"
  notes: string;
  createdAt?: string;
}

const collectionMap: Record<string, string> = {
  team: 'settings_teams',
  priority: 'settings_priorities',
  status: 'settings_statuses',
  service: 'settings_services',
  tax: 'settings_tax'
};

type ConfigurableElement = { id: string; label: string; section: string };

const CONFIGURABLE_FIELDS: ConfigurableElement[] = [
  { id: 'client', label: 'Client', section: 'General Info' },
  { id: 'address', label: 'Address', section: 'General Info' },
  { id: 'receiveDate', label: 'Receive Date', section: 'Schedule' },
  { id: 'scheduleDate', label: 'Schedule Date', section: 'Schedule' },
  { id: 'timeIn', label: 'Time In', section: 'Schedule' },
  { id: 'timeOut', label: 'Time Out', section: 'Schedule' },
  { id: 'serviceId', label: 'Service', section: 'Job Specs' },
  { id: 'priorityId', label: 'Priority', section: 'Job Specs' },
  { id: 'rooms', label: 'Rooms', section: 'Job Specs' },
  { id: 'bathrooms', label: 'Bathrooms', section: 'Job Specs' },
  { id: 'statusId', label: 'Status', section: 'Status & Assignment' },
  { id: 'invoiceStatus', label: 'Invoice Status', section: 'Status & Assignment' },
  { id: 'teamId', label: 'Team', section: 'Status & Assignment' },
  { id: 'assignedWorkers', label: 'Assigned Workers', section: 'Status & Assignment' },
  { id: 'note', label: 'General Note', section: 'Notes' },
  { id: 'employeeNote', label: "Employee's Note", section: 'Notes' },
  { id: 'card_billedServices', label: 'Billed Services (entire section)', section: 'Sections' },
  { id: 'card_photos', label: 'Photos (entire section)', section: 'Sections' }
];

const CONFIGURABLE_BUTTONS: ConfigurableElement[] = [
  { id: 'btn_sync', label: 'Sync (Google Calendar)', section: 'Workflow' },
  { id: 'btn_startJob', label: 'Start Job', section: 'Workflow' },
  { id: 'btn_markFinished', label: 'Mark Finished', section: 'Workflow' },
  { id: 'btn_pay', label: 'Pay', section: 'Financial' },
  { id: 'btn_duplicate', label: 'Duplicate', section: 'Admin' },
  { id: 'btn_editDetails', label: 'Edit Details', section: 'Admin' },
  { id: 'btn_deleteProperty', label: 'Delete Property', section: 'Admin' },
  { id: 'btn_exportPdf', label: 'Export PDF', section: 'Media' },
  { id: 'btn_uploadPhoto', label: 'Upload Photo (Cargar)', section: 'Media' },
  { id: 'btn_takePhoto', label: 'Take Photo (Cámara)', section: 'Media' },
  { id: 'btn_tabFinancials', label: 'Financials & Billing Tab', section: 'Tabs' },
  { id: 'btn_tabMedia', label: 'Notes & Photos Tab', section: 'Tabs' }
];

type FormVisibilityConfig = {
  visibility: Record<string, string[]>;
};

const DEFAULT_FORM_CONFIG: FormVisibilityConfig = { visibility: {} };

// Configuración que el chip de estado envía al modal central de selección.
type StatusModalConfig = {
  currentId: string;
  onSelect: (id: string) => void;
  title?: string;
  subtitle?: string;
};

const SearchableSelect = ({ options, value, onChange, placeholder, icon: Icon, returnKey = 'id' }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = options.find((o: any) => String(o[returnKey]) === String(value));
  const displayValue = isOpen ? search : (selected ? selected.name : value || '');

  const filteredOptions = options.filter((o: any) => o.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div tabIndex={0} onBlur={() => setTimeout(() => setIsOpen(false), 200)} style={{ position: 'relative', width: '100%', outline: 'none' }}>
      <div style={{ backgroundColor: '#ffffff', padding: '0 14px 0 40px', border: '1px solid #cbd5e1', borderRadius: '8px', display: 'flex', alignItems: 'center', height: '42px', position: 'relative' }}>
        <Icon size={16} style={{ position: 'absolute', left: '14px', color: '#6b7280' }} />
        <input
          style={{ border: 'none', outline: 'none', width: '100%', height: '100%', fontSize: '0.95rem', color: '#111827', backgroundColor: 'transparent' }}
          placeholder={placeholder}
          value={displayValue}
          onChange={(e) => {
            setSearch(e.target.value);
            if(!isOpen) setIsOpen(true);
          }}
          onClick={() => { setIsOpen(true); setSearch(''); }}
        />
        <ChevronDown size={16} color="#9ca3af" style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none', cursor: 'pointer' }} onClick={() => setIsOpen(!isOpen)} />
      </div>
      {isOpen && (
        <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 1000, maxHeight: '220px', overflowY: 'auto', marginTop: '4px' }}>
          {filteredOptions.length === 0 ? <div style={{padding: '12px 14px', color: '#9ca3af', fontSize: '0.9rem'}}>No results found</div> : null}
          {filteredOptions.map((o: any) => (
            <div
              key={o.id}
              style={{ padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #f9fafb', fontSize: '0.95rem', color: '#111827', fontWeight: 500 }}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o[returnKey] || o.id);
                setIsOpen(false);
                setSearch('');
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {o.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const CustomSelect = ({ options, value, onChange, placeholder, icon: Icon, returnKey = 'id' }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const safeValue = String(value || '').toLowerCase().trim();
  const selected = options.find((o: any) => 
    String(o.id).toLowerCase().trim() === safeValue || 
    String(o.name).toLowerCase().trim() === safeValue
  );

  return (
    <div tabIndex={0} onBlur={() => setTimeout(() => setIsOpen(false), 200)} style={{ position: 'relative', width: '100%', outline: 'none' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ backgroundColor: '#ffffff', padding: '0 14px 0 40px', border: '1px solid #cbd5e1', borderRadius: '8px', display: 'flex', alignItems: 'center', height: '42px', position: 'relative', cursor: 'pointer' }}
      >
        <Icon size={16} style={{ position: 'absolute', left: '14px', color: '#6b7280' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflow: 'hidden' }}>
          {selected?.color && <span style={{ backgroundColor: selected.color, width: '12px', height: '12px', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }}></span>}
          <span style={{ color: selected ? '#111827' : '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.95rem' }}>
            {selected ? selected.name : placeholder}
          </span>
        </div>
        <ChevronDown size={16} color="#9ca3af" style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
      </div>

      {isOpen && (
        <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 1000, maxHeight: '220px', overflowY: 'auto', marginTop: '4px' }}>
          <div style={{ padding: '12px 14px', cursor: 'pointer', color: '#9ca3af', borderBottom: '1px solid #f3f4f6' }} onMouseDown={(e) => { e.preventDefault(); onChange(''); setIsOpen(false); }}>
            None / Unassigned
          </div>
          {options.map((o: any) => (
            <div 
              key={o.id} 
              style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid #f9fafb', backgroundColor: value === o.id ? '#f1f5f9' : 'transparent' }}
              onClick={() => { onChange(o[returnKey] || o.id); setIsOpen(false); }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = value === o.id ? '#f1f5f9' : 'transparent')}
            >
              {o.color && <span style={{ backgroundColor: o.color, display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', flexShrink: 0 }}></span>}
              <span style={{ color: '#111827', fontWeight: 500 }}>{o.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// StatusPillSelector: muestra el estado actual como "badge" con el color del estado.
// Al tocarlo YA NO abre una lista desplegable: solicita abrir el modal central de
// selección de estado (StatusChangeModal), que se ve igual de claro en móvil y escritorio.
// Variantes: normal (tabla), `fullWidth` (tarjeta móvil) y `large` (detalle de la casa).
const StatusPillSelector = ({
  currentStatusId, statuses, onChange, disabled,
  fullWidth = false, large = false,
  onRequestOpen, modalTitle, modalSubtitle
}: {
  currentStatusId: string;
  statuses: Status[];
  onChange: (id: string) => void;
  disabled: boolean;
  fullWidth?: boolean;
  large?: boolean;
  onRequestOpen?: (cfg: StatusModalConfig) => void;
  modalTitle?: string;
  modalSubtitle?: string;
}) => {
  const safeValue = String(currentStatusId || '').toLowerCase().trim();
  const status = statuses.find(s => String(s.id).toLowerCase().trim() === safeValue || String(s.name).toLowerCase().trim() === safeValue);

  const pointColor = status ? status.color : '#64748b';
  const text = status ? status.name : 'Unassigned';
  const block = fullWidth || large;

  const handleOpen = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || !onRequestOpen) return;
    onRequestOpen({ currentId: currentStatusId, onSelect: onChange, title: modalTitle, subtitle: modalSubtitle });
  };

  const baseStyle: React.CSSProperties = large ? {
    backgroundColor: `${pointColor}12`, color: pointColor,
    padding: '18px 20px', borderRadius: '14px',
    fontSize: '1.1rem', fontWeight: 800,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
    width: '100%', boxSizing: 'border-box',
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: `2px solid ${pointColor}`, transition: 'all 0.2s',
    boxShadow: `0 2px 10px ${pointColor}26`,
    opacity: disabled ? 0.65 : 1
  } : {
    backgroundColor: `${pointColor}14`, color: '#1e293b',
    padding: fullWidth ? '13px 16px' : '7px 14px',
    borderRadius: fullWidth ? '12px' : '999px',
    fontSize: '0.85rem', fontWeight: 700,
    display: fullWidth ? 'flex' : 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
    width: fullWidth ? '100%' : 'auto', boxSizing: 'border-box',
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: `1px solid ${pointColor}40`, transition: 'all 0.2s',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    opacity: disabled ? 0.65 : 1
  };

  return (
    <div style={{ display: block ? 'block' : 'inline-block', width: block ? '100%' : 'auto' }}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={handleOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOpen(e); }}
        style={baseStyle}
        onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.filter = 'brightness(0.97)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
        title={disabled ? undefined : 'Cambiar estado'}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: large ? '12px' : '8px', minWidth: 0 }}>
          <span style={{ width: large ? '14px' : '9px', height: large ? '14px' : '9px', borderRadius: '50%', backgroundColor: pointColor, flexShrink: 0, boxShadow: large ? `0 0 0 4px ${pointColor}22` : 'none' }}></span>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
        </span>
        <ChevronDown size={large ? 22 : (fullWidth ? 16 : 14)} color={large ? pointColor : '#94a3b8'} style={{ flexShrink: 0 }} />
      </div>
    </div>
  );
};

// Modal central de selección de estado: reemplaza la antigua lista desplegable.
// Una sola instancia en HousesView atiende a todos los chips (tabla, tarjetas y detalle).
const StatusChangeModal = ({ config, statuses, onClose }: { config: StatusModalConfig; statuses: Status[]; onClose: () => void }) => {
  const cur = String(config.currentId || '').toLowerCase().trim();

  // Se elige un estado (queda resaltado) y se confirma con "Aceptar".
  const resolveCurrentId = () => {
    const match = statuses.find(st => String(st.id).toLowerCase().trim() === cur || String(st.name).toLowerCase().trim() === cur);
    return match ? match.id : (config.currentId || '');
  };
  const [selectedId, setSelectedId] = useState<string>(resolveCurrentId());

  // Reinicia la selección al estado actual cada vez que se abre para otra casa.
  useEffect(() => { setSelectedId(resolveCurrentId()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [config]);

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '11px', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Activity size={20} color="#2563eb" />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Cambiar estado</h3>
              {config.title && (
                <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {config.title}{config.subtitle ? ` · ${config.subtitle}` : ''}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '6px', display: 'flex', borderRadius: '8px', flexShrink: 0 }}>
            <X size={22} />
          </button>
        </header>

        <div className="status-modal-grid">
          {statuses.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', padding: '24px' }}>No hay estados configurados.</div>
          ) : statuses.map(st => {
            const isCurrent = String(st.id).toLowerCase().trim() === cur || String(st.name).toLowerCase().trim() === cur;
            const isSelected = st.id === selectedId;
            return (
              <button
                key={st.id}
                className="status-option"
                onClick={() => setSelectedId(st.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '14px 16px', borderRadius: '12px', cursor: 'pointer',
                  textAlign: 'left', width: '100%', minHeight: '56px',
                  // Resaltado neutro (azul claro) para que el texto SIEMPRE se lea,
                  // sin importar si el color del estado es oscuro o negro.
                  background: isSelected ? '#eff6ff' : '#ffffff',
                  border: `2px solid ${isSelected ? '#2563eb' : '#e5e7eb'}`,
                  boxShadow: isSelected ? '0 2px 10px rgba(37,99,235,0.18)' : '0 1px 2px rgba(0,0,0,0.03)',
                  transition: 'all 0.15s'
                }}
              >
                <span style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: st.color, flexShrink: 0, boxShadow: `0 0 0 4px ${st.color}1f`, border: '1px solid rgba(0,0,0,0.12)' }}></span>
                <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', lineHeight: 1.3, wordBreak: 'break-word' }}>{st.name}</span>
                {isCurrent && !isSelected && (
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>Actual</span>
                )}
                {isSelected && <CheckCircle size={18} color="#2563eb" style={{ flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>

        <footer className="status-modal-foot">
          <button onClick={onClose} className="status-btn-cancel">Cancelar</button>
          <button onClick={handleAccept} disabled={selectedIsCurrent} className="status-btn-accept" style={{ opacity: selectedIsCurrent ? 0.55 : 1 }}>
            <CheckCircle size={16} /> Aceptar
          </button>
        </footer>
      </div>
    </div>
  );
};

const getRelationName = (list: any[], idOrName: string, fallback = '-') => {
  if (!idOrName) return fallback;
  const safeVal = String(idOrName).toLowerCase().trim();
  const found = list.find(item => String(item.id).toLowerCase().trim() === safeVal || String(item.name).toLowerCase().trim() === safeVal);
  return found ? found.name : fallback;
};

const getRelationColor = (list: any[], idOrName: string) => {
  if (!idOrName) return undefined;
  const safeVal = String(idOrName).toLowerCase().trim();
  return list.find(item => String(item.id).toLowerCase().trim() === safeVal || String(item.name).toLowerCase().trim() === safeVal)?.color;
};

const formatDateTime = (isoString?: string | null) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

interface HousesViewProps {
  onOpenMenu: () => void;
  properties: Property[];
  setProperties: React.Dispatch<React.SetStateAction<Property[]>>;
  onCheckHouse: (house: Property) => void;
  currentUser?: SystemUser | null;
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
  roles?: Role[];
  viewMode?: 'table' | 'board';
}

type DetailTab = 'overview' | 'financials' | 'media';

export default function HousesView({ onOpenMenu, properties, setProperties, onCheckHouse: _onCheckHouse, currentUser, activeRole, isSuperAdmin, roles = [], viewMode = 'table' }: HousesViewProps) { 
  
  const [activeFilter, setActiveFilter] = useState('All');
  const [houseFilter, setHouseFilter] = useState('All'); 
  const [invoiceFilter, setInvoiceFilter] = useState('All'); 
  const [statusFilter, setStatusFilter] = useState('All');
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('All');

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState<Property | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('overview');

  // Configuración del modal central de cambio de estado (null = cerrado).
  const [statusModal, setStatusModal] = useState<StatusModalConfig | null>(null);
  
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [products, setProducts] = useState<any[]>([]); // ⭐ settings_products (fuente de serviceId)
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [customersList, setCustomersList] = useState<Customer[]>([]); 
  const [employees, setEmployees] = useState<any[]>([]); 

  const [rolesList, setRolesList] = useState<Role[]>(roles);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAssigningWorker, setIsAssigningWorker] = useState(false);
  const [isAssigningWorkerForm, setIsAssigningWorkerForm] = useState(false);
  const [workerSearch, setWorkerSearch] = useState(''); // ⭐ buscador de empleados

  const [formConfig, setFormConfig] = useState<FormVisibilityConfig>(DEFAULT_FORM_CONFIG);
  const [isFieldConfigOpen, setIsFieldConfigOpen] = useState(false);
  const [fieldConfigDraft, setFieldConfigDraft] = useState<FormVisibilityConfig>(DEFAULT_FORM_CONFIG);
  const [isSavingFieldConfig, setIsSavingFieldConfig] = useState(false);

  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  const [housePayrollRecords, setHousePayrollRecords] = useState<PayrollRecord[]>([]);
  const [payrollForm, setPayrollForm] = useState<PayrollRecord>({
    propertyId: '', date: new Date().toISOString().split('T')[0], employeeId: '', baseAmount: 0, extraAmount: 0, extraNote: '', discountAmount: 0, discountNote: '', totalAmount: 0
  });

  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  // ⭐ Modal para agregar un cliente rápido desde el formulario de casa
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState({ type: 'Residential', color: '#3b82f6', name: '', businessName: '', email: '', phone: '', address: '', cityStateZip: '' });
  const [isServiceFromForm, setIsServiceFromForm] = useState(false);
  const [houseServices, setHouseServices] = useState<ServiceRecord[]>([]);
  const [formServices, setFormServices] = useState<ServiceRecord[]>([]);
  const [servicesToDelete, setServicesToDelete] = useState<string[]>([]);

  const defaultServiceForm: ServiceRecord = {
    propertyId: '', serviceId: '', quantity: 1, price: 0, subtotal: 0,
    applyTax: 'Yes', minusTax: 'No', taxPercentage: 0, taxAmount: 0, total: 0, totalMinusTax: 0, notes: ''
  };
  const [serviceForm, setServiceForm] = useState<ServiceRecord>(defaultServiceForm);

  const [formData, setFormData] = useState<Property>({
    id: '', statusId: '', invoiceStatus: 'Pending', receiveDate: '', scheduleDate: '', client: '', note: '', address: '', employeeNote: '', serviceId: '', rooms: '1', bathrooms: '1', priorityId: '', teamId: '', timeIn: '', timeOut: '',
    dateOfIssue: '', dueDate: '',
    beforePhotos: [], afterPhotos: [], assignedWorkers: [] 
  });

  const [beforePhotoURLs, setBeforePhotoURLs] = useState<string[]>([]);
  const [afterPhotoURLs, setAfterPhotoURLs] = useState<string[]>([]);
  const [beforeFiles, setBeforeFiles] = useState<File[]>([]);
  const [afterFiles, setAfterFiles] = useState<File[]>([]);

  const [beforeExcluded, setBeforeExcluded] = useState<string[]>([]);
  const [afterExcluded, setAfterExcluded] = useState<string[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingForHouse, setPendingForHouse] = useState<{ before: number; after: number }>({ before: 0, after: 0 });

  const [photoConfig, setPhotoConfig] = useState<PhotoConfig>(DEFAULT_PHOTO_CONFIG);
  const [isCompressing, setIsCompressing] = useState(false);

  // ⭐ CÁMARA RÁPIDA (ráfaga): se abre una vez y permite tomar varias fotos
  //    seguidas sin cerrarse. Cada toma se agrega a Before o After.
  const [cameraOpen, setCameraOpen] = useState<null | 'before' | 'after'>(null);
  const [burstCount, setBurstCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let active = true;
    const start = async () => {
      if (!cameraOpen) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e) {
        console.error('No se pudo abrir la cámara:', e);
        alert('No se pudo abrir la cámara. Revisa los permisos del navegador o usa "Cargar/Galería".');
        setCameraOpen(null);
      }
    };
    start();
    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen]);

  const openBurstCamera = (type: 'before' | 'after') => {
    setBurstCount(0);
    setCameraOpen(type);
  };

  const captureBurst = async () => {
    const video = videoRef.current;
    if (!video || !cameraOpen) return;
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const maxW = 1600;
    const scale = w > maxW ? maxW / w : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise(res => canvas.toBlob(b => res(b), 'image/jpeg', 0.9));
    if (!blob) return;
    const file = new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' });
    // Reutiliza el mismo flujo (compresión + preview + cola offline al guardar)
    await addPhotoFiles([file] as any, cameraOpen);
    setBurstCount(c => c + 1);
  };

  const canEdit = isSuperAdmin || activeRole?.permissions?.find(p => p.module === 'Houses')?.canEdit;
  const canDelete = isSuperAdmin || activeRole?.permissions?.find(p => p.module === 'Houses')?.canDelete;

  // ⭐ Total Minus Tax para registros que aún no lo tengan guardado (legacy/importados)
  const recordTotalMinusTax = (r: any): number => {
    if (typeof r?.totalMinusTax === 'number') return r.totalMinusTax;
    const subtotal = Number(r?.subtotal) || 0;
    const taxAmount = Number(r?.taxAmount) || 0;
    if (r?.minusTax === 'Yes' && r?.applyTax === 'No') return subtotal - taxAmount;
    if (r?.applyTax === 'Yes' && r?.minusTax === 'No') return subtotal + taxAmount;
    return subtotal;
  };

  const getClientName = (clientIdOrName?: string | null) => {
    if (!clientIdOrName) return 'Unknown';
    return getRelationName(customersList, clientIdOrName, String(clientIdOrName));
  };

  // ⭐ Resuelve el nombre del serviceId desde settings_products (con respaldo a settings_services)
  const getServiceName = (serviceId?: string | null): string => {
    if (!serviceId) return 'Unknown';
    const safe = String(serviceId).toLowerCase().trim();
    const inProducts = products.find((p: any) => String(p.id).toLowerCase().trim() === safe || String(p.name).toLowerCase().trim() === safe);
    if (inProducts) return inProducts.name;
    const inServices = services.find((c: any) => String(c.id).toLowerCase().trim() === safe || String(c.name).toLowerCase().trim() === safe);
    return inServices ? inServices.name : 'Unknown';
  };

  // Estados que NO se muestran en el Pipeline (se gestionan en otras vistas)
  const isHiddenPipelineStatus = (p: any) => {
    const st = statuses.find(s => String(s.id) === String(p.statusId) || String(s.name) === String(p.statusId));
    const name = String(st?.name || p.statusId || '').toLowerCase().trim();
    return name === 'invoice' || name === 'qc' || name.includes('quality check') || name.includes('quality-check');
  };

  const refreshPendingCounts = async () => {
    try {
      setPendingTotal(await countPending());
      const hid = selectedHouse?.id || formData?.id;
      if (hid) {
        const list = await getPendingByProperty(hid);
        setPendingForHouse({
          before: list.filter(p => p.type === 'before').length,
          after: list.filter(p => p.type === 'after').length,
        });
      } else {
        setPendingForHouse({ before: 0, after: 0 });
      }
    } catch (e) { console.error(e); }
  };

  const syncPendingPhotos = async () => {
    if (!navigator.onLine) return;
    let pending: PendingPhoto[] = [];
    try { pending = await getAllPending(); } catch { return; }
    if (pending.length === 0) return;
    const groups = new Map<string, PendingPhoto[]>();
    pending.forEach(p => {
      const k = `${p.propertyId}__${p.type}`;
      groups.set(k, [...(groups.get(k) || []), p]);
    });
    for (const [, items] of groups) {
      const { propertyId, type, clientName, address } = items[0];
      try {
        const files = items.map(it => new File([it.blob], it.fileName, { type: it.blob.type || 'image/jpeg' }));
        const urls = await storageService.uploadMultiplePropertyPhotos(files, clientName, address, type);
        const snap = await getDoc(doc(db, 'properties', propertyId));
        const data: any = snap.exists() ? snap.data() : {};
        const field = type === 'before' ? 'beforePhotos' : 'afterPhotos';
        const merged = [...(data[field] || []), ...urls];
        await updateDoc(doc(db, 'properties', propertyId), { [field]: merged } as any);
        for (const it of items) await removePending(it.id);
      } catch (err) {
        console.error('Error sincronizando fotos pendientes:', err);
      }
    }
    await refreshPendingCounts();
  };

  const uploadOrQueue = async (
    files: File[], clientName: string, address: string,
    type: 'before' | 'after', propertyId: string,
  ): Promise<{ urls: string[]; queued: number }> => {
    if (files.length === 0) return { urls: [], queued: 0 };
    if (navigator.onLine) {
      try {
        const urls = await storageService.uploadMultiplePropertyPhotos(files, clientName, address, type);
        return { urls, queued: 0 };
      } catch (e) { console.error('Subida online falló, se encola:', e); }
    }
    const entries: PendingPhoto[] = files.map(f => ({
      id: makePendingId(), propertyId, clientName, address, type,
      blob: f, fileName: f.name || `${type}-${Date.now()}.jpg`,
      inReport: true, createdAt: Date.now(),
    }));
    await enqueuePhotos(entries);
    return { urls: [], queued: entries.length };
  };

  const addPhotoFiles = async (files: FileList | null, type: 'before' | 'after') => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    setIsCompressing(true);
    try {
      const compressed = await Promise.all(arr.map(f => compressImage(f, {
        quality: photoConfig.compressionQuality,
        maxWidth: photoConfig.maxImageWidth,
        maxSizeMB: photoConfig.maxSizeMB,
      })));
      const fileUrls = compressed.map(f => URL.createObjectURL(f));
      if (type === 'before') { setBeforeFiles(p => [...p, ...compressed]); setBeforePhotoURLs(p => [...p, ...fileUrls]); }
      else { setAfterFiles(p => [...p, ...compressed]); setAfterPhotoURLs(p => [...p, ...fileUrls]); }
    } catch (e) { console.error(e); alert('Error al procesar las imágenes. Intenta de nuevo.'); }
    finally { setIsCompressing(false); }
  };

  const toggleReportPhoto = (url: string, type: 'before' | 'after') => {
    const setter = type === 'before' ? setBeforeExcluded : setAfterExcluded;
    setter(prev => prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]);
  };

  useEffect(() => {
    const goOnline = () => { setIsOnline(true); syncPendingPhotos(); };
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    refreshPendingCounts();
    if (navigator.onLine) syncPendingPhotos();
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setIsLoading(true);

    const loadedCollections = new Set<string>();
    const TOTAL_COLLECTIONS = 10;
    const markLoaded = (name: string) => {
      loadedCollections.add(name);
      if (loadedCollections.size >= TOTAL_COLLECTIONS) {
        setIsLoading(false);
      }
    };

    const unsubscribes: (() => void)[] = [];

    unsubscribes.push(onSnapshot(
      collection(db, 'properties'),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Property[];
        setProperties(data);
        markLoaded('properties');
      },
      (err) => { console.error("Error Properties:", err); markLoaded('properties'); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, collectionMap.status),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Status[];
        setStatuses(data.sort((a, b) => Number(a.order) - Number(b.order)));
        markLoaded('statuses');
      },
      (err) => { console.error("Error Statuses:", err); markLoaded('statuses'); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, collectionMap.team),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Team[];
        setTeams(data);
        markLoaded('teams');
      },
      (err) => { console.error("Error Teams:", err); markLoaded('teams'); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, collectionMap.priority),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Priority[];
        setPriorities(data);
        markLoaded('priorities');
      },
      (err) => { console.error("Error Priorities:", err); markLoaded('priorities'); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, collectionMap.service),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Service[];
        setServices(data);
        markLoaded('services');
      },
      (err) => { console.error("Error Services:", err); markLoaded('services'); }
    ));

    // ⭐ Catálogo de productos (settings_products): fuente de serviceId en Billed Services
    unsubscribes.push(onSnapshot(
      collection(db, 'settings_products'),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setProducts(data as any);
        markLoaded('products');
      },
      (err) => { console.error("Error Products:", err); markLoaded('products'); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, collectionMap.tax),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Tax[];
        setTaxes(data);
        markLoaded('taxes');
      },
      (err) => { console.error("Error Taxes:", err); markLoaded('taxes'); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, 'customers'),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setCustomersList(data as any);
        markLoaded('customers');
      },
      (err) => { console.error("Error Customers:", err); markLoaded('customers'); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, 'system_users'),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setEmployees(data as any);
        markLoaded('users');
      },
      (err) => { console.error("Error Users:", err); markLoaded('users'); }
    ));

    unsubscribes.push(onSnapshot(
      doc(db, 'app_settings', 'photo_config'),
      (snap) => {
        if (snap.exists()) {
          setPhotoConfig(snap.data() as PhotoConfig);
        } else {
          setPhotoConfig(DEFAULT_PHOTO_CONFIG);
        }
        markLoaded('photoConfig');
      },
      (err) => { console.error("Error PhotoConfig:", err); setPhotoConfig(DEFAULT_PHOTO_CONFIG); markLoaded('photoConfig'); }
    ));

    unsubscribes.push(onSnapshot(
      doc(db, 'app_settings', 'houses_form_config'),
      (snap) => {
        if (snap.exists()) {
          setFormConfig(snap.data() as FormVisibilityConfig);
        } else {
          setFormConfig(DEFAULT_FORM_CONFIG);
        }
      },
      (err) => { console.error("Error FormConfig:", err); setFormConfig(DEFAULT_FORM_CONFIG); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, 'settings_roles'),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Role[];
        setRolesList(data);
      },
      (err) => { console.error("Error Roles:", err); }
    ));

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [setProperties]);

  useEffect(() => {
    if (!isServiceModalOpen) return;
    
    const qty = Number(serviceForm.quantity) || 0;
    const price = Number(serviceForm.price) || 0;
    const subtotal = qty * price;
    const taxPct = Number(serviceForm.taxPercentage) || 0;
    const taxAmount = (subtotal * taxPct) / 100;
    
    let total = subtotal;
    if (serviceForm.applyTax === 'Yes') {
      total = subtotal + taxAmount;
    } else if (serviceForm.applyTax === 'No' && serviceForm.minusTax === 'Yes') {
      total = subtotal - taxAmount;
    }

    // ⭐ Total Minus Tax (AppSheet):
    // IF(minusTax=TRUE & applyTax=FALSE, Total - Tax$,
    //    IF(applyTax=TRUE & minusTax=FALSE, Total + Tax$, Total))
    let totalMinusTax = subtotal;
    if (serviceForm.minusTax === 'Yes' && serviceForm.applyTax === 'No') {
      totalMinusTax = subtotal - taxAmount;
    } else if (serviceForm.applyTax === 'Yes' && serviceForm.minusTax === 'No') {
      totalMinusTax = subtotal + taxAmount;
    }

    if (subtotal !== serviceForm.subtotal || taxAmount !== serviceForm.taxAmount || total !== serviceForm.total || totalMinusTax !== serviceForm.totalMinusTax) {
      setServiceForm(prev => ({ ...prev, subtotal, taxAmount, total, totalMinusTax }));
    }
  }, [serviceForm.quantity, serviceForm.price, serviceForm.taxPercentage, serviceForm.applyTax, serviceForm.minusTax, isServiceModalOpen]);

  type PermissionExt = { module: string; canView?: boolean; canAdd?: boolean; canEdit?: boolean; canDelete?: boolean; scope?: 'All' | 'Own'; allowedStatusIds?: string[]; hiddenGroups?: string[] };

  const housePermission = activeRole?.permissions?.find(p => p.module === 'Houses') as PermissionExt | undefined;
  const userScope = isSuperAdmin ? 'All' : (housePermission?.scope || 'Own');
  const allowedStatusIds: string[] = housePermission?.allowedStatusIds || [];
  const hiddenGroups: string[] = housePermission?.hiddenGroups || [];

  const isVisible = (groupId: string): boolean => {
    if (isSuperAdmin) return true;
    return !hiddenGroups.includes(groupId);
  };

  const isElementVisible = (elementId: string): boolean => {
    if (isSuperAdmin) return true;
    const userRoleId = (currentUser as any)?.roleId;
    if (!userRoleId) return true;
    const hiddenForRoles = formConfig?.visibility?.[elementId] || [];
    return !hiddenForRoles.includes(userRoleId);
  };

  const toggleElementVisibilityForRole = (elementId: string, roleId: string) => {
    setFieldConfigDraft(prev => {
      const currentHidden = prev.visibility?.[elementId] || [];
      const newHidden = currentHidden.includes(roleId)
        ? currentHidden.filter(r => r !== roleId)
        : [...currentHidden, roleId];
      return {
        ...prev,
        visibility: { ...prev.visibility, [elementId]: newHidden }
      };
    });
  };

  const openFieldConfigModal = () => {
    setFieldConfigDraft({ visibility: { ...(formConfig.visibility || {}) } });
    setIsFieldConfigOpen(true);
  };

  const saveFieldConfig = async () => {
    setIsSavingFieldConfig(true);
    try {
      const ref = doc(db, 'app_settings', 'houses_form_config');
      await setDoc(ref, { visibility: fieldConfigDraft.visibility }, { merge: true });
      setIsFieldConfigOpen(false);
    } catch (error) {
      console.error("Error guardando configuración de campos:", error);
      alert("Error al guardar la configuración. Revisa las reglas de Firestore.");
    } finally {
      setIsSavingFieldConfig(false);
    }
  };

  const propertiesWithScope = properties.filter(prop => {
    if (userScope !== 'All') {
      if (!currentUser) return false;
      const isAssigned = prop.assignedWorkers?.includes(currentUser.id);
      const isSameTeam = currentUser.teamId && (prop.teamId === currentUser.teamId);
      if (!isAssigned && !isSameTeam) return false;
    }

    if (!isSuperAdmin && allowedStatusIds.length > 0) {
      const matchById = allowedStatusIds.includes(prop.statusId);
      const propStatus = statuses.find(st => st.id === prop.statusId || st.name === prop.statusId);
      const matchByName = propStatus ? allowedStatusIds.includes(propStatus.id) : false;
      if (!matchById && !matchByName) return false;
    }

    return true;
  });

  const teamsWithScope = teams.filter(team => {
    if (userScope === 'All') return true;
    if (!currentUser) return false;
    return team.id === currentUser.teamId;
  });

  const uniqueHouses = Array.from(new Set(
    propertiesWithScope
      .filter(p => !isHiddenPipelineStatus(p))
      .map(p => `${p.client || 'Unknown'}|${p.address || 'Unknown'}`)
  )).map(str => {
    const [client, address] = str.split('|');
    return { client, address };
  }).sort((a, b) => a.client.localeCompare(b.client));

  const filteredProperties = propertiesWithScope.filter(p => {
    const st = statuses.find(s => s.id === p.statusId || s.name === p.statusId);
    if (isHiddenPipelineStatus(p)) return false;

    let passStatus = true;
    if (activeFilter !== 'All') passStatus = st?.name === activeFilter;
    
    let passHouse = true;
    if (houseFilter !== 'All') passHouse = `${p.client || 'Unknown'}|${p.address || 'Unknown'}` === houseFilter;

    let passInvoice = true;
    if (invoiceFilter !== 'All') passInvoice = p.invoiceStatus === invoiceFilter;

    let passStatusFilter = true;
    if (statusFilter !== 'All') {
      const stObj = statuses.find(stt => stt.id === statusFilter);
      passStatusFilter = p.statusId === statusFilter || (!!stObj && p.statusId === stObj.name);
    }
    
    let passPriority = true;
    if (priorityFilter !== 'All') {
      const prObj = priorities.find(pp => pp.id === priorityFilter);
      passPriority = p.priorityId === priorityFilter || (!!prObj && p.priorityId === prObj.name);
    }

    let passSearch = true;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      const addressMatch = (p.address || '').toLowerCase().includes(q);
      const clientName = getClientName(p.client);
      const clientMatch = clientName.toLowerCase().includes(q);
      passSearch = addressMatch || clientMatch;
    }
    
    return passStatus && passHouse && passInvoice && passStatusFilter && passPriority && passSearch;
  }).sort((a, b) => {
    // ⭐ Orden por fecha (scheduleDate) descendente: de la más reciente a la más antigua.
    //    Sin fecha => al final. Tolerante a formatos mixtos (ISO y DD/MM).
    return dateSortValue(b.scheduleDate) - dateSortValue(a.scheduleDate);
  });

  const dashboardTabs = statuses
    .filter(st => (st as any).showInDashboard)
    .sort((a, b) => Number((a as any).dashboardOrder || 0) - Number((b as any).dashboardOrder || 0));

  const handleQuickStatusChange = async (propertyId: string, newStatusId: string) => {
    setIsSaving(true);
    try {
      await propertiesService.update(propertyId, { statusId: newStatusId } as any);
      setProperties(properties.map(p => p.id === propertyId ? { ...p, statusId: newStatusId } : p));
      if (selectedHouse && selectedHouse.id === propertyId) {
        setSelectedHouse({ ...selectedHouse, statusId: newStatusId });
      }
    } catch (error) {
      console.error("Error updating status:", error);
      alert("Failed to update job status.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartJob = async () => {
    if (!selectedHouse) return;
    setIsSaving(true);
    try {
      const startedAt = new Date().toISOString();
      const startedBy = currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown';
      await propertiesService.update(selectedHouse.id, { employeeStartedAt: startedAt, employeeStartedBy: startedBy } as any);
      const updatedHouse = { ...selectedHouse, employeeStartedAt: startedAt, employeeStartedBy: startedBy };
      setSelectedHouse(updatedHouse);
      setProperties(properties.map(p => p.id === selectedHouse.id ? updatedHouse : p));
    } catch (error) {
      console.error("Error marking as started:", error);
      alert("Failed to start job.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUndoStart = async () => {
    if (!selectedHouse) return;
    if (!window.confirm("Undo start job?")) return;
    setIsSaving(true);
    try {
      await propertiesService.update(selectedHouse.id, { employeeStartedAt: null, employeeStartedBy: null } as any);
      const updatedHouse = { ...selectedHouse, employeeStartedAt: undefined, employeeStartedBy: undefined };
      setSelectedHouse(updatedHouse);
      setProperties(properties.map(p => p.id === selectedHouse.id ? updatedHouse : p));
    } catch (error) {
      console.error("Error undoing start job:", error);
      alert("Failed to undo start job.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkAsFinished = async () => {
    if (!selectedHouse) return;
    if (!(selectedHouse as any).employeeStartedBy) {
      alert("Error: You must Start the job before marking it as Finished.");
      return;
    }
    if (!window.confirm("Are you sure you want to mark this job as finished?")) return;
    
    setIsSaving(true);
    try {
      const finishedAt = new Date().toISOString();
      const finishedBy = currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown';
      await propertiesService.update(selectedHouse.id, { employeeFinishedAt: finishedAt, employeeFinishedBy: finishedBy } as any);
      const updatedHouse = { ...selectedHouse, employeeFinishedAt: finishedAt, employeeFinishedBy: finishedBy };
      setSelectedHouse(updatedHouse);
      setProperties(properties.map(p => p.id === selectedHouse.id ? updatedHouse : p));
    } catch (error) {
      console.error("Error marking as finished:", error);
      alert("Failed to mark property as finished.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUndoFinished = async () => {
    if (!selectedHouse) return;
    if (!window.confirm("Undo finished status?")) return;
    setIsSaving(true);
    try {
      await propertiesService.update(selectedHouse.id, { employeeFinishedAt: null, employeeFinishedBy: null } as any);
      const updatedHouse = { ...selectedHouse, employeeFinishedAt: undefined, employeeFinishedBy: undefined };
      setSelectedHouse(updatedHouse);
      setProperties(properties.map(p => p.id === selectedHouse.id ? updatedHouse : p));
    } catch (error) {
      console.error("Error undoing finished status:", error);
      alert("Failed to undo finished status.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoogleCalendarSync = () => {
    if (!selectedHouse || !selectedHouse.scheduleDate || !selectedHouse.timeIn) {
      return alert("Por favor asegúrate de que la propiedad tenga fecha de Schedule y hora Time In.");
    }
    // ⭐ Hora "flotante" (local) exacta: respeta Time In y Time Out tal cual, sin
    //    convertir a UTC. Google Calendar interpreta YYYYMMDDTHHMMSS (sin 'Z') en la
    //    zona horaria del calendario, así que la hora/fecha se mantienen idénticas.
    const toMinutes = (t: string): number => {
      const s = String(t || '').trim();
      const ampm = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (ampm) { let h = (+ampm[1]) % 12; if (/PM/i.test(ampm[3])) h += 12; return h * 60 + (+ampm[2]); }
      const [hh = '0', mm = '0'] = s.split(':');
      return (+hh) * 60 + (+mm);
    };
    const shiftDate = (isoDate: string, addDays: number): string => {
      const y = +isoDate.slice(0, 4), mo = +isoDate.slice(5, 7), d = +isoDate.slice(8, 10);
      const nd = new Date(y, mo - 1, d + addDays);
      return `${nd.getFullYear()}${String(nd.getMonth() + 1).padStart(2, '0')}${String(nd.getDate()).padStart(2, '0')}`;
    };
    const fmtStamp = (isoDate: string, minutes: number): string => {
      const days = Math.floor(minutes / 1440);
      const mins = ((minutes % 1440) + 1440) % 1440;
      const datePart = days === 0 ? isoDate.replace(/-/g, '') : shiftDate(isoDate, days);
      const hh = String(Math.floor(mins / 60)).padStart(2, '0');
      const mm = String(mins % 60).padStart(2, '0');
      return `${datePart}T${hh}${mm}00`;
    };

    const startMin = toMinutes(selectedHouse.timeIn);
    // Respeta el Time Out real; si no hay, usa +2h como respaldo.
    let endMin = selectedHouse.timeOut ? toMinutes(selectedHouse.timeOut) : startMin + 120;
    if (endMin <= startMin) endMin = startMin + 120; // evita duración cero/negativa
    const startDateTime = fmtStamp(selectedHouse.scheduleDate, startMin);
    const endDateTime = fmtStamp(selectedHouse.scheduleDate, endMin);
    // ⭐ El evento SIEMPRE debe crearse en esta cuenta, nunca en otra.
    const CALENDAR_ACCOUNT_EMAIL = 'account@precisecleaningtx.com';
    const renderUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Cleaning: ' + getClientName(selectedHouse.client))}&dates=${startDateTime}/${endDateTime}&details=${encodeURIComponent(selectedHouse.note || '')}&location=${encodeURIComponent(selectedHouse.address)}&authuser=${encodeURIComponent(CALENDAR_ACCOUNT_EMAIL)}&sf=true&output=xml`;
    // Forzamos el selector de cuenta de Google a ese correo y de ahí continuamos al
    // formulario del evento. Si esa cuenta no está iniciada, Google pedirá entrar con ella,
    // garantizando que el evento nunca se cree bajo otra cuenta.
    const calendarUrl = `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(CALENDAR_ACCOUNT_EMAIL)}&continue=${encodeURIComponent(renderUrl)}`;
    window.open(calendarUrl, '_blank');
  };

  const toggleWorkerAssignmentDetail = async (workerId: string) => {
    if (!selectedHouse || !canEdit) return;
    setIsSaving(true);
    try {
      const currentWorkers = selectedHouse.assignedWorkers || [];
      const isAssigned = currentWorkers.includes(workerId);
      let newWorkersList = isAssigned ? currentWorkers.filter(id => id !== workerId) : [...currentWorkers, workerId];
      await propertiesService.update(selectedHouse.id, { assignedWorkers: newWorkersList } as any);
      const updatedHouse = { ...selectedHouse, assignedWorkers: newWorkersList };
      setSelectedHouse(updatedHouse);
      setProperties(properties.map(p => p.id === selectedHouse.id ? updatedHouse : p));
    } catch (error) {
      console.error("Error updating workers:", error);
      alert("Failed to update assigned workers.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleWorkerAssignmentForm = (workerId: string) => {
    const currentWorkers = formData.assignedWorkers || [];
    const isAssigned = currentWorkers.includes(workerId);
    let newWorkersList = isAssigned ? currentWorkers.filter(id => id !== workerId) : [...currentWorkers, workerId];
    setFormData({ ...formData, assignedWorkers: newWorkersList });
  };

  const handleOpenPayrollForm = (houseId: string) => {
    if (!houseId) return alert("Must save the house first.");
    setPayrollForm({ propertyId: houseId, date: new Date().toISOString().split('T')[0], employeeId: '', baseAmount: 0, extraAmount: 0, extraNote: '', discountAmount: 0, discountNote: '', totalAmount: 0 });
    setIsPayrollModalOpen(true);
  };

  const handleSavePayroll = async () => {
    if (!payrollForm.employeeId) return alert("Please select an employee.");
    if (Number(payrollForm.baseAmount) <= 0) return alert("Base amount must be greater than 0.");
    setIsSaving(true);
    try {
      const total = Number(payrollForm.baseAmount) + Number(payrollForm.extraAmount) - Number(payrollForm.discountAmount);
      const dataToSave = { ...payrollForm, totalAmount: total, status: 'Pending' as const };
      const newId = await payrollService.create(dataToSave);
      setHousePayrollRecords([...housePayrollRecords, { ...dataToSave, id: newId }]);
      setIsPayrollModalOpen(false);
      alert("Payment registered successfully.");
    } catch (error) {
      console.error("Error saving payroll:", error);
      alert("Error saving payment.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePayroll = async (id: string) => {
    if(!window.confirm("Delete this payment record?")) return;
    setIsSaving(true);
    try {
      await payrollService.delete(id);
      setHousePayrollRecords(housePayrollRecords.filter(r => r.id !== id));
    } catch(e) {
      console.error(e);
      alert("Error deleting record.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenServiceForm = (record?: ServiceRecord, fromForm = false) => {
    setIsServiceFromForm(fromForm);
    const propId = selectedHouse?.id || formData?.id || '';
    if (record) {
      setServiceForm(record);
    } else {
      const defaultTax = taxes.length > 0 ? Number(taxes[0].percentage) : 0;
      setServiceForm({ ...defaultServiceForm, propertyId: propId, taxPercentage: defaultTax });
    }
    setIsServiceModalOpen(true);
  };

  const handleSaveService = async () => {
    if (!serviceForm.serviceId) return alert("Please select a Product/Service.");
    if (serviceForm.price <= 0) return alert("Price must be greater than 0.");

    const dataToSave = { ...serviceForm, createdAt: serviceForm.createdAt || new Date().toISOString() };

    if (isServiceFromForm) {
      const newService = { ...dataToSave, id: serviceForm.id || `temp-${Date.now()}` };
      if (serviceForm.id) setFormServices(prev => prev.map(s => s.id === serviceForm.id ? newService : s));
      else setFormServices(prev => [newService, ...prev]);
      setIsServiceModalOpen(false);
      return;
    }

    setIsSaving(true);
    try {
      if (serviceForm.id) {
        await updateDoc(doc(db, 'billing_services', serviceForm.id), dataToSave as any);
        setHouseServices(houseServices.map(r => r.id === serviceForm.id ? dataToSave : r));
      } else {
        const docRef = await addDoc(collection(db, 'billing_services'), dataToSave);
        setHouseServices([{ ...dataToSave, id: docRef.id }, ...houseServices]);
      }
      setIsServiceModalOpen(false);
    } catch (error) {
      console.error("Error saving service record:", error);
      alert("Failed to save the record.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteService = async (id: string) => {
    if (!window.confirm("Delete this service record completely?")) return;
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, 'billing_services', id));
      setHouseServices(houseServices.filter(r => r.id !== id));
    } catch (error) {
      console.error("Error deleting service:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteServiceLocal = (id: string) => {
    if (!window.confirm("Remove this service from the list?")) return;
    if (!id.startsWith('temp-')) setServicesToDelete(prev => [...prev, id]);
    setFormServices(prev => prev.filter(s => s.id !== id));
  };

  const handleOpenForm = async (house?: Property) => {
    setIsAssigningWorkerForm(false);
    setServicesToDelete([]);
    
    if (house) {
      setFormData(house);
      setBeforePhotoURLs(house.beforePhotos || []);
      setAfterPhotoURLs(house.afterPhotos || []);
      setBeforeFiles([]);
      setAfterFiles([]);
      setBeforeExcluded(house.beforePhotosExcluded || []);
      setAfterExcluded(house.afterPhotosExcluded || []);
      refreshPendingCounts();
      try {
        const q = query(collection(db, 'billing_services'), where('propertyId', '==', house.id));
        const srvSnap = await getDocs(q);
        setFormServices(srvSnap.docs.map(d => ({ id: d.id, ...d.data() } as ServiceRecord)));
      } catch (error) {
        console.error("Error fetching form services:", error);
        setFormServices([]);
      }
    } else {
      const defaultStatus = statuses.length > 0 ? statuses[0].id : '';
      setFormData({ id: '', statusId: defaultStatus, invoiceStatus: 'Pending', receiveDate: new Date().toISOString().split('T')[0], scheduleDate: '', client: '', note: '', address: '', employeeNote: '', serviceId: '', rooms: '1', bathrooms: '1', priorityId: '', teamId: '', timeIn: '', timeOut: '', dateOfIssue: '', dueDate: '', beforePhotos: [], afterPhotos: [], assignedWorkers: [] });
      setFormServices([]);
      setBeforePhotoURLs([]);
      setAfterPhotoURLs([]);
      setBeforeFiles([]);
      setAfterFiles([]);
      setBeforeExcluded([]); 
      setAfterExcluded([]); 
      setPendingForHouse({before:0, after:0});
    }
    setSelectedHouse(house || null);
    setIsDetailModalOpen(false);
    setIsFormModalOpen(true);
  };

  const handleDuplicate = () => {
    if (!selectedHouse) return;
    setFormData({ ...selectedHouse, id: '', beforePhotos: [], afterPhotos: [] });
    setBeforePhotoURLs([]);
    setAfterPhotoURLs([]);
    setBeforeExcluded([]); 
    setAfterExcluded([]);
    setFormServices(houseServices.map(s => ({ ...s, id: `temp-${Math.random().toString(36).substring(2, 9)}`, propertyId: '' })));
    setServicesToDelete([]);
    setIsDetailModalOpen(false);
    setIsFormModalOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormModalOpen(false);
    setSelectedHouse(null);
  };

  const handleCustomerSelect = (customerId: string) => {
    const selectedCust = customersList.find(c => c.id === customerId);
    if (selectedCust) {
      // ⭐ Regla AppSheet: if([Type]="Private customer", lookup(client, Address), "")
      //    Si el cliente es "Private customer", trae su dirección (queda editable); si no, vacío.
      const isPrivate = String((selectedCust as any).type || '').toLowerCase().trim() === 'private customer';
      setFormData({ ...formData, client: customerId, address: isPrivate ? String((selectedCust as any).address || '') : '' });
    } else {
      setFormData({ ...formData, client: customerId });
    }
  };

  // ⭐ Abre el modal de cliente con el formulario limpio
  const handleOpenCustomerModal = () => {
    setCustomerForm({ type: 'Residential', color: '#3b82f6', name: '', businessName: '', email: '', phone: '', address: '', cityStateZip: '' });
    setIsCustomerModalOpen(true);
  };

  // ⭐ Guarda el nuevo cliente en 'customers', lo selecciona en la casa y cierra el modal
  const handleSaveNewCustomer = async () => {
    if (!customerForm.name.trim()) return alert('El nombre completo (Full Name) es obligatorio.');
    try {
      setIsSaving(true);
      const ref = await addDoc(collection(db, 'customers'), {
        type: customerForm.type,
        color: customerForm.color,
        name: customerForm.name.trim(),
        businessName: customerForm.businessName.trim(),
        email: customerForm.email.trim(),
        phone: customerForm.phone.trim(),
        address: customerForm.address.trim(),
        cityStateZip: customerForm.cityStateZip.trim(),
        createdAt: new Date().toISOString(),
      });
      // El listener de customersList lo recogerá automáticamente; ya lo dejamos seleccionado
      setFormData(prev => ({ ...prev, client: ref.id, address: customerForm.address.trim() || prev.address }));
      setIsCustomerModalOpen(false);
    } catch (e) {
      console.error('Error guardando cliente:', e);
      alert('No se pudo guardar el cliente. Intenta de nuevo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!formData.client) return alert("Client is required.");
    if (!formData.address) return alert("Address is required.");

    setIsSaving(true);
    try {
      let workingId = formData.id;
      let isNew = false;
      
      let finalAssignedWorkers = formData.assignedWorkers || [];
      if (formData.teamId && finalAssignedWorkers.length === 0) {
        finalAssignedWorkers = employees.filter(emp => emp.teamId === formData.teamId).map(emp => emp.id);
      }

      if (!workingId) {
        const { id, ...restOfData } = formData;
        const dataToCreate = { 
          ...restOfData,
          assignedWorkers: finalAssignedWorkers,
          description: `${getClientName(formData.client)} - ${formData.rooms} rooms`, 
          city: 'TBD', 
          size: 'TBD',
          beforePhotos: [],
          afterPhotos: []
        };
        const docRef = await propertiesService.create(dataToCreate as any);
        workingId = docRef;
        isNew = true;
        console.log('✅ New property created with ID:', workingId);
      }

      const beforeRes = await uploadOrQueue(beforeFiles, getClientName(formData.client), formData.address, 'before', workingId!);
      const afterRes  = await uploadOrQueue(afterFiles,  getClientName(formData.client), formData.address, 'after',  workingId!);
      const uploadedBeforeUrls = beforeRes.urls;
      const uploadedAfterUrls  = afterRes.urls;

      const finalDataToUpdate = {
        ...formData,
        assignedWorkers: finalAssignedWorkers,
        beforePhotos: [...(formData.beforePhotos || []), ...uploadedBeforeUrls],
        afterPhotos: [...(formData.afterPhotos || []), ...uploadedAfterUrls],
        beforePhotosExcluded: beforeExcluded,
        afterPhotosExcluded: afterExcluded,
      };

      const { id: _omitId, ...dataForFirestore } = finalDataToUpdate;
      await propertiesService.update(workingId, dataForFirestore as any);
      console.log('✅ Property updated in Firestore with photo URLs');

      for (const srvId of servicesToDelete) {
        await deleteDoc(doc(db, 'billing_services', srvId)).catch(e => console.error(e));
      }
      
      for (const srv of formServices) {
        const srvData = { ...srv, propertyId: workingId };
        if (srv.id && !srv.id.startsWith('temp-')) {
          const { id, ...updateData } = srvData;
          await updateDoc(doc(db, 'billing_services', id as string), updateData as any).catch(e => console.error(e));
        } else {
          const { id, ...createData } = srvData;
          await addDoc(collection(db, 'billing_services'), createData).catch(e => console.error(e));
        }
      }

      if (isNew) {
        const fullNewData = { 
          ...finalDataToUpdate, 
          id: workingId, 
          description: `${getClientName(formData.client)} - ${formData.rooms} rooms`, 
          city: 'TBD', 
          size: 'TBD' 
        };
        setProperties([...properties, fullNewData as Property]);
      } else {
        setProperties(properties.map(p => 
          p.id === workingId ? { ...finalDataToUpdate, id: workingId } as Property : p
        ));
      }

      setBeforeFiles([]); 
      setAfterFiles([]);
      setBeforePhotoURLs([]); 
      setAfterPhotoURLs([]);

      const queued = beforeRes.queued + afterRes.queued;
      if (queued > 0) alert(`Sin conexión: ${queued} foto(s) se subirán automáticamente al recuperar internet.`);
      await refreshPendingCounts();

      handleCloseForm();

    } catch (error) {
      console.error("❌ Error saving to Firebase:", error);
      alert("Error trying to save property to Firebase. Check console.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePhotosFromDetail = async () => {
    if (!selectedHouse) return alert("No property selected.");

    setIsSaving(true);
    try {
      const workingId = selectedHouse.id;

      const beforeRes = await uploadOrQueue(beforeFiles, getClientName(selectedHouse.client), selectedHouse.address, 'before', workingId);
      const afterRes  = await uploadOrQueue(afterFiles,  getClientName(selectedHouse.client), selectedHouse.address, 'after',  workingId);
      const uploadedBeforeUrls = beforeRes.urls;
      const uploadedAfterUrls  = afterRes.urls;

      const existingBeforeFromStorage = (selectedHouse.beforePhotos || []).filter(u => u.startsWith('http'));
      const existingAfterFromStorage = (selectedHouse.afterPhotos || []).filter(u => u.startsWith('http'));

      const finalBeforePhotos = [...existingBeforeFromStorage, ...uploadedBeforeUrls];
      const finalAfterPhotos = [...existingAfterFromStorage, ...uploadedAfterUrls];

      await propertiesService.update(workingId, {
        beforePhotos: finalBeforePhotos,
        afterPhotos: finalAfterPhotos,
        beforePhotosExcluded: beforeExcluded,
        afterPhotosExcluded: afterExcluded
      } as any);
      console.log('✅ Property updated in Firestore with photo URLs');

      const updatedHouse = {
        ...selectedHouse,
        beforePhotos: finalBeforePhotos,
        afterPhotos: finalAfterPhotos
      };
      setSelectedHouse(updatedHouse);
      setProperties(properties.map(p => p.id === workingId ? updatedHouse : p));

      setBeforePhotoURLs(finalBeforePhotos);
      setAfterPhotoURLs(finalAfterPhotos);

      setBeforeFiles([]);
      setAfterFiles([]);

      const queued = beforeRes.queued + afterRes.queued;
      await refreshPendingCounts();
      alert(queued > 0 
        ? `Guardado. ${queued} foto(s) se subirán al recuperar conexión.` 
        : 'Photos saved successfully!');
      return; 
    } catch (error) {
      console.error("❌ Error saving photos:", error);
      alert("Error saving photos. Check console.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if(!selectedHouse) return;
    if (!window.confirm("Are you sure you want to completely delete this job and all its related records?")) return;

    setIsSaving(true);
    try {
      const relatedPayrolls = await payrollService.getByPropertyId(selectedHouse.id);
      if (relatedPayrolls.length > 0) {
        await Promise.all(relatedPayrolls.map(record => payrollService.delete(record.id as string)));
      }
      if (houseServices.length > 0) {
        await Promise.all(houseServices.map(record => deleteDoc(doc(db, 'billing_services', record.id as string))));
      }
      await propertiesService.delete(selectedHouse.id);
      setProperties(properties.filter(p => p.id !== selectedHouse.id));
      setIsDetailModalOpen(false);
    } catch (error) {
      console.error("Error deleting from Firebase:", error);
      alert("Error trying to delete property.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenDetail = async (house: Property) => {
    setSelectedHouse(house);
    setIsAssigningWorker(false);
    setActiveDetailTab('overview');
    setBeforeFiles([]);
    setAfterFiles([]);
    setBeforePhotoURLs(house.beforePhotos || []);
    setAfterPhotoURLs(house.afterPhotos || []);
    setIsDetailModalOpen(true);

    try {
      setBeforeExcluded(house.beforePhotosExcluded || []);
      setAfterExcluded(house.afterPhotosExcluded || []);
      const pend = await getPendingByProperty(house.id);
      setPendingForHouse({
        before: pend.filter(p => p.type === 'before').length,
        after: pend.filter(p => p.type === 'after').length,
      });

      const pRecords = await payrollService.getByPropertyId(house.id);
      setHousePayrollRecords(pRecords);

      const q = query(collection(db, 'billing_services'), where('propertyId', '==', house.id));
      const srvSnap = await getDocs(q);
      const srvRecords = srvSnap.docs.map(d => ({ id: d.id, ...d.data() } as ServiceRecord));
      setHouseServices(srvRecords);
    } catch (error) {
      console.error("Error fetching detail records:", error);
    }
  };

  const handleRemovePhoto = (index: number, type: 'before' | 'after') => {
    const removedUrl = (type === 'before' ? beforePhotoURLs : afterPhotoURLs)[index];
    const isFormOpen = isFormModalOpen;

    if (type === 'before') {
      const newUrls = [...beforePhotoURLs];
      newUrls.splice(index, 1);
      setBeforePhotoURLs(newUrls);
      
      const storedCount = (isFormOpen ? formData.beforePhotos?.length : selectedHouse?.beforePhotos?.length) || 0;
      
      if (index >= storedCount) {
        const fileIndex = index - storedCount;
        const newFiles = [...beforeFiles];
        newFiles.splice(fileIndex, 1);
        setBeforeFiles(newFiles);
      } else {
        if (isFormOpen) {
          const updatedFormDataPhotos = [...(formData.beforePhotos || [])];
          updatedFormDataPhotos.splice(index, 1);
          setFormData({ ...formData, beforePhotos: updatedFormDataPhotos });
        }
      }
    } else {
      const newUrls = [...afterPhotoURLs];
      newUrls.splice(index, 1);
      setAfterPhotoURLs(newUrls);
      
      const storedCount = (isFormOpen ? formData.afterPhotos?.length : selectedHouse?.afterPhotos?.length) || 0;

      if (index >= storedCount) {
        const fileIndex = index - storedCount;
        const newFiles = [...afterFiles];
        newFiles.splice(fileIndex, 1);
        setAfterFiles(newFiles);
      } else {
         if (isFormOpen) {
          const updatedFormDataPhotos = [...(formData.afterPhotos || [])];
          updatedFormDataPhotos.splice(index, 1);
          setFormData({ ...formData, afterPhotos: updatedFormDataPhotos });
        }
      }
    }

    if (type === 'before') setBeforeExcluded(prev => prev.filter(u => u !== removedUrl));
    else setAfterExcluded(prev => prev.filter(u => u !== removedUrl));
  };

  const generatePDF = async (type: 'before' | 'after') => {
    const excluded = type === 'before' ? beforeExcluded : afterExcluded;
    const urls = (type === 'before' ? beforePhotoURLs : afterPhotoURLs)
      .filter(u => !excluded.includes(u));

    if (urls.length === 0) {
      alert(`No hay fotos de tipo "${type.toUpperCase()}" subidas para generar el reporte.`);
      return;
    }

    setIsSaving(true);

    try {
      console.log(`📥 Preparing ${urls.length} images for PDF...`);
      const base64Images = await Promise.all(
        urls.map(async (url, idx) => {
          try {
            const response = await fetch(url, { mode: 'cors' });
            const blob = await response.blob();
            return await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (err) {
            console.error(`Error loading image ${idx + 1}:`, err);
            return url;
          }
        })
      );
      console.log(`✅ All images ready for PDF`);

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert("Por favor permite las ventanas emergentes (pop-ups) para generar el PDF.");
        setIsSaving(false);
        return;
      }

      const title = type === 'before' ? 'Before Photos' : 'After Photos';
      const accentColor = type === 'before' ? '#1e3a8a' : '#047857';
      const clientLabel = selectedHouse?.client ? getClientName(selectedHouse.client) : 'Propiedad';

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8" />
            <title>${title} - ${clientLabel}</title>
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background-color: #f1f5f9;
                padding: 24px;
                color: #1e293b;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .container {
                max-width: 1000px;
                margin: 0 auto;
                background: white;
                border-radius: 12px;
                padding: 48px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.05);
              }
              .header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                padding-bottom: 24px;
                border-bottom: 1px solid #e2e8f0;
                margin-bottom: 32px;
              }
              .logo-section { display: flex; align-items: center; gap: 12px; }
              .logo-text {
                font-size: 22px; font-weight: 800; color: #1e3a8a;
                letter-spacing: 2px; line-height: 1;
              }
              .logo-subtitle {
                font-size: 10px; font-weight: 500; color: #64748b;
                letter-spacing: 3px; text-transform: uppercase; margin-top: 4px;
              }
              .address-section { text-align: right; font-size: 13px; color: #475569; max-width: 60%; }
              .address-label { font-weight: 700; color: #0f172a; margin-bottom: 2px; }
              h1.report-title {
                text-align: center; font-size: 38px; font-weight: 800;
                color: ${accentColor}; margin: 40px 0 32px 0;
              }
              .photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
              .photo-item {
                aspect-ratio: 1 / 1; border-radius: 8px; overflow: hidden;
                box-shadow: 0 4px 8px rgba(0,0,0,0.12);
                background-color: #f1f5f9; page-break-inside: avoid;
              }
              .photo-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
              .footer {
                margin-top: 40px; padding-top: 20px;
                border-top: 1px solid #e2e8f0;
                text-align: center; font-size: 11px; color: #94a3b8;
              }
              @media print {
                @page { margin: 12mm; size: A4; }
                body { background: white; padding: 0; }
                .container { box-shadow: none; padding: 0; max-width: 100%; }
                .photo-item { break-inside: avoid; }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="logo-section">
                  <div>
                    <div class="logo-text">PRECISE CLEANING</div>
                    <div class="logo-subtitle">Professional Services</div>
                  </div>
                </div>
                <div class="address-section">
                  <div class="address-label">Address:</div>
                  <div>${selectedHouse?.address || 'N/A'}</div>
                </div>
              </div>

              <h1 class="report-title">${title}</h1>

              <div class="photo-grid">
                ${base64Images.map(src => `
                  <div class="photo-item">
                    <img src="${src}" alt="${type} photo" />
                  </div>
                `).join('')}
              </div>

              <div class="footer">
                ${clientLabel} • Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
            <script>
              window.addEventListener('load', function() {
                const images = document.querySelectorAll('img');
                if (images.length === 0) {
                  setTimeout(() => window.print(), 300);
                  return;
                }
                let loaded = 0;
                const checkDone = () => {
                  loaded++;
                  if (loaded >= images.length) {
                    setTimeout(() => window.print(), 500);
                  }
                };
                images.forEach(img => {
                  if (img.complete) { checkDone(); }
                  else {
                    img.addEventListener('load', checkDone);
                    img.addEventListener('error', checkDone);
                  }
                });
              });
            </script>
          </body>
        </html>
      `;

      printWindow.document.write(html);
      printWindow.document.close();
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error al generar el PDF. Revisa la consola.');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const total = Number(payrollForm.baseAmount || 0) + Number(payrollForm.extraAmount || 0) - Number(payrollForm.discountAmount || 0);
    setPayrollForm(prev => ({ ...prev, totalAmount: total }));
  }, [payrollForm.baseAmount, payrollForm.extraAmount, payrollForm.discountAmount]);

  const invoiceOptions = [{ id: 'Pre-Paid', name: 'Pre-Paid' }, { id: 'Needs Invoice', name: 'Needs Invoice' }, { id: 'Pending', name: 'Pending' }, { id: 'Paid', name: 'Paid' }, { id: 'Not Charged', name: 'Not Charged' }];
  const roomOptions = [1, 2, 3, 4, 5].map(n => ({ id: String(n), name: String(n) }));
  const kpiIcons = [Briefcase, Clock, ShieldCheck, AlertTriangle];

  const dateFormatted = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dateCapitalized = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);

  const totalBilled = houseServices.reduce((sum, r) => sum + r.total, 0);
  const totalPayroll = housePayrollRecords.reduce((sum, r) => sum + r.totalAmount, 0);
  const netProfit = totalBilled - totalPayroll;

  const formTotalBilled = formServices.reduce((sum, r) => sum + r.total, 0);

  const s = {
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 },
    title: { fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: 0 },
    body: { padding: '36px 40px', overflowY: 'auto', paddingBottom: '60px', flex: 1, minHeight: 0 } as React.CSSProperties, 
    footer: { display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', borderRadius: '0 0 12px 12px', flexShrink: 0, flexWrap: 'wrap' } as React.CSSProperties,
    footerBetween: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '16px 24px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', borderRadius: '0 0 12px 12px', flexShrink: 0, flexWrap: 'wrap' } as React.CSSProperties,

    label: { fontSize: '0.8rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', display: 'block' } as React.CSSProperties,
    inputWrapper: { position: 'relative', display: 'flex', alignItems: 'center', width: '100%' } as React.CSSProperties,
    icon: { position: 'absolute', left: '14px', color: '#6b7280', pointerEvents: 'none' } as React.CSSProperties,
    input: { backgroundColor: '#ffffff', padding: '10px 14px 10px 40px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.95rem', color: '#111827', width: '100%', boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.2s' } as React.CSSProperties,

    actionBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '36px', padding: '0 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', transition: 'all 0.2s', boxSizing: 'border-box' as const, whiteSpace: 'nowrap' as const },
    btnPrimary: { backgroundColor: '#3b82f6', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s', opacity: isSaving ? 0.7 : 1 } as React.CSSProperties,
    btnOutline: { backgroundColor: 'white', border: '1px solid #e5e7eb', color: '#111827', padding: '10px 20px', borderRadius: '6px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' } as React.CSSProperties,
    btnDangerLight: { backgroundColor: '#fef2f2', color: '#ef4444', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' } as React.CSSProperties,
    closeBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '4px' },

    infoCard: { backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' as const },
    infoHeader: { backgroundColor: '#f8fafc', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#334155', fontSize: '0.8rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
    infoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f1f5f9' },
    infoLabel: { color: '#64748b', fontSize: '0.85rem', fontWeight: 600 },
    infoValue: { color: '#1e293b', fontSize: '0.9rem', fontWeight: 600, textAlign: 'right' as const, display: 'flex', alignItems: 'center', gap: '6px' },

    detailLabel: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280', fontWeight: 600 } as React.CSSProperties,
    detailValue: { fontSize: '1.05rem', color: '#111827', fontWeight: 500, marginTop: '4px', whiteSpace: 'pre-wrap' } as React.CSSProperties,
    noteBoxGray: { backgroundColor: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb', width: '100%' } as React.CSSProperties,
    noteBoxOrange: { backgroundColor: '#fff7ed', padding: '16px', borderRadius: '8px', border: '1px solid #ffedd5', width: '100%' } as React.CSSProperties,

    kpiCard: { backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' },
    kpiIconBox: (color: string) => ({ backgroundColor: `${color}15`, color: color, width: '38px', height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }),
    tableHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: '16px', flexShrink: 0 } as React.CSSProperties,
    pillBtn: (active: boolean) => ({ padding: '6px 16px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: active ? '#10b981' : 'transparent', color: active ? 'white' : '#6b7280', transition: 'all 0.2s', whiteSpace: 'nowrap' as const }),

    th: { padding: '12px 20px', textAlign: 'left' as const, fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' as const },
    td: { padding: '16px 20px', borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem', color: '#111827', verticalAlign: 'middle' as const },

    dashGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '16px', marginBottom: '24px', flexShrink: 0 } as React.CSSProperties,
    mainColumns: { display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'flex-start', flex: 1, minHeight: 0, overflow: 'hidden' } as React.CSSProperties,

    segmentContainer: { display: 'flex', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '8px', gap: '4px' },
    segmentBtn: (active: boolean, type: 'yes' | 'no') => ({ 
      flex: 1, height: '32px', borderRadius: '6px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s', border: 'none',
      backgroundColor: active ? 'white' : 'transparent', 
      boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', 
      color: active ? (type === 'yes' ? '#10b981' : '#ef4444') : '#64748b'
    }),
    detailTab: (active: boolean) => ({ 
      padding: '10px 4px', border: 'none', borderBottom: active ? '3px solid #3b82f6' : '3px solid transparent', 
      color: active ? '#1e40af' : '#64748b', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', 
      background: 'none', transition: 'all 0.2s', marginBottom: '-1px' 
    }),
  };

  return (
    <div className="fade-in houses-view" style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .fade-in *::-webkit-scrollbar { width: 6px; height: 6px; }
        .fade-in *::-webkit-scrollbar-track { background: transparent; }
        .fade-in *::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.25); border-radius: 10px; transition: background 0.2s ease; }
        .fade-in *::-webkit-scrollbar-thumb:hover { background: rgba(100, 116, 139, 0.55); }
        .fade-in *::-webkit-scrollbar-corner { background: transparent; }
        .fade-in * { scrollbar-width: thin; scrollbar-color: rgba(148, 163, 184, 0.25) transparent; }

        .modal-overlay-centered *::-webkit-scrollbar { width: 6px; height: 6px; }
        .modal-overlay-centered *::-webkit-scrollbar-track { background: transparent; }
        .modal-overlay-centered *::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.25); border-radius: 10px; transition: background 0.2s ease; }
        .modal-overlay-centered *::-webkit-scrollbar-thumb:hover { background: rgba(100, 116, 139, 0.55); }
        .modal-overlay-centered *::-webkit-scrollbar-corner { background: transparent; }
        .modal-overlay-centered * { scrollbar-width: thin; scrollbar-color: rgba(148, 163, 184, 0.25) transparent; }
        .modal-overlay-centered { position: fixed; inset: 0; background-color: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 9999; box-sizing: border-box; }
        .modal-70 { background-color: #ffffff; width: 100%; max-width: 1000px; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); display: flex; flex-direction: column; max-height: 90vh; }
        .modal-90 { background-color: #ffffff; width: 100%; max-width: 1500px; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); display: flex; flex-direction: column; max-height: 95vh; }
        
        .modal-90 .modal-body-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .modal-90 .modal-body-scroll::-webkit-scrollbar-track { background: transparent; }
        .modal-90 .modal-body-scroll::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.4); border-radius: 10px; }
        .modal-90 .modal-body-scroll::-webkit-scrollbar-thumb:hover { background: rgba(100, 116, 139, 0.6); }
        .modal-90 .modal-body-scroll { scrollbar-width: thin; scrollbar-color: rgba(148, 163, 184, 0.4) transparent; }
        
        .modal-full { width: 95vw; max-width: 1400px; height: 90vh; background-color: #F8FAFC; border-radius: 12px; display: flex; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
        .modal-full-left { flex: 1; overflow-y: auto; padding: 3rem 2rem; }
        .modal-full-right { width: 380px; background-color: white; border-left: 1px solid #E2E8F0; display: flex; flex-direction: column; z-index: 5; flex-shrink: 0; }

        /* === MODAL DE CAMBIO DE ESTADO (reemplaza la lista desplegable) === */
        .status-modal {
          background-color: #ffffff; width: 100%; max-width: 480px;
          border-radius: 18px; box-shadow: 0 24px 48px -12px rgba(15,23,42,0.35);
          display: flex; flex-direction: column; max-height: 85vh; overflow: hidden;
          animation: statusModalIn 0.18s ease-out;
        }
        @keyframes statusModalIn { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
        .status-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 20px 22px; border-bottom: 1px solid #eef2f7; flex-shrink: 0; }
        .status-modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 20px 22px; overflow-y: auto; }
        .status-option { font-family: inherit; }
        .status-option:hover { border-color: #93c5fd !important; }
        .status-modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 22px; border-top: 1px solid #eef2f7; flex-shrink: 0; background: #ffffff; }
        .status-btn-cancel { padding: 11px 18px; border-radius: 10px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-weight: 700; font-size: 0.9rem; cursor: pointer; transition: background 0.15s; }
        .status-btn-cancel:hover { background: #f8fafc; }
        .status-btn-accept { padding: 11px 20px; border-radius: 10px; border: none; background: #2563eb; color: #ffffff; font-weight: 700; font-size: 0.9rem; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 10px rgba(37,99,235,0.25); transition: background 0.15s; }
        .status-btn-accept:hover:not(:disabled) { background: #1d4ed8; }
        .status-btn-accept:disabled { cursor: not-allowed; box-shadow: none; }

        @media (max-width: 1024px) {
          .left-col, .right-col { flex: 1 1 100%; width: 100%; max-width: 100%; height: auto; }
          .main-columns { overflow: visible; }
          .houses-view { height: auto !important; min-height: 100%; }
          .left-col > div, .right-col > div { height: auto !important; }
        }

        @media (min-width: 769px) { 
          .modal-70 { width: 70%; } 
          .modal-90 { width: 95%; }
        }
        
        .grid-3-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 24px; }
        .col-span-full { grid-column: 1 / -1; }
        
        .view-header-title-group { display: flex; align-items: center; gap: 16px; }

        .hamburger-btn { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px; cursor: pointer; color: #111827; display: flex; align-items: center; justify-content: center; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .hamburger-btn:hover { background-color: #f8fafc; }
        
        .filters-section { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; width: 100%; justify-content: space-between; margin-top: 16px; }
        .tabs-container { display: flex; gap: 8px; flex-wrap: wrap; flex: 1; }
        .property-select-container { display: flex; align-items: center; gap: 8px; white-space: nowrap; position: relative; }

        .left-col { flex: 1 1 0%; min-width: 0; display: flex; flex-direction: column; height: 100%; }
        .right-col { flex: 0 0 300px; width: 300px; display: flex; flex-direction: column; height: 100%; }

        @media (max-width: 1024px) {
          .left-col, .right-col { flex: 1 1 100%; width: 100%; max-width: 100%; height: auto; }
          .main-columns { overflow: auto; }
        }

        /* Por defecto (escritorio): tabla visible, tarjetas ocultas */
        .jobs-cards-wrap { display: none; }

        @media (max-width: 768px) {
          .view-header-title-group { flex-direction: row-reverse; justify-content: space-between; width: 100%; }
          .grid-3-cols { grid-template-columns: 1fr; gap: 16px; }

          .add-btn-mobile { height: 48px !important; font-size: 0.95rem !important; padding: 0 22px !important; border-radius: 12px !important; }
          .search-box-container { height: 48px !important; }
          .filters-section { flex-direction: column; align-items: stretch; }
          .property-select-container { width: 100%; }
          .property-select-container > button { width: 100%; justify-content: center; height: 46px; border-radius: 12px; }

          .jobs-table-wrap { display: none !important; }
          .jobs-cards-wrap { display: flex !important; }

          .modal-90 > header > div:last-child > button {
            height: 44px !important; min-height: 44px !important;
            padding: 0 16px !important; border-radius: 10px !important; font-size: 0.9rem !important;
          }
          .modal-full-right button { padding: 1rem !important; font-size: 1rem !important; min-height: 50px; }
          .modal-70 footer button,
          .modal-90 footer button { min-height: 46px !important; padding: 12px 18px !important; border-radius: 10px !important; }
        }
        
        .mobile-action-text { display: none; }

        .houses-view { overflow-x: hidden; max-width: 100%; }
        .dashboard-actions-wrapper { flex-wrap: wrap; }

        @media (max-width: 768px) {
          html, body { overflow-x: hidden; max-width: 100%; }
          .houses-view { padding: 14px !important; }

          .dashboard-actions-wrapper { width: 100%; }
          .search-box-container { flex: 1 1 100% !important; min-width: 0 !important; }
          .add-btn-mobile { flex: 1 1 auto; }

          .modal-overlay-centered { padding: 0 !important; }
          .modal-full { flex-direction: column; width: 100vw; max-width: 100vw; height: 100vh; height: 100dvh; border-radius: 0; }
          .modal-full-left { padding: 1.25rem 1rem !important; width: 100%; }
          .modal-full-right { width: 100% !important; border-left: none; border-top: 1px solid #E2E8F0; }
          .modal-70, .modal-90 { width: 100vw !important; max-width: 100vw !important; max-height: 100vh; max-height: 100dvh; border-radius: 0; }
          .modal-90 .modal-body-scroll { padding: 18px 16px !important; }
          .modal-70 > div { padding: 18px 16px !important; }
          .modal-70 header, .modal-90 header { padding: 16px !important; }
          .modal-70 footer, .modal-90 footer { padding: 14px 16px !important; }

          /* En móvil el modal de estado entra como hoja inferior (bottom sheet) */
          .status-modal-overlay { align-items: flex-end !important; }
          .status-modal {
            max-width: 100% !important; width: 100% !important;
            border-radius: 22px 22px 0 0 !important; max-height: 82vh;
            animation: statusSheetIn 0.22s ease-out;
          }
          .status-modal-grid { grid-template-columns: 1fr !important; gap: 10px; padding: 18px 16px; }
          .status-option { min-height: 60px !important; padding: 16px !important; font-size: 1rem; }
          .status-modal-foot { padding: 14px 16px calc(14px + env(safe-area-inset-bottom)); }
          .status-btn-cancel, .status-btn-accept { flex: 1; justify-content: center; min-height: 50px; }
        }
        @keyframes statusSheetIn { from { transform: translateY(100%); } to { transform: translateY(0); } }

        @media (max-width: 480px) {
          .houses-view { padding: 10px !important; }
        }
      `}</style>

      {/* DASHBOARD HEADER */}
      <header className="main-header dashboard-header-container" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px', flexShrink: 0 }}>
        <div className="view-header-title-group">
          <button className="hamburger-btn" onClick={onOpenMenu} aria-label="Open menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div>
            <h1 style={{ margin: 0, color: '#111827', fontSize: '1.8rem', fontWeight: 700 }}>Overview</h1>
            <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '0.95rem' }}>General operations overview</p>
          </div>
        </div>

        <div className="dashboard-actions-wrapper" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          
          {(!isOnline || pendingTotal > 0) && (
            <div title={isOnline ? 'Subiendo fotos pendientes…' : 'Sin conexión'}
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 42, padding: '0 14px',
                borderRadius: 20, fontSize: '0.8rem', fontWeight: 700,
                background: isOnline ? '#fffbeb' : '#fef2f2',
                color: isOnline ? '#b45309' : '#b91c1c',
                border: `1px solid ${isOnline ? '#fde68a' : '#fecaca'}` }}>
              <CloudOff size={14} /> {isOnline ? `${pendingTotal} por subir` : 'Offline'}
            </div>
          )}

          <div className="search-box-container" style={{ display: 'flex', alignItems: 'center', backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '20px', padding: '0 16px', height: '42px', flex: 1, minWidth: '200px' }}>
            <Search size={16} color="#9ca3af" />
            <input 
              type="text" 
              placeholder="Buscar por dirección o cliente..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ backgroundColor: 'transparent', border: 'none', outline: 'none', padding: '10px', fontSize: '0.9rem', width: '100%', color: '#111827', minWidth: 0 }} 
            />
          </div>
          
          {(isSuperAdmin || activeRole?.permissions?.find(p => p.module === 'Houses')?.canAdd) && (
            <button className="add-btn-mobile" onClick={() => handleOpenForm()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#111827', color: 'white', border: 'none', padding: '0 20px', height: '42px', borderRadius: '20px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', flexShrink: 0 }}>
              <Plus size={16} /> New Job
            </button>
          )}
        </div>
      </header>

      <div className="dash-grid" style={s.dashGrid}>
        {isLoading ? (
          <div style={{ color: '#6b7280' }}>Loading metrics...</div>
        ) : (
          statuses.slice(0, 4).map((status, index) => {
            const Icon = kpiIcons[index % kpiIcons.length];
            const count = propertiesWithScope.filter(p => p.statusId === status.id || p.statusId === status.name).length;
            const isActive = activeFilter === status.name;
            return (
              <div 
                style={{ 
                  ...s.kpiCard, 
                  cursor: 'pointer', 
                  border: `1px solid ${isActive ? status.color : '#e5e7eb'}`,
                  boxShadow: isActive 
                    ? `0 0 0 2px ${status.color}30, 0 1px 3px rgba(0,0,0,0.05)` 
                    : '0 1px 3px rgba(0,0,0,0.03)',
                  transition: 'all 0.2s ease'
                }} 
                key={status.id}
                onClick={() => setActiveFilter(isActive ? 'All' : status.name)}
                title={isActive ? 'Click para limpiar filtro' : `Filtrar trabajos por ${status.name}`}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.borderColor = status.color; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.borderColor = '#e5e7eb'; }}
              >
                <div style={s.kpiIconBox(status.color)}><Icon size={18} /></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{status.name}</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', lineHeight: '1.2' }}>{count}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {viewMode === 'board' ? (
        <PipelineBoardView
          properties={filteredProperties}
          statuses={statuses}
          teams={teams}
          priorities={priorities}
          getClientName={getClientName}
          onOpenDetail={handleOpenDetail}
          onQuickStatusChange={handleQuickStatusChange}
          canEdit={!!canEdit}
          isSaving={isSaving}
        />
      ) : (
        <div className="main-columns" style={s.mainColumns}>

          {/* LEFT COLUMN: DAILY JOBS */}
          <div className="left-col">
            <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', height: '100%' }}>
              
              <div style={s.tableHeader}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#111827', fontWeight: 700 }}>Daily Jobs</h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#6b7280' }}>{dateCapitalized}</p>
                </div>

                <div className="filters-section">
                  <div className="tabs-container">
                    <button onClick={() => setActiveFilter('All')} style={s.pillBtn(activeFilter === 'All')}>All</button>
                    {dashboardTabs.map(st => (
                      <button key={st.id} onClick={() => setActiveFilter(st.name)} style={s.pillBtn(activeFilter === st.name)}>
                        {st.name}
                      </button>
                    ))}
                  </div>

                  <div className="property-select-container">
                    <button 
                      onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
                      style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '20px', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#475569', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      <Filter size={16} /> Filters {(houseFilter !== 'All' || invoiceFilter !== 'All' || statusFilter !== 'All' || priorityFilter !== 'All') && <span style={{backgroundColor: '#3b82f6', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem'}}>!</span>}
                    </button>

                    {isFilterMenuOpen && (
                      <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', padding: '16px', zIndex: 100, minWidth: '220px', maxWidth: 'calc(100vw - 28px)', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Status</label>
                          <select 
                            style={{...s.input, padding: '8px 12px', cursor: 'pointer'}} 
                            value={statusFilter} 
                            onChange={e => setStatusFilter(e.target.value)}
                          >
                            <option value="All">All Statuses</option>
                            {statuses.map(st => (
                              <option key={st.id} value={st.id}>{st.name}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Priority</label>
                          <select 
                            style={{...s.input, padding: '8px 12px', cursor: 'pointer'}} 
                            value={priorityFilter} 
                            onChange={e => setPriorityFilter(e.target.value)}
                          >
                            <option value="All">All Priorities</option>
                            {priorities.map(pr => (
                              <option key={pr.id} value={pr.id}>{pr.name}</option>
                            ))}
                          </select>
                        </div>
                        
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Property</label>
                          <select 
                            style={{...s.input, padding: '8px 12px', cursor: 'pointer'}} 
                            value={houseFilter} 
                            onChange={e => setHouseFilter(e.target.value)}
                          >
                            <option value="All">All Properties</option>
                            {uniqueHouses.map((h, idx) => (
                              <option key={idx} value={`${h.client}|${h.address}`}>{getClientName(h.client)} - {h.address}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Invoice Status</label>
                          <select 
                            style={{...s.input, padding: '8px 12px', cursor: 'pointer'}} 
                            value={invoiceFilter} 
                            onChange={e => setInvoiceFilter(e.target.value)}
                          >
                            <option value="All">All Invoices</option>
                            <option value="Pre-Paid">Pre-Paid</option>
                            <option value="Pending">Pending</option>
                            <option value="Paid">Paid</option>
                            <option value="Needs Invoice">Needs Invoice</option>
                          </select>
                        </div>

                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ====== VISTA TABLA (escritorio) ====== */}
              <div className="jobs-table-wrap" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{...s.th, position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1}}>Schedule</th>
                      <th style={{...s.th, position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1}}>Client</th>
                      <th style={{...s.th, position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1}}>Time</th>
                      <th style={{...s.th, position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1}}>Type</th>
                      <th style={{...s.th, position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1}}>Team</th>
                      <th style={{...s.th, position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1}}>Status</th>
                      <th style={{ ...s.th, width: '100px', textAlign: 'right', position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr><td colSpan={7} style={{textAlign: 'center', padding: '40px', color: '#6b7280'}}>Loading database...</td></tr>
                    ) : filteredProperties.length === 0 ? (
                      <tr><td colSpan={7} style={{textAlign: 'center', padding: '40px', color: '#6b7280', fontStyle: 'italic'}}>No jobs to display for your team.</td></tr>
                    ) : filteredProperties.map((prop) => {
                      const teamName = getRelationName(teams, prop.teamId, 'Unassigned');
                      const serviceName = getRelationName(services, prop.serviceId, 'Regular');
                      const prObj = priorities.find(pp => pp.id === prop.priorityId || pp.name === prop.priorityId);
                      const isHighPriority = prObj?.name?.toLowerCase() === 'high' || prop.priorityId?.toLowerCase() === 'high';

                      return (
                        <tr key={prop.id} onClick={() => handleOpenDetail(prop)} style={{ cursor: 'pointer', transition: 'background-color 0.2s', backgroundColor: isHighPriority ? '#fffafa' : 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isHighPriority ? '#fffafa' : 'transparent'}>
                          <td data-label="Schedule" style={{ ...s.td, color: '#6b7280' }}>
                            <CalendarDays size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {prop.scheduleDate ? formatDate(prop.scheduleDate) : '-'}
                          </td>
                          <td data-label="Client" style={s.td}>
                            <div className="mobile-client-cell">
                              <div style={{ fontWeight: 600, color: '#111827', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                {isHighPriority && (
                                  <span title="HIGH priority" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                    <AlertTriangle size={11} /> HIGH
                                  </span>
                                )}
                                {getClientName(prop.client)}
                                {(prop as any).employeeFinishedBy && <span title="Finished" style={{ display: 'flex' }}><CheckCircle size={14} color="#10b981" /></span>}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> {prop.address}</div>
                            </div>
                          </td>
                          <td data-label="Time" style={{ ...s.td, color: '#6b7280' }}><Clock size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {prop.timeIn || '08:00 AM'}</td>
                          <td data-label="Type" style={{ ...s.td, fontWeight: 500 }}>{serviceName}</td>
                          <td data-label="Team" style={{ ...s.td, color: '#6b7280' }}>{teamName}</td>
                          <td data-label="Status" style={s.td}>
                            <StatusPillSelector currentStatusId={prop.statusId} statuses={statuses} onChange={(newId) => handleQuickStatusChange(prop.id, newId)} disabled={isSaving || !canEdit || !isVisible('workflow')} onRequestOpen={setStatusModal} modalTitle={getClientName(prop.client)} modalSubtitle={prop.address} />
                          </td>
                          <td data-label="Actions" style={{ ...s.td, textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', width: '100%' }}>
                              {canEdit && isVisible('admin') && (
                                <button className="action-btn-edit" onClick={(e) => { e.stopPropagation(); handleOpenForm(prop); }} style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Edit2 size={16} /> <span className="mobile-action-text">Editar</span>
                                </button>
                              )}
                              {canDelete && isVisible('admin') && (
                                <button className="action-btn-delete" onClick={(e) => { e.stopPropagation(); setSelectedHouse(prop); handleDelete(); }} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Trash2 size={16} /> <span className="mobile-action-text">Eliminar</span>
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

              {/* ====== VISTA TARJETAS (MÓVIL - estilo AppSheet) ====== */}
              <div className="jobs-cards-wrap" style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '16px', flexDirection: 'column', gap: '14px', backgroundColor: '#f1f5f9' }}>
                {isLoading ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>Loading database...</div>
                ) : filteredProperties.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280', fontStyle: 'italic' }}>No jobs to display for your team.</div>
                ) : filteredProperties.map((prop) => {
                  const teamName = getRelationName(teams, prop.teamId, '');
                  const teamColor = getRelationColor(teams, prop.teamId);
                  const prObj = priorities.find(pp => pp.id === prop.priorityId || pp.name === prop.priorityId);
                  const isHighPriority = prObj?.name?.toLowerCase() === 'high' || prop.priorityId?.toLowerCase() === 'high';
                  const assignedLabel = teamName || 'Unassigned';

                  return (
                    <div
                      key={prop.id}
                      onClick={() => handleOpenDetail(prop)}
                      style={{
                        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px',
                        cursor: 'pointer', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
                        display: 'flex', flexDirection: 'column', gap: '16px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.2rem', lineHeight: 1.25 }}>
                          {getClientName(prop.client)}
                        </span>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginTop: '2px' }}>
                          {(prop as any).employeeFinishedBy && <CheckCircle size={18} color="#10b981" />}
                          {isHighPriority && <AlertTriangle size={18} color="#dc2626" />}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.95rem', color: '#475569' }}>
                          <MapPin size={18} color="#94a3b8" style={{ flexShrink: 0 }} />
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{prop.address || '—'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.95rem', color: '#475569' }}>
                          <CalendarDays size={18} color="#94a3b8" style={{ flexShrink: 0 }} />
                          <span>{prop.scheduleDate ? formatDate(prop.scheduleDate) : 'Sin fecha'}{prop.timeIn ? `  ·  ${prop.timeIn}` : ''}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.95rem' }}>
                          <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: teamColor ? `${teamColor}20` : '#f1f5f9', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <Users size={15} color={teamColor || '#94a3b8'} />
                          </span>
                          <span style={{ fontWeight: teamName ? 600 : 400, color: teamName ? '#334155' : '#94a3b8' }}>{assignedLabel}</span>
                        </div>
                      </div>

                      <div onClick={(e) => e.stopPropagation()}>
                        <StatusPillSelector
                          fullWidth
                          currentStatusId={prop.statusId}
                          statuses={statuses}
                          onChange={(newId) => handleQuickStatusChange(prop.id, newId)}
                          disabled={isSaving || !canEdit || !isVisible('workflow')}
                          onRequestOpen={setStatusModal}
                          modalTitle={getClientName(prop.client)}
                          modalSubtitle={prop.address}
                        />
                      </div>

                      {(canEdit || canDelete) && isVisible('admin') && (
                        <div style={{ display: 'flex', gap: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
                          {canEdit && (
                            <button onClick={(e) => { e.stopPropagation(); handleOpenForm(prop); }}
                              style={{ flex: 1, height: '46px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600, fontSize: '0.92rem', cursor: 'pointer' }}>
                              <Edit2 size={17} /> Editar
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={(e) => { e.stopPropagation(); setSelectedHouse(prop); handleDelete(); }}
                              style={{ flex: 1, height: '46px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600, fontSize: '0.92rem', cursor: 'pointer' }}>
                              <Trash2 size={17} /> Eliminar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>
          </div>

          {/* RIGHT COLUMN: ACTIVE TEAMS */}
          <div className="right-col">
            <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', height: '100%' }}>
              <h3 style={{ margin: '0', padding: '14px 16px', fontSize: '1rem', color: '#111827', fontWeight: 700, borderBottom: '1px solid #f1f5f9' }}>Active Teams</h3>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {isLoading ? (
                  <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>Loading teams...</div>
                ) : teamsWithScope.length === 0 ? (
                  <div style={{ color: '#6b7280', fontSize: '0.9rem', fontStyle: 'italic' }}>No configured teams.</div>
                ) : (
                  teamsWithScope
                    .filter(team => propertiesWithScope.some(p => {
                      const isAssignedToTeam = p.teamId === team.id || p.teamId === team.name;
                      if (!isAssignedToTeam) return false;
                      return !isHiddenPipelineStatus(p);
                    }))
                    .map(team => {
                    const assignedProps = propertiesWithScope
                      .filter(p => {
                        if (p.teamId !== team.id && p.teamId !== team.name) return false;
                        return !isHiddenPipelineStatus(p);
                      })
                      .sort((a, b) => {
                        const stA = statuses.find(s => s.id === a.statusId || s.name === a.statusId);
                        const stB = statuses.find(s => s.id === b.statusId || s.name === b.statusId);
                        const isRecallA = stA?.name?.toLowerCase() === 'recall' || a.statusId?.toLowerCase() === 'recall';
                        const isRecallB = stB?.name?.toLowerCase() === 'recall' || b.statusId?.toLowerCase() === 'recall';
                        if (isRecallA && !isRecallB) return -1;
                        if (!isRecallA && isRecallB) return 1;
                        return 0;
                      });
                    const isExpanded = expandedTeamId === team.id;
                    return (
                      <div 
                        key={team.id} 
                        onClick={() => setExpandedTeamId(isExpanded ? null : team.id)}
                        style={{ border: `1px solid ${isExpanded ? team.color : '#f1f5f9'}`, padding: '10px 12px', borderRadius: '8px', backgroundColor: '#f8fafc', cursor: 'pointer', transition: 'all 0.2s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = team.color; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = isExpanded ? team.color : '#f1f5f9'; e.currentTarget.style.boxShadow = 'none'; }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '6px', backgroundColor: `${team.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: team.color }}><Users size={16} /></div>
                            <div>
                              <div style={{ fontWeight: 600, color: '#111827', fontSize: '0.85rem' }}>{team.name}</div>
                              <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{assignedProps.length > 0 ? `${assignedProps.length} jobs` : 'Free'}</div>
                            </div>
                          </div>
                          <ChevronDown size={16} color="#94a3b8" style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
                        </div>
                        <div style={{ width: '100%', height: '3px', backgroundColor: '#e2e8f0', borderRadius: '2px', marginTop: '8px' }}>
                          <div style={{ width: assignedProps.length > 0 ? '100%' : '0%', height: '100%', backgroundColor: team.color, borderRadius: '2px', transition: 'width 0.3s ease' }}></div>
                        </div>

                        {isExpanded && (
                          <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {assignedProps.length === 0 ? (
                              <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>No hay casas asignadas a este equipo.</span>
                            ) : (
                              assignedProps.map(prop => {
                                const stProp = statuses.find(s => s.id === prop.statusId || s.name === prop.statusId);
                                const isRecall = stProp?.name?.toLowerCase() === 'recall' || prop.statusId?.toLowerCase() === 'recall';
                                const prObj = priorities.find(pp => pp.id === prop.priorityId || pp.name === prop.priorityId);
                                const isHigh = prObj?.name?.toLowerCase() === 'high' || prop.priorityId?.toLowerCase() === 'high';
                                return (
                                  <div 
                                    key={prop.id} 
                                    onClick={(e) => { e.stopPropagation(); handleOpenDetail(prop); }}
                                    style={{ backgroundColor: 'white', border: `1px solid ${isRecall ? '#fca5a5' : isHigh ? '#fdba74' : '#e2e8f0'}`, borderRadius: '6px', padding: '8px 10px', cursor: 'pointer', transition: 'all 0.15s' }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{getClientName(prop.client)}</div>
                                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                        {isRecall && (
                                          <span style={{ backgroundColor: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Recall</span>
                                        )}
                                        {isHigh && (
                                          <span title="HIGH priority" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', backgroundColor: '#fff7ed', color: '#c2410c', padding: '2px 6px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                            <AlertTriangle size={10} /> High
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}><MapPin size={10} /> {prop.address || '-'}</div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- FORM MODAL TIPO WORK ORDER --- */}
      {isFormModalOpen && (
        <div className="modal-overlay-centered" onClick={handleCloseForm}>
          <div className="modal-full" onClick={e => e.stopPropagation()}>
            
            <div className="modal-full-left">
              <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', gap: '12px', flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    {formData.id ? 'Edit Property Details' : 'Register New Property'}
                  </h2>
                  {(isSuperAdmin || activeRole?.permissions?.find(p => p.module === 'Roles & Permissions')?.canEdit) && (
                    <button
                      type="button"
                      onClick={openFieldConfigModal}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        backgroundColor: '#eff6ff', color: '#2563eb',
                        border: '1px solid #bfdbfe', padding: '10px 16px',
                        borderRadius: '8px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer'
                      }}
                      title="Configure which fields each role can see"
                    >
                      <Settings size={16} /> Configure Fields
                    </button>
                  )}
                </div>

                {/* CARD 1: GENERAL INFO */}
                <div style={{ padding: '2rem', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '2rem' }}>
                  <h3 style={{ display:'flex', alignItems:'center', gap:'10px', margin: '0 0 1.5rem 0', fontSize: '1.1rem', color: '#1E293B' }}>
                    <User size={20} color="#3B82F6"/> General Information
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1.5rem' }}>
                    {isElementVisible('client') && (
                      <div>
                        <label style={s.label}>Client <span style={{ color: '#3b82f6' }}>*</span></label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <SearchableSelect options={customersList} value={formData.client} onChange={handleCustomerSelect} placeholder="Type to search Client..." icon={User} returnKey="id" />
                          </div>
                          <button
                            type="button"
                            onClick={handleOpenCustomerModal}
                            title="Agregar nuevo cliente"
                            aria-label="Agregar nuevo cliente"
                            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '42px', padding: 0, background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }}
                          >
                            <Plus size={28} strokeWidth={2.5} color="#ffffff" />
                          </button>
                        </div>
                      </div>
                    )}
                    {isElementVisible('address') && (
                      <div>
                        <label style={s.label}>Address <span style={{ color: '#3b82f6' }}>*</span></label>
                        <div style={s.inputWrapper}>
                          <MapPin style={s.icon} size={16} />
                          <input type="text" style={s.input} placeholder="Enter full address..." value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* CARD 2: LOGISTICS & SETTINGS */}
                <div style={{ padding: '2rem', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '2rem' }}>
                  <h3 style={{ display:'flex', alignItems:'center', gap:'10px', margin: '0 0 1.5rem 0', fontSize: '1.1rem', color: '#1E293B' }}>
                    <Settings size={20} color="#8B5CF6"/> Logistics & Settings
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1.5rem' }}>
                    <div>
                      <label style={s.label}>Status <span style={{ color: '#3b82f6' }}>*</span></label>
                      <CustomSelect options={statuses} value={formData.statusId} onChange={(val: string) => setFormData({ ...formData, statusId: val })} placeholder="Select Status..." icon={Activity} />
                    </div>
                    <div>
                      <label style={s.label}>Invoice Status</label>
                      <CustomSelect options={invoiceOptions} value={formData.invoiceStatus} onChange={(val: any) => setFormData({ ...formData, invoiceStatus: val })} placeholder="Select Invoice Status..." icon={FileText} />
                    </div>
                    {isElementVisible('serviceId') && (
                      <div>
                        <label style={s.label}>Services</label>
                        <CustomSelect options={services} value={formData.serviceId} onChange={(val: string) => setFormData({ ...formData, serviceId: val })} placeholder="Select Service..." icon={Wrench} />
                      </div>
                    )}
                    {isElementVisible('priorityId') && (
                      <div>
                        <label style={s.label}>Priority</label>
                        <CustomSelect options={priorities} value={formData.priorityId} onChange={(val: string) => setFormData({ ...formData, priorityId: val })} placeholder="Select Priority..." icon={Flag} />
                      </div>
                    )}
                    {isElementVisible('rooms') && (
                      <div>
                        <label style={s.label}>Rooms</label>
                        <CustomSelect options={roomOptions} value={formData.rooms} onChange={(val: string) => setFormData({ ...formData, rooms: val })} placeholder="Rooms..." icon={Hash} />
                      </div>
                    )}
                    {isElementVisible('bathrooms') && (
                      <div>
                        <label style={s.label}>Bathrooms</label>
                        <CustomSelect options={roomOptions} value={formData.bathrooms} onChange={(val: string) => setFormData({ ...formData, bathrooms: val })} placeholder="Bathrooms..." icon={Hash} />
                      </div>
                    )}
                  </div>
                </div>

                {/* CARD 3: SCHEDULE & TEAM */}
                <div style={{ padding: '2rem', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '2rem' }}>
                  <h3 style={{ display:'flex', alignItems:'center', gap:'10px', margin: '0 0 1.5rem 0', fontSize: '1.1rem', color: '#1E293B' }}>
                    <CalendarClock size={20} color="#10B981"/> Schedule & Team
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    {isElementVisible('receiveDate') && (
                      <div>
                        <label style={s.label}>Receive Date</label>
                        <div style={s.inputWrapper}>
                          <CalendarDays style={s.icon} size={16} />
                          <input type="date" style={s.input} value={formData.receiveDate} onChange={e => setFormData({ ...formData, receiveDate: e.target.value })} />
                        </div>
                      </div>
                    )}
                    {isElementVisible('scheduleDate') && (
                      <div>
                        <label style={s.label}>Schedule Date</label>
                        <div style={s.inputWrapper}>
                          <CalendarDays style={s.icon} size={16} />
                          <input type="date" style={s.input} value={formData.scheduleDate} onChange={e => setFormData({ ...formData, scheduleDate: e.target.value })} />
                        </div>
                      </div>
                    )}
                    <div>
                      <label style={s.label}>Date of Issue</label>
                      <div style={s.inputWrapper}>
                        <CalendarDays style={s.icon} size={16} />
                        <input type="date" style={s.input} value={formData.dateOfIssue || ''} onChange={e => setFormData({ ...formData, dateOfIssue: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label style={s.label}>Due Date</label>
                      <div style={s.inputWrapper}>
                        <CalendarDays style={s.icon} size={16} />
                        <input type="date" style={s.input} value={formData.dueDate || ''} onChange={e => setFormData({ ...formData, dueDate: e.target.value })} />
                      </div>
                    </div>
                    {isElementVisible('timeIn') && (
                      <div>
                        <label style={s.label}>Time In</label>
                        <div style={s.inputWrapper}>
                          <Clock style={s.icon} size={16} />
                          <input type="time" style={s.input} value={formData.timeIn} onChange={e => setFormData({ ...formData, timeIn: e.target.value })} />
                        </div>
                      </div>
                    )}
                    {isElementVisible('timeOut') && (
                      <div>
                        <label style={s.label}>Time Out</label>
                        <div style={s.inputWrapper}>
                          <Clock style={s.icon} size={16} />
                          <input type="time" style={s.input} value={formData.timeOut} onChange={e => setFormData({ ...formData, timeOut: e.target.value })} />
                        </div>
                      </div>
                    )}
                    {isElementVisible('teamId') && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={s.label}>Team</label>
                      <SearchableSelect 
                        options={teams} 
                        value={formData.teamId} 
                        onChange={(val: string) => {
                          const teamWorkers = employees.filter(emp => emp.teamId === val).map(emp => emp.id);
                          setFormData({ ...formData, teamId: val, assignedWorkers: teamWorkers });
                        }} 
                        placeholder="Type to search Team..." 
                        icon={Users} 
                        returnKey="id"
                      />
                    </div>
                    )}
                  </div>

                  {isElementVisible('assignedWorkers') && (
                  <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={s.label}><User size={14} style={{display: 'inline', verticalAlign: 'middle', marginRight: '4px'}}/> Assigned Workers</span>
                      <div style={{ position: 'relative' }}>
                        <button 
                          type="button" 
                          onClick={() => setIsAssigningWorkerForm(!isAssigningWorkerForm)} 
                          disabled={isSaving}
                          style={{ background: '#e0f2fe', color: '#2563eb', border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                        >
                          {isAssigningWorkerForm ? 'Close' : '+ Assign / Remove'}
                        </button>
                        {isAssigningWorkerForm && (
                          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', width: '260px', maxWidth: 'calc(100vw - 40px)', zIndex: 10, maxHeight: '260px', overflowY: 'auto' }}>
                            <div style={{ position: 'sticky', top: 0, background: 'white', padding: '8px', borderBottom: '1px solid #e2e8f0', zIndex: 1 }}>
                              <div style={{ position: 'relative' }}>
                                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                  autoFocus
                                  type="text"
                                  value={workerSearch}
                                  onChange={(e) => setWorkerSearch(e.target.value)}
                                  placeholder="Buscar empleado..."
                                  style={{ width: '100%', boxSizing: 'border-box', padding: '7px 9px 7px 30px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.82rem', outline: 'none' }}
                                />
                              </div>
                            </div>
                            {(() => {
                              const q = workerSearch.trim().toLowerCase();
                              const list = employees.filter(emp => {
                                if (!q) return true;
                                return `${emp.firstName || ''} ${emp.lastName || ''}`.toLowerCase().includes(q);
                              });
                              if (list.length === 0) {
                                return <div style={{ padding: '14px 12px', fontSize: '0.82rem', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }}>Sin resultados</div>;
                              }
                              return list.map(emp => {
                                const isAssigned = (formData.assignedWorkers || []).includes(emp.id);
                                return (
                                  <div 
                                    key={emp.id} 
                                    onClick={() => toggleWorkerAssignmentForm(emp.id)}
                                    style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', backgroundColor: isAssigned ? '#eff6ff' : 'transparent' }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isAssigned ? '#eff6ff' : '#f8fafc'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isAssigned ? '#eff6ff' : 'transparent'}
                                  >
                                    <span style={{ fontSize: '0.85rem', fontWeight: isAssigned ? 600 : 500, color: isAssigned ? '#1e40af' : '#334155' }}>
                                      {emp.firstName} {emp.lastName}
                                    </span>
                                    {isAssigned && <CheckSquare size={14} color="#3b82f6" />}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {!(formData.assignedWorkers && formData.assignedWorkers.length > 0) ? (
                        <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>No workers assigned specifically for this job yet. Select a Team to auto-fill or add manually.</span>
                      ) : (
                        formData.assignedWorkers.map(workerId => {
                          const emp = employees.find(e => e.id === workerId);
                          if (!emp) return null;
                          return (
                            <div key={workerId} style={{ backgroundColor: 'white', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <User size={12} color="#64748b" />
                              {emp.firstName} {emp.lastName}
                              <button type="button" onClick={() => toggleWorkerAssignmentForm(workerId)} style={{ background: 'none', border: 'none', padding: 0, margin: 0, marginLeft: '4px', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center' }}><X size={14}/></button>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                  )}
                </div>

                {/* CARD 4: BILLED SERVICES */}
                {isVisible('financial') && isElementVisible('card_billedServices') && (
                <div style={{ padding: '2rem', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ display:'flex', alignItems:'center', gap:'10px', margin: 0, fontSize: '1.1rem', color: '#1E293B' }}>
                      <Layers size={20} color="#F59E0B"/> Billed Services
                    </h3>
                    <button type="button" onClick={() => handleOpenServiceForm(undefined, true)} className="btn btn-primary" style={{ padding: '8px 12px', fontSize: '0.85rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Plus size={16} /> Add Service
                    </button>
                  </div>

                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                      <thead>
                        <tr>
                          <th style={{...s.th, backgroundColor: '#f8fafc'}}>Service</th>
                          <th style={{...s.th, backgroundColor: '#f8fafc', textAlign: 'center'}}>Qty</th>
                          <th style={{...s.th, backgroundColor: '#f8fafc', textAlign: 'right'}}>Price</th>
                          <th style={{...s.th, backgroundColor: '#f8fafc', textAlign: 'right'}}>Tax</th>
                          <th style={{...s.th, backgroundColor: '#f8fafc', textAlign: 'right'}}>Total</th>
                          <th style={{...s.th, backgroundColor: '#f8fafc', textAlign: 'right'}}>Total -Tax</th>
                          <th style={{...s.th, backgroundColor: '#f8fafc', textAlign: 'right'}}>Act</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formServices.length === 0 ? (
                          <tr><td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>No services added yet.</td></tr>
                        ) : (
                          formServices.map(record => {
                            return (
                              <tr key={record.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{...s.td, padding: '12px 20px', fontWeight: 600}}>{getServiceName(record.serviceId)}</td>
                                <td style={{...s.td, padding: '12px 20px', textAlign: 'center'}}>{record.quantity}</td>
                                <td style={{...s.td, padding: '12px 20px', textAlign: 'right'}}>${Number(record.price).toFixed(2)}</td>
                                <td style={{...s.td, padding: '12px 20px', textAlign: 'right', color: record.taxAmount > 0 ? '#ef4444' : '#64748b'}}>
                                  {record.taxAmount > 0 ? `+$${record.taxAmount.toFixed(2)}` : record.minusTax === 'Yes' ? `-$${Math.abs(record.taxAmount).toFixed(2)}` : '$0.00'}
                                </td>
                                <td style={{...s.td, padding: '12px 20px', textAlign: 'right', fontWeight: 700, color: '#1e293b'}}>${Number(record.total).toFixed(2)}</td>
                                <td style={{...s.td, padding: '12px 20px', textAlign: 'right', fontWeight: 700, color: '#0f766e'}}>${recordTotalMinusTax(record).toFixed(2)}</td>
                                <td style={{...s.td, padding: '12px 20px', textAlign: 'right'}}>
                                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                    <button type="button" onClick={() => handleOpenServiceForm(record, true)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '2px' }}><Edit2 size={14} /></button>
                                    <button type="button" onClick={() => handleDeleteServiceLocal(record.id as string)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}><Trash2 size={14} /></button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                )}

                {/* CARD 5: NOTES */}
                <div style={{ padding: '2rem', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '2rem' }}>
                  <h3 style={{ display:'flex', alignItems:'center', gap:'10px', margin: '0 0 1.5rem 0', fontSize: '1.1rem', color: '#1E293B' }}>
                    <StickyNote size={20} color="#F43F5E"/> Notes
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {isElementVisible('note') && (
                    <div>
                      <label style={s.label}>General Note</label>
                      <textarea style={{ ...s.input, minHeight: '80px', resize: 'vertical', padding: '14px' }} placeholder="General instructions or notes..." value={formData.note} onChange={e => setFormData({ ...formData, note: e.target.value })}></textarea>
                    </div>
                    )}
                    {isElementVisible('employeeNote') && (
                    <div>
                      <label style={{...s.label, color: '#991B1B'}}>Employee's Note</label>
                      <textarea style={{ ...s.input, minHeight: '80px', resize: 'vertical', padding: '14px', backgroundColor: '#FEF2F2', borderColor: '#FECACA' }} placeholder="Employee performance notes..." value={formData.employeeNote} onChange={e => setFormData({ ...formData, employeeNote: e.target.value })}></textarea>
                    </div>
                    )}
                  </div>
                </div>

                {/* CARD 6: PHOTOS EN EL FORMULARIO */}
                {isVisible('media') && isElementVisible('card_photos') && (
                <div style={{ padding: '2rem', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '2rem' }}>
                  <h3 style={{ display:'flex', alignItems:'center', gap:'10px', margin: '0 0 1.5rem 0', fontSize: '1.1rem', color: '#1E293B' }}>
                    <ImageIcon size={20} color="#0EA5E9"/> Photos
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '20px' }}>
                    <div>
                      <button type="button" onClick={() => openBurstCamera('before')} disabled={isSaving}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', marginBottom: '12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '10px', padding: '12px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
                        <Camera size={18} /> Cámara rápida · Before
                      </button>
                      <PhotoSection label="Before" type="before"
                        urls={beforePhotoURLs} excludedUrls={beforeExcluded} pendingCount={pendingForHouse.before}
                        canEdit isSaving={isSaving} isCompressing={isCompressing} photoConfig={photoConfig} reportSelectable
                        onAddFiles={(f: FileList | null) => addPhotoFiles(f, 'before')}
                        onRemove={(i: number) => handleRemovePhoto(i, 'before')}
                        onToggleReport={(u: string) => toggleReportPhoto(u, 'before')} />
                    </div>
                    <div>
                      <button type="button" onClick={() => openBurstCamera('after')} disabled={isSaving}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', marginBottom: '12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '10px', padding: '12px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
                        <Camera size={18} /> Cámara rápida · After
                      </button>
                      <PhotoSection label="After" type="after"
                        urls={afterPhotoURLs} excludedUrls={afterExcluded} pendingCount={pendingForHouse.after}
                        canEdit isSaving={isSaving} isCompressing={isCompressing} photoConfig={photoConfig} reportSelectable
                        onAddFiles={(f: FileList | null) => addPhotoFiles(f, 'after')}
                        onRemove={(i: number) => handleRemovePhoto(i, 'after')}
                        onToggleReport={(u: string) => toggleReportPhoto(u, 'after')} />
                    </div>
                  </div>
                </div>
                )}

              </div>
            </div>
            
            {/* LADO DERECHO: SUMMARY & ACTIONS */}
            <aside className="modal-full-right">
              <div style={{ padding: '2rem 1.5rem', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1E293B', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 0.5rem 0' }}>
                    Job Summary
                    <span style={{ padding: '0.3rem 0.6rem', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 700, backgroundColor: '#E0F2FE', color: '#1E40AF', textTransform: 'uppercase' }}>
                      {getRelationName(statuses, formData.statusId, 'New')}
                    </span>
                  </h2>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B', fontWeight: 500 }}>
                    {formData.id ? 'Edit Job' : 'New Job'} • {getRelationName(services, formData.serviceId, 'Standard')}
                  </p>
                </div>

                <div style={{ backgroundColor: '#F8FAFC', padding: '1.2rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
                    <div style={{ padding: '0.4rem', backgroundColor: '#E0E7FF', borderRadius: '6px', color: '#4F46E5' }}><User size={16} /></div>
                    <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Client Details</h4>
                  </div>
                  <div style={{ paddingLeft: '2.4rem' }}>
                    <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: formData.client ? '#0F172A' : '#94A3B8' }}>{formData.client ? getClientName(formData.client) : 'Not defined'}</p>
                    {formData.address && <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748B' }}>{formData.address}</p>}
                  </div>
                </div>

                <div style={{ backgroundColor: '#F8FAFC', padding: '1.2rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
                    <div style={{ padding: '0.4rem', backgroundColor: '#DCFCE7', borderRadius: '6px', color: '#059669' }}><CalendarClock size={16} /></div>
                    <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Timing & Assignment</h4>
                  </div>
                  <div style={{ paddingLeft: '2.4rem' }}>
                    <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#0F172A' }}>{formData.scheduleDate ? formatDate(formData.scheduleDate) : 'No date set'}</p>
                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748B' }}>{formData.timeIn} {formData.timeOut ? `- ${formData.timeOut}` : ''}</p>
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>Team: {getRelationName(teams, formData.teamId, 'Unassigned')}</p>
                  </div>
                </div>

                <div style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '2px solid #F1F5F9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
                    <Receipt size={18} color="#0F172A" />
                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>Service Costs</h4>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#475569' }}>
                      <span>Items Count</span> <span>{formServices.length}</span>
                    </div>
                    <div style={{ margin: '0.5rem 0', borderTop: '1px dashed #CBD5E1' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '0.5rem' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>Total</span> 
                      <span style={{ fontSize: '2rem', fontWeight: 900, color: '#0F172A', lineHeight: 1 }}>${formTotalBilled.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

              </div>

              <div style={{ padding: '1.5rem', backgroundColor: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <button onClick={handleSave} disabled={isSaving} style={{ width: '100%', padding: '0.9rem', fontSize: '0.95rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                  <Save size={18} /> {isSaving ? 'Saving...' : 'Confirm & Save'}
                </button>
                <button onClick={handleCloseForm} disabled={isSaving} style={{ width: '100%', padding: '0.9rem', fontSize: '0.95rem', backgroundColor: 'white', color: '#64748B', border: '1px solid #CBD5E1', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <XCircle size={18} /> Cancel
                </button>
              </div>
            </aside>

          </div>
        </div>
      )}

      {/* --- DETAIL MODAL --- */}
      {isDetailModalOpen && selectedHouse && (
        <div className="modal-overlay-centered" onClick={() => setIsDetailModalOpen(false)}>
          <div className="modal-90" onClick={e => e.stopPropagation()}>
            <header style={s.header}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h3 style={s.title}>{getClientName(selectedHouse.client)}</h3>
                {(selectedHouse as any).employeeFinishedBy && (
                  <span style={{ backgroundColor: '#d1fae5', color: '#047857', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle size={14} /> 
                    Finished by {(selectedHouse as any).employeeFinishedBy.split(' ')[0]} ({formatDateTime((selectedHouse as any).employeeFinishedAt)})
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                {isVisible('workflow') && isElementVisible('btn_sync') && (
                  <button 
                    onClick={handleGoogleCalendarSync} 
                    style={{ ...s.actionBtn, backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74' }}
                  >
                    <Calendar size={16} /> Sync
                  </button>
                )}
                {isVisible('workflow') && isElementVisible('btn_startJob') && (
                  <button 
                    onClick={(selectedHouse as any).employeeStartedBy ? handleUndoStart : handleStartJob} 
                    disabled={isSaving || !!(selectedHouse as any).employeeFinishedBy} 
                    style={{ 
                      ...s.actionBtn,
                      backgroundColor: (selectedHouse as any).employeeStartedBy ? '#f8fafc' : '#eff6ff', 
                      color: (selectedHouse as any).employeeStartedBy ? '#64748b' : '#3b82f6', 
                      border: (selectedHouse as any).employeeStartedBy ? '1px solid #e2e8f0' : '1px solid #bfdbfe'
                    }}
                  >
                    <PlayCircle size={16} color={(selectedHouse as any).employeeStartedBy ? "#64748b" : "currentColor"} /> 
                    {(selectedHouse as any).employeeStartedBy ? 'Undo Start' : 'Start Job'}
                  </button>
                )}
                {isVisible('workflow') && isElementVisible('btn_markFinished') && (
                  <button 
                    onClick={(selectedHouse as any).employeeFinishedBy ? handleUndoFinished : handleMarkAsFinished} 
                    disabled={isSaving} 
                    style={{ 
                      ...s.actionBtn,
                      backgroundColor: (selectedHouse as any).employeeFinishedBy ? '#f8fafc' : '#d1fae5', 
                      color: (selectedHouse as any).employeeFinishedBy ? '#64748b' : '#047857', 
                      border: (selectedHouse as any).employeeFinishedBy ? '1px solid #e2e8f0' : '1px solid #a7f3d0'
                    }}
                  >
                    <span title={(selectedHouse as any).employeeFinishedBy ? `Finished at ${formatDateTime((selectedHouse as any).employeeFinishedAt)} - Click to Undo` : 'Mark as Finished'}>
                      <CheckCircle size={16} color={(selectedHouse as any).employeeFinishedBy ? "#10b981" : "currentColor"} /> 
                    </span>
                    {(selectedHouse as any).employeeFinishedBy ? 'Undo Finished' : 'Mark Finished'}
                  </button>
                )}
                {canEdit && isVisible('financial') && isElementVisible('btn_pay') && (
                  <button onClick={() => handleOpenPayrollForm(selectedHouse.id)} disabled={isSaving} style={{ ...s.actionBtn, backgroundColor: '#ecfdf5', color: '#10b981', border: '1px solid #a7f3d0' }}>
                    <DollarSign size={16} /> Pay
                  </button>
                )}
                {canEdit && isVisible('admin') && isElementVisible('btn_duplicate') && (
                  <button onClick={handleDuplicate} disabled={isSaving} style={{ ...s.actionBtn, backgroundColor: 'white', color: '#475569', border: '1px solid #e2e8f0' }}>
                    <Copy size={16} /> Duplicate
                  </button>
                )}
                <button style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '4px', marginLeft: '4px' }} onClick={() => setIsDetailModalOpen(false)}>
                  <X size={24} />
                </button>
              </div>
            </header>

            <div className="modal-body-scroll" style={s.body}>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '1rem', fontWeight: 500, paddingBottom: '16px' }}>
                <MapPin size={18} color="#3b82f6" /> {selectedHouse.address}
              </div>

              {/* ⭐ SELECTOR DE STATUS PROMINENTE — mover la casa de lugar fácilmente */}
              {isVisible('workflow') && (
                <div style={{ background: 'linear-gradient(135deg, #eff6ff, #ffffff)', border: '1px solid #bfdbfe', borderRadius: '14px', padding: '16px 18px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(59,130,246,0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '9px', backgroundColor: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Activity size={18} color="#2563eb" />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#1e3a8a' }}>Estado del trabajo</div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>Toca para mover la casa de lugar</div>
                    </div>
                  </div>
                  <StatusPillSelector
                    large
                    currentStatusId={selectedHouse.statusId}
                    statuses={statuses}
                    onChange={(newId: string) => handleQuickStatusChange(selectedHouse.id, newId)}
                    disabled={isSaving || !canEdit}
                    onRequestOpen={setStatusModal}
                    modalTitle={getClientName(selectedHouse.client)}
                    modalSubtitle={selectedHouse.address}
                  />
                </div>
              )}

              <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: '24px', gap: '24px', flexWrap: 'wrap' }}>
                <button style={s.detailTab(activeDetailTab === 'overview')} onClick={() => setActiveDetailTab('overview')}><Briefcase size={14} style={{display:'inline', marginBottom:'-2px', marginRight:'4px'}}/> Overview & Log</button>
                {isVisible('financial') && isElementVisible('btn_tabFinancials') && (
                  <button style={s.detailTab(activeDetailTab === 'financials')} onClick={() => setActiveDetailTab('financials')}><BarChart3 size={14} style={{display:'inline', marginBottom:'-2px', marginRight:'4px'}}/> Financials & Billing</button>
                )}
                {isVisible('media') && isElementVisible('btn_tabMedia') && (
                  <button style={s.detailTab(activeDetailTab === 'media')} onClick={() => setActiveDetailTab('media')}><FileImage size={14} style={{display:'inline', marginBottom:'-2px', marginRight:'4px'}}/> Notes & Photos</button>
                )}
              </div>

              {activeDetailTab === 'overview' && (
                <div className="fade-in">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '20px', marginBottom: '24px' }}>
                    <div style={s.infoCard}>
                      <div style={s.infoHeader}><CalendarDays size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'6px'}}/> Schedule & Timing</div>
                      <div style={s.infoRow}>
                        <span style={s.infoLabel}>Receive Date</span>
                        <span style={s.infoValue}>{selectedHouse.receiveDate ? formatDate(selectedHouse.receiveDate) : '-'}</span>
                      </div>
                      <div style={s.infoRow}>
                        <span style={s.infoLabel}>Schedule Date</span>
                        <span style={s.infoValue}>{selectedHouse.scheduleDate ? formatDate(selectedHouse.scheduleDate) : '-'}</span>
                      </div>
                      <div style={s.infoRow}>
                        <span style={s.infoLabel}>Date of Issue</span>
                        <span style={s.infoValue}>{selectedHouse.dateOfIssue ? formatDate(selectedHouse.dateOfIssue) : '-'}</span>
                      </div>
                      <div style={s.infoRow}>
                        <span style={s.infoLabel}>Due Date</span>
                        <span style={s.infoValue}>{selectedHouse.dueDate ? formatDate(selectedHouse.dueDate) : '-'}</span>
                      </div>
                      <div style={s.infoRow}>
                        <span style={s.infoLabel}>Time In</span>
                        <span style={s.infoValue}><Clock size={12} color="#94a3b8"/> {selectedHouse.timeIn || '-'}</span>
                      </div>
                      <div style={{...s.infoRow, borderBottom: 'none'}}>
                        <span style={s.infoLabel}>Time Out</span>
                        <span style={s.infoValue}><Clock size={12} color="#94a3b8"/> {selectedHouse.timeOut || '-'}</span>
                      </div>
                    </div>

                    <div style={s.infoCard}>
                      <div style={s.infoHeader}><Wrench size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'6px'}}/> Job Specifications</div>
                      <div style={s.infoRow}>
                        <span style={s.infoLabel}>Service</span>
                        <span style={s.infoValue}>{getRelationName(services, selectedHouse.serviceId)}</span>
                      </div>
                      <div style={s.infoRow}>
                        <span style={s.infoLabel}>Priority</span>
                        <span style={s.infoValue}>
                          {getRelationColor(priorities, selectedHouse.priorityId) && <span style={{ backgroundColor: getRelationColor(priorities, selectedHouse.priorityId), width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block' }}></span>}
                          {getRelationName(priorities, selectedHouse.priorityId)}
                        </span>
                      </div>
                      <div style={s.infoRow}>
                        <span style={s.infoLabel}>Rooms</span>
                        <span style={s.infoValue}><Hash size={12} color="#94a3b8"/> {selectedHouse.rooms || '-'}</span>
                      </div>
                      <div style={{...s.infoRow, borderBottom: 'none'}}>
                        <span style={s.infoLabel}>Bathrooms</span>
                        <span style={s.infoValue}><Hash size={12} color="#94a3b8"/> {selectedHouse.bathrooms || '-'}</span>
                      </div>
                    </div>

                    <div style={s.infoCard}>
                      <div style={s.infoHeader}><Activity size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'6px'}}/> Status & Assignment</div>
                      <div style={s.infoRow}>
                        <span style={s.infoLabel}>Job Status</span>
                        <div style={{textAlign: 'right'}}><StatusPillSelector currentStatusId={selectedHouse.statusId} statuses={statuses} onChange={(newId: string) => handleQuickStatusChange(selectedHouse.id, newId)} disabled={isSaving || !canEdit || !isVisible('workflow')} onRequestOpen={setStatusModal} modalTitle={getClientName(selectedHouse.client)} modalSubtitle={selectedHouse.address} /></div>
                      </div>
                      <div style={s.infoRow}>
                        <span style={s.infoLabel}>Invoice Status</span>
                        <span style={{...s.infoValue, color: '#475569', backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem'}}>{selectedHouse.invoiceStatus || '-'}</span>
                      </div>
                      <div style={{...s.infoRow, borderBottom: 'none'}}>
                        <span style={s.infoLabel}>Assigned Team</span>
                        <span style={s.infoValue}>
                          {getRelationColor(teams, selectedHouse.teamId) && <span style={{ backgroundColor: getRelationColor(teams, selectedHouse.teamId), width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block' }}></span>}
                          {getRelationName(teams, selectedHouse.teamId, 'Unassigned')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '20px' }}>
                    <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={s.detailLabel}><User size={14} style={{display: 'inline', verticalAlign: 'middle', marginRight: '4px'}}/> SPECIFIC ASSIGNED WORKERS</span>
                        
                        {canEdit && isVisible('admin') && (
                          <div style={{ position: 'relative' }}>
                            <button 
                              onClick={() => setIsAssigningWorker(!isAssigningWorker)} 
                              disabled={isSaving}
                              style={{ background: '#e0f2fe', color: '#2563eb', border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                            >
                              {isAssigningWorker ? 'Close' : '+ Assign / Remove'}
                            </button>

                            {isAssigningWorker && (
                              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', width: '250px', maxWidth: 'calc(100vw - 48px)', zIndex: 10, maxHeight: '200px', overflowY: 'auto' }}>
                                <div style={{ padding: '8px 12px', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>ALL EMPLOYEES</div>
                                {employees.map(emp => {
                                  const isAssigned = (selectedHouse.assignedWorkers || []).includes(emp.id);
                                  return (
                                    <div 
                                      key={emp.id} 
                                      onClick={() => toggleWorkerAssignmentDetail(emp.id)}
                                      style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', backgroundColor: isAssigned ? '#eff6ff' : 'transparent' }}
                                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isAssigned ? '#eff6ff' : '#f8fafc'}
                                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isAssigned ? '#eff6ff' : 'transparent'}
                                    >
                                      <span style={{ fontSize: '0.85rem', fontWeight: isAssigned ? 600 : 500, color: isAssigned ? '#1e40af' : '#334155' }}>
                                        {emp.firstName} {emp.lastName}
                                      </span>
                                      {isAssigned && <CheckSquare size={14} color="#3b82f6" />}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {!(selectedHouse.assignedWorkers && selectedHouse.assignedWorkers.length > 0) ? (
                          <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>No specific workers assigned.</span>
                        ) : (
                          selectedHouse.assignedWorkers.map(workerId => {
                            const emp = employees.find(e => e.id === workerId);
                            if (!emp) return null;
                            return (
                              <div key={workerId} style={{ backgroundColor: 'white', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <User size={12} color="#64748b" />
                                {emp.firstName} {emp.lastName}
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>

                    <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={s.detailLabel}><PenTool size={14} style={{display: 'inline', verticalAlign: 'middle', marginRight: '4px'}}/> WORK LOG</span>
                      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                          <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}><PlayCircle size={14} color="#3b82f6"/> Started By</span>
                          <span style={{ color: '#1e293b', fontWeight: 600 }}>
                            {(selectedHouse as any).employeeStartedBy ? `${(selectedHouse as any).employeeStartedBy} (${formatDateTime((selectedHouse as any).employeeStartedAt)})` : 'Not started'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                          <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle size={14} color="#10b981"/> Finished By</span>
                          <span style={{ color: '#1e293b', fontWeight: 600 }}>
                            {(selectedHouse as any).employeeFinishedBy ? `${(selectedHouse as any).employeeFinishedBy} (${formatDateTime((selectedHouse as any).employeeFinishedAt)})` : 'Not finished'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeDetailTab === 'financials' && isVisible('financial') && (
                <div className="fade-in">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '20px' }}>
                      <div style={{ fontSize: '0.8rem', color: '#15803d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Revenue</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#166534', marginTop: '4px' }}>${totalBilled.toFixed(2)}</div>
                    </div>
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '20px' }}>
                      <div style={{ fontSize: '0.8rem', color: '#b91c1c', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Payroll</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#991b1b', marginTop: '4px' }}>${totalPayroll.toFixed(2)}</div>
                    </div>
                    <div style={{ backgroundColor: netProfit >= 0 ? '#eff6ff' : '#fffbeb', border: `1px solid ${netProfit >= 0 ? '#bfdbfe' : '#fde68a'}`, borderRadius: '12px', padding: '20px' }}>
                      <div style={{ fontSize: '0.8rem', color: netProfit >= 0 ? '#1d4ed8' : '#b45309', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Profit</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: netProfit >= 0 ? '#1e40af' : '#92400e', marginTop: '4px' }}>${netProfit.toFixed(2)}</div>
                    </div>
                  </div>

                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}><Layers size={18} color="#f59e0b"/> Billed Services</h4>
                      {canEdit && (
                        <button onClick={() => handleOpenServiceForm(undefined, false)} disabled={isSaving} style={{ backgroundColor: '#3b82f6', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Plus size={16} /> Add Service
                        </button>
                      )}
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                        <thead>
                          <tr>
                            <th style={s.th}>Service</th>
                            <th style={{...s.th, textAlign: 'center'}}>Qty</th>
                            <th style={{...s.th, textAlign: 'right'}}>Price</th>
                            <th style={{...s.th, textAlign: 'right'}}>Tax</th>
                            <th style={{...s.th, textAlign: 'right'}}>Total</th>
                            <th style={{...s.th, textAlign: 'right'}}>Total -Tax</th>
                            {canEdit && <th style={{...s.th, textAlign: 'right'}}>Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {houseServices.length === 0 ? (
                            <tr><td colSpan={canEdit ? 7 : 6} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontStyle: 'italic' }}>No billed services yet.</td></tr>
                          ) : (
                            houseServices.map(record => {
                              return (
                                <tr key={record.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{...s.td, fontWeight: 600}}>{getServiceName(record.serviceId)}</td>
                                  <td style={{...s.td, textAlign: 'center'}}>{record.quantity}</td>
                                  <td style={{...s.td, textAlign: 'right'}}>${Number(record.price).toFixed(2)}</td>
                                  <td style={{...s.td, textAlign: 'right', color: record.taxAmount > 0 ? '#ef4444' : '#64748b'}}>
                                    {record.taxAmount > 0 ? `+$${record.taxAmount.toFixed(2)}` : record.minusTax === 'Yes' ? `-$${Math.abs(record.taxAmount).toFixed(2)}` : '$0.00'}
                                  </td>
                                  <td style={{...s.td, textAlign: 'right', fontWeight: 700}}>${Number(record.total).toFixed(2)}</td>
                                  <td style={{...s.td, textAlign: 'right', fontWeight: 700, color: '#0f766e'}}>${recordTotalMinusTax(record).toFixed(2)}</td>
                                  {canEdit && (
                                    <td style={{...s.td, textAlign: 'right'}}>
                                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                        <button onClick={() => handleOpenServiceForm(record, false)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '2px' }}><Edit2 size={14} /></button>
                                        <button onClick={() => handleDeleteService(record.id as string)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}><Trash2 size={14} /></button>
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}><DollarSign size={18} color="#10b981"/> Registered Payments</h4>
                      {canEdit && (
                        <button onClick={() => handleOpenPayrollForm(selectedHouse.id)} disabled={isSaving} style={{ backgroundColor: '#10b981', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Plus size={16} /> Register Payment
                        </button>
                      )}
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                        <thead>
                          <tr>
                            <th style={s.th}>Date</th>
                            <th style={s.th}>Employee</th>
                            <th style={{...s.th, textAlign: 'right'}}>Base</th>
                            <th style={{...s.th, textAlign: 'right'}}>Extra</th>
                            <th style={{...s.th, textAlign: 'right'}}>Discount</th>
                            <th style={{...s.th, textAlign: 'right'}}>Total</th>
                            {canEdit && <th style={{...s.th, textAlign: 'right'}}>Act</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {housePayrollRecords.length === 0 ? (
                            <tr><td colSpan={canEdit ? 7 : 6} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontStyle: 'italic' }}>No payments registered yet.</td></tr>
                          ) : (
                            housePayrollRecords.map(record => {
                              const emp = employees.find(e => e.id === record.employeeId);
                              return (
                                <tr key={record.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{...s.td, color: '#64748b'}}>{record.date}</td>
                                  <td style={{...s.td, fontWeight: 600}}>{emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown'}</td>
                                  <td style={{...s.td, textAlign: 'right'}}>${Number(record.baseAmount).toFixed(2)}</td>
                                  <td style={{...s.td, textAlign: 'right', color: '#10b981'}}>+${Number(record.extraAmount).toFixed(2)}</td>
                                  <td style={{...s.td, textAlign: 'right', color: '#ef4444'}}>-${Number(record.discountAmount).toFixed(2)}</td>
                                  <td style={{...s.td, textAlign: 'right', fontWeight: 700}}>${Number(record.totalAmount).toFixed(2)}</td>
                                  {canEdit && (
                                    <td style={{...s.td, textAlign: 'right'}}>
                                      <button onClick={() => handleDeletePayroll(record.id as string)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}><Trash2 size={14} /></button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeDetailTab === 'media' && isVisible('media') && (
                <div className="fade-in">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '20px', marginBottom: '24px' }}>
                    <div style={s.noteBoxGray}>
                      <span style={s.detailLabel}><StickyNote size={14} style={{display: 'inline', verticalAlign: 'middle', marginRight: '4px'}}/> GENERAL NOTE</span>
                      <p style={{ ...s.detailValue, fontSize: '0.95rem' }}>{selectedHouse.note || 'No general notes.'}</p>
                    </div>
                    <div style={s.noteBoxOrange}>
                      <span style={{...s.detailLabel, color: '#c2410c'}}><StickyNote size={14} style={{display: 'inline', verticalAlign: 'middle', marginRight: '4px'}}/> EMPLOYEE'S NOTE</span>
                      <p style={{ ...s.detailValue, fontSize: '0.95rem' }}>{selectedHouse.employeeNote || 'No employee notes.'}</p>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '20px' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={s.detailLabel}><ImageIcon size={14} style={{display: 'inline', verticalAlign: 'middle', marginRight: '4px'}}/> BEFORE PHOTOS</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {canEdit && (
                            <button onClick={() => openBurstCamera('before')} disabled={isSaving} style={{ backgroundColor: '#3b82f6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Camera size={14} /> Cámara rápida
                            </button>
                          )}
                          {isElementVisible('btn_exportPdf') && (
                            <button onClick={() => generatePDF('before')} disabled={isSaving} style={{ backgroundColor: '#1e3a8a', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <FileImage size={14} /> Export PDF
                            </button>
                          )}
                        </div>
                      </div>
                      <PhotoSection label="Before" type="before"
                        urls={beforePhotoURLs} excludedUrls={beforeExcluded} pendingCount={pendingForHouse.before}
                        canEdit={!!canEdit} isSaving={isSaving} isCompressing={isCompressing} photoConfig={photoConfig} reportSelectable
                        onAddFiles={(f: FileList | null) => addPhotoFiles(f, 'before')}
                        onRemove={(i: number) => handleRemovePhoto(i, 'before')}
                        onToggleReport={(u: string) => toggleReportPhoto(u, 'before')} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={s.detailLabel}><ImageIcon size={14} style={{display: 'inline', verticalAlign: 'middle', marginRight: '4px'}}/> AFTER PHOTOS</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {canEdit && (
                            <button onClick={() => openBurstCamera('after')} disabled={isSaving} style={{ backgroundColor: '#10b981', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Camera size={14} /> Cámara rápida
                            </button>
                          )}
                          {isElementVisible('btn_exportPdf') && (
                            <button onClick={() => generatePDF('after')} disabled={isSaving} style={{ backgroundColor: '#047857', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <FileImage size={14} /> Export PDF
                            </button>
                          )}
                        </div>
                      </div>
                      <PhotoSection label="After" type="after"
                        urls={afterPhotoURLs} excludedUrls={afterExcluded} pendingCount={pendingForHouse.after}
                        canEdit={!!canEdit} isSaving={isSaving} isCompressing={isCompressing} photoConfig={photoConfig} reportSelectable
                        onAddFiles={(f: FileList | null) => addPhotoFiles(f, 'after')}
                        onRemove={(i: number) => handleRemovePhoto(i, 'after')}
                        onToggleReport={(u: string) => toggleReportPhoto(u, 'after')} />
                    </div>
                  </div>

                  {canEdit && (
                    <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                      <button onClick={handleSavePhotosFromDetail} disabled={isSaving} style={{ ...s.btnPrimary, justifyContent: 'center' }}>
                        <Save size={16} /> {isSaving ? 'Saving...' : 'Save Photos'}
                      </button>
                    </div>
                  )}
                </div>
              )}

            </div>

            <footer style={s.footerBetween}>
              <div>
                {canDelete && isVisible('admin') && isElementVisible('btn_deleteProperty') && (
                  <button onClick={handleDelete} disabled={isSaving} style={s.btnDangerLight}>
                    <Trash2 size={16} /> Delete Property
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setIsDetailModalOpen(false)} style={s.btnOutline}>Close</button>
                {canEdit && isVisible('admin') && isElementVisible('btn_editDetails') && (
                  <button onClick={() => handleOpenForm(selectedHouse)} style={s.btnPrimary}>
                    <Edit2 size={16} /> Edit Details
                  </button>
                )}
              </div>
            </footer>

          </div>
        </div>
      )}

      {/* --- MODAL: NUEVO CLIENTE (mismo formulario que Customers) --- */}
      {isCustomerModalOpen && (
        <div className="modal-overlay-centered" onClick={() => setIsCustomerModalOpen(false)}>
          <div className="modal-70" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <header style={s.header}>
              <h3 style={s.title}>&nbsp;</h3>
              <button style={s.closeBtn} onClick={() => setIsCustomerModalOpen(false)}><X size={22} /></button>
            </header>
            <div style={{ padding: '24px', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '20px' }}>

                <div>
                  <label style={s.label}>Type</label>
                  <CustomSelect
                    options={[{ id: 'Private customer', name: 'Private customer' }, { id: 'Residential', name: 'Residential' }, { id: 'Commercial', name: 'Commercial' }]}
                    value={customerForm.type}
                    onChange={(val: string) => setCustomerForm({ ...customerForm, type: val })}
                    placeholder="Select type..."
                    icon={Briefcase}
                  />
                </div>

                <div>
                  <label style={s.label}>Color Marker</label>
                  <input
                    type="color"
                    value={customerForm.color}
                    onChange={e => setCustomerForm({ ...customerForm, color: e.target.value })}
                    style={{ width: '100%', height: '42px', padding: '4px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', background: '#fff' }}
                  />
                </div>

                <div>
                  <label style={s.label}>Full Name <span style={{ color: '#ef4444' }}>*</span></label>
                  <div style={s.inputWrapper}>
                    <User style={s.icon} size={16} />
                    <input type="text" style={s.input} value={customerForm.name} onChange={e => setCustomerForm({ ...customerForm, name: e.target.value })} autoFocus />
                  </div>
                </div>

                <div>
                  <label style={s.label}>Business Name</label>
                  <div style={s.inputWrapper}>
                    <Briefcase style={s.icon} size={16} />
                    <input type="text" style={s.input} value={customerForm.businessName} onChange={e => setCustomerForm({ ...customerForm, businessName: e.target.value })} />
                  </div>
                </div>

                <div>
                  <label style={s.label}>Email</label>
                  <div style={s.inputWrapper}>
                    <FileText style={s.icon} size={16} />
                    <input type="email" style={s.input} value={customerForm.email} onChange={e => setCustomerForm({ ...customerForm, email: e.target.value })} />
                  </div>
                </div>

                <div>
                  <label style={s.label}>Phone</label>
                  <div style={s.inputWrapper}>
                    <Hash style={s.icon} size={16} />
                    <input type="text" style={s.input} value={customerForm.phone} onChange={e => setCustomerForm({ ...customerForm, phone: e.target.value })} />
                  </div>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={s.label}>Address</label>
                  <div style={s.inputWrapper}>
                    <MapPin style={s.icon} size={16} />
                    <input type="text" style={s.input} value={customerForm.address} onChange={e => setCustomerForm({ ...customerForm, address: e.target.value })} />
                  </div>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={s.label}>City / State / Zip</label>
                  <div style={s.inputWrapper}>
                    <MapPin style={s.icon} size={16} />
                    <input type="text" style={s.input} placeholder="e.g. Maracaibo, Zulia 4001" value={customerForm.cityStateZip} onChange={e => setCustomerForm({ ...customerForm, cityStateZip: e.target.value })} />
                  </div>
                </div>

              </div>
            </div>
            <footer style={s.footerBetween}>
              <div>
                <button onClick={() => setIsCustomerModalOpen(false)} style={s.btnOutline}>Cancel</button>
              </div>
              <button onClick={handleSaveNewCustomer} disabled={isSaving} style={{ ...s.btnPrimary, backgroundColor: '#10b981', borderColor: '#10b981' }}>
                <Save size={16} /> {isSaving ? 'Saving...' : 'Save Customer'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* --- SERVICE MODAL --- */}
      {isServiceModalOpen && (
        <div className="modal-overlay-centered" onClick={() => setIsServiceModalOpen(false)}>
          <div className="modal-70" onClick={e => e.stopPropagation()}>
            <header style={s.header}>
              <h3 style={s.title}>{serviceForm.id ? 'Edit Service' : 'Add Billed Service'}</h3>
              <button style={s.closeBtn} onClick={() => setIsServiceModalOpen(false)}><X size={22} /></button>
            </header>
            <div style={{ padding: '24px', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '20px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={s.label}>Product / Service <span style={{ color: '#3b82f6' }}>*</span></label>
                  <CustomSelect options={products.length ? products : services} value={serviceForm.serviceId} onChange={(val: string) => {
                    const list = products.length ? products : services;
                    const srv = list.find((c: any) => c.id === val);
                    setServiceForm(prev => ({ ...prev, serviceId: val, price: srv ? Number((srv as any).price || prev.price) : prev.price }));
                  }} placeholder="Select Product/Service..." icon={Wrench} />
                </div>
                <div>
                  <label style={s.label}>Quantity</label>
                  <div style={s.inputWrapper}>
                    <Hash style={s.icon} size={16} />
                    <input type="number" min="1" style={s.input} value={serviceForm.quantity} onChange={e => setServiceForm({ ...serviceForm, quantity: Number(e.target.value) })} />
                  </div>
                </div>
                <div>
                  <label style={s.label}>Unit Price</label>
                  <div style={s.inputWrapper}>
                    <DollarSign style={s.icon} size={16} />
                    <input type="number" min="0" step="0.01" style={s.input} value={serviceForm.price} onChange={e => setServiceForm({ ...serviceForm, price: Number(e.target.value) })} />
                  </div>
                </div>
                <div>
                  <label style={s.label}>Tax %</label>
                  {taxes.length > 0 && (
                    <div style={{ marginBottom: '8px' }}>
                      <CustomSelect
                        options={taxes.map((t: any) => ({ id: String(Number(t.percentage)), name: `${t.name} (${Number(t.percentage)}%)` }))}
                        value={String(Number(serviceForm.taxPercentage))}
                        onChange={(val: string) => setServiceForm(prev => ({ ...prev, taxPercentage: Number(val) }))}
                        placeholder="Select tax rate..."
                        icon={Percent}
                      />
                    </div>
                  )}
                  <div style={s.inputWrapper}>
                    <Percent style={s.icon} size={16} />
                    <input type="number" min="0" step="0.01" inputMode="decimal" style={s.input} value={serviceForm.taxPercentage} onChange={e => setServiceForm({ ...serviceForm, taxPercentage: Number(e.target.value) })} />
                  </div>
                </div>
                <div>
                  <label style={s.label}>Apply Tax (add)</label>
                  <div style={s.segmentContainer}>
                    <button onClick={() => setServiceForm({ ...serviceForm, applyTax: 'Yes', minusTax: 'No' })} style={s.segmentBtn(serviceForm.applyTax === 'Yes', 'yes')}>Yes</button>
                    <button onClick={() => setServiceForm({ ...serviceForm, applyTax: 'No' })} style={s.segmentBtn(serviceForm.applyTax === 'No', 'no')}>No</button>
                  </div>
                </div>
                {serviceForm.applyTax === 'No' && (
                  <div>
                    <label style={s.label}>Minus Tax (subtract)</label>
                    <div style={s.segmentContainer}>
                      <button onClick={() => setServiceForm({ ...serviceForm, minusTax: 'Yes' })} style={s.segmentBtn(serviceForm.minusTax === 'Yes', 'yes')}>Yes</button>
                      <button onClick={() => setServiceForm({ ...serviceForm, minusTax: 'No' })} style={s.segmentBtn(serviceForm.minusTax === 'No', 'no')}>No</button>
                    </div>
                  </div>
                )}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={s.label}>Notes</label>
                  <textarea style={{ ...s.input, minHeight: '60px', resize: 'vertical', padding: '12px 14px' }} value={serviceForm.notes} onChange={e => setServiceForm({ ...serviceForm, notes: e.target.value })} placeholder="Optional notes..."></textarea>
                </div>
              </div>

              <div style={{ marginTop: '24px', backgroundColor: '#f8fafc', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#64748b', marginBottom: '8px' }}>
                  <span>Subtotal</span><span style={{ fontWeight: 600, color: '#1e293b' }}>${serviceForm.subtotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#64748b', marginBottom: '8px' }}>
                  <span>Tax</span>
                  <span style={{ fontWeight: 600, color: serviceForm.applyTax === 'Yes' ? '#ef4444' : serviceForm.minusTax === 'Yes' ? '#10b981' : '#1e293b' }}>
                    {serviceForm.applyTax === 'Yes' ? '+' : serviceForm.minusTax === 'Yes' ? '-' : ''}${serviceForm.taxAmount.toFixed(2)}
                  </span>
                </div>
                <div style={{ borderTop: '1px dashed #cbd5e1', margin: '12px 0' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Total</span>
                  <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a' }}>${serviceForm.total.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#334155' }}>Total Minus Tax</span>
                  <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f766e' }}>${Number(serviceForm.totalMinusTax || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
            <footer style={s.footer}>
              <button onClick={() => setIsServiceModalOpen(false)} style={s.btnOutline}>Cancel</button>
              <button onClick={handleSaveService} disabled={isSaving} style={s.btnPrimary}>
                <Save size={16} /> {isSaving ? 'Saving...' : 'Save Service'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* --- PAYROLL MODAL --- */}
      {isPayrollModalOpen && (
        <div className="modal-overlay-centered" onClick={() => setIsPayrollModalOpen(false)}>
          <div className="modal-70" onClick={e => e.stopPropagation()}>
            <header style={s.header}>
              <h3 style={s.title}>Register Payment</h3>
              <button style={s.closeBtn} onClick={() => setIsPayrollModalOpen(false)}><X size={22} /></button>
            </header>
            <div style={{ padding: '24px', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '20px' }}>
                <div>
                  <label style={s.label}>Employee <span style={{ color: '#3b82f6' }}>*</span></label>
                  <CustomSelect 
                    options={employees.map(e => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }))} 
                    value={payrollForm.employeeId} 
                    onChange={(val: string) => setPayrollForm({ ...payrollForm, employeeId: val })} 
                    placeholder="Select Employee..." 
                    icon={User} 
                  />
                </div>
                <div>
                  <label style={s.label}>Date</label>
                  <div style={s.inputWrapper}>
                    <CalendarDays style={s.icon} size={16} />
                    <input type="date" style={s.input} value={payrollForm.date} onChange={e => setPayrollForm({ ...payrollForm, date: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label style={s.label}>Base Amount <span style={{ color: '#3b82f6' }}>*</span></label>
                  <div style={s.inputWrapper}>
                    <DollarSign style={s.icon} size={16} />
                    <input type="number" min="0" step="0.01" style={s.input} value={payrollForm.baseAmount} onChange={e => setPayrollForm({ ...payrollForm, baseAmount: Number(e.target.value) })} />
                  </div>
                </div>
                <div>
                  <label style={s.label}>Extra Amount</label>
                  <div style={s.inputWrapper}>
                    <DollarSign style={s.icon} size={16} />
                    <input type="number" min="0" step="0.01" style={s.input} value={payrollForm.extraAmount} onChange={e => setPayrollForm({ ...payrollForm, extraAmount: Number(e.target.value) })} />
                  </div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={s.label}>Extra Note</label>
                  <input type="text" style={{...s.input, paddingLeft: '14px'}} value={payrollForm.extraNote} onChange={e => setPayrollForm({ ...payrollForm, extraNote: e.target.value })} placeholder="Reason for extra..." />
                </div>
                <div>
                  <label style={s.label}>Discount Amount</label>
                  <div style={s.inputWrapper}>
                    <DollarSign style={s.icon} size={16} />
                    <input type="number" min="0" step="0.01" style={s.input} value={payrollForm.discountAmount} onChange={e => setPayrollForm({ ...payrollForm, discountAmount: Number(e.target.value) })} />
                  </div>
                </div>
                <div>
                  <label style={s.label}>Discount Note</label>
                  <input type="text" style={{...s.input, paddingLeft: '14px'}} value={payrollForm.discountNote} onChange={e => setPayrollForm({ ...payrollForm, discountNote: e.target.value })} placeholder="Reason for discount..." />
                </div>
              </div>

              <div style={{ marginTop: '24px', backgroundColor: '#f0fdf4', borderRadius: '12px', padding: '20px', border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: '#166534' }}>Total Payment</span>
                <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#166534' }}>${Number(payrollForm.totalAmount).toFixed(2)}</span>
              </div>
            </div>
            <footer style={s.footer}>
              <button onClick={() => setIsPayrollModalOpen(false)} style={s.btnOutline}>Cancel</button>
              <button onClick={handleSavePayroll} disabled={isSaving} style={{...s.btnPrimary, backgroundColor: '#10b981'}}>
                <Save size={16} /> {isSaving ? 'Saving...' : 'Register Payment'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* --- FIELD CONFIGURATION MODAL --- */}
      {isFieldConfigOpen && (
        <div className="modal-overlay-centered" onClick={() => setIsFieldConfigOpen(false)}>
          <div className="modal-70" onClick={e => e.stopPropagation()}>
            <header style={s.header}>
              <div>
                <h3 style={s.title}>Field & Button Visibility</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#6b7280' }}>Marca un rol para OCULTARLE ese elemento.</p>
              </div>
              <button style={s.closeBtn} onClick={() => setIsFieldConfigOpen(false)}><X size={22} /></button>
            </header>
            <div style={{ padding: '24px', overflowY: 'auto' }}>
              {rolesList.length === 0 ? (
                <div style={{ color: '#6b7280', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>No hay roles configurados.</div>
              ) : (
                <>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#1e293b', fontWeight: 700 }}>Form Fields</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
                    {CONFIGURABLE_FIELDS.map(field => (
                      <div key={field.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>{field.label} <span style={{ color: '#94a3b8', fontWeight: 500 }}>· {field.section}</span></div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {rolesList.map(role => {
                            const hidden = (fieldConfigDraft.visibility?.[field.id] || []).includes(role.id);
                            return (
                              <button key={role.id} onClick={() => toggleElementVisibilityForRole(field.id, role.id)}
                                style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: `1px solid ${hidden ? '#fca5a5' : '#cbd5e1'}`, backgroundColor: hidden ? '#fef2f2' : 'white', color: hidden ? '#dc2626' : '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {hidden ? <X size={12} /> : <CheckSquare size={12} />} {role.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#1e293b', fontWeight: 700 }}>Buttons & Tabs</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {CONFIGURABLE_BUTTONS.map(btn => (
                      <div key={btn.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>{btn.label} <span style={{ color: '#94a3b8', fontWeight: 500 }}>· {btn.section}</span></div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {rolesList.map(role => {
                            const hidden = (fieldConfigDraft.visibility?.[btn.id] || []).includes(role.id);
                            return (
                              <button key={role.id} onClick={() => toggleElementVisibilityForRole(btn.id, role.id)}
                                style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: `1px solid ${hidden ? '#fca5a5' : '#cbd5e1'}`, backgroundColor: hidden ? '#fef2f2' : 'white', color: hidden ? '#dc2626' : '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {hidden ? <X size={12} /> : <CheckSquare size={12} />} {role.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <footer style={s.footer}>
              <button onClick={() => setIsFieldConfigOpen(false)} style={s.btnOutline}>Cancel</button>
              <button onClick={saveFieldConfig} disabled={isSavingFieldConfig} style={s.btnPrimary}>
                <Save size={16} /> {isSavingFieldConfig ? 'Saving...' : 'Save Configuration'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* --- CÁMARA RÁPIDA (RÁFAGA): se mantiene abierta y permite varias tomas --- */}
      {cameraOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#000', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', color: '#fff', background: 'rgba(0,0,0,0.45)' }}>
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Camera size={18} /> {cameraOpen === 'before' ? 'Fotos Before' : 'Fotos After'} · {burstCount} tomada(s)
            </div>
            <button onClick={() => setCameraOpen(null)} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: '10px', padding: '8px 14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <X size={18} /> Cerrar
            </button>
          </div>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {isCompressing && (
              <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem' }}>
                Procesando…
              </div>
            )}
            {burstCount > 0 && (
              <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(16,185,129,0.9)', color: '#fff', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700 }}>
                {burstCount} foto(s) agregada(s)
              </div>
            )}
          </div>
          <div style={{ padding: '18px 16px calc(18px + env(safe-area-inset-bottom))', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
            <button onClick={captureBurst} aria-label="Tomar foto"
              style={{ width: '74px', height: '74px', borderRadius: '50%', background: '#fff', border: '5px solid rgba(255,255,255,0.5)', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.4)', flexShrink: 0 }} />
            <button onClick={() => setCameraOpen(null)}
              style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '12px', padding: '14px 22px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>
              Listo ({burstCount})
            </button>
          </div>
        </div>
      )}

      {/* --- MODAL DE CAMBIO DE ESTADO (reemplaza la lista desplegable) --- */}
      {statusModal && (
        <StatusChangeModal
          config={statusModal}
          statuses={statuses}
          onClose={() => setStatusModal(null)}
        />
      )}

    </div>
  );
}