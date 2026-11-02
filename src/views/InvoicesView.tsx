import { useState, useMemo, useDeferredValue } from 'react';
import type { ReactNode } from 'react';
import { formatDate } from '../utils/dateFormat';
import type { CSSProperties } from 'react';
import {
  Search, MapPin, CalendarDays, ChevronDown, ChevronRight, Users, Edit2, Trash2,
  X, StickyNote, FileImage, PauseCircle
} from 'lucide-react';
import PeriodBar from '../components/PeriodBar';
import { groupByDate, weekNumberOf } from '../utils/dateGrouping';
import { inPeriod, periodRange } from '../utils/periods';
import { useStoredPeriod } from '../shared/hooks/useStoredPeriod';
import { money, pct, marginTone, useJobFinancials } from '../utils/jobFinancials';
import StatusChangeModal, { type StatusModalConfig } from '../components/StatusChangeModal';

import type { Property, SystemUser, Role, Status } from '../types/index';
import { useLiveCollection } from '../shared/data/liveCollections';
import { propertiesService } from '../services/propertiesService';
import { getRelationName, getRelationColor } from '../utils/relations';
import { invoiceEntryMs } from '../utils/invoiceEntry';
import { changeHouseStatus, houseLogLabel, statusNameOf } from '../features/houses/services/houseStatus';
import { useHouseTrash } from '../features/houses/hooks/useHouseTrash';
import DeleteHouseDialog from '../features/houses/components/DeleteHouseDialog';
import { useMediaQuery } from '../shared/hooks/useMediaQuery';
import { usePendingById } from '../shared/hooks/usePendingById';
import HistoryWindowNotice from '../components/HistoryWindowNotice';
import InvoicesTotalsBar from '../components/InvoicesTotalsBar';
import './InvoicesView.css';
import MenuButton from '../shared/components/MenuButton';
import VirtualItems from '../shared/components/VirtualItems';
import RecallMark from '../shared/components/RecallMark';
import { useRecallHouses, wasHouseInRecall } from '../utils/jobRecall';

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
  currentUser?: SystemUser | null;
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
  /** Detalle y formulario de la casa: los de Houses, abiertos encima por App. */
  onOpenHouseDetail: (house: Property, tab?: 'media') => void;
  onOpenHouseEdit: (house: Property) => void;
}

