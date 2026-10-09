// src/features/quality-check/qcForm.ts
// ============================================================================
// ⭐ Datos del panel de Quality Check (diseño nuevo, 10/2026).
//
// El checklist sigue saliendo de las áreas y tareas de Settings y se guarda en
// `qcData[placeId].tasks[taskId] = 'Yes' | 'No'` (Pass = Yes, Fail = No), igual
// que antes: el % (computeQCScore), el PDF y los reportes viejos no cambian.
//
// Lo que el diseño agrega sin área propia se guarda en dos "áreas" internas de
// `qcData`, para reutilizar la subida de fotos, la cola sin conexión y el
// editor de fotos que ya funcionan por área:
//   · GENERAL_SLOT  → fotos de la inspección + "Notes for the team" (`notes`).
//                     Sale en el PDF como el área "General".
//   · OFFICE_SLOT   → "Photos for office" (solo oficina, nunca en el PDF).
// Los demás campos van en el documento de `quality_checks` (QcExtras).
// ============================================================================

export const GENERAL_SLOT = '__general';
export const OFFICE_SLOT = '__office';
export const GENERAL_SLOT_NAME = 'General';
export const OFFICE_SLOT_NAME = 'Office';

export type QcOutcome = 'invoice' | 'recall';

/** Campos del panel que se guardan en el documento del QC. */
export interface QcExtras {
  inspectorId: string;
  inspectorName: string;
  /** Fecha de la inspección, AAAA-MM-DD (se muestra MM/DD/AAAA). */
  date: string;
  /** "Notes for client" — solo oficina; va en el email al property manager. */
  clientNotes: string;
  /** Abrir el email al property manager al guardar. */
  notifyManager: boolean;
  /** Resultado elegido; null = solo guardar avance. */
  outcome: QcOutcome | null;
  /** Con RECALL: la casa pasa a Recall (re-clean) y la factura queda retenida. */
  reclean: boolean;
}

export interface QcSection {
  id: string;
  name: string;
  tasks: { id: string; name: string }[];
}

export type QcAnswer = 'Yes' | 'No';

/** Conteo del checklist: aprobadas, falladas, respondidas y total de tareas. */
export function checklistTotals(sections: QcSection[], answers: Record<string, Record<string, string> | undefined>) {
  let passed = 0, failed = 0, total = 0;
  const failedNames: string[] = [];
  sections.forEach((s) => {
    s.tasks.forEach((t) => {
      total++;
      const v = answers[s.id]?.[t.id];
      if (v === 'Yes') passed++;
      else if (v === 'No') { failed++; failedNames.push(t.name); }
    });
  });
  return { passed, failed, answered: passed + failed, total, failedNames };
}
