// src/utils/jobFinancials.ts
// ⭐ Finanzas por trabajo. Las usan Invoices, el Overview, Owner/Manager,
//    Payroll, el Clients Report, el Excel del Pipeline y el tab Financials del
//    detalle de la casa, así que todos dan la misma cifra. Por cada servicio
//    cobrado (billing_services), con lo que guarda el servicio (decisión de
//    Omar, CR del PR #25, 10/2026; reglas en shared/utils/billedServiceAmounts.ts):
//      Service Price = subtotal SIN impuesto (o cantidad × precio)
//      Impuesto      = subtotal × su taxPercentage; se SUMA con Apply Tax Yes
//                      + Minus Tax No, se RESTA con No + Yes y no se toca con
//                      No/No o Yes/Yes
//    Por trabajo:
//      Taxes         = impuesto sumado + restado (0 si la casa está exenta)
//      Final Cost    = Service Price + sumado − restado
//      Net Revenue   = Final Cost sin el impuesto sumado (ese impuesto es del
//                      estado, no ingreso de la empresa)
//      Profit        = Net Revenue − Payroll
//      Margin        = Profit / Net Revenue
//    ⭐ Antes: Price = `total` del servicio (que YA trae el impuesto) y Final
//       Cost = Price − 8.25% siempre. CAMBIAN las cifras de todos los meses
//       (ver code-notes.md, "Finanzas por trabajo").

import { useMemo } from 'react';
import type { BilledServiceAmounts, Property, PayrollRecord } from '../types/index';
import { useLiveCollection } from '../shared/data/liveCollections';
import { getBilledServiceAmounts } from '../shared/utils/billedServiceAmounts';

/** Redondea a centavos: 28.875 → 28.88. También lo usa el Clients Report. */
export const roundToCents = (amount: number) => Math.round(amount * 100) / 100;
// Un solo formateador: toLocaleString crea uno nuevo en cada llamada y el
// Overview en Year formatea miles de montos.
const MONEY = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (amount: number) => `$${MONEY.format(amount)}`;
export const pct = (percent: number | null) => (percent === null ? '—' : `${percent.toFixed(1)}%`);

export interface JobFinancials {
  servicePrice: number;
  taxes: number;
  finalCost: number;
  /** Final Cost sin el impuesto sumado: lo que le queda a la empresa antes de Payroll. */
  netRevenue: number;
  payroll: number;
  profit: number;
  /** Profit / Net Revenue en %. null si Net Revenue = 0. */
  margin: number | null;
}

const marginOf = (profit: number, netRevenue: number): number | null =>
  netRevenue > 0 ? (profit / netRevenue) * 100 : null;

/** Tono del margen, umbrales del diseño: ≥45% verde · ≥35% ámbar · menos rojo. */
export type Tone = 'good' | 'warn' | 'bad' | 'none';
export const marginTone = (margin: number | null): Tone =>
  margin === null ? 'none' : margin >= 45 ? 'good' : margin >= 35 ? 'warn' : 'bad';

// ⭐ Los documentos de `payroll` NO guardan `totalAmount`, solo base / extra /
//    descuento. Si existiera totalAmount guardado y distinto de 0, se respeta.
export const getPayrollTotal = (payrollRecord?: Partial<PayrollRecord> | null): number => {
  if (!payrollRecord) return 0;
  if (payrollRecord.totalAmount != null && Number(payrollRecord.totalAmount) !== 0) return Number(payrollRecord.totalAmount);
  return Number(payrollRecord.baseAmount || 0) + Number(payrollRecord.extraAmount || 0)
    - Number(payrollRecord.discountAmount || 0);
};

/** Montos de una casa antes de redondear: price = suma sin impuesto ·
 *  addedTax / subtractedTax = impuesto que se suma o se resta (en positivo). */
interface JobAmounts {
  price: number;
  addedTax: number;
  subtractedTax: number;
  payroll: number;
}

const createEmptyAmounts = (): JobAmounts => ({ price: 0, addedTax: 0, subtractedTax: 0, payroll: 0 });

const addBilledService = (jobAmounts: JobAmounts, billedService: BilledServiceAmounts) => {
  const { basePrice, signedTax } = getBilledServiceAmounts(billedService);
  jobAmounts.price += basePrice;
  if (signedTax > 0) jobAmounts.addedTax += signedTax;
  else jobAmounts.subtractedTax -= signedTax;
};

