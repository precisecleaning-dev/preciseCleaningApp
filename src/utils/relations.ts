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

export function getRelationName<T extends RelationItem>(
  list: T[],
  idOrName?: string | null,
  fallback = '-'
): string {
  if (!idOrName) return fallback;
  const safeVal = String(idOrName).toLowerCase().trim();
  const found = list.find(
    item => String(item.id).toLowerCase().trim() === safeVal || String(item.name).toLowerCase().trim() === safeVal
  );
  return found ? found.name : fallback;
}

export function getRelationColor<T extends RelationItem>(
  list: T[],
  idOrName?: string | null
): string | undefined {
  if (!idOrName) return undefined;
  const safeVal = String(idOrName).toLowerCase().trim();
  return list.find(
    item => String(item.id).toLowerCase().trim() === safeVal || String(item.name).toLowerCase().trim() === safeVal
  )?.color;
}
