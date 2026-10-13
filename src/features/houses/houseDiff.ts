// src/features/houses/houseDiff.ts
// ============================================================================
// Diferencias entre la casa como se abrió y lo que se va a guardar, para
// escribir en Firestore solo lo que cambió (ver handleSave de HousesView).
// ============================================================================
import type { Property } from '../../types/index';

const key = (v: unknown): string => JSON.stringify(v ?? null);

/** Campos de `next` cuyo valor difiere del de `base` (sin los `undefined`,
 *  que Firestore rechaza). */
export function changedFields(base: Property, next: Record<string, unknown>): Partial<Property> {
  const out: Record<string, unknown> = {};
  const prev = base as unknown as Record<string, unknown>;
  Object.keys(next).forEach((field) => {
    const value = next[field];
    if (value === undefined) return;
    if (key(prev[field]) !== key(value)) out[field] = value;
  });
  return out as Partial<Property>;
}

/** Qué se agregó y qué se quitó entre dos listas (compara por valor). */
export function listDiff<T>(prev: readonly T[] | undefined, next: readonly T[] | undefined): { add: T[]; remove: T[] } {
  const before = prev || [];
  const after = next || [];
  const beforeKeys = new Set(before.map(key));
  const afterKeys = new Set(after.map(key));
  return {
    add: after.filter((v) => !beforeKeys.has(key(v))),
    remove: before.filter((v) => !afterKeys.has(key(v))),
  };
}
