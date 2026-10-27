// src/utils/jobFinancials.ts
// ⭐ Finanzas por trabajo. Las usan Invoices, el Overview, Owner/Manager,
//    Payroll, el Clients Report y el Excel del Pipeline, así que todos dan la
//    misma cifra. Por cada servicio cobrado (billing_services), con lo que
//    guarda el servicio (decisión de Omar, CR del PR #25, 10/2026):
//      Service Price = subtotal SIN impuesto (o cantidad × precio)
//      Impuesto      = subtotal × su taxPercentage; se SUMA con Apply Tax Yes
//                      + Minus Tax No, se RESTA con No + Yes y no se toca con
//                      No/No o Yes/Yes (getServiceTaxSign: lo mismo que
//                      muestra el detalle de la casa)
//    Por trabajo:
//      Taxes         = impuesto sumado + restado (0 si la casa está exenta)
//      Final Cost    = Service Price + sumado − restado
//      Profit        = Final Cost sin el impuesto sumado − Payroll (ese
//                      impuesto es del estado, no ganancia)
//      Margin        = Profit / Final Cost
//    ⭐ Antes: Price = `total` del servicio (que YA trae el impuesto) y Final
//       Cost = Price − 8.25% siempre. CAMBIAN las cifras de todos los meses
//       (ver code-notes.md, "Finanzas por trabajo").

import { useMemo } from 'react';
import type { BilledServiceAmounts, Property, PayrollRecord } from '../types/index';
import { useLiveCollection } from '../shared/data/liveCollections';

/** Impuesto de venta de Texas ($200 → $16.50 · $425 → $35.06). Lo usa un
 *  servicio que no guarda su taxPercentage. */
export const TAX_RATE = 0.0825;

/** Redondea a centavos: 28.875 → 28.88. También lo usa el Clients Report. */
export const roundToCents = (amount: number) => Math.round(amount * 100) / 100;

/** Diferencia menor a un centavo: redondeos de la hoja o de la app. */
const AMOUNT_TOLERANCE = 0.01;

/** ¿Dos montos son el mismo (salvo redondeo)? false si falta alguno. Lo usan
 *  la comparación y la exportación del Excel (features/houses/operationsSheet*). */
export const isSameAmount = (amountA: number | null, amountB: number | null): boolean =>
  amountA !== null && amountB !== null && Math.abs(amountA - amountB) < AMOUNT_TOLERANCE;
// Un solo formateador: toLocaleString crea uno nuevo en cada llamada y el
// Overview en Year formatea miles de montos.
const MONEY = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (amount: number) => `$${MONEY.format(amount)}`;
export const pct = (percent: number | null) => (percent === null ? '—' : `${percent.toFixed(1)}%`);

/**
 * Qué hace un servicio cobrado con su impuesto, con la regla "Total Minus Tax"
 * de AppSheet (la que muestra el detalle de la casa): Apply Tax Yes + Minus Tax
 * No lo suma (1), Apply Tax No + Minus Tax Yes lo resta (−1) y cualquier otra
 * combinación no lo toca (0).
 */
export const getServiceTaxSign = (applyTax: unknown, minusTax: unknown): 1 | -1 | 0 => {
  if (applyTax === 'Yes' && minusTax === 'No') return 1;
  if (applyTax === 'No' && minusTax === 'Yes') return -1;
  return 0;
};

/** Número de un campo guardado: número, o texto numérico ("100"); null si no hay. */
const parseAmount = (value: unknown): number | null => {
  const amount = typeof value === 'number' ? value : Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(amount) ? amount : null;
};

/**
 * Precio del servicio SIN impuesto: el subtotal guardado o cantidad × precio.
 * Un subtotal en 0 con cantidad × precio mayor no cuenta (registros
 * importados). Sin ninguno de los dos: su total (no se puede separar el
 * impuesto).
 */
export const getBilledServiceBasePrice = (billedService: BilledServiceAmounts): number => {
  const subtotal = parseAmount(billedService.subtotal);
  const quantity = parseAmount(billedService.quantity);
  const unitPrice = parseAmount(billedService.price);
  const quantityTimesPrice = quantity !== null && unitPrice !== null ? quantity * unitPrice : null;
  if (subtotal !== null && (subtotal !== 0 || !quantityTimesPrice)) return subtotal;
  return quantityTimesPrice ?? parseAmount(billedService.total) ?? 0;
};

