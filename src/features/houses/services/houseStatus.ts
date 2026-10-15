// src/features/houses/services/houseStatus.ts
// ============================================================================
// ⭐ CAMBIO DE STATUS DE UNA CASA — un solo camino para toda la app.
//
// Antes cada vista cambiaba el status a su manera: Houses dejaba bitácora pero
// no `status_history`; Invoices y Calendar no dejaban ninguna de las dos;
// Quality Check escribía la casa y el historial en dos `await` sueltos. Como
// las métricas de Recall salen de `status_history` (utils/jobRecall.ts), una
// casa movida a Recall desde Overview o Invoices no contaba.
//
// Ahora:
//   · la casa y su entrada de `status_history` viajan en el MISMO batch
//     (todo o nada);
//   · si el destino es "Invoice" se estampa `sentToInvoiceAt`
//     (utils/invoiceEntry.ts), también desde QC Reports, que no lo hacía;
//   · la bitácora (`activity_logs`) se escribe después; nunca lanza.
//
// `addStatusChange` agrega las dos escrituras a un batch ajeno: lo usa el
// cierre de un Quality Check, que guarda el reporte en el mismo batch.
// ============================================================================
import { collection, doc, writeBatch, type WriteBatch } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { COLLECTIONS } from '../../../lib/firebase/collections';
import type { Property, Status, SystemUser } from '../../../types/index';
import { stampInvoiceEntry } from '../../../utils/invoiceEntry';
import { getRelationName } from '../../../utils/relations';
import { RECALL_HISTORY_CACHE } from '../../../utils/jobRecall';
import { invalidate } from '../../../shared/utils/memoryCache';
import { logActivity } from '../../../services/activityLogService';

/** Lo mínimo de la casa que hace falta para cambiarle el status. */
export type HouseStatusRef = Pick<Property, 'id' | 'statusId'>;

export interface StatusChangeContext {
  statuses: Status[];
  /** Quién hace el cambio (historial y bitácora). */
  actor: Pick<SystemUser, 'id' | 'firstName' | 'lastName' | 'email'> | null | undefined;
  /** Desde dónde se hizo, tal como queda en `status_history.source`. */
  source: 'houses' | 'invoices' | 'calendar' | 'quality_check' | 'qc_reports';
  /** Módulo de la bitácora ("Houses", "Invoices"...). */
  module: string;
  /** Etiqueta legible de la casa para la bitácora (cliente — dirección). */
  label: string;
  /** Motivo, si lo hay (p. ej. "No pasó Quality Check"). */
  reason?: string;
}

const normalize = (v?: string | null) => String(v ?? '').toLowerCase().trim();

/** ¿Es el mismo status? (id o nombre, sin mayúsculas: hay casas viejas con el nombre). */
export const isSameStatus = (a?: string | null, b?: string | null): boolean =>
  normalize(a) === normalize(b);

/** Nombre legible de un status (por id o por nombre, sin mayúsculas; si no
 *  está en el catálogo, el valor tal cual). */
export const statusNameOf = (statuses: Status[], idOrName?: string | null): string => {
  const raw = String(idOrName ?? '').trim();
  return raw ? getRelationName(statuses, raw, raw) : '';
};

/** Etiqueta de la casa en la bitácora: "Cliente — Dirección" (mismo formato que Houses). */
export const houseLogLabel = (clientName: string, address?: string | null): string =>
  address ? `${clientName} — ${address}` : clientName;

export const actorName = (actor: StatusChangeContext['actor']): string =>
  (actor && ([actor.firstName, actor.lastName].filter(Boolean).join(' ').trim() || actor.email)) || 'Unknown';

/**
 * Agrega al batch el cambio de status de la casa (con el sello de Invoice y los
 * campos `extra` en la misma escritura) y su entrada de `status_history`.
 * Si el status no cambia, solo escribe `extra` (si trae algo).
 * Devuelve true si el status cambió.
 */
