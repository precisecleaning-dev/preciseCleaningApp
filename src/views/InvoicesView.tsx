import { useState, useEffect, useMemo, Fragment } from 'react';
import { formatDate } from '../utils/dateFormat';
import type { CSSProperties } from 'react';
import {
  Search, MapPin, CalendarDays, ChevronDown, ChevronRight, Users, Edit2, Trash2,
  X, StickyNote, Menu, FileImage
} from 'lucide-react';
import DateGroupBar from '../components/DateGroupBar';
import { groupByDate, weekNumberOf } from '../utils/dateGrouping';
import { useDateGroups } from '../utils/useDateGroups';
import StatusChangeModal, { type StatusModalConfig } from '../components/StatusChangeModal';

import type { Property, Team, SystemUser, Role, Status, Customer, PayrollRecord } from '../types/index';
import { propertiesService } from '../services/propertiesService';
import { db } from '../config/firebase';
// ⭐ Mapeo correcto de clientes (el id legacy NO pisa al id real)
import { mapCustomerDoc } from '../utils/customerDocs';
import { collection, onSnapshot } from 'firebase/firestore';
import { getRelationName, getRelationColor } from '../utils/relations';
import { stampInvoiceEntry, invoiceEntryMs } from '../utils/invoiceEntry';
import HousesView from './HousesView';
import './InvoicesView.css';

const INVOICE_STATUSES = [
  { id: 'Pre-Paid', name: 'Pre-Paid', color: '#8b5cf6' },
  { id: 'Needs Invoice', name: 'Needs Invoice', color: '#f59e0b' },
  { id: 'Pending', name: 'Pending', color: '#ef4444' },
  { id: 'Paid', name: 'Paid', color: '#10b981' }
];

// ⭐ Nota general de la casa — misma fuente que las tarjetas de Pipeline/QC:
//    `note` de la app o `generalNotes` importado de AppSheet. Tipo extendido local
//    porque `generalNotes` aún no está declarado en Property.
type PropertyNotes = Property & { note?: string | null; generalNotes?: string | null };
const houseNote = (h: Property): string => {
  const g = h as PropertyNotes;
  return String(g.note || g.generalNotes || '').trim();
};

