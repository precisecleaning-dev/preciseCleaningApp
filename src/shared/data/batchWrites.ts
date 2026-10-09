// src/shared/data/batchWrites.ts
// ============================================================================
// ⭐ ESCRITURAS EN LOTE — varias escrituras relacionadas viajan en un `writeBatch`.
//
// Antes los guardados con varias escrituras (servicios y pagos de una casa,
// pago consolidado de nómina, corrección masiva de fechas, alta masiva de
// usuarios) hacían un `await` por documento: N viajes al servidor, N eventos de
// los listeners (N re-renders de las listas grandes) y, si una fallaba a la
// mitad, los datos quedaban a medias sin que nadie se enterara.
//
// Con un batch:
//   · un solo viaje al servidor y un solo evento de los listeners;
//   · todo o nada dentro de cada tanda (máximo 500 operaciones por batch,
//     límite de Firestore), así no quedan pagos o servicios a medias.
// Firestore cobra igual una escritura por documento: el ahorro es de tiempo,
// de re-renders y de consistencia, no de facturación.
// ============================================================================
import { writeBatch, type WriteBatch } from 'firebase/firestore';
import { db } from '../../config/firebase';

/** Límite de operaciones por batch de Firestore. */
const MAX_OPS = 500;

/** Una operación que se agrega al batch (`b.set`, `b.update`, `b.delete`). */
export type BatchOp = (batch: WriteBatch) => void;

export interface ChunkResult<T> {
  ok: T[];
  failed: T[];
  /** Primer error encontrado (null si todo salió bien). */
  firstError: unknown;
}

/**
 * Escribe un elemento por operación, en tandas de hasta 500. Cada tanda es
 * atómica; si una falla, las demás se siguen intentando y el resultado dice
 * qué elementos quedaron guardados y cuáles no.
 */
export async function commitInChunks<T>(
  items: readonly T[],
  apply: (batch: WriteBatch, item: T) => void,
): Promise<ChunkResult<T>> {
  const ok: T[] = [];
  const failed: T[] = [];
  let firstError: unknown = null;
  for (let i = 0; i < items.length; i += MAX_OPS) {
    const chunk = items.slice(i, i + MAX_OPS);
    try {
      const batch = writeBatch(db);
      chunk.forEach((item) => apply(batch, item));
      await batch.commit();
      ok.push(...chunk);
    } catch (err) {
      console.error('Error en escritura por lotes:', err);
      failed.push(...chunk);
      firstError ??= err;
    }
  }
  return { ok, failed, firstError };
}

/**
 * Confirma un grupo de operaciones relacionadas. Lanza el error si algo falla,
 * para que el `try/catch` de quien llama muestre el aviso al usuario.
 */
export async function commitOps(ops: readonly BatchOp[]): Promise<void> {
  if (ops.length === 0) return;
  const { failed, firstError } = await commitInChunks(ops, (batch, op) => op(batch));
  if (failed.length > 0) throw firstError;
}
