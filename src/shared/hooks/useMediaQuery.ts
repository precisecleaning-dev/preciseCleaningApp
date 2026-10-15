import { useSyncExternalStore } from 'react';

/** Pantalla de teléfono: el mismo corte que usan los CSS de las tablas (48rem = 768px). */
export const PHONE_QUERY = '(max-width: 48rem)';

/**
 * ¿Se cumple la media query? Se actualiza al girar el teléfono o cambiar el
 * ancho de la ventana. Sirve para dibujar SOLO la tabla o SOLO las tarjetas,
 * en vez de las dos con una escondida por CSS (el doble de trabajo de render).
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
