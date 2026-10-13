// src/shared/data/incrementalSnapshot.ts
// ============================================================================
// ⭐ MAPEO INCREMENTAL DE SNAPSHOTS.
//
// Antes cada evento de un listener volvía a mapear TODOS los documentos
// (`snap.docs.map(...)`): un cambio en una casa creaba ~3,600 objetos nuevos
// y React re-pintaba todas las filas, aunque solo una había cambiado.
// Ahora solo se mapean los documentos que cambiaron (`docChanges()`) y los
// demás conservan el MISMO objeto: las filas memoizadas y los `useMemo` que
// dependen de ellos no se recalculan sin motivo.
// ============================================================================
import type { DocumentData, QueryDocumentSnapshot, QuerySnapshot } from 'firebase/firestore';

/**
 * Devuelve una función que convierte cada snapshot de UNA consulta en su
 * lista, reutilizando los objetos de los documentos que no cambiaron. Crea
 * una por listener (guarda estado entre eventos).
 */
export function incrementalMapper<T>(
  map: (d: QueryDocumentSnapshot<DocumentData>) => T,
): (snap: QuerySnapshot<DocumentData>) => T[] {
  const byId = new Map<string, T>();
  return (snap) => {
    snap.docChanges().forEach((ch) => {
      if (ch.type === 'removed') byId.delete(ch.doc.id);
      else byId.set(ch.doc.id, map(ch.doc));
    });
    return snap.docs.map((d) => {
      const hit = byId.get(d.id);
      if (hit !== undefined) return hit;
      const fresh = map(d);
      byId.set(d.id, fresh);
      return fresh;
    });
  };
}
