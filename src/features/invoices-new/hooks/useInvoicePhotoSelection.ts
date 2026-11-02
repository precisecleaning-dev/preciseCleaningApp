// src/features/invoices-new/hooks/useInvoicePhotoSelection.ts
// ============================================================================
// Fotos elegidas de un invoice (invoices/{id}/photos/selection), en vivo
// mientras se usa. Con `invoiceId` null (crear) no escucha nada.
// ============================================================================
import { useEffect, useState } from 'react';
import type { InvoicePhotoSelection } from '../../../types/index';
import { invoicesService } from '../../../services/invoicesService';

interface InvoicePhotoSelectionResult {
  selection: InvoicePhotoSelection | null;
  isLoading: boolean;
  hasError: boolean;
}

export function useInvoicePhotoSelection(invoiceId: string | null): InvoicePhotoSelectionResult {
  const [result, setResult] = useState<{ invoiceId: string; selection: InvoicePhotoSelection | null; hasError: boolean } | null>(null);

  useEffect(() => {
    if (!invoiceId) return;
    return invoicesService.subscribePhotoSelection(
      invoiceId,
      (selection) => setResult({ invoiceId, selection, hasError: false }),
      (error) => {
        console.error('Could not load the invoice photos:', error);
        setResult({ invoiceId, selection: null, hasError: true });
      },
    );
  }, [invoiceId]);

  const isCurrentInvoice = !!invoiceId && result?.invoiceId === invoiceId;
  return {
    selection: isCurrentInvoice ? result.selection : null,
    isLoading: !!invoiceId && !isCurrentInvoice,
    hasError: isCurrentInvoice && result.hasError,
  };
}
