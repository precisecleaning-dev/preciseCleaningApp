// src/services/customersService.ts
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
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
  async getAll(): Promise<Customer[]> {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    // ⭐ FIX: `id: doc.id` va DESPUÉS del spread para que el ID real del
    //    documento SIEMPRE gane sobre cualquier campo `id` contaminado
    //    que exista dentro del documento.
    //
    // ⭐ Pero ese `id` contaminado es el id LEGACY de AppSheet, y muchas casas
    //    lo guardan en su campo `client`. Al pisarlo se perdia la unica clave
    //    que permitia resolver el cliente, y las vistas mostraban el hex crudo
    //    ("4ea3f7ae") en vez del nombre. Ahora se conserva aparte como
    //    `legacyId`: el id real sigue mandando y ademas se puede resolver por
    //    el viejo. No se escribe nunca a Firestore (stripId lo elimina).
    return querySnapshot.docs.map(d => {
      const data = d.data() as Record<string, unknown>;
      const legacyId = typeof data.id === 'string' ? data.id : undefined;
      return {
        ...data,
        id: d.id,
        ...(legacyId && legacyId !== d.id ? { legacyId } : {}),
      } as Customer;
    });
  },

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