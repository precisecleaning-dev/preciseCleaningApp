// src/features/houses/services/billingServices.ts
// Servicios cobrados de una casa (`billing_services`): las escrituras que
// antes hacían el detalle y el formulario de Houses directo con Firestore.
// Mismo patrón que payrollService (incluidas las variantes para batch).
import { addDoc, collection, deleteDoc, doc, updateDoc, type WriteBatch } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { COLLECTIONS } from '../../../lib/firebase/collections';
import type { ServiceRecord } from '../../../types/index';

const col = () => collection(db, COLLECTIONS.billingServices);
const ref = (id: string) => doc(db, COLLECTIONS.billingServices, id);

/** Datos de un servicio sin su id (el id es el del documento). */
type ServiceData = Omit<ServiceRecord, 'id'>;

export const billingServices = {
  create: (data: ServiceRecord) => addDoc(col(), data),
  update: (id: string, data: ServiceRecord) => updateDoc(ref(id), { ...data }),
  remove: (id: string) => deleteDoc(ref(id)),

  // ⭐ Variantes para escrituras en lote (shared/data/batchWrites.ts).
  batchCreate: (b: WriteBatch, data: ServiceData) => void b.set(doc(col()), data),
  batchUpdate: (b: WriteBatch, id: string, data: ServiceData) => void b.update(ref(id), data),
  batchDelete: (b: WriteBatch, id: string) => void b.delete(ref(id)),
};
