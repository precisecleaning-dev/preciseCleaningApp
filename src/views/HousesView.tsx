import { useState, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Search,
  MapPin,
  Plus,
  X,
  Edit2,
  Trash2,
  Activity,
  FileText,
  CalendarDays,
  Clock,
  User,
  Wrench,
  Hash,
  Flag,
  Users,
  StickyNote,
  PenTool,
  ChevronDown,
  Briefcase,
  ShieldCheck,
  AlertTriangle,
  Image as ImageIcon,
  Copy,
  CheckSquare,
  DollarSign,
  Filter,
  CheckCircle,
  Calendar,
  Percent,
  PlayCircle,
  BarChart3,
  FileImage,
  Save,
  XCircle,
  Layers,
  Settings,
  Receipt,
  CalendarClock,
  CloudOff,
  Camera,
  Menu,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";

import type {
  Property as BaseProperty,
  Status,
  Team,
  Priority,
  Service,
  Customer,
  SystemUser,
  Role,
  PayrollRecord,
  Tax,
} from "../types/index";

import { propertiesService } from "../services/propertiesService";
import { storageService } from "../services/storageService";
import { payrollService } from "../services/payrollService";
import { DEFAULT_PHOTO_CONFIG } from "../services/photoConfigService";
import type { PhotoConfig } from "../services/photoConfigService";
import { compressImage } from "../utils/imageCompression";
import { db } from "../config/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
  getDocs,
  setDoc,
  getDoc,
} from "firebase/firestore";
import { formatDate, dateSortValue } from "../utils/dateFormat";
import { escapeHtml } from "../utils/escapeHtml";
import { getRelationName, getRelationColor } from "../utils/relations";
import StatusChangeModal, {
  type StatusModalConfig,
} from "../components/StatusChangeModal";

import PhotoSection from "../components/PhotoSection";
import PipelineBoardView from "../components/PipelineBoardView";
import {
  enqueuePhotos,
  getAllPending,
  getPendingByProperty,
  removePending,
  countPending,
  makePendingId,
  type PendingPhoto,
} from "../utils/offlinePhotoQueue";
import "./HousesView.css";

type Property = BaseProperty & {
  beforePhotosExcluded?: string[]; // URLs que NO van al PDF
  afterPhotosExcluded?: string[];
  dateOfIssue?: string; // ⭐ Fecha de emisión
  dueDate?: string; // ⭐ Fecha de vencimiento
};

interface ServiceRecord {
  id?: string;
  propertyId: string;
  serviceId: string;
  quantity: number;
  price: number;
  subtotal: number;
  applyTax: "Yes" | "No";
  minusTax: "Yes" | "No";
  taxPercentage: number;
  taxAmount: number;
  total: number;
  totalMinusTax: number; // ⭐ AppSheet "Total Minus Tax"
  notes: string;
  createdAt?: string;
}

// settings_products no tiene un tipo compartido en types/index.ts todavía.
interface ProductRecord {
  id: string;
  name: string;
  price?: number;
  color?: string;
}

const collectionMap: Record<string, string> = {
  team: "settings_teams",
  priority: "settings_priorities",
  status: "settings_statuses",
  service: "settings_services",
  tax: "settings_tax",
};

type ConfigurableElement = { id: string; label: string; section: string };

const CONFIGURABLE_FIELDS: ConfigurableElement[] = [
  { id: "client", label: "Client", section: "General Info" },
  { id: "address", label: "Address", section: "General Info" },
  { id: "receiveDate", label: "Receive Date", section: "Schedule" },
  { id: "scheduleDate", label: "Schedule Date", section: "Schedule" },
  { id: "dateOfIssue", label: "Date of Issue", section: "Schedule" },
  { id: "dueDate", label: "Due Date", section: "Schedule" },
  { id: "timeIn", label: "Time In", section: "Schedule" },
  { id: "timeOut", label: "Time Out", section: "Schedule" },
  { id: "serviceId", label: "Service", section: "Job Specs" },
  { id: "priorityId", label: "Priority", section: "Job Specs" },
  { id: "rooms", label: "Rooms", section: "Job Specs" },
  { id: "bathrooms", label: "Bathrooms", section: "Job Specs" },
  { id: "statusId", label: "Status", section: "Status & Assignment" },
  {
    id: "invoiceStatus",
    label: "Invoice Status",
    section: "Status & Assignment",
  },
  { id: "teamId", label: "Team", section: "Status & Assignment" },
  {
    id: "assignedWorkers",
    label: "Assigned Workers",
    section: "Status & Assignment",
  },
  { id: "note", label: "General Note", section: "Notes" },
  { id: "employeeNote", label: "Employee's Note", section: "Notes" },
  {
    id: "card_billedServices",
    label: "Billed Services (entire section)",
    section: "Sections",
  },
  { id: "card_photos", label: "Photos (entire section)", section: "Sections" },
  { id: "card_workLog", label: "Work Log (detail view)", section: "Sections" },
];

const CONFIGURABLE_BUTTONS: ConfigurableElement[] = [
  { id: "btn_sync", label: "Sync (Google Calendar)", section: "Workflow" },
  { id: "btn_startJob", label: "Start Job", section: "Workflow" },
  { id: "btn_markFinished", label: "Mark Finished", section: "Workflow" },
  { id: "btn_pay", label: "Pay", section: "Financial" },
  { id: "btn_duplicate", label: "Duplicate", section: "Admin" },
  { id: "btn_editDetails", label: "Edit Details", section: "Admin" },
  { id: "btn_deleteProperty", label: "Delete Property", section: "Admin" },
  { id: "btn_exportPdf", label: "Export PDF", section: "Media" },
  { id: "btn_uploadPhoto", label: "Upload Photo (Cargar)", section: "Media" },
  { id: "btn_takePhoto", label: "Take Photo (Cámara)", section: "Media" },
  {
    id: "btn_tabFinancials",
    label: "Financials & Billing Tab",
    section: "Tabs",
  },
  { id: "btn_tabMedia", label: "Notes & Photos Tab", section: "Tabs" },
];

type FormVisibilityConfig = {
  visibility: Record<string, string[]>;
  // ⭐ Roles para los que el CAMPO es de SOLO LECTURA (lo ven pero no lo editan).
  //    Solo aplica a los campos del formulario, no a botones/tabs.
  readOnly?: Record<string, string[]>;
};

const DEFAULT_FORM_CONFIG: FormVisibilityConfig = {
  visibility: {},
  readOnly: {},
};

interface SelectOption {
  id: string;
  name: string;
  color?: string;
}

