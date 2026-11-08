// src/services/payrollService.ts
// ============================================================================
// Lecturas y escrituras de la colección `payroll` (tipos en
// src/types/payroll.ts). La colección se tipa UNA vez con typedConverter: el
// `id` es el id del documento y no se guarda como campo.
// Todos los pagos viven en 'payroll' ('payroll_records' es la colección vieja,
// ya migrada; solo la menciona la papelera para entradas antiguas).
// ============================================================================
import { db } from '../config/firebase';
import {
  collection, deleteDoc, doc, getDocs, query, setDoc, updateDoc, where,
  type CollectionReference, type DocumentReference, type WriteBatch,
} from 'firebase/firestore';
import type { PayrollRecord } from '../types/index';
import { COLLECTIONS } from '../lib/firebase/collections';
import { typedConverter } from '../lib/firebase/typedConverter';

/** Un pago tal como sale de Firestore: siempre con el id de su documento. */
type PayrollDoc = PayrollRecord & { id: string };

const payrollCol: CollectionReference<PayrollDoc> =
  collection(db, COLLECTIONS.payroll).withConverter(typedConverter<PayrollDoc>());

const payrollRef = (id: string): DocumentReference<PayrollDoc> =>
  doc(db, COLLECTIONS.payroll, id).withConverter(typedConverter<PayrollDoc>());

/** Referencia nueva con id automático y los datos listos para guardar. */
const newPayrollDoc = (data: Omit<PayrollRecord, 'id'>) => {
  const ref = doc(payrollCol);
  return { ref, model: { ...withDefaults(data), id: ref.id } };
};

export const payrollService = {
  async create(data: Omit<PayrollRecord, 'id'>): Promise<string> {
    try {
      const { ref, model } = newPayrollDoc(data);
      await setDoc(ref, model);
      return ref.id;
    } catch (error) {
      console.error('Error adding document: ', error);
      throw error;
    }
  },

  async getByPropertyId(propertyId: string): Promise<PayrollRecord[]> {
    try {
      const querySnapshot = await getDocs(query(payrollCol, where('propertyId', '==', propertyId)));
      return querySnapshot.docs.map((payrollSnap) => payrollSnap.data());
    } catch (error) {
      console.error('Error getting documents: ', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<PayrollRecord>): Promise<void> {
    try {
      await updateDoc(payrollRef(id), data);
    } catch (error) {
      console.error('Error updating document: ', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    try {
      await deleteDoc(payrollRef(id));
    } catch (error) {
      console.error('Error deleting document: ', error);
      throw error;
    }
  },

  // ⭐ Variantes para escrituras en lote (src/shared/data/batchWrites.ts):
  //    agregan la operación al batch; quien lo armó lo confirma.
  batchCreate(batch: WriteBatch, data: Omit<PayrollRecord, 'id'>): void {
    const { ref, model } = newPayrollDoc(data);
    batch.set(ref, model);
  },

  batchUpdate(batch: WriteBatch, id: string, data: Partial<PayrollRecord> | Record<string, unknown>): void {
    batch.update(doc(db, COLLECTIONS.payroll, id), data);
  },

  batchDelete(batch: WriteBatch, id: string): void {
    batch.delete(payrollRef(id));
  },
};

function withDefaults(data: Omit<PayrollRecord, 'id'>) {
  return { ...data, status: data.status || 'Pending' };
}
