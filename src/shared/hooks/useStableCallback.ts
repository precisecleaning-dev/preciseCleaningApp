import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Función con identidad FIJA que siempre llama a la versión más reciente de
 * `fn`. Sirve para pasar handlers a hijos con `memo` (filas, tarjetas): el hijo
 * no se vuelve a dibujar porque el padre cambió, y el handler nunca usa datos
 * viejos. Solo para llamar en eventos, no durante el render.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
