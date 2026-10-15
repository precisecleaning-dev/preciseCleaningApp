import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { COLLECTIONS } from '../../lib/firebase/collections';

/** Firestore acepta hasta 30 valores en un `in`. */
const CHUNK = 30;

/**
 * Reportes de QC de ESTAS casas, en vivo: un listener por tanda de 30 ids
 * (`where('houseId', 'in', …)`, sin índice compuesto). Lo usa la pantalla del
 * inspector, que solo muestra casas en Quality Check o Recall: antes bajaba la
 * colección completa (~2,500 reportes con fotos y respuestas) en el teléfono.
 *
 * Si cambia el grupo de casas, se sigue mostrando lo anterior hasta que lleguen
 * las tandas nuevas (la pantalla no parpadea a "cargando").
 */
export function useQcForHouses<T extends { id?: string }>(houseIds: string[]): { data: T[]; loaded: boolean } {
  const key = [...new Set(houseIds)].sort().join('|');
  // `data` es el último conjunto COMPLETO (de este grupo de casas o del anterior).
  const [state, setState] = useState<{ key: string; parts: (T[] | undefined)[]; data: T[] | null }>({
    key: '',
    parts: [],
    data: null,
  });

  useEffect(() => {
    const ids = key ? key.split('|') : [];
    const groups: string[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) groups.push(ids.slice(i, i + CHUNK));
    const unsubs = groups.map((group, i) =>
      onSnapshot(
        query(collection(db, COLLECTIONS.qualityChecks), where('houseId', 'in', group)),
        (snap) => {
          const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T);
          setState((prev) => {
            const parts: (T[] | undefined)[] =
              prev.key === key ? [...prev.parts] : Array.from({ length: groups.length }, () => undefined);
            parts[i] = list;
            const complete = parts.every((x) => x !== undefined);
            return { key, parts, data: complete ? parts.flatMap((x) => x ?? []) : prev.data };
          });
        },
        (err) => console.error('Error escuchando los reportes de QC de las casas:', err),
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [key]);

  return useMemo(
    () => (key ? { data: state.data ?? [], loaded: state.data !== null } : { data: [], loaded: true }),
    [key, state.data],
  );
}
