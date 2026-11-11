// src/services/hourlyRatesService.ts
// ============================================================================
// Lecturas y escrituras de `hourly_rates` (tipo HourlyRate en
// src/types/payroll.ts). Un documento por empleado: el id del documento es el
// id del empleado, así guardar otra vez el mismo empleado cambia su rate en vez
// de crear uno repetido. La pantalla lee la lista en vivo con
// useLiveCollection('hourlyRates').
// ============================================================================
import {
  collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc,
  type CollectionReference, type DocumentReference,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { HourlyRate } from '../types/index';
import { COLLECTIONS } from '../lib/firebase/collections';
import { typedConverter } from '../lib/firebase/typedConverter';
import type { BatchOp } from '../shared/data/batchWrites';

const hourlyRatesCol: CollectionReference<HourlyRate> =
  collection(db, COLLECTIONS.hourlyRates).withConverter(typedConverter<HourlyRate>());

const hourlyRateRef = (employeeId: string): DocumentReference<HourlyRate> =>
  doc(db, COLLECTIONS.hourlyRates, employeeId).withConverter(typedConverter<HourlyRate>());

export const hourlyRatesService = {
  /** Crea el rate por hora del empleado (el id del documento es el del empleado). */
  async create(employeeId: string, hourlyRate: number, updatedByUserName: string): Promise<void> {
    await setDoc(hourlyRateRef(employeeId), {
      id: employeeId,
      employeeId,
      hourlyRate,
      updatedAt: new Date().toISOString(),
      updatedByUserName,
    });
  },

  /** Cambia el rate por hora de un empleado que ya tiene uno. */
  async update(employeeId: string, hourlyRate: number, updatedByUserName: string): Promise<void> {
    await updateDoc(hourlyRateRef(employeeId), { hourlyRate, updatedAt: new Date().toISOString(), updatedByUserName });
  },

  /** Operación de batch que guarda el rate completo en el id de su empleado (para moverlo de id). */
  setOp(rate: HourlyRate): BatchOp {
    return (batch) => batch.set(hourlyRateRef(rate.employeeId), rate);
  },

  deleteOp(employeeId: string): BatchOp {
    return (batch) => batch.delete(hourlyRateRef(employeeId));
  },

  async delete(employeeId: string): Promise<void> {
    await deleteDoc(hourlyRateRef(employeeId));
  },

  async getAll(): Promise<HourlyRate[]> {
    const snapshot = await getDocs(hourlyRatesCol);
    return snapshot.docs.map((rateSnap) => rateSnap.data());
  },

  async getOne(employeeId: string): Promise<HourlyRate | null> {
    const rateSnap = await getDoc(hourlyRateRef(employeeId));
    return rateSnap.exists() ? rateSnap.data() : null;
  },
};
