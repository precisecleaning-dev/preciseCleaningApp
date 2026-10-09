import { useState, useMemo, Fragment } from 'react';
import { formatDate } from '../utils/dateFormat';
import type { CSSProperties } from 'react';
import {
  Search, MapPin, CalendarDays, ChevronDown, ChevronRight, Users, Edit2, Trash2,
  X, StickyNote, FileImage, PauseCircle
} from 'lucide-react';
import PeriodBar from '../components/PeriodBar';
import KpiGrid from '../components/KpiGrid';
import { groupByDate, weekNumberOf } from '../utils/dateGrouping';
import { inPeriod, loadPeriod, periodRange, savePeriod, type PeriodState } from '../utils/periods';
import { money, pct, marginTone, useJobFinancials } from '../utils/jobFinancials';
import StatusChangeModal, { type StatusModalConfig } from '../components/StatusChangeModal';

import type { Property, SystemUser, Role, Status } from '../types/index';
import { useLiveCollection } from '../shared/data/liveCollections';
import { propertiesService } from '../services/propertiesService';
import { getRelationName, getRelationColor } from '../utils/relations';
import { stampInvoiceEntry, invoiceEntryMs } from '../utils/invoiceEntry';
import HousesView from './HousesView';
import HistoryWindowNotice from '../components/HistoryWindowNotice';
import './InvoicesView.css';
import MenuButton from '../shared/components/MenuButton';

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

