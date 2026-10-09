// src/services/customersService.ts
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Customer } from '../types/index';

const COLLECTION_NAME = 'customers';

// ⭐ FIX: elimina el campo `id` del payload antes de escribir en Firestore.
//    El `id` es el identificador del DOCUMENTO, nunca debe vivir como campo
//    dentro del documento. Documentos viejos quedaron contaminados con un
//    campo `id` interno (por versiones anteriores que guardaban el objeto
//    completo), y ese id viejo pisaba al id real al leer, causando el error
//    "not-found: No document to update".
const stripId = <T extends { id?: string }>(data: T): Omit<T, 'id'> => {
  // ⭐ `legacyId` es un campo derivado que solo existe en memoria (lo agrega
  //    getAll para poder resolver referencias viejas). Nunca debe escribirse.
  const { id, legacyId, ...rest } = data as T & { legacyId?: string };
  void id; void legacyId;
  return rest as Omit<T, 'id'>;
};

export const customersService = {
  // ⭐ La lista de clientes se lee del store compartido
  //    (src/shared/data/liveCollections.ts, con mapCustomerDoc). Aquí solo
  //    quedan las escrituras.
  async create(customer: Omit<Customer, 'id'>): Promise<string> {
    // Defensa extra por si llega un objeto con `id` a pesar del tipo
    const docRef = await addDoc(collection(db, COLLECTION_NAME), stripId(customer as Customer));
    return docRef.id;
  },

  async update(id: string, customerData: Partial<Customer>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    // ⭐ NO tocar el campo `id` interno del documento: es el id LEGACY de
    //    AppSheet y es LA LLAVE con la que las casas migradas encuentran a su
    //    cliente (guardan ese valor en `client`). La "auto-limpieza" anterior
    //    lo borraba en cada edición y rompió el vínculo de varios clientes al
    //    usar el toggle de Apply Tax (se veían como "Cliente eliminado").
    await updateDoc(docRef, { ...stripId(customerData) });
  },

  async delete(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  }
};