// src/features/houses/services/houseTrash.ts
// ============================================================================
// ⭐ BORRAR UNA CASA = MANDARLA A LA PAPELERA (un solo camino para toda la app).
//
// Antes solo Houses usaba la papelera; Invoices, Calendar y Quality Check
// hacían `deleteDoc` directo: la casa desaparecía para siempre, sin bitácora,
// y sus pagos (`payroll`) y servicios cobrados (`billing_services`) quedaban
// huérfanos sumando en Payroll. Ahora las cuatro vistas llaman a esta función:
//   · la casa, sus pagos y sus servicios se MUEVEN íntegros a `trash` en un
//     solo batch (trashService.moveToTrash: todo o nada), con quién, cuándo y
//     el motivo (obligatorio);
//   · después queda el registro en la bitácora.
// Desde Recycle Bin se restaura todo junto o se elimina definitivamente.
// ============================================================================
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { COLLECTIONS } from '../../../lib/firebase/collections';
import type { Property, SystemUser } from '../../../types/index';
import { payrollService } from '../../../services/payrollService';
import { trashService } from '../../../services/trashService';
import { logActivity } from '../../../services/activityLogService';

interface MoveHouseToTrashParams {
  /** La casa a borrar (su versión en vivo). */
  house: Property;
  /** Quién la borra: la papelera exige saberlo. */
  actor: SystemUser;
  /** Motivo escrito por el usuario (obligatorio). */
  reason: string;
  /** Etiqueta legible ("Cliente — Dirección"): la casa ya no estará para consultarla. */
  label: string;
  /** Vista desde la que se borró, para la bitácora ("Houses", "Invoices"...). */
  module: string;
}

interface MoveHouseToTrashResult {
  payrolls: number;
  services: number;
}

/** Quita el `id` de un registro para guardarlo tal cual en la papelera. */
const withoutId = (record: object): Record<string, unknown> => {
  const rest: Record<string, unknown> = { ...(record as Record<string, unknown>) };
  delete rest.id;
  return rest;
};

export async function moveHouseToTrash({
  house, actor, reason, label, module,
}: MoveHouseToTrashParams): Promise<MoveHouseToTrashResult> {
  const why = reason.trim();
  if (!why) throw new Error('La nota del motivo es obligatoria para borrar.');

  // Los relacionados se consultan aquí (en paralelo) y no se toman del estado
  // de la vista: al borrar desde una fila sin abrir el detalle, ese estado
  // estaría vacío o sería de otra casa.
  const [payrolls, servicesSnap] = await Promise.all([
    payrollService.getByPropertyId(house.id),
    getDocs(query(collection(db, COLLECTIONS.billingServices), where('propertyId', '==', house.id))),
  ]);

  await trashService.moveToTrash({
    collectionName: 'properties',
    // La papelera agrupa por módulo de origen del REGISTRO: siempre es una casa.
    moduleLabel: 'Houses',
    originalId: house.id,
    targetLabel: label,
    data: withoutId(house),
    related: [
      ...payrolls.map((r) => ({ collectionName: 'payroll', originalId: String(r.id), data: withoutId(r) })),
      ...servicesSnap.docs.map((d) => ({
        collectionName: 'billing_services',
        originalId: d.id,
        data: d.data() as Record<string, unknown>,
      })),
    ],
    deletedById: actor.id,
    deletedByName: [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.email,
    reason: why,
  });

  // ⭐ Bitácora: quién, qué y POR QUÉ (nunca lanza).
  void logActivity({
    action: 'delete',
    module,
    user: actor,
    targetId: house.id,
    targetLabel: label,
    detail: `Enviado a la papelera. Motivo: "${why}". Incluye ${payrolls.length} payroll(s) y ${servicesSnap.size} servicio(s) facturado(s). Recuperable en Recycle Bin.`,
  });

  return { payrolls: payrolls.length, services: servicesSnap.size };
}
