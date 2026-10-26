// src/features/houses/operationsSheetMatch.ts
// Compara las filas de la hoja "Daily Operations" con los trabajos de la app.
//
// MATCH: misma calle (número + primera palabra del nombre: "401 S Twin Creek
// Dr" → "401 twin") y misma fecha. Una dirección se repite muchas veces
// (Twin Creek: varias unidades el mismo día), así que entre los candidatos
// gana el que más se parece: la unidad (Apt/Unit), el Service Price, el
// Payroll, el cliente y las palabras de la nota. Cada fila y cada trabajo se
// usan UNA sola vez (primero los pares con más puntos).
// Lo que no se emparejó en su fecha se intenta con la misma calle hasta
// MAX_DATE_SHIFT_DAYS días antes o después (trabajo que se movió de día).
//
// MONTOS: Service Price, Taxes, Final Cost y Payroll de la app
// (utils/jobFinancials.ts, con las fórmulas de la hoja: Final Cost = Price ±
// 8.25% según Apply Tax). Diferencias de menos de un centavo no cuentan.
import type {
  OperationsSheetAmountDifference, OperationsSheetAmountField, OperationsSheetAmounts, OperationsSheetCandidatePair,
  OperationsSheetCompareSources, OperationsSheetComparison, OperationsSheetJobCandidate, OperationsSheetMatch,
  OperationsSheetMatchStatus, OperationsSheetRow, Property,
} from '../../types/index';
import { round2, TAX_RATE } from '../../utils/jobFinancials';

/** Días que se acepta mover la fecha al buscar un trabajo que no estaba en su día. */
const MAX_DATE_SHIFT_DAYS = 7;

/** Diferencia mínima que cuenta (redondeos de la hoja). */
const AMOUNT_TOLERANCE = 0.01;

const DAY_MS = 86_400_000;

const AMOUNT_FIELDS: OperationsSheetAmountField[] = ['servicePrice', 'taxes', 'finalCost', 'payroll'];

/** Palabras que no ayudan a reconocer una dirección. */
const IGNORED_ADDRESS_WORDS = new Set(['ee', 'uu', 'usa', 'us', 'united', 'states', 'tx', 'texas']);

/** Puntos cardinales que van antes del nombre de la calle ("401 S Twin Creek"). */
const DIRECTION_WORDS = new Set(['n', 's', 'e', 'w', 'north', 'south', 'east', 'west', 'ne', 'nw', 'se', 'sw']);

/** Palabras que anteceden a la unidad ("Apt D", "Unit 11G", "#B"). */
const UNIT_WORDS = new Set(['apt', 'apartment', 'unit', 'ste', 'suite', 'bldg', 'building', 'lot']);

/** Puntos para elegir el trabajo correcto entre los de la misma calle. */
const MATCH_POINTS = {
  sameUnit: 20,
  sameServicePrice: 15,
  samePayroll: 6,
  sameClient: 5,
  /** Máximo por palabras de la nota en común. */
  noteWords: 10,
};


const isSameAmount = (amountA: number | null, amountB: number | null) =>
  amountA !== null && amountB !== null && Math.abs(amountA - amountB) < AMOUNT_TOLERANCE;

