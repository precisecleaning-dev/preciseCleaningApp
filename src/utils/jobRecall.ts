// src/utils/jobRecall.ts
// ⭐ ¿La casa ESTUVO alguna vez en Recall? Para la marca "Recall" de la
//    columna Quality check (Overview) y del QC Dashboard.
//    Mismas fuentes que RecallsView:
//      1) `status_history`: cualquier transición HACIA un status de recall.
//      2) colección `recalls` (registros directos).
//      3) el status ACTUAL de la casa (lo resuelve la vista con isRecallText).
//    Se lee UNA vez al abrir la vista (no en tiempo real): el historial crece
//    mucho y un recall nuevo también se ve por la regla 3 al instante.

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Status } from '../types/index';
import { isRecallText } from './recallStatus';

interface HistoryDoc {
  propertyId?: string;
  toStatusId?: string;
  toStatusName?: string;
}
interface RecallDoc {
  houseId?: string;
}

export function useRecallHouses(statuses: Status[], enabled = true) {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const statusName = (id?: string) => statuses.find((s) => String(s.id) === String(id))?.name;
    Promise.all([
      getDocs(collection(db, 'status_history')).catch(() => null),
      getDocs(collection(db, 'recalls')).catch(() => null),
    ]).then(([hist, rec]) => {
      if (!alive) return;
      const s = new Set<string>();
      hist?.docs.forEach((d) => {
        const h = d.data() as HistoryDoc;
        if (h.propertyId && (isRecallText(h.toStatusName) || isRecallText(statusName(h.toStatusId)))) {
          s.add(String(h.propertyId));
        }
      });
      rec?.docs.forEach((d) => {
        const r = d.data() as RecallDoc;
        if (r.houseId) s.add(String(r.houseId));
      });
      setIds(s);
    });
    return () => { alive = false; };
  }, [enabled, statuses]);

  return ids;
}
