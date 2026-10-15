// ⭐ Último checklist de la casa (colección 'checklists'), en vivo mientras el
//    detalle está abierto: el pie del detalle muestra cuántas tareas tiene
//    marcadas y el visor lo edita. Extraído de HousesView.
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { COLLECTIONS } from '../../../lib/firebase/collections';

export interface ChecklistRecord {
  id?: string;
  checked: Record<string, boolean>;
  notes?: string;
  date?: string;
  inspector?: string;
}

type ChecklistDoc = { id: string; checked?: Record<string, boolean>; notes?: string; date?: string; inspector?: string; createdAt?: string };

export function useHouseChecklist(houseId: string | null): ChecklistRecord | null {
  const [latest, setLatest] = useState<{ houseId: string; record: ChecklistRecord | null } | null>(null);

  useEffect(() => {
    if (!houseId) return;
    const unsub = onSnapshot(
      query(collection(db, COLLECTIONS.checklists), where('houseId', '==', houseId)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as object) }) as ChecklistDoc)
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        const top = list[0];
        setLatest({
          houseId,
          record: top ? { id: top.id, checked: top.checked || {}, notes: top.notes, date: top.date, inspector: top.inspector } : null,
        });
      },
      (err) => console.error('Error cargando checklist:', err),
    );
    return () => unsub();
  }, [houseId]);

  return houseId && latest?.houseId === houseId ? latest.record : null;
}
