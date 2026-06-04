import { useState, useEffect, useRef } from 'react';
import { 
  Search, MapPin, Plus, X, Edit2, Trash2, 
  Activity, FileText, CalendarDays, Clock, User, Wrench, Hash, Flag, Users, StickyNote, PenTool, ChevronDown, ClipboardCheck,
  Briefcase, ShieldCheck, AlertTriangle, Image as ImageIcon, Copy, CheckSquare, DollarSign, Filter, CheckCircle, Calendar, Calculator, Percent, PlayCircle, BarChart3, FileImage,
  Save, XCircle, Layers, Settings, Receipt, CalendarClock, Printer, Upload, Camera, Loader2
} from 'lucide-react';

import type { Property as BaseProperty, Status, Team, Priority, Service, Customer, SystemUser, Role, PayrollRecord, Tax } from '../types/index';

import { propertiesService } from '../services/propertiesService';
import { storageService } from '../services/storageService';
import { payrollService } from '../services/payrollService';
import { DEFAULT_PHOTO_CONFIG } from '../services/photoConfigService';
import type { PhotoConfig } from '../services/photoConfigService';
import { compressImage } from '../utils/imageCompression';
import { db } from '../config/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot, getDocs, setDoc } from 'firebase/firestore';

type Property = BaseProperty & {
  employeeStartedBy?: string | null;
  employeeStartedAt?: string | null;
  employeeFinishedBy?: string | null;
  employeeFinishedAt?: string | null;
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

// ⭐ ELEMENTOS configurables del formulario y del detail modal.
//    El admin puede definir qué roles ven cada elemento desde el botón ⚙️ del form.
//    Los IDs deben coincidir con los usados en el JSX (helper `isElementVisible(id)`).
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
  { id: 'btn_qcheck', label: 'Quality Check', section: 'Admin' },
  { id: 'btn_editDetails', label: 'Edit Details', section: 'Admin' },
  { id: 'btn_deleteProperty', label: 'Delete Property', section: 'Admin' },
  { id: 'btn_exportPdf', label: 'Export PDF', section: 'Media' },
  { id: 'btn_uploadPhoto', label: 'Upload Photo (Cargar)', section: 'Media' },
  { id: 'btn_takePhoto', label: 'Take Photo (Cámara)', section: 'Media' },
  { id: 'btn_tabFinancials', label: 'Financials & Billing Tab', section: 'Tabs' },
  { id: 'btn_tabMedia', label: 'Notes & Photos Tab', section: 'Tabs' }
];

// ⭐ Estructura del documento Firestore: app_settings/houses_form_config
//    { visibility: { 'client': ['roleId1', 'roleId2'], ... } }
//    Los roleIds listados son los roles que NO ven ese elemento.
type FormVisibilityConfig = {
  visibility: Record<string, string[]>;
};

const DEFAULT_FORM_CONFIG: FormVisibilityConfig = { visibility: {} };

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

