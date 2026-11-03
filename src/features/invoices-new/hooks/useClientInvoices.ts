// src/features/invoices-new/hooks/useClientInvoices.ts
// ============================================================================
// Todos los invoices de UN cliente, en vivo, mientras su cuenta está abierta
// (invoicesService.subscribeByClient). `null` = ninguna cuenta abierta: no se
// escucha nada. La vista lo usa también para abrir el detalle de un invoice
// viejo (fuera de la ventana de 12 meses) con sus datos en vivo.
// ============================================================================
import { useEffect, useState } from 'react';
import type { ClientAccountKey, Invoice } from '../../../types/index';
import { invoicesService } from '../../../services/invoicesService';

interface ClientInvoicesState {
  invoices: Invoice[];
  /** Todavía no llega la primera respuesta de esta cuenta. */
  isLoading: boolean;
  /** La lectura falló: la lista vacía NO es real. */
  hasError: boolean;
}

interface StoredClientInvoices {
  accountId: string;
  invoices: Invoice[];
  hasError: boolean;
}

const getAccountId = (clientKey: ClientAccountKey): string => clientKey.customerId ?? `ref:${clientKey.clientRef}`;

export function useClientInvoices(clientKey: ClientAccountKey | null): ClientInvoicesState {
  const [stored, setStored] = useState<StoredClientInvoices | null>(null);
  const customerId = clientKey?.customerId ?? null;
  const clientRef = clientKey?.clientRef ?? '';
  const accountId = clientKey ? getAccountId(clientKey) : null;

  useEffect(() => {
    if (!accountId) return undefined;
    const subscribedKey: ClientAccountKey = { customerId, clientRef, name: '' };
    return invoicesService.subscribeByClient(
      subscribedKey,
      (invoices) => setStored({ accountId, invoices, hasError: false }),
      (error) => {
        console.error('Could not load the client invoices:', error);
        setStored({ accountId, invoices: [], hasError: true });
      },
    );
  }, [accountId, customerId, clientRef]);

  // Mientras llega la cuenta nueva no se muestran los invoices de la anterior.
  const isCurrentAccount = accountId !== null && stored?.accountId === accountId;
  return {
    invoices: isCurrentAccount ? stored.invoices : [],
    isLoading: accountId !== null && !isCurrentAccount,
    hasError: isCurrentAccount && stored.hasError,
  };
}
