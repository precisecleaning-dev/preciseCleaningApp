// src/shared/utils/memoryCache.ts
// ============================================================================
// ⭐ CACHÉ EN MEMORIA CON TTL para lecturas únicas (`getDocs`/`getDoc`) de datos
//    que cambian poco. Evita repetir la lectura al navegar entre vistas: cada
//    `getDocs` cobra TODOS los documentos devueltos, aunque estén en la caché
//    persistente de Firestore.
//
// Se guarda la PROMESA: dos componentes que piden lo mismo a la vez comparten
// una sola petición. Los errores no se cachean. Quien escribe en esos datos
// llama a `invalidate(prefijo)` después de la escritura.
//
// Los datos en vivo NO van aquí: van al store de listeners
// (src/shared/data/liveCollections.ts).
// ============================================================================
const store = new Map<string, { expires: number; value: Promise<unknown> }>();

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  const value: Promise<T> = load().catch((err: unknown) => {
    // Los errores no se cachean (salvo que otra lectura ya haya ocupado la clave).
    if (store.get(key)?.value === value) store.delete(key);
    throw err;
  });
  store.set(key, { expires: Date.now() + ttlMs, value });
  return value;
}

export function invalidate(prefix: string): void {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}

/** Vacía todo (al cerrar sesión: el siguiente usuario no hereda lecturas). */
export function clearMemoryCache(): void {
  store.clear();
}
