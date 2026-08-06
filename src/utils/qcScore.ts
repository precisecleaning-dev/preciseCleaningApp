// src/utils/qcScore.ts
//
// ⭐ RESULTADO (%) DE UNA INSPECCIÓN DE CALIDAD.
//
// El porcentaje que sale en el PDF ("pass rate") se calculaba dentro de
// qcReportPdf.ts, así que solo existía en el momento de generar el documento:
// ninguna vista podía mostrarlo sin regenerar el PDF entero.
//
// Ahora vive aquí y lo usan los tres lugares que lo necesitan:
//   · qcReportPdf.ts  — para imprimirlo en el reporte (misma cifra de siempre)
//   · QualityCheckView — lo guarda en el registro al cerrar la inspección
//   · QCReportsTableView — lo muestra en la lista sin abrir el PDF
//
// La fórmula NO cambió: Yes / (Yes + No) sobre las tareas de las áreas que
// tienen datos. Las tareas sin responder no cuentan ni a favor ni en contra.

export interface QCScoreTask { id: string; placeId: string }

export interface QCScoreResult {
  /** Tareas marcadas "Yes". */
  yesCount: number;
  /** Tareas marcadas "No". */
  noCount: number;
  /** Yes + No (las no respondidas quedan fuera). */
  totalAnswered: number;
  /** Porcentaje 0–100, redondeado. 0 si no hay nada respondido. */
  passRate: number;
  /** ¿Hubo al menos una tarea respondida? Si no, el % no significa nada. */
  hasData: boolean;
  /** Texto del veredicto que se imprime en el PDF. */
  verdict: string;
  /** Clase CSS del veredicto: 'pass' | 'mid' | 'low'. */
  verdictClass: 'pass' | 'mid' | 'low';
}

/**
 * Calcula el resultado de una inspección a partir de su `qcData` y del catálogo
 * de tareas.
 *
 * `qcData` es el mapa { [placeId]: { tasks: { [taskId]: 'Yes' | 'No' }, ... } }
 * tal como se guarda en el documento de `quality_checks`.
 */
export const computeQCScore = (
  qcData: Record<string, unknown>,
  tasks: QCScoreTask[],
): QCScoreResult => {
  let yesCount = 0;
  let noCount = 0;

  Object.entries(qcData || {}).forEach(([placeId, raw]) => {
    const entry = raw as { tasks?: Record<string, string> } | undefined;
    const answers = entry?.tasks;
    if (!answers) return;
    // Solo se cuentan tareas que pertenecen al área: así un catálogo editado
    // (tareas movidas o borradas) no arrastra respuestas huérfanas al total.
    tasks
      .filter(t => String(t.placeId) === String(placeId))
      .forEach(t => {
        const v = answers[t.id];
        if (v === 'Yes') yesCount++;
        else if (v === 'No') noCount++;
      });
  });

  const totalAnswered = yesCount + noCount;
  const passRate = totalAnswered ? Math.round((yesCount / totalAnswered) * 100) : 0;
  const hasData = totalAnswered > 0;
  const verdict = !hasData
    ? 'Inspection Recorded'
    : passRate >= 90 ? 'Excellent Result'
      : passRate >= 75 ? 'Satisfactory'
        : 'Needs Attention';
  const verdictClass: 'pass' | 'mid' | 'low' = !hasData
    ? 'mid'
    : passRate >= 90 ? 'pass'
      : passRate >= 75 ? 'mid' : 'low';

  return { yesCount, noCount, totalAnswered, passRate, hasData, verdict, verdictClass };
};

/** Color del chip de resultado según el porcentaje (mismos cortes que el PDF). */
export const passRateColors = (passRate: number, hasData: boolean) => {
  if (!hasData) return { bg: '#f1f5f9', fg: '#64748b' };
  if (passRate >= 90) return { bg: '#dcfce7', fg: '#166534' };
  if (passRate >= 75) return { bg: '#fef3c7', fg: '#854d0e' };
  return { bg: '#fee2e2', fg: '#991b1b' };
};
