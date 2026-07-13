// src/services/propertiesService.ts
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase'; // Conexión a la base de datos
import type { Property } from '../types/index';

const COLLECTION_NAME = 'properties';

// IMPORTANTE: Aquí se exporta explícitamente 'propertiesService' que HousesView está buscando
export const propertiesService = {
  // 1. Obtener todos los trabajos desde Firebase
  async getAll(): Promise<Property[]> {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Property));
  },

  // 2. Crear un nuevo trabajo
  async create(property: Omit<Property, 'id'>): Promise<string> {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), property);
    return docRef.id; // Retorna el ID autogenerado por Firebase
  },

  // 3. Actualizar un trabajo existente
  async update(id: string, propertyData: Partial<Property>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, propertyData);
  },

  // 4. Eliminar un trabajo
  async delete(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  }
};