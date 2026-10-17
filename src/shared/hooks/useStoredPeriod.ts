import { useCallback, useState } from 'react';
import { loadPeriod, savePeriod, type PeriodKind, type PeriodState } from '../../utils/periods';

/**
 * Periodo de una PeriodBar que se recuerda en el navegador (Day / Week / Month /
 * Year / Custom y las fechas de Custom; al volver, el ancla es HOY).
 * `storageKey` distingue cada pantalla; `fallbackKind` es el periodo la primera vez.
 */
export function useStoredPeriod(storageKey: string, fallbackKind: PeriodKind): [PeriodState, (period: PeriodState) => void] {
  const [period, setPeriodState] = useState<PeriodState>(() => loadPeriod(storageKey, fallbackKind));
  const setPeriod = useCallback((nextPeriod: PeriodState) => {
    setPeriodState(nextPeriod);
    savePeriod(storageKey, nextPeriod);
  }, [storageKey]);
  return [period, setPeriod];
}
