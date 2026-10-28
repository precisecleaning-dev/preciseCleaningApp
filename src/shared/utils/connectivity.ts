// src/shared/utils/connectivity.ts
// ¿El equipo está de verdad sin conexión? `navigator.onLine === false` no
// siempre es cierto: el navegador puede marcar "sin conexión" con internet
// funcionando (VPN o adaptadores de red virtuales, al despertar la computadora,
// al volver a la app en el teléfono). Antes de no guardar, o de dejar una foto
// en la cola, se confirma con una consulta rápida al servidor de la app: si
// contesta, hay conexión.
// Si el navegador dice que SÍ hay conexión no se consulta nada: se intenta
// guardar y, si falla, cada pantalla maneja su error como antes.
// Límite conocido: el portal de un wifi (hoteles, edificios) contesta la
// consulta con su página de acceso, así que cuenta como "hay conexión" aunque
// Firestore no llegue; ahí cada pantalla maneja el error al guardar.
// El resultado se guarda unos segundos (PROBE_RESULT_TTL_MS): varias llamadas
// seguidas (la cola de fotos revisa antes de cada foto) comparten una consulta.

/** Archivo chico que el servidor siempre sirve (lo publica el build). En
 *  `npm run dev` responde 404, que también cuenta: el servidor contestó. */
const CONNECTIVITY_PROBE_URL = '/version.json';

/** Sin respuesta en este tiempo se toma como sin conexión. */
const CONNECTIVITY_PROBE_TIMEOUT_MS = 3000;

/** Cuánto vale el resultado de una consulta para las llamadas que siguen. */
const PROBE_RESULT_TTL_MS = 5000;

/** Última consulta (también la que sigue en camino) y cuándo empezó. */
let lastProbe: { startedAtMs: number; canReachServer: Promise<boolean> } | null = null;

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

/** Reusa la consulta de hace menos de PROBE_RESULT_TTL_MS (o la que sigue en camino). */
const canReachAppServerCached = (): Promise<boolean> => {
  const nowMs = Date.now();
  if (lastProbe && nowMs - lastProbe.startedAtMs < PROBE_RESULT_TTL_MS) return lastProbe.canReachServer;
  lastProbe = { startedAtMs: nowMs, canReachServer: canReachAppServer() };
  return lastProbe.canReachServer;
};

/** true solo si el navegador dice "sin conexión" Y el servidor de la app no contesta. */
export const isDeviceOffline = async (): Promise<boolean> => {
  if (typeof navigator === 'undefined' || navigator.onLine) return false;
  return !(await canReachAppServerCached());
};
