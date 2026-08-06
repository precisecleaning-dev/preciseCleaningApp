import type { Status } from '../types/index';

// ============================================================================
// ⭐ ESTADOS PERMITIDOS POR VISTA.
//
// Algunas vistas no deben ofrecer TODOS los estados al cambiar el status de una
// casa: desde el flujo de calidad no tiene sentido saltar a "Schedule Pending" o
// "Pending Assessment". Antes cada vista mostraba el catálogo completo y la
// restricción era una convención mental, no una regla del código.
//
// Los estados se resuelven por NOMBRE porque los ids son generados por Firestore
// y varían entre entornos; el nombre es lo que el usuario configura y ve.
// ============================================================================

/** Normaliza un nombre de estado para comparar sin importar mayúsculas/acentos sueltos. */
const norm = (v?: string | null): string => String(v || '').toLowerCase().trim();

/** ¿El nombre corresponde al estado "Quality Check"? (acepta el alias "QC") */
export const isQualityCheckName = (name?: string | null): boolean => {
  const n = norm(name);
  return n === 'qc' || n.includes('quality check') || n.includes('quality-check');
};

/** ¿El nombre corresponde a "Recall"? */
export const isRecallName = (name?: string | null): boolean => norm(name).includes('recall');

/** ¿El nombre corresponde a "Invoice"? */
export const isInvoiceName = (name?: string | null): boolean => norm(name) === 'invoice';

/** ¿El nombre corresponde a "In Progress"? */
export const isInProgressName = (name?: string | null): boolean => {
  const n = norm(name);
  return n === 'in progress' || n === 'in-progress';
};

/**
 * Estados que la vista Quality Check permite asignar:
 * In Progress · Quality Check · Recall · Invoice.
 *
 * Se devuelven en ese orden (el orden lógico del flujo), no en el del catálogo.
 */
export const qualityCheckAllowedStatuses = (statuses: Status[]): Status[] => {
  const order = [isInProgressName, isQualityCheckName, isRecallName, isInvoiceName];
  return order
    .map(match => statuses.find(st => match(st.name)))
    .filter((st): st is Status => !!st);
};

/**
 * Estados que la vista Quality Check Reports permite asignar:
 * Quality Check · Recall · Invoice. (Sin "In Progress": un reporte ya terminado
 * no vuelve a la casa a trabajo en curso.)
 */
export const qcReportsAllowedStatuses = (statuses: Status[]): Status[] => {
  const order = [isQualityCheckName, isRecallName, isInvoiceName];
  return order
    .map(match => statuses.find(st => match(st.name)))
    .filter((st): st is Status => !!st);
};