const toJobFinancials = (property: Property, jobAmounts?: JobAmounts): JobFinancials => {
  const servicePrice = roundToCents(jobAmounts?.price ?? 0);
  const payroll = roundToCents(jobAmounts?.payroll ?? 0);
  const addedTax = property.taxExempt ? 0 : jobAmounts?.addedTax ?? 0;
  const subtractedTax = property.taxExempt ? 0 : jobAmounts?.subtractedTax ?? 0;
  const taxes = roundToCents(addedTax + subtractedTax);
  const finalCost = roundToCents(servicePrice + addedTax - subtractedTax);
  const netRevenue = roundToCents(servicePrice - subtractedTax);
  const profit = roundToCents(netRevenue - payroll);
  return { servicePrice, taxes, finalCost, netRevenue, payroll, profit, margin: marginOf(profit, netRevenue) };
};

/**
 * Finanzas de UNA casa con sus propios servicios y pagos (el detalle de la
 * casa ya los escucha con useHouseRecords): mismas fórmulas que
 * useJobFinancials sin abrir los listeners de las colecciones completas.
 */
export const getJobFinancials = (
  property: Property,
  billedServices: BilledServiceAmounts[],
  payrollRecords: Partial<PayrollRecord>[],
): JobFinancials => {
  const jobAmounts = createEmptyAmounts();
  billedServices.forEach((billedService) => addBilledService(jobAmounts, billedService));
  payrollRecords.forEach((payrollRecord) => { jobAmounts.payroll += getPayrollTotal(payrollRecord); });
  return toJobFinancials(property, jobAmounts);
};

/**
 * Escucha en tiempo real `billing_services` y `payroll` y devuelve el cálculo
 * por trabajo. Map por casa → O(1) por fila (con ~3,700 casas, filtrar las
 * colecciones completas por cada fila congelaba la vista).
 */
export function useJobFinancials(enabled = true) {
  // ⭐ Datos del store compartido (un listener por colección para toda la app).
  //    Instancias que no muestran finanzas (HousesView en 'modals-only') pasan
  //    enabled = false y no abren nada.
  const servicesLive = useLiveCollection('billingServices', enabled);
  const payrollLive = useLiveCollection('payroll', enabled);
  const services = servicesLive.data;
  const payrolls = payrollLive.data;

  const amountsByPropertyId = useMemo(() => {
    const amountsMap = new Map<string, JobAmounts>();
    services.forEach((billedService) => {
      if (!billedService.propertyId) return;
      const propertyAmounts = amountsMap.get(billedService.propertyId) ?? createEmptyAmounts();
      addBilledService(propertyAmounts, billedService);
      amountsMap.set(billedService.propertyId, propertyAmounts);
    });
    payrolls.forEach((payrollRecord) => {
      if (!payrollRecord.propertyId) return;
      const propertyAmounts = amountsMap.get(payrollRecord.propertyId) ?? createEmptyAmounts();
      propertyAmounts.payroll += getPayrollTotal(payrollRecord);
      amountsMap.set(payrollRecord.propertyId, propertyAmounts);
    });
    return amountsMap;
  }, [services, payrolls]);

  const calc = useMemo(
    () => (property: Property): JobFinancials => toJobFinancials(property, amountsByPropertyId.get(property.id)),
    [amountsByPropertyId],
  );

  const sum = useMemo(
    () =>
      (jobs: Property[]): JobFinancials => {
        const totals = { servicePrice: 0, taxes: 0, finalCost: 0, netRevenue: 0, payroll: 0, profit: 0 };
        jobs.forEach((job) => {
          const jobFinancials = calc(job);
          totals.servicePrice += jobFinancials.servicePrice;
          totals.taxes += jobFinancials.taxes;
          totals.finalCost += jobFinancials.finalCost;
          totals.netRevenue += jobFinancials.netRevenue;
          totals.payroll += jobFinancials.payroll;
          totals.profit += jobFinancials.profit;
        });
        return { ...totals, margin: marginOf(totals.profit, totals.netRevenue) };
      },
    [calc],
  );

  return { loading: !servicesLive.loaded || !payrollLive.loaded, calc, sum, version: amountsByPropertyId };
}
