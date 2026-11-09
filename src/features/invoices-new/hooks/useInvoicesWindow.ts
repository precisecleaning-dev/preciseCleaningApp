// src/features/invoices-new/hooks/useInvoicesWindow.ts
// ============================================================================
// Invoices de la lista, en vivo: emitidos en los últimos 12 meses más los que
// siguen sin pagar (invoicesService.subscribeWindow). Con "Ver todo el
// historial" (HistoryWindowNotice, el mismo interruptor de las casas) se
// escucha la colección completa durante la sesión.
// ============================================================================
import { useEffect, useState } from 'react';
import type { Invoice } from '../../../types/index';
import { invoicesService } from '../../../services/invoicesService';
import { useFullHistory } from '../../../shared/data/propertiesWindow';

interface InvoicesWindowState {
  invoices: Invoice[];
  /** Todavía no llega la primera respuesta. */
  isLoading: boolean;
  /** La lectura falló: la lista vacía NO es real. */
  hasError: boolean;
}

export function useInvoicesWindow(): InvoicesWindowState {
  const isFullHistory = useFullHistory();
  const [windowState, setWindowState] = useState<InvoicesWindowState>({ invoices: [], isLoading: true, hasError: false });

  useEffect(() => invoicesService.subscribeWindow(
    isFullHistory,
    (invoices) => setWindowState({ invoices, isLoading: false, hasError: false }),
    (error) => {
      console.error('Could not load the invoices:', error);
      setWindowState((previousState) => ({ ...previousState, isLoading: false, hasError: true }));
    },
  ), [isFullHistory]);

  return windowState;
}
