/* ============================================================================
   Casas recurrentes — createrecurringhouses (scheduled)
   ----------------------------------------------------------------------------
   Una casa con `recurrence` (campo Repeat del formulario) se repite todos los
   días, ciertos días de la semana o un día del mes. Esta función corre cada 15
   minutos y crea la orden de la SIGUIENTE visita a la hora de Texas elegida
   (`createTime`), con los días de anticipación elegidos (`leadDays`), se haya
   terminado o no la visita anterior.

   CÓMO SABE CUÁLES TOCAN: `recurrence.nextCreateAt` (ISO, UTC) es el momento en
   que hay que crear la siguiente orden. El formulario lo guarda vacío ('') al
   crear o editar la casa; aquí se calcula y se escribe. La consulta trae solo
   las casas con nextCreateAt <= ahora (las vacías también): no se lee la
   colección completa.

   SERIE EN CADENA: la orden nueva hereda la recurrencia y es la que genera la
   siguiente; la anterior queda enlazada con `recurrence.nextHouseId` y sin
   nextCreateAt (sale de la consulta). Para dejar de repetir se quita el Repeat
   en la ÚLTIMA orden de la serie.

   IDEMPOTENCIA: la creación va en una transacción que vuelve a leer la casa y
   no hace nada si ya tiene nextHouseId o le quitaron la recurrencia. Correr dos
   veces nunca duplica una orden.

   LA ORDEN NUEVA: nace en "Needs to be schedule" (de la misma empresa que el
   status de la anterior) con la fecha de la visita; copia cliente, dirección,
   notas, servicio, equipo, Billed Services y pagos de nómina (Pending). No copia
   fotos, horas, Mark Finished, factura ni evento de Calendar. Las visitas que
   ya pasaron no se crean.

   Las reglas de fechas son la copia de houseRecurrenceRules.ts.
   ============================================================================ */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";
import { addDays, getNextVisitDate, normalizeRecurrence, type HouseRecurrence } from "./houseRecurrenceRules";

const TIMEZONE = "America/Chicago";
/** Casas por vuelta: lo que sobre se atiende en la siguiente (15 minutos después). */
const MAX_HOUSES_PER_RUN = 100;
const BUSINESSES = ["Normal", "Cavalry"];
const NEEDS_SCHEDULE_PATTERN = /^needs to be scheduled?$/i;

// Perezoso: index.ts llama a admin.initializeApp() al cargar.
const db = () => admin.firestore();

type HouseDoc = Record<string, unknown> & {
  scheduleDate?: string;
  statusId?: string;
  recurrence?: unknown;
};

interface StatusDoc {
  id: string;
  name?: string;
  business?: string;
  order?: number | string;
}

/** Fecha (AAAA-MM-DD) y minutos del día de un instante, vistos en Texas. */
const getTexasParts = (instant: Date): { day: string; time: number } => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    day: `${read("year")}-${read("month")}-${read("day")}`,
    time: Date.UTC(Number(read("year")), Number(read("month")) - 1, Number(read("day")), Number(read("hour")), Number(read("minute"))),
  };
};

/** Instante (ISO, UTC) de un día y hora de Texas, con su horario de verano o invierno. */
const texasToUtcIso = (day: string, time: string): string => {
  const [year, month, dayOfMonth] = day.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const wallTime = Date.UTC(year, month - 1, dayOfMonth, hours, minutes);
  // La diferencia con UTC se mide en ese mismo momento; dos pasadas cubren el día del cambio de horario.
  let instant = wallTime;
  for (let pass = 0; pass < 2; pass++) {
    instant = wallTime - (getTexasParts(new Date(instant)).time - instant);
  }
  return new Date(instant).toISOString();
};

/** AAAA-MM-DD → MM/DD/AAAA (como se ven las fechas en la app). */
const formatDay = (day: string): string => `${day.slice(5, 7)}/${day.slice(8, 10)}/${day.slice(0, 4)}`;

/** Momento en que debe aparecer la orden de la visita `visitDate`. */
const getCreateAt = (recurrence: HouseRecurrence, visitDate: string): string =>
  texasToUtcIso(addDays(visitDate, -recurrence.leadDays), recurrence.createTime);

/** Empresas de un status ("Normal", "Cavalry" o las dos); sin ninguna cuenta como Normal (igual que la app). */
const getStatusBusinesses = (business?: string): string[] => {
  const parts = String(business || "").split(",").map((part) => part.trim().toLowerCase());
  const found = BUSINESSES.filter((name) => parts.includes(name.toLowerCase()));
  return found.length > 0 ? found : ["Normal"];
};

