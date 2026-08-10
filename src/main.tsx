import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// ============================================================================
// ⭐ RECUPERACION AUTOMATICA TRAS UN DEPLOY
//
// Aunque el Service Worker ya se limpia solo (ver vite.config.ts), queda un
// caso que la configuracion no puede cubrir: una pestana que YA estaba abierta
// cuando se publico una version nueva. Ese documento tiene en memoria un
// index.html que apunta a chunks con hash viejo; al navegar a una vista con
// carga diferida (React.lazy), el import falla con:
//
//   "Failed to fetch dynamically imported module .../assets/CalendarView-XXXX.js"
//
// Vite emite `vite:preloadError` justo en ese momento. La unica salida real es
// recargar para pedir el index.html nuevo.
//
// El guard con sessionStorage es importante: si el fallo fuese permanente (por
// ejemplo un chunk realmente ausente del deploy), recargar sin freno dejaria la
// pagina en un bucle infinito de recargas. Con esto se intenta UNA vez por
// sesion; si vuelve a fallar, se deja pasar el error para que sea visible.
// ============================================================================
const RELOAD_FLAG = 'pc:chunk-reload'

window.addEventListener('vite:preloadError', (event) => {
  if (sessionStorage.getItem(RELOAD_FLAG)) {
    // Ya se reintento en esta sesion: no recargar otra vez.
    console.error('Chunk no disponible tras recargar. Revisa el deploy.', event)
    return
  }
  sessionStorage.setItem(RELOAD_FLAG, '1')
  event.preventDefault()
  window.location.reload()
})

// Si la app arranca bien, se limpia la marca para que un futuro deploy vuelva a
// tener su reintento disponible.
window.addEventListener('load', () => {
  sessionStorage.removeItem(RELOAD_FLAG)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)