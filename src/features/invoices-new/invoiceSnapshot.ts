// src/features/invoices-new/invoiceSnapshot.ts
// ============================================================================
// Lo que el invoice COPIA del job (casa de `properties`) y de su cliente al
// crearse, y los montos con que se prellena el formulario. El usuario elige
// el job; el cliente sale del job (no hay selector de cliente).
// ============================================================================
import type {
  BilledServiceAmounts, Customer, InvoiceClientSnapshot, InvoiceJobAmounts, InvoiceJobSnapshot, InvoicePhotoItem,
  Property, Service,
} from '../../types/index';
import { findCustomer } from '../../utils/customerDocs';
import { getJobFinancials } from '../../utils/jobFinancials';
import { getBilledServiceAmounts, getServiceTaxSign } from '../../shared/utils/billedServiceAmounts';
import { computeTotals, percentToBps, toCents } from './invoiceMath';

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

/** Todas las fotos del job (Before y After) para el modo "All job photos".
 *  La galería para elegir solo algunas llega en la etapa de fotos. */
export const buildAllJobPhotoItems = (property: Property): InvoicePhotoItem[] => [
  ...(property.beforePhotos ?? []).map((url, order) => ({ url, category: 'before' as const, order })),
  ...(property.afterPhotos ?? []).map((url, order) => ({ url, category: 'after' as const, order })),
];

interface InvoiceDefaultsInput {
  property: Property;
  /** Servicios cobrados del job (billing_services con su propertyId). */
  billedServices: BilledServiceAmounts[];
  /** Cliente del job (findCustomer), para saber si factura con impuesto. */
  customer: Customer | null;
  /** Tasa del catálogo de impuestos (settings_tax) para un job sin servicios. */
  defaultTaxPercentage: number;
}

/** Montos con que abre el formulario y lo que decía el job al emitir. */
export interface InvoiceDefaults {
  subtotalCents: number;
  taxRateBps: number;
  jobAmountsAtIssue: InvoiceJobAmounts;
  /** ¿subtotal + impuesto da exactamente el Final Cost del job? Si no (tasas
   *  mezcladas entre servicios), el formulario avisa para revisar el monto. */
  matchesJobFinalCost: boolean;
}

/** Tasa de un servicio que SUMA impuesto (Apply Tax Yes / Minus Tax No), en
 *  puntos base. null si ninguno lo suma. */
const getAddedTaxRateBps = (billedServices: BilledServiceAmounts[]): number | null => {
  const taxedService = billedServices.find(
    (billedService) => getServiceTaxSign(billedService.applyTax, billedService.minusTax) === 1,
  );
  if (!taxedService) return null;
  const { basePrice, signedTax } = getBilledServiceAmounts(taxedService);
  return basePrice > 0 ? percentToBps((signedTax / basePrice) * 100) : null;
};

/**
 * Prellena el formulario con las finanzas del job (utils/jobFinancials.ts,
 * decisión del usuario: editables):
 *  - Sin servicios cobrados: subtotal 0 y la tasa del catálogo, o 0 si el job
 *    es exento o el cliente no factura con impuesto.
 *  - Con algún servicio que RESTA el impuesto (Minus Tax): el invoice no puede
 *    restar impuesto, así que subtotal = Final Cost del job y tasa 0.
 *  - Si no: subtotal = Service Price y la tasa del servicio que suma impuesto
 *    (0 si ninguno lo suma o el job es exento).
 */
export const getInvoiceDefaults = ({
  property, billedServices, customer, defaultTaxPercentage,
}: InvoiceDefaultsInput): InvoiceDefaults => {
  const jobFinancials = getJobFinancials(property, billedServices, []);
  const jobAmountsAtIssue: InvoiceJobAmounts = {
    servicePriceCents: toCents(jobFinancials.servicePrice),
    taxesCents: toCents(jobFinancials.taxes),
    finalCostCents: toCents(jobFinancials.finalCost),
  };

  if (billedServices.length === 0) {
    const isTaxFree = !!property.taxExempt || customer?.applyTax === 'No';
    const taxRateBps = isTaxFree ? 0 : percentToBps(defaultTaxPercentage);
    return { subtotalCents: 0, taxRateBps, jobAmountsAtIssue, matchesJobFinalCost: false };
  }

  const hasSubtractedTax = billedServices.some(
    (billedService) => getServiceTaxSign(billedService.applyTax, billedService.minusTax) === -1,
  );
  const subtotalCents = hasSubtractedTax ? jobAmountsAtIssue.finalCostCents : jobAmountsAtIssue.servicePriceCents;
  const addedTaxRateBps = hasSubtractedTax || property.taxExempt ? null : getAddedTaxRateBps(billedServices);
  const taxRateBps = addedTaxRateBps ?? 0;
  const { totalCents } = computeTotals(subtotalCents, taxRateBps);
  return {
    subtotalCents,
    taxRateBps,
    jobAmountsAtIssue,
    matchesJobFinalCost: totalCents === jobAmountsAtIssue.finalCostCents,
  };
};
