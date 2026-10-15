import type { Customer, Property, Status } from '../../types/index';

/** Empresas que separan casas y status. Cavalry trabaja con sus propios clientes. */
export const BUSINESSES = ['Normal', 'Cavalry'] as const;
export type BusinessName = (typeof BUSINESSES)[number];

/** Tipo de cliente (Customers → Type) cuyas casas son de Cavalry. */
export const CAVALRY_CUSTOMER_TYPE = 'Cavalry';

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
