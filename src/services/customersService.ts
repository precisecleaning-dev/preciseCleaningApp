// src/services/customersService.ts
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, deleteField } from 'firebase/firestore';
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
  const { id, ...rest } = data;
  return rest;
};

export const customersService = {
  async getAll(): Promise<Customer[]> {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    // ⭐ FIX: `id: doc.id` va DESPUÉS del spread para que el ID real del
    //    documento SIEMPRE gane sobre cualquier campo `id` contaminado
    //    que exista dentro del documento.
    return querySnapshot.docs.map(d => ({
      ...d.data(),
      id: d.id
    } as Customer));
  },

  async create(customer: Omit<Customer, 'id'>): Promise<string> {
    // Defensa extra por si llega un objeto con `id` a pesar del tipo
    const docRef = await addDoc(collection(db, COLLECTION_NAME), stripId(customer as Customer));
    return docRef.id;
  },

  async update(id: string, customerData: Partial<Customer>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    // ⭐ Escribe los datos sin `id` y ADEMÁS borra el campo `id` interno si
    //    el documento viejo lo tenía (deleteField). Así cada edición va
    //    auto-limpiando los documentos contaminados.
    await updateDoc(docRef, { ...stripId(customerData), id: deleteField() });
  },

  async delete(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  }
};