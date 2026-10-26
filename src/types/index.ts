// src/types/index.ts
import type { LucideIcon } from 'lucide-react';

// ==========================================
// 1. SYSTEM SECURITY & USERS (RBAC)
// ==========================================

export interface Permission {
  module: string;
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  scope: 'All' | 'Own';
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
}

export interface SystemUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  altPhone: string;
  /** ⭐ Segundo correo del colaborador: se agrega como invitado extra en los
   *  eventos de Google Calendar (junto con `email`). Opcional. */
  altEmail?: string;
  roleId: string;
  status: 'Active' | 'Pending Invite' | 'Inactive';
  teamId?: string; // Para el catálogo de equipos
}

// ==========================================
// 2. CORE BUSINESS LOGIC (Properties/Jobs)
// ==========================================

/** Archivo adjunto a un mensaje de nota (el archivo vive en Storage). */
export interface NoteAttachment {
  name: string; //                      nombre del archivo que se muestra
  url: string; //                       URL de descarga
  path: string; //                      ruta en Storage (para borrarlo)
  type: string; //                      tipo MIME: image/jpeg, application/pdf…
  size: number; //                      tamaño en bytes
}

/** Un mensaje de las notas de la casa (Office, General, Employee). */
export interface NoteHistoryEntry {
  field: 'note' | 'officeNote' | 'employeeNote';
  text: string;
  user: string; //                      email de quien escribió
  at: string; //                        ISO de cuando se escribió
  action: 'created' | 'edited'; //      'edited' = entrada vieja con el TEXTO COMPLETO de la nota
  attachments?: NoteAttachment[]; //    archivos del mensaje
  editedAt?: string; //                 ISO de la última corrección del mensaje
  editedBy?: string; //                 email de quien lo corrigió
}

export interface Property {
  id: string;
  statusId: string;
  invoiceStatus: string | 'Needs Invoice' | 'Pending' | 'Paid';
  receiveDate: string;
  scheduleDate: string;
  client: string;
  note: string;
  /** Nota general de las casas importadas de AppSheet (las de la app usan `note`). */
  generalNotes?: string | null;
  /** ⭐ HISTORIAL DE NOTAS: cada creación/edición de note/officeNote/
   *  employeeNote agrega una entrada con autor, fecha-hora, acción y el
   *  texto que quedó — trazabilidad completa de quién escribió qué. */
  notesHistory?: NoteHistoryEntry[];
  address: string;
  employeeNote: string;
  /**
   * ⭐ NOTAS DE OFICINA — informacion interna (coordinacion, cobros, acuerdos con
   *    el cliente) que NO deben ver los equipos de limpieza.
   *
   *    Opcional a proposito: las casas ya guardadas no lo tienen, y marcarlo como
   *    obligatorio romperia el tipo en cada registro existente.
   *
   *    La visibilidad se controla en DOS niveles, como el resto de campos:
   *      1. Roles & Permissions → modulo "Office Notes"
   *      2. Configure Fields   → elemento "officeNote"
   */
  officeNote?: string;
  serviceId: string;
  rooms: string;
  bathrooms: string;
  priorityId: string;
  teamId: string;
  timeIn: string;
  timeOut: string;
  
  // Asignación de personal
  assignedWorkers?: string[]; 
  
  // Subida de imágenes
  beforePhotos?: string[];
  afterPhotos?: string[];
  
  // Opcionales / Visuales (Legacy)
  description?: string;
  city?: string;
  size?: string;
  bottomNote?: string;
  borderColorClass?: string;
  tag?: {
    text: string;
    type: string;
  };

  // Work Log (tiempos de inicio y fin de trabajo) — usado por HousesView.tsx,
  // PipelineBoardView.tsx y otras vistas, antes redeclarado por separado en
  // cada uno como extensión local del tipo.
  employeeStartedBy?: string | null;
  employeeStartedAt?: string | null;
  employeeFinishedBy?: string | null;
  employeeFinishedAt?: string | null;

  // ⭐ Momento en que la casa entró al status "Invoice". InvoicesView lo usa para
  //    poner ARRIBA las casas agregadas más recientemente a esa vista. Lo escriben
  //    todos los puntos que cambian el status (ver src/utils/invoiceEntry.ts).
  //    Antes cada vista lo redeclaraba como extensión local del tipo.
  sentToInvoiceAt?: string | null;

