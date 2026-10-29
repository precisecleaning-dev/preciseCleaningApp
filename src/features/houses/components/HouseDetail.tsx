// src/features/houses/components/HouseDetail.tsx
// ============================================================================
// ⭐ DETALLE DE UNA CASA (modal): encabezado con Sync / Start / Finish / Pay /
//    Duplicate, status, pestañas (Notes & Photos, Overview & Log, Financials,
//    History, Quality check) y pie con Delete / Damages / Checklist / Edit. Tiene su propio
//    estado (pestaña, fotos nuevas, modales de servicio y pago, cámara…) y se
//    monta de nuevo en cada apertura. Lo abre HousesView, que conserva la casa
//    en vivo, sus servicios y pagos (useHouseRecords) y el cambio de status.
//    Extraído de HousesView sin cambiar la lógica.
// ============================================================================
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  MapPin, Plus, X, Edit2, Trash2, Zap, ClipboardCheck, Activity, FileText, CalendarDays, Clock, User,
  Wrench, Hash, Briefcase, AlertTriangle, Image as ImageIcon, Copy, CheckSquare, DollarSign, CheckCircle,
  Calendar, PlayCircle, BarChart3, FileImage, History, Save, Layers, Camera, PenTool, StickyNote,
} from "lucide-react";
import type { NoteHistoryEntry, PayrollRecord, Property, ServiceRecord, SystemUser } from "../../../types/index";
import { useLiveData } from "../../../shared/data/liveCollections";
import { commitOps } from "../../../shared/data/batchWrites";
import { propertiesService } from "../../../services/propertiesService";
import { storageService } from "../../../services/storageService";
import { payrollService } from "../../../services/payrollService";
import { logActivity } from "../../../services/activityLogService";
import { formatDate, formatDateTime } from "../../../utils/dateFormat";
import { getRelationName, getRelationColor } from "../../../utils/relations";
import NoteThread, { type NoteMessage } from "../../../components/NoteThread";
import StatusHistoryPanel from "../../../components/StatusHistoryPanel";
import HouseQcHistory from "../../quality-check/components/HouseQcHistory";
import PhotoSection from "../../../components/PhotoSection";
import type { StatusModalConfig } from "../../../components/StatusChangeModal";
import type { PhotoConfig } from "../../../services/photoConfigService";
import { newServiceRecord, recordTotalMinusTax } from "../serviceRecords";
import { editablePayroll, newPayrollRecord, payrollTotal } from "../payrollRecords";
import { listDiff } from "../houseDiff";
import { openPhotoReport } from "../photoReport";
import { billingServices } from "../services/billingServices";
import { manualCalendarUrl, syncHouseToCalendar } from "../services/gcalSync";
import type { HouseRecords } from "../hooks/useLiveHouse";
import type { HouseCatalogs } from "../hooks/useHouseCatalogs";
import type { HouseAccess } from "../hooks/useHouseAccess";
import { usePendingForHouse, type PhotoQueue } from "../hooks/usePhotoQueue";
import { useHousePhotos } from "../hooks/useHousePhotos";
import { useHouseChecklist } from "../hooks/useHouseChecklist";
import { useHouseDamages } from "../hooks/useHouseDamages";
import StatusPillSelector from "./StatusPillSelector";
import CfTestModal from "./CfTestModal";
import NotesHistoryModal from "./NotesHistoryModal";
import GcalVerificationModal, { type GcalVerification } from "./GcalVerificationModal";
import GcalPreviewModal from "./GcalPreviewModal";
import DamagesModal from "./DamagesModal";
import ChecklistModal from "./ChecklistModal";
import BurstCamera from "./BurstCamera";
import ServiceModal from "./ServiceModal";
import PayrollModal from "./PayrollModal";

export type DetailTab = "overview" | "financials" | "media" | "history" | "quality";
type NoteField = "note" | "officeNote" | "employeeNote";

const NO_REMOVED: { before: string[]; after: string[] } = { before: [], after: [] };

interface HouseDetailProps {
  /** La casa abierta, en vivo (useLiveHouse en HousesView). */
  house: Property;
  /** Pestaña inicial (si no, "Notes & Photos" cuando está disponible). */
  initialTab?: DetailTab;
  /** Desde la TARJETA de Daily Jobs: abre la cámara en este modo y guarda solo. */
  autoCamera?: "before" | "after";
  /** Servicios y pagos de la casa en vivo. */
  records: HouseRecords;
  catalogs: HouseCatalogs;
  access: HouseAccess;
  currentUser?: SystemUser | null;
  isSuperAdmin?: boolean;
  photoConfig: PhotoConfig;
  queue: PhotoQueue;
  onClose: () => void;
  onEdit: (house: Property) => void;
  onDuplicate: () => void;
  onDelete: (house: Property) => void;
  onStatusChange: (houseId: string, statusId: string) => void;
  onRequestStatus: (cfg: StatusModalConfig) => void;
}

