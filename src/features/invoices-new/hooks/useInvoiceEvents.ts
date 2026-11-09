// src/features/invoices-new/hooks/useInvoiceEvents.ts
// ============================================================================
// Activity de un invoice: se lee una vez al abrir la pestaña (lectura única,
// más reciente primero). Volver a abrir la pestaña la lee de nuevo.
// ============================================================================
import { useEffect, useState } from 'react';
import type { InvoiceEvent } from '../../../types/index';
import { invoicesService } from '../../../services/invoicesService';

interface InvoiceEventsResult {
  events: InvoiceEvent[];
  isLoading: boolean;
  hasError: boolean;
}

export function useInvoiceEvents(invoiceId: string): InvoiceEventsResult {
  const [result, setResult] = useState<{ invoiceId: string; events: InvoiceEvent[]; hasError: boolean } | null>(null);

  useEffect(() => {
    let isCurrent = true;
    const loadEvents = async () => {
      try {
        const events = await invoicesService.getEvents(invoiceId);
        if (isCurrent) setResult({ invoiceId, events, hasError: false });
      } catch (error) {
        console.error('Could not load the invoice activity:', error);
        if (isCurrent) setResult({ invoiceId, events: [], hasError: true });
      }
    };
    loadEvents();
    return () => {
      isCurrent = false;
    };
  }, [invoiceId]);

  const isCurrentInvoice = result?.invoiceId === invoiceId;
  return {
    events: isCurrentInvoice ? result.events : [],
    isLoading: !isCurrentInvoice,
    hasError: isCurrentInvoice && result.hasError,
  };
}
