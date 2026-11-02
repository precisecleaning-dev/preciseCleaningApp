// src/features/houses/components/HouseForm.tsx
// ============================================================================
// ⭐ FORMULARIO DE CASA tipo Work Order (alta, edición, duplicado o borrador
//    restaurado): datos generales, logística, agenda y equipo, servicios
//    cobrados, payroll, notas y fotos; resumen a la derecha. Tiene su propio
//    estado (copia de la casa, servicios y pagos en borrador, fotos nuevas) y
//    se monta de nuevo en cada apertura. Servicios y pagos se guardan con la
//    casa al presionar "Confirm & Save"; al salir sin guardar queda borrador.
//    Extraído de HousesView sin cambiar la lógica.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, MapPin, Plus, X, Edit2, Trash2, Activity, FileText, CalendarDays, Clock, User, Wrench, Hash, Flag,
  Users, StickyNote, Image as ImageIcon, CheckSquare, DollarSign, Save, XCircle, Layers, Settings, Receipt,
  CalendarClock, Camera,
} from "lucide-react";
import type { Customer, PayrollRecord, Property, ServiceRecord, SystemUser } from "../../../types/index";
import { commitOps, type BatchOp } from "../../../shared/data/batchWrites";
import { propertiesService } from "../../../services/propertiesService";
import { payrollService } from "../../../services/payrollService";
import { logActivity, diffObjects } from "../../../services/activityLogService";
import type { PhotoConfig } from "../../../services/photoConfigService";
import { formatDate, dateSortValue, todayIso } from "../../../utils/dateFormat";
import { getRelationName } from "../../../utils/relations";
import { stampInvoiceEntry } from "../../../utils/invoiceEntry";
import { cavalryClientKeys, houseBusiness, statusesForBusiness } from "../../../shared/utils/businesses";
import PhotoSection from "../../../components/PhotoSection";
import DateInput from "../../../shared/components/DateInput";
import { newServiceRecord, recordFingerprint, recordTotalMinusTax } from "../serviceRecords";
import { editablePayroll, newPayrollRecord, payrollTotal } from "../payrollRecords";
import { changedFields, listDiff } from "../houseDiff";
import type { HouseDraft } from "../houseDrafts";
import type { FormVisibilityConfig } from "../houseFieldConfig";
import { addStatusHistory, afterStatusHistoryWrite } from "../services/houseStatus";
import { billingServices } from "../services/billingServices";
import type { HouseRecords } from "../hooks/useLiveHouse";
import type { HouseCatalogs } from "../hooks/useHouseCatalogs";
import type { HouseAccess } from "../hooks/useHouseAccess";
import { usePendingForHouse, type PhotoQueue } from "../hooks/usePhotoQueue";
import { useHousePhotos } from "../hooks/useHousePhotos";
import SearchableSelect from "./SearchableSelect";
import CustomerQuickModal from "./CustomerQuickModal";
import FieldConfigModal from "./FieldConfigModal";
import BurstCamera from "./BurstCamera";
import ServiceModal from "./ServiceModal";
import PayrollModal from "./PayrollModal";

/** Con qué se abre el formulario. */
export type HouseFormInit =
  | { kind: "new" }
  | { kind: "edit"; house: Property }
  | { kind: "duplicate"; house: Property; services: ServiceRecord[] }
  | { kind: "draft"; draft: HouseDraft };

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

interface InitialForm {
  formData: Property;
  formServices: ServiceRecord[];
  housePayrollRecords: PayrollRecord[];
  /** Casa cuyos servicios y pagos se copian al borrador al llegar (edición). */
  seedFor: string | null;
  /** La casa tal como estaba al abrir (solo edición). */
  base: Property | null;
  /** Fotos "fuera del reporte" con las que arranca. */
  excluded: { before: string[]; after: string[] };
}

const NO_EXCLUDED = { before: [], after: [] };

// Estado inicial según cómo se abrió (antes: handleOpenForm, handleDuplicate
// y restoreDraft de HousesView).
function initialForm(init: HouseFormInit, defaultStatus: string): InitialForm {
  switch (init.kind) {
    case "edit":
      // Servicios y pagos: llegan por useHouseRecords (efecto de abajo).
      return {
        formData: init.house,
        formServices: [],
        housePayrollRecords: [],
        seedFor: init.house.id,
        base: init.house,
        excluded: { before: init.house.beforePhotosExcluded || [], after: init.house.afterPhotosExcluded || [] },
      };
    case "duplicate": {
      // ⭐ La copia NO hereda el vínculo con Google Calendar. Antes se copiaba
      //    el gcalEventId del original y, al sincronizar la copia, se PARCHABA
      //    el evento de la otra casa en el calendario ("se borraba una casa al
      //    agendar otra"). La copia empieza sin evento y crea el suyo propio.
      const duplicated = { ...init.house } as Property & {
        gcalEventId?: string;
        gcalSyncedAt?: string;
      };
      delete duplicated.gcalEventId;
      delete duplicated.gcalSyncedAt;
      return {
        formData: { ...duplicated, id: "", beforePhotos: [], afterPhotos: [] },
        formServices: init.services.map((s) => ({
          ...s,
          id: `temp-${Math.random().toString(36).substring(2, 9)}`,
          propertyId: "",
        })),
        // ⭐ La copia es una casa NUEVA: los pagos pertenecen a la casa original y
        //    NO se heredan. Se pueden capturar de cero en la card Payroll.
        housePayrollRecords: [],
        seedFor: null,
        base: null,
        excluded: NO_EXCLUDED,
      };
    }
    case "draft":
      // Sin referencia de lo cargado: al guardar se reescriben todos (como antes).
      return {
        formData: init.draft.formData,
        formServices: init.draft.formServices || [],
        housePayrollRecords: init.draft.housePayrollRecords || [],
        seedFor: null,
        base: null,
        // Las fotos y "fuera del reporte" del borrador (antes quedaban las del
        // formulario anterior).
        excluded: {
          before: init.draft.formData.beforePhotosExcluded || [],
          after: init.draft.formData.afterPhotosExcluded || [],
        },
      };
    default:
      // ⭐ Default del formulario nuevo. Si el catalogo aun no cargo queda
      //    vacio a proposito: handleSave bloquea el guardado hasta que el
      //    usuario elija un status real, en vez de crear una casa huerfana.
      return {
        formData: {
          id: "",
          statusId: defaultStatus,
          invoiceStatus: "Pending",
          receiveDate: todayIso(),
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
        },
        formServices: [],
        housePayrollRecords: [],
        seedFor: null,
        base: null,
        excluded: NO_EXCLUDED,
      };
  }
}

