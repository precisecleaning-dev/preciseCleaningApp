// ⭐ Último checklist de la casa (colección 'checklists'), en vivo mientras el
//    detalle está abierto: el pie del detalle muestra cuántas tareas tiene
//    marcadas y el visor lo edita. Extraído de HousesView.
//    Devuelve también si ya cargó: el visor no deja guardar antes, porque un
//    guardado con la copia vacía borraría las marcas que ya existen.
//    Una respuesta VACÍA del caché (sin red o antes de que conteste el
//    servidor) no cuenta como cargada: si no, el visor creaba un checklist
//    nuevo y el anterior (con sus marcas) quedaba oculto detrás. Por eso se
//    escucha también la metadata (includeMetadataChanges).
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { COLLECTIONS } from '../../../lib/firebase/collections';
import type { ChecklistRecord, HouseChecklistState } from '../../../types/index';

type ChecklistDoc = { id: string; checked?: Record<string, boolean>; notes?: string; date?: string; inspector?: string; createdAt?: string };

const NOT_LOADED: HouseChecklistState = { checklist: null, isLoaded: false, hasLoadError: false };

export function useHouseChecklist(houseId: string | null): HouseChecklistState {
  const [latest, setLatest] = useState<{ houseId: string; state: HouseChecklistState } | null>(null);

  useEffect(() => {
    if (!houseId) return;
    const unsubscribe = onSnapshot(
      query(collection(db, COLLECTIONS.checklists), where('houseId', '==', houseId)),
      { includeMetadataChanges: true },
      (snapshot) => {
        const checklistDocs = snapshot.docs
          .map((checklistDoc) => ({ id: checklistDoc.id, ...(checklistDoc.data() as object) }) as ChecklistDoc)
          .sort((first, second) => String(second.createdAt ?? '').localeCompare(String(first.createdAt ?? '')));
        const newestDoc = checklistDocs[0];
        const checklist: ChecklistRecord | null = newestDoc
          ? { id: newestDoc.id, checked: newestDoc.checked ?? {}, notes: newestDoc.notes, date: newestDoc.date, inspector: newestDoc.inspector }
          : null;
        const isUnconfirmedEmpty = snapshot.metadata.fromCache && checklistDocs.length === 0;
        setLatest({ houseId, state: { checklist, isLoaded: !isUnconfirmedEmpty, hasLoadError: false } });
      },
      (error) => {
        console.error('Error cargando checklist:', error);
        setLatest({ houseId, state: { checklist: null, isLoaded: false, hasLoadError: true } });
      },
    );
    return () => unsubscribe();
  }, [houseId]);

  return houseId && latest?.houseId === houseId ? latest.state : NOT_LOADED;
}
