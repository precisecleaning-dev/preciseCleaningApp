// src/features/quality-check/qcForm.ts
// ============================================================================
// ⭐ Datos del panel de Quality Check (diseño nuevo, 10/2026).
//
// El checklist sigue saliendo de las áreas y tareas de Settings y se guarda en
// `qcData[placeId].tasks[taskId] = 'Yes' | 'No'` (Pass = Yes, Fail = No), igual
// que antes: el % (computeQCScore), el PDF y los reportes viejos no cambian.
// Cada área tiene su nota (`qcData[placeId].notes`, campo al final del área);
// marcar Fail le agrega la línea "Fail <tarea>" en el momento.
//
// Lo que el diseño agrega sin área propia se guarda en dos "áreas" internas de
// `qcData`, para reutilizar la subida de fotos, la cola sin conexión y el
// editor de fotos que ya funcionan por área:
//   · GENERAL_SLOT  → fotos de la inspección. Sale en el PDF como el área
//                     "General" (con la "Notes for the team" de los reportes
//                     viejos, de antes de las notas por área).
//   · OFFICE_SLOT   → "Photos for office" (solo oficina, nunca en el PDF).
// Los demás campos van en el documento de `quality_checks` (QcExtras).
// ============================================================================
import type { QcFormData } from '../../types/index';

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

/** Una tarea de un área del checklist. */
export interface QcSectionTask {
  id: string;
  name: string;
}

/** Un área del checklist (Porch, Rooms…) con sus tareas activas. */
export interface QcSection {
  id: string;
  name: string;
  tasks: QcSectionTask[];
}

export type QcAnswer = 'Yes' | 'No';

/** Línea que marcar Fail agrega a la nota del área: "Fail Baseboards". */
export const failNoteLine = (taskName: string): string => `Fail ${taskName}`;

/** Antes las tareas en "No" se anotaban AL GUARDAR en una sola línea con este
 *  prefijo. Al abrir un QC viejo se cambia por líneas "Fail <tarea>". */
const LEGACY_FAILED_TASKS_PREFIX = '⚠ Marcado "No": ';

const toNoteLines = (notes: string): string[] => (notes ? notes.split('\n') : []);

/** Nota del área cuando una tarea pasa a Fail (agrega su línea al final, si no
 *  estaba) o deja de estarlo (quita esa línea; lo escrito a mano no se toca). */
export function syncFailNoteLine(notes: string, taskName: string, isFailed: boolean): string {
  const failLine = failNoteLine(taskName);
  const noteLines = toNoteLines(notes);
  if (isFailed) {
    return noteLines.includes(failLine) ? notes : [...noteLines, failLine].join('\n');
  }
  const failLineIndex = noteLines.indexOf(failLine);
  if (failLineIndex === -1) return notes;
  return noteLines.filter((_noteLine, lineIndex) => lineIndex !== failLineIndex).join('\n');
}

/** Nota de un área al abrir un QC: sin la línea vieja "⚠ Marcado "No": …" y
 *  con una línea "Fail <tarea>" por cada tarea en Fail que no la tenga. */
export function withFailNoteLines(notes: string, failedTaskNames: string[]): string {
  const notesWithoutLegacyLine = toNoteLines(notes)
    .filter((noteLine) => !noteLine.startsWith(LEGACY_FAILED_TASKS_PREFIX))
    .join('\n');
  return failedTaskNames.reduce(
    (currentNotes, failedTaskName) => syncFailNoteLine(currentNotes, failedTaskName, true),
    notesWithoutLegacyLine,
  );
}

/** qcData de un QC que se abre: la nota de cada área con sus líneas
 *  "Fail <tarea>" (withFailNoteLines). Las áreas sin tareas no cambian. */
export function qcDataWithFailNotes(qcData: QcFormData, taskNameById: ReadonlyMap<string, string>): QcFormData {
  return Object.fromEntries(Object.entries(qcData).map(([placeId, placeData]) => {
    const placeAnswers: Record<string, string> | undefined = placeData?.tasks;
    if (!placeAnswers) return [placeId, placeData];
    const failedTaskNames = Object.entries(placeAnswers)
      .filter(([, answer]) => answer === 'No')
      .map(([taskId]) => taskNameById.get(taskId))
      .filter((taskName): taskName is string => !!taskName);
    return [placeId, { ...placeData, notes: withFailNoteLines(String(placeData.notes ?? ''), failedTaskNames) }];
  }));
}

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
