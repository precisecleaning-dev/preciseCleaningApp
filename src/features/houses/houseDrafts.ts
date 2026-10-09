// src/features/houses/houseDrafts.ts
import type { PayrollRecord, Property } from '../../types/index';
import type { ServiceRecord } from './serviceRecords';

// ============================================================================
// ⭐ BORRADORES del formulario de casas (localStorage, por dispositivo).
//    Guardan formData + servicios + pagos capturados para retomar la orden
//    tal cual iba si el usuario sale del formulario (a propósito o por error).
// ============================================================================
export interface HouseDraft {
  id: string;
  savedAt: string;
  label: string;
  formData: Property;
  formServices: ServiceRecord[];
  housePayrollRecords: PayrollRecord[];
}

const DRAFTS_KEY = "pc_house_form_drafts_v1";
export const DRAFTS_MAX = 10;

export const loadDrafts = (): HouseDraft[] => {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    const list = raw ? (JSON.parse(raw) as HouseDraft[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

export const persistDrafts = (list: HouseDraft[]): void => {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(list.slice(0, DRAFTS_MAX)));
  } catch {
    /* almacenamiento lleno: el borrador más viejo se pierde, nada más */
  }
};