/** ¿El servicio guarda su precio sin impuesto (subtotal o cantidad × precio)? */
const hasPriceWithoutTax = (billedService: BilledServiceAmounts): boolean =>
  parseAmount(billedService.subtotal) !== null
  || (parseAmount(billedService.quantity) !== null && parseAmount(billedService.price) !== null);

/**
 * Impuesto de un servicio con su signo: + se suma al Final Cost, − se resta, 0
 * no aplica. Registros sin Apply Tax / Minus Tax toman los valores por defecto
 * del formulario (Yes / No); sin taxPercentage, el 8.25%. Un registro viejo que
 * solo trae su `total` no lleva impuesto aparte: ese total ya es el final.
 */
const getBilledServiceSignedTax = (billedService: BilledServiceAmounts, basePrice: number): number => {
  if (!hasPriceWithoutTax(billedService)) return 0;
  const taxSign = getServiceTaxSign(billedService.applyTax ?? 'Yes', billedService.minusTax ?? 'No');
  const taxPercentage = parseAmount(billedService.taxPercentage) ?? TAX_RATE * 100;
  return taxSign * basePrice * (taxPercentage / 100);
};

export interface JobFinancials {
  servicePrice: number;
  taxes: number;
  finalCost: number;
  payroll: number;
  profit: number;
  /** Profit / Final Cost en %. null si Final Cost = 0. */
  margin: number | null;
}

const marginOf = (profit: number, finalCost: number): number | null =>
  finalCost > 0 ? (profit / finalCost) * 100 : null;

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
    // price = suma sin impuesto · addedTax / subtractedTax = impuesto que se
    // suma o se resta (en positivo).
    const emptyAmounts = () => ({ price: 0, addedTax: 0, subtractedTax: 0, payroll: 0 });
    const amountsMap = new Map<string, ReturnType<typeof emptyAmounts>>();
    services.forEach((billedService) => {
      if (!billedService.propertyId) return;
      const propertyAmounts = amountsMap.get(billedService.propertyId) ?? emptyAmounts();
      const basePrice = getBilledServiceBasePrice(billedService);
      const signedTax = getBilledServiceSignedTax(billedService, basePrice);
      propertyAmounts.price += basePrice;
      if (signedTax > 0) propertyAmounts.addedTax += signedTax;
      else propertyAmounts.subtractedTax -= signedTax;
      amountsMap.set(billedService.propertyId, propertyAmounts);
    });
    payrolls.forEach((payrollRecord) => {
      if (!payrollRecord.propertyId) return;
      const propertyAmounts = amountsMap.get(payrollRecord.propertyId) ?? emptyAmounts();
      propertyAmounts.payroll += getPayrollTotal(payrollRecord);
      amountsMap.set(payrollRecord.propertyId, propertyAmounts);
    });
    return amountsMap;
  }, [services, payrolls]);

  const calc = useMemo(
    () =>
      (prop: Property): JobFinancials => {
        const propertyAmounts = amountsByPropertyId.get(prop.id);
        const servicePrice = roundToCents(propertyAmounts?.price ?? 0);
        const payroll = roundToCents(propertyAmounts?.payroll ?? 0);
        const addedTax = prop.taxExempt ? 0 : propertyAmounts?.addedTax ?? 0;
        const subtractedTax = prop.taxExempt ? 0 : propertyAmounts?.subtractedTax ?? 0;
        const taxes = roundToCents(addedTax + subtractedTax);
        const finalCost = roundToCents(servicePrice + addedTax - subtractedTax);
        // Lo que queda para la empresa: el impuesto sumado es del estado.
        const netRevenue = roundToCents(servicePrice - subtractedTax);
        const profit = roundToCents(netRevenue - payroll);
        return { servicePrice, taxes, finalCost, payroll, profit, margin: marginOf(profit, finalCost) };
      },
    [amountsByPropertyId],
  );

  const sum = useMemo(
    () =>
      (list: Property[]): JobFinancials => {
        const totals = { servicePrice: 0, taxes: 0, finalCost: 0, payroll: 0, profit: 0 };
        list.forEach((job) => {
          const jobFinancials = calc(job);
          totals.servicePrice += jobFinancials.servicePrice;
          totals.taxes += jobFinancials.taxes;
          totals.finalCost += jobFinancials.finalCost;
          totals.payroll += jobFinancials.payroll;
          totals.profit += jobFinancials.profit;
        });
        return { ...totals, margin: marginOf(totals.profit, totals.finalCost) };
      },
    [calc],
  );

  return { loading: !servicesLive.loaded || !payrollLive.loaded, calc, sum, version: amountsByPropertyId };
}
