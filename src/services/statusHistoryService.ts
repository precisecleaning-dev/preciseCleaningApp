import { db } from '../config/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

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

// Las ESCRITURAS de status_history van en el mismo batch que la casa:
// features/houses/services/houseStatus.ts. Aquí solo queda la lectura.
export const statusHistoryService = {
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