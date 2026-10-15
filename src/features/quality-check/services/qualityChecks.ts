// src/features/quality-check/services/qualityChecks.ts
// Escrituras de los reportes de Quality Check (`quality_checks`) que antes
// hacía QualityCheckView directo con Firestore. Sin cambios de lógica.
import { collection, doc, getDoc, updateDoc, writeBatch, type WriteBatch } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { COLLECTIONS } from '../../../lib/firebase/collections';
import type { QcFormData } from '../../../types/index';

const ref = (id: string) => doc(db, COLLECTIONS.qualityChecks, id);

export const qualityChecks = {
  /**
   * Cambia las fotos de UN área del reporte ya guardado: lee el documento,
   * aplica `change` a la lista de fotos de esa área y reescribe `qcData`.
   * Si el reporte no existe, no hace nada.
   */
  async patchPlacePhotos(qcDocId: string, placeId: string, change: (photos: string[]) => string[]): Promise<void> {
    const docRef = ref(qcDocId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;
    const data = (snap.data() || {}) as { qcData?: QcFormData };
    const qc = { ...(data.qcData || {}) };
    const place = { ...(qc[placeId] || {}) };
    const photos = Array.isArray(place.photos) ? place.photos.slice() : [];
    place.photos = change(photos);
    qc[placeId] = place;
    await updateDoc(docRef, { qcData: qc });
  },

  /** Marca que las correcciones de un Recall ya se hicieron (quién y cuándo). */
  markCorrectionsDone: (id: string, at: string, by: string) =>
    updateDoc(ref(id), { correctionsDoneAt: at, correctionsDoneBy: by }),

  /**
   * Batch que guarda el reporte: actualiza `editingId` o crea uno nuevo con
   * el id generado aquí (se conoce antes de confirmar). Quien lo recibe le
   * agrega el resto (casa, status_history) y lo confirma.
   */
  saveBatch(editingId: string | null, data: Record<string, unknown>): { batch: WriteBatch; id: string } {
    const qcRef = editingId ? ref(editingId) : doc(collection(db, COLLECTIONS.qualityChecks));
    const batch = writeBatch(db);
    if (editingId) batch.update(qcRef, data);
    else batch.set(qcRef, data);
    return { batch, id: qcRef.id };
  },
};
