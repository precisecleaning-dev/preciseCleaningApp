// src/features/invoices-new/hooks/useInvoiceDialogs.ts
// ============================================================================
// Qué diálogo está abierto en Invoices New y sobre qué invoice. Se guarda el
// ID (no una copia del invoice): el diálogo recibe el invoice EN VIVO de la
// lista o, si es de fuera de la ventana de 12 meses y se abrió desde la cuenta
// del cliente, del listener de esa cuenta (useClientInvoices). Si sale de las
// dos con el diálogo abierto, useLiveInvoice escucha su documento.
// Las acciones en bloque y Delete guardan los ids que había al abrir.
// ============================================================================
import { useMemo, useState } from 'react';
import type { ClientAccountKey, Invoice, Property } from '../../../types/index';
import { getClientAccountKey } from '../clientAccount';
import { useClientInvoices } from './useClientInvoices';
import { useLiveInvoice } from './useLiveInvoice';

/** Formulario abierto: crear (`invoice` null) o editar ese invoice. */
type InvoiceFormTarget = { invoice: Invoice | null } | null;

/** Acción en bloque abierta y los invoices marcados al abrirla. */
export type InvoiceBulkAction = 'markAsPaid' | 'send';

export function useInvoiceDialogs(windowInvoices: readonly Invoice[], properties: readonly Property[]) {
  const [formTarget, setFormTarget] = useState<InvoiceFormTarget>(null);
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);
  const [sendInvoiceId, setSendInvoiceId] = useState<string | null>(null);
  const [deleteInvoiceIds, setDeleteInvoiceIds] = useState<string[] | null>(null);
  const [bulkDialog, setBulkDialog] = useState<{ action: InvoiceBulkAction; invoiceIds: string[] } | null>(null);
  const [clientAccountKey, setClientAccountKey] = useState<ClientAccountKey | null>(null);
  const clientInvoices = useClientInvoices(clientAccountKey);

  // La ventana va después: si un invoice está en los dos, gana el de la lista.
  const invoicesById = useMemo(
    () => new Map([...clientInvoices.invoices, ...windowInvoices].map((invoice) => [invoice.id, invoice])),
    [clientInvoices.invoices, windowInvoices],
  );
  const propertiesById = useMemo(() => new Map(properties.map((property) => [property.id, property])), [properties]);

  const findInvoice = (invoiceId: string | null): Invoice | null => (invoiceId ? invoicesById.get(invoiceId) ?? null : null);
  const formInvoiceId = formTarget?.invoice?.id ?? null;
  const formLiveInvoice = useLiveInvoice(formInvoiceId, findInvoice(formInvoiceId));
  const detailInvoice = useLiveInvoice(detailInvoiceId, findInvoice(detailInvoiceId));
  const paymentInvoice = useLiveInvoice(paymentInvoiceId, findInvoice(paymentInvoiceId));
  const previewInvoice = useLiveInvoice(previewInvoiceId, findInvoice(previewInvoiceId));
  const sendInvoice = useLiveInvoice(sendInvoiceId, findInvoice(sendInvoiceId));
  const findInvoices = (invoiceIds: string[]): Invoice[] => invoiceIds.flatMap((invoiceId) => invoicesById.get(invoiceId) ?? []);
  const toIds = (invoices: Invoice[]) => invoices.map((invoice) => invoice.id);

  return {
    formTarget,
    /** Al editar: el invoice del formulario en vivo (para avisar si otra persona lo cambia). */
    formLiveInvoice,
    detailInvoiceId,
    detailInvoice,
    paymentInvoice,
    previewInvoice,
    sendInvoice,
    /** null = Delete cerrado. */
    invoicesToDelete: deleteInvoiceIds ? findInvoices(deleteInvoiceIds) : null,
    bulkDialog: bulkDialog ? { action: bulkDialog.action, invoices: findInvoices(bulkDialog.invoiceIds) } : null,
    clientAccountKey,
    clientInvoices,
    /** Casa del job de un invoice (null si no está en la ventana de 12 meses). */
    findJobProperty: (invoice: Invoice): Property | null => propertiesById.get(invoice.propertyId) ?? null,

    openCreate: () => setFormTarget({ invoice: null }),
    openEdit: (invoice: Invoice) => setFormTarget({ invoice }),
    closeForm: () => setFormTarget(null),
    openDetail: (invoiceId: string) => setDetailInvoiceId(invoiceId),
    closeDetail: () => setDetailInvoiceId(null),
    openPayment: (invoice: Invoice) => setPaymentInvoiceId(invoice.id),
    closePayment: () => setPaymentInvoiceId(null),
    openPreview: (invoice: Invoice) => setPreviewInvoiceId(invoice.id),
    closePreview: () => setPreviewInvoiceId(null),
    openSend: (invoice: Invoice) => setSendInvoiceId(invoice.id),
    closeSend: () => setSendInvoiceId(null),
    openDelete: (invoices: Invoice[]) => setDeleteInvoiceIds(toIds(invoices)),
    closeDelete: () => setDeleteInvoiceIds(null),
    openBulk: (action: InvoiceBulkAction, invoices: Invoice[]) => setBulkDialog({ action, invoiceIds: toIds(invoices) }),
    closeBulk: () => setBulkDialog(null),
    // La cuenta va DEBAJO del detalle: si se abre desde el detalle, el detalle
    // se cierra (al tocar un invoice de la cuenta, su detalle se abre encima).
    openClientAccount: (invoice: Invoice) => {
      setDetailInvoiceId(null);
      setClientAccountKey(getClientAccountKey(invoice));
    },
    closeClientAccount: () => setClientAccountKey(null),
  };
}

export type InvoiceDialogsController = ReturnType<typeof useInvoiceDialogs>;