export function addStatusChange(
  batch: WriteBatch,
  house: HouseStatusRef,
  newStatusId: string | null,
  ctx: Pick<StatusChangeContext, 'statuses' | 'actor' | 'source' | 'reason'>,
  extra: Partial<Property> = {},
): boolean {
  const changes = !!newStatusId && !isSameStatus(house.statusId, newStatusId);
  const payload: Record<string, unknown> = changes
    ? { ...extra, ...stampInvoiceEntry({ statusId: newStatusId }, ctx.statuses, newStatusId) }
    : { ...extra };
  if (Object.keys(payload).length > 0) {
    batch.update(doc(db, COLLECTIONS.properties, house.id), payload);
  }
  if (!changes || !newStatusId) return false;
  batch.set(doc(collection(db, COLLECTIONS.statusHistory)), {
    propertyId: house.id,
    fromStatusId: house.statusId || null,
    fromStatusName: statusNameOf(ctx.statuses, house.statusId) || null,
    toStatusId: newStatusId,
    toStatusName: statusNameOf(ctx.statuses, newStatusId) || null,
    changedBy: actorName(ctx.actor),
    changedAt: new Date().toISOString(),
    source: ctx.source,
    ...(ctx.reason ? { reason: ctx.reason } : {}),
  });
  return true;
}

/**
 * Agrega al batch SOLO la entrada de `status_history`. Para los formularios de
 * edición, que ya escriben la casa (con todos sus campos) en su propio batch.
 */
export function addStatusHistory(
  batch: WriteBatch,
  houseId: string,
  fromStatusId: string | null | undefined,
  toStatusId: string,
  ctx: Pick<StatusChangeContext, 'statuses' | 'actor' | 'source'>,
): boolean {
  if (!toStatusId || isSameStatus(fromStatusId, toStatusId)) return false;
  batch.set(doc(collection(db, COLLECTIONS.statusHistory)), {
    propertyId: houseId,
    fromStatusId: fromStatusId || null,
    fromStatusName: statusNameOf(ctx.statuses, fromStatusId) || null,
    toStatusId,
    toStatusName: statusNameOf(ctx.statuses, toStatusId) || null,
    changedBy: actorName(ctx.actor),
    changedAt: new Date().toISOString(),
    source: ctx.source,
  });
  return true;
}

/** Después de escribir historial: la marca "fue Recall" se recalcula. */
export const afterStatusHistoryWrite = (): void => invalidate(RECALL_HISTORY_CACHE);

/** Bitácora de un cambio de status (nunca lanza). */
export function logStatusChange(
  house: HouseStatusRef,
  newStatusId: string,
  ctx: StatusChangeContext,
): void {
  void logActivity({
    action: 'status_change',
    module: ctx.module,
    user: ctx.actor,
    targetId: house.id,
    targetLabel: ctx.label,
    changes: [
      {
        field: 'statusId',
        before: statusNameOf(ctx.statuses, house.statusId) || '(sin status)',
        after: statusNameOf(ctx.statuses, newStatusId) || newStatusId,
      },
    ],
    ...(ctx.reason ? { detail: ctx.reason } : {}),
  });
}

/**
 * Cambia el status de una casa: la casa y `status_history` en un solo batch,
 * y la bitácora después. Lanza si el batch falla (no se escribió nada).
 * Devuelve false si el status ya era ese (no escribe nada).
 */
export async function changeHouseStatus(
  house: HouseStatusRef,
  newStatusId: string,
  ctx: StatusChangeContext,
): Promise<boolean> {
  if (!newStatusId || isSameStatus(house.statusId, newStatusId)) return false;
  const batch = writeBatch(db);
  addStatusChange(batch, house, newStatusId, ctx);
  await batch.commit();
  afterStatusHistoryWrite();
  logStatusChange(house, newStatusId, ctx);
  return true;
}
