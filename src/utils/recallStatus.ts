// Antes reimplementado con contenido idéntico en RecallsView.tsx y StatusHistoryView.tsx,
// y con nombres distintos (RECALL_HINTS/isRecallStatus) en QualityCheckView.tsx. Cubre solo
// la detección de "¿este texto de status corresponde a Recall?" por coincidencia de texto.

export const RECALL_STATUS_HINTS = ['recall', 're-call', 're call', 'recleaning', 're-clean', 'callback', 'call back'];

/** Determina si un texto (nombre o id de status) corresponde a "Recall". */
export const isRecallText = (txt?: string | null): boolean => {
  if (!txt) return false;
  const t = String(txt).toLowerCase();
  return RECALL_STATUS_HINTS.some(h => t.includes(h));
};
