// firebase/functions se baja la primera vez que se llama una Cloud Function,
// no al abrir la vista de casas (lo usan el Sync del Calendar, su panel de
// pruebas y el envío de invoices por correo).
import type { HttpsCallableOptions } from 'firebase/functions';

/** `options.timeout` (ms): cuánto espera la app la respuesta (Firebase: 70 s por defecto). */
export async function callable(name: string, options?: HttpsCallableOptions) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  return httpsCallable(getFunctions(), name, options);
}
