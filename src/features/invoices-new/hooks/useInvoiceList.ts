// src/features/invoices-new/hooks/useInvoiceList.ts
// ============================================================================
// Une la ventana de invoices con los filtros: tarjetas (sobre el conjunto
// buscado), filas filtradas y ordenadas, y la página visible. El total de la
// paginación es el de TODOS los resultados, no solo los de la página.
// Los invoices en la papelera no cuentan en las tarjetas ni salen en la lista;
// solo se ven con el filtro de estado "Deleted".
// ============================================================================
import { useMemo } from 'react';
import type { Invoice, InvoiceFiltersState, YmdDate } from '../../../types/index';
import { filterByCardAndStatus, filterBySearchAndDates, summarizeInvoices } from '../invoiceFilters';
import { isDeletedInvoice } from '../invoiceStatus';
import { clampPage, getPageCount, getPageItems } from '../../../shared/utils/pagination';

export function useInvoiceList(invoices: readonly Invoice[], filters: InvoiceFiltersState, today: YmdDate) {
  const { activeInvoices, deletedInvoices } = useMemo(() => ({
    activeInvoices: invoices.filter((invoice) => !isDeletedInvoice(invoice)),
    deletedInvoices: invoices.filter(isDeletedInvoice),
  }), [invoices]);
  const isDeletedView = filters.status === 'deleted';
  const searchedActiveInvoices = useMemo(
    () => filterBySearchAndDates(activeInvoices, filters.search, filters.dateRange),
    [activeInvoices, filters.search, filters.dateRange],
  );
  const searchedRowInvoices = useMemo(
    () => (isDeletedView ? filterBySearchAndDates(deletedInvoices, filters.search, filters.dateRange) : searchedActiveInvoices),
    [isDeletedView, deletedInvoices, searchedActiveInvoices, filters.search, filters.dateRange],
  );
  const summary = useMemo(() => summarizeInvoices(searchedActiveInvoices, today), [searchedActiveInvoices, today]);
  const filteredInvoices = useMemo(
    () => filterByCardAndStatus(searchedRowInvoices, filters.card, filters.status, today),
    [searchedRowInvoices, filters.card, filters.status, today],
  );

  const pageCount = getPageCount(filteredInvoices.length, filters.pageSize);
  // Si llegan menos invoices (p. ej. se pagó uno), la página no queda fuera de rango.
  const page = clampPage(filters.page, pageCount);
  const pageInvoices = getPageItems(filteredInvoices, page, filters.pageSize);

  return {
    summary, filteredCount: filteredInvoices.length, pageInvoices, page, pageCount, deletedCount: deletedInvoices.length,
  };
}
