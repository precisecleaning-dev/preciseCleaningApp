// src/features/invoices-new/hooks/useInvoiceList.ts
// ============================================================================
// Une la ventana de invoices con los filtros: tarjetas (sobre el conjunto
// buscado), filas filtradas y ordenadas, y la página visible. El total de la
// paginación es el de TODOS los resultados, no solo los de la página.
// ============================================================================
import { useMemo } from 'react';
import type { Invoice, YmdDate } from '../../../types/index';
import { filterByCardAndStatus, filterBySearchAndDates, summarizeInvoices } from '../invoiceFilters';
import type { InvoiceFiltersState } from './useInvoiceFilters';
import { clampPage, getPageCount, getPageItems } from '../../../shared/utils/pagination';

export function useInvoiceList(invoices: readonly Invoice[], filters: InvoiceFiltersState, today: YmdDate) {
  const searchedInvoices = useMemo(
    () => filterBySearchAndDates(invoices, filters.search, filters.dateRange),
    [invoices, filters.search, filters.dateRange],
  );
  const summary = useMemo(() => summarizeInvoices(searchedInvoices, today), [searchedInvoices, today]);
  const filteredInvoices = useMemo(
    () => filterByCardAndStatus(searchedInvoices, filters.card, filters.status, today),
    [searchedInvoices, filters.card, filters.status, today],
  );

  const pageCount = getPageCount(filteredInvoices.length, filters.pageSize);
  // Si llegan menos invoices (p. ej. se pagó uno), la página no queda fuera de rango.
  const page = clampPage(filters.page, pageCount);
  const pageInvoices = getPageItems(filteredInvoices, page, filters.pageSize);

  return { summary, filteredCount: filteredInvoices.length, pageInvoices, page, pageCount };
}
