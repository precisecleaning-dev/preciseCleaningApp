// src/features/invoices-new/hooks/useLiveInvoice.ts
// ============================================================================
// El invoice de un diálogo abierto, siempre en vivo. Normalmente sale de las
// listas que ya se escuchan (la ventana de la página o la cuenta del cliente):
// `listedInvoice`. Si sale de ellas con el diálogo abierto (p. ej. un invoice
// sin pagar de hace más de 12 meses que se paga: deja la consulta de "sin
// pagar" y no entra en la de los últimos 12 meses), se escucha SU documento
// para que el diálogo no se cierre solo. Mientras llega esa primera respuesta
// se muestra la última versión que hubo en la lista DESDE QUE SE ABRIÓ (al
// cerrar se olvida: reabrirlo nunca muestra la copia de una apertura anterior).
// ============================================================================
import { useEffect, useState } from 'react';
import type { Invoice } from '../../../types/index';
import { invoicesService } from '../../../services/invoicesService';

/** Respuesta del listener del documento (`invoice` null = ya no existe). */
interface DocumentInvoice {
  invoiceId: string;
  invoice: Invoice | null;
}

export function useLiveInvoice(invoiceId: string | null, listedInvoice: Invoice | null): Invoice | null {
  const [trackedInvoiceId, setTrackedInvoiceId] = useState<string | null>(invoiceId);
  const [lastListedInvoice, setLastListedInvoice] = useState<Invoice | null>(listedInvoice);
  const [documentInvoice, setDocumentInvoice] = useState<DocumentInvoice | null>(null);
  const isListed = listedInvoice !== null;

  // Última versión de la lista de ESTA apertura (estado derivado de las props, en el
  // render): al cambiar de invoice o cerrar el diálogo, se empieza de nuevo.
  if (invoiceId !== trackedInvoiceId) {
    setTrackedInvoiceId(invoiceId);
    setLastListedInvoice(listedInvoice);
  } else if (listedInvoice && listedInvoice !== lastListedInvoice) {
    setLastListedInvoice(listedInvoice);
  }

  useEffect(() => {
    if (!invoiceId || isListed) return undefined;
    const unsubscribe = invoicesService.subscribeOne(
      invoiceId,
      (invoice) => setDocumentInvoice({ invoiceId, invoice }),
      (error) => console.error('Could not keep the open invoice up to date:', error),
    );
    return () => {
      unsubscribe();
      // Al volver a la lista (o cerrar) se olvida: la próxima vez no se muestra una copia vieja.
      setDocumentInvoice(null);
    };
  }, [invoiceId, isListed]);

  if (!invoiceId) return null;
  if (listedInvoice) return listedInvoice;
  if (documentInvoice?.invoiceId === invoiceId) return documentInvoice.invoice;
  return lastListedInvoice?.id === invoiceId ? lastListedInvoice : null;
}
