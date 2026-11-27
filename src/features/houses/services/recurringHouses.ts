// src/features/houses/services/recurringHouses.ts
// Crea la orden de la siguiente visita de una casa recurrente, con sus
// servicios cobrados y sus pagos de nómina. Va en UNA transacción que primero
// revisa que la casa siga siendo recurrente y que la siguiente no exista: si
// dos personas tienen la app abierta a la vez, solo una la crea. Reglas en
// houseRecurrence.ts; quién la llama: components/RecurringHousesRunner.tsx.
import { collection, doc, getDocs, query, runTransaction, where } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { COLLECTIONS } from '../../../lib/firebase/collections';
import { logActivity } from '../../../services/activityLogService';
import type { PayrollRecord, Property, ServiceRecord, SystemUser } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import {
  buildNextVisit, buildNextVisitPayment, buildNextVisitService, getNextVisitDate, getRecurrenceLabel, isDueForNextVisit,
} from '../houseRecurrence';

/** Registros (`billing_services` o `payroll`) de una casa. */
const getHouseRecords = async <T,>(collectionName: string, houseId: string): Promise<T[]> => {
  const snapshot = await getDocs(query(collection(db, collectionName), where('propertyId', '==', houseId)));
  return snapshot.docs.map((recordDoc) => ({ ...recordDoc.data(), id: recordDoc.id }) as T);
};

/**
 * Crea la orden de la siguiente visita de `house` y la enlaza
 * (`recurrence.nextHouseId`). Devuelve el id de la nueva, o '' si no había nada
 * que crear (otra sesión ya la creó, le quitaron la frecuencia o la borraron).
 */
export const createNextVisit = async (
  house: Property, nextVisitStatusId: string, clientName: string, actor?: SystemUser | null,
): Promise<string> => {
  const [services, payments] = await Promise.all([
    getHouseRecords<ServiceRecord>(COLLECTIONS.billingServices, house.id),
    getHouseRecords<PayrollRecord>(COLLECTIONS.payroll, house.id),
  ]);
  // Solo los pagos de la casa: los ajustes de nómina, Hourly y Fixed pay no llevan propertyId.
  const housePayments = payments.filter((payment) => !payment.payType);
  const houseRef = doc(db, COLLECTIONS.properties, house.id);
  const nextHouseRef = doc(collection(db, COLLECTIONS.properties));

  const nextVisitDate = await runTransaction(db, async (transaction) => {
    const houseSnapshot = await transaction.get(houseRef);
    if (!houseSnapshot.exists()) return '';
    const currentHouse = { ...(houseSnapshot.data() as Omit<Property, 'id'>), id: house.id };
    if (!isDueForNextVisit(currentHouse) || !currentHouse.recurrence) return '';
    const scheduleDate = getNextVisitDate(currentHouse.recurrence.freq, currentHouse.scheduleDate);
    if (!scheduleDate) return '';

    transaction.set(nextHouseRef, buildNextVisit(currentHouse, scheduleDate, nextVisitStatusId));
    services.forEach((service) => {
      transaction.set(doc(collection(db, COLLECTIONS.billingServices)), buildNextVisitService(service, nextHouseRef.id));
    });
    housePayments.forEach((payment) => {
      transaction.set(doc(collection(db, COLLECTIONS.payroll)), buildNextVisitPayment(payment, nextHouseRef.id, scheduleDate));
    });
    transaction.update(houseRef, { 'recurrence.nextHouseId': nextHouseRef.id });
    return scheduleDate;
  });
  if (!nextVisitDate) return '';

  logActivity({
    action: 'create',
    module: 'Houses',
    user: actor,
    targetId: nextHouseRef.id,
    targetLabel: `${clientName} — ${house.address || 'No address'}`,
    detail: `Recurring visit (${getRecurrenceLabel(house.recurrence?.freq)}) created automatically for ${formatDate(nextVisitDate)}, with ${services.length} billed service(s) and ${housePayments.length} payroll payment(s).`,
  });
  return nextHouseRef.id;
};
