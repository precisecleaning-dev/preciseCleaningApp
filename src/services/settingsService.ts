// src/services/settingsService.ts
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase'; 
import { commitOps } from '../shared/data/batchWrites';

export const settingsService = {
  // Crear un documento en una colección específica
  async create(collectionName: string, data: Record<string, unknown>): Promise<string> {
    const docRef = await addDoc(collection(db, collectionName), data);
    return docRef.id;
  },

  // Crear varios documentos en un solo batch (todos o ninguno); devuelve los
  // ids en el mismo orden que `items`.
  async createMany(collectionName: string, items: Record<string, unknown>[]): Promise<string[]> {
    const refs = items.map(() => doc(collection(db, collectionName)));
    await commitOps(items.map((data, i) => (b) => b.set(refs[i], data)));
    return refs.map((r) => r.id);
  },

  // Actualizar un documento
  async update(collectionName: string, id: string, data: Record<string, unknown>): Promise<void> {
    const docRef = doc(db, collectionName, id);
    await updateDoc(docRef, data);
  },

  // Eliminar un documento
  async delete(collectionName: string, id: string): Promise<void> {
    const docRef = doc(db, collectionName, id);
    await deleteDoc(docRef);
  }
};