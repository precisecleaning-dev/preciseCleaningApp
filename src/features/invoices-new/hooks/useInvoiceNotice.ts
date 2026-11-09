// src/features/invoices-new/hooks/useInvoiceNotice.ts
// ============================================================================
// Aviso de la página de Invoices New. Cada aviso lleva el id del pedido que lo
// mostró: una acción larga ("Preparing the PDF…") actualiza SU aviso solo si
// no se pidió otro después, así un resultado viejo no pisa uno más nuevo.
// ============================================================================
import { useCallback, useRef, useState } from 'react';
import type { InvoiceNotice, InvoiceNoticeAction, InvoiceNoticeTone } from '../../../types/index';

export function useInvoiceNotice() {
  const [notice, setNotice] = useState<InvoiceNotice | null>(null);
  const lastNoticeIdRef = useRef(0);

  /** Muestra un aviso y devuelve su id (para actualizarlo al terminar). */
  const showNotice = useCallback((message: string, tone: InvoiceNoticeTone, action?: InvoiceNoticeAction): number => {
    lastNoticeIdRef.current += 1;
    const noticeId = lastNoticeIdRef.current;
    setNotice({ id: noticeId, message, tone, action });
    return noticeId;
  }, []);

  /** Cambia el aviso `noticeId`, si después no se pidió otro. */
  const updateNotice = useCallback((
    noticeId: number, message: string, tone: InvoiceNoticeTone, action?: InvoiceNoticeAction,
  ): void => {
    if (lastNoticeIdRef.current !== noticeId) return;
    setNotice({ id: noticeId, message, tone, action });
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  return { notice, showNotice, updateNotice, dismissNotice };
}

export type InvoiceNoticeController = ReturnType<typeof useInvoiceNotice>;
