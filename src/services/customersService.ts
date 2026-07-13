// src/services/customersService.ts
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase'; 
import type { Customer } from '../types/index';

const COLLECTION_NAME = 'customers';

export const customersService = {
  async getAll(): Promise<Customer[]> {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Customer));
  },

  async create(customer: Omit<Customer, 'id'>): Promise<string> {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), customer);
    return docRef.id;
  },

  async update(id: string, customerData: Partial<Customer>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, customerData);
  },

  async delete(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  }
};