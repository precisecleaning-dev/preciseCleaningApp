import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ⭐ SELLO DE VERSIÓN: fecha/hora exacta del `vite build`. Se inyecta en el
//    código (__BUILD_TIME__) y se publica en /version.json. La app compara
//    ambos periódicamente: si difieren, hay versión nueva desplegada y se
//    avisa a TODOS los usuarios para que recarguen.
const BUILD_TIME = new Date().toISOString()

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  plugins: [
    {
      // Publica dist/version.json con el mismo sello del bundle.
      name: 'emit-version-json',
      apply: 'build' as const,
      closeBundle() {
        writeFileSync(
          resolve(__dirname, 'dist/version.json'),
          JSON.stringify({ buildTime: BUILD_TIME }),
        )
      },
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'Precise Cleaning',
        short_name: 'Precise',
        start_url: '/',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,

        // ⭐ CAUSA DEL ERROR "Failed to load module script ... MIME type text/html".
        //
        //    Sin estas tres opciones, tras cada deploy el Service Worker seguia
        //    sirviendo el index.html VIEJO desde cache. Ese HTML apunta a chunks
        //    con hash antiguo (CalendarView-6WCxUFrI.js) que ya no existen en
        //    ./dist. Cloudflare, con "not_found_handling: single-page-application",
        //    responde index.html a CUALQUIER ruta desconocida — incluidos los
        //    .js — asi que el navegador recibe HTML donde esperaba JavaScript.

        // 1. Borra los precaches de compilaciones anteriores en vez de acumularlos.
        cleanupOutdatedCaches: true,
        // 2. El SW nuevo toma el control de inmediato, sin esperar a que se
        //    cierren todas las pestanas (que en una PWA instalada puede no pasar
        //    en dias).
        skipWaiting: true,
        clientsClaim: true,
        // 3. El fallback a index.html es SOLO para rutas de navegacion. Sin este
        //    denylist, una peticion de /assets/algo.js que falla tambien recibia
        //    index.html desde el propio SW, reproduciendo el error incluso
        //    estando offline el servidor.
        navigateFallbackDenylist: [/^\/assets\//, /^\/api\//, /\.[a-zA-Z0-9]+$/],
      },
    }),
  ],
})