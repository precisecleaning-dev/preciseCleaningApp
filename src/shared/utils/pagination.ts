// src/shared/utils/pagination.ts
// ============================================================================
// Paginación numerada en el cliente (lista ya cargada): páginas, rango
// visible y botones con elipsis. La usa shared/components/PaginationBar.
// ============================================================================

/** Botón de página o elipsis. */
export type PageButton = { type: 'page'; page: number } | { type: 'ellipsis'; key: string };

/** Cantidad de páginas (mínimo 1, también sin resultados). */
export const getPageCount = (totalItems: number, pageSize: number): number =>
  Math.max(1, Math.ceil(totalItems / pageSize));

/** Página válida: si los filtros dejaron menos páginas, la última. */
export const clampPage = (page: number, pageCount: number): number => Math.min(Math.max(1, page), pageCount);

/** Elementos de una página. */
export const getPageItems = <T>(items: readonly T[], page: number, pageSize: number): T[] =>
  items.slice((page - 1) * pageSize, page * pageSize);

/** Rango visible "1–10" (1-indexado); 0–0 sin resultados. */
export const getPageRange = (totalItems: number, page: number, pageSize: number): { first: number; last: number } => {
  if (totalItems === 0) return { first: 0, last: 0 };
  const first = (page - 1) * pageSize + 1;
  return { first, last: Math.min(page * pageSize, totalItems) };
};

/**
 * Botones de página: la primera, la última y las vecinas de la actual, con
 * elipsis en los huecos. (1, 2, …, 9, 10 de 20 → 1 … 8 9 10 … 20)
 */
export const getPageButtons = (page: number, pageCount: number, neighborCount = 1): PageButton[] => {
  const shownPages = new Set([1, pageCount]);
  for (let offset = -neighborCount; offset <= neighborCount; offset += 1) {
    const neighborPage = page + offset;
    if (neighborPage >= 1 && neighborPage <= pageCount) shownPages.add(neighborPage);
  }
  const sortedPages = [...shownPages].sort((pageA, pageB) => pageA - pageB);
  const buttons: PageButton[] = [];
  sortedPages.forEach((shownPage, index) => {
    const previousPage = sortedPages[index - 1];
    if (previousPage !== undefined && shownPage - previousPage > 1) buttons.push({ type: 'ellipsis', key: `gap-${shownPage}` });
    buttons.push({ type: 'page', page: shownPage });
  });
  return buttons;
};
