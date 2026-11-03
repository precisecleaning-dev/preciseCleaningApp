// src/features/invoices-new/invoiceSnapshot.ts
// ============================================================================
// Lo que el invoice COPIA del job (casa de `properties`) y de su cliente al
// crearse: cliente, job y sus servicios cobrados (billing_services) como
// líneas. El usuario elige el job; el cliente y los montos salen del job (no
// hay selector de cliente ni monto escrito a mano, decisión de Omar 11/2026).
// ============================================================================
import type {
  Customer, InvoiceClientSnapshot, InvoiceJobAmounts, InvoiceJobSnapshot, InvoiceLineItem, InvoiceLineTaxMode,
  InvoicePhotoItem, Property, ServiceRecord, Service,
} from '../../types/index';
import { findCustomer } from '../../utils/customerDocs';
import { getJobFinancials } from '../../utils/jobFinancials';
import { getBilledServiceAmounts } from '../../shared/utils/billedServiceAmounts';
import { computeTax, percentToBps, toCents } from './invoiceMath';

/** Datos del cliente del job, copiados tal como están hoy. */
export const buildClientSnapshot = (property: Property, customers: Customer[]): InvoiceClientSnapshot => {
  const customer = findCustomer(customers, property.client);
  return {
    customerId: customer?.id ?? null,
    clientRef: property.client ?? '',
    name: customer?.name ?? property.client ?? '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
    address: customer?.address ?? '',
    cityStateZip: customer?.cityStateZip ?? '',
  };
};

/** Datos del job, copiados tal como están hoy. */
export const buildJobSnapshot = (property: Property, services: Service[]): InvoiceJobSnapshot => ({
  propertyId: property.id,
  address: property.address ?? '',
  unit: property.unit ?? '',
  city: property.city ?? '',
  serviceDate: property.scheduleDate ?? '',
  serviceId: property.serviceId ?? '',
  serviceName: services.find((service) => service.id === property.serviceId)?.name ?? '',
});

/** Todas las fotos del job (Before y After): el modo "All job photos" y la
 *  galería de "Selected photos" (JobPhotoPickerModal). */
export const buildAllJobPhotoItems = (property: Property): InvoicePhotoItem[] => [
  ...(property.beforePhotos ?? []).map((url, order) => ({ url, category: 'before' as const, order })),
  ...(property.afterPhotos ?? []).map((url, order) => ({ url, category: 'after' as const, order })),
];

/** Catálogo donde se busca el nombre de un servicio cobrado ({ id, name }). */
interface NamedCatalogItem {
  id: string;
  name: string;
}

/** Nombre del servicio: primero en settings_products y después en
 *  settings_services, como getServiceName de useHouseCatalogs. */
const findServiceName = (serviceId: string, catalogs: readonly (readonly NamedCatalogItem[])[]): string => {
  const normalizedId = serviceId.toLowerCase().trim();
  if (!normalizedId) return '';
  const isSameItem = (item: NamedCatalogItem) =>
    String(item.id).toLowerCase().trim() === normalizedId || String(item.name).toLowerCase().trim() === normalizedId;
  for (const catalog of catalogs) {
    const foundItem = catalog.find(isSameItem);
    if (foundItem) return foundItem.name;
  }
  return '';
};

const toNumberOr = (value: unknown, fallback: number): number => {
  const parsedNumber = typeof value === 'number' ? value : Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(parsedNumber) ? parsedNumber : fallback;
};

/** Orden de las líneas: como se agregaron en el job (createdAt) y, sin fecha, por id. */
const compareBilledServices = (serviceA: ServiceRecord, serviceB: ServiceRecord): number =>
  String(serviceA.createdAt ?? '').localeCompare(String(serviceB.createdAt ?? ''))
  || String(serviceA.id ?? '').localeCompare(String(serviceB.id ?? ''));

/**
 * Un servicio cobrado del job como línea del invoice, con las MISMAS reglas
 * que las finanzas del job (getBilledServiceAmounts, utils/jobFinancials.ts):
 *  - added (Apply Tax Yes + Minus Tax No): monto = precio sin impuesto; el
 *    impuesto se suma aparte.
 *  - subtracted (No + Yes): monto = precio − impuesto; no se suma impuesto.
 *  - none (otra combinación, registro viejo con solo `total`, o casa exenta):
 *    monto = precio.
 * Sin fees, la suma de las líneas da el Final Cost del job.
 */
const toLineItem = (billedService: ServiceRecord, isTaxExempt: boolean, serviceName: string): InvoiceLineItem => {
  const { basePrice, signedTax } = getBilledServiceAmounts(billedService);
  const baseCents = toCents(basePrice);
  const taxMode: InvoiceLineTaxMode = isTaxExempt || signedTax === 0 ? 'none' : signedTax > 0 ? 'added' : 'subtracted';
  const taxRateBps = taxMode === 'none' || basePrice === 0 ? 0 : percentToBps((Math.abs(signedTax) / basePrice) * 100);
  const lineTaxCents = computeTax(baseCents, taxRateBps);
  const quantity = toNumberOr(billedService.quantity, 1);
  return {
    billingServiceId: billedService.id ?? '',
    serviceId: billedService.serviceId ?? '',
    serviceName,
    notes: String(billedService.notes ?? '').trim(),
    quantity,
    unitPriceCents: toCents(toNumberOr(billedService.price, quantity > 0 ? basePrice / quantity : basePrice)),
    amountCents: taxMode === 'subtracted' ? baseCents - lineTaxCents : baseCents,
    taxMode,
    taxRateBps,
    taxCents: taxMode === 'added' ? lineTaxCents : 0,
  };
};

/** Líneas del invoice con los servicios cobrados del job (billing_services). */
export const buildInvoiceLineItems = (
  property: Property,
  billedServices: readonly ServiceRecord[],
  catalogs: readonly (readonly NamedCatalogItem[])[],
): InvoiceLineItem[] =>
  [...billedServices]
    .sort(compareBilledServices)
    .map((billedService) => toLineItem(
      billedService,
      !!property.taxExempt,
      findServiceName(billedService.serviceId ?? '', catalogs) || 'Service',
    ));

/** ¿Las líneas son las mismas? (para avisar que los servicios del job cambiaron). */
export const areSameLineItems = (lineItemsA: readonly InvoiceLineItem[], lineItemsB: readonly InvoiceLineItem[]): boolean =>
  lineItemsA.length === lineItemsB.length
  && lineItemsA.every((lineItemA, lineIndex) => {
    const lineItemB = lineItemsB[lineIndex];
    return lineItemA.billingServiceId === lineItemB.billingServiceId
      && lineItemA.serviceName === lineItemB.serviceName
      && lineItemA.notes === lineItemB.notes
      && lineItemA.quantity === lineItemB.quantity
      && lineItemA.unitPriceCents === lineItemB.unitPriceCents
      && lineItemA.amountCents === lineItemB.amountCents
      && lineItemA.taxMode === lineItemB.taxMode
      && lineItemA.taxRateBps === lineItemB.taxRateBps
      && lineItemA.taxCents === lineItemB.taxCents;
  });

/** Montos que tenía el job al emitir (auditoría: jobAmountsAtIssue). */
export const getJobAmountsAtIssue = (property: Property, billedServices: ServiceRecord[]): InvoiceJobAmounts => {
  const jobFinancials = getJobFinancials(property, billedServices, []);
  return {
    servicePriceCents: toCents(jobFinancials.servicePrice),
    taxesCents: toCents(jobFinancials.taxes),
    finalCostCents: toCents(jobFinancials.finalCost),
  };
};
