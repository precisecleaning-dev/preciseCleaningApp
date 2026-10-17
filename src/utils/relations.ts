// Helpers para resolver un id-o-nombre (retrocompatible con datos legacy que guardaban
// el nombre en vez del id) contra una colección de catálogo (teams, statuses, priorities,
// services, customers, etc.). Comparación case-insensitive y con espacios recortados.
//
// Antes reimplementado casi idéntico en PipelineBoardView.tsx, PayrollView.tsx,
// CalendarView.tsx, InvoicesView.tsx y HousesView.tsx — unificado acá.

interface RelationItem {
  id: string;
  name: string;
  color?: string;
}

/** Clave de comparación de un id-o-nombre: sin mayúsculas y sin espacios de más. */
export const normalizeRelationKey = (idOrName?: string | null): string => String(idOrName ?? '').toLowerCase().trim();

/** ¿El id-o-nombre guardado apunta a este elemento del catálogo? (misma regla que getRelationName). */
export const matchesRelation = (item: RelationItem, idOrName?: string | null): boolean => {
  if (!idOrName) return false;
  const relationKey = normalizeRelationKey(idOrName);
  return normalizeRelationKey(item.id) === relationKey || normalizeRelationKey(item.name) === relationKey;
};

export function getRelationName<T extends RelationItem>(
  list: T[],
  idOrName?: string | null,
  fallback = '-'
): string {
  const found = list.find((item) => matchesRelation(item, idOrName));
  return found ? found.name : fallback;
}

export function getRelationColor<T extends RelationItem>(
  list: T[],
  idOrName?: string | null
): string | undefined {
  return list.find((item) => matchesRelation(item, idOrName))?.color;
}
