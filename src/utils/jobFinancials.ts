// src/utils/jobFinancials.ts
// ⭐ Finanzas por trabajo con las MISMAS fórmulas de la hoja "Operations".
//    Antes vivían dentro de InvoicesView; ahora también las usa el Overview
//    unificado, así que se extrajeron aquí para que ambas vistas den la misma
//    cifra exacta:
//      Service Price = suma de los servicios cobrados (billing_services)
//      Taxes         = 8.25% del Service Price (0 si la casa está exenta)
//      Final Cost    = Service Price − Taxes
//      Profit        = Final Cost − Payroll
//      Margin        = Profit / Final Cost

import { useMemo } from 'react';
import type { Property, PayrollRecord } from '../types/index';
import { useLiveCollection } from '../shared/data/liveCollections';

/** Impuesto de venta de Texas ($200 → $16.50 · $425 → $35.06). */
const TAX_RATE = 0.0825;

const round2 = (n: number) => Math.round(n * 100) / 100;
export const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    const m = new Map<string, { price: number; payroll: number }>();
    services.forEach((srv) => {
      if (!srv.propertyId) return;
      const e = m.get(srv.propertyId) || { price: 0, payroll: 0 };
      e.price += Number(srv.total) || 0;
      m.set(srv.propertyId, e);
    });
    payrolls.forEach((pay) => {
      if (!pay.propertyId) return;
      const e = m.get(pay.propertyId) || { price: 0, payroll: 0 };
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
        const finalCost = round2(servicePrice - taxes);
        const profit = round2(finalCost - payroll);
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
