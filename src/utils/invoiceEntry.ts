// src/utils/invoiceEntry.ts
//
// ⭐ "¿Cuándo entró esta casa a la vista Invoices?"
//
// InvoicesView ordena su lista poniendo ARRIBA las casas que entraron más
// recientemente. Ese orden depende de un timestamp (`sentToInvoiceAt`) que hay
// que escribir en CADA punto donde una casa pasa al status "Invoice".
//
// Antes solo QualityCheckView lo escribía, así que las casas movidas a Invoice
// desde Houses, Recalls, No Status o el modal de detalle entraban SIN marca y
// caían al fondo de la lista, ordenadas por Schedule Date. Este módulo centraliza
// las dos piezas (detectar el status destino + estampar la marca) para que todas
// las vistas se comporten igual.

import type { Status } from '../types/index';

// Id legacy de AppSheet para el status "Invoice". Se mantiene porque hay casas
// migradas cuyo statusId es literalmente esta cadena, sin entrada en el catálogo.
export const LEGACY_INVOICE_STATUS_ID = '748aad00';

/**
 * ¿El status indicado es "Invoice"?
 *
 * Resuelve por id o por nombre contra `settings_statuses` (mismo criterio que usa
 * InvoicesView para armar su lista), más el id legacy de AppSheet.
 */
export const isInvoiceStatus = (
    statuses: Status[],
    statusIdOrName?: string | null,
): boolean => {
    const raw = String(statusIdOrName || '').trim();
    if (!raw) return false;
    if (raw === LEGACY_INVOICE_STATUS_ID) return true;

    const match = statuses.find(
        (s) => String(s.id) === raw || String(s.name) === raw,
    );
    const name = String(match?.name || raw).toLowerCase().trim();
    return name === 'invoice';
};

/**
 * Devuelve el payload de actualización con la marca de entrada a Invoices
 * agregada, si el status destino es "Invoice". Si no lo es, devuelve el payload
 * intacto.
 *
 * Uso:
 *   await propertiesService.update(id, stampInvoiceEntry({ statusId: newId }, statuses, newId));
 */
export const stampInvoiceEntry = <T extends Record<string, unknown>>(
    payload: T,
    statuses: Status[],
    targetStatusId?: string | null,
): T & { sentToInvoiceAt?: string } => {
    if (!isInvoiceStatus(statuses, targetStatusId)) return payload;
    return { ...payload, sentToInvoiceAt: new Date().toISOString() };
};

/**
 * Lee la marca de entrada a Invoices de una casa como milisegundos.
 * Devuelve null si la casa no tiene marca o la fecha guardada es inválida.
 */
export const invoiceEntryMs = (prop: {
    sentToInvoiceAt?: string | null;
}): number | null => {
    const iso = prop.sentToInvoiceAt;
    if (!iso) return null;
    const t = new Date(iso).getTime();
    return isNaN(t) ? null : t;
};