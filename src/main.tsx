import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// ============================================================================
// ⭐ RECUPERACION AUTOMATICA TRAS UN DEPLOY
//
// Caso 1 — una pestaña que YA estaba abierta cuando se publicó una versión
// nueva: su index.html en memoria apunta a chunks con hash viejo y, al abrir
// una vista de carga diferida (React.lazy), el import falla con
//   "Failed to fetch dynamically imported module .../assets/CalendarView-XXXX.js"
// Vite emite `vite:preloadError` en ese momento.
//
// Caso 2 — el chunk quedó GUARDADO MAL: durante un deploy Cloudflare respondió
// index.html en lugar del archivo y el navegador lo guardó un año como si fuera
// el JavaScript. Recargar no basta: hay que quitar el Service Worker y pedir el
// archivo de nuevo al servidor. Eso lo hace `window.pcRepairAssets`, definido
// en index.html (allí también atiende el caso de que no cargue el bundle
// principal, que aquí no se puede detectar porque este archivo no llegaría a
// correr).
//
// pcRepairAssets solo repara si la copia guardada es HTML y lleva su propio
// tope (2 intentos por minuto, en sessionStorage): si el fallo sigue no entra
// en un bucle de recargas. El error sigue su curso: si hubo reparación, la
// página se recarga sola; si no (mala señal), ViewErrorBoundary (App.tsx)
// muestra el aviso con "Reload" en vez de dejar la app en blanco.
// ============================================================================

// index.html no programa su recarga automática si la app ya arrancó.
window.pcIsAppStarted = true

/** Ruta de un archivo de /assets/ en el mensaje: absoluta ("Failed to fetch
 *  dynamically imported module: https://…/assets/x.js") o relativa ("Unable to
 *  preload CSS for /assets/x.css"). */
const ASSET_PATH_PATTERN = /(?:https?:\/\/[^\s'"]+)?\/assets\/[^\s'"]+?\.(?:js|css)\b/

/** URL completa del chunk que no cargó, sacada del mensaje del error de Vite. */
const getFailedChunkUrl = (error: unknown): string | undefined => {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const assetPath = ASSET_PATH_PATTERN.exec(message)?.[0]
  return assetPath ? new URL(assetPath, window.location.href).href : undefined
}

window.addEventListener('vite:preloadError', (event) => {
  void window.pcRepairAssets?.(getFailedChunkUrl(event.payload))
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)