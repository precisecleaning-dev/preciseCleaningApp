// ⭐ OVERVIEW / PIPELINE — la página de Houses: encabezado, filtros, periodo,
//    indicadores y la lista (tabla unificada o tarjetas, o el tablero), con su
//    propio estado de filtros. El detalle, el formulario y el cambio de status
//    los abre HousesView (props on*). Extraído de HousesView.
import { useCallback, useDeferredValue, useMemo, useState, type CSSProperties } from "react";
import {
  AlertTriangle, Briefcase, ChevronRight, Clock, CloudOff, FileText, Filter, Plus, Search, ShieldCheck, Wrench,
} from "lucide-react";
import type { Property, SystemUser } from "../../../types/index";
import { propertiesService } from "../../../services/propertiesService";
import { logActivity } from "../../../services/activityLogService";
import { resolveCustomerName } from "../../../utils/customerDocs";
import { dateSortValue } from "../../../utils/dateFormat";
import { getRelationName } from "../../../utils/relations";
import { inPeriod, loadPeriod, periodRange, savePeriod, type PeriodState } from "../../../utils/periods";
import { useJobFinancials } from "../../../utils/jobFinancials";
import { qcCounts, qcInfoFor, useQcRecords } from "../../../utils/jobQuality";
import { buildUnifiedGroups, type UnifiedGroup } from "../../../utils/unifiedRows";
import { useRecallHouses } from "../../../utils/jobRecall";
import { isRecallText } from "../../../utils/recallStatus";
import { usePendingById } from "../../../shared/hooks/usePendingById";
import { PHONE_QUERY, useMediaQuery } from "../../../shared/hooks/useMediaQuery";
import { useStableCallback } from "../../../shared/hooks/useStableCallback";
import MenuButton from "../../../shared/components/MenuButton";
import PeriodBar from "../../../components/PeriodBar";
import KpiGrid from "../../../components/KpiGrid";
import UnifiedJobsTable from "../../../components/UnifiedJobsTable";
import PipelineBoardView from "../../../components/PipelineBoardView";
import HistoryWindowNotice from "../../../components/HistoryWindowNotice";
import type { StatusModalConfig } from "../../../components/StatusChangeModal";
import { changeHouseStatus } from "../services/houseStatus";
import { useHouseCatalogs } from "../hooks/useHouseCatalogs";
import type { HouseAccess } from "../hooks/useHouseAccess";
import type { FormVisibilityConfig } from "../houseFieldConfig";
import JobCard from "./JobCard";
import StatusPillSelector from "./StatusPillSelector";
import PropertyDateFixTool from "./PropertyDateFixTool";
import MyHistoryModal from "./MyHistoryModal";
import RepairClientsModal from "./RepairClientsModal";

// ⭐ Valor del filtro para "casas sin status" (no choca con ningún nombre real)
const NO_STATUS_FILTER = "__NO_STATUS__";

// ⭐ PERF: la lista de trabajos se pinta por bloques. Renderizar miles de
//    filas de golpe era lo que hacía sentir la vista lenta al abrir.
const JOBS_PAGE_SIZE = 50;

interface HouseListProps {
  viewMode: "table" | "board";
  properties: Property[];
  currentUser?: SystemUser | null;
  isSuperAdmin?: boolean;
  access: HouseAccess;
  /** Para recalcular la lista cuando cambia "Configure Fields". */
  formConfig: FormVisibilityConfig;
  onOpenMenu: () => void;
  isOnline: boolean;
  pendingTotal: number;
  draftsCount: number;
  onOpenDrafts: () => void;
  onNewJob: () => void;
  onOpenDetail: (house: Property) => void;
  onEdit: (house: Property) => void;
  onDelete: (house: Property) => void;
  onPhotosFromCard: (house: Property, which: "before" | "after") => void;
  onRequestStatus: (cfg: StatusModalConfig) => void;
}

