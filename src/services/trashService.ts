// ============================================================================
// ⭐ PAPELERA DE RECICLAJE (borrado suave) — GENÉRICA PARA CUALQUIER MÓDULO.
//
// Motivo: se estaban borrando casas sin poder saber quién, cuándo ni por qué,
// y sin forma de recuperarlas. Ahora "borrar" NUNCA destruye: mueve el
// documento (y sus registros relacionados) a la colección `trash`, junto con
// quién lo borró, cuándo y la NOTA OBLIGATORIA del motivo. Desde la vista
// Recycle Bin se puede restaurar ÍNTEGRAMENTE (mismo id, mismos datos,
// mismos relacionados) o eliminar definitivamente.
//
// Para conectar un módulo nuevo basta llamar `trashService.moveToTrash` en su
// handler de borrado con el nombre de su colección y sus relacionados.
// ============================================================================
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';

/** Un documento relacionado que se borra junto con el principal
 *  (ej. payrolls y servicios facturados de una casa). */
export interface TrashRelatedDoc {
  /** Colección donde vivía (ej. 'payroll_records') */
  collectionName: string;
  /** Id original del documento */
  originalId: string;
  /** Contenido completo para poder restaurarlo tal cual */
  data: Record<string, unknown>;
}

export interface TrashEntry {
  id: string;
  /** Colección de origen del documento principal (ej. 'properties') */
  collectionName: string;
  /** Nombre del módulo tal como se muestra en la app (ej. 'Houses') */
  moduleLabel: string;
  /** Id original del documento principal (se reutiliza al restaurar) */
  originalId: string;
  /** Etiqueta legible del registro (cliente, dirección...) */
  targetLabel: string;
  /** Contenido completo del documento principal */
  data: Record<string, unknown>;
  /** Relacionados que se borraron junto con él */
  related: TrashRelatedDoc[];
  /** Quién lo mandó a la papelera */
  deletedById: string;
  deletedByName: string;
  /** Cuándo (ISO) */
  deletedAt: string;
  /** ⭐ NOTA OBLIGATORIA: por qué se borró */
  reason: string;
}

const TRASH_COLLECTION = 'trash';

/** Firestore rechaza `undefined`: se limpia el objeto antes de escribir. */
const stripUndefined = (obj: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
};

export const trashService = {
  /** Mueve un documento (y sus relacionados) a la papelera y borra los
   *  originales EN UN SOLO BATCH atómico: o se mueve todo, o no se mueve nada.
   *  Devuelve el id del registro de papelera creado. */
  async moveToTrash(params: {
    collectionName: string;
    moduleLabel: string;
    originalId: string;
    targetLabel: string;
    data: Record<string, unknown>;
    related?: TrashRelatedDoc[];
    deletedById: string;
    deletedByName: string;
    reason: string;
  }): Promise<string> {
    const reason = String(params.reason || '').trim();
    if (!reason) throw new Error('La nota del motivo de borrado es obligatoria.');

    const batch = writeBatch(db);
    const trashRef = doc(collection(db, TRASH_COLLECTION));
    const related = (params.related || []).map((r) => ({
      collectionName: r.collectionName,
      originalId: r.originalId,
      data: stripUndefined(r.data),
    }));

    batch.set(trashRef, {
      collectionName: params.collectionName,
      moduleLabel: params.moduleLabel,
      originalId: params.originalId,
      targetLabel: params.targetLabel || '',
      data: stripUndefined(params.data),
      related,
      deletedById: params.deletedById,
      deletedByName: params.deletedByName,
      deletedAt: new Date().toISOString(),
      reason,
    });
    batch.delete(doc(db, params.collectionName, params.originalId));
    for (const r of related) {
      batch.delete(doc(db, r.collectionName, r.originalId));
    }
    await batch.commit();
    return trashRef.id;
  },

  /** Todos los registros de la papelera, del más reciente al más antiguo. */
  async getAll(): Promise<TrashEntry[]> {
    const snap = await getDocs(
      query(collection(db, TRASH_COLLECTION), orderBy('deletedAt', 'desc')),
    );
    return snap.docs.map((d) => {
      const raw = d.data() as Omit<TrashEntry, 'id'>;
      return { id: d.id, ...raw, related: raw.related || [] };
    });
  },

  /** Restaura ÍNTEGRAMENTE: documento principal con su MISMO id, más todos
   *  sus relacionados, y elimina el registro de la papelera. Atómico. */
  async restore(entry: TrashEntry): Promise<void> {
    const batch = writeBatch(db);
    batch.set(doc(db, entry.collectionName, entry.originalId), entry.data);
    for (const r of entry.related || []) {
      batch.set(doc(db, r.collectionName, r.originalId), r.data);
    }
    batch.delete(doc(db, TRASH_COLLECTION, entry.id));
    await batch.commit();
  },

  /** Borrado DEFINITIVO: elimina el registro de la papelera para siempre. */
  async purge(trashId: string): Promise<void> {
    const batch = writeBatch(db);
    batch.delete(doc(db, TRASH_COLLECTION, trashId));
    await batch.commit();
  },
};
