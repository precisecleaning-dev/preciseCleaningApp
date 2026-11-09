// src/features/invoices-new/hooks/useInvoiceSelection.ts
// ============================================================================
// Invoices marcados en la tabla (checkboxes), SOLO de la página visible
// (decisión de Omar): "marcar todos" marca la página, y cambiar de página,
// filtro, tarjeta o búsqueda deja la selección vacía.
// Sin efecto que la limpie: la selección se guarda con la clave de la página
// en que se hizo (`scopeKey`) y, si la clave cambió, en el render vale vacía.
// También se queda solo con los invoices que siguen en la página.
// ============================================================================
import { useMemo, useState } from 'react';
import type { Invoice, InvoiceFiltersState } from '../../../types/index';

const EMPTY_IDS: ReadonlySet<string> = new Set();

interface StoredSelection {
  scopeKey: string;
  ids: ReadonlySet<string>;
}

/** Clave de la página visible: filtros, tarjeta, página y tamaño de página. */
export const getSelectionScopeKey = (filters: InvoiceFiltersState, page: number): string =>
  JSON.stringify({ ...filters, page });

export function useInvoiceSelection(pageInvoices: readonly Invoice[], scopeKey: string) {
  const [storedSelection, setStoredSelection] = useState<StoredSelection>({ scopeKey, ids: EMPTY_IDS });
  const storedIds = storedSelection.scopeKey === scopeKey ? storedSelection.ids : EMPTY_IDS;

  const selectedInvoices = useMemo(
    () => pageInvoices.filter((invoice) => storedIds.has(invoice.id)),
    [pageInvoices, storedIds],
  );
  const selectedIds = useMemo(() => new Set(selectedInvoices.map((invoice) => invoice.id)), [selectedInvoices]);
  const isAllSelected = pageInvoices.length > 0 && selectedInvoices.length === pageInvoices.length;
  const isSomeSelected = selectedInvoices.length > 0;

  const toggleInvoice = (invoice: Invoice) => {
    const nextIds = new Set(selectedIds);
    if (nextIds.has(invoice.id)) nextIds.delete(invoice.id);
    else nextIds.add(invoice.id);
    setStoredSelection({ scopeKey, ids: nextIds });
  };

  const toggleAll = () => {
    const nextIds = isAllSelected ? EMPTY_IDS : new Set(pageInvoices.map((invoice) => invoice.id));
    setStoredSelection({ scopeKey, ids: nextIds });
  };

  const clear = () => setStoredSelection({ scopeKey, ids: EMPTY_IDS });

  return { selectedIds, selectedInvoices, isAllSelected, isSomeSelected, toggleInvoice, toggleAll, clear };
}