/** Status de la orden nueva: "Needs to be schedule" de la empresa de la casa; si no hay, el primero de esa empresa. */
const getNextVisitStatusId = (statuses: StatusDoc[], currentStatusId: string): string => {
  const currentStatus = statuses.find((status) => status.id === currentStatusId);
  const business = getStatusBusinesses(currentStatus?.business)[0];
  const businessStatuses = statuses
    .filter((status) => getStatusBusinesses(status.business).includes(business))
    .sort((statusA, statusB) => Number(statusA.order || 0) - Number(statusB.order || 0));
  const needsScheduleStatus = businessStatuses.find((status) => NEEDS_SCHEDULE_PATTERN.test(String(status.name ?? "").trim()));
  return needsScheduleStatus?.id ?? businessStatuses[0]?.id ?? currentStatusId;
};

/** La orden de la siguiente visita: solo lo que describe el trabajo, nada de lo que pasó en la visita anterior. */
const buildNextVisit = (
  house: HouseDoc, houseId: string, recurrence: HouseRecurrence, visitDate: string, statusId: string, today: string,
) => {
  const followingVisitDate = getNextVisitDate(recurrence, visitDate, today);
  const nextRecurrence: HouseRecurrence = {
    pattern: recurrence.pattern,
    ...(recurrence.weekdays ? { weekdays: recurrence.weekdays } : {}),
    ...(recurrence.intervalWeeks ? { intervalWeeks: recurrence.intervalWeeks } : {}),
    ...(recurrence.monthDay ? { monthDay: recurrence.monthDay } : {}),
    createTime: recurrence.createTime,
    leadDays: recurrence.leadDays,
    anchorDate: recurrence.anchorDate ?? String(house.scheduleDate),
    previousHouseId: houseId,
    nextCreateAt: followingVisitDate ? getCreateAt(recurrence, followingVisitDate) : "",
  };
  return {
    statusId,
    invoiceStatus: "Pending",
    receiveDate: today,
    scheduleDate: visitDate,
    recurrence: nextRecurrence,
    client: house.client ?? "",
    address: house.address ?? "",
    note: house.note ?? "",
    ...(house.generalNotes ? { generalNotes: house.generalNotes } : {}),
    officeNote: house.officeNote ?? "",
    employeeNote: "",
    serviceId: house.serviceId ?? "",
    serviceTypes: house.serviceTypes ?? [],
    rooms: house.rooms ?? "1",
    bathrooms: house.bathrooms ?? "1",
    priorityId: house.priorityId ?? "",
    teamId: house.teamId ?? "",
    assignedWorkers: house.assignedWorkers ?? [],
    timeIn: "",
    timeOut: "",
    beforePhotos: [],
    afterPhotos: [],
    description: house.description ?? "",
    city: house.city ?? "TBD",
    size: house.size ?? "TBD",
  };
};

/** Pago de nómina de la siguiente visita: el mismo empleado y montos, como pendiente. */
const buildNextVisitPayment = (payment: Record<string, unknown>, propertyId: string, visitDate: string) => ({
  propertyId,
  date: visitDate,
  employeeId: String(payment.employeeId ?? ""),
  baseAmount: Number(payment.baseAmount || 0),
  extraAmount: Number(payment.extraAmount || 0),
  extraNote: String(payment.extraNote ?? ""),
  discountAmount: Number(payment.discountAmount || 0),
  discountNote: String(payment.discountNote ?? ""),
  totalAmount: Number(payment.totalAmount || 0),
  status: "Pending",
});

/** Qué hizo la función con una casa. */
type HouseOutcome = "created" | "scheduled" | "cleared" | "unchanged";

/**
 * Atiende UNA casa recurrente: si ya es hora crea la orden de la siguiente
 * visita; si no, anota cuándo toca. `loadStatuses` solo se llama al crear.
 */
