import type { Customer, Property, Status } from '../../types/index';

/** Empresas que separan casas y status. Cavalry trabaja con sus propios clientes. */
export const BUSINESSES = ['Normal', 'Cavalry'] as const;
export type BusinessName = (typeof BUSINESSES)[number];

/** Tipo de cliente (Customers → Type) cuyas casas son de Cavalry. */
export const CAVALRY_CUSTOMER_TYPE = 'Cavalry';

/** Tipos de cliente de la empresa Normal. Cualquier tipo que no sea Cavalry
 *  también cuenta como Normal (p. ej. "Commercial", que se renombró a
 *  "Property manager" en 10/2026 y sigue en clientes viejos). */
export const NORMAL_CUSTOMER_TYPES = ['Private customer', 'Residential', 'Property manager'] as const;

/** Opciones de "Type" al crear o editar un cliente. */
export const CUSTOMER_TYPE_OPTIONS: readonly string[] = [...NORMAL_CUSTOMER_TYPES, CAVALRY_CUSTOMER_TYPE];

/**
 * Empresas de un status. Se guardan en `business` separadas por coma
 * ("Normal", "Cavalry" o "Normal, Cavalry"). Ese campo traía códigos de
 * AppSheet que nada usa: un status sin ninguna de las dos cuenta como Normal.
 */
export function statusBusinesses(business?: string): BusinessName[] {
  const parts = String(business || '').split(',').map((p) => p.trim().toLowerCase());
  const found = BUSINESSES.filter((b) => parts.includes(b.toLowerCase()));
  return found.length > 0 ? found : ['Normal'];
}

export const statusInBusiness = (status: Pick<Status, 'business'>, business: BusinessName): boolean =>
  statusBusinesses(status.business).includes(business);

/** Orden de un status en el tablero de una empresa: Cavalry tiene su propio Form Order; si no lo tiene, usa el de siempre. */
export function statusOrderIn(status: Pick<Status, 'order' | 'cavalryOrder'>, business: BusinessName): number {
  const own = business === 'Cavalry' ? status.cavalryOrder : undefined;
  return Number(own === undefined || own === null || own === '' ? status.order : own);
}

/** Status de una empresa, en el Form Order de esa empresa (tablero y formulario de la casa). */
export const statusesForBusiness = (statuses: Status[], business: BusinessName): Status[] =>
  statuses
    .filter((status) => statusInBusiness(status, business))
    .sort((firstStatus, secondStatus) => statusOrderIn(firstStatus, business) - statusOrderIn(secondStatus, business));

/**
 * Claves (id, id legacy y nombre, sin mayúsculas) de los clientes de Cavalry:
 * el `client` de una casa puede traer cualquiera de las tres. Si dos clientes
 * comparten una clave gana el primero, igual que al resolver el nombre
 * (customerNameIndex).
 */
export function cavalryClientKeys(customers: Customer[]): Set<string> {
  const owner = new Map<string, Customer>();
  for (const c of customers) {
    for (const k of [c.id, c.legacyId, c.name]) {
      const key = String(k || '').toLowerCase().trim();
      if (key && !owner.has(key)) owner.set(key, c);
    }
  }
  const keys = new Set<string>();
  owner.forEach((c, key) => {
    if (c.type === CAVALRY_CUSTOMER_TYPE) keys.add(key);
  });
  return keys;
}

export const houseBusiness = (house: Pick<Property, 'client'>, cavalryKeys: Set<string>): BusinessName =>
  cavalryKeys.has(String(house.client || '').toLowerCase().trim()) ? 'Cavalry' : 'Normal';
