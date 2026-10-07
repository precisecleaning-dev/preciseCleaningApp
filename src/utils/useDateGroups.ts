// src/utils/useDateGroups.ts
// ⭐ Estado de la agrupación por fecha (modo elegido, grupos abiertos y cuántas
//    filas se ven de cada grupo). Lo comparten Invoices y el Overview.
//
//    RENDIMIENTO: con ~3,700 trabajos, abrir "2026" completo pintaría miles de
//    filas. Por eso los grupos arrancan CERRADOS (salvo el primero) y cada grupo
//    muestra sus filas por bloques con "Mostrar más", igual que la lista plana.

import { useState } from 'react';
import { loadGroupMode, saveGroupMode, type DateGroupMode } from './dateGrouping';

export const GROUP_PAGE_SIZE = 50;

export function useDateGroups(storageKey: string) {
  const [mode, setModeState] = useState<DateGroupMode>(() => loadGroupMode(storageKey));
  // null = estado inicial: solo el PRIMER grupo abierto.
  const [openKeys, setOpenKeys] = useState<Set<string> | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Al cambiar de modo, los grupos son otros: se vuelve al estado inicial.
  const setMode = (m: DateGroupMode) => {
    setModeState(m);
    setOpenKeys(null);
    setCounts({});
    saveGroupMode(storageKey, m);
  };

  const isOpen = (key: string, index: number) =>
    openKeys === null ? index === 0 : openKeys.has(key);

  const toggle = (key: string, index: number, firstKey: string | undefined) => {
    setOpenKeys((prev) => {
      const base = prev ?? new Set(firstKey !== undefined ? [firstKey] : []);
      const next = new Set(base);
      if (isOpen(key, index)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const visibleCount = (key: string) => counts[key] ?? GROUP_PAGE_SIZE;
  const showMore = (key: string) =>
    setCounts((c) => ({ ...c, [key]: (c[key] ?? GROUP_PAGE_SIZE) + 100 }));

  /** Vuelve a cerrar todo (p. ej. al cambiar filtros). */
  const reset = () => {
    setOpenKeys(null);
    setCounts({});
  };

  return { mode, setMode, isOpen, toggle, visibleCount, showMore, reset };
}
