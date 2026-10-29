// src/types/global.d.ts
// Lo que agrega el script de index.html a `window` (no es un tipo de datos:
// por eso no va en index.ts).
export {};

declare global {
  interface Window {
    /** Definido por el script de index.html: si la copia guardada del archivo es
     *  HTML, quita el Service Worker y su caché, vuelve a pedir los archivos de
     *  /assets/ y recarga (con tope por sesión). false = no se hizo nada (no era
     *  una copia mala, sin conexión o se agotaron los intentos). */
    pcRepairAssets?: (failedUrl?: string) => Promise<boolean>;
    /** main.tsx ya corrió: con la app arrancada index.html no programa su
     *  recarga automática (se perdería un formulario sin guardar). */
    pcIsAppStarted?: boolean;
  }
}
