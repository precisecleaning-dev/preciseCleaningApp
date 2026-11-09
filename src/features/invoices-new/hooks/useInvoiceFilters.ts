// src/features/invoices-new/hooks/useInvoiceFilters.ts
// ============================================================================
// Filtros de la lista (useReducer): búsqueda, tarjeta, estado puntual, rango de
// fechas, página y tamaño de página. Cualquier cambio de filtro o de tamaño
// vuelve a la página 1 dentro del reducer (no hay efecto que lo vigile).
// ============================================================================
import { useMemo, useReducer } from 'react';
import type { InvoiceCardKey, InvoiceDateRange, InvoiceDisplayStatus, InvoiceFiltersState } from '../../../types/index';
import { ALL_DATES, cardForStatus } from '../invoiceFilters';

export const INVOICE_PAGE_SIZES = [10, 20, 50] as const;

type InvoiceFiltersAction =
  | { type: 'setSearch'; search: string }
  | { type: 'selectCard'; card: InvoiceCardKey }
  | { type: 'setStatus'; status: InvoiceDisplayStatus | 'all' }
  | { type: 'setDateRange'; dateRange: InvoiceDateRange }
  | { type: 'setPage'; page: number }
  | { type: 'setPageSize'; pageSize: number }
  | { type: 'clear' };

const INITIAL_FILTERS: InvoiceFiltersState = {
  search: '',
  card: 'all',
  status: 'all',
  dateRange: ALL_DATES,
  page: 1,
  pageSize: INVOICE_PAGE_SIZES[0],
};

function invoiceFiltersReducer(state: InvoiceFiltersState, action: InvoiceFiltersAction): InvoiceFiltersState {
  switch (action.type) {
    case 'setSearch':
      return { ...state, search: action.search, page: 1 };
    case 'selectCard':
      // Otra tarjeta limpia el estado puntual; conserva búsqueda y fechas. Tocar
      // la tarjeta ya elegida la quita (vuelve a todos los invoices).
      return { ...state, card: state.card === action.card ? 'all' : action.card, status: 'all', page: 1 };
    case 'setStatus':
      // Un estado puntual activa su grupo; "All statuses" conserva la tarjeta.
      return {
        ...state,
        status: action.status,
        card: action.status === 'all' ? state.card : cardForStatus(action.status),
        page: 1,
      };
    case 'setDateRange':
      return { ...state, dateRange: action.dateRange, page: 1 };
    case 'setPage':
      return { ...state, page: action.page };
    case 'setPageSize':
      return { ...state, pageSize: action.pageSize, page: 1 };
    case 'clear':
      // Clear filters conserva el tamaño de página elegido.
      return { ...INITIAL_FILTERS, pageSize: state.pageSize };
    default:
      return state;
  }
}

export function useInvoiceFilters() {
  const [filters, dispatch] = useReducer(invoiceFiltersReducer, INITIAL_FILTERS);

  const actions = useMemo(() => ({
    setSearch: (search: string) => dispatch({ type: 'setSearch', search }),
    selectCard: (card: InvoiceCardKey) => dispatch({ type: 'selectCard', card }),
    setStatus: (status: InvoiceDisplayStatus | 'all') => dispatch({ type: 'setStatus', status }),
    setDateRange: (dateRange: InvoiceDateRange) => dispatch({ type: 'setDateRange', dateRange }),
    setPage: (page: number) => dispatch({ type: 'setPage', page }),
    setPageSize: (pageSize: number) => dispatch({ type: 'setPageSize', pageSize }),
    clear: () => dispatch({ type: 'clear' }),
  }), []);

  const hasActiveFilters = filters.search.trim() !== '' || filters.card !== 'all' || filters.status !== 'all'
    || filters.dateRange.from !== '' || filters.dateRange.to !== '' || filters.dateRange.field !== ALL_DATES.field;

  return { filters, actions, hasActiveFilters };
}
