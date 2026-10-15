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
export interface Place { id: string; name: string; }
export interface PaymentMethod { id: string; name: string; }
export interface Task { id: string; placeId: string; name: string; }
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
//    QCStatusLike en qcStatus, campos extra en QCReportsTableView).

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
// Todo campo que guarda un usuario termina en
// UserId / UserName (antes Id / Name; las colecciones eran ops_*). Fechas como TEXTO: días AAAA-MM-DD y fecha +
// hora ISO; en pantalla SIEMPRE MM/DD/AAAA y h:mm AM/PM.
// Referencias tipadas: src/features/ops/services/opsRefs.ts.

/** Día sin hora: "2026-10-13" (AAAA-MM-DD). */
export type YmdDate = string;
/** Fecha y hora ISO: "2026-10-13T15:04:05.000Z". */
export type IsoDateTime = string;

/** Cada cuánto se repite un proyecto o una tarea. */
export type RepeatFreq =
  | 'daily' //     todos los días
  | 'weekdays' //  de lunes a viernes
  | 'weekly' //    ciertos días de la semana (ver `days`)
  | 'monthly'; //  el mismo día de cada mes

/** Map `repeat` de user_tasks. `null` = no se repite. (Los proyectos guardan
 *  solo la frecuencia: `repeat: RepeatFreq | null`.) */
export interface Repeat {
  freq: RepeatFreq; //                  frecuencia de la repetición
  days?: number[]; //                   solo con 'weekly': 0 = domingo … 6 = sábado
}

/** Map de cada elemento de `attachments[]`. El archivo vive en Storage. */
export interface OpsAttachment {
  name: string; //                      nombre del archivo que se muestra
  url: string; //                       URL de descarga (para abrirlo o verlo)
  path: string; //                      ruta en Storage (para borrarlo)
  type: string; //                      tipo MIME: image/jpeg, application/pdf…
  size: number; //                      tamaño en bytes
}

export type OpsProjectStatus = 'active' | 'done' | 'archived';
export type OpsTaskStatus = 'open' | 'done';

/** Estado del visto bueno de una tarea:
 *  draft = necesita OK pero aún no se envía · pending = esperando la respuesta ·
 *  approved = aprobada · changes = pidieron cambios. */
export type OpsApprovalStatus = 'draft' | 'pending' | 'approved' | 'changes';

/** Map `approval` de user_tasks (null = no necesita visto bueno). La tarea no se
 *  puede marcar hecha hasta que esté `approved`. */
export interface OpsApproval {
  status: OpsApprovalStatus; //         draft · pending · approved · changes
  approverUserId: string; //            FK → system_users: quién da el OK
  approverUserName: string; //          copia del nombre de quien aprueba
  requestedByUserId: string | null; //  FK → system_users: quién la envió
  requestedAt: IsoDateTime | null; //   cuándo se envió (la última vez)
  decidedAt: IsoDateTime | null; //     cuándo aprobó o pidió cambios
  note: string; //                      cambios pedidos ("" si no hay)
}

/** user_priorities/{userId} — Top 3 de proyectos de cada gerente. */
export interface OpsPriorities {
  id: string; //                        PK · FK = id del gerente en system_users
  projectIds: string[]; //              FK → task_projects (máximo 3, en orden)
  updatedAt: IsoDateTime; //            última vez que cambió el top 3
}

/** task_projects/{projectId} — Proyectos (agrupan tareas de user_tasks). */
export interface OpsProject {
  id: string; //                        PK · id del documento
  title: string; //                     nombre del proyecto
  description: string; //               objetivo o descripción corta
  ownerUserId: string; //               FK → system_users: responsable
  ownerUserName: string; //             copia del nombre del responsable
  teamId: string | null; //             FK → settings_teams (null = sin equipo)
  startDate: YmdDate; //                fecha de inicio ('' = sin fecha)
  dueDate: YmdDate; //                  fecha límite ('' = sin fecha)
  repeat: RepeatFreq | null; //         cada cuánto se repite (null = no se repite)
  color: string | null; //              nombre del color (lista en opsOptions); null = automático
  status: OpsProjectStatus; //          active · done · archived
  taskCount: number; //                 tareas del proyecto (increment())
  doneCount: number; //                 tareas hechas (increment())
  openMinutes: number; //               minutos de tareas abiertas (increment())
  comments: OpsComment[]; //            comentarios (arrayUnion), sin archivos
  doneAt: IsoDateTime | null; //        cuándo pasó a Done (null = no está hecho)
  createdByUserId: string; //           FK → system_users: quién lo creó
  createdAt: IsoDateTime; //            cuándo se creó
}

/** user_tasks/{taskId} — Tareas (con o sin proyecto). */
export interface OpsTask {
  id: string; //                        PK · id del documento
  title: string; //                     qué hay que hacer
  assigneeUserId: string; //            FK → system_users: a quién se asignó
  assigneeUserName: string; //          copia del nombre del asignado
  dueDate: YmdDate; //                  día en que vence ('' = sin fecha)
  dueTime: string; //                   hora "HH:mm" (24 h) o "" si no tiene hora
  durationMinutes: number; //           duración estimada en minutos (2 h = 120)
  priorityId: string | null; //         FK → settings_priorities (High, Medium…)
  projectId: string | null; //          FK → task_projects (null = "No project")
  projectTitle: string | null; //       copia del título del proyecto
  repeat: Repeat | null; //             repetición (null = no se repite)
  approval: OpsApproval | null; //      visto bueno antes de terminarla (null = no hace falta)
  status: OpsTaskStatus; //             open · done
  doneAt: IsoDateTime | null; //        cuándo se marcó hecha
  doneByUserId: string | null; //       FK → system_users: quién la marcó hecha
  comments: OpsComment[]; //            comentarios, del más viejo al más nuevo (arrayUnion)
  attachments: OpsAttachment[]; //      archivos (Storage: user_tasks/{id}/…)
  createdByUserId: string; //           FK → system_users: quién la creó
  createdByUserName: string; //         copia del nombre de quien la creó
  createdAt: IsoDateTime; //            cuándo se creó
}

/** Elemento de `comments[]` de una tarea o de un proyecto (sin archivos). Se
 *  identifica por autor + hora (no tiene id propio). `createdAt` es texto ISO:
 *  dentro de un arreglo Firestore no acepta serverTimestamp(). */
export interface OpsComment {
  userId: string; //                    FK → system_users: quién comentó
  userName: string; //                  copia del nombre de quien comentó
  text: string; //                      texto del comentario
  createdAt: IsoDateTime; //            cuándo se comentó
}