const toWords = (text: string): string[] =>
  text.toLowerCase().replace(/[^a-z0-9#\s]/g, ' ').split(/\s+/).filter(Boolean);

/** Tipo de calle escrito completo → abreviado ("Drive" y "Dr" son la misma calle). */
const STREET_TYPE_ABBREVIATIONS: Record<string, string> = {
  street: 'st', drive: 'dr', avenue: 'ave', av: 'ave', road: 'rd', lane: 'ln', court: 'ct', circle: 'cir',
  trail: 'trl', boulevard: 'blvd', place: 'pl', parkway: 'pkwy', highway: 'hwy', terrace: 'ter', cove: 'cv',
};

const STREET_TYPES = new Set([...Object.values(STREET_TYPE_ABBREVIATIONS), 'loop', 'way', 'run', 'pass']);

/**
 * "401 twin" para "401 S Twin Creek Dr, Killeen, TX": número + primera palabra
 * del nombre, sin el punto cardinal. Si el nombre ES un punto cardinal
 * ("110 North Dr") se usa ese. null si no empieza con número.
 */
export const getStreetKey = (address: string): string | null => {
  const words = toWords(address)
    .filter((word) => !IGNORED_ADDRESS_WORDS.has(word))
    .map((word) => STREET_TYPE_ABBREVIATIONS[word] ?? word);
  const [houseNumber, ...restWords] = words;
  if (!houseNumber || !/^\d/.test(houseNumber)) return null;
  const streetWordIndex = restWords.findIndex((word) => !DIRECTION_WORDS.has(word));
  if (streetWordIndex < 0) return null;
  const isDirectionTheName = streetWordIndex > 0 && STREET_TYPES.has(restWords[streetWordIndex]);
  const streetWord = isDirectionTheName ? restWords[streetWordIndex - 1] : restWords[streetWordIndex];
  return `${houseNumber} ${streetWord}`;
};

/** Unidades que aparecen en el texto: "apt d" → "d", "unit 11g" → "11g", "#b" → "b". */
const getUnitTokens = (text: string): Set<string> => {
  const words = toWords(text);
  const unitTokens = new Set<string>();
  words.forEach((word, wordIndex) => {
    if (word.startsWith('#') && word.length > 1) unitTokens.add(word.slice(1));
    const nextWord = words[wordIndex + 1];
    if (UNIT_WORDS.has(word) && nextWord) unitTokens.add(nextWord.replace(/^#/, ''));
  });
  return unitTokens;
};

/** Parte de la nota que se compara: palabras de 3+ letras o con números ("3bds", "11g"). */
const getNoteWords = (text: string): Set<string> =>
  new Set(toWords(text).filter((word) => word.length >= 3 || /\d/.test(word)));

const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

const daysBetween = (isoDateA: string, isoDateB: string) =>
  Math.round(Math.abs(Date.parse(isoDateA) - Date.parse(isoDateB)) / DAY_MS);

/** Calle de la fila: de la dirección o, si la escribieron cambiada de lugar, de la nota. */
const getSheetRowStreetKey = (sheetRow: OperationsSheetRow) =>
  getStreetKey(sheetRow.address) ?? getStreetKey(sheetRow.note);

/** Qué tanto se parece una fila a un trabajo de la MISMA calle. */
const scorePair = (sheetRow: OperationsSheetRow, candidate: OperationsSheetJobCandidate): number => {
  let points = 0;
  const sheetText = `${sheetRow.address} ${sheetRow.note}`;
  const jobUnit = (candidate.job.unit ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const sheetUnits = getUnitTokens(sheetText);
  const sheetWords = getNoteWords(sheetText);
  const jobUnits = getUnitTokens(`${candidate.job.address} ${candidate.job.note ?? ''}`);
  if (jobUnit) jobUnits.add(jobUnit);
  if ([...jobUnits].some((unit) => sheetUnits.has(unit) || sheetWords.has(unit))) {
    points += MATCH_POINTS.sameUnit;
  }
  if (isSameAmount(sheetRow.servicePrice, candidate.amounts.servicePrice)) points += MATCH_POINTS.sameServicePrice;
  if (isSameAmount(sheetRow.payroll, candidate.amounts.payroll)) points += MATCH_POINTS.samePayroll;
  const sheetClient = normalizeName(sheetRow.client);
  const jobClient = normalizeName(candidate.clientName);
  if (sheetClient && jobClient && (sheetClient.startsWith(jobClient) || jobClient.startsWith(sheetClient))) {
    points += MATCH_POINTS.sameClient;
  }
  const sheetNoteWords = getNoteWords(sheetRow.note);
  const jobNoteWords = getNoteWords(candidate.job.note || candidate.job.generalNotes || '');
  const sharedWordCount = [...sheetNoteWords].filter((word) => jobNoteWords.has(word)).length;
  const noteSimilarity = sharedWordCount / Math.max(1, Math.min(sheetNoteWords.size, jobNoteWords.size));
  points += Math.round(noteSimilarity * MATCH_POINTS.noteWords);
  return points;
};

/** Empareja una sola vez cada fila y cada trabajo, primero los pares con más puntos. */
const assignPairs = (pairs: OperationsSheetCandidatePair[], usedSheetIndexes: Set<number>, usedCandidateIndexes: Set<number>) => {
  const assignedPairs: OperationsSheetCandidatePair[] = [];
  [...pairs]
    .sort((pairA, pairB) => pairB.points - pairA.points)
    .forEach((pair) => {
      if (usedSheetIndexes.has(pair.sheetIndex) || usedCandidateIndexes.has(pair.candidateIndex)) return;
      usedSheetIndexes.add(pair.sheetIndex);
      usedCandidateIndexes.add(pair.candidateIndex);
      assignedPairs.push(pair);
    });
  return assignedPairs;
};

/** Motivo de una diferencia, cuando se puede explicar. */
const explainDifference = (
  field: OperationsSheetAmountField,
  sheetRow: OperationsSheetRow,
  appAmounts: OperationsSheetAmounts,
): string | null => {
  const { servicePrice, taxes, finalCost } = sheetRow;
  if (sheetRow[field] === null) return 'Empty in Excel';
  if (field !== 'taxes' && sheetRow[field] === 0) return 'Excel shows $0.00';
  if (field === 'taxes' && appAmounts.taxes === 0 && (taxes ?? 0) > 0) return 'Tax exempt in the app';
  if (field === 'taxes' && (taxes ?? 0) === 0 && appAmounts.taxes > 0) return 'No tax in Excel';
  if ((field === 'taxes' || field === 'finalCost') && !isSameAmount(servicePrice, appAmounts.servicePrice)) {
    return 'Follows the Service Price difference';
  }
  const isTaxAddedInApp = appAmounts.taxes > 0 && isSameAmount(appAmounts.finalCost, appAmounts.servicePrice + appAmounts.taxes);
  const isTaxSubtractedInApp = appAmounts.taxes > 0 && isSameAmount(appAmounts.finalCost, appAmounts.servicePrice - appAmounts.taxes);
  if (field === 'finalCost' && servicePrice !== null && taxes !== null && taxes > 0) {
    if (isSameAmount(finalCost, servicePrice + taxes) && isTaxSubtractedInApp) return 'Excel adds the tax · Apply Tax is No in the app';
    if (isSameAmount(finalCost, servicePrice - taxes) && isTaxAddedInApp) return 'Excel subtracts the tax · Apply Tax is Yes in the app';
  }
  if (field === 'taxes' && servicePrice !== null && taxes !== null && taxes > 0
    && !isSameAmount(taxes, round2(servicePrice * TAX_RATE))) {
    return 'Excel tax is not 8.25% of the price';
  }
  if (field === 'finalCost' && !isSameAmount(taxes, appAmounts.taxes)) return 'Follows the Taxes difference';
  return null;
};

const getDifferences = (sheetRow: OperationsSheetRow, appAmounts: OperationsSheetAmounts): OperationsSheetAmountDifference[] =>
  AMOUNT_FIELDS
    .filter((field) => !isSameAmount(sheetRow[field] ?? 0, appAmounts[field]))
    .map((field) => ({
      field,
      sheetValue: sheetRow[field],
      appValue: appAmounts[field],
      reason: explainDifference(field, sheetRow, appAmounts),
    }));

/** Fecha y fila de la hoja; los de solo app al final por fecha. */
const compareMatches = (matchA: OperationsSheetMatch, matchB: OperationsSheetMatch) => {
  const dateA = matchA.sheetRow?.date ?? matchA.job?.scheduleDate ?? '';
  const dateB = matchB.sheetRow?.date ?? matchB.job?.scheduleDate ?? '';
  return dateA.localeCompare(dateB)
    || (matchA.sheetRow?.rowNumber ?? Number.MAX_SAFE_INTEGER) - (matchB.sheetRow?.rowNumber ?? Number.MAX_SAFE_INTEGER);
};

/**
 * Compara las filas de la hoja con los trabajos de la app. Ambas listas deben
 * venir ya filtradas al mismo periodo.
 */
export const compareOperationsSheet = (
  sheetRows: readonly OperationsSheetRow[],
  jobs: readonly Property[],
  sources: OperationsSheetCompareSources,
): OperationsSheetComparison => {
  const candidates: OperationsSheetJobCandidate[] = jobs.flatMap((job) => {
    const streetKey = getStreetKey(job.address ?? '');
    return streetKey
      ? [{ job, streetKey, amounts: sources.getAppAmounts(job), clientName: sources.getClientName(job) }]
      : [];
  });
  const sheetStreetKeys = sheetRows.map(getSheetRowStreetKey);
  const usedSheetIndexes = new Set<number>();
  const usedCandidateIndexes = new Set<number>();

  const buildPairs = (isSameDateOnly: boolean): OperationsSheetCandidatePair[] => {
    const pairs: OperationsSheetCandidatePair[] = [];
    sheetRows.forEach((sheetRow, sheetIndex) => {
      if (usedSheetIndexes.has(sheetIndex) || !sheetStreetKeys[sheetIndex]) return;
      candidates.forEach((candidate, candidateIndex) => {
        if (usedCandidateIndexes.has(candidateIndex) || candidate.streetKey !== sheetStreetKeys[sheetIndex]) return;
        const dayDifference = daysBetween(sheetRow.date, candidate.job.scheduleDate);
        if (isSameDateOnly ? dayDifference !== 0 : dayDifference > MAX_DATE_SHIFT_DAYS) return;
        // Entre fechas movidas gana la más cercana.
        const points = scorePair(sheetRow, candidate) - dayDifference;
        pairs.push({ sheetIndex, candidateIndex, points });
      });
    });
    return pairs;
  };

  const sameDatePairs = assignPairs(buildPairs(true), usedSheetIndexes, usedCandidateIndexes);
  const shiftedDatePairs = assignPairs(buildPairs(false), usedSheetIndexes, usedCandidateIndexes);

  const toMatch = (pair: OperationsSheetCandidatePair, isDateShifted: boolean): OperationsSheetMatch => {
    const sheetRow = sheetRows[pair.sheetIndex];
    const candidate = candidates[pair.candidateIndex];
    const differences = getDifferences(sheetRow, candidate.amounts);
    const status: OperationsSheetMatchStatus = differences.length > 0 || isDateShifted ? 'different' : 'ok';
    return {
      key: `${sheetRow.sheetName}-${sheetRow.rowNumber}-${candidate.job.id}`,
      status,
      sheetRow,
      job: candidate.job,
      appAmounts: candidate.amounts,
      differences,
      isDateShifted,
    };
  };

  const sheetOnlyMatches: OperationsSheetMatch[] = sheetRows
    .filter((_sheetRow, sheetIndex) => !usedSheetIndexes.has(sheetIndex))
    .map((sheetRow) => ({
      key: `${sheetRow.sheetName}-${sheetRow.rowNumber}`,
      status: 'sheetOnly',
      sheetRow,
      job: null,
      appAmounts: null,
      differences: [],
      isDateShifted: false,
    }));
  const matchedJobIds = new Set([...usedCandidateIndexes].map((candidateIndex) => candidates[candidateIndex].job.id));
  const appOnlyMatches: OperationsSheetMatch[] = jobs
    .filter((job) => !matchedJobIds.has(job.id))
    .map((job) => ({
      key: `app-${job.id}`,
      status: 'appOnly',
      sheetRow: null,
      job,
      appAmounts: sources.getAppAmounts(job),
      differences: [],
      isDateShifted: false,
    }));

  const matches = [
    ...sameDatePairs.map((pair) => toMatch(pair, false)),
    ...shiftedDatePairs.map((pair) => toMatch(pair, true)),
    ...sheetOnlyMatches,
    ...appOnlyMatches,
  ].sort(compareMatches);

  const counts: Record<OperationsSheetMatchStatus, number> = { ok: 0, different: 0, sheetOnly: 0, appOnly: 0 };
  matches.forEach((match) => { counts[match.status] += 1; });

  return {
    matches,
    counts,
    sheetFinalCostTotal: round2(sheetRows.reduce((total, sheetRow) => total + (sheetRow.finalCost ?? 0), 0)),
    appFinalCostTotal: round2(jobs.reduce((total, job) => total + sources.getAppAmounts(job).finalCost, 0)),
  };
};