// ⭐ Impuesto de venta de Texas. Es el que usa la hoja "Operations":
//    $200 → $16.50 · $425 → $35.06. Final Cost = Service Price − Taxes.
const TAX_RATE = 0.0825;
const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(2)}%`);

interface JobFinancials {
  servicePrice: number;
  taxes: number;
  finalCost: number;
  payroll: number;
  profit: number;
  /** Profit / Final Cost en %, igual que la hoja. null si Final Cost = 0. */
  margin: number | null;
}

const marginOf = (profit: number, finalCost: number): number | null =>
  finalCost > 0 ? (profit / finalCost) * 100 : null;

// ⭐ Campos de texto editables desde las columnas Note / Notes / Issues.
//    Note = nota general de la casa · Notes = nota de OFICINA (seguimiento:
//    "After Photos Sent", "NO VA A PAGAR"…) · Issues = problemas del trabajo.
type TextField = 'note' | 'officeNote' | 'issues';
const TEXT_FIELD_LABEL: Record<TextField, string> = {
  note: 'Note',
  officeNote: 'Notes (oficina)',
  issues: 'Issues',
};
const fieldText = (h: Property, field: TextField): string =>
  field === 'note' ? houseNote(h) : String(h[field] || '').trim();

// billing_services no tiene un tipo compartido en types/index.ts todavía.
interface BilledServiceRecord {
  id: string;
  propertyId: string;
  total: number;
}

// ⭐ FIX (payroll): los documentos de `payroll` NO guardan `totalAmount`, solo
//    baseAmount / extraAmount / discountAmount. Calculamos el total al vuelo.
//    Si existiera totalAmount guardado y distinto de 0, se respeta.
const getPayrollTotal = (pay: PayrollRecord): number => {
  if (!pay) return 0;
  if (pay.totalAmount != null && Number(pay.totalAmount) !== 0) return Number(pay.totalAmount);
  return Number(pay.baseAmount || 0) + Number(pay.extraAmount || 0) - Number(pay.discountAmount || 0);
};

// Parser de fecha robusto: acepta "YYYY-MM-DD" y "DD/MM/YYYY"; vacíos al final
const parseDateForSort = (dateStr?: string | null): number => {
  if (!dateStr) return Number.MAX_SAFE_INTEGER;
  const str = String(dateStr).trim();
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]).getTime();
  // ⭐ MISMA regla que PayrollView (antes cada vista leía distinto y la misma casa
  //    mostraba dos fechas diferentes):
  //    · Primer número > 12 y segundo <= 12  →  única lectura posible: DD/MM.
  //    · Cualquier otro caso                 →  se lee MM/DD (regla del negocio).
  //    Si AMBOS son <= 12 la fecha es AMBIGUA: se lee MM/DD y aparece en la
  //    herramienta "Revisar fechas" de Payroll para corregirla y guardarla en ISO.
  const slash = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (slash) {
    const a = +slash[1], b = +slash[2], y = +slash[3];
    const mon = a > 12 && b <= 12 ? b : a;
    const day = a > 12 && b <= 12 ? a : b;
    // Guarda contra fechas imposibles (p. ej. "27/27/2026"): sin esto, el
    // constructor Date desborda el mes y devuelve una fecha equivocada.
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return Number.MAX_SAFE_INTEGER;
    return new Date(y, mon - 1, day).getTime();
  }
  const t = new Date(str).getTime();
  return isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
};

// ───────────────────────────────────────────────────────────────
// Invoice Status Pill (inline editable en cada fila)
// ───────────────────────────────────────────────────────────────
const InvoiceStatusPill = ({ currentStatus, onChange, disabled, fullWidth = false }: { currentStatus: string, onChange: (s: string) => void, disabled: boolean, fullWidth?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const statusObj = INVOICE_STATUSES.find(s => s.id === currentStatus || s.name === currentStatus)
    || { id: currentStatus, name: currentStatus || 'Pending', color: '#64748b' };

  return (
    <div tabIndex={0} onBlur={() => setTimeout(() => setIsOpen(false), 200)} className={`inv-pill-wrap${fullWidth ? ' full' : ''}`}>
      <div
        onClick={(e) => { e.stopPropagation(); if(!disabled) setIsOpen(!isOpen); }}
        className={`inv-status-pill dynamic${fullWidth ? ' full' : ''}${disabled ? ' disabled' : ''}`}
        style={{
          '--pill-border': `${statusObj.color}40`,
          '--pill-bg': `${statusObj.color}10`,
          '--pill-bg-hover': `${statusObj.color}20`,
          '--dot-color': statusObj.color,
        } as CSSProperties}
      >
        <span className="inv-pill-label-wrap">
          <span className="inv-pill-dot"></span>
          <span className="inv-pill-text colored">{statusObj.name}</span>
        </span>
        <ChevronDown size={14} color={statusObj.color} className={`inv-pill-chevron${isOpen ? ' open' : ''}`} />
      </div>

      {isOpen && (
        <div className={`inv-pill-dropdown${fullWidth ? ' full' : ''}`}>
          {INVOICE_STATUSES.map((s) => (
            <div
              key={s.id}
              onClick={(e) => {
                e.preventDefault(); e.stopPropagation();
                if(s.id !== currentStatus) onChange(s.id);
                setIsOpen(false);
              }}
              className={`inv-pill-option${currentStatus === s.id ? ' current' : ''}`}
            >
              <span className="inv-pill-dot" style={{ '--dot-color': s.color } as CSSProperties}></span>
              {s.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ───────────────────────────────────────────────────────────────
// ⭐ Job Status Pill — cambia el status de la CASA (no el del invoice)
// ───────────────────────────────────────────────────────────────
const JobStatusPill = ({ currentStatusId, statuses, onRequestOpen, disabled, fullWidth = false, modalTitle, modalSubtitle, onChange }: { currentStatusId: string, statuses: Status[], onRequestOpen: (cfg: StatusModalConfig) => void, disabled: boolean, fullWidth?: boolean, modalTitle?: string, modalSubtitle?: string, onChange: (id: string) => void }) => {
  const safeValue = String(currentStatusId || '').toLowerCase().trim();
  const status = statuses.find(s => String(s.id).toLowerCase().trim() === safeValue || String(s.name).toLowerCase().trim() === safeValue);

  const pointColor = status ? status.color : '#64748b';
  const text = status ? status.name : 'Unassigned';

  // ⭐ Al tocar el pill NO se abre un dropdown propio: se solicita el modal central
  //    de cambio de estado (el mismo de HousesView y QC).
  return (
    <div className={`inv-pill-wrap${fullWidth ? ' full' : ''}`}>
      <div
        onClick={(e) => { e.stopPropagation(); if (!disabled) onRequestOpen({ currentId: currentStatusId, onSelect: onChange, title: modalTitle, subtitle: modalSubtitle }); }}
        className={`inv-status-pill static${fullWidth ? ' full' : ''}${disabled ? ' disabled' : ''}`}
      >
        <span className="inv-pill-label-wrap">
          <span className="inv-pill-dot" style={{ '--dot-color': pointColor } as CSSProperties}></span>
          <span className="inv-pill-text">{text}</span>
        </span>
        <ChevronDown size={14} color="#9ca3af" className="inv-pill-chevron" />
      </div>
    </div>
  );
};



// ⭐ Cambio de estado: se usa el MISMO componente compartido que Pipeline y
//    Houses (src/components/StatusChangeModal), con su propio CSS. Antes esta
//    vista tenía una copia local que dependea de clases que ya no existen y
//    se pintaba sin estilo.

interface InvoicesViewProps {
  onOpenMenu: () => void;
  properties: Property[];
  setProperties: React.Dispatch<React.SetStateAction<Property[]>>;
  currentUser?: SystemUser | null;
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
  onEditProperty?: (property: Property) => void;
}

// ⭐ onEditProperty se mantiene en la interfaz por compatibilidad con App.tsx,
//    pero ya no se usa: el formulario de edicion SIEMPRE es el de HousesView
//    incrustado aqui, para que sea exactamente el mismo en las dos vistas.
export default function InvoicesView({ onOpenMenu, properties, setProperties, currentUser, activeRole, isSuperAdmin }: InvoicesViewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [teams, setTeams] = useState<Team[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);       // ⭐ Job statuses
  const [customers, setCustomers] = useState<Customer[]>([]);   // ⭐ Para resolver nombre del cliente
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  const [billedServices, setBilledServices] = useState<BilledServiceRecord[]>([]);

  // Filtros UI
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchClient, setSearchClient] = useState('');
  // ⭐ Default 'All' para que TODAS las casas se vean al entrar (antes 'Pending' las ocultaba)
  const [filterStatus, setFilterStatus] = useState<string>('All');

  // ⭐ RENDIMIENTO — paginación incremental: con ~3,700 registros, renderizar TODAS
  //    las filas (y además duplicadas en las tarjetas móviles) congelaba la vista:
  //    cada clic o tecla re-renderizaba miles de nodos. Se muestran 50 y el botón
  //    "Mostrar más" trae el resto por bloques.
  const PAGE_SIZE = 50;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filterStatus, searchClient, startDate, endDate]);

  // ⭐ Agrupación por Año / Mes / Semana / Día (preferencia recordada por navegador)
  const grouping = useDateGroups('pc.invoices.groupMode');

  // ⭐ Edición de la casa SIN salir de Invoices: esta vista incrusta HousesView en
  //    modo 'modals-only' y abre SU formulario de edición aquí mismo, para que sea
  //    exactamente el mismo que en Overview.
  //    ⚠ houseToEdit es solo el DISPARADOR: HousesView lo consume y lo limpia al
  //    instante (así funciona su houseToOpenEdit). Por eso el montaje del editor va
  //    en una bandera aparte que queda encendida — si se condicionara al disparador,
  //    el componente se desmontaría justo después de abrir y el modal "se cerraría".
  const [houseToEdit, setHouseToEdit] = useState<Property | null>(null);
  const [editorMounted, setEditorMounted] = useState(false);
  const openEdit = (house: Property) => {
    setEditorMounted(true);
    setHouseToEdit(house);
  };

  // ⭐ FOTOS / PDF sin salir de Invoices: abre el DETALLE de la casa (HousesView
  //    en modo 'modals-only') directo en el tab "Notes & Photos", donde están los
  //    botones Export PDF de Before/After — misma UI y permisos que el resto de
  //    las vistas. Siempre usa el incrustado propio (no delega al padre).
  const [houseToView, setHouseToView] = useState<Property | null>(null);
  // ⭐ Tab con el que abre el detalle: "media" para el boton de fotos/PDF y
  //    "overview" cuando se abre el detalle completo desde la fila o el ojo.
  const [detailTab, setDetailTab] = useState<'overview' | 'financials' | 'media'>('media');
  const openPhotosPdf = (house: Property) => {
    setEditorMounted(true);
    setDetailTab('media');
    setHouseToView(house);
  };
  // ⭐ EDITOR DE TEXTO en modal para las columnas Note / Notes / Issues: la
  //    celda muestra UNA línea truncada (la fila no crece) y al tocarla se abre
  //    el texto completo para verlo o editarlo. Cada columna guarda su campo.
  const [noteHouse, setNoteHouse] = useState<Property | null>(null);
  const [noteField, setNoteField] = useState<TextField>('note');
  const [noteDraft, setNoteDraft] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  const openNote = (prop: Property, field: TextField = 'note') => {
    setNoteHouse(prop);
    setNoteField(field);
    setNoteDraft(fieldText(prop, field));
  };

  const saveNote = async () => {
    if (!noteHouse) return;
    setIsSavingNote(true);
    try {
      const value = noteDraft.trim();
      const payload: Partial<Property> = {};
      payload[noteField] = value;
      await propertiesService.update(noteHouse.id, payload);
      setProperties(properties.map(p => p.id === noteHouse.id ? { ...p, ...payload } : p));
      setNoteHouse(null);
    } catch (error) {
      console.error("Error saving note:", error);
      alert("Failed to save the note.");
    } finally {
      setIsSavingNote(false);
    }
  };

  // ⭐ Config del modal central de cambio de estado (mismo que Houses/QC)
  const [statusModal, setStatusModal] = useState<StatusModalConfig | null>(null);

  const canEdit = isSuperAdmin || activeRole?.permissions?.find(p => p.module === 'Houses')?.canEdit;
  const canDelete = isSuperAdmin || activeRole?.permissions?.find(p => p.module === 'Houses')?.canDelete;
  // ⭐ La columna "Notes" es la nota de OFICINA: mismo permiso 'Office Notes'
  //    que el detalle de Houses y Quality Check. Sin permiso, la columna no sale.
  const canSeeOfficeNotes = !!isSuperAdmin || !!activeRole?.permissions?.find(p => p.module === 'Office Notes')?.canView;

  // ⭐ Resolver el nombre del cliente a partir del ID guardado en la propiedad.
  //    Retrocompatible: si el valor es un nombre legacy se devuelve igual.
  const getClientName = (clientIdOrName?: string | null) => {
    if (!clientIdOrName) return 'Unknown';
    return getRelationName(customers, clientIdOrName, String(clientIdOrName));
  };

  // ⭐ DETALLE: es el MISMO modal de HousesView (con todas sus pestanias, fotos,
  //    danios, checklist y acciones), no una copia reducida. Se abre encima de
  //    Invoices gracias al modo 'modals-only'.
  const openDetail = (prop: Property) => {
    setEditorMounted(true);
    setDetailTab('overview');
    setHouseToView(prop);
  };

  useEffect(() => {
    setIsLoading(true);
    const unsubscribes: (() => void)[] = [];
    let loaded = 0;
    // ⭐ Ya no se cargan aqui: 'properties' (llega por props desde App.tsx) ni
    //    priorities/services (el modal de detalle es el de HousesView, que trae
    //    sus propios catalogos).
    const TOTAL = 5;
    const tick = () => { loaded++; if (loaded >= TOTAL) setIsLoading(false); };

    unsubscribes.push(onSnapshot(
      collection(db, 'settings_teams'),
      (snap) => { setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Team[]); tick(); },
      (err) => { console.error("Error teams:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, 'settings_statuses'),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Status[];
        setStatuses(data.sort((a, b) => Number(a.order || 0) - Number(b.order || 0)));
        tick();
      },
      (err) => { console.error("Error statuses:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, 'customers'),
      (snap) => { setCustomers(snap.docs.map(mapCustomerDoc)); tick(); },
      (err) => { console.error("Error customers:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, 'payroll'),
      (snap) => { setPayrolls(snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollRecord))); tick(); },
      (err) => { console.error("Error payroll:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, 'billing_services'),
      (snap) => { setBilledServices(snap.docs.map(d => ({ id: d.id, ...d.data() } as BilledServiceRecord))); tick(); },
      (err) => { console.error("Error services:", err); tick(); }
    ));

    return () => unsubscribes.forEach(u => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambiar status de invoice
  const handleStatusChange = async (propertyId: string, newStatus: string) => {
    setIsSaving(true);
    try {
      await propertiesService.update(propertyId, { invoiceStatus: newStatus });
      setProperties(properties.map(p => p.id === propertyId ? { ...p, invoiceStatus: newStatus } : p));
    } catch (error) {
      console.error("Error updating invoice status:", error);
      alert("Failed to update invoice status.");
    } finally {
      setIsSaving(false);
    }
  };

  // ⭐ cambiar el job status (statusId) de la propiedad
  const handleJobStatusChange = async (propertyId: string, newStatusId: string) => {
    setIsSaving(true);
    try {
      // ⭐ Si el destino es "Invoice", estampa la marca de entrada para que la
      //    casa quede ARRIBA en esta vista (ver src/utils/invoiceEntry.ts).
      const payload = stampInvoiceEntry({ statusId: newStatusId }, statuses, newStatusId);
      await propertiesService.update(propertyId, payload);
      setProperties(properties.map(p => p.id === propertyId ? { ...p, ...payload } : p));
    } catch (error) {
      console.error("Error updating job status:", error);
      alert("Failed to update job status.");
    } finally {
      setIsSaving(false);
    }
  };

  // ⭐ Exento de impuestos (columna Taxes): alterna el 8.25% del trabajo.
  //    Recibe la casa del clic (no un "seleccionado") — ver CLAUDE.md.
  const handleToggleTax = async (prop: Property) => {
    const taxExempt = !prop.taxExempt;
    setIsSaving(true);
    try {
      await propertiesService.update(prop.id, { taxExempt });
      setProperties(properties.map(p => p.id === prop.id ? { ...p, taxExempt } : p));
    } catch (error) {
      console.error("Error updating tax:", error);
      alert("Failed to update taxes.");
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
    } catch (error) {
      console.error("Error deleting property:", error);
      alert("Failed to delete property.");
    } finally {
      setIsSaving(false);
    }
  };

  const getTeamName = (teamId?: string) => getRelationName(teams, teamId || '', 'Unassigned');
  const getTeamColor = (teamId?: string) => getRelationColor(teams, teamId || '') || '#94a3b8';

  // Filtro de scope (sólo lo que el usuario tiene permitido ver)

  // ⭐ Esta vista muestra las casas cuyo STATUS DE TRABAJO es "Invoice".
  //    MISMA mecánica que StatusHistoryView (que sí encuentra los 3,616):
  //    fuente = prop `properties` de App (con respaldo en la carga local), y
  //    resolución del status por id/nombre en minúsculas contra settings_statuses.
  // ⭐ RENDIMIENTO — todo lo de abajo estaba SIN memoizar y se recalculaba en cada
  //    render (cada clic/tecla): filtrar 3,700 props contra statuses con .find, y
  //    por CADA fila recorrer completas las colecciones de payroll y servicios
  //    (O(filas × registros) ≈ millones de operaciones). Ahora: useMemo + Maps.

  // Claves que identifican el status "Invoice" (id/nombre en minúsculas + id legacy de AppSheet)
  const invoiceStatusKeys = useMemo(() => {
    const keys = new Set<string>(['748aad00', 'invoice']);
    statuses.forEach(st => {
      if (String(st.name || '').toLowerCase().trim() === 'invoice') {
        keys.add(String(st.id).toLowerCase().trim());
        keys.add(String(st.name).toLowerCase().trim());
      }
    });
    return keys;
  }, [statuses]);

  // ⭐ PERF: esta vista YA NO descarga 'properties'. App.tsx mantiene el unico
  //    listener global de la coleccion y le pasa la lista completa por props
  //    (visibleProperties, sin filtrar). Antes se bajaban los ~3,600 documentos
  //    una tercera vez.
  const baseProps = properties;

  const invoiceProps = useMemo(
    () => (baseProps || []).filter(p => invoiceStatusKeys.has(String(p.statusId || '').toLowerCase().trim())),
    [baseProps, invoiceStatusKeys]
  );

  // Conteos por status (badge de cada pill), en UNA pasada
  const invoiceCounts = useMemo(() => {
    const acc = {} as Record<string, number>;
    INVOICE_STATUSES.forEach(st => { acc[st.id] = 0; });
    const idByLower = new Map(INVOICE_STATUSES.map(st => [st.id.toLowerCase(), st.id]));
    invoiceProps.forEach(p => {
      const key = idByLower.get(String(p.invoiceStatus || '').toLowerCase().trim());
      if (key) acc[key] += 1;
    });
    return acc;
  }, [invoiceProps]);
  const totalScopedCount = invoiceProps.length;

  // Índice de búsqueda por propiedad ("cliente dirección" en minúsculas): así el
  // filtro de texto no resuelve el nombre del cliente contra el catálogo por tecla.
  const searchTextByProp = useMemo(() => {
    const m = new Map<string, string>();
    invoiceProps.forEach(p => m.set(p.id, `${getClientName(p.client)} ${p.address || ''}`.toLowerCase()));
    return m;
    // getClientName solo depende de customers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceProps, customers]);

  // Filtrado + orden, memoizado. ⭐ ORDEN: las casas agregadas MÁS RECIENTEMENTE a
  // esta vista van SIEMPRE arriba (sentToInvoiceAt descendente, sin importar desde
  // qué vista se movieron). Las casas viejas que nunca recibieron la marca quedan
  // debajo, conservando el orden por Schedule Date DESCENDENTE de siempre.
  const filteredProperties = useMemo(() => {
    const q = searchClient.toLowerCase();
    const startT = startDate ? parseDateForSort(startDate) : null;
    const endT = endDate ? parseDateForSort(endDate) + (24 * 60 * 60 * 1000 - 1) : null;
    return invoiceProps.filter(prop => {
      if (filterStatus !== 'All' && String(prop.invoiceStatus || '').toLowerCase().trim() !== filterStatus.toLowerCase()) return false;
      if (q && !(searchTextByProp.get(prop.id) || '').includes(q)) return false;
      if (startT !== null || endT !== null) {
        if (!prop.scheduleDate) return false;
        const recT = parseDateForSort(prop.scheduleDate);
        if (startT !== null && recT < startT) return false;
        if (endT !== null && recT > endT) return false;
      }
      return true;
    }).sort((a, b) => {
      // ⭐ Prioridad 1: últimas agregadas a Invoices, más reciente arriba
      const sentA = invoiceEntryMs(a);
      const sentB = invoiceEntryMs(b);
      if (sentA !== null || sentB !== null) {
        if (sentA === null) return 1;
        if (sentB === null) return -1;
        return sentB - sentA;
      }
      // Prioridad 2: el resto por Schedule Date descendente (comportamiento original)
      const hasA = !!a.scheduleDate;
      const hasB = !!b.scheduleDate;
      if (!hasA && !hasB) return 0;
      if (!hasA) return 1;
      if (!hasB) return -1;
      return parseDateForSort(b.scheduleDate) - parseDateForSort(a.scheduleDate);
    });
  }, [invoiceProps, filterStatus, searchClient, startDate, endDate, searchTextByProp]);

  // Solo se renderiza la página visible (tabla Y tarjetas usan esta lista)
  const visibleProperties = useMemo(
    () => filteredProperties.slice(0, visibleCount),
    [filteredProperties, visibleCount]
  );

  // ⭐ Financieros por propiedad en UNA pasada por colección (Map O(1) por fila),
  //    en vez de filtrar payroll y servicios completos por cada fila renderizada.
  const financialsByProp = useMemo(() => {
    const m = new Map<string, { totalCost: number; payrollTotal: number }>();
    billedServices.forEach(srv => {
      if (!srv.propertyId) return;
      const e = m.get(srv.propertyId) || { totalCost: 0, payrollTotal: 0 };
      e.totalCost += Number(srv.total) || 0;
      m.set(srv.propertyId, e);
    });
    payrolls.forEach(pay => {
      if (!pay.propertyId) return;
      const e = m.get(pay.propertyId) || { totalCost: 0, payrollTotal: 0 };
      e.payrollTotal += getPayrollTotal(pay);
      m.set(pay.propertyId, e);
    });
    return m;
  }, [billedServices, payrolls]);

  // ⭐ Mismas fórmulas que la hoja "Operations":
  //    Service Price = suma de los servicios cobrados (billing_services)
  //    Taxes         = 8.25% del Service Price (0 si la casa está exenta)
  //    Final Cost    = Service Price − Taxes
  //    Profit        = Final Cost − Payroll
  //    Profit Margin = Profit / Final Cost
  const calcFinancials = (prop: Property): JobFinancials => {
    const e = financialsByProp.get(prop.id);
    const servicePrice = round2(e?.totalCost || 0);
    const payroll = round2(e?.payrollTotal || 0);
    const taxes = prop.taxExempt ? 0 : round2(servicePrice * TAX_RATE);
    const finalCost = round2(servicePrice - taxes);
    const profit = round2(finalCost - payroll);
    return { servicePrice, taxes, finalCost, payroll, profit, margin: marginOf(profit, finalCost) };
  };

  const sumFinancials = (list: Property[]): JobFinancials => {
    const t = { servicePrice: 0, taxes: 0, finalCost: 0, payroll: 0, profit: 0 };
    list.forEach(p => {
      const f = calcFinancials(p);
      t.servicePrice += f.servicePrice;
      t.taxes += f.taxes;
      t.finalCost += f.finalCost;
      t.payroll += f.payroll;
      t.profit += f.profit;
    });
    return { ...t, margin: marginOf(t.profit, t.finalCost) };
  };

  // ⭐ Totales del rango que se esta viendo (respeta chips, fechas y busqueda).
  const filteredTotals = useMemo(
    () => sumFinancials(filteredProperties),
    // calcFinancials solo depende de financialsByProp
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredProperties, financialsByProp]
  );

  // ⭐ Grupos por fecha (Schedule Date). Dentro de cada grupo las casas van de la
  //    más reciente a la más antigua; cada grupo trae sus subtotales.
  const groups = useMemo(() => {
    if (grouping.mode === 'none') return [];
    const byDate = [...filteredProperties].sort(
      (a, b) => parseDateForSort(b.scheduleDate) - parseDateForSort(a.scheduleDate)
    );
    return groupByDate(byDate, p => p.scheduleDate, grouping.mode, 'desc').map(g => ({
      ...g,
      totals: sumFinancials(g.items),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredProperties, financialsByProp, grouping.mode]);

  // Al cambiar los filtros, los grupos vuelven a su estado inicial
  useEffect(() => {
    grouping.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, searchClient, startDate, endDate]);

  const isGrouped = grouping.mode !== 'none';
  // Columnas de la tabla: "Notes" (oficina) solo con permiso
  const COLS = canSeeOfficeNotes ? 16 : 15;

  // Celda de texto de una línea (Note / Notes / Issues): abre el editor
  const textCell = (prop: Property, field: TextField) => {
    const text = fieldText(prop, field);
    return (
      <td
        className={`inv-td inv-col-text${field === 'issues' && text ? ' issue' : ''}`}
        title={text || (canEdit ? `Agregar ${TEXT_FIELD_LABEL[field]}` : '')}
        onClick={(e) => { e.stopPropagation(); openNote(prop, field); }}
      >
        {text ? <span className="inv-cell-ellipsis">{text}</span> : <span className="inv-cell-empty">—</span>}
      </td>
    );
  };

  const renderRow = (prop: Property) => {
    const f = calcFinancials(prop);
    const week = weekNumberOf(prop.scheduleDate);
    return (
      <tr key={prop.id} onClick={() => openDetail(prop)} className="inv-row">
        <td className="inv-td inv-col-address" title={prop.address || ''}>
          <span className="inv-cell-ellipsis">{prop.address || '-'}</span>
        </td>
        <td className="inv-td inv-col-client" title={getClientName(prop.client)}>
          <span className="inv-cell-ellipsis strong">{getClientName(prop.client)}</span>
        </td>
        {textCell(prop, 'note')}
        <td className="inv-td strong nowrap">{prop.scheduleDate ? formatDate(prop.scheduleDate) : '-'}</td>
        <td className="inv-td nowrap">
          <span className="inv-team-pill" style={{ '--team-color': getTeamColor(prop.teamId) } as CSSProperties}>
            {getTeamName(prop.teamId)}
          </span>
        </td>
        <td className="inv-td right money">{money(f.servicePrice)}</td>
        <td className="inv-td right money" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`inv-tax-btn${prop.taxExempt ? ' exempt' : ''}`}
            disabled={isSaving || !canEdit}
            onClick={() => handleToggleTax(prop)}
            title={prop.taxExempt ? 'Exento de impuestos — clic para cobrar 8.25%' : '8.25% Texas — clic para marcar exento'}
          >
            {money(f.taxes)}
          </button>
        </td>
        <td className="inv-td right money">{money(f.finalCost)}</td>
        <td className="inv-td right money payroll">{money(f.payroll)}</td>
        <td className={`inv-td right money profit ${f.profit >= 0 ? 'positive' : 'negative'}`}>{money(f.profit)}</td>
        <td className={`inv-td right money ${f.margin !== null && f.margin < 0 ? 'negative' : ''}`}>{pct(f.margin)}</td>
        <td className="inv-td" onClick={(e) => e.stopPropagation()}>
          <InvoiceStatusPill
            currentStatus={prop.invoiceStatus || 'Pending'}
            onChange={(newSt: string) => handleStatusChange(prop.id, newSt)}
            disabled={isSaving || (!isSuperAdmin && !canEdit)}
          />
        </td>
        {canSeeOfficeNotes && textCell(prop, 'officeNote')}
        {textCell(prop, 'issues')}
        <td className="inv-td center muted">{week ?? '—'}</td>
        <td className="inv-td center" onClick={(e) => e.stopPropagation()}>
          <div className="inv-actions-cell">
            <button
              onClick={(e) => { e.stopPropagation(); openPhotosPdf(prop); }}
              title="Photos / Export PDF"
              className="inv-icon-btn photos"
            >
              <FileImage size={16} />
            </button>
            {canEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); openEdit(prop); }}
                title="Edit Job"
                className="inv-icon-btn edit"
              >
                <Edit2 size={16} />
              </button>
            )}
            {canDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(prop.id); }}
                title="Delete Job"
                className="inv-icon-btn delete"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  const renderCard = (prop: Property) => {
    const f = calcFinancials(prop);
    const clientName = getClientName(prop.client);
    const officeNote = canSeeOfficeNotes ? fieldText(prop, 'officeNote') : '';
    const issues = fieldText(prop, 'issues');
    return (
      <div key={prop.id} onClick={() => openDetail(prop)} className="inv-job-card">
        {/* Título + profit */}
        <div className="inv-card-top-row">
          <span className="inv-card-client-name">{clientName}</span>
          <span className={`inv-card-profit ${f.profit >= 0 ? 'positive' : 'negative'}`}>
            {money(f.profit)} <span className="inv-card-margin">{pct(f.margin)}</span>
          </span>
        </div>

        {/* Info con iconos */}
        <div className="inv-card-info-col">
          <div className="inv-card-info-row">
            <MapPin size={16} color="#94a3b8" className="inv-shrink-0" />
            <span className="inv-card-info-text">{prop.address || '—'}</span>
          </div>
          <div className="inv-card-info-row">
            <CalendarDays size={16} color="#94a3b8" className="inv-shrink-0" />
            <span>
              {prop.scheduleDate ? formatDate(prop.scheduleDate) : 'Sin fecha'}
              {weekNumberOf(prop.scheduleDate) !== null && ` · Week ${weekNumberOf(prop.scheduleDate)}`}
            </span>
          </div>
          <div className="inv-card-info-row">
            <Users size={16} color="#94a3b8" className="inv-shrink-0" />
            <span>{getTeamName(prop.teamId)}</span>
          </div>
          {/* ⭐ Notas: maximo 2 lineas, para que la tarjeta no crezca sin
              control. El texto completo se abre tocando la nota. */}
          {houseNote(prop) !== '' && (
            <div className="inv-card-note" onClick={(e) => { e.stopPropagation(); openNote(prop, 'note'); }}>
              <StickyNote size={14} className="inv-shrink-0 inv-card-note-icon" />
              <span className="inv-card-note-text">{houseNote(prop)}</span>
            </div>
          )}
          {officeNote !== '' && (
            <div className="inv-card-note" onClick={(e) => { e.stopPropagation(); openNote(prop, 'officeNote'); }}>
              <StickyNote size={14} className="inv-shrink-0 inv-card-note-icon" />
              <span className="inv-card-note-text">{officeNote}</span>
            </div>
          )}
          {issues !== '' && (
            <div className="inv-card-note issue" onClick={(e) => { e.stopPropagation(); openNote(prop, 'issues'); }}>
              <StickyNote size={14} className="inv-shrink-0 inv-card-note-icon" />
              <span className="inv-card-note-text">{issues}</span>
            </div>
          )}
        </div>

        {/* Pills de estado (ancho completo) */}
        <div className="inv-card-pills-col" onClick={(e) => e.stopPropagation()}>
          <InvoiceStatusPill
            fullWidth
            currentStatus={prop.invoiceStatus || 'Pending'}
            onChange={(newSt: string) => handleStatusChange(prop.id, newSt)}
            disabled={isSaving || (!isSuperAdmin && !canEdit)}
          />
          <JobStatusPill
            fullWidth
            currentStatusId={prop.statusId}
            statuses={statuses}
            onChange={(newId: string) => handleJobStatusChange(prop.id, newId)}
            onRequestOpen={setStatusModal}
            modalTitle={getClientName(prop.client)}
            modalSubtitle={prop.address}
            disabled={isSaving || (!isSuperAdmin && !canEdit)}
          />
        </div>

        {/* Resumen financiero (mismas fórmulas que la hoja) */}
        <dl className="inv-card-fin-grid">
          <div><dt>Service Price</dt><dd>{money(f.servicePrice)}</dd></div>
          <div><dt>Taxes{prop.taxExempt ? ' (exento)' : ''}</dt><dd>{money(f.taxes)}</dd></div>
          <div><dt>Final Cost</dt><dd>{money(f.finalCost)}</dd></div>
          <div><dt>Payroll</dt><dd>{money(f.payroll)}</dd></div>
        </dl>

        {/* Acciones */}
        <div className="inv-card-actions-row" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => { e.stopPropagation(); openNote(prop, 'note'); }}
            className={`inv-card-btn note${houseNote(prop) !== '' ? ' has-note' : ''}`}>
            <StickyNote size={16} /> Nota
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); openPhotosPdf(prop); }}
            className="inv-card-btn photos">
            <FileImage size={16} /> Fotos
          </button>
          {canEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); openEdit(prop); }}
              className="inv-card-btn edit">
              <Edit2 size={16} /> Editar
            </button>
          )}
          {canDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(prop.id); }}
              className="inv-card-btn delete">
              <Trash2 size={16} /> Borrar
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fade-in invoices-view inv-page">

      {/* HEADER */}
      <header className="inv-header">
        <button onClick={onOpenMenu} className="inv-hamburger-btn" aria-label="Open menu">
          <Menu size={24} />
        </button>
        <div>
          <h1 className="inv-title">Invoices</h1>
          <p className="inv-subtitle">Financial tracking and billing status</p>
        </div>
      </header>


      {/* ⭐ RESUMEN del rango filtrado — lectura de gerencia, de izquierda a
          derecha igual que la hoja: lo cobrado → impuesto → neto → costo → ganancia. */}
      <section className="inv-kpi-grid" aria-label="Resumen financiero">
        <div className="inv-kpi-card">
          <div className="inv-kpi-label">Service Price</div>
          <div className="inv-kpi-value">{money(filteredTotals.servicePrice)}</div>
          <div className="inv-kpi-sub">
            {filteredProperties.length.toLocaleString('en-US')} {filteredProperties.length === 1 ? 'job' : 'jobs'}
          </div>
        </div>
        <div className="inv-kpi-card">
          <div className="inv-kpi-label">Taxes</div>
          <div className="inv-kpi-value">{money(filteredTotals.taxes)}</div>
          <div className="inv-kpi-sub">8.25% Texas</div>
        </div>
        <div className="inv-kpi-card">
          <div className="inv-kpi-label">Final Cost</div>
          <div className="inv-kpi-value">{money(filteredTotals.finalCost)}</div>
          <div className="inv-kpi-sub">Service Price − Taxes</div>
        </div>
        <div className="inv-kpi-card">
          <div className="inv-kpi-label">Payroll</div>
          <div className="inv-kpi-value">{money(filteredTotals.payroll)}</div>
          <div className="inv-kpi-sub">
            {filteredTotals.finalCost > 0
              ? `${((filteredTotals.payroll / filteredTotals.finalCost) * 100).toFixed(1)}% del Final Cost`
              : '—'}
          </div>
        </div>
        <div className={`inv-kpi-card highlight${filteredTotals.profit < 0 ? ' negative' : ''}`}>
          <div className="inv-kpi-label">Profit</div>
          <div className={`inv-kpi-value profit${filteredTotals.profit < 0 ? " negative" : ""}`}>
            {money(filteredTotals.profit)}
          </div>
          <div className="inv-kpi-sub">Margen {pct(filteredTotals.margin)}</div>
        </div>
      </section>

      {/* ⭐ Filtros agrupados en una sola tarjeta (chips + fechas + busqueda) */}
      <div className="inv-filters-card">

      {/* ⭐ PILL BUTTONS — Filtro por Invoice Status (un botón por cada status + All) */}
      <div className="inv-status-filters-row">
        <button
          onClick={() => setFilterStatus('All')}
          className={`inv-filter-pill${filterStatus === 'All' ? ' active' : ''}`}
          style={{ '--pill-color': '#64748b', '--pill-color-15': '#64748b15', '--pill-color-20': '#64748b20' } as CSSProperties}
        >
          All <span className={`inv-filter-count-badge${filterStatus === 'All' ? ' active' : ''}`}>{totalScopedCount}</span>
        </button>
        {INVOICE_STATUSES.map(st => (
          <button
            key={st.id}
            onClick={() => setFilterStatus(st.id)}
            className={`inv-filter-pill${filterStatus === st.id ? ' active' : ''}`}
            style={{ '--pill-color': st.color, '--pill-color-15': `${st.color}15`, '--pill-color-20': `${st.color}20`, '--dot-color': st.color } as CSSProperties}
          >
            <span className="inv-filter-dot"></span>
            {st.name} <span className={`inv-filter-count-badge${filterStatus === st.id ? ' active' : ''}`}>{invoiceCounts[st.id] || 0}</span>
          </button>
        ))}
      </div>

      {/* Filtros secundarios */}
      <div className="inv-secondary-filters">
        <div>
          <label className="inv-label">Start Date</label>
          <div className="inv-input-wrap">
            <CalendarDays className="inv-input-icon" size={16} />
            <input type="date" className="inv-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="inv-label">End Date</label>
          <div className="inv-input-wrap">
            <CalendarDays className="inv-input-icon" size={16} />
            <input type="date" className="inv-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="inv-search-cell">
          <label className="inv-label">Search (client or address)</label>
          <div className="inv-input-wrap">
            <Search className="inv-input-icon" size={16} />
            <input type="text" className="inv-input" placeholder="Buscar por cliente o dirección..." value={searchClient} onChange={e => setSearchClient(e.target.value)} />
          </div>
        </div>
        {/* ⭐ Agrupar por Año / Mes / Semana / Día, en la misma línea que los filtros */}
        <div className="inv-group-cell">
          <span className="inv-label">Agrupar por</span>
          <DateGroupBar mode={grouping.mode} onChange={grouping.setMode} showLabel={false} />
        </div>
      </div>

      </div>{/* /inv-filters-card */}

      {/* TABLA PRINCIPAL (escritorio) — mismas columnas y orden que la hoja "Operations" */}
      <div className="inv-table-wrap">
        <table className="inv-table">
          <thead>
            <tr>
              <th className="inv-th">Address</th>
              <th className="inv-th">Client</th>
              <th className="inv-th">Note</th>
              <th className="inv-th">Date</th>
              <th className="inv-th">Team</th>
              <th className="inv-th right">Service Price</th>
              <th className="inv-th right">Taxes</th>
              <th className="inv-th right">Final Cost</th>
              <th className="inv-th right">Payroll</th>
              <th className="inv-th right">Profit</th>
              <th className="inv-th right">Profit Margin</th>
              <th className="inv-th">Invoice</th>
              {canSeeOfficeNotes && <th className="inv-th">Notes</th>}
              <th className="inv-th">Issues</th>
              <th className="inv-th center">Week</th>
              <th className="inv-th center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={COLS} className="inv-empty-row">Loading financial data...</td></tr>
            ) : invoiceProps.length === 0 ? (
              <tr><td colSpan={COLS} className="inv-empty-row">No hay casas con status "Invoice" todavía.</td></tr>
            ) : filteredProperties.length === 0 ? (
              <tr><td colSpan={COLS} className="inv-empty-row">No properties match your filters. Try clicking "All" above or clearing the search.</td></tr>
            ) : !isGrouped ? (
              visibleProperties.map(renderRow)
            ) : groups.map((g, i) => {
              const open = grouping.isOpen(g.key, i);
              const shown = grouping.visibleCount(g.key);
              const t = g.totals;
              return (
                <Fragment key={g.key}>
                  {/* Encabezado del grupo con SUBTOTALES alineados a sus columnas */}
                  <tr className="dgb-group-row" onClick={() => grouping.toggle(g.key, i, groups[0]?.key)}>
                    {/* Nombre del grupo en la columna FIJA (Address): sigue
                        visible al desplazar la tabla hacia la derecha. */}
                    <td className="inv-group-first" title={g.detail ? `${g.label} · ${g.detail}` : g.label}>
                      <span className="dgb-group-title">
                        <ChevronRight size={16} className={`dgb-group-chevron${open ? ' open' : ''}`} />
                        {g.label}
                      </span>
                    </td>
                    <td colSpan={4}>
                      {g.detail && <span className="dgb-group-detail">{g.detail}</span>}
                      <span className="dgb-group-count">{g.items.length} {g.items.length === 1 ? 'job' : 'jobs'}</span>
                    </td>
                    <td className="dgb-group-total">{money(t.servicePrice)}</td>
                    <td className="dgb-group-total">{money(t.taxes)}</td>
                    <td className="dgb-group-total">{money(t.finalCost)}</td>
                    <td className="dgb-group-total">{money(t.payroll)}</td>
                    <td className={`dgb-group-total ${t.profit >= 0 ? 'positive' : 'negative'}`}>{money(t.profit)}</td>
                    <td className="dgb-group-total">{pct(t.margin)}</td>
                    <td colSpan={COLS - 11}></td>
                  </tr>
                  {open && g.items.slice(0, shown).map(renderRow)}
                  {open && g.items.length > shown && (
                    <tr className="dgb-more-row">
                      <td colSpan={COLS}>
                        <button className="dgb-more-btn" onClick={() => grouping.showMore(g.key)}>
                          Mostrar más — viendo {shown} de {g.items.length}
                        </button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {/* ⭐ TOTAL GENERAL del rango filtrado, fijo al pie de la tabla */}
          {!isLoading && filteredProperties.length > 0 && (
            <tfoot>
              <tr className="inv-total-row">
                <td className="inv-total-first">Total</td>
                <td colSpan={4} className="muted">
                  {filteredProperties.length.toLocaleString('en-US')} {filteredProperties.length === 1 ? 'job' : 'jobs'}
                </td>
                <td className="right">{money(filteredTotals.servicePrice)}</td>
                <td className="right">{money(filteredTotals.taxes)}</td>
                <td className="right">{money(filteredTotals.finalCost)}</td>
                <td className="right">{money(filteredTotals.payroll)}</td>
                <td className={`right ${filteredTotals.profit >= 0 ? 'positive' : 'negative'}`}>{money(filteredTotals.profit)}</td>
                <td className="right">{pct(filteredTotals.margin)}</td>
                <td colSpan={COLS - 11}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ====== VISTA TARJETAS (MÓVIL) ====== */}
      <div className="inv-cards-wrap">
        {isLoading ? (
          <div className="inv-empty-row">Loading financial data...</div>
        ) : invoiceProps.length === 0 ? (
          <div className="inv-empty-row">No hay casas con status "Invoice" todavía.</div>
        ) : filteredProperties.length === 0 ? (
          <div className="inv-empty-row">No properties match your filters. Try clicking "All" above or clearing the search.</div>
        ) : !isGrouped ? (
          visibleProperties.map(renderCard)
        ) : groups.map((g, i) => {
          const open = grouping.isOpen(g.key, i);
          const shown = grouping.visibleCount(g.key);
          return (
            <Fragment key={g.key}>
              <button type="button" className="dgb-group-card" onClick={() => grouping.toggle(g.key, i, groups[0]?.key)}>
                <span className="dgb-group-title">
                  <ChevronRight size={16} className={`dgb-group-chevron${open ? ' open' : ''}`} />
                  {g.label}
                  {g.detail && <span className="dgb-group-detail">{g.detail}</span>}
                  <span className="dgb-group-count">{g.items.length}</span>
                </span>
                <span className={`dgb-group-total ${g.totals.profit >= 0 ? 'positive' : 'negative'}`}>
                  {money(g.totals.profit)}
                  <span className="dgb-group-card-sub"> · {money(g.totals.servicePrice)}</span>
                </span>
              </button>
              {open && g.items.slice(0, shown).map(renderCard)}
              {open && g.items.length > shown && (
                <button className="dgb-more-btn" onClick={() => grouping.showMore(g.key)}>
                  Mostrar más — viendo {shown} de {g.items.length}
                </button>
              )}
            </Fragment>
          );
        })}
      </div>

      {/* ⭐ Paginación: carga el resto por bloques (aplica a tabla y tarjetas).
          Agrupado, cada grupo tiene su propio "Mostrar más". */}
      {!isLoading && !isGrouped && filteredProperties.length > visibleCount && (
        <div className="inv-load-more-row">
          <button className="inv-load-more-btn" onClick={() => setVisibleCount(c => c + 100)}>
            Mostrar más — viendo {visibleCount} de {filteredProperties.length}
          </button>
        </div>
      )}

      {/* ⭐ MODAL DE NOTA — ver y editar la nota de la casa sin abrir el detalle */}
      {noteHouse && (
        <div className="modal-overlay-centered" onClick={() => setNoteHouse(null)}>
          <div className="modal-70 inv-note-modal" onClick={e => e.stopPropagation()}>
            <header className="inv-modal-header">
              <div>
                <h3 className="inv-modal-title">{TEXT_FIELD_LABEL[noteField]}</h3>
                <p className="inv-note-modal-sub">{getClientName(noteHouse.client)} · {noteHouse.address || '-'}</p>
              </div>
              <button className="inv-modal-close" onClick={() => setNoteHouse(null)}><X size={24} /></button>
            </header>

            <div className="inv-note-modal-body">
              <textarea
                className="inv-note-textarea"
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                disabled={!canEdit || isSavingNote}
                placeholder={canEdit ? `Escribe ${TEXT_FIELD_LABEL[noteField]} de esta casa...` : "Sin texto"}
                rows={8}
              />
            </div>

            <footer className="inv-note-modal-footer">
              {canEdit && (
                <button
                  className="inv-btn-primary-modal"
                  onClick={saveNote}
                  disabled={isSavingNote}
                >
                  {isSavingNote ? 'Saving...' : 'Save'}
                </button>
              )}
              <button className="inv-btn-outline-modal" onClick={() => setNoteHouse(null)}>Close</button>
            </footer>
          </div>
        </div>
      )}

      {/* ⭐ MODAL CENTRAL DE CAMBIO DE ESTADO (mismo que Houses/QC) */}
      {statusModal && (
        <StatusChangeModal
          config={statusModal}
          statuses={statuses}
          onClose={() => setStatusModal(null)}
        />
      )}

      {/* ⭐ EDICIÓN y FOTOS/PDF de la casa sin salir de Invoices: HousesView en modo
          'modals-only' dibuja únicamente sus modales encima de esta vista
          (formulario de edición o detalle abierto en el tab de fotos). */}
      {editorMounted && (
        <HousesView
          renderMode="modals-only"
          onOpenMenu={() => { /* sin página propia en modals-only */ }}
          properties={baseProps}
          setProperties={setProperties}
          currentUser={currentUser}
          activeRole={activeRole}
          isSuperAdmin={isSuperAdmin}
          houseToOpenEdit={houseToEdit}
          clearHouseToOpenEdit={() => setHouseToEdit(null)}
          houseToOpenDetail={houseToView}
          clearHouseToOpenDetail={() => setHouseToView(null)}
          detailInitialTab={detailTab}
        />
      )}

    </div>
  );
}