// src/shared/utils/billedServiceAmounts.ts
// ⭐ Reglas de UN servicio cobrado (`billing_services`) que usan la casa
//    (features/houses/serviceRecords.ts) y las finanzas por trabajo
//    (utils/jobFinancials.ts): así el detalle de la casa e Invoices dan la
//    misma cifra para el mismo servicio (decisión de Omar, CR del PR #25).
import type { BilledServiceAmounts } from '../../types/index';

/** Impuesto de venta de Texas: lo usa un servicio que no guarda su taxPercentage. */
const TAX_RATE = 0.0825;

/** Valores de un servicio que no guarda Apply Tax / Minus Tax (registros
 *  viejos o importados). Son los mismos con los que abre "Add Service". */
export const DEFAULT_APPLY_TAX = 'Yes';
export const DEFAULT_MINUS_TAX = 'No';

/** Campo Yes / No guardado, o su valor por defecto si no viene. */
const withDefault = (value: unknown, defaultValue: string): unknown =>
  value === undefined || value === null || value === '' ? defaultValue : value;

/**
 * Qué hace un servicio cobrado con su impuesto, con la regla "Total Minus Tax"
 * de AppSheet (la que muestra el detalle de la casa): Apply Tax Yes + Minus Tax
 * No lo suma (1), Apply Tax No + Minus Tax Yes lo resta (−1) y cualquier otra
 * combinación no lo toca (0). Sin los campos: Apply Tax Yes / Minus Tax No.
 */
export const getServiceTaxSign = (applyTax: unknown, minusTax: unknown): 1 | -1 | 0 => {
  const isTaxApplied = withDefault(applyTax, DEFAULT_APPLY_TAX) === 'Yes';
  const isTaxSubtracted = withDefault(minusTax, DEFAULT_MINUS_TAX) === 'Yes';
  if (isTaxApplied && !isTaxSubtracted) return 1;
  if (!isTaxApplied && isTaxSubtracted) return -1;
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
const getBasePrice = (billedService: BilledServiceAmounts): number => {
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
 * Montos de un servicio cobrado: `basePrice` sin impuesto y `signedTax`, su
 * impuesto con signo (+ se suma al Final Cost, − se resta, 0 no aplica) con su
 * taxPercentage (8.25% si no lo trae). Un registro viejo que solo trae su
 * `total` no lleva impuesto aparte: ese total ya es el final.
 */
export const getBilledServiceAmounts = (billedService: BilledServiceAmounts) => {
  const basePrice = getBasePrice(billedService);
  if (!hasPriceWithoutTax(billedService)) return { basePrice, signedTax: 0 };
  const taxSign = getServiceTaxSign(billedService.applyTax, billedService.minusTax);
  const taxPercentage = parseAmount(billedService.taxPercentage) ?? TAX_RATE * 100;
  return { basePrice, signedTax: taxSign * basePrice * (taxPercentage / 100) };
};