export default function InvoicesView({ onOpenMenu, properties, currentUser, activeRole, isSuperAdmin, onOpenHouseDetail, onOpenHouseEdit }: InvoicesViewProps) {
  // ⭐ Guardado por fila: un cambio no deshabilita las demás filas ni espera al
  //    servidor (el listener ya muestra el cambio); si falla, avisa.
  const { pending, run } = usePendingById();
  // Solo se dibuja la tabla o solo las tarjetas (mismo corte que el CSS).
  const isPhone = useMediaQuery('(max-width: 900px)');

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
  // ⭐ "Recall" antes del cliente si la casa estuvo alguna vez en Recall (misma
  //    regla y misma marca que el Overview, el QC Dashboard y los reportes).
  const { recallHouseIds } = useRecallHouses(statuses);
  const wasPropertyInRecall = (prop: Property): boolean =>
    wasHouseInRecall(prop.id, statusNameOf(statuses, prop.statusId), recallHouseIds);
  // ⭐ Las filas se pintan en cuanto hay statuses (deciden qué casa es "Invoice");
  //    el dinero, el cliente y el equipo se completan cuando llegan sus datos.
  const isLoading = !statusesLive.loaded;
  // ⭐ billing_services + payroll en tiempo real y fórmulas de la hoja
  const jobFin = useJobFinancials();
  const cash = (n: number): ReactNode => (jobFin.loading ? <span className="skel-line skel-money" /> : money(n));

  // ⭐ Periodo (Day / Week / Month / Year / Custom) — misma barra que el
  //    Overview. Reemplaza Start/End Date y "Agrupar por": el periodo filtra y
  //    agrupa (Year → meses · Month → semanas · Week → días).
  const [invoicesPeriod, setInvoicesPeriod] = useStoredPeriod('pc.invoices.period', 'month');
  const invoicesPeriodRange = useMemo(() => periodRange(invoicesPeriod), [invoicesPeriod]);

  // Filtros UI
  const [searchClient, setSearchClient] = useState('');
  // La caja responde al instante; el filtro de la tabla va un paso atrás.
  const deferredSearch = useDeferredValue(searchClient);
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

  // ⭐ Fotos/PDF, detalle y edición: el MISMO detalle y formulario de Houses,
  //    abiertos encima de Invoices (App monta HousesView en modo 'modals-only').
  const openPhotosPdf = (house: Property) => onOpenHouseDetail(house, 'media');
  const openDetail = (house: Property) => onOpenHouseDetail(house);
  const openEdit = onOpenHouseEdit;
  // ⭐ EDITOR DE TEXTO en modal para las columnas Note / Notes / Issues: la
  //    celda muestra UNA línea truncada (la fila no crece) y al tocarla se abre
  //    el texto completo para verlo o editarlo. Cada columna guarda su campo.
  const [noteHouse, setNoteHouse] = useState<Property | null>(null);
  const [noteField, setNoteField] = useState<TextField>('note');
  const [noteDraft, setNoteDraft] = useState('');

  const openNote = (prop: Property, field: TextField = 'note') => {
    setNoteHouse(prop);
    setNoteField(field);
    setNoteDraft(fieldText(prop, field));
  };

  // Se guarda en segundo plano y el modal se cierra al instante.
  const saveNote = () => {
    if (!noteHouse) return;
    const payload: Partial<Property> = { [noteField]: noteDraft.trim() };
    run(noteHouse.id, () => propertiesService.update(noteHouse.id, payload), 'Failed to save the note.');
    setNoteHouse(null);
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
  //    Mientras llegan los clientes se muestra "…" (nunca el id crudo).
  const getClientName = (clientIdOrName?: string | null) => {
    if (!clientIdOrName) return 'Unknown';
    if (!customersLive.loaded) return '…';
    return getRelationName(customers, clientIdOrName, String(clientIdOrName));
  };

  // Status del invoice
  const handleStatusChange = (propertyId: string, invoiceStatus: string) =>
    run(propertyId, () => propertiesService.update(propertyId, { invoiceStatus }), 'Failed to update invoice status.');

  // ⭐ Job status (statusId): casa + status_history en un batch y bitácora
  //    después; si el destino es "Invoice" se estampa la marca de entrada.
  const handleJobStatusChange = (prop: Property, newStatusId: string) =>
    run(prop.id, () => changeHouseStatus(prop, newStatusId, {
      statuses,
      actor: currentUser,
      source: 'invoices',
      module: 'Invoices',
      label: houseLogLabel(getClientName(prop.client), prop.address),
    }), 'Failed to update job status.');

  // ⭐ Exento de impuestos (columna Taxes): alterna el 8.25% del trabajo.
  //    Recibe la casa del clic (no un "seleccionado") — ver CLAUDE.md.
  const handleToggleTax = (prop: Property) =>
    run(prop.id, () => propertiesService.update(prop.id, { taxExempt: !prop.taxExempt }), 'Failed to update taxes.');

  // ⭐ Borrar = mandar a la papelera con motivo obligatorio, junto con sus
  //    pagos y servicios (antes se destruía con deleteDoc y la nómina quedaba
  //    huérfana). Mismo flujo que Houses: features/houses/hooks/useHouseTrash.ts.
  const houseTrash = useHouseTrash({
    actor: currentUser,
    module: 'Invoices',
    labelOf: (h) => houseLogLabel(getClientName(h.client), h.address),
    liveOf: (id) => properties.find((p) => p.id === id),
  });

  const getTeamName = (teamId?: string) => (teamsLive.loaded ? getRelationName(teams, teamId || '', 'Unassigned') : '…');
  const getTeamColor = (teamId?: string) => getRelationColor(teams, teamId || '') || '#94a3b8';

  // Filtro de scope (sólo lo que el usuario tiene permitido ver)

  // ⭐ Esta vista muestra las casas cuyo STATUS DE TRABAJO es "Invoice".
  //    Fuente = prop `properties` de App (con respaldo en la carga local), y
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
  const invoiceProps = useMemo(
    () => properties.filter(p => invoiceStatusKeys.has(String(p.statusId || '').toLowerCase().trim())),
    [properties, invoiceStatusKeys]
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
    const q = deferredSearch.toLowerCase();
    return invoiceProps.filter(prop => {
      if (filterStatus !== 'All' && String(prop.invoiceStatus || '').toLowerCase().trim() !== filterStatus.toLowerCase()) return false;
      if (q && !(searchTextByProp.get(prop.id) || '').includes(q)) return false;
      // ⭐ Periodo de la barra superior (Schedule Date dentro del rango)
      return inPeriod(prop.scheduleDate, invoicesPeriodRange);
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
  }, [invoiceProps, filterStatus, deferredSearch, invoicesPeriodRange, searchTextByProp]);

  const calcFinancials = jobFin.calc;

  // ⭐ Totales del periodo que se está viendo (respeta chips y búsqueda).
  const filteredTotals = useMemo(() => jobFin.sum(filteredProperties), [jobFin, filteredProperties]);

  // ⭐ Grupos del periodo (Year → meses · Month → semanas · Week → días), cada
  //    uno con sus subtotales.
  const groups = useMemo(
    () =>
      groupByDate(filteredProperties, p => p.scheduleDate, invoicesPeriodRange.groupBy, 'desc').map(g => ({
        ...g,
        totals: jobFin.sum(g.items),
      })),
    [filteredProperties, invoicesPeriodRange.groupBy, jobFin]
  );
  // Columnas de la tabla: "Notes" (oficina) solo con permiso
  const COLS = canSeeOfficeNotes ? 16 : 15;

  // Encabezados de grupo, trabajos y "Show more" en una sola lista para la tabla
  // y las tarjetas: así se dibujan por ventana (Year son cientos).
  type InvoiceListItem =
    | { kind: 'group' | 'more'; g: (typeof groups)[number]; open: boolean; shown: number }
    | { kind: 'job'; prop: Property };
  const listItems = useMemo(
    () =>
      groups.flatMap((g): InvoiceListItem[] => {
        const open = !collapsed.has(g.key);
        const shown = groupShown[g.key] ?? PAGE_SIZE;
        if (!open) return [{ kind: 'group', g, open, shown }];
        return [
          { kind: 'group', g, open, shown },
          ...g.items.slice(0, shown).map((prop): InvoiceListItem => ({ kind: 'job', prop })),
          ...(g.items.length > shown ? [{ kind: 'more', g, open, shown } as const] : []),
        ];
      }),
    [groups, collapsed, groupShown],
  );

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
      <tr key={prop.id} onClick={() => openDetail(prop)} className={`inv-row${pending.has(prop.id) ? ' is-pending' : ''}`}>
        <td className="inv-td inv-col-address" title={prop.address || ''}>
          <span className="inv-cell-ellipsis">{prop.address || '-'}</span>
        </td>
        <td className="inv-td inv-col-client" title={getClientName(prop.client)}>
          <span className="inv-cell-ellipsis strong">
            {wasPropertyInRecall(prop) && <RecallMark />}
            {getClientName(prop.client)}
          </span>
        </td>
        {textCell(prop, 'note')}
        <td className="inv-td strong nowrap">{prop.scheduleDate ? formatDate(prop.scheduleDate) : '-'}</td>
        <td className="inv-td nowrap">
          <span className="inv-team-pill" style={{ '--team-color': getTeamColor(prop.teamId) } as CSSProperties}>
            {getTeamName(prop.teamId)}
          </span>
        </td>
        <td className="inv-td right money money-start">{cash(f.servicePrice)}</td>
        <td className="inv-td right money" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`inv-tax-btn${prop.taxExempt ? ' exempt' : ''}`}
            disabled={!canEdit}
            onClick={() => handleToggleTax(prop)}
            title={prop.taxExempt ? 'Exento de impuestos — clic para cobrar 8.25%' : '8.25% Texas — clic para marcar exento'}
          >
            {cash(f.taxes)}
          </button>
        </td>
        <td className="inv-td right money">{cash(f.finalCost)}</td>
        <td className="inv-td right money payroll">{cash(f.payroll)}</td>
        <td className={`inv-td right money profit ${f.profit >= 0 ? 'positive' : 'negative'}`}>{cash(f.profit)}</td>
        <td className="inv-td right">{jobFin.loading ? <span className="skel-line skel-money" /> : <span className={`inv-mpill ${marginTone(f.margin)}`}>{pct(f.margin)}</span>}</td>
        <td className="inv-td" onClick={(e) => e.stopPropagation()}>
          <div className="inv-status-cell">
            <InvoiceStatusPill
              currentStatus={prop.invoiceStatus || 'Pending'}
              onChange={(newSt: string) => handleStatusChange(prop.id, newSt)}
              disabled={!isSuperAdmin && !canEdit}
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
                onClick={(e) => { e.stopPropagation(); houseTrash.request(prop); }}
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
      <div key={prop.id} onClick={() => openDetail(prop)} className={`inv-job-card${pending.has(prop.id) ? ' is-pending' : ''}`}>
        {/* Título + profit */}
        <div className="inv-card-top-row">
          <span className="inv-card-client-name">
            {wasPropertyInRecall(prop) && <RecallMark />}
            {clientName}
          </span>
          <span className={`inv-card-profit ${f.profit >= 0 ? 'positive' : 'negative'}`}>
            {cash(f.profit)} <span className="inv-card-margin">{jobFin.loading ? '' : pct(f.margin)}</span>
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
            disabled={!isSuperAdmin && !canEdit}
          />
          <JobStatusPill
            fullWidth
            currentStatusId={prop.statusId}
            statuses={statuses}
            onChange={(newId: string) => handleJobStatusChange(prop, newId)}
            onRequestOpen={setStatusModal}
            modalTitle={getClientName(prop.client)}
            modalSubtitle={prop.address}
            disabled={!isSuperAdmin && !canEdit}
          />
        </div>

        {/* Resumen financiero (mismas fórmulas que la hoja) */}
        <dl className="inv-card-fin-grid">
          <div><dt>Service Price</dt><dd>{cash(f.servicePrice)}</dd></div>
          <div><dt>Taxes{prop.taxExempt ? ' (exento)' : ''}</dt><dd>{cash(f.taxes)}</dd></div>
          <div><dt>Final Cost</dt><dd>{cash(f.finalCost)}</dd></div>
          <div><dt>Payroll</dt><dd>{cash(f.payroll)}</dd></div>
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
              onClick={(e) => { e.stopPropagation(); houseTrash.request(prop); }}
              className="inv-card-btn delete">
              <Trash2 size={16} /> Borrar
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderTableItem = (item: InvoiceListItem) => {
    if (item.kind === 'job') return renderRow(item.prop);
    const { g, open, shown } = item;
    if (item.kind === 'more') {
      return (
        <tr key={`more:${g.key}`} className="inv-grp-more">
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
      );
    }
    const t = g.totals;
    // Encabezado del grupo con SUBTOTALES alineados a sus columnas
    return (
      <tr key={`group:${g.key}`} className="inv-grp-row" onClick={() => toggleGroup(g.key)}>
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
        <td className="right strong money-start">{cash(t.servicePrice)}</td>
        <td className="right strong">{cash(t.taxes)}</td>
        <td className="right strong">{cash(t.finalCost)}</td>
        <td className="right strong">{cash(t.payroll)}</td>
        <td className={`right strong ${t.profit >= 0 ? 'positive' : 'negative'}`}>{cash(t.profit)}</td>
        <td className="right">{!jobFin.loading && <span className={`inv-mpill ${marginTone(t.margin)}`}>{pct(t.margin)}</span>}</td>
        <td colSpan={COLS - 11}></td>
      </tr>
    );
  };

  const renderCardItem = (item: InvoiceListItem) => {
    if (item.kind === 'job') return renderCard(item.prop);
    const { g, open, shown } = item;
    if (item.kind === 'more') {
      return (
        <button
          key={`more:${g.key}`}
          type="button"
          className="inv-more-btn"
          onClick={() => setGroupShown(c => ({ ...c, [g.key]: shown + 100 }))}
        >
          Show more — {shown} of {g.items.length}
        </button>
      );
    }
    return (
      <button key={`group:${g.key}`} type="button" className="inv-grp-card" onClick={() => toggleGroup(g.key)}>
        <span className="inv-grp-title">
          <ChevronRight size={16} className={`inv-grp-chevron${open ? ' open' : ''}`} />
          {g.label}
          {g.detail && <span className="inv-grp-range">{g.detail}</span>}
          <span className="inv-grp-count">{g.items.length}</span>
        </span>
        <span className={`inv-grp-card-total ${g.totals.profit >= 0 ? 'positive' : 'negative'}`}>
          {cash(g.totals.profit)}
        </span>
      </button>
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
      <PeriodBar period={invoicesPeriod} onChange={setInvoicesPeriod} />

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

      {/* ⭐ Solo se dibuja una de las dos: tabla (escritorio) o tarjetas (móvil). */}
      {!isPhone ? (
      /* TABLA PRINCIPAL — mismas columnas y orden que la hoja "Operations" */
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
          {isLoading || invoiceProps.length === 0 || filteredProperties.length === 0 ? (
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}><td colSpan={COLS} className="inv-td"><div className="skel-line skel-row-main" /></td></tr>
                ))
              ) : invoiceProps.length === 0 ? (
                <tr><td colSpan={COLS} className="inv-empty-row">No hay casas con status "Invoice" todavía.</td></tr>
              ) : (
                <tr><td colSpan={COLS} className="inv-empty-row">No jobs in this period. Use ← → or Today to move the period, or click "All".</td></tr>
              )}
            </tbody>
          ) : (
            <VirtualItems items={listItems} estimate={58} colSpan={COLS} renderItem={renderTableItem} />
          )}
          {/* ⭐ TOTAL GENERAL del periodo, fijo al pie de la tabla */}
          {!isLoading && filteredProperties.length > 0 && (
            <tfoot>
              <tr className="inv-total-row">
                <td className="inv-total-first">Total</td>
                <td colSpan={4} className="muted">
                  {filteredProperties.length.toLocaleString('en-US')} {filteredProperties.length === 1 ? 'job' : 'jobs'}
                </td>
                <td className="right">{cash(filteredTotals.servicePrice)}</td>
                <td className="right">{cash(filteredTotals.taxes)}</td>
                <td className="right">{cash(filteredTotals.finalCost)}</td>
                <td className="right">{cash(filteredTotals.payroll)}</td>
                <td className={`right ${filteredTotals.profit >= 0 ? 'positive' : 'negative'}`}>{cash(filteredTotals.profit)}</td>
                <td className="right">{jobFin.loading ? '' : pct(filteredTotals.margin)}</td>
                <td colSpan={COLS - 11}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      ) : (
      /* ====== VISTA TARJETAS (MÓVIL) ====== */
      isLoading || invoiceProps.length === 0 || filteredProperties.length === 0 ? (
        <div className="inv-cards-wrap">
          {isLoading ? (
            Array.from({ length: 3 }, (_, i) => <div key={i} className="skel-card" />)
          ) : invoiceProps.length === 0 ? (
            <div className="inv-empty-row">No hay casas con status "Invoice" todavía.</div>
          ) : (
            <div className="inv-empty-row">No jobs in this period.</div>
          )}
        </div>
      ) : (
        <>
          <InvoicesTotalsBar totals={filteredTotals} jobCount={filteredProperties.length} isLoading={jobFin.loading} />
          <VirtualItems className="inv-cards-wrap" items={listItems} estimate={210} renderItem={renderCardItem} />
        </>
      )
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
                disabled={!canEdit}
                placeholder={canEdit ? `Escribe ${TEXT_FIELD_LABEL[noteField]} de esta casa...` : "Sin texto"}
                rows={8}
              />
            </div>

            <footer className="inv-note-modal-footer">
              {canEdit && (
                <button className="inv-btn-primary-modal" onClick={saveNote}>Save</button>
              )}
              <button className="inv-btn-outline-modal" onClick={() => setNoteHouse(null)}>Close</button>
            </footer>
          </div>
        </div>
      )}

      {/* ⭐ Borrar con motivo → papelera (mismo diálogo que Houses) */}
      {houseTrash.target && (
        <DeleteHouseDialog
          label={houseTrash.label}
          busy={houseTrash.busy}
          onCancel={houseTrash.cancel}
          onConfirm={(reason) => void houseTrash.confirm(reason)}
        />
      )}

      {/* ⭐ MODAL CENTRAL DE CAMBIO DE ESTADO (mismo que Houses/QC) */}
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