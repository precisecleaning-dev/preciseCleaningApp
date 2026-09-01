// ============================================================================
// ⭐ NORMALIZADOR DE DOCUMENTOS DE CLIENTES — corrige el bug de los IDs.
//
// Los clientes migrados de AppSheet traen DENTRO del documento un campo `id`
// con el id viejo (hex corto tipo "5b836a0a..."). El patrón común
//
//     { id: d.id, ...d.data() }          // ⚠ MAL
//
// pone el id de Firestore PRIMERO y luego el spread lo SOBREESCRIBE con el id
// legacy → el cliente queda en memoria con el id equivocado, las casas cuyo
// campo `client` guarda el id real de Firestore no lo encuentran, y la tarjeta
// muestra el ID crudo en vez del nombre.
//
// Este helper hace el orden correcto y conserva el id viejo aparte como
// `legacyId` (solo en memoria), para poder resolver también a las casas
// migradas que guardan ese valor en `client`. Úsalo en TODO mapeo de la
// colección `customers`.
// ============================================================================
import type { Customer } from '../types/index';

interface DocLike {
  id: string;
  data: () => Record<string, unknown>;
}

export function mapCustomerDoc(d: DocLike): Customer {
  const raw = d.data();
  // El `id` interno (legacy de AppSheet) se saca del spread para que NUNCA
  // pise al id real del documento.
  const { id: legacyRaw, ...rest } = raw as { id?: unknown } & Record<string, unknown>;
  const legacyId = typeof legacyRaw === 'string' && legacyRaw ? legacyRaw : undefined;
  return {
    ...(rest as Omit<Customer, 'id'>),
    id: d.id,
    ...(legacyId ? { legacyId } : {}),
  } as Customer;
}

/** Resuelve el nombre de un cliente probando id real, id legacy y nombre. */
export function resolveCustomerName(
  list: Customer[],
  idOrName?: string | null,
  fallback = '-',
): string {
  if (!idOrName) return fallback;
  const key = String(idOrName).toLowerCase().trim();
  const found = list.find((c) => {
    const cid = String(c.id || '').toLowerCase().trim();
    const legacy = String((c as Customer & { legacyId?: string }).legacyId || '')
      .toLowerCase()
      .trim();
    const name = String(c.name || '').toLowerCase().trim();
    return cid === key || (legacy !== '' && legacy === key) || name === key;
  });
  return found ? found.name : fallback;
}
