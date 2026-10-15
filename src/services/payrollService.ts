import { db } from '../config/firebase';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc, type WriteBatch } from 'firebase/firestore';
import type { PayrollRecord } from '../types/index';

// Todos los pagos viven en 'payroll' ('payroll_records' es la colección vieja,
// ya migrada; solo la menciona la papelera para entradas antiguas).
const COLLECTION_NAME = 'payroll';

export const payrollService = {
  async create(data: Omit<PayrollRecord, 'id'>): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, COLLECTION_NAME), withDefaults(data));
      return docRef.id;
    } catch (error) {
      console.error('Error adding document: ', error);
      throw error;
    }
  },

  async getByPropertyId(propertyId: string): Promise<PayrollRecord[]> {
    try {
      const q = query(collection(db, COLLECTION_NAME), where("propertyId", "==", propertyId));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as PayrollRecord[];
    } catch (error) {
      console.error('Error getting documents: ', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<PayrollRecord>): Promise<void> {
    try {
      await updateDoc(doc(db, COLLECTION_NAME, id), data);
    } catch (error) {
      console.error('Error updating document: ', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, COLLECTION_NAME, id));
    } catch (error) {
      console.error('Error deleting document: ', error);
      throw error;
    }
  },

  // ⭐ Variantes para escrituras en lote (src/shared/data/batchWrites.ts):
  //    agregan la operación al batch; quien lo armó lo confirma.
  batchCreate(batch: WriteBatch, data: Omit<PayrollRecord, 'id'>): void {
    batch.set(doc(collection(db, COLLECTION_NAME)), withDefaults(data));
  },

  batchUpdate(batch: WriteBatch, id: string, data: Partial<PayrollRecord> | Record<string, unknown>): void {
    batch.update(doc(db, COLLECTION_NAME, id), data);
  },

  batchDelete(batch: WriteBatch, id: string): void {
    batch.delete(doc(db, COLLECTION_NAME, id));
  },
};

function withDefaults(data: Omit<PayrollRecord, 'id'>) {
  return { ...data, status: data.status || 'Pending' };
}