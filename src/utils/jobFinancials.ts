// src/utils/jobFinancials.ts
// ⭐ Finanzas por trabajo con las MISMAS fórmulas de la hoja "Operations".
//    Antes vivían dentro de InvoicesView; ahora también las usa el Overview
//    unificado, así que se extrajeron aquí para que ambas vistas den la misma
//    cifra exacta:
//      Service Price = suma de los servicios cobrados SIN impuesto (subtotal =
//                      cantidad × precio de cada billing_service)
//      Taxes         = 8.25% del Service Price (0 si la casa está exenta)
//      Final Cost    = Service Price + Taxes si el servicio tiene Apply Tax =
//                      Yes; Service Price − Taxes si es No (fórmula de la hoja:
//                      IF(Customers "YES", F+G, F−G))
//      Profit        = Final Cost SIN el impuesto que se suma (Apply Tax =
//                      Yes) − Payroll: ese impuesto se cobra para el estado,
//                      no es ganancia (CR del PR #25, decisión de Omar 10/2026;
//                      la hoja de la oficina usa H − I y lo contaba)
//      Margin        = Profit / Final Cost
//    ⭐ Antes el Service Price salía del `total` del servicio, que YA trae el
//       impuesto sumado (Apply Tax = Yes): la app cobraba el 8.25% dos veces y
//       luego lo restaba ($100 → Price $108.25, Final $99.32 en vez de $108.25).
//       Decisión de Omar (10/2026): las fórmulas de la hoja son las correctas.

import { useMemo } from 'react';
import type { BilledServiceAmounts, Property, PayrollRecord } from '../types/index';
import { useLiveCollection } from '../shared/data/liveCollections';

/** Impuesto de venta de Texas ($200 → $16.50 · $425 → $35.06). */
export const TAX_RATE = 0.0825;

/** Redondea a centavos: 28.875 → 28.88. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Diferencia menor a un centavo: redondeos de la hoja o de la app. */
const AMOUNT_TOLERANCE = 0.01;

/** ¿Dos montos son el mismo (salvo redondeo)? false si falta alguno. Lo usan
 *  la comparación y la exportación del Excel (features/houses/operationsSheet*). */
export const isSameAmount = (amountA: number | null, amountB: number | null): boolean =>
  amountA !== null && amountB !== null && Math.abs(amountA - amountB) < AMOUNT_TOLERANCE;
// Un solo formateador: toLocaleString crea uno nuevo en cada llamada y el
// Overview en Year formatea miles de montos.
const MONEY = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n: number) => `$${MONEY.format(n)}`;
export const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`);

export interface JobFinancials {
  servicePrice: number;
  taxes: number;
  finalCost: number;
  payroll: number;
  profit: number;
  /** Profit / Final Cost en %. null si Final Cost = 0. */
  margin: number | null;
}

const toNumber = (value: unknown): number | null => {
  const amount = typeof value === 'number' ? value : Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(amount) ? amount : null;
};

/**
 * Precio del servicio SIN impuesto: el subtotal guardado, o cantidad × precio.
 * Registros viejos sin ninguno de los dos: su total (no hay forma de separar
 * el impuesto).
 */
export const getBilledServiceBasePrice = (service: BilledServiceAmounts): number => {
  const subtotal = toNumber(service.subtotal);
  if (subtotal !== null) return subtotal;
  const quantity = toNumber(service.quantity);
  const unitPrice = toNumber(service.price);
  if (quantity !== null && unitPrice !== null) return quantity * unitPrice;
  return toNumber(service.total) ?? 0;
};

/** Apply Tax = Yes (o sin definir, el valor de siempre): el impuesto se SUMA al Final Cost. */
const isTaxAddedToFinalCost = (service: BilledServiceAmounts) => service.applyTax !== 'No';

const marginOf = (profit: number, finalCost: number): number | null =>
  finalCost > 0 ? (profit / finalCost) * 100 : null;

/** Tono del margen, umbrales del diseño: ≥45% verde · ≥35% ámbar · menos rojo. */
export type Tone = 'good' | 'warn' | 'bad' | 'none';
export const marginTone = (m: number | null): Tone =>
  m === null ? 'none' : m >= 45 ? 'good' : m >= 35 ? 'warn' : 'bad';

// ⭐ Los documentos de `payroll` NO guardan `totalAmount`, solo base / extra /
//    descuento. Si existiera totalAmount guardado y distinto de 0, se respeta.
export const getPayrollTotal = (pay?: Partial<PayrollRecord> | null): number => {
  if (!pay) return 0;
  if (pay.totalAmount != null && Number(pay.totalAmount) !== 0) return Number(pay.totalAmount);
  return Number(pay.baseAmount || 0) + Number(pay.extraAmount || 0) - Number(pay.discountAmount || 0);
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

  const byProp = useMemo(() => {
    // price = suma sin impuesto · taxAddedPrice = la parte con Apply Tax = Yes
    // (su impuesto se suma; el del resto se resta).
    const m = new Map<string, { price: number; taxAddedPrice: number; payroll: number }>();
    services.forEach((srv) => {
      if (!srv.propertyId) return;
      const e = m.get(srv.propertyId) || { price: 0, taxAddedPrice: 0, payroll: 0 };
      const basePrice = getBilledServiceBasePrice(srv);
      e.price += basePrice;
      if (isTaxAddedToFinalCost(srv)) e.taxAddedPrice += basePrice;
      m.set(srv.propertyId, e);
    });
    payrolls.forEach((pay) => {
      if (!pay.propertyId) return;
      const e = m.get(pay.propertyId) || { price: 0, taxAddedPrice: 0, payroll: 0 };
      e.payroll += getPayrollTotal(pay);
      m.set(pay.propertyId, e);
    });
    return m;
  }, [services, payrolls]);

  const calc = useMemo(
    () =>
      (prop: Property): JobFinancials => {
        const e = byProp.get(prop.id);
        const servicePrice = round2(e?.price || 0);
        const payroll = round2(e?.payroll || 0);
        const taxes = prop.taxExempt ? 0 : round2(servicePrice * TAX_RATE);
        // Impuesto que se suma (Apply Tax = Yes) menos el que se resta (No).
        const taxSubtractedPrice = servicePrice - (e?.taxAddedPrice || 0);
        const taxBalance = prop.taxExempt ? 0 : ((e?.taxAddedPrice || 0) - taxSubtractedPrice) * TAX_RATE;
        const finalCost = round2(servicePrice + taxBalance);
        // Lo que queda para la empresa: el precio menos el impuesto que se resta
        // (No). El que se suma (Yes) es del estado y no entra en el Profit.
        const subtractedTax = prop.taxExempt ? 0 : taxSubtractedPrice * TAX_RATE;
        const netRevenue = round2(servicePrice - subtractedTax);
        const profit = round2(netRevenue - payroll);
        return { servicePrice, taxes, finalCost, payroll, profit, margin: marginOf(profit, finalCost) };
      },
    [byProp],
  );

  const sum = useMemo(
    () =>
      (list: Property[]): JobFinancials => {
        const t = { servicePrice: 0, taxes: 0, finalCost: 0, payroll: 0, profit: 0 };
        list.forEach((p) => {
          const f = calc(p);
          t.servicePrice += f.servicePrice;
          t.taxes += f.taxes;
          t.finalCost += f.finalCost;
          t.payroll += f.payroll;
          t.profit += f.profit;
        });
        return { ...t, margin: marginOf(t.profit, t.finalCost) };
      },
    [calc],
  );

  return { loading: !servicesLive.loaded || !payrollLive.loaded, calc, sum, version: byProp };
}