const StatusPillSelector = ({ currentStatusId, statuses, onChange, disabled }: { currentStatusId: string, statuses: Status[], onChange: (id: string) => void, disabled: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const safeValue = String(currentStatusId || '').toLowerCase().trim();
  const status = statuses.find(s => String(s.id).toLowerCase().trim() === safeValue || String(s.name).toLowerCase().trim() === safeValue);
  
  const pointColor = status ? status.color : '#64748b';
  const text = status ? status.name : 'Unassigned';

  return (
    <div tabIndex={0} onBlur={() => setTimeout(() => setIsOpen(false), 200)} style={{ position: 'relative', display: 'inline-block', outline: 'none' }}>
      <div 
        onClick={(e) => { e.stopPropagation(); if(!disabled) setIsOpen(!isOpen); }}
        style={{ 
          backgroundColor: 'transparent', color: '#111827', padding: '6px 12px', borderRadius: '20px', 
          fontSize: '0.85rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px',
          cursor: disabled ? 'not-allowed' : 'pointer', border: '1px solid #e5e7eb', transition: 'all 0.2s',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
        }}
        onMouseEnter={(e) => { if(!disabled) e.currentTarget.style.backgroundColor = '#f8fafc'; }}
        onMouseLeave={(e) => { if(!disabled) e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: pointColor }}></span>
        {text}
        <ChevronDown size={14} color="#9ca3af" style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
      </div>

      {isOpen && (
        <div style={{ 
          position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'white', 
          border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', 
          zIndex: 9999, minWidth: '180px', overflow: 'hidden', textAlign: 'left'
        }}>
          {statuses.map((s) => (
            <div 
              key={s.id}
              onClick={(e) => { 
                e.preventDefault(); 
                e.stopPropagation();
                if(s.id !== currentStatusId && s.name !== currentStatusId) onChange(s.id); 
                setIsOpen(false); 
              }}
              style={{ 
                padding: '12px 14px', fontSize: '0.85rem', fontWeight: 500, color: '#111827', 
                display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                backgroundColor: (currentStatusId === s.id || currentStatusId === s.name) ? '#f8fafc' : 'transparent',
                borderBottom: '1px solid #f1f5f9'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = (currentStatusId === s.id || currentStatusId === s.name) ? '#f8fafc' : 'transparent'}
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
  roles?: Role[];   // ⭐ Lista de roles disponibles para el modal de configuración de visibilidad
}

type DetailTab = 'overview' | 'financials' | 'media';

export default function HousesView({ onOpenMenu, properties, setProperties, onCheckHouse, currentUser, activeRole, isSuperAdmin, roles = [] }: HousesViewProps) {
  
  const [activeFilter, setActiveFilter] = useState('All');
  const [houseFilter, setHouseFilter] = useState('All'); 
  const [invoiceFilter, setInvoiceFilter] = useState('All'); 
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState<Property | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('overview');
  
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [customersList, setCustomersList] = useState<Customer[]>([]); 
  const [employees, setEmployees] = useState<any[]>([]); 

  // ⭐ Lista de roles cargada directamente desde Firestore (no depende de la prop).
  //    Inicialmente toma el valor del padre (si lo pasó), luego se sobrescribe con Firestore.
  const [rolesList, setRolesList] = useState<Role[]>(roles);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAssigningWorker, setIsAssigningWorker] = useState(false);
  const [isAssigningWorkerForm, setIsAssigningWorkerForm] = useState(false);

  // ⭐ Configuración de visibilidad de campos del form por rol
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
  const [isServiceFromForm, setIsServiceFromForm] = useState(false);
  const [houseServices, setHouseServices] = useState<ServiceRecord[]>([]);
  const [formServices, setFormServices] = useState<ServiceRecord[]>([]);
  const [servicesToDelete, setServicesToDelete] = useState<string[]>([]);

  const defaultServiceForm: ServiceRecord = {
    propertyId: '', serviceId: '', quantity: 1, price: 0, subtotal: 0,
    applyTax: 'Yes', minusTax: 'No', taxPercentage: 0, taxAmount: 0, total: 0, notes: ''
  };
  const [serviceForm, setServiceForm] = useState<ServiceRecord>(defaultServiceForm);

  const [formData, setFormData] = useState<Property>({
    id: '', statusId: '', invoiceStatus: 'Pending', receiveDate: '', scheduleDate: '', client: '', note: '', address: '', employeeNote: '', serviceId: '', rooms: '1', bathrooms: '1', priorityId: '', teamId: '', timeIn: '', timeOut: '',
    beforePhotos: [], afterPhotos: [], assignedWorkers: [] 
  });

  const [beforePhotoURLs, setBeforePhotoURLs] = useState<string[]>([]);
  const [afterPhotoURLs, setAfterPhotoURLs] = useState<string[]>([]);
  const [beforeFiles, setBeforeFiles] = useState<File[]>([]);
  const [afterFiles, setAfterFiles] = useState<File[]>([]);
  // Refs separados para "cargar archivo" y "tomar foto"
  const beforeFileInputRef = useRef<HTMLInputElement>(null);
  const beforeCameraInputRef = useRef<HTMLInputElement>(null);
  const afterFileInputRef = useRef<HTMLInputElement>(null);
  const afterCameraInputRef = useRef<HTMLInputElement>(null);
  // Estado de la configuración de fotos (gestionado por el admin)
  const [photoConfig, setPhotoConfig] = useState<PhotoConfig>(DEFAULT_PHOTO_CONFIG);
  const [isCompressing, setIsCompressing] = useState(false);

  const canEdit = isSuperAdmin || activeRole?.permissions?.find(p => p.module === 'Houses')?.canEdit;
  const canDelete = isSuperAdmin || activeRole?.permissions?.find(p => p.module === 'Houses')?.canDelete;

  // ⭐ Carga reactiva con onSnapshot — gracias a Firestore Persistence (IndexedDB),
  //    las cargas posteriores son INSTANTÁNEAS porque vienen del caché local.
  //    Además: cambios hechos por otros usuarios se reflejan automáticamente.
  useEffect(() => {
    setIsLoading(true);

    // Track de qué colecciones ya cargaron al menos una vez
    const loadedCollections = new Set<string>();
    const TOTAL_COLLECTIONS = 9;
    const markLoaded = (name: string) => {
      loadedCollections.add(name);
      if (loadedCollections.size >= TOTAL_COLLECTIONS) {
        setIsLoading(false);
      }
    };

    const unsubscribes: (() => void)[] = [];

    // 1) Properties
    unsubscribes.push(onSnapshot(
      collection(db, 'properties'),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Property[];
        setProperties(data);
        markLoaded('properties');
      },
      (err) => { console.error("Error Properties:", err); markLoaded('properties'); }
    ));

    // 2) Statuses (settings_statuses) — ordenados por 'order'
    unsubscribes.push(onSnapshot(
      collection(db, collectionMap.status),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Status[];
        setStatuses(data.sort((a, b) => Number(a.order) - Number(b.order)));
        markLoaded('statuses');
      },
      (err) => { console.error("Error Statuses:", err); markLoaded('statuses'); }
    ));

    // 3) Teams
    unsubscribes.push(onSnapshot(
      collection(db, collectionMap.team),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Team[];
        setTeams(data);
        markLoaded('teams');
      },
      (err) => { console.error("Error Teams:", err); markLoaded('teams'); }
    ));

    // 4) Priorities
    unsubscribes.push(onSnapshot(
      collection(db, collectionMap.priority),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Priority[];
        setPriorities(data);
        markLoaded('priorities');
      },
      (err) => { console.error("Error Priorities:", err); markLoaded('priorities'); }
    ));

    // 5) Services
    unsubscribes.push(onSnapshot(
      collection(db, collectionMap.service),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Service[];
        setServices(data);
        markLoaded('services');
      },
      (err) => { console.error("Error Services:", err); markLoaded('services'); }
    ));

    // 6) Taxes
    unsubscribes.push(onSnapshot(
      collection(db, collectionMap.tax),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Tax[];
        setTaxes(data);
        markLoaded('taxes');
      },
      (err) => { console.error("Error Taxes:", err); markLoaded('taxes'); }
    ));

    // 7) Customers
    unsubscribes.push(onSnapshot(
      collection(db, 'customers'),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setCustomersList(data as any);
        markLoaded('customers');
      },
      (err) => { console.error("Error Customers:", err); markLoaded('customers'); }
    ));

    // 8) System Users (employees)
    unsubscribes.push(onSnapshot(
      collection(db, 'system_users'),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setEmployees(data as any);
        markLoaded('users');
      },
      (err) => { console.error("Error Users:", err); markLoaded('users'); }
    ));

    // 9) Photo Config (es un documento, no una colección)
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

    // 10) Form Visibility Config (configuración de campos por rol)
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

    // 11) ⭐ Roles (settings_roles) — para el modal de Field Configuration
    //     Esto permite que HousesView funcione sin depender de que el padre pase los roles
    unsubscribes.push(onSnapshot(
      collection(db, 'settings_roles'),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Role[];
        setRolesList(data);
      },
      (err) => { console.error("Error Roles:", err); }
    ));

    // Cleanup: desuscribir al desmontar el componente
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

    if (subtotal !== serviceForm.subtotal || taxAmount !== serviceForm.taxAmount || total !== serviceForm.total) {
      setServiceForm(prev => ({ ...prev, subtotal, taxAmount, total }));
    }
  }, [serviceForm.quantity, serviceForm.price, serviceForm.taxPercentage, serviceForm.applyTax, serviceForm.minusTax, isServiceModalOpen]);

  // ⭐ Tipo extendido local: añade `allowedStatusIds` y `hiddenGroups` para evitar
  //    errores de TypeScript si types/index.ts no se actualizó.
  type PermissionExt = { module: string; canView?: boolean; canAdd?: boolean; canEdit?: boolean; canDelete?: boolean; scope?: 'All' | 'Own'; allowedStatusIds?: string[]; hiddenGroups?: string[] };

  const housePermission = activeRole?.permissions?.find(p => p.module === 'Houses') as PermissionExt | undefined;
  const userScope = isSuperAdmin ? 'All' : (housePermission?.scope || 'Own');
  const allowedStatusIds: string[] = housePermission?.allowedStatusIds || [];
  const hiddenGroups: string[] = housePermission?.hiddenGroups || [];

  // ⭐ Helper: determina si un grupo de elementos es visible para el usuario actual.
  //    SuperAdmin siempre ve todo. Si el grupo no está en hiddenGroups, es visible.
  const isVisible = (groupId: string): boolean => {
    if (isSuperAdmin) return true;
    return !hiddenGroups.includes(groupId);
  };

  // ⭐ Helper granular: determina si un elemento individual (campo o botón) es
  //    visible para el rol del usuario actual. SuperAdmin siempre ve todo.
  //    Usa la configuración guardada en app_settings/houses_form_config.
  const isElementVisible = (elementId: string): boolean => {
    if (isSuperAdmin) return true;
    const userRoleId = (currentUser as any)?.roleId;
    if (!userRoleId) return true;
    const hiddenForRoles = formConfig?.visibility?.[elementId] || [];
    return !hiddenForRoles.includes(userRoleId);
  };

  // ⭐ Toggle de visibilidad de un elemento para un rol en el draft
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

  // ⭐ Abrir el modal de configuración (copia config actual al draft)
  const openFieldConfigModal = () => {
    setFieldConfigDraft({ visibility: { ...(formConfig.visibility || {}) } });
    setIsFieldConfigOpen(true);
  };

  // ⭐ Guardar la configuración del form en Firestore (usa setDoc con merge)
  const saveFieldConfig = async () => {
    setIsSavingFieldConfig(true);
    try {
      const ref = doc(db, 'app_settings', 'houses_form_config');
      await setDoc(ref, { visibility: fieldConfigDraft.visibility }, { merge: true });
      // El onSnapshot actualizará formConfig automáticamente
      setIsFieldConfigOpen(false);
    } catch (error) {
      console.error("Error guardando configuración de campos:", error);
      alert("Error al guardar la configuración. Revisa las reglas de Firestore.");
    } finally {
      setIsSavingFieldConfig(false);
    }
  };

  const propertiesWithScope = properties.filter(prop => {
    // 1) Filtro de SCOPE (Own / All)
    if (userScope !== 'All') {
      if (!currentUser) return false;
      const isAssigned = prop.assignedWorkers?.includes(currentUser.id);
      const isSameTeam = currentUser.teamId && (prop.teamId === currentUser.teamId);
      if (!isAssigned && !isSameTeam) return false;
    }

    // 2) Filtro de STATUS permitidos (solo si NO es superAdmin y tiene lista configurada)
    //    Si la lista está vacía o no existe = sin restricción (ver todos).
    if (!isSuperAdmin && allowedStatusIds.length > 0) {
      // statusId puede venir como ID o como nombre del status, comparamos contra ambos
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
      .filter(p => {
        const st = statuses.find(s => s.id === p.statusId || s.name === p.statusId);
        const isStatusInvoice = st?.name?.toLowerCase() === 'invoice' || p.statusId?.toLowerCase() === 'invoice';
        return !isStatusInvoice; 
      })
      .map(p => `${p.client || 'Unknown'}|${p.address || 'Unknown'}`)
  )).map(str => {
    const [client, address] = str.split('|');
    return { client, address };
  }).sort((a, b) => a.client.localeCompare(b.client));

  const filteredProperties = propertiesWithScope.filter(p => {
    const st = statuses.find(s => s.id === p.statusId || s.name === p.statusId);
    const isStatusInvoice = st?.name?.toLowerCase() === 'invoice' || p.statusId?.toLowerCase() === 'invoice';
    if (isStatusInvoice) return false;

    let passStatus = true;
    if (activeFilter !== 'All') passStatus = st?.name === activeFilter;
    
    let passHouse = true;
    if (houseFilter !== 'All') passHouse = `${p.client || 'Unknown'}|${p.address || 'Unknown'}` === houseFilter;

    let passInvoice = true;
    if (invoiceFilter !== 'All') passInvoice = p.invoiceStatus === invoiceFilter;
    
    return passStatus && passHouse && passInvoice;
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
    const datePart = selectedHouse.scheduleDate.replace(/-/g, '');
    const timePart = selectedHouse.timeIn.replace(/:/g, '') + '00';
    const startDateTime = `${datePart}T${timePart}`;
    const [year, month, day] = selectedHouse.scheduleDate.split('-').map(Number);
    const [hour, min] = selectedHouse.timeIn.split(':').map(Number);
    const endDateObj = new Date(year, month - 1, day, hour + 2, min);
    const endDatePart = endDateObj.toISOString().split('T')[0].replace(/-/g, '');
    const endTimePart = endDateObj.toTimeString().split(' ')[0].replace(/:/g, '');
    const endDateTime = `${endDatePart}T${endTimePart}`;
    const calendarUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Cleaning: ' + selectedHouse.client)}&dates=${startDateTime}/${endDateTime}&details=${encodeURIComponent(selectedHouse.note || '')}&location=${encodeURIComponent(selectedHouse.address)}&sf=true&output=xml`;
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
      setFormData({ id: '', statusId: defaultStatus, invoiceStatus: 'Pending', receiveDate: new Date().toISOString().split('T')[0], scheduleDate: '', client: '', note: '', address: '', employeeNote: '', serviceId: '', rooms: '1', bathrooms: '1', priorityId: '', teamId: '', timeIn: '', timeOut: '', beforePhotos: [], afterPhotos: [], assignedWorkers: [] });
      setFormServices([]);
      setBeforePhotoURLs([]);
      setAfterPhotoURLs([]);
      setBeforeFiles([]);
      setAfterFiles([]);
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
    setFormServices(houseServices.map(s => ({ ...s, id: `temp-${Math.random().toString(36).substring(2, 9)}`, propertyId: '' })));
    setServicesToDelete([]);
    setIsDetailModalOpen(false);
    setIsFormModalOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormModalOpen(false);
    setSelectedHouse(null);
  };

  const handleCustomerSelect = (customerName: string) => {
    const selectedCust = customersList.find(c => c.name === customerName);
    if (selectedCust) {
      setFormData({ ...formData, client: customerName, address: selectedCust.address || formData.address });
    } else {
      setFormData({ ...formData, client: customerName });
    }
  };

  // ============================================================
  // ⭐ FUNCIÓN handleSave CORREGIDA
  // ============================================================
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

      // PASO 1: Si es nuevo, crear el documento primero para tener un ID válido
      if (!workingId) {
        const { id, ...restOfData } = formData;
        const dataToCreate = { 
          ...restOfData,
          assignedWorkers: finalAssignedWorkers,
          description: `${formData.client} - ${formData.rooms} rooms`, 
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

      // PASO 2: Subir fotos BEFORE a Storage
      let uploadedBeforeUrls: string[] = [];
      if (beforeFiles.length > 0) {
        console.log(`📤 Uploading ${beforeFiles.length} before photos...`);
        try {
          uploadedBeforeUrls = await storageService.uploadMultiplePropertyPhotos(
            beforeFiles,
            formData.client,
            formData.address,
            'before'
          );
          console.log('✅ All before photos uploaded:', uploadedBeforeUrls);
        } catch (uploadError) {
          console.error("❌ Error uploading before photos:", uploadError);
          alert("Failed to upload before photos. Check console for details.");
        }
      }

      // PASO 3: Subir fotos AFTER a Storage
      let uploadedAfterUrls: string[] = [];
      if (afterFiles.length > 0) {
        console.log(`📤 Uploading ${afterFiles.length} after photos...`);
        try {
          uploadedAfterUrls = await storageService.uploadMultiplePropertyPhotos(
            afterFiles,
            formData.client,
            formData.address,
            'after'
          );
          console.log('✅ All after photos uploaded:', uploadedAfterUrls);
        } catch (uploadError) {
          console.error("❌ Error uploading after photos:", uploadError);
          alert("Failed to upload after photos. Check console for details.");
        }
      }

      // PASO 4: Armar el objeto final con TODAS las URLs (anteriores + nuevas)
      const finalDataToUpdate = {
        ...formData,
        assignedWorkers: finalAssignedWorkers,
        beforePhotos: [...(formData.beforePhotos || []), ...uploadedBeforeUrls],
        afterPhotos: [...(formData.afterPhotos || []), ...uploadedAfterUrls]
      };

      // PASO 5: ACTUALIZAR Firestore SIEMPRE (tanto si es nuevo como si es edición)
      // ⚠️ ESTE ERA EL BUG: antes solo se actualizaba si !isNew
      const { id: _omitId, ...dataForFirestore } = finalDataToUpdate;
      await propertiesService.update(workingId, dataForFirestore as any);
      console.log('✅ Property updated in Firestore with photo URLs');

      // PASO 6: Sincronizar servicios facturados
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

      // PASO 7: Actualizar el state local con los datos completos (incluyendo URLs)
      if (isNew) {
        const fullNewData = { 
          ...finalDataToUpdate, 
          id: workingId, 
          description: `${formData.client} - ${formData.rooms} rooms`, 
          city: 'TBD', 
          size: 'TBD' 
        };
        setProperties([...properties, fullNewData as Property]);
      } else {
        setProperties(properties.map(p => 
          p.id === workingId ? { ...finalDataToUpdate, id: workingId } as Property : p
        ));
      }

      // PASO 8: Limpiar estados temporales
      setBeforeFiles([]); 
      setAfterFiles([]);
      setBeforePhotoURLs([]); 
      setAfterPhotoURLs([]);
      handleCloseForm();

    } catch (error) {
      console.error("❌ Error saving to Firebase:", error);
      alert("Error trying to save property to Firebase. Check console.");
    } finally {
      setIsSaving(false);
    }
  };

  // ============================================================
  // ⭐ FUNCIÓN PARA GUARDAR SOLO FOTOS DESDE EL MODAL DE DETALLE
  // ============================================================
  const handleSavePhotosFromDetail = async () => {
    if (!selectedHouse) return alert("No property selected.");

    setIsSaving(true);
    try {
      const workingId = selectedHouse.id;

      // Subir fotos BEFORE nuevas
      let uploadedBeforeUrls: string[] = [];
      if (beforeFiles.length > 0) {
        console.log(`📤 Uploading ${beforeFiles.length} before photos...`);
        try {
          uploadedBeforeUrls = await storageService.uploadMultiplePropertyPhotos(
            beforeFiles,
            selectedHouse.client,
            selectedHouse.address,
            'before'
          );
          console.log('✅ All before photos uploaded:', uploadedBeforeUrls);
        } catch (uploadError) {
          console.error("❌ Error uploading before photos:", uploadError);
          alert("Failed to upload before photos. Check console for details.");
          setIsSaving(false);
          return;
        }
      }

      // Subir fotos AFTER nuevas
      let uploadedAfterUrls: string[] = [];
      if (afterFiles.length > 0) {
        console.log(`📤 Uploading ${afterFiles.length} after photos...`);
        try {
          uploadedAfterUrls = await storageService.uploadMultiplePropertyPhotos(
            afterFiles,
            selectedHouse.client,
            selectedHouse.address,
            'after'
          );
          console.log('✅ All after photos uploaded:', uploadedAfterUrls);
        } catch (uploadError) {
          console.error("❌ Error uploading after photos:", uploadError);
          alert("Failed to upload after photos. Check console for details.");
          setIsSaving(false);
          return;
        }
      }

      // Calcular las URLs finales (Storage = solo URLs que empiezan con http)
      const existingBeforeFromStorage = (selectedHouse.beforePhotos || []).filter(u => u.startsWith('http'));
      const existingAfterFromStorage = (selectedHouse.afterPhotos || []).filter(u => u.startsWith('http'));

      const finalBeforePhotos = [...existingBeforeFromStorage, ...uploadedBeforeUrls];
      const finalAfterPhotos = [...existingAfterFromStorage, ...uploadedAfterUrls];

      // Actualizar Firestore con las URLs
      await propertiesService.update(workingId, {
        beforePhotos: finalBeforePhotos,
        afterPhotos: finalAfterPhotos
      } as any);
      console.log('✅ Property updated in Firestore with photo URLs');

      // Actualizar estados locales
      const updatedHouse = {
        ...selectedHouse,
        beforePhotos: finalBeforePhotos,
        afterPhotos: finalAfterPhotos
      };
      setSelectedHouse(updatedHouse);
      setProperties(properties.map(p => p.id === workingId ? updatedHouse : p));

      // Refrescar los URLs visuales
      setBeforePhotoURLs(finalBeforePhotos);
      setAfterPhotoURLs(finalAfterPhotos);

      // Limpiar files temporales
      setBeforeFiles([]);
      setAfterFiles([]);

      alert("Photos saved successfully!");
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

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'before' | 'after') => {
    if (!e.target.files || e.target.files.length === 0) return;

    const filesArray = Array.from(e.target.files);
    setIsCompressing(true);

    try {
      console.log(`Compressing ${filesArray.length} image(s)...`);

      // Comprimir las imágenes en paralelo usando la config del admin
      const compressedFiles = await Promise.all(
        filesArray.map(file =>
          compressImage(file, {
            quality: photoConfig.compressionQuality,
            maxWidth: photoConfig.maxImageWidth,
            maxSizeMB: photoConfig.maxSizeMB
          })
        )
      );

      // Crear previews (URLs locales para mostrar las miniaturas)
      const fileUrls = compressedFiles.map(file => URL.createObjectURL(file));

      if (type === 'before') {
        setBeforeFiles(prev => [...prev, ...compressedFiles]);
        setBeforePhotoURLs(prev => [...prev, ...fileUrls]);
      } else {
        setAfterFiles(prev => [...prev, ...compressedFiles]);
        setAfterPhotoURLs(prev => [...prev, ...fileUrls]);
      }

      console.log(`✅ ${compressedFiles.length} image(s) ready for upload`);
    } catch (error) {
      console.error('Error compressing images:', error);
      alert('Error al procesar las imágenes. Intenta de nuevo.');
    } finally {
      setIsCompressing(false);
      // Limpiar el input para que pueda seleccionar el mismo archivo de nuevo si lo quita
      if (e.target) e.target.value = '';
    }
  };

  const handleRemovePhoto = (index: number, type: 'before' | 'after') => {
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
  };

  const generatePDF = async (type: 'before' | 'after') => {
    const urls = type === 'before' ? beforePhotoURLs : afterPhotoURLs;

    if (urls.length === 0) {
      alert(`No hay fotos de tipo "${type.toUpperCase()}" subidas para generar el reporte.`);
      return;
    }

    // Mostrar feedback al usuario mientras se preparan las imágenes
    setIsSaving(true);

    try {
      // Convertir todas las URLs a base64 antes de pasarlas al PDF
      // Esto asegura que las imágenes aparezcan SIEMPRE en el PDF
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
            // Si falla, devolver la URL original como fallback
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

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8" />
            <title>${title} - ${selectedHouse?.client || 'Propiedad'}</title>
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
              .logo-section {
                display: flex;
                align-items: center;
                gap: 12px;
              }
              .logo-text {
                font-size: 22px;
                font-weight: 800;
                color: #1e3a8a;
                letter-spacing: 2px;
                line-height: 1;
              }
              .logo-subtitle {
                font-size: 10px;
                font-weight: 500;
                color: #64748b;
                letter-spacing: 3px;
                text-transform: uppercase;
                margin-top: 4px;
              }
              .address-section {
                text-align: right;
                font-size: 13px;
                color: #475569;
                max-width: 60%;
              }
              .address-label {
                font-weight: 700;
                color: #0f172a;
                margin-bottom: 2px;
              }
              h1.report-title {
                text-align: center;
                font-size: 38px;
                font-weight: 800;
                color: ${accentColor};
                margin: 40px 0 32px 0;
              }
              .photo-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 20px;
              }
              .photo-item {
                aspect-ratio: 1 / 1;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 8px rgba(0,0,0,0.12);
                background-color: #f1f5f9;
                page-break-inside: avoid;
              }
              .photo-item img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
              }
              .footer {
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #e2e8f0;
                text-align: center;
                font-size: 11px;
                color: #94a3b8;
              }
              @media print {
                @page {
                  margin: 12mm;
                  size: A4;
                }
                body {
                  background: white;
                  padding: 0;
                }
                .container {
                  box-shadow: none;
                  padding: 0;
                  max-width: 100%;
                }
                .photo-item {
                  break-inside: avoid;
                }
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
                ${selectedHouse?.client || ''} • Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
            <script>
              // Esperar a que todas las imágenes carguen antes de imprimir
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
                  if (img.complete) {
                    checkDone();
                  } else {
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

  const invoiceOptions = [{ id: 'Pre-Paid', name: 'Pre-Paid' }, { id: 'Needs Invoice', name: 'Needs Invoice' }, { id: 'Pending', name: 'Pending' }, { id: 'Paid', name: 'Paid' }];
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

    kpiCard: { backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' },
    kpiIconBox: (color: string) => ({ backgroundColor: `${color}15`, color: color, width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }),
    tableHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: '16px', flexShrink: 0 } as React.CSSProperties,
    pillBtn: (active: boolean) => ({ padding: '6px 16px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: active ? '#10b981' : 'transparent', color: active ? 'white' : '#6b7280', transition: 'all 0.2s', whiteSpace: 'nowrap' as const }),

    th: { padding: '12px 20px', textAlign: 'left' as const, fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' as const },
    td: { padding: '16px 20px', borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem', color: '#111827', verticalAlign: 'middle' as const },

    dashGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '24px', flexShrink: 0 } as React.CSSProperties,
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
    <div className="fade-in" style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .modal-overlay-centered { position: fixed; inset: 0; background-color: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 9999; box-sizing: border-box; }
        .modal-70 { background-color: #ffffff; width: 100%; max-width: 1000px; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); display: flex; flex-direction: column; max-height: 90vh; }
        .modal-90 { background-color: #ffffff; width: 100%; max-width: 1500px; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); display: flex; flex-direction: column; max-height: 95vh; }
        
        /* ⭐ Scrollbar moderno y elegante para el modal body */
        .modal-90 .modal-body-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .modal-90 .modal-body-scroll::-webkit-scrollbar-track { background: transparent; }
        .modal-90 .modal-body-scroll::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.4); border-radius: 10px; }
        .modal-90 .modal-body-scroll::-webkit-scrollbar-thumb:hover { background: rgba(100, 116, 139, 0.6); }
        .modal-90 .modal-body-scroll { scrollbar-width: thin; scrollbar-color: rgba(148, 163, 184, 0.4) transparent; }
        
        .modal-full { width: 95vw; max-width: 1400px; height: 90vh; background-color: #F8FAFC; border-radius: 12px; display: flex; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
        .modal-full-left { flex: 1; overflow-y: auto; padding: 3rem 2rem; }
        .modal-full-right { width: 380px; background-color: white; border-left: 1px solid #E2E8F0; display: flex; flex-direction: column; z-index: 5; flex-shrink: 0; }

        @media (max-width: 1024px) {
          .modal-full { flex-direction: column; overflow-y: auto; }
          .modal-full-left { padding: 1.5rem; overflow-y: visible; }
          .modal-full-right { width: 100%; border-left: none; border-top: 1px solid #E2E8F0; }
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
        .right-col { flex: 0 0 260px; width: 260px; display: flex; flex-direction: column; height: 100%; }

        @media (max-width: 1024px) {
          .left-col, .right-col { flex: 1 1 100%; width: 100%; max-width: 100%; height: auto; }
          .main-columns { overflow: auto; }
        }

        @media (max-width: 768px) {
          .view-header-title-group { flex-direction: row-reverse; justify-content: space-between; width: 100%; }
          .grid-3-cols { grid-template-columns: 1fr; gap: 16px; }
          .responsive-table thead { display: none; }
          .responsive-table tr { display: flex; flex-direction: column; border: 1px solid #e5e7eb; border-radius: 12px; margin-bottom: 16px; padding: 16px; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
          .responsive-table td { display: flex; justify-content: space-between; alignItems: center; padding: 10px 0; border-bottom: 1px solid #f1f5f9; text-align: right; white-space: normal !important; }
          .responsive-table td:last-child { border-bottom: none; padding-bottom: 0; }
          .responsive-table td::before { content: attr(data-label); font-weight: 700; color: #6b7280; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; }
          .mobile-client-cell { text-align: right; display: flex; flex-direction: column; align-items: flex-end; }
          .filters-section { flex-direction: column; align-items: stretch; }
          .property-select-container { width: 100%; }
          .property-select-container button { width: 100%; justify-content: center; }
        }
      `}</style>

      {/* DASHBOARD HEADER */}
      <header className="main-header dashboard-header-container" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px', flexShrink: 0 }}>
        <div className="view-header-title-group">
          <button className="hamburger-btn" onClick={onOpenMenu} aria-label="Open menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div>
            <h1 style={{ margin: 0, color: '#111827', fontSize: '1.8rem', fontWeight: 700 }}>Pipeline</h1>
            <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '0.95rem' }}>General operations overview</p>
          </div>
        </div>

        <div className="dashboard-actions-wrapper" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="search-box-container" style={{ display: 'flex', alignItems: 'center', backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '20px', padding: '0 16px', height: '42px', flex: 1, minWidth: '200px' }}>
            <Search size={16} color="#9ca3af" />
            <input type="text" placeholder="Search job..." style={{ backgroundColor: 'transparent', border: 'none', outline: 'none', padding: '10px', fontSize: '0.9rem', width: '100%', color: '#111827' }} />
          </div>
          
          {(isSuperAdmin || activeRole?.permissions?.find(p => p.module === 'Houses')?.canAdd) && (
            <button className="add-btn-mobile" onClick={() => handleOpenForm()} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#111827', color: 'white', border: 'none', padding: '0 20px', height: '42px', borderRadius: '20px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', flexShrink: 0 }}>
              <Plus size={16} /> New Job
            </button>
          )}
        </div>
      </header>

      {/* KPI CARDS */}
      <div className="dash-grid" style={s.dashGrid}>
        {isLoading ? (
          <div style={{ color: '#6b7280' }}>Loading metrics...</div>
        ) : (
          statuses.slice(0, 4).map((status, index) => {
            const Icon = kpiIcons[index % kpiIcons.length];
            const count = propertiesWithScope.filter(p => p.statusId === status.id || p.statusId === status.name).length;
            return (
              <div style={s.kpiCard} key={status.id}>
                <div style={s.kpiIconBox(status.color)}><Icon size={22} /></div>
                <div>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 600 }}>{status.name}</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#111827', lineHeight: '1.2' }}>{count}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="main-columns" style={s.mainColumns}>

        {/* LEFT COLUMN: DAILY JOBS */}
        <div className="left-col">
          <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', height: '100%' }}>
            
            <div style={s.tableHeader}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#111827', fontWeight: 700 }}>Daily Jobs</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#6b7280' }}>{dateCapitalized}</p>
              </div>

              {/* FILTROS DE DASHBOARD Y CASA MEJORADOS */}
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
                    <Filter size={16} /> Filters {(houseFilter !== 'All' || invoiceFilter !== 'All') && <span style={{backgroundColor: '#3b82f6', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem'}}>!</span>}
                  </button>

                  {isFilterMenuOpen && (
                    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', padding: '16px', zIndex: 100, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Property</label>
                        <select 
                          style={{...s.input, padding: '8px 12px', cursor: 'pointer'}} 
                          value={houseFilter} 
                          onChange={e => setHouseFilter(e.target.value)}
                        >
                          <option value="All">All Properties</option>
                          {uniqueHouses.map((h, idx) => (
                            <option key={idx} value={`${h.client}|${h.address}`}>{h.client} - {h.address}</option>
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

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{...s.th, width: '100px', position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1}}>Actions</th>
                    <th style={{...s.th, position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1}}>Client</th>
                    <th style={{...s.th, position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1}}>Time</th>
                    <th style={{...s.th, position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1}}>Type</th>
                    <th style={{...s.th, position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1}}>Team</th>
                    <th style={{ ...s.th, textAlign: 'right', position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={6} style={{textAlign: 'center', padding: '40px', color: '#6b7280'}}>Loading database...</td></tr>
                  ) : filteredProperties.length === 0 ? (
                    <tr><td colSpan={6} style={{textAlign: 'center', padding: '40px', color: '#6b7280', fontStyle: 'italic'}}>No jobs to display for your team.</td></tr>
                  ) : filteredProperties.map((prop) => {
                    const teamName = getRelationName(teams, prop.teamId, 'Unassigned');
                    const serviceName = getRelationName(services, prop.serviceId, 'Regular');

                    return (
                      <tr key={prop.id} onClick={() => handleOpenDetail(prop)} style={{ cursor: 'pointer', transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td data-label="Actions" style={s.td}>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {canEdit && isVisible('admin') && <button onClick={(e) => { e.stopPropagation(); handleOpenForm(prop); }} style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '6px', display: 'flex' }}><Edit2 size={16} /></button>}
                            {canDelete && isVisible('admin') && <button onClick={(e) => { e.stopPropagation(); setSelectedHouse(prop); handleDelete(); }} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '6px', display: 'flex' }}><Trash2 size={16} /></button>}
                          </div>
                        </td>
                        <td data-label="Client" style={s.td}>
                          <div className="mobile-client-cell">
                            <div style={{ fontWeight: 600, color: '#111827', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {prop.client}
                              {(prop as any).employeeFinishedBy && <span title="Finished" style={{ display: 'flex' }}><CheckCircle size={14} color="#10b981" /></span>}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> {prop.address}</div>
                          </div>
                        </td>
                        <td data-label="Time" style={{ ...s.td, color: '#6b7280' }}><Clock size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {prop.timeIn || '08:00 AM'}</td>
                        <td data-label="Type" style={{ ...s.td, fontWeight: 500 }}>{serviceName}</td>
                        <td data-label="Team" style={{ ...s.td, color: '#6b7280' }}>{teamName}</td>
                        <td data-label="Status" style={{ ...s.td, textAlign: 'right' }}>
                          <StatusPillSelector currentStatusId={prop.statusId} statuses={statuses} onChange={(newId) => handleQuickStatusChange(prop.id, newId)} disabled={isSaving || !canEdit || !isVisible('workflow')} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: ACTIVE TEAMS */}
        <div className="right-col">
          <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h3 style={{ margin: '0', padding: '20px', fontSize: '1.1rem', color: '#111827', fontWeight: 700, borderBottom: '1px solid #f1f5f9' }}>Active Teams</h3>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {isLoading ? (
                <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>Loading teams...</div>
              ) : teamsWithScope.length === 0 ? (
                <div style={{ color: '#6b7280', fontSize: '0.9rem', fontStyle: 'italic' }}>No configured teams.</div>
              ) : (
                teamsWithScope.map(team => {
                  const assignedProps = propertiesWithScope.filter(p => p.teamId === team.id || p.teamId === team.name);
                  return (
                    <div 
                      key={team.id} 
                      style={{ border: '1px solid #f1f5f9', padding: '16px', borderRadius: '8px', backgroundColor: '#f8fafc', cursor: 'pointer', transition: 'all 0.2s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = team.color; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#f1f5f9'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: `${team.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: team.color }}><Users size={18} /></div>
                          <div>
                            <div style={{ fontWeight: 600, color: '#111827', fontSize: '0.95rem' }}>{team.name}</div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{assignedProps.length > 0 ? `${assignedProps.length} jobs today` : 'Free'}</div>
                          </div>
                        </div>
                      </div>
                      <div style={{ width: '100%', height: '4px', backgroundColor: '#e2e8f0', borderRadius: '2px', marginTop: '12px' }}>
                        <div style={{ width: assignedProps.length > 0 ? '100%' : '0%', height: '100%', backgroundColor: team.color, borderRadius: '2px', transition: 'width 0.3s ease' }}></div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

      </div>

      {/* --- FORM MODAL TIPO WORK ORDER --- */}
      {isFormModalOpen && (
        <div className="modal-overlay-centered" onClick={handleCloseForm}>
          <div className="modal-full" onClick={e => e.stopPropagation()}>
            
            {/* LADO IZQUIERDO: FORMULARIO */}
            <div className="modal-full-left">
              <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                
                {/* Header Izquierdo */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', gap: '12px', flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    {formData.id ? 'Edit Property Details' : 'Register New Property'}
                  </h2>
                  {/* ⭐ Botón visible para SuperAdmin O para roles con permiso Edit en Roles & Permissions */}
                  {(isSuperAdmin || activeRole?.permissions?.find(p => p.module === 'Roles & Permissions')?.canEdit) && (
                    <button
                      type="button"
                      onClick={openFieldConfigModal}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        backgroundColor: '#eff6ff',
                        color: '#2563eb',
                        border: '1px solid #bfdbfe',
                        padding: '10px 16px',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        cursor: 'pointer'
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                    {isElementVisible('client') && (
                      <div>
                        <label style={s.label}>Client <span style={{ color: '#3b82f6' }}>*</span></label>
                        <SearchableSelect options={customersList} value={formData.client} onChange={handleCustomerSelect} placeholder="Type to search Client..." icon={User} returnKey="name" />
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
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
                      <CustomSelect 
                        options={teams} 
                        value={formData.teamId} 
                        onChange={(val: string) => {
                          const teamWorkers = employees.filter(emp => emp.teamId === val).map(emp => emp.id);
                          setFormData({ ...formData, teamId: val, assignedWorkers: teamWorkers });
                        }} 
                        placeholder="Assign Team..." 
                        icon={Users} 
                      />
                    </div>
                    )}
                  </div>

                  {/* Assigned Workers Sub-block */}
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
                          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', width: '250px', zIndex: 10, maxHeight: '200px', overflowY: 'auto' }}>
                            <div style={{ padding: '8px 12px', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>ALL EMPLOYEES</div>
                            {employees.map(emp => {
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
                              )
                            })}
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
                          <th style={{...s.th, backgroundColor: '#f8fafc', textAlign: 'right'}}>Act</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formServices.length === 0 ? (
                          <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>No services added yet.</td></tr>
                        ) : (
                          formServices.map(record => {
                            const srv = services.find(c => c.id === record.serviceId);
                            return (
                              <tr key={record.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{...s.td, padding: '12px 20px', fontWeight: 600}}>{srv ? srv.name : 'Unknown'}</td>
                                <td style={{...s.td, padding: '12px 20px', textAlign: 'center'}}>{record.quantity}</td>
                                <td style={{...s.td, padding: '12px 20px', textAlign: 'right'}}>${Number(record.price).toFixed(2)}</td>
                                <td style={{...s.td, padding: '12px 20px', textAlign: 'right', color: record.taxAmount > 0 ? '#ef4444' : '#64748b'}}>
                                  {record.taxAmount > 0 ? `+$${record.taxAmount.toFixed(2)}` : record.minusTax === 'Yes' ? `-$${Math.abs(record.taxAmount).toFixed(2)}` : '$0.00'}
                                </td>
                                <td style={{...s.td, padding: '12px 20px', textAlign: 'right', fontWeight: 700, color: '#1e293b'}}>${Number(record.total).toFixed(2)}</td>
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                    
                    {/* BEFORE PHOTOS INPUT */}
                    <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '6px' }}>
                        <span style={s.detailLabel}>BEFORE PHOTOS</span>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {photoConfig.allowUploadFromDevice && (
                            <>
                              <button type="button" onClick={() => beforeFileInputRef.current?.click()} disabled={isSaving || isCompressing} style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Upload size={12} /> Cargar
                              </button>
                              <input type="file" multiple accept="image/*" ref={beforeFileInputRef} style={{ display: 'none' }} onChange={(e) => handlePhotoUpload(e, 'before')} />
                            </>
                          )}
                          {photoConfig.allowTakePhoto && (
                            <>
                              <button type="button" onClick={() => beforeCameraInputRef.current?.click()} disabled={isSaving || isCompressing} style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Camera size={12} /> Cámara
                              </button>
                              <input type="file" accept="image/*" capture="environment" ref={beforeCameraInputRef} style={{ display: 'none' }} onChange={(e) => handlePhotoUpload(e, 'before')} />
                            </>
                          )}
                        </div>
                      </div>
                      {isCompressing && <div style={{ textAlign: 'center', color: '#3b82f6', fontSize: '0.8rem', padding: '8px 0', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><Loader2 size={14} className="spin" /> Optimizando imágenes...</div>}
                      {beforePhotoURLs.length === 0 ? <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', padding: '20px 0' }}>No photos uploaded.</div> : 
                        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
                          {beforePhotoURLs.map((url, i) => (
                            <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                              <img src={url} alt="Before" style={{ height: '80px', width: '80px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0' }} />
                              <button type="button" onClick={() => handleRemovePhoto(i, 'before')} style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '18px', height: '18px', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                            </div>
                          ))}
                        </div>
                      }
                    </div>

                    {/* AFTER PHOTOS INPUT */}
                    <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '6px' }}>
                        <span style={s.detailLabel}>AFTER PHOTOS</span>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {photoConfig.allowUploadFromDevice && (
                            <>
                              <button type="button" onClick={() => afterFileInputRef.current?.click()} disabled={isSaving || isCompressing} style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Upload size={12} /> Cargar
                              </button>
                              <input type="file" multiple accept="image/*" ref={afterFileInputRef} style={{ display: 'none' }} onChange={(e) => handlePhotoUpload(e, 'after')} />
                            </>
                          )}
                          {photoConfig.allowTakePhoto && (
                            <>
                              <button type="button" onClick={() => afterCameraInputRef.current?.click()} disabled={isSaving || isCompressing} style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Camera size={12} /> Cámara
                              </button>
                              <input type="file" accept="image/*" capture="environment" ref={afterCameraInputRef} style={{ display: 'none' }} onChange={(e) => handlePhotoUpload(e, 'after')} />
                            </>
                          )}
                        </div>
                      </div>
                      {isCompressing && <div style={{ textAlign: 'center', color: '#3b82f6', fontSize: '0.8rem', padding: '8px 0', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><Loader2 size={14} className="spin" /> Optimizando imágenes...</div>}
                      {afterPhotoURLs.length === 0 ? <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', padding: '20px 0' }}>No photos uploaded.</div> : 
                        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
                          {afterPhotoURLs.map((url, i) => (
                            <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                              <img src={url} alt="After" style={{ height: '80px', width: '80px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0' }} />
                              <button type="button" onClick={() => handleRemovePhoto(i, 'after')} style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '18px', height: '18px', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                            </div>
                          ))}
                        </div>
                      }
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
                    <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: formData.client ? '#0F172A' : '#94A3B8' }}>{formData.client || 'Not defined'}</p>
                    {formData.address && <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748B' }}>{formData.address}</p>}
                  </div>
                </div>

                <div style={{ backgroundColor: '#F8FAFC', padding: '1.2rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
                    <div style={{ padding: '0.4rem', backgroundColor: '#DCFCE7', borderRadius: '6px', color: '#059669' }}><CalendarClock size={16} /></div>
                    <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Timing & Assignment</h4>
                  </div>
                  <div style={{ paddingLeft: '2.4rem' }}>
                    <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#0F172A' }}>{formData.scheduleDate || 'No date set'}</p>
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
                <h3 style={s.title}>{selectedHouse.client}</h3>
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
                {isVisible('admin') && isElementVisible('btn_qcheck') && (
                  <button onClick={() => { setIsDetailModalOpen(false); onCheckHouse(selectedHouse as Property); }} style={{ ...s.actionBtn, backgroundColor: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe' }}>
                    <ClipboardCheck size={16} /> Q. Check
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

              {/* TABS NAVIGATION */}
              <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: '24px', gap: '24px', flexWrap: 'wrap' }}>
                <button style={s.detailTab(activeDetailTab === 'overview')} onClick={() => setActiveDetailTab('overview')}><Briefcase size={14} style={{display:'inline', marginBottom:'-2px', marginRight:'4px'}}/> Overview & Log</button>
                {isVisible('financial') && isElementVisible('btn_tabFinancials') && (
                  <button style={s.detailTab(activeDetailTab === 'financials')} onClick={() => setActiveDetailTab('financials')}><BarChart3 size={14} style={{display:'inline', marginBottom:'-2px', marginRight:'4px'}}/> Financials & Billing</button>
                )}
                {isVisible('media') && isElementVisible('btn_tabMedia') && (
                  <button style={s.detailTab(activeDetailTab === 'media')} onClick={() => setActiveDetailTab('media')}><FileImage size={14} style={{display:'inline', marginBottom:'-2px', marginRight:'4px'}}/> Notes & Photos</button>
                )}
              </div>

              {/* TAB 1: OVERVIEW & LOG */}
              {activeDetailTab === 'overview' && (
                <div className="fade-in">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                    {/* TABLE CARD 1: SCHEDULE */}
                    <div style={s.infoCard}>
                      <div style={s.infoHeader}><CalendarDays size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'6px'}}/> Schedule & Timing</div>
                      <div style={s.infoRow}>
                        <span style={s.infoLabel}>Receive Date</span>
                        <span style={s.infoValue}>{selectedHouse.receiveDate || '-'}</span>
                      </div>
                      <div style={s.infoRow}>
                        <span style={s.infoLabel}>Schedule Date</span>
                        <span style={s.infoValue}>{selectedHouse.scheduleDate || '-'}</span>
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

                    {/* TABLE CARD 2: SPECS */}
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

                    {/* TABLE CARD 3: STATUS & TEAM */}
                    <div style={s.infoCard}>
                      <div style={s.infoHeader}><Activity size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'6px'}}/> Status & Assignment</div>
                      <div style={s.infoRow}>
                        <span style={s.infoLabel}>Job Status</span>
                        <div style={{textAlign: 'right'}}><StatusPillSelector currentStatusId={selectedHouse.statusId} statuses={statuses} onChange={(newId: string) => handleQuickStatusChange(selectedHouse.id, newId)} disabled={isSaving || !canEdit || !isVisible('workflow')} /></div>
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

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                    {/* ASSIGNED WORKERS FULL WIDTH */}
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
                              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', width: '250px', zIndex: 10, maxHeight: '200px', overflowY: 'auto' }}>
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
                          <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>No specific workers assigned to this job.</span>
                        ) : (
                          selectedHouse.assignedWorkers.map(workerId => {
                            const emp = employees.find(e => e.id === workerId);
                            if (!emp) return null;
                            return (
                              <div key={workerId} style={{ backgroundColor: 'white', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <User size={12} color="#64748b" />
                                {emp.firstName} {emp.lastName}
                                {canEdit && isVisible('admin') && (
                                  <button onClick={() => toggleWorkerAssignmentDetail(workerId)} style={{ background: 'none', border: 'none', padding: 0, margin: 0, marginLeft: '4px', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center' }}><X size={14}/></button>
                                )}
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>

                    {/* WORK LOG */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={s.detailLabel}><Activity size={14} style={{display: 'inline', verticalAlign: 'middle', marginRight: '4px'}}/> Work Log (Entry / Exit)</span>
                      </div>
                      <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th style={{...s.th, backgroundColor: '#f8fafc', padding: '10px 16px'}}>Event</th>
                              <th style={{...s.th, backgroundColor: '#f8fafc', padding: '10px 16px'}}>Employee</th>
                              <th style={{...s.th, backgroundColor: '#f8fafc', padding: '10px 16px', textAlign: 'right'}}>Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(!(selectedHouse as any).employeeStartedBy && !(selectedHouse as any).employeeFinishedBy) && (
                              <tr><td colSpan={3} style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>No activity logged yet.</td></tr>
                            )}
                            {(selectedHouse as any).employeeStartedBy && (
                              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{...s.td, padding: '12px 16px', fontWeight: 600, color: '#3b82f6'}}>Job Started</td>
                                <td style={{...s.td, padding: '12px 16px'}}>{(selectedHouse as any).employeeStartedBy.split(' ')[0]}</td>
                                <td style={{...s.td, padding: '12px 16px', color: '#64748b', fontSize: '0.8rem', textAlign: 'right'}}>{formatDateTime((selectedHouse as any).employeeStartedAt)}</td>
                              </tr>
                            )}
                            {(selectedHouse as any).employeeFinishedBy && (
                              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{...s.td, padding: '12px 16px', fontWeight: 600, color: '#10b981'}}>Job Finished</td>
                                <td style={{...s.td, padding: '12px 16px'}}>{(selectedHouse as any).employeeFinishedBy.split(' ')[0]}</td>
                                <td style={{...s.td, padding: '12px 16px', color: '#64748b', fontSize: '0.8rem', textAlign: 'right'}}>{formatDateTime((selectedHouse as any).employeeFinishedAt)}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: FINANCIALS & BILLING */}
              {activeDetailTab === 'financials' && isVisible('financial') && (
                <div className="fade-in">
                  
                  {/* FINANCIAL OVERVIEW (PROFIT) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ backgroundColor: '#eff6ff', padding: '16px', borderRadius: '8px', border: '1px solid #bfdbfe', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: '#1e40af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Revenue (Billed)</div>
                      <div style={{ fontSize: '1.5rem', color: '#1e3a8a', fontWeight: 800, marginTop: '4px' }}>${totalBilled.toFixed(2)}</div>
                    </div>
                    <div style={{ backgroundColor: '#fef2f2', padding: '16px', borderRadius: '8px', border: '1px solid #fecaca', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: '#991b1b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Payroll Cost</div>
                      <div style={{ fontSize: '1.5rem', color: '#7f1d1d', fontWeight: 800, marginTop: '4px' }}>${totalPayroll.toFixed(2)}</div>
                    </div>
                    <div style={{ backgroundColor: netProfit >= 0 ? '#ecfdf5' : '#fef2f2', padding: '16px', borderRadius: '8px', border: `1px solid ${netProfit >= 0 ? '#a7f3d0' : '#fecaca'}`, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: netProfit >= 0 ? '#065f46' : '#991b1b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Profit</div>
                      <div style={{ fontSize: '1.5rem', color: netProfit >= 0 ? '#047857' : '#7f1d1d', fontWeight: 800, marginTop: '4px' }}>${netProfit.toFixed(2)}</div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
                    {/* TABLA DE SERVICIOS FACTURADOS */}
                    {canEdit && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <h4 style={{ fontSize: '0.9rem', color: '#334155', fontWeight: 700, margin: 0, textTransform: 'uppercase' }}>Billed Services</h4>
                          <button onClick={() => handleOpenServiceForm()} style={{ background: '#e0f2fe', color: '#2563eb', border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Plus size={12} /> Add Service
                          </button>
                        </div>

                        <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '400px' }}>
                            <thead>
                              <tr>
                                <th style={{...s.th, backgroundColor: '#f8fafc'}}>Service</th>
                                <th style={{...s.th, backgroundColor: '#f8fafc', textAlign: 'center'}}>Qty</th>
                                <th style={{...s.th, backgroundColor: '#f8fafc', textAlign: 'right'}}>Total</th>
                                <th style={{...s.th, backgroundColor: '#f8fafc', textAlign: 'right'}}>Act</th>
                              </tr>
                            </thead>
                            <tbody>
                              {houseServices.length === 0 ? (
                                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>No services added yet.</td></tr>
                              ) : (
                                houseServices.map(record => {
                                  const srv = services.find(c => c.id === record.serviceId);
                                  return (
                                    <tr key={record.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                      <td style={{...s.td, padding: '12px 20px', fontWeight: 600}}>
                                        {srv ? srv.name : 'Unknown'}
                                        <div style={{fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px', fontWeight: 400}}>Price: ${Number(record.price).toFixed(2)} | Tax: {record.taxAmount > 0 ? `+$${record.taxAmount.toFixed(2)}` : record.minusTax === 'Yes' ? `-$${Math.abs(record.taxAmount).toFixed(2)}` : '$0.00'}</div>
                                      </td>
                                      <td style={{...s.td, padding: '12px 20px', textAlign: 'center'}}>{record.quantity}</td>
                                      <td style={{...s.td, padding: '12px 20px', textAlign: 'right', fontWeight: 700, color: '#1e293b'}}>${Number(record.total).toFixed(2)}</td>
                                      <td style={{...s.td, padding: '12px 20px', textAlign: 'right'}}>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                          <button onClick={() => handleOpenServiceForm(record)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '2px' }}><Edit2 size={14} /></button>
                                          <button onClick={() => handleDeleteService(record.id as string)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}><Trash2 size={14} /></button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                            {houseServices.length > 0 && (
                              <tfoot>
                                <tr>
                                  <td colSpan={2} style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 700, color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase' }}>House Total:</td>
                                  <td colSpan={2} style={{ padding: '12px 20px', textAlign: 'left', fontWeight: 800, color: '#047857', fontSize: '1.1rem', backgroundColor: '#ecfdf5' }}>
                                    ${totalBilled.toFixed(2)}
                                  </td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      </div>
                    )}

                    {/* PAYMENTS */}
                    {canEdit && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <h4 style={{ fontSize: '0.9rem', color: '#334155', fontWeight: 700, margin: 0, textTransform: 'uppercase' }}>Registered Payments</h4>
                          <button onClick={() => handleOpenPayrollForm(selectedHouse.id)} style={{ background: '#ecfdf5', color: '#10b981', border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Plus size={12} /> Add Payment
                          </button>
                        </div>
                        {housePayrollRecords.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {housePayrollRecords.map(record => {
                              const emp = employees.find(e => e.id === record.employeeId);
                              return (
                                <div key={record.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                  <div>
                                    <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.95rem' }}>{emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown'}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Date: {record.date}</div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ textAlign: 'right' }}>
                                      <div style={{ fontWeight: 700, color: '#10b981', fontSize: '1.1rem' }}>${record.totalAmount.toFixed(2)}</div>
                                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: record.status === 'Paid' ? '#10b981' : '#f59e0b' }}>
                                        {record.status || 'Pending'}
                                      </div>
                                    </div>
                                    <button onClick={() => handleDeletePayroll(record.id as string)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}>
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#94a3b8', fontSize: '0.85rem' }}>No payments registered.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: NOTES & PHOTOS */}
              {activeDetailTab === 'media' && isVisible('media') && (
                <div className="fade-in">
                  {/* NOTES - Lado a lado para mejor uso del espacio */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                    <div style={s.noteBoxGray}>
                      <span style={s.detailLabel}><StickyNote size={14} /> GENERAL NOTE</span>
                      <span style={{ ...s.detailValue, fontSize: '0.95rem' }}>{selectedHouse.note || 'No notes provided.'}</span>
                    </div>
                    <div style={s.noteBoxOrange}>
                      <span style={{ ...s.detailLabel, color: '#c2410c' }}><PenTool size={14} /> EMPLOYEE'S NOTE</span>
                      <span style={{ ...s.detailValue, fontSize: '0.95rem', color: '#7c2d12' }}>{selectedHouse.employeeNote || 'No employee notes provided.'}</span>
                    </div>
                  </div>

                  {/* PHOTOS GRID - Cada sección ocupa toda la fila para que las fotos se vean grandes */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
                    <div style={{ backgroundColor: '#f8fafc', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#dbeafe', color: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ImageIcon size={18} />
                          </div>
                          <div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>Before Photos</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{beforePhotoURLs.length} {beforePhotoURLs.length === 1 ? 'photo' : 'photos'}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button onClick={() => generatePDF('before')} disabled={isSaving || beforePhotoURLs.length === 0} style={{ background: 'white', color: '#475569', border: '1px solid #cbd5e1', padding: '8px 14px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: (isSaving || beforePhotoURLs.length === 0) ? 'not-allowed' : 'pointer', opacity: beforePhotoURLs.length === 0 ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Printer size={14} /> Exportar PDF
                          </button>
                          {canEdit && photoConfig.allowUploadFromDevice && (
                            <>
                              <button onClick={() => beforeFileInputRef.current?.click()} disabled={isSaving || isCompressing} style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '8px 14px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Upload size={14} /> Cargar</button>
                              <input type="file" multiple accept="image/*" ref={beforeFileInputRef} style={{ display: 'none' }} onChange={(e) => handlePhotoUpload(e, 'before')} />
                            </>
                          )}
                          {canEdit && photoConfig.allowTakePhoto && (
                            <>
                              <button onClick={() => beforeCameraInputRef.current?.click()} disabled={isSaving || isCompressing} style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '8px 14px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Camera size={14} /> Cámara</button>
                              <input type="file" accept="image/*" capture="environment" ref={beforeCameraInputRef} style={{ display: 'none' }} onChange={(e) => handlePhotoUpload(e, 'before')} />
                            </>
                          )}
                        </div>
                      </div>
                      {isCompressing && <div style={{ textAlign: 'center', color: '#3b82f6', fontSize: '0.85rem', padding: '12px 0', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Loader2 size={16} className="spin" /> Optimizando imágenes...</div>}
                      {beforePhotoURLs.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem', padding: '40px 0', backgroundColor: 'white', borderRadius: '8px', border: '2px dashed #cbd5e1' }}>
                          <ImageIcon size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                          <div>No photos uploaded yet.</div>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px' }}>
                          {beforePhotoURLs.map((url, i) => (
                            <div key={i} style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', backgroundColor: 'white' }}>
                              <img src={url} alt={`Before ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              {canEdit && (
                                <button onClick={() => handleRemovePhoto(i, 'before')} style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(239, 68, 68, 0.95)', color: 'white', border: 'none', borderRadius: '50%', width: '26px', height: '26px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                                  <X size={14} />
                                </button>
                              )}
                              <div style={{ position: 'absolute', bottom: '6px', left: '6px', backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600 }}>
                                {String(i + 1).padStart(2, '0')}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ backgroundColor: '#f8fafc', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#d1fae5', color: '#047857', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ImageIcon size={18} />
                          </div>
                          <div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>After Photos</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{afterPhotoURLs.length} {afterPhotoURLs.length === 1 ? 'photo' : 'photos'}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button onClick={() => generatePDF('after')} disabled={isSaving || afterPhotoURLs.length === 0} style={{ background: 'white', color: '#475569', border: '1px solid #cbd5e1', padding: '8px 14px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: (isSaving || afterPhotoURLs.length === 0) ? 'not-allowed' : 'pointer', opacity: afterPhotoURLs.length === 0 ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Printer size={14} /> Exportar PDF
                          </button>
                          {canEdit && photoConfig.allowUploadFromDevice && (
                            <>
                              <button onClick={() => afterFileInputRef.current?.click()} disabled={isSaving || isCompressing} style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '8px 14px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Upload size={14} /> Cargar</button>
                              <input type="file" multiple accept="image/*" ref={afterFileInputRef} style={{ display: 'none' }} onChange={(e) => handlePhotoUpload(e, 'after')} />
                            </>
                          )}
                          {canEdit && photoConfig.allowTakePhoto && (
                            <>
                              <button onClick={() => afterCameraInputRef.current?.click()} disabled={isSaving || isCompressing} style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '8px 14px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Camera size={14} /> Cámara</button>
                              <input type="file" accept="image/*" capture="environment" ref={afterCameraInputRef} style={{ display: 'none' }} onChange={(e) => handlePhotoUpload(e, 'after')} />
                            </>
                          )}
                        </div>
                      </div>
                      {isCompressing && <div style={{ textAlign: 'center', color: '#3b82f6', fontSize: '0.85rem', padding: '12px 0', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Loader2 size={16} className="spin" /> Optimizando imágenes...</div>}
                      {afterPhotoURLs.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem', padding: '40px 0', backgroundColor: 'white', borderRadius: '8px', border: '2px dashed #cbd5e1' }}>
                          <ImageIcon size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                          <div>No photos uploaded yet.</div>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px' }}>
                          {afterPhotoURLs.map((url, i) => (
                            <div key={i} style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', backgroundColor: 'white' }}>
                              <img src={url} alt={`After ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              {canEdit && (
                                <button onClick={() => handleRemovePhoto(i, 'after')} style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(239, 68, 68, 0.95)', color: 'white', border: 'none', borderRadius: '50%', width: '26px', height: '26px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                                  <X size={14} />
                                </button>
                              )}
                              <div style={{ position: 'absolute', bottom: '6px', left: '6px', backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600 }}>
                                {String(i + 1).padStart(2, '0')}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {canEdit && (beforeFiles.length > 0 || afterFiles.length > 0) && (
                    <div style={{ marginTop: '12px', textAlign: 'right' }}>
                       <button onClick={handleSavePhotosFromDetail} disabled={isSaving} style={{...s.btnPrimary, display: 'inline-flex'}}>{isSaving ? 'Uploading...' : 'Save Photos'}</button>
                    </div>
                  )}
                </div>
              )}

            </div>

            <footer style={s.footerBetween}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {canDelete && isVisible('admin') && isElementVisible('btn_deleteProperty') && <button style={s.btnDangerLight} onClick={handleDelete} disabled={isSaving}><Trash2 size={16} style={{ marginRight: '6px' }} /> Delete Property</button>}
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button style={{...s.actionBtn, ...s.btnOutline}} onClick={() => setIsDetailModalOpen(false)}>Close</button>
                {canEdit && isVisible('admin') && isElementVisible('btn_editDetails') && <button style={{...s.actionBtn, ...s.btnPrimary}} onClick={() => handleOpenForm(selectedHouse as Property)}><Edit2 size={16} /> Edit Details</button>}
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* --- MODAL ADD / EDIT SERVICE --- */}
      {isServiceModalOpen && (
        <div className="modal-overlay-centered" onClick={() => setIsServiceModalOpen(false)} style={{ zIndex: 10001 }}>
          <div className="modal-70" style={{ maxWidth: '650px' }} onClick={e => e.stopPropagation()}>
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calculator size={20} color="#3b82f6" /> {serviceForm.id ? 'Edit Service Record' : 'Add Service Record'}
              </h3>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => setIsServiceModalOpen(false)}><X size={24} /></button>
            </header>

            <div style={{ padding: '30px', overflowY: 'auto', backgroundColor: '#f8fafc' }}>
              
              {/* BLOCK 1: DETAILS */}
              <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>1. Item Details</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                  <div>
                    <label style={s.label}>Product / Service <span style={{ color: '#3b82f6' }}>*</span></label>
                    <CustomSelect 
                      options={services} 
                      value={serviceForm.serviceId} 
                      onChange={(val: string) => setServiceForm({ ...serviceForm, serviceId: val })} 
                      placeholder="Select from catalog..." 
                      icon={Wrench} 
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={s.label}>Quantity <span style={{ color: '#3b82f6' }}>*</span></label>
                      <div style={{ position: 'relative' }}>
                        <Hash size={16} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                        <input type="number" min="1" step="1" style={{...s.input, paddingLeft: '36px'}} value={serviceForm.quantity} onChange={(e) => setServiceForm({ ...serviceForm, quantity: Number(e.target.value) })} />
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={s.label}>Unit Price ($) <span style={{ color: '#3b82f6' }}>*</span></label>
                      <div style={{ position: 'relative' }}>
                        <DollarSign size={16} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                        <input type="number" step="0.01" style={{...s.input, paddingLeft: '36px'}} value={serviceForm.price || ''} onChange={(e) => setServiceForm({ ...serviceForm, price: Number(e.target.value) })} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label style={s.label}>Notes</label>
                    <div style={{ position: 'relative' }}>
                      <StickyNote size={16} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                      <textarea style={{...s.input, paddingLeft: '36px', minHeight: '60px', resize: 'vertical'}} placeholder="Add descriptions..." value={serviceForm.notes} onChange={e => setServiceForm({ ...serviceForm, notes: e.target.value })}></textarea>
                    </div>
                  </div>
                </div>
              </div>

              {/* BLOCK 2: TAX SETTINGS */}
              <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>2. Tax Settings</h4>
                
                <div style={{ marginBottom: '16px' }}>
                  <label style={s.label}>Apply Tax?</label>
                  <div style={s.segmentContainer}>
                    <button type="button" onClick={() => setServiceForm({...serviceForm, applyTax: 'Yes'})} style={s.segmentBtn(serviceForm.applyTax === 'Yes', 'yes')}>Yes, Add Tax</button>
                    <button type="button" onClick={() => setServiceForm({...serviceForm, applyTax: 'No'})} style={s.segmentBtn(serviceForm.applyTax === 'No', 'no')}>No</button>
                  </div>
                </div>

                {serviceForm.applyTax === 'Yes' && (
                  <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                    <label style={s.label}>Tax Percentage (%)</label>
                    <div style={{ position: 'relative', width: '50%' }}>
                      <Percent size={16} color="#3b82f6" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                      <input type="number" step="0.1" style={{...s.input, paddingLeft: '36px'}} value={serviceForm.taxPercentage} onChange={(e) => setServiceForm({ ...serviceForm, taxPercentage: Number(e.target.value) })} />
                    </div>
                  </div>
                )}

                {serviceForm.applyTax === 'No' && (
                  <div style={{ backgroundColor: '#fff1f2', padding: '16px', borderRadius: '8px', border: '1px dashed #fecaca' }}>
                    <label style={{...s.label, color: '#991b1b'}}>Minus Tax? (Deduct from subtotal)</label>
                    <div style={{...s.segmentContainer, backgroundColor: '#fef2f2', marginBottom: serviceForm.minusTax === 'Yes' ? '16px' : '0' }}>
                      <button type="button" onClick={() => setServiceForm({...serviceForm, minusTax: 'Yes'})} style={s.segmentBtn(serviceForm.minusTax === 'Yes', 'no')}>Yes, Deduct</button>
                      <button type="button" onClick={() => setServiceForm({...serviceForm, minusTax: 'No'})} style={{...s.segmentBtn(serviceForm.minusTax === 'No', 'no'), color: serviceForm.minusTax === 'No' ? '#64748b' : '#94a3b8'}}>No, Keep Subtotal</button>
                    </div>

                    {serviceForm.minusTax === 'Yes' && (
                      <>
                        <label style={{...s.label, color: '#991b1b'}}>Tax Percentage to Deduct (%)</label>
                        <div style={{ position: 'relative', width: '50%' }}>
                          <Percent size={16} color="#ef4444" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                          <input type="number" step="0.1" style={{...s.input, paddingLeft: '36px', borderColor: '#fca5a5'}} value={serviceForm.taxPercentage} onChange={(e) => setServiceForm({ ...serviceForm, taxPercentage: Number(e.target.value) })} />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* BLOCK 3: SUMMARY */}
              <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>3. Summary</h4>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#64748b', fontSize: '0.95rem' }}>
                  <span>Subtotal</span>
                  <span style={{ fontWeight: 600, color: '#1e293b' }}>${serviceForm.subtotal.toFixed(2)}</span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', color: '#64748b', fontSize: '0.95rem' }}>
                  <span>Tax Amount</span>
                  <span style={{ fontWeight: 600, color: serviceForm.taxAmount > 0 ? '#ef4444' : '#1e293b' }}>
                    {serviceForm.taxAmount > 0 ? '+' : (serviceForm.minusTax === 'Yes' && serviceForm.applyTax === 'No') ? '-' : ''}${Math.abs(serviceForm.taxAmount).toFixed(2)}
                  </span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '16px', borderTop: '2px dashed #cbd5e1', fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                  <span>Total</span>
                  <span style={{ color: '#047857' }}>${serviceForm.total.toFixed(2)}</span>
                </div>
              </div>

            </div>

            <footer style={{ padding: '16px 24px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', borderRadius: '0 0 12px 12px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button style={{...s.actionBtn, ...s.btnOutline}} onClick={() => setIsServiceModalOpen(false)} disabled={isSaving}>Cancel</button>
              <button style={{...s.actionBtn, ...s.btnPrimary}} onClick={handleSaveService} disabled={isSaving}>
                {isSaving ? 'Processing...' : 'Save Record'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* --- MODAL DE PAYROLL --- */}
      {isPayrollModalOpen && selectedHouse && (
        <div className="modal-overlay-centered" onClick={() => setIsPayrollModalOpen(false)} style={{ zIndex: 10000 }}>
          <div className="modal-70" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <header style={s.header}>
              <h3 style={s.title}>Register Payment</h3>
              <button style={s.closeBtn} onClick={() => setIsPayrollModalOpen(false)}><X size={20} /></button>
            </header>
            
            <div style={s.body}>
              
              <div style={{ padding: '12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '16px' }}>
                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>PROPERTY</div>
                <div style={{ fontSize: '1rem', color: '#1e293b', fontWeight: 700 }}>{selectedHouse.client} - {selectedHouse.address}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                
                <div>
                  <label style={s.label}>Employee <span style={{ color: '#3b82f6' }}>*</span></label>
                  <select 
                    style={{ ...s.input, cursor: 'pointer' }}
                    value={payrollForm.employeeId}
                    onChange={(e) => setPayrollForm({ ...payrollForm, employeeId: e.target.value })}
                  >
                    <option value="">Select an employee...</option>
                    {employees.filter(emp => (selectedHouse?.assignedWorkers || []).includes(emp.id)).map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                    ))}
                  </select>
                  {(!selectedHouse?.assignedWorkers || selectedHouse.assignedWorkers.length === 0) && (
                    <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px' }}>Please assign workers to this property first.</p>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={s.label}>Date <span style={{ color: '#3b82f6' }}>*</span></label>
                    <input type="date" style={s.input} value={payrollForm.date} onChange={(e) => setPayrollForm({ ...payrollForm, date: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={s.label}>Base Amount ($) <span style={{ color: '#3b82f6' }}>*</span></label>
                    <input type="number" step="0.01" style={s.input} placeholder="0.00" value={payrollForm.baseAmount || ''} onChange={(e) => setPayrollForm({ ...payrollForm, baseAmount: Number(e.target.value) })} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={s.label}>Extra ($)</label>
                    <input type="number" step="0.01" style={s.input} placeholder="0.00" value={payrollForm.extraAmount || ''} onChange={(e) => setPayrollForm({ ...payrollForm, extraAmount: Number(e.target.value) })} />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={s.label}>Extra Note</label>
                    <input type="text" style={s.input} placeholder="Reason for extra..." value={payrollForm.extraNote} onChange={(e) => setPayrollForm({ ...payrollForm, extraNote: e.target.value })} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={s.label}>Discount ($)</label>
                    <input type="number" step="0.01" style={s.input} placeholder="0.00" value={payrollForm.discountAmount || ''} onChange={(e) => setPayrollForm({ ...payrollForm, discountAmount: Number(e.target.value) })} />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={s.label}>Discount Note</label>
                    <input type="text" style={s.input} placeholder="Reason for discount..." value={payrollForm.discountNote} onChange={(e) => setPayrollForm({ ...payrollForm, discountNote: e.target.value })} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: '#ecfdf5', border: '1px solid #10b981', borderRadius: '8px', marginTop: '8px' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#047857' }}>TOTAL TO PAY:</span>
                  <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#047857' }}>${payrollForm.totalAmount.toFixed(2)}</span>
                </div>

                <div style={{ textAlign: 'right', marginTop: '8px' }}>
                  <button style={{ ...s.btnPrimary, backgroundColor: '#10b981', display: 'inline-flex' }} onClick={handleSavePayroll} disabled={isSaving}>
                    {isSaving ? 'Processing...' : 'Save Payment'}
                  </button>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* ⭐ --- FIELD CONFIGURATION MODAL --- */}
      {isFieldConfigOpen && (
        <div className="modal-overlay-centered" onClick={() => setIsFieldConfigOpen(false)} style={{ zIndex: 10000 }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: 'white', width: '95%', maxWidth: '1100px', maxHeight: '90vh', borderRadius: '16px', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            <header style={{ padding: '20px 28px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#dbeafe', color: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Settings size={20} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>Form Field Configuration</h2>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Configure which fields and buttons each role can see</p>
                </div>
              </div>
              <button onClick={() => setIsFieldConfigOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={24} /></button>
            </header>

            <div className="modal-body-scroll" style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
              {rolesList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  No roles configured. Create some roles first in <strong>Roles & Permissions</strong>.
                </div>
              ) : (
                <>
                  <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <AlertTriangle size={18} color="#1e40af" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '0.85rem', color: '#1e3a8a', lineHeight: 1.5 }}>
                      For each element below, <strong>check the roles that should NOT see it</strong>. Unchecked roles will see the element normally.
                      SuperAdmin always sees everything regardless of this configuration.
                    </div>
                  </div>

                  {/* SECCIÓN: CAMPOS DEL FORM */}
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={18} color="#3b82f6" /> Form Fields
                  </h3>

                  {Array.from(new Set(CONFIGURABLE_FIELDS.map(f => f.section))).map(sectionName => (
                    <div key={sectionName} style={{ marginBottom: '20px' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', paddingLeft: '4px' }}>
                        {sectionName}
                      </div>
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                        {CONFIGURABLE_FIELDS.filter(f => f.section === sectionName).map((field, idx) => {
                          const hiddenForRoles = fieldConfigDraft.visibility?.[field.id] || [];
                          return (
                            <div key={field.id} style={{ padding: '14px 16px', borderBottom: idx < CONFIGURABLE_FIELDS.filter(f => f.section === sectionName).length - 1 ? '1px solid #f1f5f9' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                              <div style={{ flex: '1 1 200px' }}>
                                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>{field.label}</div>
                                {hiddenForRoles.length > 0 && (
                                  <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '2px' }}>
                                    Hidden for {hiddenForRoles.length} {hiddenForRoles.length === 1 ? 'role' : 'roles'}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                {rolesList.map(role => {
                                  const isHidden = hiddenForRoles.includes(role.id);
                                  return (
                                    <label
                                      key={role.id}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '6px 10px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        backgroundColor: isHidden ? '#fef2f2' : '#f8fafc',
                                        border: isHidden ? '1px solid #fecaca' : '1px solid #e2e8f0',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        color: isHidden ? '#991b1b' : '#475569',
                                        transition: 'all 0.15s'
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isHidden}
                                        onChange={() => toggleElementVisibilityForRole(field.id, role.id)}
                                        style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#dc2626' }}
                                      />
                                      Hide for {role.name}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* SECCIÓN: BOTONES */}
                  <h3 style={{ margin: '24px 0 16px 0', fontSize: '1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckSquare size={18} color="#3b82f6" /> Action Buttons
                  </h3>

                  {Array.from(new Set(CONFIGURABLE_BUTTONS.map(b => b.section))).map(sectionName => (
                    <div key={sectionName} style={{ marginBottom: '20px' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', paddingLeft: '4px' }}>
                        {sectionName}
                      </div>
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                        {CONFIGURABLE_BUTTONS.filter(b => b.section === sectionName).map((btn, idx) => {
                          const hiddenForRoles = fieldConfigDraft.visibility?.[btn.id] || [];
                          return (
                            <div key={btn.id} style={{ padding: '14px 16px', borderBottom: idx < CONFIGURABLE_BUTTONS.filter(b => b.section === sectionName).length - 1 ? '1px solid #f1f5f9' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                              <div style={{ flex: '1 1 200px' }}>
                                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>{btn.label}</div>
                                {hiddenForRoles.length > 0 && (
                                  <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '2px' }}>
                                    Hidden for {hiddenForRoles.length} {hiddenForRoles.length === 1 ? 'role' : 'roles'}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                {rolesList.map(role => {
                                  const isHidden = hiddenForRoles.includes(role.id);
                                  return (
                                    <label
                                      key={role.id}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '6px 10px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        backgroundColor: isHidden ? '#fef2f2' : '#f8fafc',
                                        border: isHidden ? '1px solid #fecaca' : '1px solid #e2e8f0',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        color: isHidden ? '#991b1b' : '#475569',
                                        transition: 'all 0.15s'
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isHidden}
                                        onChange={() => toggleElementVisibilityForRole(btn.id, role.id)}
                                        style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#dc2626' }}
                                      />
                                      Hide for {role.name}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            <footer style={{ padding: '16px 28px', borderTop: '1px solid #e5e7eb', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderRadius: '0 0 16px 16px' }}>
              <button onClick={() => setIsFieldConfigOpen(false)} style={{ backgroundColor: 'white', border: '1px solid #cbd5e1', color: '#475569', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveFieldConfig} disabled={isSavingFieldConfig} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, cursor: isSavingFieldConfig ? 'wait' : 'pointer', opacity: isSavingFieldConfig ? 0.7 : 1 }}>
                <Save size={16} /> {isSavingFieldConfig ? 'Saving...' : 'Save Configuration'}
              </button>
            </footer>
          </div>
        </div>
      )}

    </div>
  );
}