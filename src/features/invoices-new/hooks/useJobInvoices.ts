// src/features/invoices-new/hooks/useJobInvoices.ts
// ============================================================================
// Invoices que ya tiene el job elegido, para avisar (sin bloquear: un job
// puede tener varios invoices, decisión de Omar). Lectura única por job.
// ============================================================================
import { useEffect, useState } from 'react';
import type { Invoice } from '../../../types/index';
import { invoicesService } from '../../../services/invoicesService';

interface JobInvoicesResult {
  /** Invoices del job, sin el que se está editando. */
  invoices: Invoice[];
  isLoading: boolean;
  hasError: boolean;
}

export function useJobInvoices(propertyId: string, excludedInvoiceId: string | null): JobInvoicesResult {
  const [result, setResult] = useState<{ propertyId: string; invoices: Invoice[]; hasError: boolean } | null>(null);

  useEffect(() => {
    if (!propertyId) return;
    let isCurrent = true;
    const loadJobInvoices = async () => {
      try {
        const jobInvoices = await invoicesService.findByProperty(propertyId);
        if (isCurrent) setResult({ propertyId, invoices: jobInvoices, hasError: false });
      } catch (error) {
        console.error('Could not check the invoices of this job:', error);
        if (isCurrent) setResult({ propertyId, invoices: [], hasError: true });
      }
    };
    loadJobInvoices();
    return () => {
      isCurrent = false;
    };
  }, [propertyId]);

  const isCurrentJob = result?.propertyId === propertyId;
  return {
    invoices: isCurrentJob ? result.invoices.filter((jobInvoice) => jobInvoice.id !== excludedInvoiceId) : [],
    isLoading: !!propertyId && !isCurrentJob,
    hasError: isCurrentJob && result.hasError,
  };
}