export default function HouseList({
  viewMode, properties, currentUser, isSuperAdmin, access, formConfig, onOpenMenu, isOnline, pendingTotal,
  draftsCount, onOpenDrafts, onNewJob, onOpenDetail, onEdit, onDelete, onPhotosFromCard, onRequestStatus,
}: HouseListProps) {
  const {
    statuses, statusesLoaded, teams, priorities, services, customersList, statusIndex, findStatusOf,
    getClientName, isHiddenPipelineStatus, logLabel,
  } = useHouseCatalogs();
  const {
    canAdd, canEdit, canDelete, userScope, allowedStatusIds, photosUnlockedFor, isFieldRO, isVisible,
    isElementVisible, isStatusVisibleForRole, canSeeOfficeNotes,
  } = access;
  // ⭐ PERF: clave estable del arreglo para las dependencias de los useMemo.
  const allowedStatusKey = allowedStatusIds.join(",");

  const [activeFilter, setActiveFilter] = useState("All");
  const [houseFilter, setHouseFilter] = useState("All");
  const [invoiceFilter, setInvoiceFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  // ⭐ La caja de búsqueda responde al instante; el filtrado de miles de casas
  //    va un paso atrás, sin bloquear el teclado (React 19 useDeferredValue).
  const deferredSearch = useDeferredValue(searchTerm);
  const [priorityFilter, setPriorityFilter] = useState("All");

  // Cambios rápidos de una fila (status, equipo, billing): no bloquean las demás.
  const { pending: pendingRows, run: runRow } = usePendingById();
  // La tabla se pinta en cuanto llegan los statuses; el resto de los catálogos
  // sigue cargando en segundo plano (igual que antes).
  const isLoading = !statusesLoaded;

  // ⭐ REPARADOR DE VÍNCULOS: casas cuyo `client` no resuelve a ningún
  //    cliente (la auto-limpieza vieja borró la llave legacy). Se agrupan por
  //    id huérfano y se reasignan en lote al cliente correcto.
  const [isRepairOpen, setIsRepairOpen] = useState(false);
  const orphanClientGroups = useMemo(() => {
    if (customersList.length === 0) return [];
    const groups = new Map<string, { count: number; sample: string }>();
    for (const p of properties) {
      const key = String(p.client || "").trim();
      if (!key) continue;
      if (resolveCustomerName(customersList, key, "")) continue;
      const g = groups.get(key) || { count: 0, sample: "" };
      g.count += 1;
      if (!g.sample) g.sample = String(p.address || (p as Property & { note?: string }).note || "");
      groups.set(key, g);
    }
    return Array.from(groups.entries()).map(([id, g]) => ({ id, ...g }));
  }, [properties, customersList]);

  // ⭐ Filtra una lista de casas quitando las de status ocultos para el rol.
  const filterByVisibleStatus = <T extends Property>(list: T[]): T[] =>
    list.filter((prop) => {
      const st = findStatusOf(prop);
      return st ? isStatusVisibleForRole(st.id) : true;
    });

  // ⭐ MI HISTORIAL (features/houses/components/MyHistoryModal).
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // ⭐ PERF: este componente solo se monta en la página completa de Houses;
  //    en modo 'modals-only' (encima de Quality Check, Payroll, Invoices,
  //    Owner/Manager…) no se filtran ni agrupan las ~3,600 casas.
  const propertiesWithScope = useMemo(
    () =>
      properties.filter((prop) => {
        if (userScope !== "All") {
          if (!currentUser) return false;
          const isAssigned = prop.assignedWorkers?.includes(currentUser.id);
          const isSameTeam =
            currentUser.teamId && prop.teamId === currentUser.teamId;
          if (!isAssigned && !isSameTeam) return false;
        }

        // ⭐ Las casas SIN status asignado viven en su propio modulo ("No
        //    Status") y no aparecen en Overview ni en el tablero.
        //
        //    IMPORTANTE (bug de casas "desaparecidas"): esta exclusion SOLO se
        //    aplica si el catalogo de statuses ya cargo. Mientras `statuses`
        //    esta vacio —primer render, o si el onSnapshot falla por permisos—
        //    ninguna casa resuelve su status y la vista entera se vaciaba.
        //    Ante la duda se MUESTRA la casa: es preferible ver una casa de mas
        //    que perder trabajo agendado.
        if (statuses.length > 0 && !findStatusOf(prop)) return false;

        if (!isSuperAdmin && allowedStatusIds.length > 0) {
          const matchById = allowedStatusIds.includes(prop.statusId);
          const propStatus = findStatusOf(prop);
          const matchByName = propStatus
            ? allowedStatusIds.includes(propStatus.id)
            : false;
          if (!matchById && !matchByName) return false;
        }

        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [properties, userScope, currentUser, isSuperAdmin, allowedStatusKey, statusIndex, statuses.length],
  );
  // Casas por statusId (tarjetas KPI del tablero), en un solo recorrido.
  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    propertiesWithScope.forEach((p) => m.set(String(p.statusId), (m.get(String(p.statusId)) || 0) + 1));
    return m;
  }, [propertiesWithScope]);

  const uniqueHouses = useMemo(
    () =>
      Array.from(
        new Set(
          propertiesWithScope
            .filter((p) => !isHiddenPipelineStatus(p))
            .map((p) => `${p.client || "Unknown"}|${p.address || "Unknown"}`),
        ),
      )
        .map((str) => {
          const [client, address] = str.split("|");
          return { client, address };
        })
        .sort((a, b) => a.client.localeCompare(b.client)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [propertiesWithScope, statusIndex],
  );

  // ⭐ Filtros compartidos (status, casa, invoice, prioridad, búsqueda) para
  //    la tabla y el tablero.
  const passesListFilters = (p: Property) => {
    const st = findStatusOf(p);

    let passStatus = true;
    if (activeFilter === NO_STATUS_FILTER) passStatus = !st;
    else if (activeFilter !== "All") passStatus = st?.name === activeFilter;

    let passHouse = true;
    if (houseFilter !== "All")
      passHouse =
        `${p.client || "Unknown"}|${p.address || "Unknown"}` === houseFilter;

    let passInvoice = true;
    if (invoiceFilter !== "All")
      passInvoice = p.invoiceStatus === invoiceFilter;

    let passStatusFilter = true;
    if (statusFilter !== "All") {
      const stObj = statuses.find((stt) => stt.id === statusFilter);
      passStatusFilter =
        p.statusId === statusFilter || (!!stObj && p.statusId === stObj.name);
    }

    let passPriority = true;
    if (priorityFilter !== "All") {
      const prObj = priorities.find((pp) => pp.id === priorityFilter);
      passPriority =
        p.priorityId === priorityFilter ||
        (!!prObj && p.priorityId === prObj.name);
    }

    let passSearch = true;
    if (deferredSearch.trim()) {
      const q = deferredSearch.toLowerCase().trim();
      const addressMatch = (p.address || "").toLowerCase().includes(q);
      const clientName = getClientName(p.client);
      const clientMatch = clientName.toLowerCase().includes(q);
      // ⭐ Buscar también en las NOTAS: nota general, nota del empleado y
      //    generalNotes (registros importados de AppSheet).
      const pNotes = p as Property & { generalNotes?: string | null };
      const noteMatch = [
        pNotes.note,
        pNotes.employeeNote,
        pNotes.generalNotes,
      ].some((n) =>
        String(n || "")
          .toLowerCase()
          .includes(q),
      );
      // ⭐ El número de unidad/apto también es buscable
      const unitMatch = String(p.unit || "")
        .toLowerCase()
        .includes(q);
      passSearch = addressMatch || clientMatch || noteMatch || unitMatch;
    }

    return (
      passStatus &&
      passHouse &&
      passInvoice &&
      passStatusFilter &&
      passPriority &&
      passSearch
    );
  };

  // ⭐ Orden por fecha (scheduleDate) DESCENDENTE: de la más reciente a la más antigua.
  //    Sin fecha => al final. Tolerante a formatos mixtos (ISO y DD/MM).
  const byDateDesc = (a: Property, b: Property) =>
    dateSortValue(b.scheduleDate) - dateSortValue(a.scheduleDate);

  // ⭐ OVERVIEW UNIFICADO — diseño "Precise Cleaning – Unified Jobs View".
  //    Operaciones, Quality Check, cobro y finanzas en UNA tabla. A diferencia
  //    de la antigua "Daily Jobs", aquí SÍ entran los trabajos en Quality Check
  //    e Invoice (el diseño muestra trabajos completados, pagados, con QC…).
  //    Quedan fuera solo los trabajos SIN status (tienen su módulo propio).
  //    El periodo (Day / Week / Month / Year / Custom) filtra la tabla y define
  //    la agrupación: Week → días, Month → semanas, Year → meses.
  const PERIOD_KEY = "pc.overview.period";
  const [period, setPeriodState] = useState<PeriodState>(() =>
    loadPeriod(PERIOD_KEY, "week"),
  );
  const setPeriod = (p: PeriodState) => {
    setPeriodState(p);
    savePeriod(PERIOD_KEY, p);
  };
  const range = useMemo(() => periodRange(period), [period]);
  // Solo la tabla del Overview (no el tablero) abre los listeners de
  // finanzas y QC.
  const unifiedEnabled = viewMode !== "board";
  const jobFin = useJobFinancials(unifiedEnabled);
  const qcRecords = useQcRecords(unifiedEnabled);
  const recallHouses = useRecallHouses(statuses, unifiedEnabled);

  // Dentro del mismo día, por hora de entrada (agenda del día).
  const timeSortValue = (t?: string) => {
    const s = String(t || "").trim();
    const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!m) return 24 * 60;
    let h = Number(m[1]) % (m[3] ? 12 : 24);
    if (m[3] && /PM/i.test(m[3])) h += 12;
    return h * 60 + Number(m[2]);
  };

  const periodProperties = useMemo(
    () =>
      filterByVisibleStatus(
        propertiesWithScope.filter(
          (p) =>
            !!findStatusOf(p) &&
            passesListFilters(p) &&
            inPeriod(p.scheduleDate, range),
        ),
      ).sort(
        (a, b) =>
          byDateDesc(a, b) || timeSortValue(a.timeIn) - timeSortValue(b.timeIn),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      propertiesWithScope,
      statusIndex,
      range,
      activeFilter,
      houseFilter,
      invoiceFilter,
      statusFilter,
      priorityFilter,
      deferredSearch,
      customersList,
      priorities,
      formConfig,
      currentUser,
      isSuperAdmin,
    ],
  );

  const unifiedGroups = useMemo(
    () =>
      buildUnifiedGroups(periodProperties, range.groupBy, {
        getClientName: (p) => getClientName(p.client),
        getTeam: (p) => {
          const t = p.teamId ? teams.find((tm) => tm.id === p.teamId) : undefined;
          return t ? { name: t.name, color: t.color || "#64748b" } : null;
        },
        getStatusName: (p) => findStatusOf(p)?.name || "",
        getTypeName: (p) => getRelationName(services, p.serviceId, "Regular"),
        getNote: (p) =>
          String(
            p.note || (p as Property & { generalNotes?: string }).generalNotes || "",
          ).trim(),
        qcFor: (p) => qcInfoFor(p.id, p.statusId, statuses, qcRecords.latest),
        calc: jobFin.calc,
        sum: jobFin.sum,
      }),
    // getClientName/findStatusOf dependen de customersList y statusIndex
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodProperties, range.groupBy, teams, services, statuses, qcRecords.latest, jobFin.calc, jobFin.sum, customersList, statusIndex],
  );
  const periodQc = qcCounts(unifiedGroups.flatMap((g) => g.rows.map((r) => r.qc)));

  // Tarjetas (móvil): mismos grupos que la tabla, plegables y por bloques.
  const [cardCollapsed, setCardCollapsed] = useState<Set<string>>(new Set());
  const [cardShown, setCardShown] = useState<Record<string, number>>({});
  type JobEntry =
    | { kind: "group"; group: UnifiedGroup; open: boolean }
    | { kind: "job"; prop: Property }
    | { kind: "more"; key: string; shown: number; total: number };
  const jobEntries: JobEntry[] = unifiedGroups.flatMap((g): JobEntry[] => {
    const open = !cardCollapsed.has(g.key);
    const shown = cardShown[g.key] ?? JOBS_PAGE_SIZE;
    const out: JobEntry[] = [{ kind: "group", group: g, open }];
    if (open) {
      g.rows.slice(0, shown).forEach((r) => out.push({ kind: "job", prop: r.prop }));
      if (g.rows.length > shown)
        out.push({ kind: "more", key: g.key, shown, total: g.rows.length });
    }
    return out;
  });
  const toggleJobGroup = (key: string) =>
    setCardCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const showMoreCards = (key: string) =>
    setCardShown((c) => ({ ...c, [key]: (c[key] ?? JOBS_PAGE_SIZE) + 100 }));

  // ⭐ TABLERO (Pipeline): incluye Quality Check; solo oculta Invoice.
  const boardProperties = useMemo(
    () =>
      filterByVisibleStatus(
        propertiesWithScope
          .filter((p) => !isHiddenPipelineStatus(p, true) && passesListFilters(p))
          .sort(byDateDesc),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      propertiesWithScope,
      statusIndex,
      activeFilter,
      houseFilter,
      invoiceFilter,
      statusFilter,
      priorityFilter,
      deferredSearch,
      customersList,
      priorities,
      formConfig,
      currentUser,
      isSuperAdmin,
    ],
  );

  // ⭐ Los tabs/columnas del dashboard también respetan la visibilidad por rol.
  const dashboardTabs = statuses
    .filter((st) => st.showInDashboard && isStatusVisibleForRole(st.id))
    .sort(
      (a, b) => Number(a.dashboardOrder || 0) - Number(b.dashboardOrder || 0),
    );

  // ⭐ Edición EN LÍNEA desde la tabla del Overview (Team y Billing), con el
  //    mismo cuidado que el status: respeta permisos y "solo lectura" del
  //    campo, deja rastro en la bitácora y actualiza la lista al instante.
  //    No bloquea la lista: el listener muestra el cambio al instante y la
  //    fila queda marcada hasta que el servidor confirma (usePendingById).
  const handleQuickFieldChange = (
    prop: Property,
    field: "teamId" | "invoiceStatus",
    value: string,
  ) => {
    if (isFieldRO(field)) {
      alert("Este campo es de SOLO LECTURA para tu rol.");
      return;
    }
    const before = String(prop[field] || "");
    if (before === value) return;
    const label = (v: string) =>
      field === "teamId"
        ? teams.find((t) => t.id === v)?.name || (v ? v : "Unassigned")
        : v || "(sin status de invoice)";
    runRow(
      prop.id,
      async () => {
        await propertiesService.update(prop.id, field === "teamId" ? { teamId: value } : { invoiceStatus: value });
        logActivity({
          action: "update",
          module: "Houses",
          user: currentUser,
          targetId: prop.id,
          targetLabel: logLabel(prop),
          changes: [{ field, before: label(before), after: label(value) }],
        });
      },
      field === "teamId" ? "Failed to update team." : "Failed to update invoice status.",
    );
  };

  const handleQuickStatusChange = (propertyId: string, newStatusId: string) => {
    // ⭐ Respeta la config "Solo lectura" del campo Job Status para el rol activo:
    //    bloquea TODAS las vías de cambio (pills, banner del detalle y drag del board).
    if (isFieldRO("statusId")) {
      alert("El status del trabajo es de SOLO LECTURA para tu rol.");
      return;
    }
    const prev = properties.find((p) => p.id === propertyId);
    // ⭐ La casa (con el sello de Invoice si aplica) y su status_history en
    //    un solo batch; la bitácora después (features/houses/services/houseStatus.ts).
    runRow(
      propertyId,
      () =>
        changeHouseStatus({ id: propertyId, statusId: prev?.statusId ?? "" }, newStatusId, {
          statuses,
          actor: currentUser,
          source: "houses",
          module: "Houses",
          label: logLabel(prev),
        }),
      "Failed to update job status.",
    );
  };

  const kpiIcons = [Briefcase, Clock, ShieldCheck, AlertTriangle];

  // ⭐ Lista del Overview (tabla y tarjetas con memo): handlers con identidad
  //    fija, así escribir en el formulario de la casa no vuelve a dibujarla.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const rowOpen = useStableCallback((p: Property) => onOpenDetail(p));
  const rowEdit = useStableCallback((p: Property) => onEdit(p));
  const rowDelete = useStableCallback((p: Property) => onDelete(p));
  const rowStatus = useStableCallback(handleQuickStatusChange);
  const rowTeam = useStableCallback((p: Property, v: string) => handleQuickFieldChange(p, "teamId", v));
  const rowBilling = useStableCallback((p: Property, v: string) => handleQuickFieldChange(p, "invoiceStatus", v));
  const rowPhotos = useStableCallback((p: Property, which: "before" | "after") => onPhotosFromCard(p, which));
  const rowEditAllowed = !!canEdit && isVisible("admin") && isElementVisible("btn_editDetails");
  const rowDeleteAllowed = !!canDelete && isVisible("admin") && isElementVisible("btn_deleteProperty");
  const cardPhotos = isVisible("media") && isElementVisible("btn_tabMedia") && isElementVisible("card_photos");
  const statusLocked = !canEdit || !isVisible("workflow") || isFieldRO("statusId");
  const renderRowStatus = useCallback(
    (prop: Property) => (
      <StatusPillSelector
        currentStatusId={prop.statusId}
        statuses={statuses}
        onChange={(newId) => rowStatus(prop.id, newId)}
        disabled={statusLocked}
        onRequestOpen={onRequestStatus}
        modalTitle={getClientName(prop.client)}
        modalSubtitle={prop.address}
      />
    ),
    // getClientName solo cambia con customersList
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statuses, statusLocked, rowStatus, customersList],
  );
  const wasRecall = useCallback(
    (prop: Property) => recallHouses.has(prop.id) || isRecallText(findStatusOf(prop)?.name || prop.statusId),
    // findStatusOf solo cambia con statusIndex
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recallHouses, statusIndex],
  );

  return (
    <>
      {/* DASHBOARD HEADER */}
      <header className="main-header dashboard-header-container hv-header">
        <div className="view-header-title-group">
          <MenuButton onClick={onOpenMenu} />
          <div>
            <h1 className="hv-title">Overview</h1>
            <p className="hv-subtitle">
              {viewMode === "board"
                ? "General operations overview"
                : "Operations, billing & quality in one place"}
            </p>
          </div>
        </div>

        <div className="dashboard-actions-wrapper hv-header-actions">
          {(!isOnline || pendingTotal > 0) && (
            <div
              title={
                isOnline ? "Subiendo fotos pendientes…" : "Sin conexión"
              }
              className={`hv-sync-badge ${isOnline ? "online" : "offline"}`}
            >
              <CloudOff size={14} />{" "}
              {isOnline ? `${pendingTotal} por subir` : "Offline"}
            </div>
          )}

          <div className="search-box-container hv-search-box">
            <Search size={16} color="#9ca3af" />
            <input
              type="text"
              placeholder="Buscar cliente o dirección"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="hv-search-input"
            />
          </div>

          {isElementVisible("btn_myHistory") && (
            <button
              className="hv-btn-history"
              onClick={() => setIsHistoryOpen(true)}
              title="Historial de casas asignadas a mí"
            >
              <Clock size={16} /> Mi historial
            </button>
          )}

          {canAdd && (
              <>
                <button
                  className="add-btn-mobile hv-btn-add"
                  onClick={onNewJob}
                >
                  <Plus size={16} /> New Job
                </button>
                {/* ⭐ Borradores: órdenes que salieron del formulario sin
                    guardarse; se retoman con todos sus campos. */}
                {draftsCount > 0 && (
                  <button
                    onClick={onOpenDrafts}
                    className="hv-drafts-btn"
                  >
                    <FileText size={16} /> Borradores ({draftsCount})
                  </button>
                )}
                {/* ⭐ Reparador de vínculos rotos casa↔cliente */}
                {canEdit && orphanClientGroups.length > 0 && (
                  <button
                    onClick={() => setIsRepairOpen(true)}
                    className="hv-drafts-btn"
                    title="Casas cuyo cliente no se encuentra"
                  >
                    <Wrench size={16} /> Reparar clientes ({orphanClientGroups.length})
                  </button>
                )}
                {/* ⭐ Fechas guardadas en un formato viejo (solo aparece si hay alguna) */}
                {canEdit && (
                  <PropertyDateFixTool
                    properties={properties}
                    getClientName={getClientName}
                    hideWhenClean
                  />
                )}
              </>
            )}
        </div>
      </header>

      <HistoryWindowNotice />

      {/* ⭐ Overview unificado: barra de periodo + bandas Operations y
          Quality check (diseño "Unified Jobs View"). El tablero Pipeline
          conserva sus KPIs de siempre. */}
      {viewMode !== "board" && (
        <>
          <PeriodBar
            period={period}
            onChange={setPeriod}
            extra={
                    <div className="property-select-container">
                      <button
                        onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
                        className="hv-btn-filters"
                      >
                        <Filter size={16} /> Filters{" "}
                        {(houseFilter !== "All" ||
                          invoiceFilter !== "All" ||
                          statusFilter !== "All" ||
                          priorityFilter !== "All") && (
                            <span className="hv-filter-badge-dot">!</span>
                          )}
                      </button>
                      {isFilterMenuOpen && (
                        <div className="hv-filter-dropdown">
                          <div>
                            <label className="hv-filter-field-label">
                              Status
                            </label>
                            <select
                              className="hv-filter-select"
                              value={statusFilter}
                              onChange={(e) =>
                                setStatusFilter(e.target.value)
                              }
                            >
                              <option value="All">All Statuses</option>
                              {statuses.map((st) => (
                                <option key={st.id} value={st.id}>
                                  {st.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="hv-filter-field-label">
                              Priority
                            </label>
                            <select
                              className="hv-filter-select"
                              value={priorityFilter}
                              onChange={(e) =>
                                setPriorityFilter(e.target.value)
                              }
                            >
                              <option value="All">All Priorities</option>
                              {priorities.map((pr) => (
                                <option key={pr.id} value={pr.id}>
                                  {pr.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="hv-filter-field-label">
                              Property
                            </label>
                            <select
                              className="hv-filter-select"
                              value={houseFilter}
                              onChange={(e) => setHouseFilter(e.target.value)}
                            >
                              <option value="All">All Properties</option>
                              {uniqueHouses.map((h) => (
                                <option
                                  key={`${h.client}|${h.address}`}
                                  value={`${h.client}|${h.address}`}
                                >
                                  {getClientName(h.client)} - {h.address}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="hv-filter-field-label">
                              Invoice Status
                            </label>
                            <select
                              className="hv-filter-select"
                              value={invoiceFilter}
                              onChange={(e) =>
                                setInvoiceFilter(e.target.value)
                              }
                            >
                              <option value="All">All Invoices</option>
                              <option value="Pre-Paid">Pre-Paid</option>
                              <option value="Pending">Pending</option>
                              <option value="Paid">Paid</option>
                              <option value="Needs Invoice">
                                Needs Invoice
                              </option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
            }
          />
          <KpiGrid
            label="Indicadores"
            groups={[
              ...(isElementVisible("card_kpis")
                ? [
                    {
                      key: "ops",
                      title: "Operations",
                      color: "#1d3fcf",
                      tiles: (dashboardTabs.length > 0
                        ? dashboardTabs
                        : statuses.filter((st) => isStatusVisibleForRole(st.id)).slice(0, 4)
                      ).map((status) => {
                        const isActive = activeFilter === status.name;
                        return {
                          key: status.id,
                          label: status.name,
                          value: isLoading
                            ? "…"
                            : propertiesWithScope
                                .filter((p) => p.statusId === status.id || p.statusId === status.name)
                                .length.toLocaleString("en-US"),
                          sub: isActive ? "Filtering ✓" : "jobs now",
                          active: isActive,
                          onClick: () => setActiveFilter(isActive ? "All" : status.name),
                          title: isActive ? "Click para limpiar filtro" : `Filtrar por ${status.name}`,
                        };
                      }),
                    },
                  ]
                : []),
              {
                key: "qc",
                title: "Quality check",
                color: "#047857",
                tiles: [
                  { key: "passed", label: "Passed", value: String(periodQc.passed), tone: "good" as const, sub: "this period" },
                  { key: "failed", label: "Re-clean", value: String(periodQc.failed), tone: "bad" as const, sub: "this period" },
                  { key: "pending", label: "QC pending", value: String(periodQc.pending), tone: "warn" as const, sub: "this period" },
                ],
              },
            ]}
          />
        </>
      )}

      {viewMode === "board" && isElementVisible("card_kpis") && (
        <div className="dash-grid hv-kpi-grid">
          {isLoading ? (
            <div className="hv-loading-text">Loading metrics...</div>
          ) : (
            statuses
              .filter((s) => isStatusVisibleForRole(s.id))
              .slice(0, 4)
              .map((status, index) => {
                const Icon = kpiIcons[index % kpiIcons.length];
                const count =
                  (statusCounts.get(String(status.id)) || 0) +
                  (status.name !== status.id ? statusCounts.get(String(status.name)) || 0 : 0);
                const isActive = activeFilter === status.name;
                return (
                  <div
                    className={`hv-kpi-card${isActive ? " active" : ""}`}
                    style={
                      {
                        "--kpi-color": status.color,
                        "--kpi-color-30": `${status.color}30`,
                        "--kpi-icon-bg": `${status.color}15`,
                      } as CSSProperties
                    }
                    key={status.id}
                    onClick={() =>
                      setActiveFilter(isActive ? "All" : status.name)
                    }
                    title={
                      isActive
                        ? "Click para limpiar filtro"
                        : `Filtrar trabajos por ${status.name}`
                    }
                  >
                    <div className="hv-kpi-icon-box">
                      <Icon size={18} />
                    </div>
                    <div className="hv-min-w-0">
                      <div className="hv-kpi-label">{status.name}</div>
                      <div className="hv-kpi-count">{count}</div>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      )}

      {viewMode === "board" ? (
        /* ⭐ showOfficeNote: las notas internas solo llegan al tablero si el rol
           puede verlas. Se decide AQUI, no dentro de la tarjeta, para que el dato
           no se pase siquiera al componente cuando no hay permiso. */
        <PipelineBoardView
          properties={boardProperties}
          statuses={statuses.filter((s) => isStatusVisibleForRole(s.id))}
          teams={teams}
          priorities={priorities}
          getClientName={getClientName}
          onOpenDetail={onOpenDetail}
          onQuickStatusChange={handleQuickStatusChange}
          canEdit={!!canEdit}
          showOfficeNote={canSeeOfficeNotes()}
        />
      ) : (
        <>

          {/* ⭐ Tabla unificada (escritorio) o tarjetas (móvil): solo se
              dibuja una de las dos (useMediaQuery, mismo corte que el CSS). */}
          <div className="hv-unified">
            {!isPhone ? (
            <div className="hv-unified-table">
              <UnifiedJobsTable
                groups={unifiedGroups}
                loading={isLoading}
                emptyText="No jobs in this period. Use ← → or Today to move the period."
                renderStatus={renderRowStatus}
                onOpen={rowOpen}
                onOpenQc={rowOpen}
                onEdit={rowEditAllowed ? rowEdit : undefined}
                onDelete={rowDeleteAllowed ? rowDelete : undefined}
                teams={teams}
                onTeamChange={canEdit && !isFieldRO("teamId") ? rowTeam : undefined}
                onBillingChange={canEdit && !isFieldRO("invoiceStatus") ? rowBilling : undefined}
                wasRecall={wasRecall}
                pendingIds={pendingRows}
              />
            </div>
            ) : (
            /* ====== VISTA TARJETAS (MÓVIL - estilo AppSheet) ====== */
            <div className="hv-panel-card hv-unified-cards">
                <div className="jobs-cards-wrap">
                  {isLoading ? (
                    <div className="hv-cards-empty">Loading database...</div>
                  ) : periodProperties.length === 0 ? (
                    <div className="hv-cards-empty italic">
                      No jobs in this period.
                    </div>
                  ) : (
                    jobEntries.map((entry) => {
                      if (entry.kind === "group") {
                        return (
                          <button
                            type="button"
                            key={`g-${entry.group.key}`}
                            className="hv-cgroup"
                            onClick={() => toggleJobGroup(entry.group.key)}
                          >
                            <span className="hv-cgroup-title">
                              <ChevronRight
                                size={16}
                                className={`hv-cgroup-chevron${entry.open ? " open" : ""}`}
                              />
                              {entry.group.label}
                              {entry.group.detail && (
                                <span className="hv-cgroup-detail">
                                  {entry.group.detail}
                                </span>
                              )}
                            </span>
                            <span className="hv-cgroup-count">
                              {entry.group.rows.length}
                            </span>
                          </button>
                        );
                      }
                      if (entry.kind === "more") {
                        return (
                          <button
                            key={`m-${entry.key}`}
                            className="hv-cgroup-more"
                            onClick={() => showMoreCards(entry.key)}
                          >
                            Mostrar más — viendo {entry.shown} de {entry.total}
                          </button>
                        );
                      }
                      const prop = entry.prop;
                      return (
                        <JobCard
                          key={prop.id}
                          prop={prop}
                          clientName={getClientName(prop.client)}
                          teams={teams}
                          priorities={priorities}
                          statuses={statuses}
                          statusLocked={statusLocked}
                          pending={pendingRows.has(prop.id)}
                          showPhotos={cardPhotos && photosUnlockedFor(prop)}
                          onOpen={rowOpen}
                          onStatusChange={rowStatus}
                          onRequestStatus={onRequestStatus}
                          onPhotos={rowPhotos}
                          onEdit={rowEditAllowed ? rowEdit : undefined}
                          onDelete={rowDeleteAllowed ? rowDelete : undefined}
                        />
                      );
                    })
                  )}
                </div>
            </div>
            )}
          </div>
        </>
      )}

      {/* ⭐ MI HISTORIAL — casas asignadas al usuario (habilitado por rol) */}
      {isHistoryOpen && (
        <MyHistoryModal
          properties={properties}
          currentUser={currentUser}
          statuses={statuses}
          getClientName={getClientName}
          onOpenHouse={(p) => {
            setIsHistoryOpen(false);
            onOpenDetail(p);
          }}
          onClose={() => setIsHistoryOpen(false)}
        />
      )}

      {/* --- MODAL: REPARADOR DE VÍNCULOS CASA↔CLIENTE --- */}
      {isRepairOpen && (
        <RepairClientsModal
          groups={orphanClientGroups}
          properties={properties}
          customers={customersList}
          currentUser={currentUser}
          onClose={() => setIsRepairOpen(false)}
        />
      )}
    </>
  );
}