// ⭐ Fórmulas de la hoja (Taxes 8.25%, Final Cost, Profit, Margin): viven en
//    src/utils/jobFinancials.ts, compartidas con el Overview unificado.

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
  const slash = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
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
  const [isSaving, setIsSaving] = useState(false);

  // ⭐ Catálogos desde el store compartido (un listener por colección para toda la app).
  const teamsLive = useLiveCollection('teams');
  const statusesLive = useLiveCollection('statuses');            // ⭐ Job statuses
  const customersLive = useLiveCollection('customers');          // ⭐ Para resolver nombre del cliente
  const teams = teamsLive.data;
  const statuses = useMemo(
    () => [...statusesLive.data].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
    [statusesLive.data],
  );
  const customers = customersLive.data;
  const isLoading = !teamsLive.loaded || !statusesLive.loaded || !customersLive.loaded;
  // ⭐ billing_services + payroll en tiempo real y fórmulas de la hoja
  const jobFin = useJobFinancials();

  // ⭐ Periodo (Day / Week / Month / Year / Custom) — misma barra que el
  //    Overview. Reemplaza Start/End Date y "Agrupar por": el periodo filtra y
  //    agrupa (Year → meses · Month → semanas · Week → días).
  const PERIOD_KEY = 'pc.invoices.period';
  const [period, setPeriodState] = useState<PeriodState>(() => loadPeriod(PERIOD_KEY, 'month'));
  const setPeriod = (p: PeriodState) => { setPeriodState(p); savePeriod(PERIOD_KEY, p); };
  const range = useMemo(() => periodRange(period), [period]);

  // Filtros UI
  const [searchClient, setSearchClient] = useState('');
  // ⭐ Default 'All' para que TODAS las casas se vean al entrar (antes 'Pending' las ocultaba)
  const [filterStatus, setFilterStatus] = useState<string>('All');

  // ⭐ RENDIMIENTO — paginación incremental: con ~3,700 registros, renderizar TODAS
  //    las filas congelaba la vista. Cada grupo del periodo muestra 50 filas y
  //    "Show more" trae el resto por bloques.
  const PAGE_SIZE = 50;

  // Grupos del periodo: abiertos por defecto, plegables, por bloques de filas.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [groupShown, setGroupShown] = useState<Record<string, number>>({});
  const toggleGroup = (key: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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
  //    sin tab (null) cuando se abre el detalle completo desde la fila o el ojo:
  //    abre en la pestaña por defecto del detalle (Notes & Photos).
  const [detailTab, setDetailTab] = useState<'media' | null>('media');
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
    setDetailTab(null);
    setHouseToView(prop);
  };


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
    return invoiceProps.filter(prop => {
      if (filterStatus !== 'All' && String(prop.invoiceStatus || '').toLowerCase().trim() !== filterStatus.toLowerCase()) return false;
      if (q && !(searchTextByProp.get(prop.id) || '').includes(q)) return false;
      // ⭐ Periodo de la barra superior (Schedule Date dentro del rango)
      return inPeriod(prop.scheduleDate, range);
    }).sort((a, b) => {
      // ⭐ Dentro de cada grupo: últimas agregadas a Invoices arriba
      //    (sentToInvoiceAt); las viejas sin marca, por Schedule Date desc.
      const sentA = invoiceEntryMs(a);
      const sentB = invoiceEntryMs(b);
      if (sentA !== null || sentB !== null) {
        if (sentA === null) return 1;
        if (sentB === null) return -1;
        return sentB - sentA;
      }
      return parseDateForSort(b.scheduleDate) - parseDateForSort(a.scheduleDate);
    });
  }, [invoiceProps, filterStatus, searchClient, range, searchTextByProp]);

  const calcFinancials = jobFin.calc;

  // ⭐ Totales del periodo que se está viendo (respeta chips y búsqueda).
  const filteredTotals = useMemo(() => jobFin.sum(filteredProperties), [jobFin, filteredProperties]);

  // ⭐ Grupos del periodo (Year → meses · Month → semanas · Week → días), cada
  //    uno con sus subtotales.
  const groups = useMemo(
    () =>
      groupByDate(filteredProperties, p => p.scheduleDate, range.groupBy, 'desc').map(g => ({
        ...g,
        totals: jobFin.sum(g.items),
      })),
    [filteredProperties, range.groupBy, jobFin]
  );
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
        <td className="inv-td right money money-start">{money(f.servicePrice)}</td>
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
        <td className="inv-td right"><span className={`inv-mpill ${marginTone(f.margin)}`}>{pct(f.margin)}</span></td>
        <td className="inv-td" onClick={(e) => e.stopPropagation()}>
          <div className="inv-status-cell">
            <InvoiceStatusPill
              currentStatus={prop.invoiceStatus || 'Pending'}
              onChange={(newSt: string) => handleStatusChange(prop.id, newSt)}
              disabled={isSaving || (!isSuperAdmin && !canEdit)}
            />
            {/* ⭐ Factura retenida por un QC que no pasó (RECALL con re-clean). */}
            {prop.invoiceHold && (
              <span className="inv-hold" title="Factura retenida: el Quality Check no pasó. Se libera cuando un QC de esta casa pase.">
                <PauseCircle size={11} /> QC hold
              </span>
            )}
          </div>
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
    <div className="fade-in invoices-view inv-page inv-unified">

      {/* HEADER — mismo estilo que el Overview unificado */}
      <header className="inv-header">
        <div className="view-header-title-group">
          <MenuButton onClick={onOpenMenu} />
          <div>
            <h1 className="inv-title">Invoices</h1>
            <p className="inv-subtitle">Billing, taxes &amp; profit per job</p>
          </div>
        </div>
      </header>
      <HistoryWindowNotice />

      {/* ⭐ Periodo — misma barra que el Overview */}
      <PeriodBar period={period} onChange={setPeriod} />

      {/* ⭐ RESUMEN del periodo — de izquierda a derecha igual que la hoja:
          lo cobrado → impuesto → neto → costo → ganancia. */}
      <KpiGrid
        label="Resumen financiero"
        groups={[{
          key: 'fin',
          title: 'Financials',
          color: '#1d3fcf',
          tiles: [
            { key: 'price', label: 'Service price', value: money(filteredTotals.servicePrice), sub: `${filteredProperties.length.toLocaleString('en-US')} ${filteredProperties.length === 1 ? 'job' : 'jobs'}` },
            { key: 'tax', label: 'Taxes', value: money(filteredTotals.taxes), sub: '8.25% Texas' },
            { key: 'final', label: 'Final cost', value: money(filteredTotals.finalCost), sub: 'Price − taxes' },
            {
              key: 'payroll', label: 'Payroll', value: money(filteredTotals.payroll),
              sub: filteredTotals.finalCost > 0 ? `${((filteredTotals.payroll / filteredTotals.finalCost) * 100).toFixed(1)}% of final cost` : '—',
            },
            {
              key: 'profit', label: 'Profit', value: money(filteredTotals.profit),
              tone: filteredTotals.profit < 0 ? 'bad' : 'good',
              highlight: filteredTotals.profit < 0 ? 'bad' : 'good',
              sub: `Margin ${pct(filteredTotals.margin)}`,
            },
          ],
        }]}
      />

      {/* ⭐ Filtros: status del invoice (chips) + búsqueda */}
      <div className="inv-filters-bar">
        <div className="inv-chips">
          <button
            type="button"
            onClick={() => setFilterStatus('All')}
            className={`inv-chip${filterStatus === 'All' ? ' on' : ''}`}
          >
            All <span className="inv-chip-cnt">{totalScopedCount}</span>
          </button>
          {INVOICE_STATUSES.map(st => (
            <button
              type="button"
              key={st.id}
              onClick={() => setFilterStatus(st.id)}
              className={`inv-chip${filterStatus === st.id ? ' on' : ''}`}
            >
              <span className="inv-chip-dot" style={{ '--dot-color': st.color } as CSSProperties}></span>
              {st.name} <span className="inv-chip-cnt">{invoiceCounts[st.id] || 0}</span>
            </button>
          ))}
        </div>
        <label className="inv-search">
          <Search className="inv-search-icon" size={16} />
          <input
            type="text"
            className="inv-search-input"
            placeholder="Search client or address"
            aria-label="Search client or address"
            value={searchClient}
            onChange={e => setSearchClient(e.target.value)}
          />
        </label>
      </div>

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
              <th className="inv-th right money-start">Service Price</th>
              <th className="inv-th right">Taxes</th>
              <th className="inv-th right">Final Cost</th>
              <th className="inv-th right">Payroll</th>
              <th className="inv-th right">Profit</th>
              <th className="inv-th right">Margin</th>
              <th className="inv-th">Invoice</th>
              {canSeeOfficeNotes && <th className="inv-th">Notes</th>}
              <th className="inv-th">Issues</th>
              <th className="inv-th center">Week</th>
              <th className="inv-th center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading || jobFin.loading ? (
              <tr><td colSpan={COLS} className="inv-empty-row">Loading financial data...</td></tr>
            ) : invoiceProps.length === 0 ? (
              <tr><td colSpan={COLS} className="inv-empty-row">No hay casas con status "Invoice" todavía.</td></tr>
            ) : filteredProperties.length === 0 ? (
              <tr><td colSpan={COLS} className="inv-empty-row">No jobs in this period. Use ← → or Today to move the period, or click "All".</td></tr>
            ) : groups.map(g => {
              const open = !collapsed.has(g.key);
              const shown = groupShown[g.key] ?? PAGE_SIZE;
              const t = g.totals;
              return (
                <Fragment key={g.key}>
                  {/* Encabezado del grupo con SUBTOTALES alineados a sus columnas */}
                  <tr className="inv-grp-row" onClick={() => toggleGroup(g.key)}>
                    {/* Nombre del grupo en la columna FIJA (Address): sigue
                        visible al desplazar la tabla hacia la derecha. */}
                    <td className="inv-group-first" title={g.detail ? `${g.label} · ${g.detail}` : g.label}>
                      <span className="inv-grp-title">
                        <ChevronRight size={16} className={`inv-grp-chevron${open ? ' open' : ''}`} />
                        {g.label}
                      </span>
                    </td>
                    <td colSpan={4}>
                      {g.detail && <span className="inv-grp-range">{g.detail}</span>}
                      <span className="inv-grp-count">{g.items.length} {g.items.length === 1 ? 'job' : 'jobs'}</span>
                    </td>
                    <td className="right strong money-start">{money(t.servicePrice)}</td>
                    <td className="right strong">{money(t.taxes)}</td>
                    <td className="right strong">{money(t.finalCost)}</td>
                    <td className="right strong">{money(t.payroll)}</td>
                    <td className={`right strong ${t.profit >= 0 ? 'positive' : 'negative'}`}>{money(t.profit)}</td>
                    <td className="right"><span className={`inv-mpill ${marginTone(t.margin)}`}>{pct(t.margin)}</span></td>
                    <td colSpan={COLS - 11}></td>
                  </tr>
                  {open && g.items.slice(0, shown).map(renderRow)}
                  {open && g.items.length > shown && (
                    <tr className="inv-grp-more">
                      <td colSpan={COLS}>
                        <button
                          type="button"
                          className="inv-more-btn"
                          onClick={() => setGroupShown(c => ({ ...c, [g.key]: shown + 100 }))}
                        >
                          Show more — {shown} of {g.items.length}
                        </button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {/* ⭐ TOTAL GENERAL del periodo, fijo al pie de la tabla */}
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
        {isLoading || jobFin.loading ? (
          <div className="inv-empty-row">Loading financial data...</div>
        ) : invoiceProps.length === 0 ? (
          <div className="inv-empty-row">No hay casas con status "Invoice" todavía.</div>
        ) : filteredProperties.length === 0 ? (
          <div className="inv-empty-row">No jobs in this period.</div>
        ) : groups.map(g => {
          const open = !collapsed.has(g.key);
          const shown = groupShown[g.key] ?? PAGE_SIZE;
          return (
            <Fragment key={g.key}>
              <button type="button" className="inv-grp-card" onClick={() => toggleGroup(g.key)}>
                <span className="inv-grp-title">
                  <ChevronRight size={16} className={`inv-grp-chevron${open ? ' open' : ''}`} />
                  {g.label}
                  {g.detail && <span className="inv-grp-range">{g.detail}</span>}
                  <span className="inv-grp-count">{g.items.length}</span>
                </span>
                <span className={`inv-grp-card-total ${g.totals.profit >= 0 ? 'positive' : 'negative'}`}>
                  {money(g.totals.profit)}
                </span>
              </button>
              {open && g.items.slice(0, shown).map(renderCard)}
              {open && g.items.length > shown && (
                <button
                  type="button"
                  className="inv-more-btn"
                  onClick={() => setGroupShown(c => ({ ...c, [g.key]: shown + 100 }))}
                >
                  Show more — {shown} of {g.items.length}
                </button>
              )}
            </Fragment>
          );
        })}
      </div>

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
          detailInitialTab={detailTab ?? undefined}
        />
      )}

    </div>
  );
}