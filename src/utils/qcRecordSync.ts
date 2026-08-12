// src/utils/qcRecordSync.ts
//
// ============================================================================
// ⭐ SINCRONIZACIÓN DE ESTADO ENTRE QUALITY CHECK Y QUALITY CHECK REPORTS
//
// EL PROBLEMA:
//   Las dos vistas clasifican la MISMA casa mirando datos DISTINTOS.
//
//     · Quality Check      → mira `quality_checks.result`
//                            ('failed' = Recall, si no Finished/Pending)
//     · Quality Check Reports → mira `properties.statusId`
//                            (el estado real de la casa)
//
//   Al cambiar el estado desde Reports solo se actualizaba `properties`. El
//   reporte conservaba `result: 'failed'` para siempre, así que la casa
//   aparecía como "Quality Check" en una vista y como "Recall" en la otra.
//   Nunca se resolvía solo: son dos campos independientes en dos colecciones.
//
// LA SOLUCIÓN:
//   Cuando el estado de una casa cambia, se actualiza TAMBIÉN el reporte de
//   calidad más reciente de esa casa, para que ambas vistas cuenten lo mismo:
//
//     casa → "Recall"        ⇒ reporte.result = 'failed'
//     casa → "Quality Check" ⇒ reporte.result = 'passed'  (deja de ser recall)
//     casa → "Invoice"       ⇒ reporte.result = 'passed'  (el trabajo se aprobó)
//
//   Solo se toca el reporte MÁS RECIENTE: los históricos deben conservar el
//   resultado que tuvieron en su momento, o se perdería el registro de que esa
//   casa falló alguna vez.
// ============================================================================

import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Status } from '../types/index';
import { isRecallName, isQualityCheckName, isInvoiceName } from './statusFilters';

/** Resultado que debe tener el reporte según el estado al que pasó la casa.
 *  `null` = el estado no dice nada sobre el resultado; no se toca el reporte. */
export const resultForStatus = (
  statuses: Status[],
  statusIdOrName?: string | null,
): 'passed' | 'failed' | null => {
  const raw = String(statusIdOrName || '').trim();
  if (!raw) return null;
  const st = statuses.find(s => String(s.id) === raw || String(s.name) === raw);
  const name = st?.name || raw;

  if (isRecallName(name)) return 'failed';
  if (isQualityCheckName(name) || isInvoiceName(name)) return 'passed';
  return null;
};

/**
 * Alinea el reporte de calidad más reciente de una casa con su estado actual.
 *
 * Es "best-effort" a propósito: si falla, se registra en consola pero NO se
 * lanza. El cambio de estado de la casa ya ocurrió y es lo que el usuario
 * pidió; que la sincronización del reporte falle no debe deshacerlo ni
 * mostrarle un error por algo secundario.
 *
 * Devuelve true si actualizó algún reporte.
 */
export const syncQCRecordWithStatus = async (
  houseId: string,
  statuses: Status[],
  newStatusIdOrName?: string | null,
): Promise<boolean> => {
  const desired = resultForStatus(statuses, newStatusIdOrName);
  if (!desired || !houseId) return false;

  try {
    // Sin orderBy: exigiría un índice compuesto en Firestore y una casa tiene
    // pocos reportes. Se ordena en memoria.
    const snap = await getDocs(
      query(collection(db, 'quality_checks'), where('houseId', '==', houseId)),
    );
    if (snap.empty) return false;

    const toMs = (v: unknown): number => {
      const t = new Date(String(v || '')).getTime();
      return isNaN(t) ? 0 : t;
    };

    const docs = snap.docs
      .map(d => ({ id: d.id, data: d.data() as Record<string, unknown> }))
      .sort((a, b) => {
        const ta = toMs(a.data.checkOutAt) || toMs(a.data.createdAt) || toMs(a.data.date);
        const tb = toMs(b.data.checkOutAt) || toMs(b.data.createdAt) || toMs(b.data.date);
        return tb - ta;
      });

    const latest = docs[0];
    if (!latest) return false;

    // Si ya coincide, no se escribe: evita una escritura inútil y una entrada
    // de más en el historial de Firestore.
    if (latest.data.result === desired) return false;

    await updateDoc(doc(db, 'quality_checks', latest.id), {
      result: desired,
      // Un reporte con resultado definido está terminado por definición: si se
      // quedara en 'Pending' desaparecería de la lista de reportes.
      status: 'Finished',
      resultSyncedAt: new Date().toISOString(),
    });
    return true;
  } catch (e) {
    console.error('No se pudo sincronizar el reporte de calidad con el estado:', e);
    return false;
  }
};