interface HouseFormProps {
  init: HouseFormInit;
  /** Servicios y pagos en vivo de la casa abierta (para la edición). */
  records: HouseRecords;
  /** Lista global de casas (status anterior y bitácora si no hay copia). */
  properties: Property[];
  catalogs: HouseCatalogs;
  access: HouseAccess;
  formConfig: FormVisibilityConfig;
  currentUser?: SystemUser | null;
  photoConfig: PhotoConfig;
  queue: PhotoQueue;
  /** Salir sin guardar con cambios: el trabajo queda como borrador. */
  onSaveDraft: (draft: HouseDraft) => void;
  onClose: () => void;
}

const HouseForm = ({
  init,
  records,
  properties,
  catalogs,
  access,
  formConfig,
  currentUser,
  photoConfig,
  queue,
  onSaveDraft,
  onClose,
}: HouseFormProps) => {
  const {
    statuses, teams, priorities, services, products, taxes, customersList, employees, rolesList,
    statusIndex, getClientName, getServiceName, logLabel,
  } = catalogs;
  const {
    canEdit, canConfigureFields, isFieldRO, isVisible, isElementVisible, canSeeOfficeNotes, anyVisible,
  } = access;

  const [initial] = useState(() => initialForm(init, statuses.length > 0 ? statuses[0].id : ""));
  const [formData, setFormData] = useState<Property>(initial.formData);
  const [formServices, setFormServices] = useState<ServiceRecord[]>(initial.formServices);
  const [servicesToDelete, setServicesToDelete] = useState<string[]>([]);
  // ⭐ Igual que los servicios: los pagos capturados DESDE EL FORMULARIO se
  //    guardan en un buffer local y se persisten al presionar Save. Asi se puede
  //    registrar un pago en una casa NUEVA (o recien duplicada), que todavia no
  //    tiene id al cual asociar el documento de payroll.
  const [housePayrollRecords, setHousePayrollRecords] = useState<PayrollRecord[]>(initial.housePayrollRecords);
  const [payrollsToDelete, setPayrollsToDelete] = useState<string[]>([]);
  // ⭐ ¿El usuario edito la lista de trabajadores a mano en este formulario?
  //    Si la toco, handleSave NO debe autocompletarla con el equipo: dejar la
  //    casa SIN trabajadores teniendo equipo es una decision valida y antes se
  //    revertia sola al guardar.
  const [workersTouched, setWorkersTouched] = useState(false);
  // ⭐ "Edit" abre al instante: el borrador de servicios y pagos del formulario
  //    se llena UNA vez cuando llegan los de la casa (antes el clic esperaba
  //    dos getDocs al servidor antes de mostrar nada).
  const [seededPropertyId, setSeededPropertyId] = useState<string | null>(initial.seedFor);
  const formRecordsReady = seededPropertyId === null;

  const [isSaving, setIsSaving] = useState(false);
  const [isWorkerPickerOpen, setIsWorkerPickerOpen] = useState(false);
  const [workerSearchText, setWorkerSearchText] = useState(""); // ⭐ buscador de empleados
  const [isFieldConfigOpen, setIsFieldConfigOpen] = useState(false);
  // ⭐ Modal de PAGO y de SERVICIO: en el formulario van al borrador local.
  const [payrollModal, setPayrollModal] = useState<{ initial: PayrollRecord; editingId: string | null } | null>(null);
  const [serviceModal, setServiceModal] = useState<ServiceRecord | null>(null);
  // ⭐ Modal para agregar un cliente rápido desde el formulario de casa
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

  // ⭐ GUARDIA DE SALIDA DEL FORMULARIO + BORRADORES.
  //    Al abrir el formulario se toma una "foto" de los datos; si al intentar
  //    salir (Cancel, X o clic fuera) hay cambios sin guardar, se pregunta.
  //    Y salga como salga, el trabajo NO se pierde: queda como borrador
  //    recuperable desde el botón "Borradores" junto a New Job.
  const formSnapshotRef = useRef<string>("");
  // ⭐ La casa tal como estaba al abrir el formulario de edición: al guardar
  //    se escriben solo las diferencias contra ella (null = alta o borrador).
  const formBaseRef = useRef<Property | null>(initial.base);
  // ⭐ Id de la casa que ESTE formulario creó. Si después del create falla un
  //    paso (fotos, batch) y el usuario presiona Save otra vez, se actualiza esa
  //    casa en vez de crear una segunda (antes el id solo vivía en una variable
  //    local de handleSave y el reintento duplicaba la casa).
  const createdPropertyIdRef = useRef<string | null>(null);
  // ⭐ Servicios tal como llegaron de Firestore al abrir el formulario (id →
  //    huella). Al guardar solo se reescriben los que cambiaron; antes se
  //    actualizaban TODOS, uno por uno, aunque nadie los hubiera tocado.
  const loadedServicesRef = useRef<Map<string, string>>(new Map());
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);

  // ⭐ Mapa de la dirección: se actualiza con debounce mientras escribes.
  const [mapAddress, setMapAddress] = useState("");
  useEffect(() => {
    const trimmedAddress = (formData.address ?? "").trim();
    if (trimmedAddress.length < 6) {
      setMapAddress("");
      return;
    }
    const timeoutId = setTimeout(() => setMapAddress(trimmedAddress), 900);
    return () => clearTimeout(timeoutId);
  }, [formData.address]);

  // Fotos del FORMULARIO: todas las visibles (guardadas + nuevas), con los
  // archivos nuevos aparte; "fuera del reporte" según la casa.
  const {
    beforePhotoURLs, setBeforePhotoURLs, afterPhotoURLs, setAfterPhotoURLs,
    beforeFiles, setBeforeFiles, afterFiles, setAfterFiles,
    beforeExcluded, setBeforeExcluded, afterExcluded, setAfterExcluded,
    isCompressing, addPhotoFiles, toggleReportPhoto,
  } = useHousePhotos(photoConfig, {
    before: initial.formData.beforePhotos || [],
    after: initial.formData.afterPhotos || [],
    beforeExcluded: initial.excluded.before,
    afterExcluded: initial.excluded.after,
  });
  // Fotos de esta casa que siguen en la cola sin conexión (casa ya guardada).
  const pendingForHouse = usePendingForHouse(formData.id || null, queue.syncVersion);

  // ⭐ CÁMARA RÁPIDA (ráfaga): features/houses/components/BurstCamera.
  const [camera, setCamera] = useState<{ type: "before" | "after" } | null>(null);
  const openBurstCamera = (type: "before" | "after") => setCamera({ type });

  const toggleWorkerAssignmentForm = (workerId: string) => {
    const currentWorkers = formData.assignedWorkers || [];
    const isAssigned = currentWorkers.includes(workerId);
    const newWorkersList = isAssigned
      ? currentWorkers.filter((id) => id !== workerId)
      : [...currentWorkers, workerId];
    setWorkersTouched(true);
    setFormData({ ...formData, assignedWorkers: newWorkersList });
  };

  // ⭐ Pago capturado DESDE EL FORMULARIO: no se exige que la casa exista
  //    todavía; queda en el buffer local y recibe su propertyId real al guardar.
  const handleOpenPayrollForm = () => {
    setPayrollModal({ editingId: null, initial: newPayrollRecord(formData.id) });
  };

  // ⭐ Abre el MISMO modal de pago, precargado con el registro a editar.
  const handleOpenPayrollEdit = (record: PayrollRecord) => {
    setPayrollModal({ editingId: String(record.id), initial: editablePayroll(record) });
  };

  // ⭐ Capturado desde el FORMULARIO: al buffer local, se persiste en Save.
  const handleSavePayroll = (payrollForm: PayrollRecord) => {
    if (!payrollModal) return;
    const { editingId: editingPayrollId } = payrollModal;
    const dataToSave = {
      ...payrollForm,
      totalAmount: payrollTotal(payrollForm),
      status: "Pending" as const,
    };
    if (editingPayrollId) {
      // ⭐ EDICIÓN en el buffer: se reemplaza el registro conservando su
      //    status. Si el pago ya existía en Firestore, se marca para borrar
      //    y se recrea al presionar Save (misma tubería que el borrado del
      //    formulario), así cancelar el formulario no altera nada.
      const original = housePayrollRecords.find(
        (r) => String(r.id) === String(editingPayrollId),
      ) as (PayrollRecord & { status?: string }) | undefined;
      if (!String(editingPayrollId).startsWith("temp-")) {
        setPayrollsToDelete((prev) => [...prev, String(editingPayrollId)]);
      }
      const replacement = {
        ...dataToSave,
        status: (original?.status || "Pending") as "Pending",
        id: `temp-${Date.now()}`,
      };
      setHousePayrollRecords((prev) =>
        prev
          .map((r) =>
            String(r.id) === String(editingPayrollId) ? replacement : r,
          )
          .sort((a, b) => dateSortValue(b.date) - dateSortValue(a.date)),
      );
    } else {
      setHousePayrollRecords(
        [
          ...housePayrollRecords,
          { ...dataToSave, id: `temp-${Date.now()}` },
        ].sort((a, b) => dateSortValue(b.date) - dateSortValue(a.date)),
      );
    }
    setPayrollModal(null);
  };

  // ⭐ Borrado DESDE EL FORMULARIO: solo saca el registro del buffer. Los que ya
  //    existen en Firestore se marcan y se borran de verdad al presionar Save,
  //    para que cancelar el formulario no destruya nada (igual que los servicios).
  const handleDeletePayrollLocal = (id: string) => {
    if (!window.confirm("Remove this payment from the list?")) return;
    if (!id.startsWith("temp-")) setPayrollsToDelete((prev) => [...prev, id]);
    setHousePayrollRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const handleOpenServiceForm = (record?: ServiceRecord) => {
    setServiceModal(record || newServiceRecord(formData.id || "", formData?.client, taxes, customersList));
  };

  // El modal valida y entrega el registro con sus totales calculados; en el
  // formulario va al borrador local.
  const handleSaveService = (dataToSave: ServiceRecord) => {
    const newService = {
      ...dataToSave,
      id: dataToSave.id || `temp-${Date.now()}`,
    };
    if (dataToSave.id)
      setFormServices((prev) =>
        prev.map((s) => (s.id === dataToSave.id ? newService : s)),
      );
    else setFormServices((prev) => [newService, ...prev]);
    setServiceModal(null);
  };

  const handleDeleteServiceLocal = (id: string) => {
    if (!window.confirm("Remove this service from the list?")) return;
    if (!id.startsWith("temp-")) setServicesToDelete((prev) => [...prev, id]);
    setFormServices((prev) => prev.filter((s) => s.id !== id));
  };

  // ⭐ Al abrir el formulario, se congela la "foto" para detectar cambios.
  useEffect(() => {
    formSnapshotRef.current = JSON.stringify({ formData, formServices, housePayrollRecords });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Copia los servicios y pagos de la casa al borrador del formulario, una vez
  // por apertura. Va DESPUÉS del efecto de la "foto": la reemplaza con las
  // listas cargadas para que abrir y cerrar sin tocar nada no cuente como cambio.
  useEffect(() => {
    if (!seededPropertyId || !records.loaded || records.houseId !== seededPropertyId) return;
    const { services: loadedServices, payroll: loadedPayments } = records;
    loadedServicesRef.current = new Map(loadedServices.map((service) => [service.id as string, recordFingerprint(service)]));
    const isTemp = (r: { id?: string }) => String(r.id || "").startsWith("temp-");
    setFormServices((prev) => [...loadedServices, ...prev.filter(isTemp)]);
    setHousePayrollRecords((prev) => [...loadedPayments, ...prev.filter(isTemp)]);
    formSnapshotRef.current = JSON.stringify({ formData: formBaseRef.current, formServices: loadedServices, housePayrollRecords: loadedPayments });
    setSeededPropertyId(null);
  }, [seededPropertyId, records]);

  const hasUnsavedChanges = (): boolean =>
    JSON.stringify({ formData, formServices, housePayrollRecords }) !==
    formSnapshotRef.current;

  /** Guarda el formulario como borrador. `draftFormData` permite guardar la casa
   *  tal como quedó en Firestore (con su id y las fotos ya subidas). */
  const saveDraftFromForm = (draftFormData: Property = formData): void => {
    const label =
      [getClientName(draftFormData.client), draftFormData.address]
        .filter(Boolean)
        .join(" · ") || "(sin cliente ni dirección)";
    const draft: HouseDraft = {
      id: `draft-${Date.now()}`,
      savedAt: new Date().toISOString(),
      label,
      formData: draftFormData,
      formServices,
      housePayrollRecords,
    };
    onSaveDraft(draft);
  };

  // ⭐ CUALQUIER salida del formulario pasa por aquí: si hay cambios sin
  //    guardar, pregunta. El cierre directo solo ocurre sin cambios.
  const handleRequestClose = () => {
    if (isSaving) return;
    // ⭐ SIEMPRE pregunta — con o sin cambios — porque el clic fuera del
    //    formulario suele ser accidental. El borrador solo se guarda cuando
    //    hay algo capturado que valga la pena conservar.
    setIsExitConfirmOpen(true);
  };

  // Salir CONFIRMADO: guarda borrador y cierra (el trabajo no se pierde).
  const handleConfirmExit = () => {
    if (hasUnsavedChanges()) saveDraftFromForm();
    setIsExitConfirmOpen(false);
    onClose();
  };

  // ⭐ STATUS POR EMPRESA: el cliente decide la empresa (Cavalry si su tipo es
  //    Cavalry; si no, Normal: Residential, Private customer, Property manager…)
  //    y el selector solo ofrece los status de esa empresa, en su Form Order.
  //    Sin cliente, los de Normal. Si la casa ya tiene un status que no es de su
  //    empresa (casas viejas), se sigue mostrando para no perderlo.
  const cavalryClientKeySet = useMemo(() => cavalryClientKeys(customersList), [customersList]);
  const propertyBusiness = houseBusiness({ client: formData.client }, cavalryClientKeySet);
  const propertyBusinessStatuses = statusesForBusiness(statuses, propertyBusiness);
  const currentPropertyStatus = statusIndex.get(String(formData.statusId ?? ""));
  const isCurrentStatusOutsideBusiness = !!currentPropertyStatus
    && !propertyBusinessStatuses.some((status) => status.id === currentPropertyStatus.id);
  const statusOptions = isCurrentStatusOutsideBusiness && currentPropertyStatus
    ? [...propertyBusinessStatuses, currentPropertyStatus]
    : propertyBusinessStatuses;

  /** Status que queda al cambiar de cliente: el mismo si es de la empresa del
   *  cliente nuevo; si no, el primero de esa empresa. */
  const getStatusIdForCustomer = (customerId: string): string => {
    const customerBusiness = houseBusiness({ client: customerId }, cavalryClientKeySet);
    const customerBusinessStatuses = statusesForBusiness(statuses, customerBusiness);
    const isStatusInCustomerBusiness = customerBusinessStatuses
      .some((status) => status.id === formData.statusId || status.name === formData.statusId);
    return isStatusInCustomerBusiness ? formData.statusId : customerBusinessStatuses[0]?.id ?? formData.statusId;
  };

  const handleCustomerSelect = (customerId: string) => {
    const nextStatusId = getStatusIdForCustomer(customerId);
    const selectedCustomer = customersList.find((customer) => customer.id === customerId);
    if (selectedCustomer) {
      // ⭐ Regla AppSheet: if([Type]="Private customer", lookup(client, Address), "")
      //    Si el cliente es "Private customer", trae su dirección (queda editable); si no, vacío.
      const isPrivateCustomer =
        String(selectedCustomer.type || "")
          .toLowerCase()
          .trim() === "private customer";
      // ⭐ De igual manera, trae la NOTA guardada del cliente al campo General Note
      //    (queda editable). Solo si el cliente tiene nota; si no, conserva la actual.
      const customerNote = String(
        (selectedCustomer as Customer & { note?: string | null }).note || "",
      ).trim();
      setFormData({
        ...formData,
        client: customerId,
        statusId: nextStatusId,
        address: isPrivateCustomer ? String(selectedCustomer.address ?? "") : "",
        note: isPrivateCustomer && customerNote ? customerNote : formData.note,
      });
    } else {
      setFormData({ ...formData, client: customerId, statusId: nextStatusId });
    }
  };


  const handleSave = async () => {
    // ⭐ OBLIGATORIOS. Sin estas validaciones se podia guardar una casa sin
    //    cliente o sin status; las que quedaban sin status desaparecian de
    //    Overview y del tablero (se iban al modulo "No Status") y el equipo
    //    las daba por borradas.
    if (!String(formData.client || "").trim())
      return alert("Client is required.");
    if (!String(formData.address || "").trim())
      return alert("Address is required.");

    // El catalogo de statuses tiene que estar cargado para poder validar.
    if (statuses.length === 0)
      return alert(
        "Statuses are still loading. Wait a moment and try again.",
      );

    const chosenStatus = String(formData.statusId || "").trim();
    if (!chosenStatus) return alert("Status is required.");

    // ⭐ Ademas de no estar vacio, el status tiene que EXISTIR en el catalogo.
    //    Una referencia huerfana (status renombrado o borrado) tiene el mismo
    //    efecto que no tener status: la casa se vuelve invisible.
    if (!statusIndex.get(chosenStatus))
      return alert(
        "The selected status no longer exists. Choose a valid status.",
      );

    setIsSaving(true);
    try {
      // Una casa creada por este formulario en un intento anterior sigue
      // contando como alta (sello de Invoice, sin diff), pero ya no se crea.
      let workingId = formData.id || createdPropertyIdRef.current || "";
      let isNew = !formData.id || formData.id === createdPropertyIdRef.current;

      // ⭐ Autocompletar los trabajadores del equipo SOLO si el usuario no toco la
      //    lista. Antes se rellenaba siempre que estuviera vacia, asi que quitar
      //    todos los trabajadores a mano no servia de nada: al guardar volvian.
      let finalAssignedWorkers = formData.assignedWorkers || [];
      if (
        !workersTouched &&
        formData.teamId &&
        finalAssignedWorkers.length === 0
      ) {
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
        const newPropertyId = await propertiesService.create(dataToCreate);
        workingId = newPropertyId;
        isNew = true;
        createdPropertyIdRef.current = newPropertyId;
        // También en el formulario: si el usuario sale tras un fallo, el
        // borrador lleva el id y al restaurarlo se actualiza esta casa.
        setFormData((previousFormData) => ({ ...previousFormData, id: newPropertyId }));
        // ⭐ Bitacora: alta de casa.
        logActivity({
          action: "create",
          module: "Houses",
          user: currentUser,
          targetId: workingId,
          targetLabel: logLabel(formData as Property),
          detail: `Status inicial: ${statusIndex.get(chosenStatus)?.name || chosenStatus}`,
        });
      }

      const beforeRes = await queue.uploadOrQueue(
        beforeFiles,
        getClientName(formData.client),
        formData.address,
        "before",
        workingId!,
      );
      const afterRes = await queue.uploadOrQueue(
        afterFiles,
        getClientName(formData.client),
        formData.address,
        "after",
        workingId!,
      );
      const uploadedBeforeUrls = beforeRes.urls;
      const uploadedAfterUrls = afterRes.urls;

      // ⭐ Si la casa ENTRA a "Invoice" con este guardado (alta nueva, o edicion
      //    que cambia el status), estampa la marca de entrada para que quede
      //    ARRIBA en InvoicesView (ver src/utils/invoiceEntry.ts). Si ya estaba
      //    en Invoice antes, se conserva la marca original: guardar otros campos
      //    no debe reordenar la lista.
      // Con la copia de cuando se abrió el formulario: así solo se sella si
      // ESTE guardado cambia el status (y solo se escribe lo que cambió).
      const openedProperty =
        formBaseRef.current && formBaseRef.current.id === workingId
          ? formBaseRef.current
          : null;
      const previousStatusId = isNew
        ? ""
        : String(
          (openedProperty ?? properties.find((property) => property.id === workingId))?.statusId ?? "",
        );
      const hasStatusChanged = String(formData.statusId || "") !== previousStatusId;

      const finalDataToUpdate = {
        ...formData,
        assignedWorkers: finalAssignedWorkers,
        beforePhotos: [...(formData.beforePhotos || []), ...uploadedBeforeUrls],
        afterPhotos: [...(formData.afterPhotos || []), ...uploadedAfterUrls],
        beforePhotosExcluded: beforeExcluded,
        afterPhotosExcluded: afterExcluded,
        ...(hasStatusChanged
          ? stampInvoiceEntry({}, statuses, formData.statusId)
          : {}),
      };

      const { id: _omitId, ...dataForFirestore } = finalDataToUpdate;
      // ⭐ Si este guardado cambia el status de una casa existente, su entrada
      //    de status_history viaja en el MISMO batch que la casa.
      const savedId = workingId;
      const historyOps: BatchOp[] =
        !isNew && hasStatusChanged
          ? [
            (batch) => {
              addStatusHistory(batch, savedId, previousStatusId, String(formData.statusId || ""), {
                statuses,
                actor: currentUser,
                source: "houses",
              });
            },
          ]
          : [];
      if (isNew || !openedProperty) {
        // Alta nueva o borrador restaurado: no hay "antes" contra qué comparar.
        await commitOps([
          (batch) => propertiesService.batchUpdate(batch, savedId, dataForFirestore),
          ...historyOps,
        ]);
      } else {
        // ⭐ Edición: solo los campos que cambiaron desde que se abrió el
        //    formulario, y los arreglos (fotos, trabajadores, historial de
        //    notas) con arrayUnion/arrayRemove. Antes se reescribía la casa
        //    COMPLETA con la copia del formulario: un cambio de status, una
        //    nota o una foto que otra persona guardó mientras tanto se perdía.
        const {
          beforePhotos: nextBefore = [], afterPhotos: nextAfter = [],
          beforePhotosExcluded: nextBeforeEx = [], afterPhotosExcluded: nextAfterEx = [],
          assignedWorkers: nextWorkers = [], notesHistory: nextNotes = [],
          ...plain
        } = dataForFirestore;
        const fields = changedFields(openedProperty, plain);
        const beforePhotosDiff = listDiff(openedProperty.beforePhotos, nextBefore);
        const afterPhotosDiff = listDiff(openedProperty.afterPhotos, nextAfter);
        const beforeExcludedDiff = listDiff(openedProperty.beforePhotosExcluded, nextBeforeEx);
        const afterExcludedDiff = listDiff(openedProperty.afterPhotosExcluded, nextAfterEx);
        const workersDiff = listDiff(openedProperty.assignedWorkers, nextWorkers);
        const notesDiff = listDiff(openedProperty.notesHistory, nextNotes);
        await commitOps([
          (batch) =>
            propertiesService.batchArrayChange(batch, workingId, {
              fields,
              remove: { beforePhotos: beforePhotosDiff.remove, afterPhotos: afterPhotosDiff.remove, beforePhotosExcluded: beforeExcludedDiff.remove, afterPhotosExcluded: afterExcludedDiff.remove, assignedWorkers: workersDiff.remove, notesHistory: notesDiff.remove },
              add: { beforePhotos: beforePhotosDiff.add, afterPhotos: afterPhotosDiff.add, beforePhotosExcluded: beforeExcludedDiff.add, afterPhotosExcluded: afterExcludedDiff.add, assignedWorkers: workersDiff.add, notesHistory: notesDiff.add },
            }),
          ...historyOps,
        ]);
      }
      if (historyOps.length > 0) afterStatusHistoryWrite();

      // ⭐ Bitacora: en una edicion se guarda SOLO lo que cambio, campo por
      //    campo (antes -> despues). En un alta el diff no aporta: ya se
      //    registro arriba como 'create'.
      if (!isNew) {
        // Contra la copia de cuando se abrió: la bitácora no debe atribuirle a
        // esta persona lo que otra cambió mientras tanto.
        const original = openedProperty ?? properties.find((p) => p.id === workingId);
        logActivity({
          action: "update",
          module: "Houses",
          user: currentUser,
          targetId: workingId,
          targetLabel: logLabel(formData as Property),
          changes: diffObjects(
            original as unknown as Record<string, unknown>,
            finalDataToUpdate as unknown as Record<string, unknown>,
          ),
        });
      }

      // ⭐ Bitacora: subida de fotos (va aparte porque el diff las ignora).
      if (uploadedBeforeUrls.length > 0 || uploadedAfterUrls.length > 0) {
        logActivity({
          action: "photo_upload",
          module: "Houses",
          user: currentUser,
          targetId: workingId,
          targetLabel: logLabel(formData as Property),
          detail: `${uploadedBeforeUrls.length} foto(s) Before, ${uploadedAfterUrls.length} foto(s) After`,
        });
      }

      // ⭐ SERVICIOS y PAGOS del formulario en UN solo batch (todo o nada):
      //    los marcados para borrar se eliminan, los `temp-` se crean ya con el
      //    propertyId real (por eso funciona en una casa nueva) y de los
      //    existentes solo se reescriben los que cambiaron. Antes eran N
      //    escrituras sueltas y un fallo solo quedaba en la consola; editar un
      //    pago (borrar + recrear) podía perderlo si fallaba la segunda mitad.
      const relatedOps: BatchOp[] = [];
      for (const serviceId of servicesToDelete) {
        relatedOps.push((batch) => billingServices.batchDelete(batch, serviceId));
      }
      for (const service of formServices) {
        const serviceData = { ...service, propertyId: workingId };
        const { id, ...data } = serviceData;
        if (id && !id.startsWith("temp-")) {
          if (loadedServicesRef.current.get(id) === recordFingerprint(serviceData))
            continue;
          relatedOps.push((batch) => billingServices.batchUpdate(batch, id, data));
        } else {
          relatedOps.push((batch) => billingServices.batchCreate(batch, data));
        }
      }
      for (const paymentId of payrollsToDelete) {
        relatedOps.push((batch) => payrollService.batchDelete(batch, paymentId));
      }
      for (const payment of housePayrollRecords) {
        if (payment.id && !String(payment.id).startsWith("temp-")) continue;
        const createData: Omit<PayrollRecord, "id"> = {
          ...payment,
          propertyId: workingId,
        };
        delete (createData as Partial<PayrollRecord>).id;
        relatedOps.push((batch) => payrollService.batchCreate(batch, createData));
      }
      try {
        await commitOps(relatedOps);
      } catch (error) {
        // La casa ya quedó guardada; lo que falló fue el batch de servicios y
        // pagos, que no se aplicó en absoluto. Son montos que el usuario ya
        // capturó: quedan en un borrador con la casa tal como se guardó (id y
        // fotos ya subidas), para no tener que teclearlos de nuevo.
        saveDraftFromForm({ ...finalDataToUpdate, id: workingId });
        const firebaseError = error as { code?: string; message?: string };
        alert(
          `La casa se guardó, pero sus servicios y pagos NO se pudieron guardar.\nQuedaron en "Borradores": ábrelo y presiona Save para volver a intentarlo.\n\nCódigo: ${firebaseError.code ?? "desconocido"}\nDetalle: ${firebaseError.message ?? String(error)}`,
        );
      }
      setPayrollsToDelete([]);

      setBeforeFiles([]);
      setAfterFiles([]);
      setBeforePhotoURLs([]);
      setAfterPhotoURLs([]);

      const queued = beforeRes.queued + afterRes.queued;
      if (queued > 0)
        alert(
          `Sin conexión: ${queued} foto(s) se subirán automáticamente al recuperar internet.`,
        );
      await queue.refreshTotal();

      onClose();
    } catch (error) {
      console.error("❌ Error saving to Firebase:", error);
      const firebaseError = error as { code?: string; message?: string };
      alert(
        `No se pudo guardar la propiedad.\n\nCódigo: ${firebaseError.code || "desconocido"}\nDetalle: ${firebaseError.message || String(error)}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemovePhoto = (index: number, type: "before" | "after") => {
    const removedUrl = (type === "before" ? beforePhotoURLs : afterPhotoURLs)[
      index
    ];
    if (type === "before") {
      const newUrls = [...beforePhotoURLs];
      newUrls.splice(index, 1);
      setBeforePhotoURLs(newUrls);

      const storedCount = formData.beforePhotos?.length || 0;

      if (index >= storedCount) {
        const fileIndex = index - storedCount;
        const newFiles = [...beforeFiles];
        newFiles.splice(fileIndex, 1);
        setBeforeFiles(newFiles);
      } else {
        const updatedFormDataPhotos = [...(formData.beforePhotos || [])];
        updatedFormDataPhotos.splice(index, 1);
        setFormData({ ...formData, beforePhotos: updatedFormDataPhotos });
      }
    } else {
      const newUrls = [...afterPhotoURLs];
      newUrls.splice(index, 1);
      setAfterPhotoURLs(newUrls);

      const storedCount = formData.afterPhotos?.length || 0;

      if (index >= storedCount) {
        const fileIndex = index - storedCount;
        const newFiles = [...afterFiles];
        newFiles.splice(fileIndex, 1);
        setAfterFiles(newFiles);
      } else {
        const updatedFormDataPhotos = [...(formData.afterPhotos || [])];
        updatedFormDataPhotos.splice(index, 1);
        setFormData({ ...formData, afterPhotos: updatedFormDataPhotos });
      }
    }

    if (type === "before")
      setBeforeExcluded((prev) => prev.filter((u) => u !== removedUrl));
    else setAfterExcluded((prev) => prev.filter((u) => u !== removedUrl));
  };

  const formTotalPayroll = housePayrollRecords.reduce(
    (sum, r) => sum + r.totalAmount,
    0,
  );

  const formTotalBilled = formServices.reduce((sum, r) => sum + r.total, 0);

  return (
    <>
      {/* --- FORM MODAL TIPO WORK ORDER --- */}
      <div className="modal-overlay-centered" onClick={handleRequestClose}>
        <div className="modal-full" onClick={(e) => e.stopPropagation()}>
          <div className="modal-full-left">
            <div className="hv-form-inner">
              <div className="hv-form-top-row">
                <h2 className="hv-form-title">
                  {formData.id
                    ? "Edit Property Details"
                    : "Register New Property"}
                </h2>
                {canConfigureFields && (
                    <button
                      type="button"
                      onClick={() => setIsFieldConfigOpen(true)}
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
                            allowClear
                            clearLabel="— Sin cliente —"
                          />
                          {(() => {
                            // ⭐ Muestra el TIPO del cliente seleccionado (viene de la colección customers)
                            const selCust = customersList.find(
                              (customer) => customer.id === formData.client,
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
                          onClick={() => setIsCustomerModalOpen(true)}
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
                      {/* ⭐ Dirección + Unit/Apto en la misma fila: la unidad se
                          captura aparte para poder buscarla y para que el mapa
                          reciba la dirección limpia. */}
                      <div className="hv-address-row">
                        <div className="hv-input-wrap hv-address-main">
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
                        {isElementVisible("unit") && (
                          <div className="hv-input-wrap hv-address-unit">
                            <Hash className="hv-input-icon" size={16} />
                            <input
                              type="text"
                              className="hv-input"
                              placeholder="Unit / Apto"
                              value={formData.unit || ""}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  unit: e.target.value,
                                })
                              }
                              disabled={isFieldRO("unit")}
                            />
                          </div>
                        )}
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
                        options={statusOptions}
                        value={formData.statusId}
                        onChange={(val: string) =>
                          setFormData({ ...formData, statusId: val })
                        }
                        placeholder="Select Status..."
                        icon={Activity}
                        disabled={isFieldRO("statusId")}
                        allowClear
                        clearLabel="— Sin status —"
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
                        allowClear
                        clearLabel="— Sin invoice status —"
                      />
                    </div>
                  )}
                  {isElementVisible("serviceId") && (
                    <div>
                      {/* ⭐ Services es OPCIONAL: no se valida en handleSave (solo
                          Client, Address y Status son obligatorios). El campo no
                          lleva asterisco y con allowClear se puede DEJAR VACIO.
                          Sin allowClear, al duplicar una casa el servicio se
                          heredaba y no habia forma de quitarlo, asi que en la
                          practica se comportaba como obligatorio. */}
                      <label className="hv-label">Services</label>
                      <SearchableSelect
                        options={services}
                        value={formData.serviceId}
                        onChange={(val: string) =>
                          setFormData({ ...formData, serviceId: val })
                        }
                        placeholder="Select Service... (opcional)"
                        icon={Wrench}
                        disabled={isFieldRO("serviceId")}
                        allowClear
                        clearLabel="— Sin servicio —"
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
                        allowClear
                        clearLabel="— Sin prioridad —"
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
                        allowClear
                        clearLabel="— Sin especificar —"
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
                        allowClear
                        clearLabel="— Sin especificar —"
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
                        <DateInput
                          className="hv-input"
                          value={formData.receiveDate}
                          onChange={(iso) =>
                            setFormData({
                              ...formData,
                              receiveDate: iso,
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
                        <DateInput
                          className="hv-input"
                          value={formData.scheduleDate}
                          onChange={(iso) =>
                            setFormData({
                              ...formData,
                              scheduleDate: iso,
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
                        <DateInput
                          className="hv-input"
                          value={formData.dateOfIssue || ""}
                          onChange={(iso) =>
                            setFormData({
                              ...formData,
                              dateOfIssue: iso,
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
                        <DateInput
                          className="hv-input"
                          value={formData.dueDate || ""}
                          onChange={(iso) =>
                            setFormData({
                              ...formData,
                              dueDate: iso,
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
                          // ⭐ Al LIMPIAR el equipo (val vacio) tambien se vacia la
                          //    lista de trabajadores: si no, quedaban asignados los
                          //    del equipo anterior sin equipo visible.
                          const teamWorkers = val
                            ? employees
                              .filter((emp) => emp.teamId === val)
                              .map((emp) => emp.id)
                            : [];
                          // Quitar el equipo es una decision explicita: cuenta
                          // como tocar la lista para que no se autocomplete.
                          if (!val) setWorkersTouched(true);
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
                        allowClear
                        clearLabel="— Sin equipo —"
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
                            setIsWorkerPickerOpen(!isWorkerPickerOpen)
                          }
                          disabled={isSaving || isFieldRO("assignedWorkers")}
                          title={
                            isFieldRO("assignedWorkers")
                              ? "Campo de solo lectura para tu rol"
                              : undefined
                          }
                          className="hv-btn-toggle-workers"
                        >
                          {isWorkerPickerOpen
                            ? "Close"
                            : "+ Assign / Remove"}
                        </button>
                        {isWorkerPickerOpen && (
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
                                  value={workerSearchText}
                                  onChange={(e) =>
                                    setWorkerSearchText(e.target.value)
                                  }
                                  placeholder="Buscar empleado..."
                                  className="hv-workers-search-input"
                                />
                              </div>
                            </div>
                            {(() => {
                              const q = workerSearchText.trim().toLowerCase();
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
                        onClick={() => handleOpenServiceForm()}
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
                          {!formRecordsReady ? (
                            <tr><td colSpan={7}><div className="skel-line skel-row-main" /></td></tr>
                          ) : formServices.length === 0 ? (
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
                                          handleOpenServiceForm(record)
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

              {/* CARD 4.5: PAYROLL — registrar pagos SIN salir del formulario.
                  Antes esto solo existia en el modal de DETALLE, asi que para
                  pagarle a alguien habia que guardar, cerrar, y reabrir la casa
                  en modo detalle. Reusa los mismos handlers y el mismo modal
                  "Register Payment" que el detalle: una sola fuente de verdad.
                  Como InvoicesView monta HousesView en modo 'modals-only', esta
                  card queda disponible tambien desde Invoices. */}
              {isVisible("financial") && isElementVisible("card_payroll") && (
                <div className="hv-form-card">
                  <div className="hv-card-header-row">
                    <h3 className="hv-form-card-title hv-no-mb">
                      <DollarSign size={20} color="#10B981" /> Payroll
                    </h3>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenPayrollForm()
                        }
                        className="btn btn-primary hv-btn-add-service green"
                      >
                        <Plus size={16} /> Register Payment
                      </button>
                    )}
                  </div>

                  <div className="hv-service-table-wrap">
                    <table className="hv-service-table">
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
                        {!formRecordsReady ? (
                          <tr><td colSpan={canEdit ? 7 : 6}><div className="skel-line skel-row-main" /></td></tr>
                        ) : housePayrollRecords.length === 0 ? (
                          <tr>
                            <td
                              colSpan={canEdit ? 7 : 6}
                              className="hv-service-empty-row"
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
                                <td className="hv-service-td muted">
                                  {formatDate(record.date)}
                                </td>
                                <td className="hv-service-td strong">
                                  {emp
                                    ? [emp.firstName, emp.lastName]
                                      .filter(Boolean)
                                      .join(" ")
                                    : "Unknown"}
                                </td>
                                <td className="hv-service-td right">
                                  ${Number(record.baseAmount || 0).toFixed(2)}
                                </td>
                                <td className="hv-service-td right extra">
                                  +$
                                  {Number(record.extraAmount || 0).toFixed(2)}
                                </td>
                                <td className="hv-service-td right discount">
                                  -$
                                  {Number(
                                    record.discountAmount || 0,
                                  ).toFixed(2)}
                                </td>
                                <td className="hv-service-td right total">
                                  ${Number(record.totalAmount || 0).toFixed(2)}
                                </td>
                                {canEdit && (
                                  <td className="hv-service-td right">
                                    <div className="hv-fin-actions-cell">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleOpenPayrollEdit(record)
                                        }
                                        className="hv-service-action-btn edit"
                                        title="Edit payment"
                                      >
                                        <Edit2 size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleDeletePayrollLocal(
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

                  {housePayrollRecords.length > 0 && (
                    <div className="hv-payroll-form-total">
                      <span className="hv-payroll-form-total-label">
                        Total Payroll
                      </span>
                      <span className="hv-payroll-form-total-value">
                        ${formTotalPayroll.toFixed(2)}
                      </span>
                    </div>
                  )}
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
                  {canSeeOfficeNotes() && (
                    <div>
                      <label className="hv-label office">
                        Office Notes
                      </label>
                      <textarea
                        className="hv-input hv-textarea office"
                        placeholder="Notas internas de oficina (no visibles para los equipos)..."
                        value={formData.officeNote || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            officeNote: e.target.value,
                          })
                        }
                        disabled={isFieldRO("officeNote")}
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
                onClick={handleRequestClose}
                disabled={isSaving}
                className="hv-btn-cancel-form"
              >
                <XCircle size={18} /> Cancel
              </button>
            </div>
          </aside>
        </div>
      </div>

      {/* --- MODAL: ¿SALIR DEL FORMULARIO SIN GUARDAR? --- */}
      {isExitConfirmOpen && (
        <div
          className="modal-overlay-centered"
          onClick={() => setIsExitConfirmOpen(false)}
        >
          <div className="modal-50 hv-exit-modal" onClick={(e) => e.stopPropagation()}>
            <header className="hv-modal-header">
              <h3 className="hv-modal-title">¿Salir sin guardar?</h3>
            </header>
            <div className="hv-gcal-body">
              {hasUnsavedChanges() ? (
                <p className="hv-gcal-hint">
                  Tienes cambios sin guardar en este formulario. Si sales, la
                  orden se conserva como <b>borrador</b> y puedes retomarla con
                  todos los campos desde el botón <b>Borradores</b> junto a New
                  Job.
                </p>
              ) : (
                <p className="hv-gcal-hint">
                  ¿Seguro que quieres salir del formulario?
                </p>
              )}
            </div>
            <footer className="hv-gcal-footer">
              <button
                className="hv-gcal-btn-cancel"
                onClick={() => setIsExitConfirmOpen(false)}
              >
                Seguir editando
              </button>
              <button className="hv-btn-danger-modal" onClick={handleConfirmExit}>
                <XCircle size={16} />{" "}
                {hasUnsavedChanges() ? "Salir (guardar borrador)" : "Salir"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* --- MODAL: NUEVO CLIENTE (mismo formulario que Customers) --- */}
      {isCustomerModalOpen && (
        <CustomerQuickModal
          onCreated={(id, address) =>
            setFormData((prev) => ({ ...prev, client: id, address: address || prev.address }))
          }
          onClose={() => setIsCustomerModalOpen(false)}
        />
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

      {/* ⭐ Configure Fields: visibilidad y solo lectura por rol */}
      {isFieldConfigOpen && (
        <FieldConfigModal
          formConfig={formConfig}
          roles={rolesList}
          statuses={statuses}
          onClose={() => setIsFieldConfigOpen(false)}
        />
      )}

      {/* --- CÁMARA RÁPIDA (RÁFAGA): varias tomas seguidas sin cerrarse --- */}
      {camera && (
        <BurstCamera
          type={camera.type}
          autoSave={false}
          busy={isCompressing}
          onCapture={(file) => addPhotoFiles([file], camera.type)}
          onCancel={() => setCamera(null)}
          onDone={() => setCamera(null)}
        />
      )}
    </>
  );
};

export default HouseForm;
