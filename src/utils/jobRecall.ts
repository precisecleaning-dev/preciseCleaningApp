// src/utils/jobRecall.ts
// ⭐ ¿La casa ESTUVO alguna vez en Recall? Para la marca "Recall" de la
//    columna Quality check (Overview) y del QC Dashboard.
//    Fuentes:
//      1) `status_history`: transiciones HACIA un status de recall.
//      2) colección `recalls` (registros directos).
//      3) el status ACTUAL de la casa (lo resuelve la vista con isRecallText).
//
// ⭐ PERF (auditoría 10/2026): antes se descargaba `status_history` COMPLETA
//    —un documento por cada cambio de status de toda la historia— en cada
//    visita al Overview y al QC Dashboard, y se repetía cada vez que llegaba
//    un snapshot de statuses. Ahora el servidor filtra: solo vuelven las
//    transiciones cuyo status de destino es un status de recall,
//    buscado por id y por nombre (algunos registros viejos guardan el nombre
//    en `toStatusId`). Límite conocido: un registro cuyo status de recall fue
//    BORRADO y que además tenía otro nombre ya no se encuentra (caso raro).
//
// ⭐ CACHÉ: el resultado se guarda en memoria RECALL_TTL_MS (shared/utils/
//    memoryCache.ts), así ir y volver del Overview o del QC Dashboard no
//    repite las consultas. `statusHistoryService.log` invalida la historia
//    al registrar un cambio de status; la colección `recalls` nadie la escribe
//    desde la app.

import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Status } from '../types/index';
import type { StatusHistoryEntry } from '../services/statusHistoryService';
import { cached } from '../shared/utils/memoryCache';
import { isRecallText } from './recallStatus';

/** Cuánto vive en memoria la historia de recall y la colección `recalls`. */
const RECALL_TTL_MS = 5 * 60 * 1000;

/** Prefijo de la caché de la historia de recall (lo invalida statusHistoryService). */
export const RECALL_HISTORY_CACHE = 'recallHistory:';

/** Documento de la colección opcional `recalls` (registros directos). */
interface RecallRecord {
  id: string;
  houseId?: string;
  [key: string]: unknown;
}

/** Colección `recalls` completa (es pequeña y solo se lee), con caché. */
function fetchRecallDocs(): Promise<RecallRecord[]> {
  return cached('recalls:all', RECALL_TTL_MS, async () => {
    const snap = await getDocs(collection(db, 'recalls'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RecallRecord);
  });
}

/** Ids y nombres de los status de recall (máx. 30 valores por consulta `in`). */
function recallStatusKeys(statuses: Status[]): { ids: string[]; names: string[] } {
  const recall = statuses.filter((s) => isRecallText(s.name));
  const ids = [...new Set(recall.map((s) => String(s.id)))].slice(0, 30);
  const names = [...new Set(recall.map((s) => s.name).filter(Boolean))].slice(0, 30);
  return { ids, names };
}

/**
 * Transiciones de `status_history` que entran a un status de recall. Hasta 2
 * consultas filtradas en el servidor (por id y por nombre), unidas por id de
 * documento.
 */
async function fetchRecallHistory(statuses: Status[]): Promise<StatusHistoryEntry[]> {
  const { ids, names } = recallStatusKeys(statuses);
  if (ids.length === 0 && names.length === 0) return [];
  const col = collection(db, 'status_history');
  // `toStatusId` puede traer el id o, en registros viejos, el nombre.
  const idOrName = [...new Set([...ids, ...names])].slice(0, 30);
  const queries = [where('toStatusId', 'in', idOrName), ...(names.length ? [where('toStatusName', 'in', names)] : [])];
  const key = `${RECALL_HISTORY_CACHE}${idOrName.join('|')}#${names.join('|')}`;
  return cached(key, RECALL_TTL_MS, async () => {
    // Si una consulta falla, falla todo: un resultado incompleto no se cachea.
    const snaps = await Promise.all(queries.map((w) => getDocs(query(col, w))));
    const byId = new Map<string, StatusHistoryEntry>();
    snaps.forEach((snap) => snap.docs.forEach((d) => byId.set(d.id, { id: d.id, ...d.data() } as StatusHistoryEntry)));
    return [...byId.values()];
  });
}

export function useRecallHouses(statuses: Status[], enabled = true) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  // Clave estable: la consulta solo se repite si cambian los status de recall,
  // no cada vez que llega un snapshot nuevo de la lista de statuses.
  const { ids: recallIds, names: recallNames } = recallStatusKeys(statuses);
  const key = `${recallIds.join('|')}#${recallNames.join('|')}`;

  useEffect(() => {
    // Sin status de recall en el catálogo la historia no aplica (devuelve []),
    // pero la colección `recalls` sí cuenta, como antes.
    if (!enabled) return;
    let alive = true;
    const recallStatuses = statuses.filter((s) => isRecallText(s.name));
    Promise.all([
      fetchRecallHistory(recallStatuses).catch(() => []),
      fetchRecallDocs().catch(() => []),
    ]).then(([hist, rec]) => {
      if (!alive) return;
      const s = new Set<string>();
      hist.forEach((h) => { if (h.propertyId) s.add(String(h.propertyId)); });
      rec.forEach((r) => { if (r.houseId) s.add(String(r.houseId)); });
      setIds(s);
    });
    return () => { alive = false; };
    // `statuses` se lee a través de `key` (mismos status de recall = misma consulta).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  return ids;
}