const processHouse = async (
  houseRef: FirebaseFirestore.DocumentReference, now: Date, today: string, loadStatuses: () => Promise<StatusDoc[]>,
): Promise<HouseOutcome> => {
  const firstRead = (await houseRef.get()).data() as HouseDoc | undefined;
  if (!firstRead) return "unchanged";
  const scheduleDate = typeof firstRead.scheduleDate === "string" ? firstRead.scheduleDate : "";
  const recurrence = normalizeRecurrence(firstRead.recurrence, scheduleDate);
  const visitDate = recurrence && !recurrence.nextHouseId ? getNextVisitDate(recurrence, scheduleDate, today) : "";
  if (!recurrence || !visitDate) {
    // Sin recurrencia válida, sin fecha o con la siguiente ya creada: sale de la consulta.
    await houseRef.update({ "recurrence.nextCreateAt": admin.firestore.FieldValue.delete() });
    return "cleared";
  }

  const createAt = getCreateAt(recurrence, visitDate);
  if (createAt > now.toISOString()) {
    if (recurrence.nextCreateAt === createAt) return "unchanged";
    await houseRef.update({ "recurrence.nextCreateAt": createAt });
    return "scheduled";
  }

  const [servicesSnap, paymentsSnap, statuses] = await Promise.all([
    db().collection("billing_services").where("propertyId", "==", houseRef.id).get(),
    db().collection("payroll").where("propertyId", "==", houseRef.id).get(),
    loadStatuses(),
  ]);
  // Solo los pagos de la casa: Hourly y Fixed pay llevan payType.
  const housePayments = paymentsSnap.docs.map((paymentDoc) => paymentDoc.data()).filter((payment) => !payment.payType);
  const nextHouseRef = db().collection("properties").doc();

  const wasCreated = await db().runTransaction(async (transaction) => {
    const house = (await transaction.get(houseRef)).data() as HouseDoc | undefined;
    const currentDate = typeof house?.scheduleDate === "string" ? house.scheduleDate : "";
    const currentRecurrence = house ? normalizeRecurrence(house.recurrence, currentDate) : null;
    // Otra vuelta ya la creó, o cambiaron la casa mientras tanto: la siguiente vuelta decide.
    if (!house || !currentRecurrence || currentRecurrence.nextHouseId) return false;
    if (getNextVisitDate(currentRecurrence, currentDate, today) !== visitDate) return false;

    const statusId = getNextVisitStatusId(statuses, String(house.statusId ?? ""));
    transaction.set(nextHouseRef, buildNextVisit(house, houseRef.id, currentRecurrence, visitDate, statusId, today));
    servicesSnap.docs.forEach((serviceDoc) => {
      const { createdAt: _omitCreatedAt, ...service } = serviceDoc.data();
      transaction.set(db().collection("billing_services").doc(), { ...service, propertyId: nextHouseRef.id });
    });
    housePayments.forEach((payment) => {
      transaction.set(db().collection("payroll").doc(), buildNextVisitPayment(payment, nextHouseRef.id, visitDate));
    });
    transaction.update(houseRef, {
      "recurrence.nextHouseId": nextHouseRef.id,
      "recurrence.nextCreateAt": admin.firestore.FieldValue.delete(),
    });
    // Bitácora (Activity Log de la app): misma forma que logActivity.
    transaction.set(db().collection("activity_logs").doc(), {
      at: now.toISOString(),
      ts: admin.firestore.Timestamp.fromDate(now),
      userId: "",
      userName: "Recurring visits (automatic)",
      action: "create",
      module: "Houses",
      targetId: nextHouseRef.id,
      targetLabel: String(house.address ?? "Recurring visit"),
      changes: [],
      detail: `Recurring visit created automatically for ${formatDay(visitDate)}, with ${servicesSnap.size} billed service(s) and ${housePayments.length} payroll payment(s).`,
    });
    return true;
  });
  return wasCreated ? "created" : "unchanged";
};

export const createrecurringhouses = onSchedule(
  {
    schedule: "every 15 minutes",
    region: "us-central1",
    timeZone: TIMEZONE,
  },
  async () => {
    const now = new Date();
    const today = getTexasParts(now).day;
    const dueSnap = await db().collection("properties")
      .where("recurrence.nextCreateAt", "<=", now.toISOString())
      .limit(MAX_HOUSES_PER_RUN)
      .get();
    if (dueSnap.empty) return;

    // El catálogo de status se lee una sola vez, y solo si hay algo que crear.
    let statusesPromise: Promise<StatusDoc[]> | null = null;
    const loadStatuses = () => {
      statusesPromise ??= db().collection("settings_statuses").get()
        .then((snap) => snap.docs.map((statusDoc) => ({ ...(statusDoc.data() as Omit<StatusDoc, "id">), id: statusDoc.id })));
      return statusesPromise;
    };

    const counts: Record<HouseOutcome, number> = { created: 0, scheduled: 0, cleared: 0, unchanged: 0 };
    let failedCount = 0;
    for (const houseDoc of dueSnap.docs) {
      try {
        counts[await processHouse(houseDoc.ref, now, today, loadStatuses)]++;
      } catch (error) {
        failedCount++;
        logger.error(`createrecurringhouses: no se pudo atender la casa ${houseDoc.id}`, error);
      }
    }
    logger.info("createrecurringhouses", { ...counts, failed: failedCount });
  },
);
