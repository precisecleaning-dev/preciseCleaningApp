// src/shared/utils/connectivity.ts
// ¿El equipo está de verdad sin conexión? `navigator.onLine === false` no
// siempre es cierto: el navegador puede marcar "sin conexión" con internet
// funcionando (VPN o adaptadores de red virtuales, al despertar la computadora,
// al volver a la app en el teléfono). Antes de no guardar, o de dejar una foto
// en la cola, se confirma con una consulta rápida al servidor de la app: si
// contesta, hay conexión.
// Si el navegador dice que SÍ hay conexión no se consulta nada: se intenta
// guardar y, si falla, cada pantalla maneja su error como antes.

/** Archivo chico que el servidor siempre sirve (lo publica el build). En
 *  `npm run dev` responde 404, que también cuenta: el servidor contestó. */
const CONNECTIVITY_PROBE_URL = '/version.json';

/** Sin respuesta en este tiempo se toma como sin conexión. */
const CONNECTIVITY_PROBE_TIMEOUT_MS = 3000;

const canReachAppServer = async (): Promise<boolean> => {
  const abortController = new AbortController();
  const timeoutId = window.setTimeout(() => abortController.abort(), CONNECTIVITY_PROBE_TIMEOUT_MS);
  try {
    // no-store + parámetro único: la respuesta viene de la red, no del
    // Service Worker ni del caché del navegador.
    await fetch(`${CONNECTIVITY_PROBE_URL}?probe=${Date.now()}`, {
      method: 'HEAD',
      cache: 'no-store',
      signal: abortController.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

/** true solo si el navegador dice "sin conexión" Y el servidor de la app no contesta. */
export const isDeviceOffline = async (): Promise<boolean> => {
  if (typeof navigator === 'undefined' || navigator.onLine) return false;
  return !(await canReachAppServer());
};
