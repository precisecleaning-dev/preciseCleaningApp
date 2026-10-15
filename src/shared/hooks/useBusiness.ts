import { useSyncExternalStore } from 'react';
import { BUSINESSES, type BusinessName } from '../utils/businesses';

// La empresa elegida en las pestañas Normal / Cavalry: una sola para toda la
// app y recordada en este navegador.
const STORAGE_KEY = 'pc.business';

function readSaved(): BusinessName {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return BUSINESSES.find((b) => b === saved) ?? 'Normal';
  } catch {
    return 'Normal';
  }
}

let current: BusinessName = readSaved();
const listeners = new Set<() => void>();

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
};
const getCurrent = () => current;

export function useBusiness(): BusinessName {
  return useSyncExternalStore(subscribe, getCurrent);
}

export function setBusiness(next: BusinessName): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // sin localStorage: se queda solo para esta sesión
  }
  listeners.forEach((notify) => notify());
}
