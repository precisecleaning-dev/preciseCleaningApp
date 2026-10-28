import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, type SnapshotMetadata } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { COLLECTIONS } from '../../lib/firebase/collections';

/** Firestore acepta hasta 30 valores en un `in`. */
const CHUNK = 30;

/** Sin red y el resultado salió vacío del caché: "sin reportes" no es confiable
 *  (pueden no estar en caché). Misma regla que useOpsData del Task list. */
const OFFLINE_LOAD_ERROR = new Error('Sin conexión: no se pudieron cargar los reportes de Quality Check.');
const isOfflineCacheOnly = (metadata: SnapshotMetadata): boolean =>
  metadata.fromCache && typeof navigator !== 'undefined' && !navigator.onLine;
// Con la metadata, el aviso de "sin conexión" se quita solo al volver la red.
const LISTEN_WITH_METADATA = { includeMetadataChanges: true } as const;

interface QcForHousesState<T> {
  key: string;
  parts: (T[] | undefined)[];
  /** Error de cada tanda (null = bien). */
  partErrors: (Error | null)[];
  /** Último conjunto COMPLETO (de este grupo de casas o del anterior). */
  data: T[] | null;
}

/**
 * Reportes de QC de ESTAS casas, en vivo: un listener por tanda de 30 ids
 * (`where('houseId', 'in', …)`, sin índice compuesto). Lo usa la pantalla del
 * inspector, que solo muestra casas en Quality Check o Recall: antes bajaba la
 * colección completa (~2,500 reportes con fotos y respuestas) en el teléfono.
 *
 * Si cambia el grupo de casas, se sigue mostrando lo anterior hasta que lleguen
 * las tandas nuevas (la pantalla no parpadea a "cargando").
 *
 * `error`: si un listener falla (reglas, permisos) o no hay red y el caché no
 * tiene nada, la carga termina (`loaded`) con el error, para que la pantalla
 * lo diga en vez de quedarse "cargando" o mostrar "sin reportes".
 */
export function useQcForHouses<T extends { id?: string }>(
  houseIds: string[],
): { data: T[]; loaded: boolean; error: Error | null } {
  const key = [...new Set(houseIds)].sort().join('|');
  const [state, setState] = useState<QcForHousesState<T>>({
    key: '',
    parts: [],
    partErrors: [],
    data: null,
  });

  useEffect(() => {
    const ids = key ? key.split('|') : [];
    const groups: string[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) groups.push(ids.slice(i, i + CHUNK));
    // Guarda lo que llegó (o el error) de una tanda; con todas, arma `data`.
    const saveGroupResult = (groupIndex: number, groupReports: T[], groupError: Error | null) => {
      setState((previousState) => {
        const isSameGroupSet = previousState.key === key;
        const parts: (T[] | undefined)[] = isSameGroupSet
          ? [...previousState.parts]
          : Array.from({ length: groups.length }, () => undefined);
        const partErrors: (Error | null)[] = isSameGroupSet
          ? [...previousState.partErrors]
          : Array.from({ length: groups.length }, () => null);
        parts[groupIndex] = groupReports;
        partErrors[groupIndex] = groupError;
        const isComplete = parts.every((part) => part !== undefined);
        return {
          key,
          parts,
          partErrors,
          data: isComplete ? parts.flatMap((part) => part ?? []) : previousState.data,
        };
      });
    };
    const unsubs = groups.map((group, groupIndex) =>
      onSnapshot(
        query(collection(db, COLLECTIONS.qualityChecks), where('houseId', 'in', group)),
        LISTEN_WITH_METADATA,
        (snap) => {
          const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T);
          const isMissingOffline = snap.empty && isOfflineCacheOnly(snap.metadata);
          saveGroupResult(groupIndex, list, isMissingOffline ? OFFLINE_LOAD_ERROR : null);
        },
        (error) => {
          console.error('Error escuchando los reportes de QC de las casas:', error);
          saveGroupResult(groupIndex, [], error);
        },
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [key]);

  return useMemo(() => {
    if (!key) return { data: [], loaded: true, error: null };
    const currentError = state.key === key ? state.partErrors.find((partError) => partError !== null) ?? null : null;
    return { data: state.data ?? [], loaded: state.data !== null, error: currentError };
  }, [key, state.data, state.key, state.partErrors]);
}