export default function HouseDetail({
  house: selectedHouse,
  initialTab,
  autoCamera,
  records,
  catalogs,
  access,
  currentUser,
  isSuperAdmin,
  photoConfig,
  queue,
  onClose,
  onEdit: handleOpenForm,
  onDuplicate: handleDuplicate,
  onDelete: handleDelete,
  onStatusChange: handleQuickStatusChange,
  onRequestStatus: setStatusModal,
}: HouseDetailProps) {
  const {
    statuses, teams, priorities, services, products, taxes, customersList, employees,
    getClientName, getServiceName, logLabel,
  } = catalogs;
  const {
    canEdit, canDelete, photosUnlockedFor, isFieldRO, isVisible, isElementVisible, canSeeOfficeNotes, canSeeQualityCheckTab,
    anyVisible, mediaTabAvailable,
  } = access;

  // ⭐ "Notes & Photos" es la primera pestaña del detalle y la que abre por
  //    defecto (pedido del usuario, 10/2026). Si este usuario no la puede ver
  //    (permiso, o empleado antes de Start Job), abre en "Overview & Log".
  //    Quien abre el detalle puede pedir otra (Invoices → "media").
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>(
    () => initialTab ?? (mediaTabAvailable(selectedHouse) ? "media" : "overview"),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isAssigningWorker, setIsAssigningWorker] = useState(false);

  // ⭐ Servicios y pagos del DETALLE en vivo (listener acotado a la casa en
  //    HousesView): marcar un pago como Paid en Payroll o agregar un servicio
  //    desde otro equipo se ve sin cerrar y volver a abrir.
  const houseServices = records.services;
  const detailPayrollRecords = records.payroll;

  // Fotos: aquí solo van las vistas previas de las NUEVAS; las guardadas se
  // toman en vivo de la casa (ver shownPhotoURLs).
  const {
    beforePhotoURLs, setBeforePhotoURLs, afterPhotoURLs, setAfterPhotoURLs,
    beforeFiles, setBeforeFiles, afterFiles, setAfterFiles,
    beforeExcluded, setBeforeExcluded, afterExcluded, setAfterExcluded,
    isCompressing, addPhotoFiles, toggleReportPhoto,
  } = useHousePhotos(photoConfig, {
    before: [],
    after: [],
    beforeExcluded: selectedHouse.beforePhotosExcluded || [],
    afterExcluded: selectedHouse.afterPhotosExcluded || [],
  });
  // ⭐ Fotos guardadas que el usuario quitó y aún no guarda. Antes quitarlas
  //    solo las escondía: al presionar "Save Photos" se volvía a escribir la
  //    lista completa y la foto regresaba al recargar.
  const [detailRemoved, setDetailRemoved] = useState<{ before: string[]; after: string[] }>(NO_REMOVED);
  // "Fuera del reporte" tal como estaba al abrir (para guardar solo lo que el
  // usuario cambió).
  const detailExcludedBaseRef = useRef<{ before: string[]; after: string[] }>({
    before: selectedHouse.beforePhotosExcluded || [],
    after: selectedHouse.afterPhotosExcluded || [],
  });
  // Fotos de esta casa que siguen en la cola sin conexión.
  const pendingForHouse = usePendingForHouse(selectedHouse.id, queue.syncVersion);

  // ⭐ Modal de historial de notas (quién escribió/editó cada nota y cuándo)
  const [isNotesHistoryOpen, setIsNotesHistoryOpen] = useState(false);
  // Campo cuya nota se está enviando (deshabilita su botón mientras guarda)
  const [sendingNote, setSendingNote] = useState<NoteField | null>(null);

  // ⭐ Previsualización del Sync a Google Calendar: al presionar Sync se abre
  //    este modal con TODO lo que se va a enviar (título, horario, color,
  //    invitados, ubicación, nota) para rectificar antes de confirmar.
  const [isGcalPreviewOpen, setIsGcalPreviewOpen] = useState(false);
  // ⭐ VERIFICACIÓN: lo que Google REALMENTE guardó (releído del calendario
  //    por la Cloud Function tras guardar). Se muestra en un modal para poder
  //    rectificar título, color, invitados, y abrir el evento directamente.
  const [gcalVerification, setGcalVerification] = useState<GcalVerification | null>(null);

  // ⭐ Modal de PAGO y de SERVICIO cobrado: en el detalle se escriben directo.
  const [payrollModal, setPayrollModal] = useState<{ initial: PayrollRecord; editingId: string | null } | null>(null);
  const [serviceModal, setServiceModal] = useState<ServiceRecord | null>(null);

  // Pruebas de Cloud Functions (temporal): CfTestModal.
  const [isCfTestOpen, setIsCfTestOpen] = useState(false);

  // ⭐ DAMAGES de la casa (features/houses/hooks/useHouseDamages.ts).
  const [isDamagesOpen, setIsDamagesOpen] = useState(false);
  const houseDamages = useHouseDamages(selectedHouse, getClientName(selectedHouse.client), currentUser);

  // ⭐ CHECKLIST: visor del último checklist de la casa (ChecklistModal).
  //    Visible por "card_checklist"; editable si NO está en "solo lectura".
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const houseChecklist = useHouseChecklist(selectedHouse.id);
  // Places/tasks del store compartido se precargan con el detalle abierto: el
  // visor elige las áreas marcadas en cuanto se abre.
  useLiveData("places");
  useLiveData("tasks");

  // ⭐ CÁMARA RÁPIDA (ráfaga): features/houses/components/BurstCamera.
  //    autoSave: abierta desde la TARJETA de Daily Jobs, al presionar "Guardar"
  //    las fotos se suben solas (sin pasos extra).
  const [camera, setCamera] = useState<{ type: "before" | "after"; autoSave: boolean } | null>(
    () => (autoCamera ? { type: autoCamera, autoSave: true } : null),
  );
  const openBurstCamera = (type: "before" | "after", opts?: { autoSave?: boolean }) =>
    setCamera({ type, autoSave: !!opts?.autoSave });
  // ⭐ Al terminar en modo autoguardado con fotos tomadas, se guardan de
  //    inmediato en Before/After según el modo de la cámara.
  const finishBurstCamera = async (count: number) => {
    const shouldSave = !!camera?.autoSave && count > 0;
    setCamera(null);
    if (shouldSave) await handleSavePhotosFromDetail();
  };

  // ⭐ Desde la TARJETA de Daily Jobs (autoCamera): deja posicionada la sección
  //    correcta detrás de la cámara, para que al cerrar el empleado vea sus
  //    fotos recién guardadas.
  useEffect(() => {
    if (!autoCamera) return;
    const t = setTimeout(() => {
      document
        .getElementById(
          autoCamera === "before" ? "hv-photos-before" : "hv-photos-after",
        )
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    } catch (error) {
      console.error("Error undoing start job:", error);
      alert("Failed to undo start job.");
    } finally {
      setIsSaving(false);
    }
  };

  // ============================================================================
  // ⭐ REGLA: no se puede marcar Finished sin fotos Before y After cargadas.
  //    Devuelve qué falta para poder avisarlo en pantalla y bloquear el botón.
  // ============================================================================
  const photoStatusFor = (house: Property | null) => {
    const before = (house?.beforePhotos || []).length;
    const after = (house?.afterPhotos || []).length;
    const missing: string[] = [];
    if (before === 0) missing.push("Before");
    if (after === 0) missing.push("After");
    return { before, after, missing, ok: missing.length === 0 };
  };

  const handleMarkAsFinished = async () => {
    if (!selectedHouse) return;
    if (!selectedHouse.employeeStartedBy) {
      alert("Error: You must Start the job before marking it as Finished.");
      return;
    }
    // ⭐ Bloqueo por fotos: sin Before/After no se puede finalizar
    const photoCheck = photoStatusFor(selectedHouse);
    if (!photoCheck.ok) {
      alert(
        `No se puede finalizar la casa.\n\nFaltan fotos: ${photoCheck.missing.join(" y ")}.\n\nCarga las fotos en la pestaña "Notes & Photos" y vuelve a intentarlo.`,
      );
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
    } catch (error) {
      console.error("Error undoing finished status:", error);
      alert("Failed to undo finished status.");
    } finally {
      setIsSaving(false);
    }
  };

  // ⭐ El botón Sync SIEMPRE abre la previsualización: ahí se ven los datos
  //    que viajarán Y los obligatorios que falten (con ✓/✗). El envío real
  //    ocurre al confirmar dentro del modal, que se bloquea si falta algo.
  const handleGoogleCalendarSync = () => {
    if (!selectedHouse) return;
    setIsGcalPreviewOpen(true);
  };

  const handleGoogleCalendarSend = async () => {
    if (
      !selectedHouse ||
      !selectedHouse.scheduleDate ||
      !selectedHouse.timeIn
    ) {
      return;
    }
    setIsGcalPreviewOpen(false);

    // ⭐ Si la Cloud Function falla, aquí se guarda el MOTIVO real (mensaje del
    //    HttpsError) para mostrarlo en el diálogo y saber qué corregir:
    //    secretos faltantes, token de Google vencido, permisos, etc.
    let gcalError = "";

    // ⭐ VÍA API (services/gcalSync.ts → Cloud Function synchousetocalendar).
    try {
      setIsSaving(true);
      const data = await syncHouseToCalendar(selectedHouse.id, getClientName(selectedHouse.client));
      if (data?.ok) {
        // ⭐ Bitacora: envio a Google Calendar.
        logActivity({
          action: "calendar_sync",
          module: "Houses",
          user: currentUser,
          targetId: selectedHouse.id,
          targetLabel: logLabel(selectedHouse),
          detail: `Evento sincronizado (${formatDate(selectedHouse.scheduleDate)} ${selectedHouse.timeIn})`,
        });
        if (data.verified) {
          // ⭐ Modal de verificación con lo que Google confirmó guardado.
          setGcalVerification(data.verified);
        } else {
          alert(
            "✅ Evento sincronizado con Google Calendar.\n\nSi lo editas en el calendario (fecha, horas, dirección o nota), el cambio regresará a la app automáticamente.",
          );
        }
        return;
      }
    } catch (fnErr) {
      // Función no desplegada o sin permisos: usar el método manual de siempre
      console.warn(
        "synchousetocalendar no disponible; usando el método manual:",
        fnErr,
      );
      gcalError =
        (fnErr as { message?: string })?.message || String(fnErr);
    } finally {
      setIsSaving(false);
    }
    // ⭐ La vía API falló: avisar ANTES de abrir el método manual, porque la
    //    plantilla del navegador NO puede aplicar el color del equipo ni
    //    quitar el Meet/notificación (eso solo lo hace la Cloud Function).
    const goManual = window.confirm(
      `No se pudo enviar por la Cloud Function.\n\nMotivo: ${gcalError || "desconocido"}\n\n¿Abrir Google Calendar en modo MANUAL?\nOJO: por esta vía el evento NO llevará el color del equipo y Google puede agregarle Meet y notificación.`,
    );
    if (!goManual) return;
    // ⭐ Mismo título que la Cloud Function: "Team - Dirección". Nota: el COLOR
    //    del evento y quitar el Meet automático solo se pueden hacer vía API
    //    (Cloud Function); la URL de plantilla no lo soporta — este camino es
    //    solo el respaldo manual.
    const fallbackTeamName = (
      teams.find((t) => t.id === selectedHouse.teamId)?.name || ""
    ).trim();
    const fallbackTitle = fallbackTeamName
      ? `${fallbackTeamName} - ${selectedHouse.address || getClientName(selectedHouse.client)}`
      : `Cleaning: ${selectedHouse.address || getClientName(selectedHouse.client)}`;
    window.open(manualCalendarUrl(selectedHouse, fallbackTitle), "_blank");
  };

  const toggleWorkerAssignmentDetail = async (workerId: string) => {
    if (!selectedHouse || !canEdit) return;
    setIsSaving(true);
    try {
      const isAssigned = (selectedHouse.assignedWorkers || []).includes(workerId);
      // ⭐ Atómico: no pisa a quien asignó a otra persona al mismo tiempo.
      await propertiesService.arrayChange(
        selectedHouse.id,
        isAssigned ? "remove" : "add",
        { assignedWorkers: [workerId] },
      );
    } catch (error) {
      console.error("Error updating workers:", error);
      alert("Failed to update assigned workers.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenPayrollForm = (houseId: string) => {
    if (!houseId) return alert("Must save the house first.");
    setPayrollModal({ editingId: null, initial: newPayrollRecord(houseId) });
  };

  // ⭐ Abre el MISMO modal de pago, precargado con el registro a editar.
  const handleOpenPayrollEdit = (record: PayrollRecord) => {
    setPayrollModal({ editingId: String(record.id), initial: editablePayroll(record) });
  };

  const handleSavePayroll = async (payrollForm: PayrollRecord) => {
    if (!payrollModal) return;
    const { editingId: editingPayrollId } = payrollModal;
    const total = payrollTotal(payrollForm);
    const dataToSave = {
      ...payrollForm,
      totalAmount: total,
      status: "Pending" as const,
    };

    setIsSaving(true);
    try {
      if (editingPayrollId) {
        // ⭐ EDITAR un pago existente: se actualiza el MISMO documento (el pago
        //    conserva su id y su status Pending/Paid; solo cambian los datos).
        const payload = {
          propertyId: payrollForm.propertyId,
          date: payrollForm.date,
          employeeId: payrollForm.employeeId,
          baseAmount: Number(payrollForm.baseAmount || 0),
          extraAmount: Number(payrollForm.extraAmount || 0),
          extraNote: payrollForm.extraNote || "",
          discountAmount: Number(payrollForm.discountAmount || 0),
          discountNote: payrollForm.discountNote || "",
          totalAmount: total,
        };
        await payrollService.update(String(editingPayrollId), payload);
        setPayrollModal(null);
        alert("Payment updated successfully.");
        return;
      }
      await payrollService.create(dataToSave);
      setPayrollModal(null);
      alert("Payment registered successfully.");
    } catch (error) {
      console.error("Error saving payroll:", error);
      const fbErr = error as { code?: string; message?: string };
      alert(
        `Error saving payment.\n\nCódigo: ${fbErr.code || "desconocido"}\nDetalle: ${fbErr.message || String(error)}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePayroll = async (id: string) => {
    if (!window.confirm("Delete this payment record?")) return;
    setIsSaving(true);
    try {
      await payrollService.delete(id);
    } catch (e) {
      console.error(e);
      alert("Error deleting record.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenServiceForm = (record?: ServiceRecord) => {
    setServiceModal(
      record || newServiceRecord(selectedHouse.id, selectedHouse.client, taxes, customersList),
    );
  };

  // El modal valida y entrega el registro con sus totales calculados.
  const handleSaveService = async (dataToSave: ServiceRecord) => {
    if (!serviceModal) return;
    setIsSaving(true);
    try {
      // El listener de la casa (useHouseRecords) muestra el cambio al instante.
      if (dataToSave.id) {
        await billingServices.update(dataToSave.id, dataToSave);
      } else {
        await billingServices.create(dataToSave);
      }
      setServiceModal(null);
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
      await billingServices.remove(id);
    } catch (error) {
      console.error("Error deleting service:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // ⭐ ¿El rol activo puede EDITAR esta nota desde el detalle? Visible y no
  //    solo-lectura. El empleado edita "Employee's Note" si el configurador
  //    se lo permite, sin necesitar el permiso Edit del módulo completo.
  const canEditDetailNote = (fieldId: "note" | "officeNote" | "employeeNote") => {
    if (fieldId === "officeNote") return canSeeOfficeNotes() && !isFieldRO("officeNote");
    return isElementVisible(fieldId) && !isFieldRO(fieldId);
  };

  // ⭐ Nombre legible del autor de una nota (el historial guarda el email).
  const noteAuthorName = (email: string) => {
    const u = employees.find((e) => String(e.email || "").toLowerCase() === String(email || "").toLowerCase());
    const full = u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : "";
    return full || String(email || "?").split("@")[0];
  };

  // ⭐ Mensajes de una nota: cada entrada del historial es un mensaje. Si la
  //    nota tiene texto pero aún no tiene historial (casas viejas o importadas
  //    de AppSheet), ese texto se muestra como un primer mensaje "Nota anterior".
  const noteMessages = (field: NoteField): NoteMessage[] => {
    if (!selectedHouse) return [];
    const me = String(currentUser?.email || "").toLowerCase();
    const canWrite = canEditDetailNote(field);
    const msgs: NoteMessage[] = (selectedHouse.notesHistory || [])
      .filter((e) => e.field === field && (String(e.text || "").trim() !== "" || (e.attachments?.length || 0) > 0))
      .map((e) => {
        const mine = !!me && String(e.user || "").toLowerCase() === me;
        return {
          // La clave identifica la entrada (autor + hora) para poder corregirla.
          key: `${field}::${e.at}::${e.user}`,
          text: e.text,
          author: noteAuthorName(e.user),
          at: e.at,
          mine,
          edited: e.action === "edited" || !!e.editedAt,
          attachments: e.attachments,
          // Cada quien corrige SUS mensajes; un administrador, cualquiera.
          canEdit: canWrite && (mine || !!isSuperAdmin),
        };
      });
    const current = String(selectedHouse[field] || "").trim();
    if (msgs.length === 0 && current) {
      msgs.push({
        key: `${field}::legacy`,
        text: current,
        author: "Nota anterior",
        at: "",
        mine: false,
        canEdit: canWrite && (!!isSuperAdmin || !!canEdit),
      });
    }
    return msgs;
  };

  // ⭐ Enviar un mensaje a una nota. El campo de la casa ACUMULA los mensajes
  //    (texto anterior + salto de línea + mensaje nuevo) para que tarjetas,
  //    Invoices y Quality Check sigan mostrando la nota completa; el historial
  //    guarda el mensaje suelto con su autor y hora. Puede llevar archivos
  //    (se suben primero; un mensaje solo con archivos no cambia el texto).
  const handleSendNote = async (field: NoteField, text: string, files: File[] = []): Promise<boolean> => {
    if (!selectedHouse || !canEditDetailNote(field)) return false;
    const prev = String(selectedHouse[field] || "").trim();
    const nextValue = text ? (prev ? `${prev}\n${text}` : text) : prev;
    setSendingNote(field);
    try {
      const attachments = files.length > 0
        ? await storageService.uploadNoteFiles(files, getClientName(selectedHouse.client), selectedHouse.address)
        : [];
      const entry: NoteHistoryEntry = {
        field,
        text,
        user: currentUser?.email || "?",
        at: new Date().toISOString(),
        action: "created",
        ...(attachments.length > 0 ? { attachments } : {}),
      };
      // ⭐ El mensaje entra al historial con arrayUnion: dos personas que
      //    escriben a la vez ya no se borran el mensaje la una a la otra.
      await propertiesService.arrayChange(
        selectedHouse.id,
        "add",
        { notesHistory: [entry] },
        text ? ({ [field]: nextValue } as Partial<Property>) : {},
      );
      logActivity({
        action: "update",
        module: "Houses",
        user: currentUser,
        targetId: selectedHouse.id,
        targetLabel: logLabel(selectedHouse),
        changes: text ? [{ field, before: prev, after: nextValue }] : [],
        ...(attachments.length > 0 ? { detail: `${attachments.length} archivo(s) en ${field}` } : {}),
      });
      return true;
    } catch (error) {
      console.error("❌ Error saving note:", error);
      const fbErr = error as { code?: string; message?: string };
      alert(
        `No se pudo guardar la nota.\n\nCódigo: ${fbErr.code || "desconocido"}\nDetalle: ${fbErr.message || String(error)}`,
      );
      return false;
    } finally {
      setSendingNote(null);
    }
  };

  // ⭐ Corregir el texto de un mensaje de las notas (transacción en
  //    propertiesService.editNoteMessage: cambia la entrada y rehace el texto
  //    acumulado del campo). El mensaje queda marcado "editada".
  const handleEditNote = async (field: NoteField, message: NoteMessage, text: string): Promise<boolean> => {
    if (!selectedHouse || !message.canEdit) return false;
    const [, at = "", user = ""] = message.key.split("::");
    const legacy = at === "legacy";
    setSendingNote(field);
    try {
      await propertiesService.editNoteMessage(
        selectedHouse.id,
        field,
        { user: legacy ? "" : user, at: legacy ? "" : at },
        text,
        currentUser?.email || "?",
      );
      logActivity({
        action: "update",
        module: "Houses",
        user: currentUser,
        targetId: selectedHouse.id,
        targetLabel: logLabel(selectedHouse),
        changes: [{ field, before: message.text, after: text }],
        detail: "Nota corregida",
      });
      return true;
    } catch (error) {
      console.error("❌ Error editing note:", error);
      const fbErr = error as { code?: string; message?: string };
      alert(
        `No se pudo corregir la nota.\n\nCódigo: ${fbErr.code || "desconocido"}\nDetalle: ${fbErr.message || String(error)}`,
      );
      return false;
    } finally {
      setSendingNote(null);
    }
  };

  const handleSavePhotosFromDetail = async () => {
    if (!selectedHouse) return alert("No property selected.");

    setIsSaving(true);
    try {
      const workingId = selectedHouse.id;

      const beforeRes = await queue.uploadOrQueue(
        beforeFiles,
        getClientName(selectedHouse.client),
        selectedHouse.address,
        "before",
        workingId,
      );
      const afterRes = await queue.uploadOrQueue(
        afterFiles,
        getClientName(selectedHouse.client),
        selectedHouse.address,
        "after",
        workingId,
      );

      // ⭐ Solo los cambios, de forma atómica: fotos quitadas (arrayRemove),
      //    fotos nuevas (arrayUnion) y lo que el usuario sacó o metió al
      //    reporte. Antes se reescribía la lista completa con la copia de la
      //    pantalla: las fotos quitadas regresaban y las que otro equipo
      //    subía mientras tanto se perdían.
      const bx = listDiff(detailExcludedBaseRef.current.before, beforeExcluded);
      const ax = listDiff(detailExcludedBaseRef.current.after, afterExcluded);
      await commitOps([
        (b) =>
          propertiesService.batchArrayChange(b, workingId, {
            remove: {
              beforePhotos: detailRemoved.before,
              afterPhotos: detailRemoved.after,
              beforePhotosExcluded: bx.remove,
              afterPhotosExcluded: ax.remove,
            },
            add: {
              beforePhotos: beforeRes.urls,
              afterPhotos: afterRes.urls,
              beforePhotosExcluded: bx.add,
              afterPhotosExcluded: ax.add,
            },
          }),
      ]);
      detailExcludedBaseRef.current = { before: beforeExcluded, after: afterExcluded };

      // Las vistas previas ya no hacen falta: la casa en vivo trae las URLs.
      [...beforePhotoURLs, ...afterPhotoURLs].forEach((u) => {
        if (u.startsWith("blob:")) URL.revokeObjectURL(u);
      });
      setBeforePhotoURLs([]);
      setAfterPhotoURLs([]);
      setDetailRemoved(NO_REMOVED);
      setBeforeFiles([]);
      setAfterFiles([]);

      const queued = beforeRes.queued + afterRes.queued;
      await queue.refreshTotal();
      await pendingForHouse.reload();
      alert(
        queued > 0
          ? `Guardado. ${queued} foto(s) se subirán al recuperar conexión.`
          : "Photos saved successfully!",
      );
      return;
    } catch (error) {
      console.error("❌ Error saving photos:", error);
      // ⭐ Se muestra el código REAL de Firebase (igual que en checklist/daños)
      //    para poder diagnosticar: storage/unauthorized = reglas de Storage;
      //    permission-denied = reglas de Firestore; error de red/CORS = dominio
      //    de producción faltante en el cors.json del bucket.
      const fbErr = error as { code?: string; message?: string };
      alert(
        `No se pudieron guardar las fotos.\n\nCódigo: ${fbErr.code || "desconocido"}\nDetalle: ${fbErr.message || String(error)}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Si la pestaña elegida deja de estar disponible (p. ej. el empleado deshace
  // Start Job estando en Notes & Photos), se muestra Overview en vez de nada.
  const shownDetailTab: DetailTab =
    activeDetailTab === "media" && !mediaTabAvailable(selectedHouse) ? "overview" : activeDetailTab;

  // Fotos que se MUESTRAN. Formulario: su buffer. Detalle: las guardadas de
  // la casa EN VIVO, menos las quitadas sin guardar, más las nuevas.
  const shownPhotoURLs = (type: "before" | "after"): string[] => {
    const local = type === "before" ? beforePhotoURLs : afterPhotoURLs;
    if (!selectedHouse) return local;
    const stored =
      (type === "before" ? selectedHouse.beforePhotos : selectedHouse.afterPhotos) || [];
    const removed = detailRemoved[type];
    return [...stored.filter((u) => !removed.includes(u)), ...local];
  };

  // Quitar una foto en el DETALLE: una nueva se descarta; una guardada se
  // marca para quitarla al presionar "Save Photos".
  const removeDetailPhoto = (index: number, type: "before" | "after") => {
    const url = shownPhotoURLs(type)[index];
    if (!url) return;
    const previews = type === "before" ? beforePhotoURLs : afterPhotoURLs;
    const previewIndex = previews.indexOf(url);
    if (previewIndex >= 0) {
      const setPreviews = type === "before" ? setBeforePhotoURLs : setAfterPhotoURLs;
      const setFiles = type === "before" ? setBeforeFiles : setAfterFiles;
      setPreviews((prev) => prev.filter((u) => u !== url));
      setFiles((prev) => prev.filter((_, i) => i !== previewIndex));
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    } else {
      setDetailRemoved((prev) => ({ ...prev, [type]: [...prev[type], url] }));
    }
    const setExcluded = type === "before" ? setBeforeExcluded : setAfterExcluded;
    setExcluded((prev) => prev.filter((u) => u !== url));
  };

  const generatePDF = async (type: "before" | "after") => {
    const excluded = type === "before" ? beforeExcluded : afterExcluded;
    const urls = shownPhotoURLs(type).filter((u) => !excluded.includes(u));

    if (urls.length === 0) {
      alert(
        `No hay fotos de tipo "${type.toUpperCase()}" subidas para generar el reporte.`,
      );
      return;
    }

    setIsSaving(true);
    try {
      const opened = await openPhotoReport({
        type,
        urls,
        clientName: selectedHouse?.client ? getClientName(selectedHouse.client) : "Propiedad",
        address: selectedHouse?.address || "N/A",
      });
      if (!opened)
        alert(
          "Por favor permite las ventanas emergentes (pop-ups) para generar el PDF.",
        );
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Error al generar el PDF. Revisa la consola.");
    } finally {
      setIsSaving(false);
    }
  };

  const totalBilled = houseServices.reduce((sum, r) => sum + r.total, 0);
  const totalPayroll = detailPayrollRecords.reduce(
    (sum, r) => sum + r.totalAmount,
    0,
  );
  const netProfit = totalBilled - totalPayroll;

  return (
    <>
      {/* --- DETAIL MODAL. NO va por portal a body: los modales que se abren
          DESDE el detalle (Damages, Checklist, payroll, status) comparten
          z-index 9999 y un portal en body los taparia por orden del DOM.
          La X va ABSOLUTA arriba a la derecha del modal, grande y táctil. --- */}
      <div
        className="modal-overlay-centered"
        onClick={onClose}
      >
        <div className="modal-90 hv-detail-modal" onClick={(e) => e.stopPropagation()}>
          <button
            className="hv-detail-close-btn"
            aria-label="Cerrar detalle"
            onClick={onClose}
          >
            <X size={26} />
          </button>
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
                  // ⭐ Sin fotos Before/After no se puede finalizar
                  const photoCheck = photoStatusFor(selectedHouse);
                  const blockedByPhotos = !finished && !photoCheck.ok;
                  return (
                    <button
                      onClick={
                        finished ? handleUndoFinished : handleMarkAsFinished
                      }
                      disabled={
                        isSaving ||
                        (!started && !finished) ||
                        finishLocked ||
                        blockedByPhotos
                      }
                      title={
                        finished
                          ? `Terminado por ${selectedHouse.employeeFinishedBy} · ${formatDateTime(selectedHouse.employeeFinishedAt)}${finishLocked ? " — solo esa persona (o un admin) puede deshacerlo" : " — clic para deshacer"}`
                          : blockedByPhotos
                            ? `Faltan fotos ${photoCheck.missing.join(" y ")} — no se puede finalizar`
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
            </div>
          </header>

          <div className="modal-body-scroll hv-detail-body">
            {isElementVisible("address") && (
              <div className="hv-detail-address-row">
                <MapPin size={18} color="#3b82f6" /> {selectedHouse.address}
                {isElementVisible("unit") &&
                  selectedHouse.unit && (
                    <span className="hv-detail-unit-badge">
                      <Hash size={12} /> {selectedHouse.unit}
                    </span>
                  )}
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
              {/* ⭐ Primera pestaña. Empleado: aparece SOLO después de Start Job */}
              {mediaTabAvailable(selectedHouse) && (
                <button
                  className={`hv-detail-tab${shownDetailTab === "media" ? " active" : ""}`}
                  onClick={() => setActiveDetailTab("media")}
                >
                  <FileImage size={14} className="hv-tab-icon-inline" /> Notes
                  & Photos
                </button>
              )}
              <button
                className={`hv-detail-tab${shownDetailTab === "overview" ? " active" : ""}`}
                onClick={() => setActiveDetailTab("overview")}
              >
                <Briefcase size={14} className="hv-tab-icon-inline" />{" "}
                Overview & Log
              </button>
              {isVisible("financial") &&
                isElementVisible("btn_tabFinancials") && (
                  <button
                    className={`hv-detail-tab${shownDetailTab === "financials" ? " active" : ""}`}
                    onClick={() => setActiveDetailTab("financials")}
                  >
                    <BarChart3 size={14} className="hv-tab-icon-inline" />{" "}
                    Financials & Billing
                  </button>
                )}
              {/* ⭐ History: historial de cambios de status de ESTA casa */}
              <button
                className={`hv-detail-tab${shownDetailTab === "history" ? " active" : ""}`}
                onClick={() => setActiveDetailTab("history")}
              >
                <History size={14} className="hv-tab-icon-inline" /> History
              </button>
              {/* ⭐ Quality check: las inspecciones de ESTA casa (permiso Quality Check + tab activo). */}
              {canSeeQualityCheckTab() && (
                <button
                  className={`hv-detail-tab${shownDetailTab === "quality" ? " active" : ""}`}
                  onClick={() => setActiveDetailTab("quality")}
                >
                  <ClipboardCheck size={14} className="hv-tab-icon-inline" /> Quality check
                </button>
              )}
            </div>

            {shownDetailTab === "overview" && (
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

            {/* ⭐ TAB HISTORY: todos los cambios de status por los que ha
                pasado la casa (quién lo cambió, cuándo, de qué a qué). */}
            {shownDetailTab === "history" && (
              <div className="fade-in">
                {/* key con el status actual: si cambian el status con el tab
                    abierto, el panel se remonta y recarga el historial. */}
                <StatusHistoryPanel
                  key={`${selectedHouse.id}-${selectedHouse.statusId || "none"}`}
                  propertyId={selectedHouse.id}
                  statuses={statuses}
                />
              </div>
            )}

            {/* ⭐ TAB QUALITY CHECK: reportes de la casa (solo lectura). */}
            {shownDetailTab === "quality" && canSeeQualityCheckTab() && (
              <div className="fade-in">
                <HouseQcHistory house={selectedHouse} />
              </div>
            )}

            {shownDetailTab === "financials" && isVisible("financial") && (
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
                          handleOpenServiceForm()
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
                                          handleOpenServiceForm(record)
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
                        {detailPayrollRecords.length === 0 ? (
                          <tr>
                            <td
                              colSpan={canEdit ? 7 : 6}
                              className="hv-fin-empty-row"
                            >
                              No payments registered yet.
                            </td>
                          </tr>
                        ) : (
                          detailPayrollRecords.map((record) => {
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
                                    <div className="hv-fin-actions-cell">
                                      <button
                                        onClick={() =>
                                          handleOpenPayrollEdit(record)
                                        }
                                        disabled={isSaving}
                                        className="hv-service-action-btn edit"
                                        title="Edit payment"
                                      >
                                        <Edit2 size={14} />
                                      </button>
                                      <button
                                        onClick={() =>
                                          handleDeletePayroll(
                                            record.id as string,
                                          )
                                        }
                                        disabled={isSaving}
                                        className="hv-service-action-btn delete"
                                        title="Delete payment"
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
              </div>
            )}

            {shownDetailTab === "media" &&
              isVisible("media") &&
              photosUnlockedFor(selectedHouse) && (
                <div className="fade-in">
                  {/* ⭐ NOTAS EN FORMATO DE MENSAJES: cada nota es un mensaje
                      con autor y hora (historial notesHistory) y se escribe la
                      siguiente abajo, como en un chat. Office Notes primero:
                      es interna y solo la ve quien tiene el permiso. */}
                  {(anyVisible("note", "employeeNote") || canSeeOfficeNotes()) && (
                    <div className="hv-media-grid hv-notes-grid">
                      {canSeeOfficeNotes() && (
                        <NoteThread
                          title="Office Notes"
                          icon={<Briefcase size={14} />}
                          tone="office"
                          messages={noteMessages("officeNote")}
                          emptyText="Sin notas de oficina todavía."
                          canWrite={canEditDetailNote("officeNote")}
                          placeholder="Nota interna de oficina…"
                          sending={sendingNote === "officeNote"}
                          onSend={(t, files) => handleSendNote("officeNote", t, files)}
                          onEdit={(m, t) => handleEditNote("officeNote", m, t)}
                        />
                      )}
                      {isElementVisible("note") && (
                        <NoteThread
                          title="General Note"
                          icon={<StickyNote size={14} />}
                          tone="general"
                          messages={noteMessages("note")}
                          emptyText="Sin notas generales todavía."
                          canWrite={canEditDetailNote("note")}
                          placeholder="Instrucciones o notas generales…"
                          sending={sendingNote === "note"}
                          onSend={(t, files) => handleSendNote("note", t, files)}
                          onEdit={(m, t) => handleEditNote("note", m, t)}
                        />
                      )}
                      {isElementVisible("employeeNote") && (
                        <NoteThread
                          title="Employee's Note"
                          icon={<StickyNote size={14} />}
                          tone="employee"
                          messages={noteMessages("employeeNote")}
                          emptyText="Sin notas del empleado todavía."
                          canWrite={canEditDetailNote("employeeNote")}
                          placeholder="Escribe aquí la nota del empleado…"
                          sending={sendingNote === "employeeNote"}
                          onSend={(t, files) => handleSendNote("employeeNote", t, files)}
                          onEdit={(m, t) => handleEditNote("employeeNote", m, t)}
                        />
                      )}
                    </div>
                  )}

                  {/* Historial completo (quién escribió/editó cada nota y cuándo) */}
                  {(anyVisible("note", "employeeNote") || canSeeOfficeNotes()) && (
                    <div className="hv-save-notes-row">
                      <button
                        className="hv-drafts-btn"
                        onClick={() => setIsNotesHistoryOpen(true)}
                      >
                        <FileText size={15} /> Historial ({(selectedHouse.notesHistory || []).length})
                      </button>
                    </div>
                  )}

                  {isElementVisible("card_photos") && (
                    <div className="hv-media-grid no-mb">
                      <div id="hv-photos-before">
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
                          urls={shownPhotoURLs("before")}
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
                            removeDetailPhoto(i, "before")
                          }
                          onToggleReport={(u: string) =>
                            toggleReportPhoto(u, "before")
                          }
                        />
                      </div>
                      <div id="hv-photos-after">
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
                          urls={shownPhotoURLs("after")}
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
                            removeDetailPhoto(i, "after")
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
                    onClick={() => handleDelete(selectedHouse)}
                    disabled={isSaving}
                    className="hv-btn-danger-light-modal"
                  >
                    <Trash2 size={16} /> Delete Property
                  </button>
                )}
            </div>
            <div className="hv-footer-actions">
              {/* ⭐ TEMPORAL: pruebas de Cloud Functions. Visible para TODOS
                  mientras se verifica el despliegue. Borrar este botón (y su
                  modal, más abajo) cuando todo esté confirmado. */}
              <button
                onClick={() => setIsCfTestOpen(true)}
                className="hv-btn-cftest"
                title="Probar las Cloud Functions de Calendar y email de QC"
              >
                <Zap size={16} /> Probar functions
              </button>
              {/* ⭐ DAMAGES: abre el modal de daños. Se controla SOLO con el
                  elemento "card_damages" del configurador: visible = lo ve;
                  solo lectura = lo ve pero no agrega/edita. */}
              {isElementVisible("card_damages") && (
                <button
                  onClick={() => setIsDamagesOpen(true)}
                  className="hv-btn-damages-modal"
                >
                  <AlertTriangle size={16} /> Damages
                  {houseDamages.damages.length > 0 && (
                    <span className="hv-damages-footer-count">
                      {houseDamages.damages.length}
                    </span>
                  )}
                </button>
              )}
              {/* ⭐ CHECKLIST: visor del checklist de la casa. Visible por
                  "card_checklist"; editable si NO está en solo lectura. */}
              {isElementVisible("card_checklist") && (
                <button
                  onClick={() => setIsChecklistOpen(true)}
                  className="hv-btn-checklist-modal"
                >
                  <ClipboardCheck size={16} /> Checklist
                  {houseChecklist.checklist && (
                    <span className="hv-checklist-footer-count">
                      {Object.keys(houseChecklist.checklist.checked ?? {}).length}
                    </span>
                  )}
                </button>
              )}
              <button
                onClick={onClose}
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

      {/* --- MODAL: PREVISUALIZACIÓN DEL SYNC A GOOGLE CALENDAR --- */}
      {isGcalPreviewOpen && selectedHouse && (
        <GcalPreviewModal
          house={selectedHouse}
          teams={teams}
          getClientName={getClientName}
          busy={isSaving}
          onSend={handleGoogleCalendarSend}
          onClose={() => setIsGcalPreviewOpen(false)}
        />
      )}

      {/* --- MODAL: HISTORIAL DE NOTAS --- */}
      {isNotesHistoryOpen && selectedHouse && (
        <NotesHistoryModal house={selectedHouse} onClose={() => setIsNotesHistoryOpen(false)} />
      )}

      {/* --- MODAL: VERIFICACIÓN DEL EVENTO GUARDADO EN GOOGLE CALENDAR --- */}
      {gcalVerification && (
        <GcalVerificationModal verification={gcalVerification} onClose={() => setGcalVerification(null)} />
      )}

      {/* --- SERVICE MODAL --- */}
      {serviceModal && (
        <ServiceModal
          initial={serviceModal}
          products={products}
          services={services}
          taxes={taxes}
          busy={isSaving}
          onSave={(record) => void handleSaveService(record)}
          onClose={() => setServiceModal(null)}
        />
      )}

      {/* --- PAYROLL MODAL --- */}
      {payrollModal && (
        <PayrollModal
          initial={payrollModal.initial}
          editing={!!payrollModal.editingId}
          employees={employees}
          busy={isSaving}
          onSave={(form) => void handleSavePayroll(form)}
          onClose={() => setPayrollModal(null)}
        />
      )}

      {/* ⭐ MODAL TEMPORAL — PRUEBAS DE CLOUD FUNCTIONS */}
      {isCfTestOpen && selectedHouse && (
        <CfTestModal
          house={selectedHouse}
          clientName={getClientName(selectedHouse.client)}
          onClose={() => setIsCfTestOpen(false)}
        />
      )}

      {/* ⭐ MODAL CHECKLIST del empleado — mismo formato que "Iniciar Inspección"
          de Quality Check, solo con "Yes" y sin "DID NOT PASS". */}
      {isChecklistOpen && selectedHouse && (
        <ChecklistModal
          property={selectedHouse}
          clientName={getClientName(selectedHouse.client)}
          currentUser={currentUser}
          isReadOnly={isFieldRO("card_checklist")}
          savedChecklist={houseChecklist.checklist}
          isChecklistLoaded={houseChecklist.isLoaded}
          hasChecklistLoadError={houseChecklist.hasLoadError}
          onClose={() => setIsChecklistOpen(false)}
        />
      )}

      {/* ⭐ MODAL DAMAGES — daños reportados de la casa (colección 'damages').
          Permisos SOLO por configurador: card_damages visible = ver;
          NO solo-lectura = agregar/editar/eliminar. */}
      {isDamagesOpen && selectedHouse && (
        <DamagesModal
          house={selectedHouse}
          clientName={getClientName(selectedHouse.client)}
          readOnly={isFieldRO("card_damages")}
          api={houseDamages}
          onClose={() => setIsDamagesOpen(false)}
        />
      )}

      {/* --- CÁMARA RÁPIDA (RÁFAGA): varias tomas seguidas sin cerrarse --- */}
      {camera && (
        <BurstCamera
          type={camera.type}
          autoSave={camera.autoSave}
          busy={isCompressing}
          onCapture={(file) => addPhotoFiles([file], camera.type)}
          onCancel={() => setCamera(null)}
          onDone={finishBurstCamera}
        />
      )}
    </>
  );
}
