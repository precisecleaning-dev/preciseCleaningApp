import { db } from '../config/firebase';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { invalidate } from '../shared/utils/memoryCache';
import { RECALL_HISTORY_CACHE } from '../utils/jobRecall';

export interface StatusHistoryEntry {
  id?: string;
  propertyId: string;
  fromStatusId?: string | null;
  fromStatusName?: string | null;
  toStatusId: string;
  toStatusName: string | null;
  changedBy?: string;
  changedAt: string; // ISO
  /** Desde dónde se hizo el cambio (p. ej. 'quality_check'). */
  source?: string;
  /** Motivo del cambio, si lo hay (p. ej. 'No pasó Quality Check'). */
  reason?: string;
}

const COL = 'status_history';

export const statusHistoryService = {
  async log(entry: Omit<StatusHistoryEntry, 'id' | 'changedAt'> & { changedAt?: string }): Promise<string | null> {
    const data: StatusHistoryEntry = { changedAt: new Date().toISOString(), ...entry } as StatusHistoryEntry;
    if (!data.propertyId || !data.toStatusId) return null;
    if (data.fromStatusId && String(data.fromStatusId).toLowerCase().trim() === String(data.toStatusId).toLowerCase().trim()) {
      return null;
    }
    try {
      const ref = await addDoc(collection(db, COL), { ...data });
      invalidate(RECALL_HISTORY_CACHE); // la marca "Recall" se recalcula en la próxima visita
      return ref.id;
    } catch (e) {
      console.error('Error logging status history:', e);
      return null;
    }
  },

  async getByProperty(propertyId: string): Promise<StatusHistoryEntry[]> {
    try {
      const q = query(collection(db, COL), where('propertyId', '==', propertyId));
      const snap = await getDocs(q);
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as StatusHistoryEntry));
      return rows.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
    } catch (e) {
      console.error('Error fetching status history:', e);
      return [];
    }
  },
};