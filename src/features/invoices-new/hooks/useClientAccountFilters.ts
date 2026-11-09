// src/features/invoices-new/hooks/useClientAccountFilters.ts
// ============================================================================
// Filtros de la cuenta del cliente (useReducer): pestaña, tarjeta, estado
// puntual, página de cada pestaña y tamaño de página. Cambiar un filtro vuelve
// a la página 1 dentro del reducer (sin efectos), como useInvoiceFilters.
// ============================================================================
import { useMemo, useReducer } from 'react';
import type { ClientAccountCardKey, InvoiceDisplayStatus } from '../../../types/index';
import { clientCardForStatus } from '../clientAccount';
import { INVOICE_PAGE_SIZES } from './useInvoiceFilters';

export type ClientAccountTab = 'invoices' | 'payments';

export interface ClientAccountFiltersState {
  tab: ClientAccountTab;
  card: ClientAccountCardKey;
  status: InvoiceDisplayStatus | 'all';
  invoicesPage: number;
  paymentsPage: number;
  pageSize: number;
}

type ClientAccountFiltersAction =
  | { type: 'setTab'; tab: ClientAccountTab }
  | { type: 'selectCard'; card: Exclude<ClientAccountCardKey, 'all'> }
  | { type: 'setStatus'; status: InvoiceDisplayStatus | 'all' }
  | { type: 'setInvoicesPage'; page: number }
  | { type: 'setPaymentsPage'; page: number }
  | { type: 'setPageSize'; pageSize: number };

const INITIAL_FILTERS: ClientAccountFiltersState = {
  tab: 'invoices',
  card: 'all',
  status: 'all',
  invoicesPage: 1,
  paymentsPage: 1,
  pageSize: INVOICE_PAGE_SIZES[0],
};

function clientAccountFiltersReducer(
  state: ClientAccountFiltersState, action: ClientAccountFiltersAction,
): ClientAccountFiltersState {
  switch (action.type) {
    case 'setTab':
      return { ...state, tab: action.tab };
    case 'selectCard':
      // Una tarjeta filtra la pestaña Invoices (y la muestra); tocar la elegida la quita.
      return {
        ...state,
        tab: 'invoices',
        card: state.card === action.card ? 'all' : action.card,
        status: 'all',
        invoicesPage: 1,
      };
    case 'setStatus':
      return {
        ...state,
        status: action.status,
        card: action.status === 'all' ? state.card : clientCardForStatus(action.status),
        invoicesPage: 1,
      };
    case 'setInvoicesPage':
      return { ...state, invoicesPage: action.page };
    case 'setPaymentsPage':
      return { ...state, paymentsPage: action.page };
    case 'setPageSize':
      return { ...state, pageSize: action.pageSize, invoicesPage: 1, paymentsPage: 1 };
    default:
      return state;
  }
}

export function useClientAccountFilters() {
  const [filters, dispatch] = useReducer(clientAccountFiltersReducer, INITIAL_FILTERS);

  const actions = useMemo(() => ({
    setTab: (tab: ClientAccountTab) => dispatch({ type: 'setTab', tab }),
    selectCard: (card: Exclude<ClientAccountCardKey, 'all'>) => dispatch({ type: 'selectCard', card }),
    setStatus: (status: InvoiceDisplayStatus | 'all') => dispatch({ type: 'setStatus', status }),
    setInvoicesPage: (page: number) => dispatch({ type: 'setInvoicesPage', page }),
    setPaymentsPage: (page: number) => dispatch({ type: 'setPaymentsPage', page }),
    setPageSize: (pageSize: number) => dispatch({ type: 'setPageSize', pageSize }),
  }), []);

  return { filters, actions };
}