function SearchableSelect<T extends SelectOption>({
  options,
  value,
  onChange,
  placeholder,
  icon: Icon,
  returnKey = "id" as keyof T,
  disabled = false,
}: {
  options: T[];
  value?: string;
  onChange: (value: string) => void;
  placeholder: string;
  icon: LucideIcon;
  returnKey?: keyof T;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = options.find((o) => String(o[returnKey]) === String(value));
  const displayValue = isOpen ? search : selected ? selected.name : value || "";

  const filteredOptions = options.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div
      tabIndex={0}
      onBlur={() => setTimeout(() => setIsOpen(false), 200)}
      className={`hv-searchsel-wrap${disabled ? " disabled" : ""}`}
    >
      <div className="hv-searchsel-trigger">
        <Icon size={16} className="hv-searchsel-icon" />
        <input
          className="hv-searchsel-input"
          placeholder={placeholder}
          value={displayValue}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onClick={() => {
            if (disabled) return;
            setIsOpen(true);
            setSearch("");
          }}
          disabled={disabled}
        />
        <ChevronDown
          size={16}
          color="#9ca3af"
          className={`hv-select-chevron clickable${isOpen ? " open" : ""}`}
          onClick={() => {
            if (!disabled) setIsOpen(!isOpen);
          }}
        />
      </div>
      {isOpen && (
        <div className="hv-searchsel-dropdown">
          {filteredOptions.length === 0 ? (
            <div className="hv-searchsel-empty">No results found</div>
          ) : null}
          {filteredOptions.map((o) => (
            <div
              key={o.id}
              className="hv-searchsel-option"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(String(o[returnKey] ?? o.id));
                setIsOpen(false);
                setSearch("");
              }}
            >
              {o.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// StatusPillSelector: muestra el estado actual como "badge" con el color del estado.
// Al tocarlo YA NO abre una lista desplegable: solicita abrir el modal central de
// selección de estado (StatusChangeModal), que se ve igual de claro en móvil y escritorio.
// Variantes: normal (tabla), `fullWidth` (tarjeta móvil) y `large` (detalle de la casa).
const StatusPillSelector = ({
  currentStatusId,
  statuses,
  onChange,
  disabled,
  fullWidth = false,
  large = false,
  onRequestOpen,
  modalTitle,
  modalSubtitle,
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
  const safeValue = String(currentStatusId || "")
    .toLowerCase()
    .trim();
  const status = statuses.find(
    (s) =>
      String(s.id).toLowerCase().trim() === safeValue ||
      String(s.name).toLowerCase().trim() === safeValue,
  );

  const pointColor = status ? status.color : "#64748b";
  const text = status ? status.name : "Unassigned";
  const block = fullWidth || large;

  const handleOpen = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || !onRequestOpen) return;
    onRequestOpen({
      currentId: currentStatusId,
      onSelect: onChange,
      title: modalTitle,
      subtitle: modalSubtitle,
    });
  };

  const pillVars = {
    "--pill-bg": large ? `${pointColor}12` : `${pointColor}14`,
    "--pill-border": large ? pointColor : `${pointColor}40`,
    "--pill-text": large ? pointColor : "#1e293b",
    "--pill-shadow": `${pointColor}26`,
    "--dot-color": pointColor,
    "--dot-ring": `${pointColor}22`,
  } as CSSProperties;

  return (
    <div className={`hv-statuspill-outer${block ? " block" : ""}`}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleOpen(e);
        }}
        className={`hv-statuspill${large ? " large" : fullWidth ? " full" : ""}${disabled ? " disabled" : ""}`}
        style={pillVars}
        title={disabled ? undefined : "Cambiar estado"}
      >
        <span className={`hv-statuspill-label-wrap${large ? " large" : ""}`}>
          <span className={`hv-statuspill-dot${large ? " large" : ""}`}></span>
          <span className="hv-statuspill-text">{text}</span>
        </span>
        <ChevronDown
          size={large ? 22 : fullWidth ? 16 : 14}
          color={large ? pointColor : "#94a3b8"}
          className="hv-shrink-0"
        />
      </div>
    </div>
  );
};

const formatDateTime = (isoString?: string | null) => {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  // ⭐ Unificado a MM/DD/YYYY, h:mm AM/PM
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
};

interface HousesViewProps {
  onOpenMenu: () => void;
  properties: Property[];
  setProperties: React.Dispatch<React.SetStateAction<Property[]>>;
  currentUser?: SystemUser | null;
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
  roles?: Role[];
  viewMode?: "table" | "board";
  // ⭐ Apertura externa (p. ej. desde Quality Check):
  houseToOpenDetail?: Property | null; // abre el modal de DETALLE de esta casa
  clearHouseToOpenDetail?: () => void;
  houseToOpenEdit?: Property | null; // abre el FORMULARIO de edición de esta casa
  clearHouseToOpenEdit?: () => void;
  // ⭐ 'modals-only': no dibuja la página (header/tabla/tablero), solo los modales.
  //    Permite abrir el detalle/edición encima de OTRA vista (p. ej. Quality Check)
  //    sin sacar al usuario de donde está.
  renderMode?: "full" | "modals-only";
}

type DetailTab = "overview" | "financials" | "media";

export default function HousesView({
  onOpenMenu,
  properties,
  setProperties,
  currentUser,
  activeRole,
  isSuperAdmin,
  roles = [],
  viewMode = "table",
  houseToOpenDetail,
  clearHouseToOpenDetail,
  houseToOpenEdit,
  clearHouseToOpenEdit,
  renderMode = "full",
}: HousesViewProps) {
  const [activeFilter, setActiveFilter] = useState("All");
  const [houseFilter, setHouseFilter] = useState("All");
  const [invoiceFilter, setInvoiceFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("All");

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState<Property | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>("overview");

  // Configuración del modal central de cambio de estado (null = cerrado).
  const [statusModal, setStatusModal] = useState<StatusModalConfig | null>(
    null,
  );

  const [statuses, setStatuses] = useState<Status[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]); // ⭐ settings_products (fuente de serviceId)
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<SystemUser[]>([]);

  const [rolesList, setRolesList] = useState<Role[]>(roles);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAssigningWorker, setIsAssigningWorker] = useState(false);
  const [isAssigningWorkerForm, setIsAssigningWorkerForm] = useState(false);
  const [workerSearch, setWorkerSearch] = useState(""); // ⭐ buscador de empleados

  const [formConfig, setFormConfig] =
    useState<FormVisibilityConfig>(DEFAULT_FORM_CONFIG);
  const [isFieldConfigOpen, setIsFieldConfigOpen] = useState(false);
  const [fieldConfigDraft, setFieldConfigDraft] =
    useState<FormVisibilityConfig>(DEFAULT_FORM_CONFIG);
  const [isSavingFieldConfig, setIsSavingFieldConfig] = useState(false);

  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  const [housePayrollRecords, setHousePayrollRecords] = useState<
    PayrollRecord[]
  >([]);
  const [payrollForm, setPayrollForm] = useState<PayrollRecord>({
    propertyId: "",
    date: new Date().toISOString().split("T")[0],
    employeeId: "",
    baseAmount: 0,
    extraAmount: 0,
    extraNote: "",
    discountAmount: 0,
    discountNote: "",
    totalAmount: 0,
  });

  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  // ⭐ Modal para agregar un cliente rápido desde el formulario de casa
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    type: "Residential",
    color: "#3b82f6",
    name: "",
    businessName: "",
    email: "",
    phone: "",
    address: "",
    cityStateZip: "",
  });
  const [isServiceFromForm, setIsServiceFromForm] = useState(false);
  const [houseServices, setHouseServices] = useState<ServiceRecord[]>([]);
  const [formServices, setFormServices] = useState<ServiceRecord[]>([]);
  const [servicesToDelete, setServicesToDelete] = useState<string[]>([]);

  const defaultServiceForm: ServiceRecord = {
    propertyId: "",
    serviceId: "",
    quantity: 1,
    price: 0,
    subtotal: 0,
    applyTax: "Yes",
    minusTax: "No",
    taxPercentage: 0,
    taxAmount: 0,
    total: 0,
    totalMinusTax: 0,
    notes: "",
  };
  const [serviceForm, setServiceForm] =
    useState<ServiceRecord>(defaultServiceForm);

  const [formData, setFormData] = useState<Property>({
    id: "",
    statusId: "",
    invoiceStatus: "Pending",
    receiveDate: "",
    scheduleDate: "",
    client: "",
    note: "",
    address: "",
    employeeNote: "",
    serviceId: "",
    rooms: "1",
    bathrooms: "1",
    priorityId: "",
    teamId: "",
    timeIn: "",
    timeOut: "",
    dateOfIssue: "",
    dueDate: "",
    beforePhotos: [],
    afterPhotos: [],
    assignedWorkers: [],
  });
  // ⭐ Mapa de la dirección: se actualiza con debounce mientras escribes.
  const [mapAddress, setMapAddress] = useState("");
  useEffect(() => {
    const addr = (formData.address || "").trim();
    if (addr.length < 6) {
      setMapAddress("");
      return;
    }
    const t = setTimeout(() => setMapAddress(addr), 900);
    return () => clearTimeout(t);
  }, [formData.address]);

  const [beforePhotoURLs, setBeforePhotoURLs] = useState<string[]>([]);
  const [afterPhotoURLs, setAfterPhotoURLs] = useState<string[]>([]);
  const [beforeFiles, setBeforeFiles] = useState<File[]>([]);
  const [afterFiles, setAfterFiles] = useState<File[]>([]);

  const [beforeExcluded, setBeforeExcluded] = useState<string[]>([]);
  const [afterExcluded, setAfterExcluded] = useState<string[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingForHouse, setPendingForHouse] = useState<{
    before: number;
    after: number;
  }>({ before: 0, after: 0 });

  const [photoConfig, setPhotoConfig] =
    useState<PhotoConfig>(DEFAULT_PHOTO_CONFIG);
  const [isCompressing, setIsCompressing] = useState(false);

  // ⭐ CÁMARA RÁPIDA (ráfaga): se abre una vez y permite tomar varias fotos
  //    seguidas sin cerrarse. Cada toma se agrega a Before o After.
  const [cameraOpen, setCameraOpen] = useState<null | "before" | "after">(null);
  const [burstCount, setBurstCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let active = true;
    const start = async () => {
      if (!cameraOpen) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e) {
        console.error("No se pudo abrir la cámara:", e);
        alert(
          'No se pudo abrir la cámara. Revisa los permisos del navegador o usa "Cargar/Galería".',
        );
        setCameraOpen(null);
      }
    };
    start();
    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen]);

  const openBurstCamera = (type: "before" | "after") => {
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
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", 0.9),
    );
    if (!blob) return;
    const file = new File([blob], `foto-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });
    // Reutiliza el mismo flujo (compresión + preview + cola offline al guardar)
    await addPhotoFiles([file], cameraOpen);
    setBurstCount((c) => c + 1);
  };

  const canEdit =
    isSuperAdmin ||
    activeRole?.permissions?.find((p) => p.module === "Houses")?.canEdit;
  const canDelete =
    isSuperAdmin ||
    activeRole?.permissions?.find((p) => p.module === "Houses")?.canDelete;

  // ⭐ Total Minus Tax para registros que aún no lo tengan guardado (legacy/importados)
  const recordTotalMinusTax = (r: ServiceRecord): number => {
    if (typeof r?.totalMinusTax === "number") return r.totalMinusTax;
    const subtotal = Number(r?.subtotal) || 0;
    const taxAmount = Number(r?.taxAmount) || 0;
    if (r?.minusTax === "Yes" && r?.applyTax === "No")
      return subtotal - taxAmount;
    if (r?.applyTax === "Yes" && r?.minusTax === "No")
      return subtotal + taxAmount;
    return subtotal;
  };

  const getClientName = (clientIdOrName?: string | null) => {
    if (!clientIdOrName) return "Unknown";
    return getRelationName(
      customersList,
      clientIdOrName,
      String(clientIdOrName),
    );
  };

  // ⭐ Resuelve el nombre del serviceId desde settings_products (con respaldo a settings_services)
  const getServiceName = (serviceId?: string | null): string => {
    if (!serviceId) return "Unknown";
    const safe = String(serviceId).toLowerCase().trim();
    const inProducts = products.find(
      (p) =>
        String(p.id).toLowerCase().trim() === safe ||
        String(p.name).toLowerCase().trim() === safe,
    );
    if (inProducts) return inProducts.name;
    const inServices = services.find(
      (c) =>
        String(c.id).toLowerCase().trim() === safe ||
        String(c.name).toLowerCase().trim() === safe,
    );
    return inServices ? inServices.name : "Unknown";
  };

  // Estados que NO se muestran en las listas. `allowQC=true` (tablero Pipeline)
  // solo oculta Invoice, para que Quality Check SÍ aparezca en el tablero.
  const isHiddenPipelineStatus = (p: Property, allowQC = false) => {
    const st = statuses.find(
      (s) =>
        String(s.id) === String(p.statusId) ||
        String(s.name) === String(p.statusId),
    );
    const name = String(st?.name || p.statusId || "")
      .toLowerCase()
      .trim();
    if (name === "invoice") return true;
    if (allowQC) return false;
    return (
      name === "qc" ||
      name.includes("quality check") ||
      name.includes("quality-check")
    );
  };

  const refreshPendingCounts = async () => {
    try {
      setPendingTotal(await countPending());
      const hid = selectedHouse?.id || formData?.id;
      if (hid) {
        const list = await getPendingByProperty(hid);
        setPendingForHouse({
          before: list.filter((p) => p.type === "before").length,
          after: list.filter((p) => p.type === "after").length,
        });
      } else {
        setPendingForHouse({ before: 0, after: 0 });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const syncPendingPhotos = async () => {
    if (!navigator.onLine) return;
    let pending: PendingPhoto[] = [];
    try {
      pending = await getAllPending();
    } catch {
      return;
    }
    if (pending.length === 0) return;
    const groups = new Map<string, PendingPhoto[]>();
    pending.forEach((p) => {
      const k = `${p.propertyId}__${p.type}`;
      groups.set(k, [...(groups.get(k) || []), p]);
    });
    for (const [, items] of groups) {
      const { propertyId, type, clientName, address } = items[0];
      try {
        const files = items.map(
          (it) =>
            new File([it.blob], it.fileName, {
              type: it.blob.type || "image/jpeg",
            }),
        );
        const urls = await storageService.uploadMultiplePropertyPhotos(
          files,
          clientName,
          address,
          type,
        );
        const snap = await getDoc(doc(db, "properties", propertyId));
        const data = (snap.exists() ? snap.data() : {}) as {
          beforePhotos?: string[];
          afterPhotos?: string[];
        };
        const field = type === "before" ? "beforePhotos" : "afterPhotos";
        const merged = [...(data[field] || []), ...urls];
        await updateDoc(doc(db, "properties", propertyId), { [field]: merged });
        for (const it of items) await removePending(it.id);
      } catch (err) {
        console.error("Error sincronizando fotos pendientes:", err);
      }
    }
    await refreshPendingCounts();
  };

  const uploadOrQueue = async (
    files: File[],
    clientName: string,
    address: string,
    type: "before" | "after",
    propertyId: string,
  ): Promise<{ urls: string[]; queued: number }> => {
    if (files.length === 0) return { urls: [], queued: 0 };
    if (navigator.onLine) {
      try {
        const urls = await storageService.uploadMultiplePropertyPhotos(
          files,
          clientName,
          address,
          type,
        );
        return { urls, queued: 0 };
      } catch (e) {
        console.error("Subida online falló, se encola:", e);
      }
    }
    const entries: PendingPhoto[] = files.map((f) => ({
      id: makePendingId(),
      propertyId,
      clientName,
      address,
      type,
      blob: f,
      fileName: f.name || `${type}-${Date.now()}.jpg`,
      inReport: true,
      createdAt: Date.now(),
    }));
    await enqueuePhotos(entries);
    return { urls: [], queued: entries.length };
  };

  const addPhotoFiles = async (
    files: FileList | File[] | null,
    type: "before" | "after",
  ) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    setIsCompressing(true);
    try {
      const compressed = await Promise.all(
        arr.map((f) =>
          compressImage(f, {
            quality: photoConfig.compressionQuality,
            maxWidth: photoConfig.maxImageWidth,
            maxSizeMB: photoConfig.maxSizeMB,
          }),
        ),
      );
      const fileUrls = compressed.map((f) => URL.createObjectURL(f));
      if (type === "before") {
        setBeforeFiles((p) => [...p, ...compressed]);
        setBeforePhotoURLs((p) => [...p, ...fileUrls]);
      } else {
        setAfterFiles((p) => [...p, ...compressed]);
        setAfterPhotoURLs((p) => [...p, ...fileUrls]);
      }
    } catch (e) {
      console.error(e);
      alert("Error al procesar las imágenes. Intenta de nuevo.");
    } finally {
      setIsCompressing(false);
    }
  };

  const toggleReportPhoto = (url: string, type: "before" | "after") => {
    const setter = type === "before" ? setBeforeExcluded : setAfterExcluded;
    setter((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url],
    );
  };

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      syncPendingPhotos();
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    refreshPendingCounts();
    if (navigator.onLine) syncPendingPhotos();
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
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

    unsubscribes.push(
      onSnapshot(
        collection(db, "properties"),
        (snap) => {
          const data = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as Property[];
          setProperties(data);
          markLoaded("properties");
        },
        (err) => {
          console.error("Error Properties:", err);
          markLoaded("properties");
        },
      ),
    );

    unsubscribes.push(
      onSnapshot(
        collection(db, collectionMap.status),
        (snap) => {
          const data = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as Status[];
          setStatuses(data.sort((a, b) => Number(a.order) - Number(b.order)));
          markLoaded("statuses");
        },
        (err) => {
          console.error("Error Statuses:", err);
          markLoaded("statuses");
        },
      ),
    );

    unsubscribes.push(
      onSnapshot(
        collection(db, collectionMap.team),
        (snap) => {
          const data = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as Team[];
          setTeams(data);
          markLoaded("teams");
        },
        (err) => {
          console.error("Error Teams:", err);
          markLoaded("teams");
        },
      ),
    );

    unsubscribes.push(
      onSnapshot(
        collection(db, collectionMap.priority),
        (snap) => {
          const data = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as Priority[];
          setPriorities(data);
          markLoaded("priorities");
        },
        (err) => {
          console.error("Error Priorities:", err);
          markLoaded("priorities");
        },
      ),
    );

    unsubscribes.push(
      onSnapshot(
        collection(db, collectionMap.service),
        (snap) => {
          const data = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as Service[];
          setServices(data);
          markLoaded("services");
        },
        (err) => {
          console.error("Error Services:", err);
          markLoaded("services");
        },
      ),
    );

    // ⭐ Catálogo de productos (settings_products): fuente de serviceId en Billed Services
    unsubscribes.push(
      onSnapshot(
        collection(db, "settings_products"),
        (snap) => {
          const data = snap.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as ProductRecord,
          );
          setProducts(data);
          markLoaded("products");
        },
        (err) => {
          console.error("Error Products:", err);
          markLoaded("products");
        },
      ),
    );

    unsubscribes.push(
      onSnapshot(
        collection(db, collectionMap.tax),
        (snap) => {
          const data = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as Tax[];
          setTaxes(data);
          markLoaded("taxes");
        },
        (err) => {
          console.error("Error Taxes:", err);
          markLoaded("taxes");
        },
      ),
    );

    unsubscribes.push(
      onSnapshot(
        collection(db, "customers"),
        (snap) => {
          const data = snap.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as Customer,
          );
          setCustomersList(data);
          markLoaded("customers");
        },
        (err) => {
          console.error("Error Customers:", err);
          markLoaded("customers");
        },
      ),
    );

    unsubscribes.push(
      onSnapshot(
        collection(db, "system_users"),
        (snap) => {
          const data = snap.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as SystemUser,
          );
          setEmployees(data);
          markLoaded("users");
        },
        (err) => {
          console.error("Error Users:", err);
          markLoaded("users");
        },
      ),
    );

    unsubscribes.push(
      onSnapshot(
        doc(db, "app_settings", "photo_config"),
        (snap) => {
          if (snap.exists()) {
            setPhotoConfig(snap.data() as PhotoConfig);
          } else {
            setPhotoConfig(DEFAULT_PHOTO_CONFIG);
          }
          markLoaded("photoConfig");
        },
        (err) => {
          console.error("Error PhotoConfig:", err);
          setPhotoConfig(DEFAULT_PHOTO_CONFIG);
          markLoaded("photoConfig");
        },
      ),
    );

    unsubscribes.push(
      onSnapshot(
        doc(db, "app_settings", "houses_form_config"),
        (snap) => {
          if (snap.exists()) {
            setFormConfig(snap.data() as FormVisibilityConfig);
          } else {
            setFormConfig(DEFAULT_FORM_CONFIG);
          }
        },
        (err) => {
          console.error("Error FormConfig:", err);
          setFormConfig(DEFAULT_FORM_CONFIG);
        },
      ),
    );

    unsubscribes.push(
      onSnapshot(
        collection(db, "settings_roles"),
        (snap) => {
          const data = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as Role[];
          setRolesList(data);
        },
        (err) => {
          console.error("Error Roles:", err);
        },
      ),
    );

    return () => {
      unsubscribes.forEach((unsub) => unsub());
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
    if (serviceForm.applyTax === "Yes") {
      total = subtotal + taxAmount;
    } else if (
      serviceForm.applyTax === "No" &&
      serviceForm.minusTax === "Yes"
    ) {
      total = subtotal - taxAmount;
    }

    // ⭐ Total Minus Tax (AppSheet):
    // IF(minusTax=TRUE & applyTax=FALSE, Total - Tax$,
    //    IF(applyTax=TRUE & minusTax=FALSE, Total + Tax$, Total))
    let totalMinusTax = subtotal;
    if (serviceForm.minusTax === "Yes" && serviceForm.applyTax === "No") {
      totalMinusTax = subtotal - taxAmount;
    } else if (
      serviceForm.applyTax === "Yes" &&
      serviceForm.minusTax === "No"
    ) {
      totalMinusTax = subtotal + taxAmount;
    }

    if (
      subtotal !== serviceForm.subtotal ||
      taxAmount !== serviceForm.taxAmount ||
      total !== serviceForm.total ||
      totalMinusTax !== serviceForm.totalMinusTax
    ) {
      setServiceForm((prev) => ({
        ...prev,
        subtotal,
        taxAmount,
        total,
        totalMinusTax,
      }));
    }
  }, [
    serviceForm.quantity,
    serviceForm.price,
    serviceForm.taxPercentage,
    serviceForm.applyTax,
    serviceForm.minusTax,
    isServiceModalOpen,
  ]);

  type PermissionExt = {
    module: string;
    canView?: boolean;
    canAdd?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    scope?: "All" | "Own";
    allowedStatusIds?: string[];
    hiddenGroups?: string[];
    readOnlyFields?: string[];
  };

  const housePermission = activeRole?.permissions?.find(
    (p) => p.module === "Houses",
  ) as PermissionExt | undefined;
  const userScope = isSuperAdmin ? "All" : housePermission?.scope || "Own";
  const allowedStatusIds: string[] = housePermission?.allowedStatusIds || [];
  const hiddenGroups: string[] = housePermission?.hiddenGroups || [];

  // ⭐ CAMPOS DEL FORMULARIO EN SOLO LECTURA para el rol activo, configurados por el
  //    admin en Roles & Permissions → "Houses Form Fields". El super admin edita todo.
  //    Los ids deben coincidir con HOUSES_FORM_FIELDS de RolesView.tsx.
  const roleReadOnlyFields: string[] = housePermission?.readOnlyFields || [];
  // ⭐ Un campo es de SOLO LECTURA si lo marca cualquiera de las dos configuraciones:
  //    (1) readOnlyFields del rol (Roles & Permissions) o (2) el modal "Field &
  //    Button Visibility" de esta vista (app_settings/houses_form_config.readOnly).
  //    El super admin siempre edita todo.
  const isFieldRO = (fieldId: string): boolean => {
    if (isSuperAdmin) return false;
    if (roleReadOnlyFields.includes(fieldId)) return true;
    const roRoles = formConfig?.readOnly?.[fieldId] || [];
    return !!currentUser?.roleId && roRoles.includes(currentUser.roleId);
  };

  const isVisible = (groupId: string): boolean => {
    if (isSuperAdmin) return true;
    return !hiddenGroups.includes(groupId);
  };

  const isElementVisible = (elementId: string): boolean => {
    if (isSuperAdmin) return true;
    const userRoleId = currentUser?.roleId;
    if (!userRoleId) return true;
    const hiddenForRoles = formConfig?.visibility?.[elementId] || [];
    return !hiddenForRoles.includes(userRoleId);
  };

  // ⭐ ¿Alguno de estos elementos es visible para el rol activo?
  //    Sirve para ocultar tarjetas COMPLETAS del detalle cuando todas sus filas
  //    están ocultas (Schedule & Timing, Job Specifications, etc.).
  const anyVisible = (...elementIds: string[]): boolean =>
    elementIds.some((id) => isElementVisible(id));

  const toggleElementVisibilityForRole = (
    elementId: string,
    roleId: string,
  ) => {
    setFieldConfigDraft((prev) => {
      const currentHidden = prev.visibility?.[elementId] || [];
      const newHidden = currentHidden.includes(roleId)
        ? currentHidden.filter((r) => r !== roleId)
        : [...currentHidden, roleId];
      return {
        ...prev,
        visibility: { ...prev.visibility, [elementId]: newHidden },
      };
    });
  };

  // ⭐ CONFIGURADOR REDISEÑADO: cada rol tiene UN solo chip con 3 estados claros.
  //    Visible (verde)      = el rol ve y edita el elemento.
  //    Solo lectura (ámbar) = el rol lo ve pero NO lo edita (solo campos).
  //    Oculto (rojo)        = el rol NO lo ve.
  //    Un clic recorre: Visible → Solo lectura → Oculto → Visible.
  type FieldRoleState = "visible" | "readonly" | "hidden";

  const getFieldStateForRole = (
    elementId: string,
    roleId: string,
  ): FieldRoleState => {
    if ((fieldConfigDraft.visibility?.[elementId] || []).includes(roleId))
      return "hidden";
    if ((fieldConfigDraft.readOnly?.[elementId] || []).includes(roleId))
      return "readonly";
    return "visible";
  };

  const cycleFieldStateForRole = (elementId: string, roleId: string) => {
    setFieldConfigDraft((prev) => {
      const hiddenList = prev.visibility?.[elementId] || [];
      const roList = prev.readOnly?.[elementId] || [];
      const isHidden = hiddenList.includes(roleId);
      const isRO = roList.includes(roleId);
      // Base: quitar el rol de ambas listas y luego colocarlo según el siguiente estado
      let newHidden = hiddenList.filter((r) => r !== roleId);
      let newRO = roList.filter((r) => r !== roleId);
      if (!isHidden && !isRO) {
        // Visible → Solo lectura
        newRO = [...newRO, roleId];
      } else if (isRO && !isHidden) {
        // Solo lectura → Oculto
        newHidden = [...newHidden, roleId];
      }
      // Oculto → Visible (queda fuera de ambas listas)
      return {
        ...prev,
        visibility: { ...prev.visibility, [elementId]: newHidden },
        readOnly: { ...(prev.readOnly || {}), [elementId]: newRO },
      };
    });
  };

  // ⭐ Botones/tabs solo tienen 2 estados: Visible ↔ Oculto
  const getButtonStateForRole = (
    elementId: string,
    roleId: string,
  ): "visible" | "hidden" =>
    (fieldConfigDraft.visibility?.[elementId] || []).includes(roleId)
      ? "hidden"
      : "visible";

  const openFieldConfigModal = () => {
    setFieldConfigDraft({
      visibility: { ...(formConfig.visibility || {}) },
      readOnly: { ...(formConfig.readOnly || {}) },
    });
    setIsFieldConfigOpen(true);
  };

  const saveFieldConfig = async () => {
    setIsSavingFieldConfig(true);
    try {
      const ref = doc(db, "app_settings", "houses_form_config");
      await setDoc(
        ref,
        {
          visibility: fieldConfigDraft.visibility,
          readOnly: fieldConfigDraft.readOnly || {},
        },
        { merge: true },
      );
      setIsFieldConfigOpen(false);
    } catch (error) {
      console.error("Error guardando configuración de campos:", error);
      // ⭐ Mostrar el error REAL de Firebase (code + message) para diagnosticar:
      //    'permission-denied' = reglas/sesión; 'invalid-argument' = datos inválidos.
      const fbErr = error as { code?: string; message?: string };
      alert(
        `Error al guardar la configuración.\n\nCódigo: ${fbErr.code || "desconocido"}\nDetalle: ${fbErr.message || String(error)}`,
      );
    } finally {
      setIsSavingFieldConfig(false);
    }
  };

  const propertiesWithScope = properties.filter((prop) => {
    if (userScope !== "All") {
      if (!currentUser) return false;
      const isAssigned = prop.assignedWorkers?.includes(currentUser.id);
      const isSameTeam =
        currentUser.teamId && prop.teamId === currentUser.teamId;
      if (!isAssigned && !isSameTeam) return false;
    }

    if (!isSuperAdmin && allowedStatusIds.length > 0) {
      const matchById = allowedStatusIds.includes(prop.statusId);
      const propStatus = statuses.find(
        (st) => st.id === prop.statusId || st.name === prop.statusId,
      );
      const matchByName = propStatus
        ? allowedStatusIds.includes(propStatus.id)
        : false;
      if (!matchById && !matchByName) return false;
    }

    return true;
  });

  const teamsWithScope = teams.filter((team) => {
    if (userScope === "All") return true;
    if (!currentUser) return false;
    return team.id === currentUser.teamId;
  });

  const uniqueHouses = Array.from(
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
    .sort((a, b) => a.client.localeCompare(b.client));

  // ⭐ Filtros compartidos (status, casa, invoice, prioridad, búsqueda) para
  //    la tabla y el tablero.
  const passesListFilters = (p: Property) => {
    const st = statuses.find(
      (s) => s.id === p.statusId || s.name === p.statusId,
    );

    let passStatus = true;
    if (activeFilter !== "All") passStatus = st?.name === activeFilter;

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
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
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
      passSearch = addressMatch || clientMatch || noteMatch;
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

  // Tabla / Daily Jobs: sin Invoice ni Quality Check (QC se gestiona en su vista)
  const filteredProperties = propertiesWithScope
    .filter((p) => !isHiddenPipelineStatus(p) && passesListFilters(p))
    .sort(byDateDesc);

  // ⭐ TABLERO (Pipeline): incluye Quality Check; solo oculta Invoice.
  const boardProperties = propertiesWithScope
    .filter((p) => !isHiddenPipelineStatus(p, true) && passesListFilters(p))
    .sort(byDateDesc);

  const dashboardTabs = statuses
    .filter((st) => st.showInDashboard)
    .sort(
      (a, b) => Number(a.dashboardOrder || 0) - Number(b.dashboardOrder || 0),
    );

  const handleQuickStatusChange = async (
    propertyId: string,
    newStatusId: string,
  ) => {
    // ⭐ Respeta la config "Solo lectura" del campo Job Status para el rol activo:
    //    bloquea TODAS las vías de cambio (pills, banner del detalle y drag del board).
    if (isFieldRO("statusId")) {
      alert("El status del trabajo es de SOLO LECTURA para tu rol.");
      return;
    }
    setIsSaving(true);
    try {
      await propertiesService.update(propertyId, { statusId: newStatusId });
      setProperties(
        properties.map((p) =>
          p.id === propertyId ? { ...p, statusId: newStatusId } : p,
        ),
      );
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

  // ⭐ CANDADO de Start/Finish: una vez marcado por un empleado, SOLO esa persona
  //    (o el super admin) puede deshacerlo — otro empleado no puede volver a marcar
  //    ni deshacer. Se guarda también el id (registros viejos solo tienen el nombre,
  //    por eso el fallback de comparación por nombre).
  type PropertyMarks = Property & {
    employeeStartedById?: string | null;
    employeeFinishedById?: string | null;
  };
  const currentUserFullName = currentUser
    ? `${currentUser.firstName} ${currentUser.lastName}`
    : "";
  const canUndoStart = (h: Property): boolean => {
    if (isSuperAdmin) return true;
    const g = h as PropertyMarks;
    if (g.employeeStartedById) return g.employeeStartedById === currentUser?.id;
    return !!h.employeeStartedBy && h.employeeStartedBy === currentUserFullName;
  };
  const canUndoFinish = (h: Property): boolean => {
    if (isSuperAdmin) return true;
    const g = h as PropertyMarks;
    if (g.employeeFinishedById)
      return g.employeeFinishedById === currentUser?.id;
    return (
      !!h.employeeFinishedBy && h.employeeFinishedBy === currentUserFullName
    );
  };

  const handleStartJob = async () => {
    if (!selectedHouse) return;
    setIsSaving(true);
    try {
      const startedAt = new Date().toISOString();
      const startedBy = currentUser
        ? `${currentUser.firstName} ${currentUser.lastName}`
        : "Unknown";
      // ⭐ Payload tipado con la extensión local (employeeStartedById aún no está en Property)
      const startPayload: Partial<PropertyMarks> = {
        employeeStartedAt: startedAt,
        employeeStartedBy: startedBy,
        employeeStartedById: currentUser?.id || "",
      };
      await propertiesService.update(selectedHouse.id, startPayload);
      const updatedHouse = {
        ...selectedHouse,
        employeeStartedAt: startedAt,
        employeeStartedBy: startedBy,
        employeeStartedById: currentUser?.id || "",
      } as Property;
      setSelectedHouse(updatedHouse);
      setProperties(
        properties.map((p) => (p.id === selectedHouse.id ? updatedHouse : p)),
      );
    } catch (error) {
      console.error("Error marking as started:", error);
      alert("Failed to start job.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUndoStart = async () => {
    if (!selectedHouse) return;
    if (!canUndoStart(selectedHouse)) {
      alert(
        `Solo ${selectedHouse.employeeStartedBy || "quien lo marcó"} (o un administrador) puede deshacer el Start Job.`,
      );
      return;
    }
    if (!window.confirm("Undo start job?")) return;
    setIsSaving(true);
    try {
      const undoStartPayload: Partial<PropertyMarks> = {
        employeeStartedAt: null,
        employeeStartedBy: null,
        employeeStartedById: null,
      };
      await propertiesService.update(selectedHouse.id, undoStartPayload);
      const updatedHouse = {
        ...selectedHouse,
        employeeStartedAt: undefined,
        employeeStartedBy: undefined,
        employeeStartedById: undefined,
      } as Property;
      setSelectedHouse(updatedHouse);
      setProperties(
        properties.map((p) => (p.id === selectedHouse.id ? updatedHouse : p)),
      );
    } catch (error) {
      console.error("Error undoing start job:", error);
      alert("Failed to undo start job.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkAsFinished = async () => {
    if (!selectedHouse) return;
    if (!selectedHouse.employeeStartedBy) {
      alert("Error: You must Start the job before marking it as Finished.");
      return;
    }
    if (!window.confirm("Are you sure you want to mark this job as finished?"))
      return;

    setIsSaving(true);
    try {
      const finishedAt = new Date().toISOString();
      const finishedBy = currentUser
        ? `${currentUser.firstName} ${currentUser.lastName}`
        : "Unknown";
      const finishPayload: Partial<PropertyMarks> = {
        employeeFinishedAt: finishedAt,
        employeeFinishedBy: finishedBy,
        employeeFinishedById: currentUser?.id || "",
      };
      await propertiesService.update(selectedHouse.id, finishPayload);
      const updatedHouse = {
        ...selectedHouse,
        employeeFinishedAt: finishedAt,
        employeeFinishedBy: finishedBy,
        employeeFinishedById: currentUser?.id || "",
      } as Property;
      setSelectedHouse(updatedHouse);
      setProperties(
        properties.map((p) => (p.id === selectedHouse.id ? updatedHouse : p)),
      );
    } catch (error) {
      console.error("Error marking as finished:", error);
      alert("Failed to mark property as finished.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUndoFinished = async () => {
    if (!selectedHouse) return;
    if (!canUndoFinish(selectedHouse)) {
      alert(
        `Solo ${selectedHouse.employeeFinishedBy || "quien lo marcó"} (o un administrador) puede deshacer el Mark Finished.`,
      );
      return;
    }
    if (!window.confirm("Undo finished status?")) return;
    setIsSaving(true);
    try {
      const undoFinishPayload: Partial<PropertyMarks> = {
        employeeFinishedAt: null,
        employeeFinishedBy: null,
        employeeFinishedById: null,
      };
      await propertiesService.update(selectedHouse.id, undoFinishPayload);
      const updatedHouse = {
        ...selectedHouse,
        employeeFinishedAt: undefined,
        employeeFinishedBy: undefined,
        employeeFinishedById: undefined,
      } as Property;
      setSelectedHouse(updatedHouse);
      setProperties(
        properties.map((p) => (p.id === selectedHouse.id ? updatedHouse : p)),
      );
    } catch (error) {
      console.error("Error undoing finished status:", error);
      alert("Failed to undo finished status.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoogleCalendarSync = () => {
    if (
      !selectedHouse ||
      !selectedHouse.scheduleDate ||
      !selectedHouse.timeIn
    ) {
      return alert(
        "Por favor asegúrate de que la propiedad tenga fecha de Schedule y hora Time In.",
      );
    }
    // ⭐ Hora "flotante" (local) exacta: respeta Time In y Time Out tal cual, sin
    //    convertir a UTC. Google Calendar interpreta YYYYMMDDTHHMMSS (sin 'Z') en la
    //    zona horaria del calendario, así que la hora/fecha se mantienen idénticas.
    const toMinutes = (t: string): number => {
      const s = String(t || "").trim();
      const ampm = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (ampm) {
        let h = +ampm[1] % 12;
        if (/PM/i.test(ampm[3])) h += 12;
        return h * 60 + +ampm[2];
      }
      const [hh = "0", mm = "0"] = s.split(":");
      return +hh * 60 + +mm;
    };
    const shiftDate = (isoDate: string, addDays: number): string => {
      const y = +isoDate.slice(0, 4),
        mo = +isoDate.slice(5, 7),
        d = +isoDate.slice(8, 10);
      const nd = new Date(y, mo - 1, d + addDays);
      return `${nd.getFullYear()}${String(nd.getMonth() + 1).padStart(2, "0")}${String(nd.getDate()).padStart(2, "0")}`;
    };
    const fmtStamp = (isoDate: string, minutes: number): string => {
      const days = Math.floor(minutes / 1440);
      const mins = ((minutes % 1440) + 1440) % 1440;
      const datePart =
        days === 0 ? isoDate.replace(/-/g, "") : shiftDate(isoDate, days);
      const hh = String(Math.floor(mins / 60)).padStart(2, "0");
      const mm = String(mins % 60).padStart(2, "0");
      return `${datePart}T${hh}${mm}00`;
    };

    const startMin = toMinutes(selectedHouse.timeIn);
    // Respeta el Time Out real; si no hay, usa +2h como respaldo.
    let endMin = selectedHouse.timeOut
      ? toMinutes(selectedHouse.timeOut)
      : startMin + 120;
    if (endMin <= startMin) endMin = startMin + 120; // evita duración cero/negativa
    const startDateTime = fmtStamp(selectedHouse.scheduleDate, startMin);
    const endDateTime = fmtStamp(selectedHouse.scheduleDate, endMin);
    // ⭐ El evento SIEMPRE debe crearse en esta cuenta, nunca en otra.
    const CALENDAR_ACCOUNT_EMAIL = "account@precisecleaningtx.com";
    const renderUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent("Cleaning: " + getClientName(selectedHouse.client))}&dates=${startDateTime}/${endDateTime}&ctz=America/Chicago&details=${encodeURIComponent(selectedHouse.note || "")}&location=${encodeURIComponent(selectedHouse.address)}&authuser=${encodeURIComponent(CALENDAR_ACCOUNT_EMAIL)}&sf=true&output=xml`;
    // Forzamos el selector de cuenta de Google a ese correo y de ahí continuamos al
    // formulario del evento. Si esa cuenta no está iniciada, Google pedirá entrar con ella,
    // garantizando que el evento nunca se cree bajo otra cuenta.
    const calendarUrl = `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(CALENDAR_ACCOUNT_EMAIL)}&continue=${encodeURIComponent(renderUrl)}`;
    window.open(calendarUrl, "_blank");
  };

  const toggleWorkerAssignmentDetail = async (workerId: string) => {
    if (!selectedHouse || !canEdit) return;
    setIsSaving(true);
    try {
      const currentWorkers = selectedHouse.assignedWorkers || [];
      const isAssigned = currentWorkers.includes(workerId);
      let newWorkersList = isAssigned
        ? currentWorkers.filter((id) => id !== workerId)
        : [...currentWorkers, workerId];
      await propertiesService.update(selectedHouse.id, {
        assignedWorkers: newWorkersList,
      });
      const updatedHouse = {
        ...selectedHouse,
        assignedWorkers: newWorkersList,
      };
      setSelectedHouse(updatedHouse);
      setProperties(
        properties.map((p) => (p.id === selectedHouse.id ? updatedHouse : p)),
      );
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
    let newWorkersList = isAssigned
      ? currentWorkers.filter((id) => id !== workerId)
      : [...currentWorkers, workerId];
    setFormData({ ...formData, assignedWorkers: newWorkersList });
  };

  const handleOpenPayrollForm = (houseId: string) => {
    if (!houseId) return alert("Must save the house first.");
    setPayrollForm({
      propertyId: houseId,
      date: new Date().toISOString().split("T")[0],
      employeeId: "",
      baseAmount: 0,
      extraAmount: 0,
      extraNote: "",
      discountAmount: 0,
      discountNote: "",
      totalAmount: 0,
    });
    setIsPayrollModalOpen(true);
  };

  const handleSavePayroll = async () => {
    if (!payrollForm.employeeId) return alert("Please select an employee.");
    if (Number(payrollForm.baseAmount) <= 0)
      return alert("Base amount must be greater than 0.");
    setIsSaving(true);
    try {
      const total =
        Number(payrollForm.baseAmount) +
        Number(payrollForm.extraAmount) -
        Number(payrollForm.discountAmount);
      const dataToSave = {
        ...payrollForm,
        totalAmount: total,
        status: "Pending" as const,
      };
      const newId = await payrollService.create(dataToSave);
      setHousePayrollRecords(
        [...housePayrollRecords, { ...dataToSave, id: newId }].sort(
          (a, b) => dateSortValue(b.date) - dateSortValue(a.date),
        ), // ⭐ más reciente primero
      );
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
    if (!window.confirm("Delete this payment record?")) return;
    setIsSaving(true);
    try {
      await payrollService.delete(id);
      setHousePayrollRecords(housePayrollRecords.filter((r) => r.id !== id));
    } catch (e) {
      console.error(e);
      alert("Error deleting record.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenServiceForm = (record?: ServiceRecord, fromForm = false) => {
    setIsServiceFromForm(fromForm);
    const propId = selectedHouse?.id || formData?.id || "";
    if (record) {
      setServiceForm(record);
    } else {
      const defaultTax = taxes.length > 0 ? Number(taxes[0].percentage) : 0;
      setServiceForm({
        ...defaultServiceForm,
        propertyId: propId,
        taxPercentage: defaultTax,
      });
    }
    setIsServiceModalOpen(true);
  };

  const handleSaveService = async () => {
    if (!serviceForm.serviceId)
      return alert("Please select a Product/Service.");
    if (serviceForm.price <= 0) return alert("Price must be greater than 0.");

    const dataToSave = {
      ...serviceForm,
      createdAt: serviceForm.createdAt || new Date().toISOString(),
    };

    if (isServiceFromForm) {
      const newService = {
        ...dataToSave,
        id: serviceForm.id || `temp-${Date.now()}`,
      };
      if (serviceForm.id)
        setFormServices((prev) =>
          prev.map((s) => (s.id === serviceForm.id ? newService : s)),
        );
      else setFormServices((prev) => [newService, ...prev]);
      setIsServiceModalOpen(false);
      return;
    }

    setIsSaving(true);
    try {
      if (serviceForm.id) {
        await updateDoc(
          doc(db, "billing_services", serviceForm.id),
          dataToSave,
        );
        setHouseServices(
          houseServices.map((r) => (r.id === serviceForm.id ? dataToSave : r)),
        );
      } else {
        const docRef = await addDoc(
          collection(db, "billing_services"),
          dataToSave,
        );
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
      await deleteDoc(doc(db, "billing_services", id));
      setHouseServices(houseServices.filter((r) => r.id !== id));
    } catch (error) {
      console.error("Error deleting service:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteServiceLocal = (id: string) => {
    if (!window.confirm("Remove this service from the list?")) return;
    if (!id.startsWith("temp-")) setServicesToDelete((prev) => [...prev, id]);
    setFormServices((prev) => prev.filter((s) => s.id !== id));
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
        const q = query(
          collection(db, "billing_services"),
          where("propertyId", "==", house.id),
        );
        const srvSnap = await getDocs(q);
        setFormServices(
          srvSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as ServiceRecord),
        );
      } catch (error) {
        console.error("Error fetching form services:", error);
        setFormServices([]);
      }
    } else {
      const defaultStatus = statuses.length > 0 ? statuses[0].id : "";
      setFormData({
        id: "",
        statusId: defaultStatus,
        invoiceStatus: "Pending",
        receiveDate: new Date().toISOString().split("T")[0],
        scheduleDate: "",
        client: "",
        note: "",
        address: "",
        employeeNote: "",
        serviceId: "",
        rooms: "1",
        bathrooms: "1",
        priorityId: "",
        teamId: "",
        timeIn: "",
        timeOut: "",
        dateOfIssue: "",
        dueDate: "",
        beforePhotos: [],
        afterPhotos: [],
        assignedWorkers: [],
      });
      setFormServices([]);
      setBeforePhotoURLs([]);
      setAfterPhotoURLs([]);
      setBeforeFiles([]);
      setAfterFiles([]);
      setBeforeExcluded([]);
      setAfterExcluded([]);
      setPendingForHouse({ before: 0, after: 0 });
    }
    setSelectedHouse(house || null);
    setIsDetailModalOpen(false);
    setIsFormModalOpen(true);
  };

  const handleDuplicate = () => {
    if (!selectedHouse) return;
    setFormData({
      ...selectedHouse,
      id: "",
      beforePhotos: [],
      afterPhotos: [],
    });
    setBeforePhotoURLs([]);
    setAfterPhotoURLs([]);
    setBeforeExcluded([]);
    setAfterExcluded([]);
    setFormServices(
      houseServices.map((s) => ({
        ...s,
        id: `temp-${Math.random().toString(36).substring(2, 9)}`,
        propertyId: "",
      })),
    );
    setServicesToDelete([]);
    setIsDetailModalOpen(false);
    setIsFormModalOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormModalOpen(false);
    setSelectedHouse(null);
  };

  const handleCustomerSelect = (customerId: string) => {
    const selectedCust = customersList.find((c) => c.id === customerId);
    if (selectedCust) {
      // ⭐ Regla AppSheet: if([Type]="Private customer", lookup(client, Address), "")
      //    Si el cliente es "Private customer", trae su dirección (queda editable); si no, vacío.
      const isPrivate =
        String(selectedCust.type || "")
          .toLowerCase()
          .trim() === "private customer";
      // ⭐ De igual manera, trae la NOTA guardada del cliente al campo General Note
      //    (queda editable). Solo si el cliente tiene nota; si no, conserva la actual.
      const custNote = String(
        (selectedCust as Customer & { note?: string | null }).note || "",
      ).trim();
      setFormData({
        ...formData,
        client: customerId,
        address: isPrivate ? String(selectedCust.address || "") : "",
        note: isPrivate && custNote ? custNote : formData.note,
      });
    } else {
      setFormData({ ...formData, client: customerId });
    }
  };

  // ⭐ Abre el modal de cliente con el formulario limpio
  const handleOpenCustomerModal = () => {
    setCustomerForm({
      type: "Residential",
      color: "#3b82f6",
      name: "",
      businessName: "",
      email: "",
      phone: "",
      address: "",
      cityStateZip: "",
    });
    setIsCustomerModalOpen(true);
  };

  // ⭐ Guarda el nuevo cliente en 'customers', lo selecciona en la casa y cierra el modal
  const handleSaveNewCustomer = async () => {
    if (!customerForm.name.trim())
      return alert("El nombre completo (Full Name) es obligatorio.");
    try {
      setIsSaving(true);
      const ref = await addDoc(collection(db, "customers"), {
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
      setFormData((prev) => ({
        ...prev,
        client: ref.id,
        address: customerForm.address.trim() || prev.address,
      }));
      setIsCustomerModalOpen(false);
    } catch (e) {
      console.error("Error guardando cliente:", e);
      alert("No se pudo guardar el cliente. Intenta de nuevo.");
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
        finalAssignedWorkers = employees
          .filter((emp) => emp.teamId === formData.teamId)
          .map((emp) => emp.id);
      }

      if (!workingId) {
        const { id, ...restOfData } = formData;
        const dataToCreate = {
          ...restOfData,
          assignedWorkers: finalAssignedWorkers,
          description: `${getClientName(formData.client)} - ${formData.rooms} rooms`,
          city: "TBD",
          size: "TBD",
          beforePhotos: [],
          afterPhotos: [],
        };
        const docRef = await propertiesService.create(dataToCreate);
        workingId = docRef;
        isNew = true;
        console.log("✅ New property created with ID:", workingId);
      }

      const beforeRes = await uploadOrQueue(
        beforeFiles,
        getClientName(formData.client),
        formData.address,
        "before",
        workingId!,
      );
      const afterRes = await uploadOrQueue(
        afterFiles,
        getClientName(formData.client),
        formData.address,
        "after",
        workingId!,
      );
      const uploadedBeforeUrls = beforeRes.urls;
      const uploadedAfterUrls = afterRes.urls;

      const finalDataToUpdate = {
        ...formData,
        assignedWorkers: finalAssignedWorkers,
        beforePhotos: [...(formData.beforePhotos || []), ...uploadedBeforeUrls],
        afterPhotos: [...(formData.afterPhotos || []), ...uploadedAfterUrls],
        beforePhotosExcluded: beforeExcluded,
        afterPhotosExcluded: afterExcluded,
      };

      const { id: _omitId, ...dataForFirestore } = finalDataToUpdate;
      // as any: beforePhotosExcluded/afterPhotosExcluded son campos propios de este
      // archivo (URLs que no van al PDF), no forman parte de Property en types/index.ts.
      await propertiesService.update(workingId, dataForFirestore as any);
      console.log("✅ Property updated in Firestore with photo URLs");

      for (const srvId of servicesToDelete) {
        await deleteDoc(doc(db, "billing_services", srvId)).catch((e) =>
          console.error(e),
        );
      }

      for (const srv of formServices) {
        const srvData = { ...srv, propertyId: workingId };
        if (srv.id && !srv.id.startsWith("temp-")) {
          const { id, ...updateData } = srvData;
          await updateDoc(
            doc(db, "billing_services", id as string),
            updateData,
          ).catch((e) => console.error(e));
        } else {
          const { id, ...createData } = srvData;
          await addDoc(collection(db, "billing_services"), createData).catch(
            (e) => console.error(e),
          );
        }
      }

      if (isNew) {
        const fullNewData = {
          ...finalDataToUpdate,
          id: workingId,
          description: `${getClientName(formData.client)} - ${formData.rooms} rooms`,
          city: "TBD",
          size: "TBD",
        };
        setProperties([...properties, fullNewData as Property]);
      } else {
        setProperties(
          properties.map((p) =>
            p.id === workingId
              ? ({ ...finalDataToUpdate, id: workingId } as Property)
              : p,
          ),
        );
      }

      setBeforeFiles([]);
      setAfterFiles([]);
      setBeforePhotoURLs([]);
      setAfterPhotoURLs([]);

      const queued = beforeRes.queued + afterRes.queued;
      if (queued > 0)
        alert(
          `Sin conexión: ${queued} foto(s) se subirán automáticamente al recuperar internet.`,
        );
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

      const beforeRes = await uploadOrQueue(
        beforeFiles,
        getClientName(selectedHouse.client),
        selectedHouse.address,
        "before",
        workingId,
      );
      const afterRes = await uploadOrQueue(
        afterFiles,
        getClientName(selectedHouse.client),
        selectedHouse.address,
        "after",
        workingId,
      );
      const uploadedBeforeUrls = beforeRes.urls;
      const uploadedAfterUrls = afterRes.urls;

      const existingBeforeFromStorage = (
        selectedHouse.beforePhotos || []
      ).filter((u) => u.startsWith("http"));
      const existingAfterFromStorage = (selectedHouse.afterPhotos || []).filter(
        (u) => u.startsWith("http"),
      );

      const finalBeforePhotos = [
        ...existingBeforeFromStorage,
        ...uploadedBeforeUrls,
      ];
      const finalAfterPhotos = [
        ...existingAfterFromStorage,
        ...uploadedAfterUrls,
      ];

      await propertiesService.update(workingId, {
        beforePhotos: finalBeforePhotos,
        afterPhotos: finalAfterPhotos,
        beforePhotosExcluded: beforeExcluded,
        afterPhotosExcluded: afterExcluded,
      } as any);
      console.log("✅ Property updated in Firestore with photo URLs");

      const updatedHouse = {
        ...selectedHouse,
        beforePhotos: finalBeforePhotos,
        afterPhotos: finalAfterPhotos,
      };
      setSelectedHouse(updatedHouse);
      setProperties(
        properties.map((p) => (p.id === workingId ? updatedHouse : p)),
      );

      setBeforePhotoURLs(finalBeforePhotos);
      setAfterPhotoURLs(finalAfterPhotos);

      setBeforeFiles([]);
      setAfterFiles([]);

      const queued = beforeRes.queued + afterRes.queued;
      await refreshPendingCounts();
      alert(
        queued > 0
          ? `Guardado. ${queued} foto(s) se subirán al recuperar conexión.`
          : "Photos saved successfully!",
      );
      return;
    } catch (error) {
      console.error("❌ Error saving photos:", error);
      alert("Error saving photos. Check console.");
    } finally {
      setIsSaving(false);
    }
  };

  // Recibe la propiedad explícita (fila/tarjeta clickeada) en vez de depender solo de
  // `selectedHouse`: ese estado no se actualiza sincrónicamente, así que un
  // `setSelectedHouse(prop); handleDelete();` en el mismo handler borraba la casa
  // seleccionada anteriormente (ej. la última abierta en el modal de detalle), no la fila
  // en la que se acababa de hacer clic. `house` cubre ese caso; sin argumento (botón
  // "Delete Property" dentro del propio modal de detalle) sigue usando `selectedHouse`.
  const handleDelete = async (house?: Property) => {
    const target = house || selectedHouse;
    if (!target) return;
    if (
      !window.confirm(
        "Are you sure you want to completely delete this job and all its related records?",
      )
    )
      return;

    setIsSaving(true);
    try {
      const relatedPayrolls = await payrollService.getByPropertyId(target.id);
      if (relatedPayrolls.length > 0) {
        await Promise.all(
          relatedPayrolls.map((record) =>
            payrollService.delete(record.id as string),
          ),
        );
      }
      // Se consulta directo a Firestore (en vez de usar `houseServices` del estado) porque
      // ese estado solo se llena al abrir el modal de detalle — al borrar directo desde la
      // tabla/tarjeta sin abrirlo, estaría vacío o correspondería a otra propiedad.
      const relatedServicesSnap = await getDocs(
        query(
          collection(db, "billing_services"),
          where("propertyId", "==", target.id),
        ),
      );
      if (!relatedServicesSnap.empty) {
        await Promise.all(
          relatedServicesSnap.docs.map((d) => deleteDoc(d.ref)),
        );
      }
      await propertiesService.delete(target.id);
      setProperties(properties.filter((p) => p.id !== target.id));
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
    setActiveDetailTab("overview");
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
        before: pend.filter((p) => p.type === "before").length,
        after: pend.filter((p) => p.type === "after").length,
      });

      const pRecords = await payrollService.getByPropertyId(house.id);
      // ⭐ Más reciente primero (dateSortValue tolera los formatos de fecha mixtos)
      pRecords.sort((a, b) => dateSortValue(b.date) - dateSortValue(a.date));
      setHousePayrollRecords(pRecords);

      const q = query(
        collection(db, "billing_services"),
        where("propertyId", "==", house.id),
      );
      const srvSnap = await getDocs(q);
      const srvRecords = srvSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as ServiceRecord,
      );
      setHouseServices(srvRecords);
    } catch (error) {
      console.error("Error fetching detail records:", error);
    }
  };

  // ⭐ Apertura EXTERNA (desde Quality Check u otras vistas):
  //    - houseToOpenDetail: abre el modal de detalle de esa casa.
  //    - houseToOpenEdit: abre el formulario de edición con sus campos guardados.
  //    Se usa siempre la versión más fresca de la casa (por si cambió en Firestore).
  useEffect(() => {
    if (!houseToOpenDetail) return;
    const fresh =
      properties.find((p) => p.id === houseToOpenDetail.id) ||
      houseToOpenDetail;
    handleOpenDetail(fresh);
    clearHouseToOpenDetail?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houseToOpenDetail]);

  useEffect(() => {
    if (!houseToOpenEdit) return;
    const fresh =
      properties.find((p) => p.id === houseToOpenEdit.id) || houseToOpenEdit;
    handleOpenForm(fresh);
    clearHouseToOpenEdit?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houseToOpenEdit]);

  const handleRemovePhoto = (index: number, type: "before" | "after") => {
    const removedUrl = (type === "before" ? beforePhotoURLs : afterPhotoURLs)[
      index
    ];
    const isFormOpen = isFormModalOpen;

    if (type === "before") {
      const newUrls = [...beforePhotoURLs];
      newUrls.splice(index, 1);
      setBeforePhotoURLs(newUrls);

      const storedCount =
        (isFormOpen
          ? formData.beforePhotos?.length
          : selectedHouse?.beforePhotos?.length) || 0;

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

      const storedCount =
        (isFormOpen
          ? formData.afterPhotos?.length
          : selectedHouse?.afterPhotos?.length) || 0;

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

    if (type === "before")
      setBeforeExcluded((prev) => prev.filter((u) => u !== removedUrl));
    else setAfterExcluded((prev) => prev.filter((u) => u !== removedUrl));
  };

  const generatePDF = async (type: "before" | "after") => {
    const excluded = type === "before" ? beforeExcluded : afterExcluded;
    const urls = (type === "before" ? beforePhotoURLs : afterPhotoURLs).filter(
      (u) => !excluded.includes(u),
    );

    if (urls.length === 0) {
      alert(
        `No hay fotos de tipo "${type.toUpperCase()}" subidas para generar el reporte.`,
      );
      return;
    }

    setIsSaving(true);

    try {
      console.log(`📥 Preparing ${urls.length} images for PDF...`);
      const base64Images = await Promise.all(
        urls.map(async (url, idx) => {
          try {
            const response = await fetch(url, { mode: "cors" });
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
        }),
      );
      console.log(`✅ All images ready for PDF`);

      const title = type === "before" ? "Before Photos" : "After Photos";
      const accentColor = type === "before" ? "#1e3a8a" : "#047857";
      const clientLabel = escapeHtml(
        selectedHouse?.client
          ? getClientName(selectedHouse.client)
          : "Propiedad",
      );
      const addressLabel = escapeHtml(selectedHouse?.address || "N/A");

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
                  <div>${addressLabel}</div>
                </div>
              </div>

              <h1 class="report-title">${title}</h1>

              <div class="photo-grid">
                ${base64Images
                  .map(
                    (src) => `
                  <div class="photo-item">
                    <img src="${src}" alt="${type} photo" />
                  </div>
                `,
                  )
                  .join("")}
              </div>

              <div class="footer">
                ${clientLabel} • Generated on ${formatDate(new Date())}
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

      // Se abre el reporte como Blob URL en vez de document.write sobre about:blank.
      // Nota: NO usar la feature 'noopener' aquí — hace que window.open retorne null
      // y era la causa de la ventana en blanco + falsa alerta de pop-ups.
      // La protección equivalente se logra con printWindow.opener = null (abajo).
      const blob = new Blob([html], { type: "text/html" });
      const blobUrl = URL.createObjectURL(blob);
      const printWindow = window.open(blobUrl, "_blank");
      if (!printWindow) {
        URL.revokeObjectURL(blobUrl);
        alert(
          "Por favor permite las ventanas emergentes (pop-ups) para generar el PDF.",
        );
        setIsSaving(false);
        return;
      }
      // Corta el acceso de la ventana nueva a la pestaña principal (defensa en profundidad,
      // complementa el escapeHtml de nombre de cliente/dirección).
      printWindow.opener = null;
      // Liberar el Blob URL cuando la ventana ya cargó el contenido.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Error al generar el PDF. Revisa la consola.");
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const total =
      Number(payrollForm.baseAmount || 0) +
      Number(payrollForm.extraAmount || 0) -
      Number(payrollForm.discountAmount || 0);
    setPayrollForm((prev) => ({ ...prev, totalAmount: total }));
  }, [
    payrollForm.baseAmount,
    payrollForm.extraAmount,
    payrollForm.discountAmount,
  ]);

  const invoiceOptions = [
    { id: "Pre-Paid", name: "Pre-Paid" },
    { id: "Needs Invoice", name: "Needs Invoice" },
    { id: "Pending", name: "Pending" },
    { id: "Paid", name: "Paid" },
    { id: "Not Charged", name: "Not Charged" },
  ];
  const roomOptions = [1, 2, 3, 4, 5].map((n) => ({
    id: String(n),
    name: String(n),
  }));
  const kpiIcons = [Briefcase, Clock, ShieldCheck, AlertTriangle];

  const dateFormatted = formatDate(new Date()); // ⭐ MM/DD/YYYY unificado
  const dateCapitalized =
    dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);

  const totalBilled = houseServices.reduce((sum, r) => sum + r.total, 0);
  const totalPayroll = housePayrollRecords.reduce(
    (sum, r) => sum + r.totalAmount,
    0,
  );
  const netProfit = totalBilled - totalPayroll;

  const formTotalBilled = formServices.reduce((sum, r) => sum + r.total, 0);

  return (
    <div
      className={
        renderMode === "modals-only" ? "hv-modals-only" : "fade-in houses-view"
      }
    >
      {renderMode === "full" && (
        <>
          {/* DASHBOARD HEADER */}
          <header className="main-header dashboard-header-container hv-header">
            <div className="view-header-title-group">
              <button
                className="hamburger-btn"
                onClick={onOpenMenu}
                aria-label="Open menu"
              >
                <Menu size={24} />
              </button>
              <div>
                <h1 className="hv-title">Overview</h1>
                <p className="hv-subtitle">General operations overview</p>
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
                  placeholder="Buscar por dirección, cliente o notas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="hv-search-input"
                />
              </div>

              {(isSuperAdmin ||
                activeRole?.permissions?.find((p) => p.module === "Houses")
                  ?.canAdd) && (
                <button
                  className="add-btn-mobile hv-btn-add"
                  onClick={() => handleOpenForm()}
                >
                  <Plus size={16} /> New Job
                </button>
              )}
            </div>
          </header>

          <div className="dash-grid hv-kpi-grid">
            {isLoading ? (
              <div className="hv-loading-text">Loading metrics...</div>
            ) : (
              statuses.slice(0, 4).map((status, index) => {
                const Icon = kpiIcons[index % kpiIcons.length];
                const count = propertiesWithScope.filter(
                  (p) => p.statusId === status.id || p.statusId === status.name,
                ).length;
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

          {viewMode === "board" ? (
            <PipelineBoardView
              properties={boardProperties}
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
            <div className="main-columns">
              {/* LEFT COLUMN: DAILY JOBS */}
              <div className="left-col">
                <div className="hv-panel-card">
                  <div className="hv-table-header">
                    <div>
                      <h2 className="hv-panel-title">Daily Jobs</h2>
                      <p className="hv-panel-date">{dateCapitalized}</p>
                    </div>

                    <div className="filters-section">
                      <div className="tabs-container">
                        <button
                          onClick={() => setActiveFilter("All")}
                          className={`hv-pill-btn${activeFilter === "All" ? " active" : ""}`}
                        >
                          All
                        </button>
                        {dashboardTabs.map((st) => (
                          <button
                            key={st.id}
                            onClick={() => setActiveFilter(st.name)}
                            className={`hv-pill-btn${activeFilter === st.name ? " active" : ""}`}
                          >
                            {st.name}
                          </button>
                        ))}
                      </div>

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
                                {uniqueHouses.map((h, idx) => (
                                  <option
                                    key={idx}
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
                    </div>
                  </div>

                  {/* ====== VISTA TABLA (escritorio) ====== */}
                  <div className="jobs-table-wrap hv-jobs-table-wrap">
                    <table className="responsive-table hv-table">
                      <thead>
                        <tr>
                          <th className="hv-th sticky">Schedule</th>
                          <th className="hv-th sticky">Client</th>
                          <th className="hv-th sticky">Time</th>
                          <th className="hv-th sticky">Type</th>
                          <th className="hv-th sticky">Team</th>
                          <th className="hv-th sticky">Status</th>
                          <th className="hv-th sticky w-100 right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {isLoading ? (
                          <tr>
                            <td colSpan={7} className="hv-empty-row">
                              Loading database...
                            </td>
                          </tr>
                        ) : filteredProperties.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="hv-empty-row italic">
                              No jobs to display for your team.
                            </td>
                          </tr>
                        ) : (
                          filteredProperties.map((prop) => {
                            const teamName = getRelationName(
                              teams,
                              prop.teamId,
                              "Unassigned",
                            );
                            const serviceName = getRelationName(
                              services,
                              prop.serviceId,
                              "Regular",
                            );
                            const prObj = priorities.find(
                              (pp) =>
                                pp.id === prop.priorityId ||
                                pp.name === prop.priorityId,
                            );
                            const isHighPriority =
                              prObj?.name?.toLowerCase() === "high" ||
                              prop.priorityId?.toLowerCase() === "high";

                            return (
                              <tr
                                key={prop.id}
                                onClick={() => handleOpenDetail(prop)}
                                className={`hv-job-row${isHighPriority ? " high-priority" : ""}`}
                              >
                                <td
                                  data-label="Schedule"
                                  className="hv-td muted"
                                >
                                  <CalendarDays
                                    size={14}
                                    className="hv-icon-inline"
                                  />{" "}
                                  {prop.scheduleDate
                                    ? formatDate(prop.scheduleDate)
                                    : "-"}
                                </td>
                                <td data-label="Client" className="hv-td">
                                  <div className="mobile-client-cell">
                                    <div className="hv-client-name-row">
                                      {isHighPriority && (
                                        <span
                                          title="HIGH priority"
                                          className="hv-badge-high"
                                        >
                                          <AlertTriangle size={11} /> HIGH
                                        </span>
                                      )}
                                      {getClientName(prop.client)}
                                      {prop.employeeFinishedBy && (
                                        <span
                                          title="Finished"
                                          className="hv-finished-icon"
                                        >
                                          <CheckCircle
                                            size={14}
                                            color="#10b981"
                                          />
                                        </span>
                                      )}
                                    </div>
                                    <div className="hv-client-address">
                                      <MapPin size={12} /> {prop.address}
                                    </div>
                                  </div>
                                </td>
                                <td data-label="Time" className="hv-td muted">
                                  <Clock size={14} className="hv-icon-inline" />{" "}
                                  {prop.timeIn || "08:00 AM"}
                                </td>
                                <td data-label="Type" className="hv-td strong">
                                  {serviceName}
                                </td>
                                <td data-label="Team" className="hv-td muted">
                                  {teamName}
                                </td>
                                <td data-label="Status" className="hv-td">
                                  <StatusPillSelector
                                    currentStatusId={prop.statusId}
                                    statuses={statuses}
                                    onChange={(newId) =>
                                      handleQuickStatusChange(prop.id, newId)
                                    }
                                    disabled={
                                      isSaving ||
                                      !canEdit ||
                                      !isVisible("workflow") ||
                                      isFieldRO("statusId")
                                    }
                                    onRequestOpen={setStatusModal}
                                    modalTitle={getClientName(prop.client)}
                                    modalSubtitle={prop.address}
                                  />
                                </td>
                                <td
                                  data-label="Actions"
                                  className="hv-td right"
                                >
                                  <div className="hv-actions-cell-row">
                                    {canEdit &&
                                      isVisible("admin") &&
                                      isElementVisible("btn_editDetails") && (
                                        <button
                                          className="action-btn-edit"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenForm(prop);
                                          }}
                                        >
                                          <Edit2 size={16} />{" "}
                                          <span className="mobile-action-text">
                                            Editar
                                          </span>
                                        </button>
                                      )}
                                    {canDelete &&
                                      isVisible("admin") &&
                                      isElementVisible(
                                        "btn_deleteProperty",
                                      ) && (
                                        <button
                                          className="action-btn-delete"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(prop);
                                          }}
                                        >
                                          <Trash2 size={16} />{" "}
                                          <span className="mobile-action-text">
                                            Eliminar
                                          </span>
                                        </button>
                                      )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* ====== VISTA TARJETAS (MÓVIL - estilo AppSheet) ====== */}
                  <div className="jobs-cards-wrap">
                    {isLoading ? (
                      <div className="hv-cards-empty">Loading database...</div>
                    ) : filteredProperties.length === 0 ? (
                      <div className="hv-cards-empty italic">
                        No jobs to display for your team.
                      </div>
                    ) : (
                      filteredProperties.map((prop) => {
                        const teamName = getRelationName(
                          teams,
                          prop.teamId,
                          "",
                        );
                        const teamColor = getRelationColor(teams, prop.teamId);
                        const prObj = priorities.find(
                          (pp) =>
                            pp.id === prop.priorityId ||
                            pp.name === prop.priorityId,
                        );
                        const isHighPriority =
                          prObj?.name?.toLowerCase() === "high" ||
                          prop.priorityId?.toLowerCase() === "high";
                        const assignedLabel = teamName || "Unassigned";

                        return (
                          <div
                            key={prop.id}
                            onClick={() => handleOpenDetail(prop)}
                            className="hv-job-card"
                          >
                            <div className="hv-card-top-row">
                              <span className="hv-card-client-name">
                                {getClientName(prop.client)}
                              </span>
                              <div className="hv-card-flags">
                                {prop.employeeFinishedBy && (
                                  <CheckCircle size={18} color="#10b981" />
                                )}
                                {isHighPriority && (
                                  <AlertTriangle size={18} color="#dc2626" />
                                )}
                              </div>
                            </div>

                            <div className="hv-card-info-col">
                              <div className="hv-card-info-row">
                                <MapPin
                                  size={18}
                                  color="#94a3b8"
                                  className="hv-shrink-0"
                                />
                                <span className="hv-card-info-text">
                                  {prop.address || "—"}
                                </span>
                              </div>
                              <div className="hv-card-info-row">
                                <CalendarDays
                                  size={18}
                                  color="#94a3b8"
                                  className="hv-shrink-0"
                                />
                                <span>
                                  {prop.scheduleDate
                                    ? formatDate(prop.scheduleDate)
                                    : "Sin fecha"}
                                  {prop.timeIn ? `  ·  ${prop.timeIn}` : ""}
                                </span>
                              </div>
                              <div className="hv-card-team-row">
                                <span
                                  className="hv-card-team-avatar"
                                  style={
                                    {
                                      "--team-bg": teamColor
                                        ? `${teamColor}20`
                                        : "#f1f5f9",
                                    } as CSSProperties
                                  }
                                >
                                  <Users
                                    size={15}
                                    color={teamColor || "#94a3b8"}
                                  />
                                </span>
                                <span
                                  className={`hv-card-team-label${teamName ? " assigned" : ""}`}
                                >
                                  {assignedLabel}
                                </span>
                              </div>
                            </div>

                            <div onClick={(e) => e.stopPropagation()}>
                              <StatusPillSelector
                                fullWidth
                                currentStatusId={prop.statusId}
                                statuses={statuses}
                                onChange={(newId) =>
                                  handleQuickStatusChange(prop.id, newId)
                                }
                                disabled={
                                  isSaving ||
                                  !canEdit ||
                                  !isVisible("workflow") ||
                                  isFieldRO("statusId")
                                }
                                onRequestOpen={setStatusModal}
                                modalTitle={getClientName(prop.client)}
                                modalSubtitle={prop.address}
                              />
                            </div>

                            {((canEdit &&
                              isElementVisible("btn_editDetails")) ||
                              (canDelete &&
                                isElementVisible("btn_deleteProperty"))) &&
                              isVisible("admin") && (
                                <div className="hv-card-actions-row">
                                  {canEdit &&
                                    isElementVisible("btn_editDetails") && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenForm(prop);
                                        }}
                                        className="hv-card-btn-edit"
                                      >
                                        <Edit2 size={17} /> Editar
                                      </button>
                                    )}
                                  {canDelete &&
                                    isElementVisible("btn_deleteProperty") && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDelete(prop);
                                        }}
                                        className="hv-card-btn-delete"
                                      >
                                        <Trash2 size={17} /> Eliminar
                                      </button>
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

              {/* RIGHT COLUMN: ACTIVE TEAMS */}
              <div className="right-col">
                <div className="hv-panel-card">
                  <h3 className="hv-panel-heading">Active Teams</h3>
                  <div className="hv-teams-list">
                    {isLoading ? (
                      <div className="hv-teams-status-text">
                        Loading teams...
                      </div>
                    ) : teamsWithScope.length === 0 ? (
                      <div className="hv-teams-status-text empty">
                        No configured teams.
                      </div>
                    ) : (
                      teamsWithScope
                        .filter((team) =>
                          propertiesWithScope.some((p) => {
                            const isAssignedToTeam =
                              p.teamId === team.id || p.teamId === team.name;
                            if (!isAssignedToTeam) return false;
                            return !isHiddenPipelineStatus(p);
                          }),
                        )
                        .map((team) => {
                          const assignedProps = propertiesWithScope
                            .filter((p) => {
                              if (
                                p.teamId !== team.id &&
                                p.teamId !== team.name
                              )
                                return false;
                              return !isHiddenPipelineStatus(p);
                            })
                            .sort((a, b) => {
                              const stA = statuses.find(
                                (s) =>
                                  s.id === a.statusId || s.name === a.statusId,
                              );
                              const stB = statuses.find(
                                (s) =>
                                  s.id === b.statusId || s.name === b.statusId,
                              );
                              const isRecallA =
                                stA?.name?.toLowerCase() === "recall" ||
                                a.statusId?.toLowerCase() === "recall";
                              const isRecallB =
                                stB?.name?.toLowerCase() === "recall" ||
                                b.statusId?.toLowerCase() === "recall";
                              if (isRecallA && !isRecallB) return -1;
                              if (!isRecallA && isRecallB) return 1;
                              return 0;
                            });
                          const isExpanded = expandedTeamId === team.id;
                          return (
                            <div
                              key={team.id}
                              onClick={() =>
                                setExpandedTeamId(isExpanded ? null : team.id)
                              }
                              className={`hv-team-item${isExpanded ? " expanded" : ""}`}
                              style={
                                {
                                  "--team-color": team.color,
                                  "--team-icon-bg": `${team.color}20`,
                                } as CSSProperties
                              }
                            >
                              <div className="hv-team-item-head">
                                <div className="hv-team-info-row">
                                  <div className="hv-team-icon-box">
                                    <Users size={16} />
                                  </div>
                                  <div>
                                    <div className="hv-team-name">
                                      {team.name}
                                    </div>
                                    <div className="hv-team-job-count">
                                      {assignedProps.length > 0
                                        ? `${assignedProps.length} jobs`
                                        : "Free"}
                                    </div>
                                  </div>
                                </div>
                                <ChevronDown
                                  size={16}
                                  color="#94a3b8"
                                  className={`hv-team-chevron${isExpanded ? " expanded" : ""}`}
                                />
                              </div>
                              <div className="hv-team-progress-track">
                                <div
                                  className={`hv-team-progress-fill${assignedProps.length > 0 ? " filled" : ""}`}
                                  style={
                                    {
                                      "--team-color": team.color,
                                    } as CSSProperties
                                  }
                                ></div>
                              </div>

                              {isExpanded && (
                                <div className="hv-team-jobs-list">
                                  {assignedProps.length === 0 ? (
                                    <span className="hv-team-jobs-empty">
                                      No hay casas asignadas a este equipo.
                                    </span>
                                  ) : (
                                    assignedProps.map((prop) => {
                                      const stProp = statuses.find(
                                        (s) =>
                                          s.id === prop.statusId ||
                                          s.name === prop.statusId,
                                      );
                                      const isRecall =
                                        stProp?.name?.toLowerCase() ===
                                          "recall" ||
                                        prop.statusId?.toLowerCase() ===
                                          "recall";
                                      const prObj = priorities.find(
                                        (pp) =>
                                          pp.id === prop.priorityId ||
                                          pp.name === prop.priorityId,
                                      );
                                      const isHigh =
                                        prObj?.name?.toLowerCase() === "high" ||
                                        prop.priorityId?.toLowerCase() ===
                                          "high";
                                      return (
                                        <div
                                          key={prop.id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenDetail(prop);
                                          }}
                                          className="hv-team-job-item"
                                          style={
                                            {
                                              "--job-border": isRecall
                                                ? "#fca5a5"
                                                : isHigh
                                                  ? "#fdba74"
                                                  : "#e2e8f0",
                                            } as CSSProperties
                                          }
                                        >
                                          <div className="hv-team-job-top">
                                            <div className="hv-team-job-name">
                                              {getClientName(prop.client)}
                                            </div>
                                            <div className="hv-team-job-flags">
                                              {isRecall && (
                                                <span className="hv-badge-recall">
                                                  Recall
                                                </span>
                                              )}
                                              {isHigh && (
                                                <span
                                                  title="HIGH priority"
                                                  className="hv-badge-high-orange"
                                                >
                                                  <AlertTriangle size={10} />{" "}
                                                  High
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          <div className="hv-team-job-address">
                                            <MapPin size={10} />{" "}
                                            {prop.address || "-"}
                                          </div>
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
        </>
      )}

      {/* --- FORM MODAL TIPO WORK ORDER --- */}
      {isFormModalOpen && (
        <div className="modal-overlay-centered" onClick={handleCloseForm}>
          <div className="modal-full" onClick={(e) => e.stopPropagation()}>
            <div className="modal-full-left">
              <div className="hv-form-inner">
                <div className="hv-form-top-row">
                  <h2 className="hv-form-title">
                    {formData.id
                      ? "Edit Property Details"
                      : "Register New Property"}
                  </h2>
                  {(isSuperAdmin ||
                    activeRole?.permissions?.find(
                      (p) => p.module === "Roles & Permissions",
                    )?.canEdit) && (
                    <button
                      type="button"
                      onClick={openFieldConfigModal}
                      className="hv-btn-configure"
                      title="Configure which fields each role can see"
                    >
                      <Settings size={16} /> Configure Fields
                    </button>
                  )}
                </div>

                {/* CARD 1: GENERAL INFO */}
                <div className="hv-form-card">
                  <h3 className="hv-form-card-title">
                    <User size={20} color="#3B82F6" /> General Information
                  </h3>
                  <div className="hv-form-grid cols-300">
                    {isElementVisible("client") && (
                      <div>
                        <label className="hv-label">
                          Client <span className="hv-required">*</span>
                        </label>
                        <div className="hv-client-row">
                          <div className="hv-flex-1-minw0">
                            <SearchableSelect
                              options={customersList}
                              value={formData.client}
                              onChange={handleCustomerSelect}
                              placeholder="Type to search Client..."
                              icon={User}
                              returnKey="id"
                              disabled={isFieldRO("client")}
                            />
                            {(() => {
                              // ⭐ Muestra el TIPO del cliente seleccionado (viene de la colección customers)
                              const selCust = customersList.find(
                                (c) => c.id === formData.client,
                              );
                              if (!selCust?.type) return null;
                              const typeKey = String(selCust.type)
                                .toLowerCase()
                                .trim()
                                .replace(/\s+/g, "-");
                              return (
                                <span
                                  className={`hv-client-type-badge ${typeKey}`}
                                >
                                  <User size={11} /> {selCust.type}
                                </span>
                              );
                            })()}
                          </div>
                          <button
                            type="button"
                            onClick={handleOpenCustomerModal}
                            title="Agregar nuevo cliente"
                            aria-label="Agregar nuevo cliente"
                            className="hv-btn-add-customer"
                          >
                            <Plus size={28} strokeWidth={2.5} color="#ffffff" />
                          </button>
                        </div>
                      </div>
                    )}
                    {isElementVisible("address") && (
                      <div>
                        <label className="hv-label">
                          Address <span className="hv-required">*</span>
                        </label>
                        <div className="hv-input-wrap">
                          <MapPin className="hv-input-icon" size={16} />
                          <input
                            type="text"
                            className="hv-input"
                            placeholder="Enter full address..."
                            value={formData.address}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                address: e.target.value,
                              })
                            }
                            disabled={isFieldRO("address")}
                          />
                        </div>
                        {/* ⭐ Mapa de la dirección (aparece al escribirla; sin API key) */}
                        {mapAddress && (
                          <div className="hv-map-wrap">
                            <iframe
                              className="hv-map-iframe"
                              title="Mapa de la dirección"
                              src={`https://maps.google.com/maps?q=${encodeURIComponent(mapAddress)}&z=15&output=embed`}
                              loading="lazy"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* CARD 2: LOGISTICS & SETTINGS */}
                <div className="hv-form-card">
                  <h3 className="hv-form-card-title">
                    <Settings size={20} color="#8B5CF6" /> Logistics & Settings
                  </h3>
                  <div className="hv-form-grid cols-200">
                    {isElementVisible("statusId") && (
                      <div>
                        <label className="hv-label">
                          Status <span className="hv-required">*</span>
                        </label>
                        <SearchableSelect
                          options={statuses}
                          value={formData.statusId}
                          onChange={(val: string) =>
                            setFormData({ ...formData, statusId: val })
                          }
                          placeholder="Select Status..."
                          icon={Activity}
                          disabled={isFieldRO("statusId")}
                        />
                      </div>
                    )}
                    {isElementVisible("invoiceStatus") && (
                      <div>
                        <label className="hv-label">Invoice Status</label>
                        <SearchableSelect
                          options={invoiceOptions}
                          value={formData.invoiceStatus}
                          onChange={(val: string) =>
                            setFormData({ ...formData, invoiceStatus: val })
                          }
                          placeholder="Select Invoice Status..."
                          icon={FileText}
                          disabled={isFieldRO("invoiceStatus")}
                        />
                      </div>
                    )}
                    {isElementVisible("serviceId") && (
                      <div>
                        <label className="hv-label">Services</label>
                        <SearchableSelect
                          options={services}
                          value={formData.serviceId}
                          onChange={(val: string) =>
                            setFormData({ ...formData, serviceId: val })
                          }
                          placeholder="Select Service..."
                          icon={Wrench}
                          disabled={isFieldRO("serviceId")}
                        />
                      </div>
                    )}
                    {isElementVisible("priorityId") && (
                      <div>
                        <label className="hv-label">Priority</label>
                        <SearchableSelect
                          options={priorities}
                          value={formData.priorityId}
                          onChange={(val: string) =>
                            setFormData({ ...formData, priorityId: val })
                          }
                          placeholder="Select Priority..."
                          icon={Flag}
                          disabled={isFieldRO("priorityId")}
                        />
                      </div>
                    )}
                    {isElementVisible("rooms") && (
                      <div>
                        <label className="hv-label">Rooms</label>
                        <SearchableSelect
                          options={roomOptions}
                          value={formData.rooms}
                          onChange={(val: string) =>
                            setFormData({ ...formData, rooms: val })
                          }
                          placeholder="Rooms..."
                          icon={Hash}
                          disabled={isFieldRO("rooms")}
                        />
                      </div>
                    )}
                    {isElementVisible("bathrooms") && (
                      <div>
                        <label className="hv-label">Bathrooms</label>
                        <SearchableSelect
                          options={roomOptions}
                          value={formData.bathrooms}
                          onChange={(val: string) =>
                            setFormData({ ...formData, bathrooms: val })
                          }
                          placeholder="Bathrooms..."
                          icon={Hash}
                          disabled={isFieldRO("bathrooms")}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* CARD 3: SCHEDULE & TEAM */}
                <div className="hv-form-card">
                  <h3 className="hv-form-card-title">
                    <CalendarClock size={20} color="#10B981" /> Schedule & Team
                  </h3>
                  <div className="hv-form-grid cols-200">
                    {isElementVisible("receiveDate") && (
                      <div>
                        <label className="hv-label">Receive Date</label>
                        <div className="hv-input-wrap">
                          <CalendarDays className="hv-input-icon" size={16} />
                          <input
                            type="date"
                            className="hv-input"
                            value={formData.receiveDate}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                receiveDate: e.target.value,
                              })
                            }
                            disabled={isFieldRO("receiveDate")}
                          />
                        </div>
                      </div>
                    )}
                    {isElementVisible("scheduleDate") && (
                      <div>
                        <label className="hv-label">Schedule Date</label>
                        <div className="hv-input-wrap">
                          <CalendarDays className="hv-input-icon" size={16} />
                          <input
                            type="date"
                            className="hv-input"
                            value={formData.scheduleDate}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                scheduleDate: e.target.value,
                              })
                            }
                            disabled={isFieldRO("scheduleDate")}
                          />
                        </div>
                      </div>
                    )}
                    {isElementVisible("dateOfIssue") && (
                      <div>
                        <label className="hv-label">Date of Issue</label>
                        <div className="hv-input-wrap">
                          <CalendarDays className="hv-input-icon" size={16} />
                          <input
                            type="date"
                            className="hv-input"
                            value={formData.dateOfIssue || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                dateOfIssue: e.target.value,
                              })
                            }
                            disabled={isFieldRO("dateOfIssue")}
                          />
                        </div>
                      </div>
                    )}
                    {isElementVisible("dueDate") && (
                      <div>
                        <label className="hv-label">Due Date</label>
                        <div className="hv-input-wrap">
                          <CalendarDays className="hv-input-icon" size={16} />
                          <input
                            type="date"
                            className="hv-input"
                            value={formData.dueDate || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                dueDate: e.target.value,
                              })
                            }
                            disabled={isFieldRO("dueDate")}
                          />
                        </div>
                      </div>
                    )}
                    {isElementVisible("timeIn") && (
                      <div>
                        <label className="hv-label">Time In</label>
                        <div className="hv-input-wrap">
                          <Clock className="hv-input-icon" size={16} />
                          <input
                            type="time"
                            className="hv-input"
                            value={formData.timeIn}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                timeIn: e.target.value,
                              })
                            }
                            disabled={isFieldRO("timeIn")}
                          />
                        </div>
                      </div>
                    )}
                    {isElementVisible("timeOut") && (
                      <div>
                        <label className="hv-label">Time Out</label>
                        <div className="hv-input-wrap">
                          <Clock className="hv-input-icon" size={16} />
                          <input
                            type="time"
                            className="hv-input"
                            value={formData.timeOut}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                timeOut: e.target.value,
                              })
                            }
                            disabled={isFieldRO("timeOut")}
                          />
                        </div>
                      </div>
                    )}
                    {isElementVisible("teamId") && (
                      <div className="hv-full-col">
                        <label className="hv-label">Team</label>
                        <SearchableSelect
                          options={teams}
                          value={formData.teamId}
                          onChange={(val: string) => {
                            const teamWorkers = employees
                              .filter((emp) => emp.teamId === val)
                              .map((emp) => emp.id);
                            setFormData({
                              ...formData,
                              teamId: val,
                              assignedWorkers: teamWorkers,
                            });
                          }}
                          placeholder="Type to search Team..."
                          icon={Users}
                          returnKey="id"
                          disabled={isFieldRO("teamId")}
                        />
                      </div>
                    )}
                  </div>

                  {isElementVisible("assignedWorkers") && (
                    <div className="hv-workers-box">
                      <div className="hv-workers-header">
                        <span className="hv-label">
                          <User size={14} className="hv-label-icon-inline" />{" "}
                          Assigned Workers
                        </span>
                        <div className="hv-relative">
                          <button
                            type="button"
                            onClick={() =>
                              setIsAssigningWorkerForm(!isAssigningWorkerForm)
                            }
                            disabled={isSaving || isFieldRO("assignedWorkers")}
                            title={
                              isFieldRO("assignedWorkers")
                                ? "Campo de solo lectura para tu rol"
                                : undefined
                            }
                            className="hv-btn-toggle-workers"
                          >
                            {isAssigningWorkerForm
                              ? "Close"
                              : "+ Assign / Remove"}
                          </button>
                          {isAssigningWorkerForm && (
                            <div className="hv-workers-dropdown">
                              <div className="hv-workers-search-head">
                                <div className="hv-workers-search-wrap">
                                  <Search
                                    size={14}
                                    color="#94a3b8"
                                    className="hv-workers-search-icon"
                                  />
                                  <input
                                    autoFocus
                                    type="text"
                                    value={workerSearch}
                                    onChange={(e) =>
                                      setWorkerSearch(e.target.value)
                                    }
                                    placeholder="Buscar empleado..."
                                    className="hv-workers-search-input"
                                  />
                                </div>
                              </div>
                              {(() => {
                                const q = workerSearch.trim().toLowerCase();
                                const list = employees.filter((emp) => {
                                  if (!q) return true;
                                  return `${emp.firstName || ""} ${emp.lastName || ""}`
                                    .toLowerCase()
                                    .includes(q);
                                });
                                if (list.length === 0) {
                                  return (
                                    <div className="hv-workers-empty">
                                      Sin resultados
                                    </div>
                                  );
                                }
                                return list.map((emp) => {
                                  const isAssigned = (
                                    formData.assignedWorkers || []
                                  ).includes(emp.id);
                                  return (
                                    <div
                                      key={emp.id}
                                      onClick={() =>
                                        toggleWorkerAssignmentForm(emp.id)
                                      }
                                      className={`hv-worker-option${isAssigned ? " assigned" : ""}`}
                                    >
                                      <span
                                        className={`hv-worker-name${isAssigned ? " assigned" : ""}`}
                                      >
                                        {emp.firstName} {emp.lastName}
                                      </span>
                                      {isAssigned && (
                                        <CheckSquare
                                          size={14}
                                          color="#3b82f6"
                                        />
                                      )}
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="hv-worker-chips">
                        {!(
                          formData.assignedWorkers &&
                          formData.assignedWorkers.length > 0
                        ) ? (
                          <span className="hv-workers-none-text">
                            No workers assigned specifically for this job yet.
                            Select a Team to auto-fill or add manually.
                          </span>
                        ) : (
                          formData.assignedWorkers.map((workerId) => {
                            const emp = employees.find(
                              (e) => e.id === workerId,
                            );
                            if (!emp) return null;
                            return (
                              <div key={workerId} className="hv-worker-chip">
                                <User size={12} color="#64748b" />
                                {emp.firstName} {emp.lastName}
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleWorkerAssignmentForm(workerId)
                                  }
                                  className="hv-chip-remove-btn"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* CARD 4: BILLED SERVICES */}
                {isVisible("financial") &&
                  isElementVisible("card_billedServices") && (
                    <div className="hv-form-card">
                      <div className="hv-card-header-row">
                        <h3 className="hv-form-card-title hv-no-mb">
                          <Layers size={20} color="#F59E0B" /> Billed Services
                        </h3>
                        <button
                          type="button"
                          onClick={() => handleOpenServiceForm(undefined, true)}
                          className="btn btn-primary hv-btn-add-service"
                        >
                          <Plus size={16} /> Add Service
                        </button>
                      </div>

                      <div className="hv-service-table-wrap">
                        <table className="hv-service-table">
                          <thead>
                            <tr>
                              <th className="hv-service-th">Service</th>
                              <th className="hv-service-th center">Qty</th>
                              <th className="hv-service-th right">Price</th>
                              <th className="hv-service-th right">Tax</th>
                              <th className="hv-service-th right">Total</th>
                              <th className="hv-service-th right">
                                Total -Tax
                              </th>
                              <th className="hv-service-th right">Act</th>
                            </tr>
                          </thead>
                          <tbody>
                            {formServices.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={7}
                                  className="hv-service-empty-row"
                                >
                                  No services added yet.
                                </td>
                              </tr>
                            ) : (
                              formServices.map((record) => {
                                return (
                                  <tr key={record.id}>
                                    <td className="hv-service-td strong">
                                      {getServiceName(record.serviceId)}
                                    </td>
                                    <td className="hv-service-td center">
                                      {record.quantity}
                                    </td>
                                    <td className="hv-service-td right">
                                      ${Number(record.price).toFixed(2)}
                                    </td>
                                    <td
                                      className={`hv-service-td right tax ${record.taxAmount > 0 ? "positive" : "neutral"}`}
                                    >
                                      {record.taxAmount > 0
                                        ? `+$${record.taxAmount.toFixed(2)}`
                                        : record.minusTax === "Yes"
                                          ? `-$${Math.abs(record.taxAmount).toFixed(2)}`
                                          : "$0.00"}
                                    </td>
                                    <td className="hv-service-td right total">
                                      ${Number(record.total).toFixed(2)}
                                    </td>
                                    <td className="hv-service-td right total-minus-tax">
                                      ${recordTotalMinusTax(record).toFixed(2)}
                                    </td>
                                    <td className="hv-service-td right">
                                      <div className="hv-service-actions-row">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleOpenServiceForm(record, true)
                                          }
                                          className="hv-service-action-btn edit"
                                        >
                                          <Edit2 size={14} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleDeleteServiceLocal(
                                              record.id as string,
                                            )
                                          }
                                          className="hv-service-action-btn delete"
                                        >
                                          <Trash2 size={14} />
                                        </button>
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
                <div className="hv-form-card">
                  <h3 className="hv-form-card-title">
                    <StickyNote size={20} color="#F43F5E" /> Notes
                  </h3>
                  <div className="hv-notes-col">
                    {isElementVisible("note") && (
                      <div>
                        <label className="hv-label">General Note</label>
                        <textarea
                          className="hv-input hv-textarea"
                          placeholder="General instructions or notes..."
                          value={formData.note}
                          onChange={(e) =>
                            setFormData({ ...formData, note: e.target.value })
                          }
                          disabled={isFieldRO("note")}
                        ></textarea>
                      </div>
                    )}
                    {isElementVisible("employeeNote") && (
                      <div>
                        <label className="hv-label danger">
                          Employee's Note
                        </label>
                        <textarea
                          className="hv-input hv-textarea danger"
                          placeholder="Employee performance notes..."
                          value={formData.employeeNote}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              employeeNote: e.target.value,
                            })
                          }
                          disabled={isFieldRO("employeeNote")}
                        ></textarea>
                      </div>
                    )}
                  </div>
                </div>

                {/* CARD 6: PHOTOS EN EL FORMULARIO */}
                {isVisible("media") && isElementVisible("card_photos") && (
                  <div className="hv-form-card">
                    <h3 className="hv-form-card-title">
                      <ImageIcon size={20} color="#0EA5E9" /> Photos
                    </h3>
                    <div className="hv-form-grid cols-280">
                      <div>
                        {isElementVisible("btn_takePhoto") && (
                          <button
                            type="button"
                            onClick={() => openBurstCamera("before")}
                            disabled={isSaving}
                            className="hv-btn-camera before"
                          >
                            <Camera size={18} /> Cámara rápida · Before
                          </button>
                        )}
                        <PhotoSection
                          label="Before"
                          type="before"
                          urls={beforePhotoURLs}
                          excludedUrls={beforeExcluded}
                          pendingCount={pendingForHouse.before}
                          canEdit={isElementVisible("btn_uploadPhoto")}
                          isSaving={isSaving}
                          isCompressing={isCompressing}
                          photoConfig={photoConfig}
                          reportSelectable
                          onAddFiles={(f: FileList | null) =>
                            addPhotoFiles(f, "before")
                          }
                          onRemove={(i: number) =>
                            handleRemovePhoto(i, "before")
                          }
                          onToggleReport={(u: string) =>
                            toggleReportPhoto(u, "before")
                          }
                        />
                      </div>
                      <div>
                        {isElementVisible("btn_takePhoto") && (
                          <button
                            type="button"
                            onClick={() => openBurstCamera("after")}
                            disabled={isSaving}
                            className="hv-btn-camera after"
                          >
                            <Camera size={18} /> Cámara rápida · After
                          </button>
                        )}
                        <PhotoSection
                          label="After"
                          type="after"
                          urls={afterPhotoURLs}
                          excludedUrls={afterExcluded}
                          pendingCount={pendingForHouse.after}
                          canEdit={isElementVisible("btn_uploadPhoto")}
                          isSaving={isSaving}
                          isCompressing={isCompressing}
                          photoConfig={photoConfig}
                          reportSelectable
                          onAddFiles={(f: FileList | null) =>
                            addPhotoFiles(f, "after")
                          }
                          onRemove={(i: number) =>
                            handleRemovePhoto(i, "after")
                          }
                          onToggleReport={(u: string) =>
                            toggleReportPhoto(u, "after")
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* LADO DERECHO: SUMMARY & ACTIONS */}
            <aside className="modal-full-right">
              <div className="hv-summary-content">
                <div>
                  <h2 className="hv-summary-title">
                    Job Summary
                    <span className="hv-summary-status-pill">
                      {getRelationName(statuses, formData.statusId, "New")}
                    </span>
                  </h2>
                  <p className="hv-summary-subtitle">
                    {formData.id ? "Edit Job" : "New Job"} •{" "}
                    {getRelationName(services, formData.serviceId, "Standard")}
                  </p>
                </div>

                {anyVisible("client", "address") && (
                  <div className="hv-info-box">
                    <div className="hv-info-box-header">
                      <div className="hv-info-icon-badge indigo">
                        <User size={16} />
                      </div>
                      <h4 className="hv-info-box-label">Client Details</h4>
                    </div>
                    <div className="hv-info-box-body">
                      {isElementVisible("client") && (
                        <p
                          className={`hv-info-primary-text${formData.client ? " filled" : ""}`}
                        >
                          {formData.client
                            ? getClientName(formData.client)
                            : "Not defined"}
                        </p>
                      )}
                      {isElementVisible("address") && formData.address && (
                        <p className="hv-info-secondary-text">
                          {formData.address}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {anyVisible("scheduleDate", "timeIn", "timeOut", "teamId") && (
                  <div className="hv-info-box">
                    <div className="hv-info-box-header">
                      <div className="hv-info-icon-badge green">
                        <CalendarClock size={16} />
                      </div>
                      <h4 className="hv-info-box-label">Timing & Assignment</h4>
                    </div>
                    <div className="hv-info-box-body">
                      {isElementVisible("scheduleDate") && (
                        <p className="hv-schedule-date">
                          {formData.scheduleDate
                            ? formatDate(formData.scheduleDate)
                            : "No date set"}
                        </p>
                      )}
                      {anyVisible("timeIn", "timeOut") && (
                        <p className="hv-schedule-time">
                          {isElementVisible("timeIn") ? formData.timeIn : ""}{" "}
                          {isElementVisible("timeOut") && formData.timeOut
                            ? `- ${formData.timeOut}`
                            : ""}
                        </p>
                      )}
                      {isElementVisible("teamId") && (
                        <p className="hv-schedule-team">
                          Team:{" "}
                          {getRelationName(
                            teams,
                            formData.teamId,
                            "Unassigned",
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {isVisible("financial") &&
                  isElementVisible("card_billedServices") && (
                    <div className="hv-cost-summary">
                      <div className="hv-cost-header-row">
                        <Receipt size={18} color="#0F172A" />
                        <h4 className="hv-cost-title">Service Costs</h4>
                      </div>
                      <div className="hv-cost-rows">
                        <div className="hv-cost-row">
                          <span>Items Count</span>{" "}
                          <span>{formServices.length}</span>
                        </div>
                        <div className="hv-cost-divider"></div>
                        <div className="hv-cost-total-row">
                          <span className="hv-cost-total-label">Total</span>
                          <span className="hv-cost-total-value">
                            ${formTotalBilled.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
              </div>

              <div className="hv-summary-footer">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="hv-btn-save-form"
                >
                  <Save size={18} /> {isSaving ? "Saving..." : "Confirm & Save"}
                </button>
                <button
                  onClick={handleCloseForm}
                  disabled={isSaving}
                  className="hv-btn-cancel-form"
                >
                  <XCircle size={18} /> Cancel
                </button>
              </div>
            </aside>
          </div>
        </div>
      )}

      {/* --- DETAIL MODAL --- */}
      {isDetailModalOpen && selectedHouse && (
        <div
          className="modal-overlay-centered"
          onClick={() => setIsDetailModalOpen(false)}
        >
          <div className="modal-90" onClick={(e) => e.stopPropagation()}>
            <header className="hv-modal-header">
              <div className="hv-detail-title-group">
                <h3 className="hv-modal-title">
                  {isElementVisible("client")
                    ? getClientName(selectedHouse.client)
                    : "Property Overview"}
                </h3>
                {selectedHouse.employeeFinishedBy && (
                  <span className="hv-finished-badge">
                    <CheckCircle size={14} />
                    Finished by {
                      selectedHouse.employeeFinishedBy.split(" ")[0]
                    }{" "}
                    ({formatDateTime(selectedHouse.employeeFinishedAt)})
                  </span>
                )}
              </div>
              <div className="hv-detail-actions">
                {isVisible("workflow") && isElementVisible("btn_sync") && (
                  <button
                    onClick={handleGoogleCalendarSync}
                    className="hv-action-btn sync"
                  >
                    <Calendar size={16} /> Sync
                  </button>
                )}
                {isVisible("workflow") &&
                  isElementVisible("btn_startJob") &&
                  (() => {
                    const started = !!selectedHouse.employeeStartedBy;
                    const startLocked = started && !canUndoStart(selectedHouse);
                    return (
                      <button
                        onClick={started ? handleUndoStart : handleStartJob}
                        disabled={
                          isSaving ||
                          !!selectedHouse.employeeFinishedBy ||
                          startLocked
                        }
                        title={
                          started
                            ? `Iniciado por ${selectedHouse.employeeStartedBy} · ${formatDateTime(selectedHouse.employeeStartedAt)}${startLocked ? " — solo esa persona (o un admin) puede deshacerlo" : " — clic para deshacer"}`
                            : "Marcar inicio del trabajo"
                        }
                        className={`hv-action-btn start${started ? " done" : ""}`}
                      >
                        <PlayCircle
                          size={16}
                          color={started ? "#64748b" : "currentColor"}
                        />
                        {started
                          ? `Iniciado: ${selectedHouse.employeeStartedBy}`
                          : "Start Job"}
                      </button>
                    );
                  })()}
                {isVisible("workflow") &&
                  isElementVisible("btn_markFinished") &&
                  (() => {
                    const started = !!selectedHouse.employeeStartedBy;
                    const finished = !!selectedHouse.employeeFinishedBy;
                    const finishLocked =
                      finished && !canUndoFinish(selectedHouse);
                    return (
                      <button
                        onClick={
                          finished ? handleUndoFinished : handleMarkAsFinished
                        }
                        disabled={
                          isSaving || (!started && !finished) || finishLocked
                        }
                        title={
                          finished
                            ? `Terminado por ${selectedHouse.employeeFinishedBy} · ${formatDateTime(selectedHouse.employeeFinishedAt)}${finishLocked ? " — solo esa persona (o un admin) puede deshacerlo" : " — clic para deshacer"}`
                            : started
                              ? "Marcar trabajo terminado"
                              : "Primero se debe marcar Start Job"
                        }
                        className={`hv-action-btn finish${finished ? " done" : ""}`}
                      >
                        <CheckCircle
                          size={16}
                          color={finished ? "#10b981" : "currentColor"}
                        />
                        {finished
                          ? `Terminado: ${selectedHouse.employeeFinishedBy}`
                          : "Mark Finished"}
                      </button>
                    );
                  })()}
                {canEdit &&
                  isVisible("financial") &&
                  isElementVisible("btn_pay") && (
                    <button
                      onClick={() => handleOpenPayrollForm(selectedHouse.id)}
                      disabled={isSaving}
                      className="hv-action-btn pay"
                    >
                      <DollarSign size={16} /> Pay
                    </button>
                  )}
                {canEdit &&
                  isVisible("admin") &&
                  isElementVisible("btn_duplicate") && (
                    <button
                      onClick={handleDuplicate}
                      disabled={isSaving}
                      className="hv-action-btn duplicate"
                    >
                      <Copy size={16} /> Duplicate
                    </button>
                  )}
                <button
                  className="hv-detail-close-btn"
                  onClick={() => setIsDetailModalOpen(false)}
                >
                  <X size={24} />
                </button>
              </div>
            </header>

            <div className="modal-body-scroll hv-detail-body">
              {isElementVisible("address") && (
                <div className="hv-detail-address-row">
                  <MapPin size={18} color="#3b82f6" /> {selectedHouse.address}
                </div>
              )}

              {/* ⭐ SELECTOR DE STATUS PROMINENTE — mover la casa de lugar fácilmente */}
              {isVisible("workflow") && isElementVisible("statusId") && (
                <div className="hv-status-banner">
                  <div className="hv-status-banner-head">
                    <div className="hv-status-banner-icon">
                      <Activity size={18} color="#2563eb" />
                    </div>
                    <div>
                      <div className="hv-status-banner-title">
                        Estado del trabajo
                      </div>
                      <div className="hv-status-banner-subtitle">
                        Toca para mover la casa de lugar
                      </div>
                    </div>
                  </div>
                  <StatusPillSelector
                    large
                    currentStatusId={selectedHouse.statusId}
                    statuses={statuses}
                    onChange={(newId: string) =>
                      handleQuickStatusChange(selectedHouse.id, newId)
                    }
                    disabled={isSaving || !canEdit || isFieldRO("statusId")}
                    onRequestOpen={setStatusModal}
                    modalTitle={getClientName(selectedHouse.client)}
                    modalSubtitle={selectedHouse.address}
                  />
                </div>
              )}

              <div className="hv-detail-tabs">
                <button
                  className={`hv-detail-tab${activeDetailTab === "overview" ? " active" : ""}`}
                  onClick={() => setActiveDetailTab("overview")}
                >
                  <Briefcase size={14} className="hv-tab-icon-inline" />{" "}
                  Overview & Log
                </button>
                {isVisible("financial") &&
                  isElementVisible("btn_tabFinancials") && (
                    <button
                      className={`hv-detail-tab${activeDetailTab === "financials" ? " active" : ""}`}
                      onClick={() => setActiveDetailTab("financials")}
                    >
                      <BarChart3 size={14} className="hv-tab-icon-inline" />{" "}
                      Financials & Billing
                    </button>
                  )}
                {isVisible("media") && isElementVisible("btn_tabMedia") && (
                  <button
                    className={`hv-detail-tab${activeDetailTab === "media" ? " active" : ""}`}
                    onClick={() => setActiveDetailTab("media")}
                  >
                    <FileImage size={14} className="hv-tab-icon-inline" /> Notes
                    & Photos
                  </button>
                )}
              </div>

              {activeDetailTab === "overview" && (
                <div className="fade-in">
                  <div className="hv-detail-grid">
                    {anyVisible(
                      "receiveDate",
                      "scheduleDate",
                      "dateOfIssue",
                      "dueDate",
                      "timeIn",
                      "timeOut",
                    ) && (
                      <div className="hv-info-card">
                        <div className="hv-info-header">
                          <CalendarDays
                            size={14}
                            className="hv-icon-inline-tb"
                          />{" "}
                          Schedule & Timing
                        </div>
                        {isElementVisible("receiveDate") && (
                          <div className="hv-info-row">
                            <span className="hv-info-label">Receive Date</span>
                            <span className="hv-info-value">
                              {selectedHouse.receiveDate
                                ? formatDate(selectedHouse.receiveDate)
                                : "-"}
                            </span>
                          </div>
                        )}
                        {isElementVisible("scheduleDate") && (
                          <div className="hv-info-row">
                            <span className="hv-info-label">Schedule Date</span>
                            <span className="hv-info-value">
                              {selectedHouse.scheduleDate
                                ? formatDate(selectedHouse.scheduleDate)
                                : "-"}
                            </span>
                          </div>
                        )}
                        {isElementVisible("dateOfIssue") && (
                          <div className="hv-info-row">
                            <span className="hv-info-label">Date of Issue</span>
                            <span className="hv-info-value">
                              {selectedHouse.dateOfIssue
                                ? formatDate(selectedHouse.dateOfIssue)
                                : "-"}
                            </span>
                          </div>
                        )}
                        {isElementVisible("dueDate") && (
                          <div className="hv-info-row">
                            <span className="hv-info-label">Due Date</span>
                            <span className="hv-info-value">
                              {selectedHouse.dueDate
                                ? formatDate(selectedHouse.dueDate)
                                : "-"}
                            </span>
                          </div>
                        )}
                        {isElementVisible("timeIn") && (
                          <div className="hv-info-row">
                            <span className="hv-info-label">Time In</span>
                            <span className="hv-info-value">
                              <Clock size={12} color="#94a3b8" />{" "}
                              {selectedHouse.timeIn || "-"}
                            </span>
                          </div>
                        )}
                        {isElementVisible("timeOut") && (
                          <div className="hv-info-row no-border">
                            <span className="hv-info-label">Time Out</span>
                            <span className="hv-info-value">
                              <Clock size={12} color="#94a3b8" />{" "}
                              {selectedHouse.timeOut || "-"}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {anyVisible(
                      "serviceId",
                      "priorityId",
                      "rooms",
                      "bathrooms",
                    ) && (
                      <div className="hv-info-card">
                        <div className="hv-info-header">
                          <Wrench size={14} className="hv-icon-inline-tb" /> Job
                          Specifications
                        </div>
                        {isElementVisible("serviceId") && (
                          <div className="hv-info-row">
                            <span className="hv-info-label">Service</span>
                            <span className="hv-info-value">
                              {getRelationName(
                                services,
                                selectedHouse.serviceId,
                              )}
                            </span>
                          </div>
                        )}
                        {isElementVisible("priorityId") && (
                          <div className="hv-info-row">
                            <span className="hv-info-label">Priority</span>
                            <span className="hv-info-value">
                              {getRelationColor(
                                priorities,
                                selectedHouse.priorityId,
                              ) && (
                                <span
                                  className="hv-dot-10"
                                  style={
                                    {
                                      "--dot-color": getRelationColor(
                                        priorities,
                                        selectedHouse.priorityId,
                                      ),
                                    } as CSSProperties
                                  }
                                ></span>
                              )}
                              {getRelationName(
                                priorities,
                                selectedHouse.priorityId,
                              )}
                            </span>
                          </div>
                        )}
                        {isElementVisible("rooms") && (
                          <div className="hv-info-row">
                            <span className="hv-info-label">Rooms</span>
                            <span className="hv-info-value">
                              <Hash size={12} color="#94a3b8" />{" "}
                              {selectedHouse.rooms || "-"}
                            </span>
                          </div>
                        )}
                        {isElementVisible("bathrooms") && (
                          <div className="hv-info-row no-border">
                            <span className="hv-info-label">Bathrooms</span>
                            <span className="hv-info-value">
                              <Hash size={12} color="#94a3b8" />{" "}
                              {selectedHouse.bathrooms || "-"}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {anyVisible("statusId", "invoiceStatus", "teamId") && (
                      <div className="hv-info-card">
                        <div className="hv-info-header">
                          <Activity size={14} className="hv-icon-inline-tb" />{" "}
                          Status & Assignment
                        </div>
                        {isElementVisible("statusId") && (
                          <div className="hv-info-row">
                            <span className="hv-info-label">Job Status</span>
                            <div className="hv-text-right">
                              <StatusPillSelector
                                currentStatusId={selectedHouse.statusId}
                                statuses={statuses}
                                onChange={(newId: string) =>
                                  handleQuickStatusChange(
                                    selectedHouse.id,
                                    newId,
                                  )
                                }
                                disabled={
                                  isSaving ||
                                  !canEdit ||
                                  !isVisible("workflow") ||
                                  isFieldRO("statusId")
                                }
                                onRequestOpen={setStatusModal}
                                modalTitle={getClientName(selectedHouse.client)}
                                modalSubtitle={selectedHouse.address}
                              />
                            </div>
                          </div>
                        )}
                        {isElementVisible("invoiceStatus") && (
                          <div className="hv-info-row">
                            <span className="hv-info-label">
                              Invoice Status
                            </span>
                            <span className="hv-info-value hv-invoice-status-badge">
                              {selectedHouse.invoiceStatus || "-"}
                            </span>
                          </div>
                        )}
                        {isElementVisible("teamId") && (
                          <div className="hv-info-row no-border">
                            <span className="hv-info-label">Assigned Team</span>
                            <span className="hv-info-value">
                              {getRelationColor(
                                teams,
                                selectedHouse.teamId,
                              ) && (
                                <span
                                  className="hv-dot-10"
                                  style={
                                    {
                                      "--dot-color": getRelationColor(
                                        teams,
                                        selectedHouse.teamId,
                                      ),
                                    } as CSSProperties
                                  }
                                ></span>
                              )}
                              {getRelationName(
                                teams,
                                selectedHouse.teamId,
                                "Unassigned",
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="hv-detail-grid no-mb">
                    {isElementVisible("assignedWorkers") && (
                      <div className="hv-subcard">
                        <div className="hv-workers-header">
                          <span className="hv-detail-label">
                            <User size={14} className="hv-label-icon-inline" />{" "}
                            SPECIFIC ASSIGNED WORKERS
                          </span>

                          {canEdit && isVisible("admin") && (
                            <div className="hv-relative">
                              <button
                                onClick={() =>
                                  setIsAssigningWorker(!isAssigningWorker)
                                }
                                disabled={isSaving}
                                className="hv-btn-toggle-workers"
                              >
                                {isAssigningWorker
                                  ? "Close"
                                  : "+ Assign / Remove"}
                              </button>

                              {isAssigningWorker && (
                                <div className="hv-workers-dropdown-sm">
                                  <div className="hv-workers-dropdown-label">
                                    ALL EMPLOYEES
                                  </div>
                                  {employees.map((emp) => {
                                    const isAssigned = (
                                      selectedHouse.assignedWorkers || []
                                    ).includes(emp.id);
                                    return (
                                      <div
                                        key={emp.id}
                                        onClick={() =>
                                          toggleWorkerAssignmentDetail(emp.id)
                                        }
                                        className={`hv-worker-option${isAssigned ? " assigned" : ""}`}
                                      >
                                        <span
                                          className={`hv-worker-name${isAssigned ? " assigned" : ""}`}
                                        >
                                          {emp.firstName} {emp.lastName}
                                        </span>
                                        {isAssigned && (
                                          <CheckSquare
                                            size={14}
                                            color="#3b82f6"
                                          />
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="hv-worker-chips">
                          {!(
                            selectedHouse.assignedWorkers &&
                            selectedHouse.assignedWorkers.length > 0
                          ) ? (
                            <span className="hv-workers-none-text">
                              No specific workers assigned.
                            </span>
                          ) : (
                            selectedHouse.assignedWorkers.map((workerId) => {
                              const emp = employees.find(
                                (e) => e.id === workerId,
                              );
                              if (!emp) return null;
                              return (
                                <div key={workerId} className="hv-worker-chip">
                                  <User size={12} color="#64748b" />
                                  {emp.firstName} {emp.lastName}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

                    {isElementVisible("card_workLog") && (
                      <div className="hv-subcard">
                        <span className="hv-detail-label">
                          <PenTool size={14} className="hv-label-icon-inline" />{" "}
                          WORK LOG
                        </span>
                        <div className="hv-worklog-rows-wrap">
                          <div className="hv-worklog-row">
                            <span className="hv-worklog-label">
                              <PlayCircle size={14} color="#3b82f6" /> Started
                              By
                            </span>
                            <span className="hv-worklog-value">
                              {selectedHouse.employeeStartedBy
                                ? `${selectedHouse.employeeStartedBy} (${formatDateTime(selectedHouse.employeeStartedAt)})`
                                : "Not started"}
                            </span>
                          </div>
                          <div className="hv-worklog-row">
                            <span className="hv-worklog-label">
                              <CheckCircle size={14} color="#10b981" /> Finished
                              By
                            </span>
                            <span className="hv-worklog-value">
                              {selectedHouse.employeeFinishedBy
                                ? `${selectedHouse.employeeFinishedBy} (${formatDateTime(selectedHouse.employeeFinishedAt)})`
                                : "Not finished"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeDetailTab === "financials" && isVisible("financial") && (
                <div className="fade-in">
                  <div className="hv-fin-kpi-grid">
                    <div className="hv-fin-kpi-card revenue">
                      <div className="hv-fin-kpi-label revenue">
                        Total Revenue
                      </div>
                      <div className="hv-fin-kpi-value revenue">
                        ${totalBilled.toFixed(2)}
                      </div>
                    </div>
                    <div className="hv-fin-kpi-card payroll">
                      <div className="hv-fin-kpi-label payroll">
                        Total Payroll
                      </div>
                      <div className="hv-fin-kpi-value payroll">
                        ${totalPayroll.toFixed(2)}
                      </div>
                    </div>
                    <div
                      className={`hv-fin-kpi-card profit ${netProfit >= 0 ? "positive" : "negative"}`}
                    >
                      <div
                        className={`hv-fin-kpi-label profit ${netProfit >= 0 ? "positive" : "negative"}`}
                      >
                        Net Profit
                      </div>
                      <div
                        className={`hv-fin-kpi-value profit ${netProfit >= 0 ? "positive" : "negative"}`}
                      >
                        ${netProfit.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="hv-fin-table-card">
                    <div className="hv-fin-table-header">
                      <h4 className="hv-fin-table-title">
                        <Layers size={18} color="#f59e0b" /> Billed Services
                      </h4>
                      {canEdit && (
                        <button
                          onClick={() =>
                            handleOpenServiceForm(undefined, false)
                          }
                          disabled={isSaving}
                          className="hv-fin-btn-add blue"
                        >
                          <Plus size={16} /> Add Service
                        </button>
                      )}
                    </div>
                    <div className="hv-fin-table-scroll">
                      <table className="hv-fin-table">
                        <thead>
                          <tr>
                            <th className="hv-service-th">Service</th>
                            <th className="hv-service-th center">Qty</th>
                            <th className="hv-service-th right">Price</th>
                            <th className="hv-service-th right">Tax</th>
                            <th className="hv-service-th right">Total</th>
                            <th className="hv-service-th right">Total -Tax</th>
                            {canEdit && (
                              <th className="hv-service-th right">Actions</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {houseServices.length === 0 ? (
                            <tr>
                              <td
                                colSpan={canEdit ? 7 : 6}
                                className="hv-fin-empty-row"
                              >
                                No billed services yet.
                              </td>
                            </tr>
                          ) : (
                            houseServices.map((record) => {
                              return (
                                <tr key={record.id}>
                                  <td className="hv-fin-td strong">
                                    {getServiceName(record.serviceId)}
                                  </td>
                                  <td className="hv-fin-td center">
                                    {record.quantity}
                                  </td>
                                  <td className="hv-fin-td right">
                                    ${Number(record.price).toFixed(2)}
                                  </td>
                                  <td
                                    className={`hv-fin-td right tax ${record.taxAmount > 0 ? "positive" : "neutral"}`}
                                  >
                                    {record.taxAmount > 0
                                      ? `+$${record.taxAmount.toFixed(2)}`
                                      : record.minusTax === "Yes"
                                        ? `-$${Math.abs(record.taxAmount).toFixed(2)}`
                                        : "$0.00"}
                                  </td>
                                  <td className="hv-fin-td right bold">
                                    ${Number(record.total).toFixed(2)}
                                  </td>
                                  <td className="hv-fin-td right total-minus-tax">
                                    ${recordTotalMinusTax(record).toFixed(2)}
                                  </td>
                                  {canEdit && (
                                    <td className="hv-fin-td right">
                                      <div className="hv-service-actions-row">
                                        <button
                                          onClick={() =>
                                            handleOpenServiceForm(record, false)
                                          }
                                          className="hv-service-action-btn edit"
                                        >
                                          <Edit2 size={14} />
                                        </button>
                                        <button
                                          onClick={() =>
                                            handleDeleteService(
                                              record.id as string,
                                            )
                                          }
                                          className="hv-service-action-btn delete"
                                        >
                                          <Trash2 size={14} />
                                        </button>
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

                  <div className="hv-fin-table-card no-mb">
                    <div className="hv-fin-table-header">
                      <h4 className="hv-fin-table-title">
                        <DollarSign size={18} color="#10b981" /> Registered
                        Payments
                      </h4>
                      {canEdit && (
                        <button
                          onClick={() =>
                            handleOpenPayrollForm(selectedHouse.id)
                          }
                          disabled={isSaving}
                          className="hv-fin-btn-add green"
                        >
                          <Plus size={16} /> Register Payment
                        </button>
                      )}
                    </div>
                    <div className="hv-fin-table-scroll">
                      <table className="hv-fin-table">
                        <thead>
                          <tr>
                            <th className="hv-service-th">Date</th>
                            <th className="hv-service-th">Employee</th>
                            <th className="hv-service-th right">Base</th>
                            <th className="hv-service-th right">Extra</th>
                            <th className="hv-service-th right">Discount</th>
                            <th className="hv-service-th right">Total</th>
                            {canEdit && (
                              <th className="hv-service-th right">Act</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {housePayrollRecords.length === 0 ? (
                            <tr>
                              <td
                                colSpan={canEdit ? 7 : 6}
                                className="hv-fin-empty-row"
                              >
                                No payments registered yet.
                              </td>
                            </tr>
                          ) : (
                            housePayrollRecords.map((record) => {
                              const emp = employees.find(
                                (e) => e.id === record.employeeId,
                              );
                              return (
                                <tr key={record.id}>
                                  <td className="hv-fin-td muted">
                                    {formatDate(record.date)}
                                  </td>
                                  <td className="hv-fin-td strong">
                                    {emp
                                      ? [emp.firstName, emp.lastName]
                                          .filter(Boolean)
                                          .join(" ")
                                      : "Unknown"}
                                  </td>
                                  <td className="hv-fin-td right">
                                    ${Number(record.baseAmount).toFixed(2)}
                                  </td>
                                  <td className="hv-fin-td right extra">
                                    +${Number(record.extraAmount).toFixed(2)}
                                  </td>
                                  <td className="hv-fin-td right discount">
                                    -${Number(record.discountAmount).toFixed(2)}
                                  </td>
                                  <td className="hv-fin-td right bold">
                                    ${Number(record.totalAmount).toFixed(2)}
                                  </td>
                                  {canEdit && (
                                    <td className="hv-fin-td right">
                                      <button
                                        onClick={() =>
                                          handleDeletePayroll(
                                            record.id as string,
                                          )
                                        }
                                        className="hv-service-action-btn delete"
                                      >
                                        <Trash2 size={14} />
                                      </button>
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

              {activeDetailTab === "media" && isVisible("media") && (
                <div className="fade-in">
                  {anyVisible("note", "employeeNote") && (
                    <div className="hv-media-grid">
                      {isElementVisible("note") && (
                        <div className="hv-note-box">
                          <span className="hv-detail-label">
                            <StickyNote
                              size={14}
                              className="hv-label-icon-inline"
                            />{" "}
                            GENERAL NOTE
                          </span>
                          <p className="hv-note-text">
                            {selectedHouse.note || "No general notes."}
                          </p>
                        </div>
                      )}
                      {isElementVisible("employeeNote") && (
                        <div className="hv-note-box orange">
                          <span className="hv-detail-label orange">
                            <StickyNote
                              size={14}
                              className="hv-label-icon-inline"
                            />{" "}
                            EMPLOYEE'S NOTE
                          </span>
                          <p className="hv-note-text">
                            {selectedHouse.employeeNote || "No employee notes."}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {isElementVisible("card_photos") && (
                    <div className="hv-media-grid no-mb">
                      <div>
                        <div className="hv-workers-header">
                          <span className="hv-detail-label">
                            <ImageIcon
                              size={14}
                              className="hv-label-icon-inline"
                            />{" "}
                            BEFORE PHOTOS
                          </span>
                          <div className="hv-photo-actions-row">
                            {isElementVisible("btn_takePhoto") && (
                              <button
                                onClick={() => openBurstCamera("before")}
                                disabled={isSaving}
                                className="hv-btn-compact bg-blue"
                              >
                                <Camera size={14} /> Cámara rápida
                              </button>
                            )}
                            {isElementVisible("btn_exportPdf") && (
                              <button
                                onClick={() => generatePDF("before")}
                                disabled={isSaving}
                                className="hv-btn-compact bg-dark-blue"
                              >
                                <FileImage size={14} /> Export PDF
                              </button>
                            )}
                          </div>
                        </div>
                        <PhotoSection
                          label="Before"
                          type="before"
                          urls={beforePhotoURLs}
                          excludedUrls={beforeExcluded}
                          pendingCount={pendingForHouse.before}
                          canEdit={isElementVisible("btn_uploadPhoto")}
                          isSaving={isSaving}
                          isCompressing={isCompressing}
                          photoConfig={photoConfig}
                          reportSelectable
                          onAddFiles={(f: FileList | null) =>
                            addPhotoFiles(f, "before")
                          }
                          onRemove={(i: number) =>
                            handleRemovePhoto(i, "before")
                          }
                          onToggleReport={(u: string) =>
                            toggleReportPhoto(u, "before")
                          }
                        />
                      </div>
                      <div>
                        <div className="hv-workers-header">
                          <span className="hv-detail-label">
                            <ImageIcon
                              size={14}
                              className="hv-label-icon-inline"
                            />{" "}
                            AFTER PHOTOS
                          </span>
                          <div className="hv-photo-actions-row">
                            {isElementVisible("btn_takePhoto") && (
                              <button
                                onClick={() => openBurstCamera("after")}
                                disabled={isSaving}
                                className="hv-btn-compact bg-green"
                              >
                                <Camera size={14} /> Cámara rápida
                              </button>
                            )}
                            {isElementVisible("btn_exportPdf") && (
                              <button
                                onClick={() => generatePDF("after")}
                                disabled={isSaving}
                                className="hv-btn-compact bg-dark-green"
                              >
                                <FileImage size={14} /> Export PDF
                              </button>
                            )}
                          </div>
                        </div>
                        <PhotoSection
                          label="After"
                          type="after"
                          urls={afterPhotoURLs}
                          excludedUrls={afterExcluded}
                          pendingCount={pendingForHouse.after}
                          canEdit={isElementVisible("btn_uploadPhoto")}
                          isSaving={isSaving}
                          isCompressing={isCompressing}
                          photoConfig={photoConfig}
                          reportSelectable
                          onAddFiles={(f: FileList | null) =>
                            addPhotoFiles(f, "after")
                          }
                          onRemove={(i: number) =>
                            handleRemovePhoto(i, "after")
                          }
                          onToggleReport={(u: string) =>
                            toggleReportPhoto(u, "after")
                          }
                        />
                      </div>
                    </div>
                  )}

                  {/* ⭐ Save Photos: se muestra si el rol puede AGREGAR fotos según el
                      configurador (subir o cámara), aunque no tenga Edit del módulo. */}
                  {(isElementVisible("btn_uploadPhoto") ||
                    isElementVisible("btn_takePhoto")) &&
                    isElementVisible("card_photos") && (
                    <div className="hv-save-photos-row">
                      <button
                        onClick={handleSavePhotosFromDetail}
                        disabled={isSaving}
                        className="hv-btn-primary-modal center"
                      >
                        <Save size={16} />{" "}
                        {isSaving ? "Saving..." : "Save Photos"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <footer className="hv-modal-footer-between">
              <div>
                {canDelete &&
                  isVisible("admin") &&
                  isElementVisible("btn_deleteProperty") && (
                    <button
                      onClick={() => handleDelete()}
                      disabled={isSaving}
                      className="hv-btn-danger-light-modal"
                    >
                      <Trash2 size={16} /> Delete Property
                    </button>
                  )}
              </div>
              <div className="hv-footer-actions">
                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  className="hv-btn-outline-modal"
                >
                  Close
                </button>
                {canEdit &&
                  isVisible("admin") &&
                  isElementVisible("btn_editDetails") && (
                    <button
                      onClick={() => handleOpenForm(selectedHouse)}
                      className="hv-btn-primary-modal"
                    >
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
        <div
          className="modal-overlay-centered"
          onClick={() => setIsCustomerModalOpen(false)}
        >
          <div
            className="modal-70 hv-customer-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="hv-modal-header">
              <h3 className="hv-modal-title">&nbsp;</h3>
              <button
                className="hv-modal-close-btn"
                onClick={() => setIsCustomerModalOpen(false)}
              >
                <X size={22} />
              </button>
            </header>
            <div className="hv-modal-body-padded">
              <div className="hv-form-grid cols-260">
                <div>
                  <label className="hv-label">Type</label>
                  <SearchableSelect
                    options={[
                      { id: "Private customer", name: "Private customer" },
                      { id: "Residential", name: "Residential" },
                      { id: "Commercial", name: "Commercial" },
                    ]}
                    value={customerForm.type}
                    onChange={(val: string) =>
                      setCustomerForm({ ...customerForm, type: val })
                    }
                    placeholder="Select type..."
                    icon={Briefcase}
                  />
                </div>

                <div>
                  <label className="hv-label">Color Marker</label>
                  <input
                    type="color"
                    value={customerForm.color}
                    onChange={(e) =>
                      setCustomerForm({
                        ...customerForm,
                        color: e.target.value,
                      })
                    }
                    className="hv-color-input"
                  />
                </div>

                <div>
                  <label className="hv-label">
                    Full Name <span className="hv-required">*</span>
                  </label>
                  <div className="hv-input-wrap">
                    <User className="hv-input-icon" size={16} />
                    <input
                      type="text"
                      className="hv-input"
                      value={customerForm.name}
                      onChange={(e) =>
                        setCustomerForm({
                          ...customerForm,
                          name: e.target.value,
                        })
                      }
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="hv-label">Business Name</label>
                  <div className="hv-input-wrap">
                    <Briefcase className="hv-input-icon" size={16} />
                    <input
                      type="text"
                      className="hv-input"
                      value={customerForm.businessName}
                      onChange={(e) =>
                        setCustomerForm({
                          ...customerForm,
                          businessName: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="hv-label">Email</label>
                  <div className="hv-input-wrap">
                    <FileText className="hv-input-icon" size={16} />
                    <input
                      type="email"
                      className="hv-input"
                      value={customerForm.email}
                      onChange={(e) =>
                        setCustomerForm({
                          ...customerForm,
                          email: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="hv-label">Phone</label>
                  <div className="hv-input-wrap">
                    <Hash className="hv-input-icon" size={16} />
                    <input
                      type="text"
                      className="hv-input"
                      value={customerForm.phone}
                      onChange={(e) =>
                        setCustomerForm({
                          ...customerForm,
                          phone: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="hv-full-col">
                  <label className="hv-label">Address</label>
                  <div className="hv-input-wrap">
                    <MapPin className="hv-input-icon" size={16} />
                    <input
                      type="text"
                      className="hv-input"
                      value={customerForm.address}
                      onChange={(e) =>
                        setCustomerForm({
                          ...customerForm,
                          address: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="hv-full-col">
                  <label className="hv-label">City / State / Zip</label>
                  <div className="hv-input-wrap">
                    <MapPin className="hv-input-icon" size={16} />
                    <input
                      type="text"
                      className="hv-input"
                      placeholder="e.g. Maracaibo, Zulia 4001"
                      value={customerForm.cityStateZip}
                      onChange={(e) =>
                        setCustomerForm({
                          ...customerForm,
                          cityStateZip: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
            <footer className="hv-modal-footer-between">
              <div>
                <button
                  onClick={() => setIsCustomerModalOpen(false)}
                  className="hv-btn-outline-modal"
                >
                  Cancel
                </button>
              </div>
              <button
                onClick={handleSaveNewCustomer}
                disabled={isSaving}
                className="hv-btn-primary-modal green"
              >
                <Save size={16} /> {isSaving ? "Saving..." : "Save Customer"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* --- SERVICE MODAL --- */}
      {isServiceModalOpen && (
        <div
          className="modal-overlay-centered"
          onClick={() => setIsServiceModalOpen(false)}
        >
          <div className="modal-70" onClick={(e) => e.stopPropagation()}>
            <header className="hv-modal-header">
              <h3 className="hv-modal-title">
                {serviceForm.id ? "Edit Service" : "Add Billed Service"}
              </h3>
              <button
                className="hv-modal-close-btn"
                onClick={() => setIsServiceModalOpen(false)}
              >
                <X size={22} />
              </button>
            </header>
            <div className="hv-modal-body-padded">
              <div className="hv-form-grid cols-240">
                <div className="hv-full-col">
                  <label className="hv-label">
                    Product / Service <span className="hv-required">*</span>
                  </label>
                  <SearchableSelect
                    options={products.length ? products : services}
                    value={serviceForm.serviceId}
                    onChange={(val: string) => {
                      const list = products.length ? products : services;
                      const srv = list.find((c) => c.id === val);
                      const price =
                        srv && "price" in srv ? srv.price : undefined;
                      setServiceForm((prev) => ({
                        ...prev,
                        serviceId: val,
                        price: Number(price || prev.price),
                      }));
                    }}
                    placeholder="Select Product/Service..."
                    icon={Wrench}
                  />
                </div>
                <div>
                  <label className="hv-label">Quantity</label>
                  <div className="hv-input-wrap">
                    <Hash className="hv-input-icon" size={16} />
                    <input
                      type="number"
                      min="1"
                      className="hv-input"
                      value={serviceForm.quantity}
                      onChange={(e) =>
                        setServiceForm({
                          ...serviceForm,
                          quantity: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="hv-label">Unit Price</label>
                  <div className="hv-input-wrap">
                    <DollarSign className="hv-input-icon" size={16} />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="hv-input"
                      value={serviceForm.price}
                      onChange={(e) =>
                        setServiceForm({
                          ...serviceForm,
                          price: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="hv-label">Tax %</label>
                  {taxes.length > 0 && (
                    <div className="hv-tax-select-wrap">
                      <SearchableSelect
                        options={taxes.map((t) => ({
                          id: String(Number(t.percentage)),
                          name: `${t.name} (${Number(t.percentage)}%)`,
                        }))}
                        value={String(Number(serviceForm.taxPercentage))}
                        onChange={(val: string) =>
                          setServiceForm((prev) => ({
                            ...prev,
                            taxPercentage: Number(val),
                          }))
                        }
                        placeholder="Select tax rate..."
                        icon={Percent}
                      />
                    </div>
                  )}
                  <div className="hv-input-wrap">
                    <Percent className="hv-input-icon" size={16} />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      className="hv-input"
                      value={serviceForm.taxPercentage}
                      onChange={(e) =>
                        setServiceForm({
                          ...serviceForm,
                          taxPercentage: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="hv-label">Apply Tax (add)</label>
                  <div className="hv-segment-container">
                    <button
                      onClick={() =>
                        setServiceForm({
                          ...serviceForm,
                          applyTax: "Yes",
                          minusTax: "No",
                        })
                      }
                      className={`hv-segment-btn${serviceForm.applyTax === "Yes" ? " active yes" : ""}`}
                    >
                      Yes
                    </button>
                    <button
                      onClick={() =>
                        setServiceForm({ ...serviceForm, applyTax: "No" })
                      }
                      className={`hv-segment-btn${serviceForm.applyTax === "No" ? " active no" : ""}`}
                    >
                      No
                    </button>
                  </div>
                </div>
                {serviceForm.applyTax === "No" && (
                  <div>
                    <label className="hv-label">Minus Tax (subtract)</label>
                    <div className="hv-segment-container">
                      <button
                        onClick={() =>
                          setServiceForm({ ...serviceForm, minusTax: "Yes" })
                        }
                        className={`hv-segment-btn${serviceForm.minusTax === "Yes" ? " active yes" : ""}`}
                      >
                        Yes
                      </button>
                      <button
                        onClick={() =>
                          setServiceForm({ ...serviceForm, minusTax: "No" })
                        }
                        className={`hv-segment-btn${serviceForm.minusTax === "No" ? " active no" : ""}`}
                      >
                        No
                      </button>
                    </div>
                  </div>
                )}
                <div className="hv-full-col">
                  <label className="hv-label">Notes</label>
                  <textarea
                    className="hv-input hv-textarea compact"
                    value={serviceForm.notes}
                    onChange={(e) =>
                      setServiceForm({ ...serviceForm, notes: e.target.value })
                    }
                    placeholder="Optional notes..."
                  ></textarea>
                </div>
              </div>

              <div className="hv-service-summary-box">
                <div className="hv-summary-row">
                  <span>Subtotal</span>
                  <span className="hv-summary-row-value">
                    ${serviceForm.subtotal.toFixed(2)}
                  </span>
                </div>
                <div className="hv-summary-row">
                  <span>Tax</span>
                  <span
                    className={`hv-summary-row-value${serviceForm.applyTax === "Yes" ? " tax-add" : serviceForm.minusTax === "Yes" ? " tax-subtract" : ""}`}
                  >
                    {serviceForm.applyTax === "Yes"
                      ? "+"
                      : serviceForm.minusTax === "Yes"
                        ? "-"
                        : ""}
                    ${serviceForm.taxAmount.toFixed(2)}
                  </span>
                </div>
                <div className="hv-summary-divider"></div>
                <div className="hv-summary-total-row">
                  <span className="hv-summary-total-label">Total</span>
                  <span className="hv-summary-total-value">
                    ${serviceForm.total.toFixed(2)}
                  </span>
                </div>
                <div className="hv-summary-minustax-row">
                  <span className="hv-summary-minustax-label">
                    Total Minus Tax
                  </span>
                  <span className="hv-summary-minustax-value">
                    ${Number(serviceForm.totalMinusTax || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
            <footer className="hv-modal-footer">
              <button
                onClick={() => setIsServiceModalOpen(false)}
                className="hv-btn-outline-modal"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveService}
                disabled={isSaving}
                className="hv-btn-primary-modal"
              >
                <Save size={16} /> {isSaving ? "Saving..." : "Save Service"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* --- PAYROLL MODAL --- */}
      {isPayrollModalOpen && (
        <div
          className="modal-overlay-centered"
          onClick={() => setIsPayrollModalOpen(false)}
        >
          <div className="modal-70" onClick={(e) => e.stopPropagation()}>
            <header className="hv-modal-header">
              <h3 className="hv-modal-title">Register Payment</h3>
              <button
                className="hv-modal-close-btn"
                onClick={() => setIsPayrollModalOpen(false)}
              >
                <X size={22} />
              </button>
            </header>
            <div className="hv-modal-body-padded">
              <div className="hv-form-grid cols-240">
                <div>
                  <label className="hv-label">
                    Employee <span className="hv-required">*</span>
                  </label>
                  <SearchableSelect
                    options={employees.map((e) => ({
                      id: e.id,
                      name: [e.firstName, e.lastName].filter(Boolean).join(" "),
                    }))}
                    value={payrollForm.employeeId}
                    onChange={(val: string) =>
                      setPayrollForm({ ...payrollForm, employeeId: val })
                    }
                    placeholder="Type to search employee..."
                    icon={User}
                    returnKey="id"
                  />
                </div>
                <div>
                  <label className="hv-label">Date</label>
                  <div className="hv-input-wrap">
                    <CalendarDays className="hv-input-icon" size={16} />
                    <input
                      type="date"
                      className="hv-input"
                      value={payrollForm.date}
                      onChange={(e) =>
                        setPayrollForm({ ...payrollForm, date: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="hv-label">
                    Base Amount <span className="hv-required">*</span>
                  </label>
                  <div className="hv-input-wrap">
                    <DollarSign className="hv-input-icon" size={16} />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="hv-input"
                      value={payrollForm.baseAmount}
                      onChange={(e) =>
                        setPayrollForm({
                          ...payrollForm,
                          baseAmount: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="hv-label">Extra Amount</label>
                  <div className="hv-input-wrap">
                    <DollarSign className="hv-input-icon" size={16} />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="hv-input"
                      value={payrollForm.extraAmount}
                      onChange={(e) =>
                        setPayrollForm({
                          ...payrollForm,
                          extraAmount: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
                <div className="hv-full-col">
                  <label className="hv-label">Extra Note</label>
                  <input
                    type="text"
                    className="hv-input no-icon"
                    value={payrollForm.extraNote}
                    onChange={(e) =>
                      setPayrollForm({
                        ...payrollForm,
                        extraNote: e.target.value,
                      })
                    }
                    placeholder="Reason for extra..."
                  />
                </div>
                <div>
                  <label className="hv-label">Discount Amount</label>
                  <div className="hv-input-wrap">
                    <DollarSign className="hv-input-icon" size={16} />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="hv-input"
                      value={payrollForm.discountAmount}
                      onChange={(e) =>
                        setPayrollForm({
                          ...payrollForm,
                          discountAmount: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="hv-label">Discount Note</label>
                  <input
                    type="text"
                    className="hv-input no-icon"
                    value={payrollForm.discountNote}
                    onChange={(e) =>
                      setPayrollForm({
                        ...payrollForm,
                        discountNote: e.target.value,
                      })
                    }
                    placeholder="Reason for discount..."
                  />
                </div>
              </div>

              <div className="hv-payroll-summary-box">
                <span className="hv-payroll-summary-label">Total Payment</span>
                <span className="hv-payroll-summary-value">
                  ${Number(payrollForm.totalAmount).toFixed(2)}
                </span>
              </div>
            </div>
            <footer className="hv-modal-footer">
              <button
                onClick={() => setIsPayrollModalOpen(false)}
                className="hv-btn-outline-modal"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePayroll}
                disabled={isSaving}
                className="hv-btn-primary-modal green"
              >
                <Save size={16} /> {isSaving ? "Saving..." : "Register Payment"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* --- FIELD CONFIGURATION MODAL --- */}
      {isFieldConfigOpen && (
        <div
          className="modal-overlay-centered"
          onClick={() => setIsFieldConfigOpen(false)}
        >
          <div className="modal-70" onClick={(e) => e.stopPropagation()}>
            <header className="hv-modal-header">
              <div>
                <h3 className="hv-modal-title">Field & Button Visibility</h3>
                <p className="hv-modal-subtitle">
                  Haz clic en el chip de cada rol para cambiar su estado. Los
                  cambios se aplican al presionar "Save Configuration".
                </p>
              </div>
              <button
                className="hv-modal-close-btn"
                onClick={() => setIsFieldConfigOpen(false)}
              >
                <X size={22} />
              </button>
            </header>
            <div className="hv-modal-body-padded">
              {rolesList.length === 0 ? (
                <div className="hv-fieldconfig-empty">
                  No hay roles configurados.
                </div>
              ) : (
                <>
                  {/* ⭐ LEYENDA: qué significa cada color/estado */}
                  <div className="hv-fieldconfig-legend">
                    <span className="hv-role-state visible demo">
                      <Eye size={13} /> Visible — lo ve y lo edita
                    </span>
                    <span className="hv-role-state readonly demo">
                      <Lock size={13} /> Solo lectura — lo ve pero NO lo edita
                    </span>
                    <span className="hv-role-state hidden demo">
                      <EyeOff size={13} /> Oculto — NO lo ve
                    </span>
                  </div>

                  <h4 className="hv-fieldconfig-section-title">Form Fields</h4>
                  <div className="hv-fieldconfig-list">
                    {CONFIGURABLE_FIELDS.map((field) => (
                      <div key={field.id} className="hv-fieldconfig-row">
                        <div className="hv-fieldconfig-row-label">
                          {field.label}{" "}
                          <span className="hv-fieldconfig-section-tag">
                            · {field.section}
                          </span>
                        </div>
                        <div className="hv-fieldconfig-roles-wrap">
                          {rolesList.map((role) => {
                            const state = getFieldStateForRole(
                              field.id,
                              role.id,
                            );
                            return (
                              <button
                                key={role.id}
                                onClick={() =>
                                  cycleFieldStateForRole(field.id, role.id)
                                }
                                className={`hv-role-state ${state}`}
                                title="Clic para cambiar: Visible → Solo lectura → Oculto"
                              >
                                {state === "visible" && <Eye size={13} />}
                                {state === "readonly" && <Lock size={13} />}
                                {state === "hidden" && <EyeOff size={13} />}
                                <span className="hv-role-state-name">
                                  {role.name}
                                </span>
                                <span className="hv-role-state-label">
                                  {state === "visible"
                                    ? "Visible"
                                    : state === "readonly"
                                      ? "Solo lectura"
                                      : "Oculto"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <h4 className="hv-fieldconfig-section-title">
                    Buttons & Tabs
                  </h4>
                  <p className="hv-fieldconfig-hint">
                    Los botones y tabs solo tienen dos estados: Visible u
                    Oculto (clic para alternar).
                  </p>
                  <div className="hv-fieldconfig-list no-mb">
                    {CONFIGURABLE_BUTTONS.map((btn) => (
                      <div key={btn.id} className="hv-fieldconfig-row">
                        <div className="hv-fieldconfig-row-label">
                          {btn.label}{" "}
                          <span className="hv-fieldconfig-section-tag">
                            · {btn.section}
                          </span>
                        </div>
                        <div className="hv-fieldconfig-roles-wrap">
                          {rolesList.map((role) => {
                            const state = getButtonStateForRole(
                              btn.id,
                              role.id,
                            );
                            return (
                              <button
                                key={role.id}
                                onClick={() =>
                                  toggleElementVisibilityForRole(
                                    btn.id,
                                    role.id,
                                  )
                                }
                                className={`hv-role-state ${state}`}
                                title="Clic para alternar: Visible ↔ Oculto"
                              >
                                {state === "visible" ? (
                                  <Eye size={13} />
                                ) : (
                                  <EyeOff size={13} />
                                )}
                                <span className="hv-role-state-name">
                                  {role.name}
                                </span>
                                <span className="hv-role-state-label">
                                  {state === "visible" ? "Visible" : "Oculto"}
                                </span>
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
            <footer className="hv-modal-footer">
              <button
                onClick={() => setIsFieldConfigOpen(false)}
                className="hv-btn-outline-modal"
              >
                Cancel
              </button>
              <button
                onClick={saveFieldConfig}
                disabled={isSavingFieldConfig}
                className="hv-btn-primary-modal"
              >
                <Save size={16} />{" "}
                {isSavingFieldConfig ? "Saving..." : "Save Configuration"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* --- CÁMARA RÁPIDA (RÁFAGA): se mantiene abierta y permite varias tomas --- */}
      {cameraOpen && (
        <div className="hv-camera-overlay">
          <div className="hv-camera-topbar">
            <div className="hv-camera-title">
              <Camera size={18} />{" "}
              {cameraOpen === "before" ? "Fotos Before" : "Fotos After"} ·{" "}
              {burstCount} tomada(s)
            </div>
            <button
              onClick={() => setCameraOpen(null)}
              className="hv-camera-close-btn"
            >
              <X size={18} /> Cerrar
            </button>
          </div>
          <div className="hv-camera-video-wrap">
            <video
              ref={videoRef}
              playsInline
              muted
              className="hv-camera-video"
            />
            {isCompressing && (
              <div className="hv-camera-processing-badge">Procesando…</div>
            )}
            {burstCount > 0 && (
              <div className="hv-camera-count-badge">
                {burstCount} foto(s) agregada(s)
              </div>
            )}
          </div>
          <div className="hv-camera-controls">
            <button
              onClick={captureBurst}
              aria-label="Tomar foto"
              className="hv-camera-shutter"
            />
            <button
              onClick={() => setCameraOpen(null)}
              className="hv-camera-done-btn"
            >
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