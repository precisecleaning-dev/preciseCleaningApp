// ============================================================================
// ⭐ DAMAGES — colección 'damages' de Firestore (daños por casa), en vivo
//    mientras el detalle de la casa está abierto. Extraído de HousesView.
// ============================================================================
import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { COLLECTIONS } from '../../../lib/firebase/collections';
import { storageService } from '../../../services/storageService';
import type { Property, SystemUser } from '../../../types/index';
import type { UploadProgress } from '../components/PhotoUploadToast';

/** Registro de 'damages': ID (doc id), Description, Notes, Photos (varias). */
type DamageRecord = {
  id: string;
  houseId: string;
  description: string;
  notes?: string;
  photos?: string[];
  createdAt?: string;
  createdBy?: string;
};

export function useHouseDamages(house: Property | null, clientName: string, currentUser?: SystemUser | null) {
  const houseId = house?.id || null;
  const [list, setList] = useState<{ houseId: string; damages: DamageRecord[] } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [upload, setUpload] = useState<UploadProgress | null>(null);

  useEffect(() => {
    if (!houseId) return;
    const unsub = onSnapshot(
      query(collection(db, COLLECTIONS.damages), where('houseId', '==', houseId)),
      (snap) => {
        const damages = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DamageRecord);
        damages.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        setList({ houseId, damages });
      },
      (err) => {
        console.error('Error cargando damages:', err);
        setList({ houseId, damages: [] });
      },
    );
    return () => unsub();
  }, [houseId]);

  const ready = !!houseId && list?.houseId === houseId;
  const damages = ready ? list.damages : [];

  // ⭐ Las fotos de daños van a la carpeta del cliente; storageService las
  //    guarda en AfterPhotos (el antiguo cast a "Damages" caía ahí mismo).
  const uploadDamagePhotos = async (files: File[]): Promise<string[]> => {
    if (!house || files.length === 0) return [];
    const label = 'fotos de daños';
    setUpload({ label, done: 0, total: files.length, percent: 0 });
    try {
      return await storageService.uploadMultiplePropertyPhotos(files, clientName, house.address, 'after', (p) =>
        setUpload({ label, done: p.done, total: p.total, percent: p.percent }),
      );
    } finally {
      setUpload(null);
    }
  };

  /** Nuevo daño. Devuelve true si se guardó. */
  const add = async (description: string, notes: string, files: File[]): Promise<boolean> => {
    if (!house) return false;
    if (!description.trim()) {
      alert('La descripción del daño es obligatoria.');
      return false;
    }
    setIsSaving(true);
    try {
      const photos = await uploadDamagePhotos(files);
      await addDoc(collection(db, COLLECTIONS.damages), {
        houseId: house.id,
        description: description.trim(),
        notes: notes.trim(),
        photos,
        createdAt: new Date().toISOString(),
        createdBy: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown',
      });
      return true;
    } catch (error) {
      console.error('Error guardando el daño:', error);
      const fbErr = error as { code?: string; message?: string };
      alert(`Error al guardar el daño.\n\nCódigo: ${fbErr.code || 'desconocido'}\nDetalle: ${fbErr.message || String(error)}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const addPhotos = async (dam: DamageRecord, fl: FileList | null) => {
    if (!fl || fl.length === 0) return;
    setIsSaving(true);
    try {
      const urls = await uploadDamagePhotos(Array.from(fl));
      await updateDoc(doc(db, COLLECTIONS.damages, dam.id), { photos: [...(dam.photos || []), ...urls] });
    } catch (error) {
      console.error('Error agregando fotos al daño:', error);
      alert('No se pudieron agregar las fotos al daño.');
    } finally {
      setIsSaving(false);
    }
  };

  /** Corrige descripción y notas. Devuelve true si se guardó. */
  const saveEdit = async (id: string, description: string, notes: string): Promise<boolean> => {
    if (!description.trim()) {
      alert('La descripción del daño es obligatoria.');
      return false;
    }
    setIsSaving(true);
    try {
      await updateDoc(doc(db, COLLECTIONS.damages, id), { description: description.trim(), notes: notes.trim() });
      return true;
    } catch (error) {
      console.error('Error actualizando el daño:', error);
      alert('No se pudo actualizar el daño.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const removePhoto = async (dam: DamageRecord, idx: number) => {
    if (!window.confirm('¿Quitar esta foto del daño?')) return;
    try {
      await updateDoc(doc(db, COLLECTIONS.damages, dam.id), { photos: (dam.photos || []).filter((_, i) => i !== idx) });
    } catch (error) {
      console.error('Error quitando la foto del daño:', error);
      alert('No se pudo quitar la foto.');
    }
  };

  const remove = async (dam: DamageRecord) => {
    if (!window.confirm('¿Eliminar este daño? Esta acción no se puede deshacer.')) return;
    try {
      await deleteDoc(doc(db, COLLECTIONS.damages, dam.id));
    } catch (error) {
      console.error('Error eliminando el daño:', error);
      alert('No se pudo eliminar el daño.');
    }
  };

  return { damages, isLoading: !!houseId && !ready, isSaving, upload, add, addPhotos, saveEdit, removePhoto, remove };
}

export type HouseDamages = ReturnType<typeof useHouseDamages>;
