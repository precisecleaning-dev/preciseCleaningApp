// src/features/invoices-new/hooks/useBulkRun.ts
// ============================================================================
// Lo que comparten Mark as Paid, Send invoice y Delete en bloque:
//   · los invoices se CONGELAN al abrir el diálogo (`frozenInvoices`): los
//     marcados salen de la página cuando cambian de estado, y el diálogo no
//     debe cambiar sus conteos ni mostrar errores falsos a medio camino;
//   · el avance ("Sending 3 of 5…"), el error si algo falla fuera de lo
//     esperado y el resultado final;
//   · cerrar con resultado: si ya terminó, cerrar avisa a la vista (onFinished).
// ============================================================================
import { useState } from 'react';
import type { Invoice, InvoiceBulkIssue, InvoiceBulkResult } from '../../../types/index';
import type { BulkProgressHandler } from '../services/invoiceBulkService';

interface BulkProgress {
  doneCount: number;
  totalCount: number;
}

/** Texto del botón mientras corre: "Sending 3 of 5…" (el que se está haciendo). */
export const getBulkProgressLabel = (verb: string, progress: BulkProgress): string =>
  `${verb} ${Math.min(progress.doneCount + 1, progress.totalCount)} of ${progress.totalCount}…`;

interface BulkRunOptions {
  onClose: () => void;
  onFinished: (result: InvoiceBulkResult) => void;
}

export function useBulkRun(invoices: Invoice[], { onClose, onFinished }: BulkRunOptions) {
  const [frozenInvoices] = useState(invoices);
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [result, setResult] = useState<InvoiceBulkResult | null>(null);
  const [runError, setRunError] = useState('');

  /**
   * Corre la acción con `totalCount` pasos. `skipped` = los que se saltaron
   * antes de empezar (se suman al resultado). Devuelve el resultado, o null si
   * algo falló fuera de lo esperado (queda en `runError`).
   */
  const run = async (
    totalCount: number,
    task: (onProgress: BulkProgressHandler) => Promise<InvoiceBulkResult>,
    { skipped, errorMessage }: { skipped: InvoiceBulkIssue[]; errorMessage: string },
  ): Promise<InvoiceBulkResult | null> => {
    setRunError('');
    setProgress({ doneCount: 0, totalCount });
    try {
      const runResult = await task((doneCount, stepCount) => setProgress({ doneCount, totalCount: stepCount }));
      return { ...runResult, skipped: [...skipped, ...runResult.skipped] };
    } catch (error) {
      console.error(errorMessage, error);
      setRunError(errorMessage);
      return null;
    } finally {
      setProgress(null);
    }
  };

  const handleClose = () => {
    if (result) onFinished(result);
    else onClose();
  };

  return {
    frozenInvoices,
    progress,
    isRunning: progress !== null,
    result,
    showResult: setResult,
    runError,
    setRunError,
    run,
    handleClose,
  };
}
