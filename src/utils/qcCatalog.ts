// src/utils/qcCatalog.ts
// ============================================================================
// Áreas y tareas del checklist (settings_places / settings_tasks) tal como las
// usan Quality Check y el checklist de Houses: orden manual de las áreas y
// tareas activas (las archivadas solo sirven para leer reportes viejos).
// ============================================================================
import type { Place, Task } from '../types/index';

/** Orden manual (`sortOrder`); las áreas sin orden van al final, por nombre. */
export const comparePlacesByOrder = (firstPlace: Place, secondPlace: Place): number => {
  const firstOrder = firstPlace.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const secondOrder = secondPlace.sortOrder ?? Number.MAX_SAFE_INTEGER;
  return firstOrder - secondOrder || firstPlace.name.localeCompare(secondPlace.name);
};

/** Copia de las áreas en el orden del checklist. */
export const sortPlacesByOrder = (places: Place[]): Place[] => [...places].sort(comparePlacesByOrder);

/** ¿La tarea sigue en el checklist? (no está archivada) */
export const isActiveTask = (task: Task): boolean => task.archived !== true;
