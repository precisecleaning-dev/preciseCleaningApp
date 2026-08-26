// ============================================================================
// ⭐ AVISO DE VERSIÓN NUEVA PARA TODOS LOS USUARIOS.
//
// Cada build inyecta su sello (__BUILD_TIME__) en el código Y lo publica en
// /version.json. Este hook consulta version.json periódicamente (y cada vez
// que la pestaña recupera el foco): si el sello publicado difiere del que
// corre en memoria, hay una versión nueva desplegada → la app muestra el
// banner "Nueva versión disponible" a TODOS los usuarios conectados para que
// recarguen. El fetch usa no-store + un parámetro único para saltarse el
// Service Worker y cualquier caché.
// ============================================================================
import { useEffect, useState } from 'react';

const CHECK_EVERY_MS = 4 * 60 * 1000; // cada 4 minutos

/** Recarga limpia: desregistra el Service Worker para que el bundle nuevo
 *  entre completo (JS + CSS parejos) y recarga la página. */
export const reloadForUpdate = async (): Promise<void> => {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    if (regs && regs.length > 0) {
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* sin SW o sin permiso: la recarga normal basta */
  }
  window.location.reload();
};

export function useVersionCheck(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as { buildTime?: string };
        if (cancelled || !data.buildTime) return;
        if (data.buildTime !== __BUILD_TIME__) setUpdateAvailable(true);
      } catch {
        /* sin red: se reintenta en el siguiente ciclo */
      }
    };

    check();
    const interval = setInterval(check, CHECK_EVERY_MS);
    const onFocus = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  return updateAvailable;
}