  // ⭐ Columnas de la hoja "Operations" llevadas a Invoices:
  //    · issues: problemas del trabajo (columna "Issues"). Texto libre.
  //    · taxExempt: el trabajo NO paga el 8.25% de Texas (en la hoja algunos
  //      trabajos van con Taxes $0.00). Sin el campo = sí paga impuesto.
  issues?: string;
  taxExempt?: boolean;

  // ⭐ Campos que guarda el formulario de casas (HousesView), antes declarados
  //    solo ahí como extensión local del tipo:
  //    · fotos marcadas para NO ir al PDF / WhatsApp (URLs);
  //    · fechas de emisión y vencimiento de la factura.
  beforePhotosExcluded?: string[];
  afterPhotosExcluded?: string[];
  dateOfIssue?: string;
  dueDate?: string;
  //    · áreas del Quality Check marcadas para esta casa (ids de settings_places;
  //      sin marcar = todas).
  qcPlaces?: string[];
  //    · Unit/Apto, aparte de la dirección (se busca y el mapa recibe la
  //      dirección limpia).
  unit?: string;
  //    · factura RETENIDA por un Quality Check que no pasó (RECALL con
  //      "Create re-clean job"). Se libera cuando un QC de la casa pasa.
  invoiceHold?: boolean;
  invoiceHoldAt?: string;
  invoiceHoldBy?: string;
}

// ==========================================
// 3. SETTINGS & CATALOGS
// ==========================================

