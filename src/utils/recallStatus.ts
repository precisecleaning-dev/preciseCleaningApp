// Única fuente para detectar Recall por texto (antes había copias en varias vistas). Cubre solo
// la detección de "¿este texto de status corresponde a Recall?" por coincidencia de texto.
import type { Property, Status } from '../types/index';

const RECALL_STATUS_HINTS = ['recall', 're-call', 're call', 'recleaning', 're-clean', 'callback', 'call back'];

/** Determina si un texto (nombre o id de status) corresponde a "Recall". */
export const isRecallText = (txt?: string | null): boolean => {
  if (!txt) return false;
  const t = String(txt).toLowerCase();
  return RECALL_STATUS_HINTS.some(h => t.includes(h));
};

/** El status ACTUAL de la casa es Recall (el status se busca por id o por
 *  nombre). Una sola regla para las tarjetas "Casas en Recall" de Quality Check
 *  y la tabla de Quality Check Reports, con isRecallText como wasHouseInRecall:
 *  un status "Re-clean" o "Callback" también cuenta. */
export const isPropertyStatusRecall = (property: Property | undefined, statuses: Status[]): boolean => {
  const rawStatus = String(property?.statusId ?? '').trim();
  const currentStatus = statuses.find((status) => String(status.id) === rawStatus || String(status.name) === rawStatus);
  return isRecallText(currentStatus?.name ?? rawStatus);
};
