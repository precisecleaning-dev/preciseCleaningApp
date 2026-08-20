// ============================================================================
// ⭐ LECTURA "CACHÉ PRIMERO, RED DESPUÉS" — velocidad + menos lecturas.
//
// La app tiene activada la persistencia local de Firestore (IndexedDB), pero
// `getDocs` normal va SIEMPRE al servidor: cada visita a una vista repite la
// lectura completa de la colección (lento y caro en lecturas facturadas).
//
// Este helper pinta AL MOMENTO con lo que ya está en el caché local y, en
// segundo plano, trae del servidor solo si hace falta refrescar. El patrón:
//
//   const snap = await getDocsCacheFirst(collection(db, 'quality_checks'), {
//     onFresh: (freshSnap) => setQcList(map(freshSnap)),   // llega después
//   });
//   setQcList(map(snap));                                  // pinta ya
//
// Si el caché está vacío (primera visita en ese dispositivo), va directo al
// servidor como siempre. La respuesta fresca solo se aplica si difiere.
// ============================================================================
import {
  getDocs,
  getDocsFromCache,
  type Query,
  type QuerySnapshot,
  type DocumentData,
} from 'firebase/firestore';

export async function getDocsCacheFirst(
  q: Query<DocumentData>,
  options?: {
    /** Se llama cuando llega la versión fresca del servidor (solo si el
     *  primer resultado salió del caché). */
    onFresh?: (snap: QuerySnapshot<DocumentData>) => void;
  },
): Promise<QuerySnapshot<DocumentData>> {
  try {
    const cached = await getDocsFromCache(q);
    if (!cached.empty) {
      // Pinta con el caché y refresca en segundo plano sin bloquear la vista.
      getDocs(q)
        .then((fresh) => {
          if (options?.onFresh) options.onFresh(fresh);
        })
        .catch(() => {
          /* sin red: el caché ya cubrió la vista */
        });
      return cached;
    }
  } catch {
    /* caché vacío o no disponible: seguir al servidor */
  }
  return getDocs(q);
}