export interface SettingOption {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface Status {
  id: string;
  name: string;
  business?: string;
  color: string;
  order: number | string; // Orden en el que aparece en pantalla
  cavalryOrder?: number | string; // Orden de la columna en la pestaña Cavalry del Pipeline (vacío = order)
  showInDashboard?: boolean; // NUEVO: Checkbox para saber si se muestra en el inicio
  dashboardOrder?: number; // Orden dentro del dashboard (distinto de `order`)
}
export interface Team { id: string; name: string; business?: string; color: string; }
export interface Priority { id: string; name: string; business?: string; color: string; }
export interface Service { id: string; name: string; estimatedTime?: string; business?: string; color?: string; }

export interface Customer { 
  id: string; 
  /**
   * ⭐ Id LEGACY de AppSheet, presente solo en documentos migrados. NO se
   *    escribe a Firestore: lo agrega mapCustomerDoc() en memoria
   *    porque muchas casas guardan ese valor en su campo `client` y es la
   *    unica forma de resolver el nombre del cliente en esos registros.
   */
  legacyId?: string; 
  name: string; 
  email?: string; 
  phone?: string; 
  address?: string; 
  type?: string; 
  business?: string; 
  note?: string; 
  cityStateZip?: string; 
  color?: string; 
  /** ⭐ ¿Este cliente factura CON impuesto por defecto? Alimenta el valor
   *  inicial de "Apply Tax" al agregar un Billed Service a sus casas
   *  (modificable en cada servicio). 'Yes' si no está definido. */
  applyTax?: 'Yes' | 'No';
}

export interface CategoryExpense { id: string; name: string; }
export interface Responsable { id: string; name: string; color: string; }
export interface Tax { id: string; percentage: number; name?: string; }
/** settings_places/{id} — Áreas del checklist (Porch, Rooms…). */
export interface Place {
  id: string;
  name: string;
  /** Posición manual en el checklist (0, 1, 2…). Sin valor = al final, por nombre. */
  sortOrder?: number;
}
export interface PaymentMethod { id: string; name: string; }
/** settings_tasks/{id} — Tareas de un área del checklist. */
export interface Task {
  id: string;
  placeId: string;
  name: string;
  /** true = se quitó del checklist: no sale en inspecciones nuevas, pero los
   *  reportes viejos la siguen mostrando con su nombre. */
  archived?: boolean;
}
export interface Product { id: string; name: string; price: string | number; }
export interface Business { id: string; name: string; }

// ==========================================
// 4. PAYROLL / PAYMENTS
// ==========================================

export interface PayrollRecord {
  id?: string;
  propertyId: string;
  date: string;
  employeeId: string;
  baseAmount: number;
  extraAmount: number;
  extraNote: string;
  discountAmount: number;
  discountNote: string;
  totalAmount: number;
  status?: 'Pending' | 'Paid'; // <-- ESTO ES NUEVO
}
// ==========================================
// 5. QUALITY CHECK (colección quality_checks)
// ==========================================
// ⭐ Antes cada pieza declaraba su propia versión del reporte (QCRecord en
//    QualityCheckView, QcRecordLite en qcDashboard, QcDoc en jobQuality,
//    QCStatusLike en qcStatus, campos extra en la tabla de reportes de Quality Check).

// ⭐ Datos del formulario de Quality Check (`qcData`): un objeto por área
//    (placeId → { tasks, photos, notes, damage, score, corrections, … }) cuya
//    forma depende de la configuración de áreas y tareas. Excepción documentada
//    en CLAUDE.md: este alias es el único `any` aceptado para esos datos.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QcFormData = Record<string, any>;

/** Lo que el tablero y los resúmenes leen de cada área de `qcData`. */
export interface QcPlaceData {
  tasks?: Record<string, string>;
  notes?: string;
  damage?: string;
  corrections?: string;
  photos?: string[];
}

/** quality_checks/{qcId} — Reporte de inspección de una casa. */
export interface QualityCheckRecord {
  id?: string;
  houseId: string;
  date: string;
  address: string;
  client: string;
  team?: string;
  status: 'Finished' | 'Pending';
  result?: 'passed' | 'failed' | null;
  inspector?: string;
  inspectorId?: string;
  // ⭐ Tiempos de la inspección
  checkInAt?: string | null; //      hora de entrada (ISO)
  checkOutAt?: string | null; //     hora de salida (ISO) — se sella al guardar / mandar a recall
  durationMinutes?: number | null; // minutos totales (salida - entrada)
  selectedPlaces?: string[];
  qcData?: QcFormData;
  // ⭐ Panel nuevo (10/2026): ver features/quality-check/qcForm.ts
  clientNotes?: string;
  notifyManager?: boolean;
  outcome?: 'invoice' | 'recall' | null;
  reclean?: boolean;
  // ⭐ Resultado (%) guardado al cerrar la inspección. Los registros
  //    anteriores no lo tienen: se recalcula al vuelo desde qcData.
  passRate?: number | null;
  passRateAnswered?: number | null;
  // Sello de creación (demora entre crear el registro y abrir la inspección).
  createdAt?: string | null;
  // Correcciones de un Recall marcadas como hechas (quién y cuándo).
  correctionsDoneAt?: string | null;
  correctionsDoneBy?: string | null;
  // Registros de prueba (no cuentan en los indicadores).
  isTestRecord?: boolean;
}

/** Reporte de QC leído de Firestore (siempre trae su id). Lo usa la tabla de
 *  reportes de Quality Check (features/quality-check/components/QcReportsSection). */
export type QcReportRow = QualityCheckRecord & { id: string };

/** Un área de un reporte de QC, resumida para leerla (pestaña "Quality check"
 *  del detalle de la casa): aprobadas / respondidas, su nota y sus fotos. */
export interface QcReportArea {
  id: string;
  name: string;
  passedCount: number;
  answeredCount: number;
  notes: string;
  photoUrls: string[];
}

/** Insignia del resultado de un reporte de QC (Passed, Did Not Pass, In progress):
 *  texto, colores e ícono. Passed y Did Not Pass están en
 *  features/quality-check/qcReports.ts (PASSED_BADGE / FAILED_BADGE). */
export interface QcResultBadge {
  label: string;
  background: string;
  color: string;
  Icon: LucideIcon;
}

/** Lo que devuelve useRecallHouses (utils/jobRecall.ts): las casas que
 *  estuvieron alguna vez en Recall según su historia y la colección `recalls`. */
export interface RecallHousesResult {
  recallHouseIds: ReadonlySet<string>;
  /** Ya terminó la lectura para los status de recall actuales. */
  isLoaded: boolean;
  /** Falló la historia o `recalls`; `recallHouseIds` trae lo que sí se leyó. */
  error: Error | null;
}

/** Un cliente en el reporte Clients Report (utils/clientsReport.ts): sus
 *  trabajos del periodo y la suma de su Final Cost. */
export interface ClientReportRow {
  clientName: string;
  jobCount: number;
  finalCost: number;
  /** Parte del Final Cost del periodo que es de este cliente (0 a 1). */
  shareOfFinalCost: number;
}

/** Reporte Clients Report: un renglón por cliente y el Grand Total. */
export interface ClientsReport {
  rows: ClientReportRow[];
  totalJobs: number;
  totalFinalCost: number;
}

/** Columnas de la tabla del Clients Report que se pueden ordenar. */
export type ClientsReportSortColumn = 'clientName' | 'jobCount' | 'finalCost' | 'shareOfFinalCost';

/** Orden de una columna: de mayor a menor (desc) o de menor a mayor (asc). */
export type SortDirection = 'asc' | 'desc';

/** Orden elegido en la tabla del Clients Report (null = orden original: por cliente A–Z). */
export interface ClientsReportSort {
  column: ClientsReportSortColumn;
  direction: SortDirection;
}

/** Casas que se ven en Quality Check: todas, las pendientes de inspección o las de Recall. */
export type QcHouseGroup = 'All' | 'Pending' | 'Recall';

// Checklist del empleado de una casa (colección checklists): tareas marcadas
// por id (solo las marcadas, con `true`) y notas. Lo lee useHouseChecklist.
export interface ChecklistRecord {
  id?: string;
  checked: Record<string, boolean>;
  notes?: string;
  date?: string;
  inspector?: string;
}

/** Último checklist de una casa en vivo. `isLoaded` distingue "todavía no
 *  llega" de "no tiene checklist" (los dos traen checklist = null). */
export interface HouseChecklistState {
  checklist: ChecklistRecord | null;
  isLoaded: boolean;
  /** El listener falló (permisos, red): no se puede guardar sin pisar datos. */
  hasLoadError: boolean;
}


/** Lo mínimo para saber qué casas tienen QC pendiente o terminado. */
export type QcStatusRecord = Pick<QualityCheckRecord, 'houseId' | 'date' | 'status' | 'result'>;

/**
 * Lectura liviana del store compartido (tablero de QC, Overview, Houses):
 * cualquier campo puede faltar en documentos viejos, menos id y houseId.
 */
export interface QcRecordLite {
  id: string;
  houseId: string;
  date?: string;
  createdAt?: string;
  status?: string;
  result?: string | null;
  inspector?: string;
  team?: string;
  client?: string;
  address?: string;
  passRate?: number | null;
  passRateAnswered?: number | null;
  qcData?: Record<string, QcPlaceData>;
  isTestRecord?: boolean;
}

// ==========================================
// 6. TASK LIST (user_tasks, task_projects, user_priorities)
// ==========================================
// Modelo del diagrama "Task list — diagrama entidad-relación". También son las
// tareas de las vistas Owner y Manager (la vieja `manager_tasks` ya no se usa).
// Todo campo que guarda un usuario termina en UserId / UserName. Fechas como
// TEXTO: días AAAA-MM-DD y fecha + hora ISO; en pantalla SIEMPRE MM/DD/AAAA y
// h:mm AM/PM.
// Cada colección tiene su archivo de tipos (y su service en src/services):
//   user_tasks    → ./userTasks.ts     (services/userTasksService.ts)
//   task_projects → ./taskProjects.ts  (services/taskProjectsService.ts)

/** Día sin hora: "2026-10-13" (AAAA-MM-DD). */
export type YmdDate = string;
/** Fecha y hora ISO: "2026-10-13T15:04:05.000Z". */
export type IsoDateTime = string;

/** user_priorities/{userId} — Top 3 de proyectos de cada gerente. */
export interface UserPriorities {
  id: string; //                        PK · FK = id del gerente en system_users
  projectIds: string[]; //              FK → task_projects (máximo 3, en orden)
  updatedAt: IsoDateTime; //            última vez que cambió el top 3
}

export * from './userTasks';
export * from './taskProjects';
