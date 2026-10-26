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
// pcRepairAssets lleva su propio tope (2 intentos por minuto, en
// sessionStorage): si el fallo sigue no entra en un bucle de recargas, y el
// error se deja pasar para que sea visible.
// ============================================================================

/** URL del chunk que no cargó, sacada del mensaje del error de Vite. */
const getFailedChunkUrl = (error: unknown): string | undefined => {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /https?:\/\/\S+\.(?:js|css)/.exec(message)?.[0]
}

window.addEventListener('vite:preloadError', (event) => {
  const isRepairStarted = window.pcRepairAssets?.(getFailedChunkUrl(event.payload)) ?? false
  // Sin reparación (intentos agotados) el error sigue su curso y se ve.
  if (isRepairStarted) event.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)