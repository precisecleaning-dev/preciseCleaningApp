# Code Review Notes — Precise Cleaning App

Notas persistentes para la revisión progresiva de calidad de código React: buenas prácticas,
funcionalidad, lógica/algoritmia, decisiones de "un componente por archivo vs. varios en el
mismo archivo", y semántica del JSX (componentes/tags nativos de HTML en vez de `<div>` genéricos
donde haya una opción más significativa).

Ver `css-notes.md` para el historial de la limpieza de estilos inline (tarea previa, ya cerrada).

## Auditoría de rendimiento, Firebase y caché (2026-10-09) — Fase 1

Punto de partida: commit `2e4f005` (rama `fix/google-calendar-sync`) + el CLAUDE.md nuevo.
Fase 1 es solo lectura: no se modificó código. Plan priorizado al final de esta sección.

### 1. Línea base

| Dato | Valor |
|---|---|
| React / React DOM | 19.2.4 (sin React Compiler) |
| TypeScript | 5.9.3 (`strict` activo) |
| Firebase | 12.11.0 (SDK modular) |
| Vite | 7.3.1 (+ vite-plugin-pwa 1.3.0, `cssCodeSplit: false`) |
| `tsc -b` / `tsc --noEmit -p tsconfig.app.json` | 0 errores / 0 errores |
| `eslint .` | **195 problemas: 171 errores, 24 avisos** en 29 archivos |
| Archivos JS en `dist/assets` | 87 (+1 CSS) |

eslint por regla: `no-explicit-any` 139 · directivas `eslint-disable` sin uso 14 · `no-useless-escape` 13 ·
`no-unused-vars` 12 · `exhaustive-deps` 10 · `no-unused-expressions` 2 · `prefer-const` 2 · `no-empty` 2 ·
`set-state-in-effect` 1. Archivos con más problemas: QualityCheckView 56, dateFormat 17, App 16,
HousesView 12, StatusHistoryView 11, SettingsView 10.

**Carga inicial (lo que baja `index.html` antes de pintar):**

| Archivo | Tamaño | gzip |
|---|---|---|
| `index-*.js` (arranque) | 703.8 kB | 218.5 kB |
| `style-*.css` (todo el CSS, a propósito) | 423.7 kB | 72.0 kB |

Composición del chunk de arranque (sourcemap): `@firebase/firestore` 261 kB · `react-dom` 178 kB ·
`@firebase/auth` 75 kB · `webchannel-wrapper` 50 kB · **`@firebase/storage` 31 kB (no se usa al arrancar)** ·
App.tsx 12 kB · resto < 10 kB c/u.

**Chunks pesados al abrir una vista:**

| Chunk | Tamaño | gzip | Qué lo hace pesado / quién lo carga |
|---|---|---|---|
| `ShareReportSheet-*.js` | **1,001 kB** | 290 kB | `html2pdf.js` 753 kB + `html2canvas` 198 kB, importados **estáticamente** por `utils/pdfGenerator.ts`. Se baja al abrir Quality Check, QC Reports o QC Dashboard aunque no se genere ningún PDF. |
| `DataImportView-*.js` | 329 kB | 110 kB | `xlsx` 276 kB + `papaparse` 19 kB. Solo admins; ya es lazy. |
| `HousesView-*.js` | 179 kB | 47 kB | HousesView.tsx (9,231 líneas) 144 kB. |
| `QualityCheckHub-*.js` | 87 kB | 27 kB | QualityCheckView + QCRouteDrawer. |

### 2. Firebase

**Inicialización** (`src/config/firebase.ts`): SDK modular, una sola inicialización.
`initializeFirestore` con `persistentLocalCache` + `persistentMultipleTabManager` y
`CACHE_SIZE_UNLIMITED` → **la caché persistente está activa**. Auth con `initializeAuth`
(IndexedDB + localStorage). `getStorage(app)` se crea en el arranque (ver Carga).
La config está escrita en el archivo, no en `import.meta.env.VITE_FIREBASE_*` (no es secreta;
el `.env` de la raíz no es un archivo de variables sino un fragmento de JS de ejemplo, y está en .gitignore).
Al cerrar sesión **no** se ejecuta `terminate` + `clearIndexedDbPersistence`: los datos de clientes
quedan en IndexedDB del equipo.

**Totales de llamadas de lectura (código vivo, sin contar los archivos muertos de la sección 5):**
69 `onSnapshot` · 47 `getDocs` · 8 `getDoc` · 2 `getDocsCacheFirst`.
De 113 lecturas sobre colecciones, **111 no tienen `limit`** y **98 no tienen ni `where` ni `limit`**
(descargan la colección completa). `getCountFromServer`/`getAggregateFromServer`: 0. Todos los
`onSnapshot` revisados devuelven su `unsubscribe` en el cleanup (no hay fugas).

Nota sobre el costo: el SDK comparte internamente un listener idéntico mientras dos componentes lo
tienen abierto, así que dos `onSnapshot` iguales montados a la vez NO cobran doble. Lo que sí cobra:
(a) cada `getDocs` sin filtro va al servidor y cobra **todos** los documentos en cada visita;
(b) cada listener que se cierra al cambiar de vista y se vuelve a abrir más de 30 min después se
cobra completo otra vez.

**Inventario por colección** (W = `where`, L = `limit`; "listener" = onSnapshot, "lectura" = getDocs/getDoc):

| Colección | Tamaño | Dónde se lee | Problema |
|---|---|---|---|
| `properties` | ~3,600 docs (según comentarios del código) | **App.tsx:180 listener global sin filtro**; PayrollView:474 **2º listener completo**; HousesView:1129 getDoc; MigrarPayroll getDocs completo; propertiesService.getAll (sin uso en vistas) | Cada sesión nueva cobra los ~3,600. El de PayrollView duplica el de App (los datos ya llegan por props). |
| `quality_checks` | desconocido (crece con cada inspección) | listeners completos: QualityDashboardView:112, jobQuality.ts:43 (Overview), homeData.ts:128 (Owner/Manager), QCReportsTableView:125 (L); **getDocs completos en cada visita**: RecallsView:217, QCRouteView:116; QualityCheckView:429 `getDocsCacheFirst` (pinta del caché pero **siempre** hace un getDocs completo en segundo plano); qcRecordSync (W); QualityCheckView getDoc ×2 | Se baja completa al entrar a Quality Check, Recalls y QC Route; 3 listeners distintos que se abren/cierran al navegar. |
| `status_history` | desconocido (1 doc por cada cambio de status; la más grande probablemente) | **jobRecall.ts:34 getDocs completo** (Overview y QC Dashboard) — y se repite cada vez que cambia `statuses` (≥2 veces por visita); RecallsView:219 getDocs completo; statusHistoryService (W, bien) | Se descarga toda la historia solo para saber qué casas pasaron por Recall. Se puede filtrar en el servidor por `toStatusId`/`toStatusName`. |
| `recalls` | desconocido | jobRecall.ts:35 y RecallsView:218, getDocs completos | Igual que arriba. |
| `billing_services` | ~1–2 por casa | **jobFinancials.ts:72 listener completo** (Overview, Invoices, Owner, Manager); StatusHistoryView:83 listener completo; HousesView ×3 y PropertyDetailModal (W, bien) | Colección completa en 2 listeners de vistas distintas. |
| `payroll` | ~1–2 por casa | **jobFinancials.ts:80 listener completo**; PayrollView:458 y StatusHistoryView:97 listeners completos; payrollService:36 getDocs completo; MigrarPayroll ×2; PropertyDetailModal y payrollService:26 (W) | Igual. |
| `customers` | desconocido | **9 listeners** (NoStatus, Payroll, Invoices, Houses, StatusHistory, QCReportsTable, QualityDashboard, homeData) + **getDocs completos**: PropertyDetailModal (en **cada apertura** del detalle), RecallsView, QCRouteView, customersService.getAll (Customers, Calendar), QualityCheckView (`getDocsCacheFirst` + refresco completo) | Catálogo grande sin listener global: se re-descarga al cambiar de vista y al abrir un detalle. |
| `system_users` | pequeña | App.tsx:218 (W, perfil, bien); listeners completos en ActivityLog, Payroll, Houses, QualityDashboard, homeData; getDocs completos en PropertyDetailModal (cada apertura), ViewAsUserModal, NoticeBoard, Settings, Users; usersService (W) | Duplicado en 10 lugares. |
| `settings_statuses` / `settings_teams` | pequeñas | 8 listeners cada una + 3/2 getDocs (PropertyDetailModal en cada apertura, Recalls, Roles) | Catálogo que casi no cambia, leído en ~10 lugares. |
| `settings_services` / `settings_products` / `settings_priorities` / `settings_tax` / `settings_places` / `settings_tasks` | pequeñas | 2–5 lugares c/u (listeners + getDocs en PropertyDetailModal, HousesView:1918/1921, SettingsView) | Igual. |
| `settings_roles` | pequeña | App.tsx:153 listener global; **HousesView:1453 2º listener** (llega por props); homeData:127; RolesView getDocs | Duplicado. |
| `settings_company/main` | 1 doc (**logo en base64 dentro del doc**) | companyService (getDoc + listener + copia en localStorage); getDoc directo en QualityCheckView, QCReportsTableView, QualityDashboardView | El logo se guarda en Firestore como data URL (regla: imágenes a Storage). |
| `app_settings/*` | 2 docs | HousesView:1417/1436 listeners; photoConfigService getDoc | OK. |
| `checklists`, `damages` | por casa | HousesView (W, al abrir el detalle) | OK. |
| `qc_routes` | desconocido | QCRoutesTableView listener completo; QCRouteView getDocs completo; liveRoute doc | Aceptable (pocas rutas), sin `limit`. |
| `manager_tasks`, `time_clock` | nuevas | services propios; `time_clock` con W por semana | `manager_tasks` sin filtro (pequeña por ahora). |
| `activity_logs` | grande | activityLogService (orderBy + limit + cursores) | **Bien** (el único ejemplo correcto de paginación). |
| `trash` | desconocido | trashService (orderBy, sin limit) | Sin límite. |
| `announcements`, `announcement_comments` | pequeñas | NoticeBoardView getDocs (vista sin acceso desde el menú) | — |
| `payroll_records` | legado | MigrarPayroll (herramienta temporal) | — |

**HousesView en modo `modals-only`** se monta además en Quality Check, QC Dashboard y Owner/Manager
para abrir el detalle de una casa: abre sus 11 listeners de catálogos (statuses, teams, priorities,
services, products, tax, customers, system_users, app_settings ×2, roles) aunque no se abra ningún modal.

**Lecturas N+1 y escrituras:**
- No hay lecturas `await getDoc` dentro de loops. Sí hay **escrituras secuenciales en loops** que deberían ir en `writeBatch`:
  HousesView:3760–3800 (al guardar una casa: borra, **actualiza TODOS los servicios aunque no cambien** y crea pagos, uno por uno,
  y los errores solo van a la consola), PayrollView:326 (corrección masiva de fechas), UsersView:338 (importación masiva), SettingsView:260.
- `setDoc` sin `merge` que reescribe el documento completo: UsersView:124/172/247/357 (alta y reescritura de usuarios; en
  altas es correcto, en ediciones conviene `updateDoc`). Los demás `setDoc` usan `merge: true`.
- No hay escrituras en cada tecla (los formularios guardan al confirmar).
- `serverTimestamp`/`increment`/`arrayUnion`/`runTransaction`: 0 usos. Las fechas se guardan con `new Date().toISOString()` del cliente.
- Imágenes en base64 en Firestore: **logo de la empresa** (`settings_company/main.logo`). Las fotos van a Storage (bien).

**Security Rules e índices:** no están en el repo (se manejan en la consola), no se pudieron auditar.

### 3. Caché

| Capa | Estado |
|---|---|
| Firestore persistente (IndexedDB) | **Activa**, tamaño ilimitado, varias pestañas. No se limpia al cerrar sesión. |
| Listeners compartidos | Solo `properties`, `settings_roles` y el perfil, en App.tsx. El resto, por vista (ver tabla). |
| Memoria con TTL | No existe. `utils/cacheFirstFetch.ts` (`getDocsCacheFirst`) pinta del caché pero siempre repite la lectura completa. |
| TanStack Query | No se usa. |
| localStorage | `pc_active_tab` (OK) · periodos de las barras (OK) · `pc_company_settings` (**copia de un doc de Firestore con el logo base64**, duplica la caché persistente; se usa para leer el logo de forma síncrona al generar PDFs) · `geo_v1__<dirección>` (**direcciones de clientes**, sin límite ni expiración) · `pc_house_form_drafts_v1` (**borradores del formulario de casas con datos de clientes, notas y payroll**). |
| Hosting (Cloudflare Workers, `wrangler.jsonc`) | **No hay `public/_headers`**: los `assets/*` con hash no tienen `Cache-Control: immutable`. El Service Worker de la PWA los precachea (90 entradas, 3 MB), así que el impacto es menor tras la primera visita. |
| Storage | `uploadBytesResumable` solo manda `contentType`, **sin `cacheControl`**. |
| PWA | El manifest pide `/icon-192.png`, `/icon-512.png` y `favicon.ico`, que **no existen** en `public/` (404). |

### 4. Carga

- Todas las vistas de App.tsx ya usan `React.lazy` + `Suspense`, con precarga en reposo (`viewPrefetch.ts`).
  En el arranque solo van LoginView, Sidebar, TopRightActions, ViewAsUserModal y RouteTransition (pequeños).
- Librerías pesadas: `html2pdf.js` (953 kB con html2canvas) importada estáticamente → **el mayor desperdicio de carga**.
  `xlsx`/`papaparse` estáticos dentro de DataImportView (aceptable, vista de admin).
- `firebase/storage` se carga en el arranque por `config/firebase.ts` aunque solo lo usan la subida de fotos y el borrado.
- `firebase/functions` ya va solo en HousesView (bien).
- Modales grandes dentro de HousesView/QualityCheckView/PayrollView viajan en el chunk de su vista (se verán al dividir componentes).
- `cssCodeSplit: false` es una decisión documentada (modales sin estilo con chunks de CSS tardíos); se mantiene.

### 5. Código innecesario

**Archivos sin uso (confirmado con grep + knip):**
- `src/views/QCDashboardView.tsx` (+ .css, 631 líneas) — reemplazado por QualityDashboardView.
- `src/views/QCReportsView.tsx` (+ .css, 296) — reemplazado por QCReportsTableView.
- `src/views/ChecklistView.tsx` (+ .css, 948) — nadie lo importa; la colección `checklists` se sigue LEYENDO en el detalle de la casa, pero ya no hay pantalla para crear checklists. **Decisión de producto.**
- `src/components/KpiBand.tsx` (+ .css) — reemplazado por KpiGrid (quedó del cambio de la ronda 5).
- `src/components/RegisteredPaymentsPanel.tsx` (+ .css, 510).
- `src/vite.config.ts` — copia vieja de la config dentro de `src/`.
- `src/assets/react.svg`, `calendar-fixes.patch` (raíz), `.env` (fragmento de ejemplo, no es un .env real; ya ignorado por git).
- knip también marca `functions/*`, `vite-env.d.ts` y `src/types/html2pdf.d.ts`: **falsos positivos** (otro paquete / tipos ambientales).

**Vistas montadas en App.tsx pero sin entrada en el menú** (solo se llega si quedaron guardadas como última pestaña):
`recalls` (RecallsView 958 líneas + PropertyDetailModal 324), `qc_route` (QCRouteView 724), `board` (NoticeBoardView 449),
`done` ("Under construction"). **Decisión de producto**: volver a ponerlas en el menú o eliminarlas.

**Código inalcanzable:** el modo "bypass" de App.tsx (`isBypass`, `handleLoginSuccess` sin `auth.currentUser`): LoginView
solo llama `onLoginSuccess` después de un `signInWithEmailAndPassword` exitoso, así que nunca se activa — y si se activara
daría permisos de superadmin. Eliminar.

**Otros:** 16 `console.log` (HousesView 5, userAuthService 4, imageCompression 3, usersService 2, PayrollView 1,
photoConfigService 1) · 14 `eslint-disable` sin uso · 18 exports y 15 tipos exportados sin uso (knip) · ~7 líneas de
código comentado · dependencia **`browser-image-compression` sin ningún import** (la compresión es propia en
`utils/imageCompression.ts`).

**Funcionalidades duplicadas que funcionan (decisión de producto):**
- Detalle de casa: el modal grande de HousesView vs `PropertyDetailModal` (solo lo usa RecallsView).
- `collectionMap` repetido en HousesView, PayrollView, CalendarView y SettingsView (no es producto, se unifica en el lote de catálogos).

### 6. Calidad

| Métrica | Valor |
|---|---|
| `style={{` | 102 en 26 archivos; **101 usan variables CSS** (permitido). 1 con valores sueltos: RecallsView:159 (posición del menú) |
| `<style>` embebido | 1 (HousesView:4312) — está dentro de un **string HTML de impresión**, no en JSX: excepción válida |
| Objetos de estilo en JS | 0 |
| Hover con `onMouseEnter/Leave` | 0 (el `onMouseLeave` de QualityCheckView:284 es para dibujar sobre un canvas, válido) |
| `any` (eslint) | 139 · `as any` 49 · peores: QualityCheckView 38, App 16, StatusHistoryView 9, dateFormat 8, SettingsView 7 |
| `React.FC` / clases | 0 / 0 |
| `.tsx` de más de 150 líneas | 38 de 55 · HousesView **9,231** · QualityCheckView 2,668 · PayrollView 1,905 · DataImportView 1,127 · InvoicesView 990 |
| `key` con índice | 22 directos + 8 en template (QCDashboardView 6, HousesView 3, StatusHistory 2, DataImport 2, …) |
| `useEffect` que solo calcula datos derivados | ~8: PropertyDetailModal:50, StatusChangeModal:41, PayrollView:392/848, QualityCheckView:381, HousesView:1473 (totales del modal de servicios), HousesView:4461 (total de payroll), QCRouteDrawer:212 |
| Services sin `withConverter` | todos (casts `as T` en cada vista) |

### Plan priorizado (para aprobación — Fase 2)

Orden: primero lo que baja lecturas de Firebase y tiempo de carga. Cada lote = un commit + verificación de CLAUDE.md.

| # | Lote | Impacto | Riesgo | Notas |
|---|---|---|---|---|
| 1 | **Recall sin descargar toda la historia**: `useRecallHouses` y RecallsView consultan `status_history` con `where('toStatusId','in', idsDeRecall)` + `where('toStatusName','in', nombresDeRecall)` en vez de la colección completa, y no se repite cuando cambia `statuses`. | Alto (probablemente la colección más grande, leída en cada visita al Overview y QC Dashboard) | Bajo | Mismo resultado. Usa índices simples automáticos. |
| 2 | **Store de datos compartido** (`src/shared/data/`): un listener por colección con conteo de usuarios y cierre diferido (p. ej. 15 min sin nadie que lo use). Hooks `useCatalog('settings_teams')`, `useCustomers()`, `useUsers()`, `useQualityChecks()`, y `useJobFinancials` apoyado en él. Sustituye ~60 listeners y ~25 `getDocs` de montaje (PropertyDetailModal en cada apertura, RecallsView, QCRouteView, QualityCheckView `getDocsCacheFirst`, CalendarView, ViewAsUserModal…). HousesView `modals-only` deja de abrir catálogos propios. PayrollView y HousesView usan `properties`/`roles` de App. | **Muy alto**: al navegar ya no se re-descarga nada; los listeners no se reinician | Medio (muchos archivos, cambio mecánico) | Los datos se ven igual o más frescos (pasan de lectura única a vivos). Por sub-lotes: catálogos → customers/users → quality_checks → billing/payroll. |
| 3 | **Escrituras**: guardar casa solo actualiza servicios/pagos que cambiaron y en un `writeBatch`; corrección masiva de fechas (Payroll), importación de usuarios y creación en Settings con `writeBatch` (tandas de 500); `updateDoc` en ediciones de usuarios; aviso visible si una escritura falla (hoy solo consola). | Medio (escrituras) + integridad | Medio | El aviso de error es lo único "nuevo" que se vería. |
| 4 | **Carga**: `html2pdf.js` con `import()` dinámico dentro de `pdfGenerator` (−1 MB al abrir Quality Check / QC Reports / QC Dashboard); `firebase/storage` fuera del arranque (−31 kB); `xlsx`/`papaparse` dinámicos en DataImportView. | Alto en vistas de QC | Bajo | El primer PDF tarda un instante más en generarse. |
| 5 | **Caché**: `public/_headers` (assets inmutables 1 año; `index.html`, `sw.js`, `version.json`, `registerSW.js` sin caché); `cacheControl` en subidas a Storage; `cached()` en memoria con TTL para las lecturas únicas que queden (admin: Settings, Users, Roles, Trash); caché de geocodificación con tope y expiración. | Medio | Bajo | Requiere desplegar para notarse (yo no despliego). |
| 6 | **Código innecesario**: borrar QCDashboardView, QCReportsView, KpiBand, RegisteredPaymentsPanel, `src/vite.config.ts`, `react.svg`, `calendar-fixes.patch`; modo bypass; 16 `console.log`; 14 `eslint-disable` sin uso; exports sin uso; quitar `browser-image-compression` de package.json. | Bajo (limpieza, −~1,600 líneas) | Bajo | Quitar la dependencia queda aprobado si apruebas el plan. |
| 7 | **Estilos**: RecallsView:159 a variables CSS; anotar la excepción del `<style>` de impresión. | Muy bajo | Bajo | Casi todo ya cumple. |
| 8 | **Tipos y componentes** (por sub-lotes): `withConverter` en los services; quitar `any` empezando por QualityCheckView, dateFormat, App; corregir los ~8 efectos de datos derivados y las `key` con índice; dividir HousesView (extraer hooks de datos, modal de detalle, formulario, editor de servicios/pagos, exportación PDF), luego QualityCheckView y PayrollView. | Mantenibilidad | **Alto** en la división de HousesView | Lo hago en pasos pequeños con verificación visual en el arnés de pruebas. |

**Decisiones que necesito de ti (no las toco sin respuesta):**
1. **Acotar las colecciones grandes** (el mayor ahorro posible): hoy cada sesión nueva descarga las ~3,600 casas completas, y
   también todo `quality_checks`, `billing_services` y `payroll`. Opción: cargar solo una ventana (p. ej. últimos 12 meses +
   futuras) y traer lo anterior bajo demanda (búsqueda / "ver más antiguos"). Cambia lo que se ve en búsquedas históricas,
   Status History y Payroll de semanas viejas.
2. **ChecklistView**: no tiene acceso desde ninguna parte. ¿Se borra o se vuelve a conectar?
3. **Recalls, QC Route, Notice Board y "Under construction"**: montadas pero fuera del menú. ¿Se borran o vuelven al menú?
   (Si Recalls se va, también PropertyDetailModal, el detalle duplicado.)
4. **Borradores del formulario de casas** guardan datos de clientes en localStorage. ¿Mantener, pasar a IndexedDB, o a Firestore?
5. **Cerrar sesión** debería borrar la caché local de Firestore (equipos compartidos). El siguiente inicio de sesión tarda un poco más. ¿Lo aplico?
6. **Logo de la empresa** en base64 dentro de Firestore y copiado a localStorage → moverlo a Storage.
7. **Íconos de la PWA** faltantes (`icon-192.png`, `icon-512.png`, `favicon.ico`): ¿los genero a partir de `logo.png`?
8. **`xlsx` 0.18.5** tiene vulnerabilidades conocidas y ya no se publica en npm; cambiarlo implica otra dependencia.
9. Config de Firebase a `VITE_FIREBASE_*` (necesita configurar las variables en el build de Cloudflare). Opcional.


### Fase 2 — registro por lote

- **Lote 1 (Recall).** `utils/jobRecall.ts` → `fetchRecallHistory()` hace hasta 4 consultas
  `where(... 'in' ...)` sobre `status_history` (toStatusId/toStatusName y, para Recalls,
  fromStatusId/fromStatusName) con los ids y nombres de los status de recall. `toStatusId` se busca
  también por nombre porque hay registros viejos que guardan el nombre ahí. La clave del efecto es la
  lista de status de recall, así que ya no se repite con cada snapshot de statuses.
  Límite aceptado: un registro cuyo status de recall fue borrado y además tenía otro nombre ya no se
  encuentra. En el arnés: Overview 44 → 6 documentos de `status_history`; Recalls 44 → 8.
- **Lote 4 (carga).** `pdfGenerator` importa `html2pdf.js` dentro de `renderPDF` (verificado en el
  arnés: el chunk solo se pide al tocar "WhatsApp"). `firebase/storage` vive en `config/storage.ts`.
  DataImportView carga `xlsx`/`papaparse` en los handlers.
- **Lote 6 (código innecesario).** Borrados: QCDashboardView, QCReportsView, KpiBand,
  RegisteredPaymentsPanel (+ sus .css), `src/vite.config.ts`, `src/assets/react.svg`,
  `calendar-fixes.patch`; el "modo bypass" de App.tsx; 16 `console.log`; 14 `eslint-disable` sin uso;
  funciones sin uso (`compressImages`, `shareQCViaWhatsApp`, `resetScrollMemory`, `isViewPrefetched`,
  `generatePDFFromHTML` + el modo "save" de `renderPDF`, `nearestNeighborOrder`, `brandingFooterHTML`);
  `export` quitado de 21 helpers y 19 tipos que solo se usan dentro de su archivo; dependencia
  `browser-image-compression`. Al quitar las directivas sin uso, el lint del React Compiler dejó de
  "saltarse" `liveRoute.ts` y mostró 3 problemas que ya existían (refs escritos durante el render y un
  `setState` síncrono en un efecto): se corrigieron sin cambiar el comportamiento.
  **No se tocó:** ChecklistView y las vistas ocultas (decisiones pendientes), `formatDateTime` de
  `utils/dateFormat.ts` (hay 4 copias locales con formatos distintos: se unifica en el lote 8),
  `getPayrollTotal` duplicado en PropertyDetailModal (lote 8), `setPersistence(auth, browserLocalPersistence)`
  en App.tsx: pisa la persistencia IndexedDB que configura `config/firebase.ts` (anotado, no se cambia
  sin probar sesiones reales).

- **Lote 2 (store compartido).** `src/shared/data/liveCollections.ts`: `useLiveCollection(key)` /
  `useLiveData(key)` con `useSyncExternalStore`; un `onSnapshot` por colección para toda la app, con
  conteo de suscriptores y cierre diferido de 15 min (`KEEP_ALIVE_MS`) tras el último. Colecciones:
  statuses, teams, priorities, services, products, taxes, places, tasks, roles, users, customers
  (con `mapCustomerDoc`), qualityChecks, billingServices, payroll. Si un listener falla se descarta
  y el siguiente suscriptor lo reabre. `resetLiveCollections()` se llama al cerrar sesión (App.tsx).
  Migrados: App (roles, ahora solo con sesión), HousesView (11 listeners → store; places/tasks del
  checklist solo con el detalle abierto), jobFinancials, jobQuality, homeData, QualityDashboardView,
  InvoicesView, NoStatusView, PayrollView (+ `properties` por props: se eliminó su 2º listener de
  toda la colección), StatusHistoryView, QCReportsTableView, PropertyDetailModal, RecallsView,
  QCRouteView, QualityCheckView (se eliminó `getDocsCacheFirst` y su archivo), CalendarView,
  CustomersView, RolesView (sin `setRoles`), ViewAsUserModal, ActivityLogView.
  Eliminados por quedar sin uso: `customersService.getAll`, `payrollService.getAll`,
  `propertiesService.getAll`, `utils/cacheFirstFetch.ts`.
  Las vistas que editaban su copia local (Customers, Roles, Quality Check) ya no la tocan a mano:
  Firestore aplica la escritura local al instante en el listener y la revierte si el servidor la
  rechaza. En el arnés, una navegación por 13 vistas pasó de reabrir cada catálogo en cada vista a
  **un listener por colección**; al volver a una vista ya visitada el costo es 0 lecturas.
  Cambios visibles menores (todos correcciones): StatusHistory, Recalls, QC Route y el detalle de
  Recalls resuelven el nombre del cliente con `resolveCustomerName` (id real, legacy o nombre) en vez
  de mostrar a veces el id crudo; QC Reports ya no se limita a los "primeros 2000 por id" (mostraba
  un subconjunto arbitrario si había más).
  **Pendiente (decisión):** StatusHistoryView suma `payroll.totalAmount`, que los pagos nuevos no
  guardan → la columna Payroll sale $0.00. Se dejó igual; corregirlo cambia la cifra visible.

- **Lote 3 (escrituras).** `src/shared/data/batchWrites.ts`: `commitOps(ops)` (grupo relacionado,
  lanza si falla) y `commitInChunks(items, apply)` (tandas de 500, informa qué se guardó y qué no).
  `payrollService` suma `batchCreate/batchUpdate/batchDelete`; `settingsService.createMany`.
  - **Guardar casa (HousesView):** servicios y pagos del formulario van en UN batch. De los servicios
    existentes solo se reescriben los que cambiaron (huella con claves ordenadas contra lo cargado al
    abrir el formulario; al restaurar un borrador o duplicar no hay referencia y se escriben todos,
    como antes). Editar un pago en el formulario (= borrar + recrear) ya no puede perder el pago si
    falla la segunda mitad. Si el batch falla, aviso visible ("la casa se guardó, pero sus servicios
    y pagos no"); antes solo quedaba en la consola. El documento de la casa sigue escribiéndose
    completo: pasarlo a "solo campos cambiados" evitaría pisar ediciones simultáneas de otro usuario,
    pero cambia qué gana en ese caso → pendiente, no se tocó.
  - **Payroll:** pago consolidado, marcar semana pagada, editar y eliminar nómina → un batch cada uno
    (antes `Promise.all` de N escrituras + creación del ajuste aparte: podían quedar casas en nómina
    sin su bonus). Corrección masiva de fechas → tandas de 500; la lista local solo se actualiza con
    las filas que sí se guardaron (antes también marcaba las fallidas).
  - **Users:** alta masiva → tandas de 500 (los errores se cuentan por tanda); mover el documento al
    cambiar de id (`pending_…` → nuevo email o UID de Auth) = set + delete atómicos (antes, si fallaba
    el delete, quedaba el usuario duplicado); editar envía solo los campos que cambiaron y no escribe
    si no cambió nada.
  - **Settings:** las tareas nuevas de un lugar se crean en un batch.
  En el arnés (con el mock registrando cada escritura): guardar una casa sin tocar servicios = 1
  escritura (antes 2); editar un pago y re-guardar un servicio sin cambios = casa + 1 batch (delete +
  set), sin reescribir el servicio; alta masiva de 3 con 1 duplicado = 1 batch de 2; lugar con 2
  tareas = alta del lugar + 1 batch de 2. No probado contra Firestore real: reglas de seguridad que
  acepten escrituras sueltas pero no en batch (no debería haber diferencia) y el aviso de error.

- **Lote 5 (caché).**
  - `public/_headers`: `/assets/*` con `Cache-Control: public, max-age=31536000, immutable` (Vite pone
    hash en esos nombres). `index.html`, `sw.js`, `registerSW.js`, el manifest y `version.json` se
    quedan con el valor por defecto de Cloudflare (revalidar) para que cada deploy llegue al instante.
    Se nota solo después de desplegar.
  - Fotos a Storage con `cacheControl: 'public, max-age=31536000'` (nombres únicos, nunca se
    sobrescriben). Aplica a las fotos nuevas; las ya subidas conservan su metadata.
  - `src/shared/utils/memoryCache.ts` (`cached`/`invalidate`/`clearMemoryCache`, tal cual CLAUDE.md,
    más: un error no borra una entrada más nueva de la misma clave). Usos:
    historia de recall (5 min; `statusHistoryService.log` invalida), colección `recalls` (5 min; nadie
    la escribe desde la app), `getCompanySettings` (10 min; `saveCompanySettings` invalida; trae el
    logo, que puede pesar cientos de kB), `trashService.getAll` (5 min; mover/restaurar/purgar
    invalidan). Si una de las consultas de la historia de recall falla, falla toda y no se cachea
    (antes devolvía lo que hubiera llegado; con consultas `in` de un solo campo no debería pasar).
    Límite aceptado: lo que cambie OTRO usuario en esos datos se ve como máximo 5–10 min tarde al
    navegar (antes se releía en cada visita, pero tampoco se actualizaba mientras la vista seguía
    abierta). Al cerrar sesión se vacía junto con el store.
  - **Users, Settings y Notice Board** pasan al store de listeners en vez de `getDocs` completos en cada
    visita (Settings: 12 catálogos + `system_users`). Se sumaron al store los 4 catálogos que solo usa
    Settings (categories, responsables, paymentMethods, businesses). Se quitaron todos los parches
    manuales de listas locales: el listener refleja la escritura. Diferencias visibles: un usuario o
    catálogo recién creado aparece en su orden real (por id) en vez de al final, y **borrar un lugar
    ya no oculta sus tareas** en la lista Task: antes desaparecían solo de la pantalla (en Firestore
    nunca se borraban y volvían al recargar). → decisión pendiente: ¿borrar las tareas con el lugar?
  - Geocodificación: de una clave de localStorage por dirección, sin límite, a una sola clave
    versionada (`app:v2:geocode`) con tope de 5,000 entradas (más que casas: el uso normal no
    expulsa nada), vencimiento a un año SIN USO (cada uso renueva la fecha) y escrituras agrupadas;
    las claves viejas (`geo_v1__…`) se migran completas y se borran una vez (probado en el
    navegador del arnés, incluido el tope y el vencimiento). La primera versión tenía tope 500 y
    90 días: la revisión independiente mostró que eso expulsaba direcciones y volvía más lento QC
    Route; se corrigió antes de entregar. Sigue guardando
    direcciones de clientes en el equipo → se suma a la decisión de datos de clientes en localStorage.
  - En el arnés, el recorrido houses→qc→recalls→qcview→qcreports→users→settings dos veces pasó de
    **166 a 83 lecturas**; la segunda vuelta cuesta 2 (los dos `onSnapshot` de documento de
    `app_settings` que abre cada HousesView; con la caché persistente, reabrirlos antes de 30 min solo
    cobra cambios, así que se dejaron). El mock del arnés ahora re-emite los listeners tras cada
    escritura: se comprobó que Users (alta masiva) y Settings (lugar nuevo) muestran lo guardado sin
    parche local.

- **Lote 7 (estilos).** RecallsView: la posición del menú de status (`top/left/width` calculados al
  abrirlo) pasa a variables CSS (`--menu-top/--menu-left/--menu-width`) leídas en `.rcv-pill-menu`;
  verificado en el arnés (el menú abre pegado al botón). Revisados los 94 `style={{` restantes: todos
  son variables CSS de valores de runtime (colores de Firestore, alturas del calendario, anchos de
  barras), igual que las variables `style={order}`, `style={bar(...)}` y `style={pillVars}`. El único
  `<style>` está dentro del HTML de impresión de fotos de HousesView (excepción documentada; sus
  textos ya pasan por `escapeHtml`). El único `onMouseLeave` es el del lienzo de anotación (dibujo).

- **Lote 8 (tipos y componentes).**
  - **`any`: de 139 a 2**, ambos alias documentados con su `eslint-disable`: `QcFormData`
    (`utils/qcReportPdf.ts`, la excepción de `qcData` de CLAUDE.md) y `Leaflet` (`utils/routing.ts`:
    Leaflet llega por CDN y no hay `@types/leaflet`; instalarlo sería una dependencia nueva). Lo
    demás se tipó de verdad: `dateFormat` con `unknown` + guardas; los 16 `as any` de App.tsx eran
    innecesarios; campos que se guardan en `properties` y solo existían como extensión local pasan a
    `Property` (`beforePhotosExcluded`, `afterPhotosExcluded`, `dateOfIssue`, `dueDate`, `qcPlaces`);
    `StatusHistoryEntry` suma `source` y `reason` (se guardaban con `as any`) y `toStatusName` admite
    `null`; `catch (e: any)` → forma `{ code?, message? }`; Settings con un tipo `SettingItem` para su
    editor genérico; Quality Check con tipos para la cola offline, los trazos del anotador y los
    eventos de mouse/touch; `settingsService` genérico (`getAll<T>`).
  - `src/types/html2pdf.d.ts` borrado: duplicaba los tipos que ya trae `html2pdf.js`.
  - ESLint: `no-unused-vars` con `ignoreRestSiblings` (`const { id, ...resto } = doc` es la forma de
    quitar un campo antes de escribir). Problemas de `eslint .`: **195 (171 errores) → 5 avisos y 0 errores**
    (quedan 5 `exhaustive-deps` en efectos que responden a una orden externa — p. ej. "abrir esta
    casa" — o a cálculos con closures; cambiarlos altera cuándo se ejecutan).
  - Estado derivado (antes copiado con `useEffect`): totales del servicio y del pago en HousesView,
    total del formulario de edición, semana por defecto, detalle semanal en vivo y limpieza de la
    selección en PayrollView, reinicio de la selección en StatusChangeModal, "cargando" del
    historial en StatusHistoryPanel y apertura del panel de áreas en Quality Check (pasó a los
    handlers que abren/cierran el formulario). **No se tocó** el recálculo de tramos de
    QCRouteDrawer (los tramos viven dentro de `stops`; separarlos es un cambio más grande).
  - `key` con índice → dato estable donde la lista cambia: fotos (URL), opciones de casa,
    historial de notas, permisos por módulo, episodios de recall. Las listas fijas (esqueletos,
    encabezados de semana, KPIs) conservan el índice, como permite CLAUDE.md.
  - Duplicados unificados: `getPayrollTotal` (PayrollView y PropertyDetailModal usan el de
    `jobFinancials`); `formatDateTime` de HousesView → el de `utils/dateFormat` (mismo formato
    MM/DD/YYYY, h:mm AM/PM); Recalls y Status History comparten `formatDateTimeMx` (es-MX, el que ya
    mostraban). Diferencia solo en datos raros: una fecha sin hora (registros viejos/importados) se
    muestra como fecha MM/DD/YYYY — antes Status History la pasaba a "12:00 a. m." UTC, que en Texas
    caía el día anterior — y una DD/MM con día > 12 se normaliza igual que en el resto de la app. Quedan aparte (formatos distintos a propósito o
    dudosos): Notice Board y PropertyDetailModal (`es-ES` con mes corto) e Invoices
    (`parseDateForSort`, que manda al final las fechas imposibles) → decisión de formato pendiente.
  - **HousesView, primer paso de la división** (8,991 → 8,599 líneas), en `src/features/houses/`:
    `serviceRecords.ts` (tipo, huella y `computeServiceTotals`), `houseDrafts.ts`,
    `houseFieldConfig.ts`, y los componentes `SearchableSelect` y `StatusPillSelector` con su CSS
    movido tal cual desde HousesView.css. Capturas del arnés antes/después (tabla, formulario,
    selector abierto, detalle y móvil): **idénticas píxel a píxel**.
  - Arreglos sueltos: un "9" suelto al final de RecallsView.tsx; el nombre del módulo y la fecha en
    `key`; `LoginView` y Quality Check sin `catch` vacíos.

### Fase 3 — reporte final (2026-10-09)

Commits sobre la línea base `a9cec62`: Lote 1 `687e0a6`, Lote 4 `bdc29c2`, Lote 6 `edcede8`,
Lote 2 `ef70009`, Lote 3 `d4b5f80`, Lote 5 `3d2f520`, Lote 7 `757e6dc`, Lote 8 `2bcf0b9`.
No se desplegó nada ni se tocaron Security Rules ni índices.

| Medida | Antes | Después |
|---|---|---|
| Bundle inicial `index-*.js` | 703.8 kB (gzip 218.5) | **673.7 kB (gzip 209.4)** |
| Chunk que se baja al abrir Quality Check / QC Reports / QC Dashboard (`ShareReportSheet`) | 1,001 kB (gzip 290) | **25.7 kB** (html2pdf, 976 kB, solo al generar un PDF) |
| `DataImportView` | 329 kB | **26.5 kB** (xlsx/papaparse al usarlos) |
| `onSnapshot` en el código | 69 | **13** (uno de ellos es el store compartido: 1 listener por colección para 18 colecciones) |
| `getDocs` / `getDoc` / `getDocsCacheFirst` | 47 / 8 / 2 | **23 / 6 / 0** |
| Lecturas de colección sin `limit` | 111 de 113 | 30 de 31 (17 sin `where` ni `limit`: 4 de la herramienta MigrarPayroll, 2 de ChecklistView sin acceso, 2 de Notice Board oculto; el resto, colecciones que se escuchan completas → decisión 1) |
| Lecturas en el arnés, recorrido de 14 vistas (2 vueltas) | 166 | **83**; repetir una vista ya visitada ≈ 0 |
| Guardar una casa sin tocar sus servicios | 2+ escrituras sueltas | 1 escritura; servicios y pagos en 1 batch atómico |
| `style={{` | 102 (1 con valores fijos) | 94 (todos variables CSS de runtime) |
| `any` (eslint `no-explicit-any`) | 139 | **0** marcados; 2 alias documentados (`QcFormData`, `Leaflet`) |
| `tsc -b` / `tsc --noEmit` | 0 / 0 | 0 / 0 |
| `eslint .` | 195 (171 errores, 24 avisos) | **5 avisos, 0 errores** |
| Líneas (`git diff --stat a9cec62..HEAD`) | — | 102 archivos, +2,395 / −5,371 (TS/TSX de `src`: 39,464 → 37,539) |

**Qué no pude probar en un navegador real** (todo se probó con tsc, eslint, build y un arnés con
Firestore simulado que cuenta lecturas y escrituras; nada contra el proyecto real):
1. Firestore real: que las Security Rules acepten las escrituras en batch igual que sueltas; el
   cobro real de lecturas del store (reaperturas antes/después de 30 min); el aviso de error cuando
   falla un batch. *Cómo probar:* en la consola de Firebase → Usage, comparar lecturas de un día
   normal antes y después del deploy; guardar una casa con un servicio editado y un pago editado y
   revisar en Firestore que quedó un solo pago (no duplicado ni perdido).
2. Payroll con datos reales: pago consolidado, marcar semana pagada, editar y eliminar nómina,
   corrección masiva de fechas (el arnés no tiene nóminas asignadas). *Cómo probar:* asignar una
   nómina con bonus a un empleado de prueba, editarla y eliminarla; las casas deben volver a
   "Asignar nómina" sin ajustes huérfanos.
3. Users: invitación (✈️, crea la cuenta en Auth) y cambio de email de un usuario `pending_…`
   (mueve el documento en un batch). *Cómo probar:* con un correo de prueba.
4. Caché en Cloudflare (`_headers`) y en Storage (`cacheControl`): solo se ve después de desplegar.
   *Cómo probar:* DevTools → Network → un archivo de `/assets/` debe responder
   `cache-control: public, max-age=31536000, immutable`; una foto subida después del deploy debe
   traer `public, max-age=31536000`.
5. Geocodificación real (Nominatim) en QC Route: el arnés no tiene red; sí se probó la migración de
   la caché vieja en el navegador. *Cómo probar:* abrir QC Route con casas y revisar que el mapa
   ubica las direcciones; en DevTools → Application → Local Storage debe existir `app:v2:geocode` y
   ya no claves `geo_v1__…`.
6. Generación de PDF y WhatsApp del QC (solo se verificó que `html2pdf` se descarga al tocar
   WhatsApp), el dibujo sobre fotos del QC (tipos nuevos en los eventos de mouse/touch) y la cola
   offline de fotos. *Cómo probar:* hacer una inspección con 2 fotos, anotar una, exportar el PDF;
   repetir en modo avión y volver a conectar.
7. Lo que se mueve con el tiempo: el cierre diferido de 15 min de los listeners y la expiración de
   5–10 min de la caché en memoria.

**Decisiones pendientes (no las toqué):**
1. Acotar las colecciones grandes (`properties` ~3,600, `quality_checks`, `billing_services`,
   `payroll`): hoy cada sesión nueva las descarga completas. Es el mayor ahorro que queda.
2. ChecklistView: sin acceso desde ninguna parte. ¿Borrar o reconectar?
3. Vistas montadas pero fuera del menú (Recalls, QC Route, Notice Board, "Under construction").
4. Datos de clientes en localStorage: borradores del formulario de casas y caché de
   geocodificación (direcciones). ¿Mantener, pasar a IndexedDB o quitar?
5. Al cerrar sesión, borrar la caché local de Firestore (equipos compartidos).
6. Logo de la empresa en base64 dentro de Firestore (y en localStorage) → Storage.
7. Íconos de la PWA faltantes (`icon-192.png`, `icon-512.png`, `favicon.ico`).
8. `xlsx` 0.18.5 con vulnerabilidades conocidas (cambiarlo = otra dependencia).
9. Config de Firebase a variables `VITE_FIREBASE_*` (opcional).
10. Status History suma `payroll.totalAmount` y los pagos sin ese campo salen en $0.00.
11. `setPersistence(auth, browserLocalPersistence)` en App.tsx pisa la persistencia IndexedDB de Auth.
12. Borrar un lugar en Settings no borra sus tareas (antes solo se ocultaban hasta recargar).
13. Guardar una casa reescribe el documento completo: si dos personas la editan a la vez, gana la
    última. Pasar a "solo campos cambiados" cambia quién gana.
14. Formatos de fecha distintos por vista: MM/DD (casi todo), DD/MM es-MX (Recalls, Status
    History), "09 oct" es-ES (Notice Board, detalle de Recalls).
15. `@types/leaflet` (dependencia de desarrollo) para tipar el mapa en vez del alias `Leaflet`.
16. Seguir dividiendo HousesView (detalle, formulario, editor de servicios/pagos, exportación) y
    pasar los services a `withConverter` (hoy el store mapea los tipos una vez y los services
    hacen un cast al leer).

**Revisión independiente** (un agente aparte revisó `a9cec62..HEAD` sin haber hecho el trabajo):
sin regresiones graves. Corregido después de la revisión:
- Papelera: el botón "Refrescar" ahora siempre relee del servidor (con la caché en memoria
  mostraba lo mismo hasta 5 min).
- Geocodificación: tope 500 → 5,000, vencimiento por falta de uso, migración completa (ver Lote 5).
- Overview / QC Dashboard: la colección `recalls` vuelve a contarse aunque el catálogo no tenga un
  status de recall (el lote 1 la saltaba en ese caso).
- Payroll: la semana por defecto vuelve a quedar fija (al registrar un pago de una semana más
  nueva la vista ya no salta), ajustada durante el render en vez de en un efecto.
- Data Import: al terminar vacía la caché en memoria (importar `settings_company`, papelera o
  recalls se ve de inmediato).
- TrashView importaba `'../types'` sin `/index` (regla del proyecto): corregido.
Aceptado y documentado: (a) la marca de Recall ahora compara ids/nombres exactos del catálogo
actual (lote 1: un registro viejo con un nombre de recall que ya no existe no se encuentra);
(b) un batch es todo o nada: si al guardar una casa falla una sola escritura (p. ej. otra persona
borró ese servicio mientras tanto), no se guarda ninguno de sus servicios/pagos y se avisa; antes
se guardaban los demás en silencio.

Nota: el build se corrió en una copia aparte para no subir `app-version.json`; el próximo
`npm run build` del repo sube la versión como siempre.

### Decisiones del usuario tras el reporte (2026-10-09)

Respuestas: (1) acotar colecciones grandes con una ventana de 12 meses → sí; (2) borrar la caché
local de Firestore al cerrar sesión → sí; (3) vistas sin acceso → borrar (confirmadas: ChecklistView,
Recalls, QC Route vieja, Notice Board y "Under construction"); (4) borradores y caché de direcciones
en localStorage → se mantienen como están.

- **Vistas borradas.** `ChecklistView`, `RecallsView` (+ `PropertyDetailModal`, que solo usaba Recalls),
  `QCRouteView` y `NoticeBoardView` con sus CSS; tabs `recalls`, `qc_route`, `board` y `done`
  ("Under construction") de App.tsx, `viewPrefetch` y los módulos "Recalls" y "Notice Board" de
  Roles. Un usuario cuya última pestaña guardada era una de esas entra a Houses. Se conservan: la
  marca Recall del Overview y del QC Dashboard (`utils/jobRecall.ts`, ahora solo con lo que usan),
  la pestaña Rutas del hub de Quality Check (los links `?qcRoute=` ya abrían esa) y el módulo
  "Checklist" de Roles (lo usa el visor de checklist del detalle de la casa).
  Ojo con el CSS global: `RecallsView.css` traía `html, body { overflow-x: hidden; max-width: 100% }`
  en móvil y, por `cssCodeSplit: false`, aplicaba a toda la app: se movió a `index.css`. Se revisó
  que ninguna otra clase de los CSS borrados se use fuera (solo modificadores genéricos dentro de
  selectores con prefijo propio). Queda en Data Import el destino "Notice Board" (escribe en una
  colección `notice_board` que nadie lee; ya era así): se dejó.
- **Cerrar sesión borra la caché local.** `services/sessionService.ts` → `logout()` (Sidebar y
  TopRightActions lo comparten; antes cada uno tenía su copia). Espera hasta 5 s a que se envíen
  los cambios pendientes y, si no se pudo (sin conexión), pregunta antes de salir porque se
  perderían; luego `signOut`, `terminate` + `clearIndexedDbPersistence` (con tope de 4 s, para no
  quedarse colgado) y recarga. Para borrar, Firestore apaga también su cliente en las OTRAS pestañas
  de la app: esas pestañas reciben un aviso (`BroadcastChannel 'pc-session'`, escuchado en App.tsx
  con `reloadOnLogoutInOtherTabs`) y se recargan solas en la pantalla de login, en vez de quedar
  abiertas con Firestore apagado. No se toca la cola de fotos sin conexión. **No probado contra Firestore real** (el
  arnés simula Firestore): probar cerrando sesión con DevTools → Application → IndexedDB abierto;
  la base `firestore/[DEFAULT]/bdprecise-2d4bc/main` debe desaparecer.
- **Ventana de 12 meses en `properties`.** Respuestas: casas viejas que se cargan siempre = sin fecha
  y sin cobrar; servicios cobrados, nómina y QC siguen completos por ahora; aviso "Ver todo el
  historial" en las vistas. `src/shared/data/propertiesWindow.ts` → `subscribeProperties()` abre
  CUATRO listeners de un solo campo y los une por id: `scheduleDate >= hoy−12 meses`,
  `scheduleDate < "1900"`, `"2-" ≤ scheduleDate < "200"` e `invoiceStatus in [Needs Invoice,
  Pending, "", y sus variantes en minúsculas/mayúsculas]` (Invoices compara sin mayúsculas y trata
  el vacío como Pending). Los dos del medio atrapan las fechas vacías y las guardadas en formato
  viejo con barras o guiones ("03/15/2024", "2-15-2024", "12-01-2023"): no se pueden comparar por
  fecha, así que se cargan siempre hasta corregirlas.
  - **Por qué cuatro listeners y no un `or()`** (hallazgo de la segunda revisión): con un `or()` que
    tiene una desigualdad sobre `scheduleDate`, Firestore ordena por ese campo en TODAS las ramas y la
    rama `invoiceStatus in` pide un índice compuesto que el proyecto no tiene → la consulta fallaba y
    la app se quedaba sin casas. Con consultas de un solo campo no hace falta ningún índice. Si aun
    así alguna falla, `fallBackToFull` cierra las cuatro y escucha la colección completa (como antes
    de la ventana) y lo deja en consola. Costo: una casa reciente y sin cobrar llega por dos
    listeners y se cobra dos veces en la primera carga (en el arnés: 25 lecturas para 17 casas).
  - **Casa que sale de la ventana por una edición** (p. ej. una factura vieja marcada Paid): se
    conserva en pantalla hasta recargar, para que no desaparezca de golpe de la lista donde se edita.
    Una casa BORRADA sí se quita (sus últimos datos todavía cumplen la ventana; así se distinguen).
  - **Registros viejos cuya casa no se cargó** (QC Reports, lista de QC de Quality Check y Payroll):
    antes de la ventana se mostraban como "casa borrada"; ahora `isHiddenByWindow()` los oculta si
    son anteriores al inicio de la ventana (aparecen con "Ver todo el historial"). Los recientes sin
    casa siguen mostrándose como antes. Quality Check también lleva el aviso.
  - Huecos conocidos (aceptados): una casa sin el campo `scheduleDate` (ni vacío) o con un valor que
    no es texto, ya cobrada, no entra; tampoco una con fecha AAAA/MM/DD con barras (año primero) de
    hace más de 12 meses ya cobrada. El formulario siempre escribe AAAA-MM-DD; solo podría pasar
    con una importación vieja, y aparecen con "Ver todo el historial". `HistoryWindowNotice` (aviso + botón) va bajo el encabezado de
  Overview/Pipeline, Invoices, Calendar, Status History, Payroll, No Status, QC Reports y QC
  Dashboard (estas tres también pueden mostrar casas viejas). Al tocarlo, el listener pasa a la
  colección completa por el resto de la sesión. Probado en el arnés: de 18 casas se cargan 17
  (queda fuera la cobrada de hace 500 días); con "Ver todo" llegan las 18; una factura vieja
  marcada Paid sigue en pantalla y una casa borrada sale. **No probado contra Firestore real:** que
  las cuatro consultas abran sin pedir índice (son de un solo campo, que Firestore indexa solo,
  salvo exenciones en la consola) — si la consola muestra "falling back" o un link de índice,
  avisar. El ahorro real crece a medida que las fechas viejas se corrigen a AAAA-MM-DD.
- **Todas las fechas en MM/DD/AAAA** (respuesta del usuario: "absolutamente todas las fechas del app
  deben estar en MM/DD/AAAA, en formato de Estados Unidos… innegociablemente"). Decisión técnica:
  lo que se VE es siempre MM/DD/AAAA; lo que se GUARDA sigue siendo AAAA-MM-DD (es lo que ya
  escribían los campos de fecha, y es lo único que Firestore puede ordenar y filtrar por fecha —
  la ventana de 12 meses depende de eso).
  - Pantallas que mostraban otro formato y ahora van MM/DD/AAAA: Status History (dd/mm es-MX),
    historial de status del detalle ("09 oct 2026" es-ES), Activity Log (dd/mm es-MX), Rutas de
    QC ("09 oct 2026" y hora 24 h), notas ("Oct 09, 2026"), panel de inspección del QC Dashboard
    (sin año), papelera, borradores, tareas del gerente ("Oct 5"), encabezado de Owner/Manager
    ("Thursday, October 8" → "Thursday 10/08/2026"), Re-clean programado, barra de periodo
    ("Oct 5 – Oct 11, 2026" → "10/05/2026 – 10/11/2026"), Calendar (títulos de día y semana y
    detalle), PDF del QC ("October 9, 2026"), mensaje y nombre de archivo de WhatsApp
    (MM-DD-AAAA en el archivo porque no admite barras), nombre por defecto de las rutas
    ("Ruta 9/10/2026" día/mes → "Ruta 10/09/2026"), fechas crudas AAAA-MM-DD en detalles de
    Calendar, Payroll, Status History y en la vista previa de Google Calendar. Se quedan con
    nombre: los encabezados de mes ("octubre de 2026", "October") y de año, porque no son una
    fecha de día; los días de la semana relativos ("Mon", "Today", "yesterday").
  - **Campos de fecha:** `shared/components/DateInput` reemplaza los 16 `<input type="date">`
    (formulario de casa, pago, Calendar, filtros de Payroll y QC Reports, periodo Custom) y el
    `datetime-local` de las tareas del Owner (ahora fecha + hora opcional; sin hora = 11:59 p. m.,
    que la lista ya mostraba como "sin hora" y la agenda de hoy muestra "—"; con hora y sin fecha =
    hoy a esa hora). Muestra y deja escribir MM/DD/AAAA en cualquier idioma de navegador; el ícono
    abre el calendario del sistema. Al escribir solo dígitos las barras se ponen solas; con barras
    se respeta cada parte (corregir solo el día no corre los demás dígitos; "1/5/2024" vale);
    pegar "2026-11-03" o "2026/11/03" lo convierte; año entre 1900 y 2100; borrar el campo guarda
    vacío al instante (Enter ya no guarda la fecha vieja); una fecha incompleta o imposible vuelve,
    al salir, a la que había al entrar. Probado en el arnés con el navegador en español (todos
    esos casos, más 10152026 → 2026-10-15 guardado y 02/30 → vuelve a la anterior).
  - **Fecha de "hoy" en hora local** (`todayIso`): 16 lugares usaban `toISOString()` (UTC) para
    la fecha de un pago, de un QC, de una casa nueva, etc. En Texas, desde las 6–7 p. m. eso ya es
    el día siguiente: se guardaba mañana. Corregido.
  - **"Revisar fechas"** pasó de PayrollView a `features/houses/components/PropertyDateFixTool`
    (mismo funcionamiento y CSS movido) y ahora también aparece en el Overview cuando hay fechas
    por corregir. Las opciones muestran día de la semana + MM/DD/AAAA ("Fri 03/15/2024") en vez de
    AAAA-MM-DD, y abre en la primera pestaña con casas. Probado en el arnés (corrige y la casa sale
    de la ventana si es vieja y está cobrada).
  - Fechas con hora completa (ISO con `T`, p. ej. `paidAt`, `createdAt` guardados como texto): se
    muestran con el día LOCAL; antes `formatDate` tomaba los 10 primeros caracteres (día UTC) y un
    pago marcado a las 8 p. m. en Texas salía con fecha de mañana. `dateSortValue` también usa el
    instante exacto.
  - Pendiente / a decidir: las horas de los campos `type="time"` siguen el idioma del navegador
    (en español, 24 h); si se quieren también en h:mm AM/PM hace falta un campo de hora propio.
    Las fechas que quedan con barras en receiveDate/dateOfIssue/dueDate se MUESTRAN bien
    (MM/DD/AAAA); la herramienta solo corrige Schedule Date, que es el que usa la ventana.
- **Segunda revisión independiente** (otro agente revisó los cambios de estas decisiones):
  1. `or()` pedía un índice compuesto y podía dejar la app sin casas → 4 listeners + respaldo. ✔
  2. QC y nómina viejos se veían como de "casa borrada" → `isHiddenByWindow` + aviso en QC. ✔
  3. `formatDate` mostraba el día UTC de las fechas con hora → día local. ✔
  4. Cerrar sesión dejaba las otras pestañas con Firestore apagado y podía colgarse → aviso a las
     otras pestañas + tope de 4 s. ✔
  5. DateInput: editar en medio corría los dígitos, sin tope de año, no aceptaba pegar AAAA-MM-DD,
     Enter tras borrar guardaba la fecha vieja → corregido (ver "Campos de fecha"). ✔
  6. Invoice Status en minúsculas o vacío quedaba fuera de la ventana → variantes y "" incluidos. ✔
  7. Fechas viejas "2-15-2024" quedaban fuera → límite inferior "2-". ✔ (AAAA/MM/DD: hueco anotado)
  8. Tarea del Owner sin hora salía "11:59" en la agenda de hoy; hora sin fecha se perdía → ✔
  9. Horas de los campos `type="time"` en 24 h con el navegador en español → a decidir (arriba).

## Progreso por archivo (índice)
- [x] `src/components/Header/Header.tsx` — **eliminado** (código muerto, no funcional).
- [x] `src/components/PhotoSection.tsx` — mejoras semánticas aplicadas.
- [x] `src/components/PipelineBoardView.tsx` — comentarios obsoletos y lógica muerta
  limpiados; duplicación cruzada anotada para una tarea aparte.
- [x] **Duplicaciones cruzadas resueltas** (las 3 pendientes de abajo): `src/utils/relations.ts`
  creado y migrado en 5 archivos; ícono hamburguesa migrado a `Menu` de `lucide-react` en 16
  archivos; `src/components/StatusChangeModal.tsx` extraído y migrado en `PipelineBoardView.tsx`
  y `HousesView.tsx`.
- [x] `src/components/PropertyDetailModal.tsx` — 6to archivo con `rel`/`relColor` duplicados
  (migrado a `utils/relations.ts`); tipado completo, 43→0 errores de `eslint`; de paso se
  corrigió una interfaz `PayrollRecord` duplicada en `src/types/index.ts`.
- [x] `src/components/Sidebar.tsx` — nav items convertidos a `<ul>/<li>` + array de
  configuración (197→155 líneas).
- [x] `src/components/SidePanel.tsx` — **eliminado** (código muerto, nadie lo importaba;
  su CSS en `App.css` también estaba huérfano).
- [x] `src/components/StatusHistoryPanel.tsx` — 7mo archivo con duplicación de
  `utils/relations.ts`; `<ul>/<li>` aplicado a conteos y línea de tiempo; `countsFrom`
  (método sin uso) eliminado de `statusHistoryService.ts`.
- [x] `src/views/CalendarView.tsx` — **bug funcional corregido** (ignoraba el prop
  `properties` en tiempo real y hacía su propio fetch desconectado; botón "Quality Check"
  no estaba conectado); `CustomSelect` tipado genéricamente; detalle convertido a
  `<dl>/<dt>/<dd>`; hallazgo grande de arquitectura anotado como pendiente (`src/types.ts`
  vs `src/types/index.ts`).
- [x] `src/views/CompanySettingsView.tsx` — **XSS corregido** en `src/utils/companyBranding.ts`
  (interpolación HTML sin escapar); labels de formulario asociados con `htmlFor`/`id`.
- [x] `src/views/CustomersView.tsx` — `formData` tipado (`Customer`, sin `any`); botón
  "Filters" no funcional eliminado; comentarios históricos limpiados.
- [x] `src/views/DataImportView.tsx` — 1089 líneas, wizard de importación CSV de 5 pasos;
  se decidió mantenerlo en un solo archivo (dividir obligaría a pasar 10-15 props a cada
  paso sin beneficio real). Tipado completo: 14 `any` → 0, más 2 `no-case-declarations`
  corregidos de paso.
- [x] `src/views/HousesView.tsx` — 3417 líneas, el archivo más grande del proyecto,
  revisado en 2 pasadas (estado+handlers, luego JSX). **Bug crítico de pérdida de datos
  corregido** (`handleDelete` borraba la casa equivocada por un stale closure) y **XSS
  corregido** en `generatePDF` (mismo patrón que `CompanySettingsView`, pero con acceso a
  `window.opener`). Prop `onCheckHouse` muerto eliminado. Tipado: 54 → 9 `any` (los 9
  restantes son `propertiesService.update/create(... as any)`, atados al hallazgo pendiente
  de `types.ts` vs `types/index.ts`). Se agregaron 2 campos que faltaban en
  `types/index.ts` (`Status.dashboardOrder`, `Tax.name`) al descubrirlos usados en este
  archivo sin existir en el tipo canónico. `eslint` combinado (HousesView + App.tsx +
  types/index.ts): 90 → 32 problemas.
- [x] `src/views/InvoicesView.tsx` — prop `onViewProperty` muerta eliminada; `payrolls`/
  `billedServices` tipados; banner de dirección convertido a `dl/dt/dd` (el resto del grid
  se dejó como estaba por mezclar contenido no-lista).
- [x] `src/views/NoticeBoardView.tsx` — archivo más limpio de la sesión (sin `any`, sin
  código muerto, `eslint` en cero desde el inicio); feed de posts y lista de comentarios
  convertidos a `<ul>/<li>`.
- [x] `src/views/PayrollView.tsx` — 2 implementaciones duplicadas de `toTime` unificadas en
  una sola (la más robusta); tipo local `PayrollRecordExt` para `paidAt`/`paidBy`; 34 `any`
  → 0 (35 → 1 problemas de `eslint`, incluyendo 4 `no-useless-escape` que desaparecieron
  con la duplicación); banner de dirección convertido a `dl/dt/dd`.
- [x] `src/views/PhotoSettingsView.tsx` — **vista huérfana descubierta**: funcional y bien
  construida, pero nunca enlazada a la navegación (única vía de escritura de
  `photoConfigService.update`, que sí lee `HousesView.tsx`). Se dejó anotada como pendiente
  en vez de tocar la navegación. `catch (error)` sin usar y accesibilidad del `ToggleSwitch`
  (`role="switch"`/`aria-checked`) corregidos.
- [x] `src/views/QCDashboardView.tsx` — 6 componentes presentacionales (`KPICard`,
  `BarList`, `HeatList`, `TrendChart`, `Card`, `Empty`) que estaban definidos dentro del
  componente (recreados en cada render) subidos a nivel de módulo y tipados; prop
  `currentUser` sin usar eliminada (de este archivo y de `QualityCheckHub.tsx`);
  `loadData` tipado (24 → 5 problemas de `eslint`).
- [x] `src/views/QCRouteView.tsx` — **extracción cruzada resuelta**: `isQualityCheckStatus`/
  `latestQCForHouse`/`housePassedQC`/`houseFailedQC` (duplicadas idénticas en
  `QualityCheckView.tsx`, admitido en los propios comentarios) movidas a
  `src/utils/qcStatus.ts` y migradas ambos archivos. Se descubrió un hallazgo mucho más
  grande de paso (2 features de ruteo paralelas) que se dejó **sin tocar**, anotado como
  pendiente. Tipado completo del resto del archivo.
- [x] `src/views/QualityCheckHub.tsx` — 65 líneas, archivo trivial (solo agrupa pestañas).
  Único hallazgo: `Icon: any` tipado a `LucideIcon`.
- [x] `src/views/QualityCheckView.tsx` — 3098 líneas, el segundo archivo más grande del
  proyecto (después de `HousesView.tsx`), revisado en 2 pasadas. **XSS corregido** (3ra
  ocurrencia del mismo patrón) en el generador de PDF/email; migración a
  `getRelationName`/tipado parcial; 2 hallazgos grandes de features paralelas descubiertos
  y anotados como pendiente (dashboard de reportes embebido, editor de empresa embebido).
- [x] `src/views/RecallsView.tsx` — 939 líneas. **Bug funcional corregido** (mismo patrón
  que `CalendarView.tsx`: hacía su propio fetch único de `properties` que terminaba
  ignorando el prop en tiempo real). Migración completa a `getRelationName` y tipado sin
  `any` (67 → 3 problemas de `eslint`).
- [x] `src/views/SettingsView.tsx` — 971 líneas, CRUD genérico para 12 tipos de
  configuración. `SettingOption.icon` (tipo compartido) tipado a `LucideIcon`;
  `systemUsers` tipado a `SystemUser[]`; `key={idx}` → `key={t.id}` en tareas de un Place;
  bloques de detalle convertidos a `dl/dt/dd`. `selectedItem`/`dataToSave` se dejaron como
  `any` a propósito (estado genuinamente heterogéneo entre 12 formas de dato).
- [x] `src/views/StatusHistoryView.tsx` — 631 líneas. Prop `currentUser` sin usar eliminada
  (de este archivo y de su caller en `App.tsx`); migración completa a `getRelationName`/
  `getRelationColor`; tipado de `teams`/`historyAsc` (`Team[]`/`StatusHistoryEntry[]`,
  reutilizando el tipo ya exportado por `statusHistoryService.ts`). Tercera ocurrencia de
  `isRecallText`/`RECALL_STATUS_HINTS` detectada (idéntica a la de `RecallsView.tsx`) — nota
  de pendientes actualizada para reflejar los 3 archivos.
- [x] `src/views/admin/RolesView.tsx` — 428 líneas, ya bien tipado desde antes (tipos
  locales `PermissionExt`/`RoleExt` justificados con comentarios). 2 `as any` innecesarios
  en `handleSaveRole` eliminados; `handlePermissionChange` tipado como genérico
  (`<K extends keyof PermissionExt>`) en vez de `value: any` (6 → 2 problemas de `eslint`).
- [x] `src/views/admin/UsersView.tsx` — 561 líneas. **Bug de UI corregido**: `SystemUser.status`
  (tipo compartido) no incluía `'Inactive'` pese a que el `<select>` lo ofrecía — un `any`
  enmascaraba el desajuste, y en la tabla un usuario "Inactive" se mostraba con el color
  verde de "Active". Se amplió el tipo, se agregó una variante visual propia, y se limpiaron
  casts `any`/`as string` redundantes (`inviteSent`/`inviteSentAt` centralizados en un tipo
  local `SystemUserExt`, mismo patrón que `PermissionExt` en `RolesView.tsx`).

---

- [x] `src/components/Header/Header.tsx` — **Eliminado por completo** (archivo y carpeta
  `src/components/Header/`, que quedó vacía). Hallazgos:
  - **Código muerto:** no se importaba en ningún lugar del proyecto (verificado con `grep`
    en todo `src/`). Cada vista construye su propio header inline en vez de usar este
    componente.
  - **No funcional aunque se usara:** título y subtítulo hardcodeados ("Houses", "7 active
    properties tracked"), el `<input>` de búsqueda no tenía `value`/`onChange`, los botones
    "Filters"/"Add House" no tenían `onClick`. Era un mockup estático, no un componente real.
  - **Único archivo del proyecto usando `React.FC<Props>`** — los otros 21 componentes/vistas
    usan `export default function Componente(props: Props) {...}`. Inconsistente con la
    convención establecida (si se reintroduce algo similar en el futuro, seguir el patrón de
    función con nombre, no `React.FC`).
  - **SVGs inline a mano** en vez de `lucide-react` (que el resto del proyecto usa
    exhaustivamente): hamburguesa, lupa, filtro (`SlidersHorizontal`), "+" (`Plus`).
  - **Hallazgo transversal anotado (no corregido, fuera de alcance de este archivo):** el
    mismo SVG de hamburguesa (3 líneas horizontales) está duplicado literalmente en **14
    archivos de vista** (`HousesView.tsx`, `CustomersView.tsx`, `PayrollView.tsx`,
    `CalendarView.tsx`, `CompanySettingsView.tsx`, `DataImportView.tsx`, `InvoicesView.tsx`,
    `NoticeBoardView.tsx`, `QCDashboardView.tsx`, `QCRouteView.tsx`, `QualityCheckView.tsx`,
    `RecallsView.tsx`, `SettingsView.tsx` ×2, `StatusHistoryView.tsx`) en vez de un componente
    compartido `<HamburgerButton onClick={...} />` o el ícono `Menu` de `lucide-react`.
    Candidato a extraer cuando revisemos esas vistas — ahorraría ~14 bloques de SVG
    idénticos y centralizaría el ícono en un solo lugar.

- [x] `src/components/PhotoSection.tsx` — Componente limpio, bien enfocado (123 líneas), sin
  bugs de lógica encontrados. Cambios aplicados:
  - **Semántica del JSX:**
    - Contenedor raíz `<div className="photo-section ...">` → `<section aria-label={label + ' Photos'}>`.
      Representa una sección temática con encabezado propio (label "BEFORE"/"AFTER" + contador),
      así que `<section>` con `aria-label` es más correcto que un `<div>` genérico.
    - Grilla de miniaturas `.ps-grid` (renderizada con `.map()`, es una lista de fotos) →
      `<div className="ps-grid">`/`<div className="ps-thumb">` pasaron a `<ul className="ps-grid">`/
      `<li className="ps-thumb">`. Mejora accesibilidad (lectores de pantalla anuncian "lista de
      N elementos") sin cambiar el layout — ya era `display:grid`, sigue funcionando igual en un
      `<ul>`. Se agregó `list-style: none; margin: 0;` a `.ps-grid` en `PhotoSection.css` para
      resetear el estilo nativo de lista (ya tenía `padding` explícito, no hacía falta tocarlo).
  - **`key` simplificado:** de `key={`${url}-${i}`}` a `key={url}`. Las URLs de fotos son
    identificadores únicos por sí solos (vienen de storage); combinar con el índice no
    agregaba seguridad real y podía enmascarar el caso raro de URLs duplicadas.
  - **Decisión de estructura:** se mantiene como archivo único — sin lógica repetida que
    amerite extraer un sub-componente (el bloque de thumbnail no se reutiliza en otro lado).
  - Verificado con `tsc --noEmit` y `eslint` — sin errores.

- [x] `src/components/PipelineBoardView.tsx` — Vista Kanban alternativa de `HousesView`
  (328 líneas, 3 componentes: `StatusPill`, `StatusChangeModal`, `PipelineBoardView`).
  Cambios aplicados:
  - **Comentarios/documentación obsoletos eliminados:** el docblock del archivo describía
    un "filtro de rango de fechas (Desde/Hasta)" que **no existía en el código** (sin
    inputs, sin estado, sin lógica de filtrado) — quedó de una función que se quitó sin
    limpiar los comentarios. Se eliminaron también 3 comentarios sueltos relacionados
    (`/* Normaliza una fecha... */`, `--- FILTRO DE FECHAS ---`, `// Contadores para el
    indicador del filtro`) que no tenían código correspondiente debajo.
  - **Lógica muerta eliminada en `propsForStatus`:** el chequeo `isInvoice` nunca podía
    ser verdadero — `columns` ya excluye el status "Invoice" antes de llamar a la función,
    así que si una propiedad hacía `match` con `st`, `st` ya no podía ser "Invoice". Resto
    de una versión anterior al filtro de `columns`, sin depurar tras el refactor.
  - **Casts `any` innecesarios eliminados:** `(p as any).scheduleDate`/`(b as any).scheduleDate`
    — el tipo local `Property` (línea 23) ya declaraba esos campos como opcionales. Se
    extendió el mismo tipo con `note?`/`generalNotes?` (que sí faltaban) para eliminar los
    casts restantes también. Resultado: eslint bajó de 12 a 2 errores en este archivo (los
    2 que quedan son de `getRel`/`getRelColor`, ver duplicación abajo — no se tocaron
    porque se van a extraer, no vale la pena tipar dos veces).
  - **Duplicación cruzada anotada en su momento, resuelta después** (ver sección
    "Extracciones compartidas" más abajo):
    - `StatusChangeModal` de este archivo es casi idéntico línea por línea al
      `StatusChangeModal` definido dentro de `src/views/HousesView.tsx` (que es quien
      importa y renderiza `PipelineBoardView`) — mismo modal de cambio de estado
      implementado dos veces con distinto prefijo de clases CSS (`pb-*` vs `hv-*`). El
      propio comentario del archivo lo admitía ("mismo diseño que el de HousesView").
      Candidato a extraer a `src/components/StatusChangeModal.tsx` compartido.
      Diferencia menor detectada: la copia de `HousesView` tiene un `useEffect` que
      resincroniza `selectedId` al cambiar `config`; la de aquí no — hoy no es un bug
      visible porque el modal siempre se desmonta entre aperturas, pero es una asimetría
      frágil que desaparecería al unificar.
    - El helper `getRel`/`getRelColor` (resuelve id-o-nombre contra una lista, comparación
      case-insensitive) está reimplementado casi igual en 5 archivos: este,
      `PayrollView.tsx`, `CalendarView.tsx`, `InvoicesView.tsx`, `HousesView.tsx` (ahí como
      `getRelationName`/`getRelationColor`). Candidato a `src/utils/relations.ts`.
  - Verificado con `tsc --noEmit` (sin errores) y `eslint` (12 → 2 errores, mejora neta).

## Pendientes de otra ronda (hallazgos grandes, no resueltos todavía)
_(Ninguno por ahora — los últimos 4 hallazgos grandes de esta sección se resolvieron en esta
ronda; ver "Extracciones compartidas" más abajo, entradas de `PhotoSettingsView.tsx`, el
modal muerto de empresa, `QCReportsDashboard`, y "ruteo QC unificado".)_
- **Borrar una casa NO borra su evento de Google Calendar** (decisión de producto pendiente).
  El evento queda huérfano en el calendario; el webhook ya lo ignora (la casa no existe),
  así que no causa errores, pero ensucia el calendario. Opción: callable que borre el evento
  al eliminar la casa.

## Vistas Owner y Manager (2026-10-08)
- **Tamaño (ronda 2):** escala de letra como el Overview y acomodo por *container queries* sobre
  `.hm-page` (ancho real de la vista, con o sin menú): 4 tarjetas del resumen y 6 indicadores
  desde ~1000px de contenido, 2–3 columnas en tablet, 1–2 en celular. Cliente borrado se muestra
  con `displayClientName` ("Cliente eliminado · id"), no con el id crudo.
- **Vistas nuevas** `owner` y `manager` (módulos de permiso "Owner" y "Manager" en Roles). Quien
  puede ver las dos cambia con el selector Owner/Manager del encabezado.
- **"Manager" también define quién es gerente:** usuarios activos cuyo rol tiene Manager (View)
  aparecen en Manager tasks, en "Assign to" y en "On the clock now".
- **Colecciones nuevas** (revisar reglas de Firestore en la consola, el repo no las tiene):
  `manager_tasks` (services/managerTasksService.ts) y `time_clock` (services/timeClockService.ts).
- **Reglas** en `utils/homeData.ts`: trabajos de hoy y su estado (Done / In progress / Not started
  si pasaron 15 min de la hora / Scheduled / sin equipo), casas que esperan QC, Recall y su
  re-clean, facturas sin cobrar. "Your day in 30 seconds" = reglas, no IA (misma decisión del Overview).
- **Pass rápido** (Manager → Quality check): guarda un reporte `quality_checks` aprobado sin
  checklist (`quickPass: true`, passRate null) y NO cambia el status. "Did not pass" abre la
  inspección completa de Quality Check (ahí está el flujo a Recall).
- **Finance (Owner):** solo datos de la app (decisión del usuario): ingresos, impuesto, payroll,
  utilidad bruta y facturas más viejas. Sin banco ni gastos.

## Pulido: Team uniforme, notas tipo WhatsApp y QC Dashboard con el aspecto del Overview (2026-10-08, ronda 4)
- **Team / Billing / Status en la tabla:** pastillas de alto fijo 28px; Team y Billing además con
  ancho fijo (128px) y "…" si el nombre es largo, para que ninguna fila se deforme.
- **Notas (`NoteThread`):** círculo con la inicial del autor (color fijo por persona, 6 tonos como
  clases modificadoras), nombre dentro de la burbuja, hora abajo a la derecha, separador por día y
  scroll vertical siempre visible (mismo arreglo de `.fade-in *` que la tabla).
- **QC Dashboard:** mismo encabezado, barra de periodo con botón **Filters** (Team / Inspector en
  un menú, como el Overview), tabla agrupada por fecha con columnas fijas y scroll propio, y
  pantalla de altura fija desde 1200px (en angosto la columna lateral pasa abajo).

## Edición en la tabla, grado QC, notas tipo chat y QC Dashboard (2026-10-08, ronda 3)
- **Overview (`UnifiedJobsTable`):** Team y Billing se editan desde la celda (select nativo con
  forma de píldora). Status ya se editaba desde la columna. `HousesView.handleQuickFieldChange`
  respeta `isFieldRO`, guarda con `propertiesService.update` y deja registro en el activity log.
- **Columna QC:** muestra el grado (% de Quality Check, `passRate` o `computeQCScore`) y una
  insignia **Recall** si la casa pasó por un status Recall (`utils/jobRecall.ts`: `status_history`
  + colección `recalls`, lectura única con `getDocs` porque es histórico).
- **Notas (`NoteThread`):** las 3 notas se ven como conversación. Cada mensaje nuevo se AGREGA al
  campo (`texto anterior + "\n" + nuevo`) y crea una entrada en `notesHistory`; las burbujas salen
  de `notesHistory`. Notas viejas sin historial aparecen como un mensaje "Nota anterior". El modal
  Historial se mantiene.
- **QC Dashboard (vista nueva `qc_dashboard`, módulo de permisos "QC Dashboard"):** diseño del
  lienzo. Quality Check y QC Reports NO se tocaron — son features paralelas a propósito (pedido
  del usuario); si más adelante se quiere quedar con una sola, es decisión de producto.
  El panel lateral (`QcInspectionPanel`) es de lectura; para corregir se usa Inspect/Re-inspect →
  Quality Check, así no hay dos editores del mismo reporte. Reglas en `utils/qcDashboard.ts`.

## Overview e Invoices: presentación profesional (2026-10-08, ronda 2)
- **Indicadores en `KpiGrid`** (reemplaza `KpiBand`, eliminado): UNA rejilla de columnas iguales para
  todos los grupos → todos los cuadros miden lo mismo. Etiqueta hasta 2 líneas (reserva 2 siempre),
  sin "…". Acomodo por container queries: ≥980px todos en una fila; 560–980 cada grupo en su fila;
  angosto 2 columnas.
- **Alerta amarilla "N job(s) are not shown…" eliminada** (y su contador `hiddenNoStatusCount`).
- **Pantalla de altura fija** (escritorio/tablet, alto ≥600px): encabezado, barra de periodo e
  indicadores no se mueven; la tabla ocupa el resto con scroll propio. En móvil, scroll normal.
- **Barra de periodo sin saltos:** espacio de título de ancho fijo (300px); en Custom las fechas van
  dentro de ese mismo espacio.
- **Barra horizontal siempre visible:** `overflow: scroll` + `::-webkit-scrollbar` propio. OJO:
  `App.css` pone `scrollbar-color` fino y casi transparente en `.fade-in *`, que en Chrome ANULA
  `::-webkit-scrollbar`; las tablas lo devuelven a `auto` con un selector más específico.
- Tabla unificada: Date/time y Client & address fijas al desplazar a la derecha.
- Encabezado del Overview en una línea (acciones sin wrap; el buscador cede ancho hasta 260px).

## Overview unificado según el lienzo "Precise Cleaning – Unified Jobs View" (2026-10-08)
- **Overview** = diseño del tablero "Unified Overview (ops + billing + QC)": barra de periodo
  (Day/Week/Month/Year/Custom con ←/→/Today), bandas KPI "Operations" (tiles de status, clic = filtro)
  y "Quality check" (Passed / Re-clean / QC pending del periodo) y UNA tabla con Date/time, Client &
  address, Type, Team, Job status, Quality check, Billing, ✦ AI summary, Service price, Taxes, Final
  cost, Payroll, Profit, Margin y Actions, agrupada por periodo con subtotales y resumen del grupo.
- **Cambio de alcance:** la tabla ahora INCLUYE trabajos en Quality Check e Invoice (antes Daily Jobs
  los ocultaba). Siguen fuera los trabajos sin status. Los chips de status desaparecen (los tiles de
  Operations filtran); Filters vive en la barra de periodo.
- **AI summary = reglas** (`src/utils/jobInsights.ts`, decisión del usuario): duplicado, QC fallido,
  sin equipo, listo para facturar, margen negativo, pago pendiente, pagado sin QC, etc.
- **Compartido:** `utils/periods.ts`, `utils/jobFinancials.ts` (fórmulas de la hoja + hook de
  billing_services/payroll; Invoices ya no tiene copia propia), `utils/jobQuality.ts` (último QC por
  casa), `utils/unifiedRows.ts`, componentes `PeriodBar`, `KpiBand`, `UnifiedJobsTable`.
- **Invoices** con el mismo lenguaje: PeriodBar (default Month) en lugar de Start/End Date y
  "Agrupar por"; KPIs con KpiBand; chips de status; margen como pastilla. Columnas de la hoja intactas.
- Eliminados (código muerto): `DateGroupBar.tsx/.css`, `useDateGroups.ts`.
- `App.css` fija `* { font-family: system-ui }` e `index.css` da min 48px a todo botón: las vistas
  unificadas aplican Plus Jakarta Sans a cada elemento y la tabla de escritorio anula el mínimo táctil
  (en móvil se ven tarjetas, que lo conservan).
- **Pendiente (otros tableros del lienzo):** panel de Quality Check (hoy el clic en la pastilla QC abre
  el detalle de la casa), dashboard de QC, portal del limpiador (notas con fotos) y módulo Carpet.
- **Pendiente de limpieza:** CSS muerto de la tabla vieja Daily Jobs en `HousesView.css` (`.hv-table`,
  `.hv-th`, `.hv-pill-btn`, `.main-columns`…) y de los filtros viejos de Invoices (`.inv-filters-card`,
  `.inv-secondary-filters`…). No afecta, se dejó para borrarlo con calma.

## Overview e Invoices para gerencia (2026-10-08)
- **Active Teams eliminado** del Overview (pedido del usuario): panel, opción `card_activeTeams` de
  Configure Fields, `teamsWithScope`, `expandedTeamId` y todo su CSS (`.right-col`, `.hv-team*`,
  `.hv-panel-heading`, `.hv-badge-recall`, `.hv-badge-high-orange`). Daily Jobs ocupa todo el ancho.
- **Overview:** "Agrupar por" + Filters en una barra junto al título (antes Filters iba en `position:absolute`);
  conteo de trabajos bajo el título; chips de status ocultos si solo existiría "All"; Team con su color;
  filas más compactas y columnas Schedule/Status/Actions sin recortes.
- **Invoices:** 5 KPIs en una fila con contexto (jobs, 8.25%, fórmula, % payroll, margen; Profit resaltado);
  filtros y "Agrupar por" en una sola línea; tabla tipo hoja con encabezado y Address fijos, fila TOTAL fija
  al pie y filas compactas. En semanas, el grupo muestra "Semana N" en la columna fija y el rango al lado.
- `HousesView.css` usa CRLF: editarlo conservando ese formato (si no, el diff marca el archivo entero).

## Invoices con columnas de la hoja "Operations" + agrupar por fecha (2026-10-08)
- **Invoices** ahora tiene las columnas de la hoja, en el mismo orden: Address, Client, Note, Date,
  Team, Service Price, Taxes, Final Cost, Payroll, Profit, Profit Margin, Invoice, Notes, Issues, Week.
  Fórmulas idénticas a la hoja: Taxes = 8.25% de Service Price (`TAX_RATE`), Final Cost = Price − Taxes,
  Profit = Final Cost − Payroll, Margin = Profit / Final Cost. Service Price = suma de `billing_services`.
- **Cambio de significado:** "Profit" antes era Billed − Payroll; ahora descuenta el impuesto (como la hoja).
- Campos nuevos en `Property`: `issues` (columna Issues) y `taxExempt` (clic en la celda Taxes alterna
  8.25% ↔ $0). "Notes" = `officeNote` y respeta el permiso 'Office Notes' (sin permiso, la columna no sale).
- La columna Job Status salió de la TABLA (la hoja no la tiene); sigue en las tarjetas móviles y en el detalle.
- **Agrupar por Año / Mes / Semana / Día** en Invoices y en Daily Jobs del Overview: lógica compartida en
  `src/utils/dateGrouping.ts` (semana ISO = "Week Number" de la hoja), estado en `src/utils/useDateGroups.ts`
  y selector `src/components/DateGroupBar.tsx`. Se agrupa la lista COMPLETA filtrada; los grupos arrancan
  cerrados salvo el primero y cada uno pagina con "Mostrar más" (rendimiento con ~3,700 casas). En Invoices el
  encabezado de grupo trae subtotales alineados a sus columnas. La preferencia se recuerda por navegador.
- Fix de paso (móvil, Invoices): la búsqueda tenía `flex-basis: 260px` y en columna se volvía 260px de ALTO.

## Revisión del envío a Google Calendar (2026-10-07) — `functions/src/index.ts` + `HousesView.tsx`
- **Evento borrado en Calendar se "actualizaba" igual:** `events.get` de un evento borrado NO da
  404, devuelve `status: "cancelled"`. La guardia solo miraba el `houseId`, así que se parchaba
  el evento borrado, la app decía "creado/actualizado" y en Calendar salía "Could not find the
  requested event". Ahora `cancelled` → se crea evento nuevo, y la verificación final nunca
  reporta éxito si el evento quedó cancelado.
- **Enlace "Ver en Google Calendar":** el `htmlLink` abría con la cuenta por defecto del navegador
  → "Could not find the requested event" si no era `account@`. Se añade `authuser=CALENDAR_ID`.
- **Cualquier error en la guardia creaba un evento NUEVO** (duplicado). Ahora solo 404/410.
- **El insert de respaldo (404 al parchar) lanzaba error crudo** → llegaba como `internal` mudo.
- **Hora/fecha:** validación (`timeToMinutes`/`normalizeDate`, acepta M/D/YYYY de AppSheet);
  respaldo +2h cruza medianoche (antes 23:30 sin Time Out = evento de duración cero).
- **Webhook (Calendar → app):** `timeZone: America/Chicago` en `events.list` (antes dependía de la
  zona de la cuenta); `syncToken`/`singleEvents`/`timeMin` iguales en todas las páginas; solo el
  evento ACTUALMENTE vinculado (`gcalEventId`) puede modificar o desvincular la casa (antes un
  evento viejo pisaba datos o quitaba el vínculo al nuevo); se ignoran canales no vigentes;
  la descripción HTML de Calendar web se pasa a texto plano antes de guardarla en `note`.
- **Panel de pruebas:** el diagnóstico añade el estado del watch; `functions/internal` sin mensaje
  = callable no desplegado o sin permiso de invocación (CORS), no "not-found".

## Extracciones compartidas (resueltas)
- [x] **Ícono hamburguesa → `Menu` de `lucide-react`.** El SVG de 3 líneas horizontales
  estaba duplicado a mano en 16 archivos (los 14 detectados originalmente en la entrada de
  `Header.tsx`, más `src/views/admin/UsersView.tsx` y `src/views/admin/RolesView.tsx`, que
  se habían escapado de la búsqueda inicial por estar en una subcarpeta). Se reemplazó cada
  `<svg>...</svg>` por `<Menu size={N} />`, manteniendo intacto el `className`/wrapper
  distinto de cada botón (diferencias de padding, tamaño, posición son intencionales, no
  accidentales — no se forzó un `<HamburgerButton>` con prop API grande). De paso se
  agregaron 4 `aria-label="Open menu"` que faltaban (`NoticeBoardView`, `InvoicesView`,
  `DataImportView`, `RolesView`).
- [x] **`getRelationName`/`getRelationColor` → `src/utils/relations.ts`.** Nuevo archivo con
  2 funciones genéricas (`<T extends { id: string; name: string; color?: string }>`) que
  reemplazan las implementaciones casi idénticas que existían en `PipelineBoardView.tsx`,
  `PayrollView.tsx`, `CalendarView.tsx`, `InvoicesView.tsx` y `HousesView.tsx`. Cada archivo
  ahora importa las funciones en vez de redefinirlas. Efecto secundario positivo: al
  eliminar las copias con `any` implícito, el `eslint` combinado de los 5 archivos bajó de
  146 a 126 problemas.
- [x] **`StatusChangeModal` → `src/components/StatusChangeModal.tsx`.** Componente y tipo
  `StatusModalConfig` (antes duplicados casi línea por línea en `PipelineBoardView.tsx` y
  `HousesView.tsx`, con prefijos de clases CSS distintos `pb-*` vs `hv-statuschange-*`)
  unificados en un archivo nuevo con su propio `StatusChangeModal.css` (prefijo `scm-*`,
  ninguno de los dos esquemas viejos se reutilizó tal cual para evitar arrastrar nombres
  atados a un solo lugar de origen). Se resolvió la asimetría de comportamiento notada en la
  entrada de `PipelineBoardView.tsx`: la versión compartida incluye el `useEffect` que
  resincroniza `selectedId` al cambiar `config` (lo tenía la copia de `HousesView`, no la de
  `PipelineBoardView`) — es el comportamiento más correcto de los dos. Se eliminó el CSS
  muerto de ambos archivos (`.pb-status-*`, `.status-modal*`, `.hv-statuschange-*`,
  `.status-option*`, `.status-btn-*`) tras confirmar que ya no se usaba en ningún otro lugar.
  `PipelineBoardView.tsx` pasó de 12 a 0 problemas de `eslint`; `HousesView.tsx` de 75
  (71 errores, 4 warnings) a 71 (69 errores, 2 warnings).
- Verificación final: `tsc --noEmit -p tsconfig.app.json` sin errores en todo el proyecto;
  `grep` confirma cero definiciones locales duplicadas y cero SVGs de hamburguesa restantes.

- [x] **`isRecallText`/`RECALL_STATUS_HINTS` → `src/utils/recallStatus.ts`.** Nuevo archivo
  con la lista de hints y la función pura `isRecallText(txt)`, que reemplaza las copias
  **idénticas** letra por letra de `RecallsView.tsx` y `StatusHistoryView.tsx`, y la versión
  con nombres distintos (`RECALL_HINTS`/parte de `isRecallStatus`) de `QualityCheckView.tsx`.
  En `QualityCheckView.tsx` se simplificaron de paso `getRecallStatusId`/`isRecallStatus`
  para llamar a `isRecallText` sobre el nombre ya resuelto, en vez de repetir
  `RECALL_HINTS.some(h => n.includes(h))` a mano en cada uno. `tsc --noEmit` sin errores;
  `eslint` combinado de los 4 archivos: 199 → 109 problemas (mismos tipos de warning
  preexistentes en líneas desplazadas, sin categorías nuevas).

- [x] **`CustomSelect` → `src/components/CustomSelect.tsx`.** Componente genérico
  (`<T extends { id, name, color? }>`) que reemplaza las 3 copias con comportamientos
  ligeramente distintos de `SettingsView.tsx`, `CalendarView.tsx` y `HousesView.tsx`. No se
  fusionaron a la fuerza las diferencias — se eligió, punto por punto, el comportamiento más
  robusto de las tres para la versión compartida:
  - **Matching:** case-insensitive por id-o-nombre (el de `CalendarView`/`HousesView`) en
    vez del exacto-solo-por-id de `SettingsView` — es un superconjunto seguro, compatible
    con datos legacy que guardaban el nombre en vez del id, y no rompe el caso exacto.
  - **Cierre del dropdown:** `onMouseDown` + `preventDefault()` en todas las opciones (como
    `CalendarView`) en vez del `onClick` que usaba `HousesView` — evita que el `blur` cierre
    el dropdown antes de que el click registre, así que ya no hace falta el
    `setTimeout(..., 200)` de debounce que `SettingsView`/`HousesView` necesitaban para
    compensarlo.
  - **`returnKey` opcional** (de `CalendarView`/`HousesView`, con default `'id'` — mismo
    comportamiento que `SettingsView` tenía hardcodeado) para poder devolver `name` en vez
    de `id` en selects de datos legacy (ej. cliente en `CalendarView.tsx`).
  - Se agregó de regalo el resaltado de la opción actualmente seleccionada dentro del
    dropdown (`.selected`), que solo tenía la copia de `HousesView`.
  - CSS propio en `CustomSelect.css` con prefijo `cust-sel-*` (ninguno de los 3 esquemas
    viejos —`stv-cs-*`, `cs-*`, `hv-customsel-*`— se reutilizó tal cual, mismo criterio que
    con `StatusChangeModal.css`). Se eliminó el CSS huérfano de los 3 archivos; en
    `HousesView.css` se conservó `.hv-searchsel-*` porque lo sigue usando `SearchableSelect`
    (componente distinto, con input de texto para filtrar — **no** duplicaba `CustomSelect`
    y no se tocó).
  - Verificado con `tsc --noEmit` (sin errores en todo el proyecto) y `eslint` combinado de
    los 4 archivos: 100 → 31 problemas (mismos tipos de error preexistentes en líneas
    desplazadas, sin regresiones).

- [x] **`src/types.ts` eliminado — unificado con `src/types/index.ts`.** El hallazgo más
  grande de "otra ronda": dos archivos de tipos paralelos, con `propertiesService.ts`/
  `customersService.ts` como únicos importadores del legacy `src/types.ts` (confirmado con
  `grep` antes de tocar nada — ningún otro archivo lo importaba). Investigación primero:
  - `Customer` era **idéntico** en contenido entre ambos archivos (solo declarado en
    distinto orden) — cero riesgo ahí.
  - `Property` divergía en dos puntos: `tag.type` (`'team' | 'prepaid'` en `types.ts` vs.
    `string` suelto en `types/index.ts` — el de `types/index.ts` ya es un superconjunto
    seguro, no hacía falta tocarlo) y 4 campos de "Work Log" (`employeeStartedBy/At`,
    `employeeFinishedBy/At`) que **solo existían en `types.ts`** — pero resulta que
    `HousesView.tsx`, `PropertyDetailModal.tsx` y `PipelineBoardView.tsx` ya los
    redeclaraban por su cuenta como extensión local (`type Property = BaseProperty & {...}`)
    porque ninguno de los tres importaba de `types.ts` — todo el árbol de vistas ya usaba
    `types/index.ts` como fuente real; `types.ts` era efectivamente **código muerto** salvo
    por esos 2 servicios.
  - **Cambios aplicados:** se agregaron los 4 campos de Work Log a `Property` en
    `types/index.ts` (consolidando lo que 3 archivos redeclaraban por separado);
    `propertiesService.ts`/`customersService.ts` pasaron a importar de `../types/index`;
    `src/types.ts` se eliminó por completo. Se quitaron los 4 campos ahora redundantes de
    las extensiones locales de `HousesView.tsx`/`PropertyDetailModal.tsx`/
    `PipelineBoardView.tsx` (`PropertyDetailModal.tsx` se quedó sin extensión local en
    absoluto — usa `Property` de `types/index.ts` directo).
  - **Efecto dominó — el verdadero objetivo del hallazgo:** con los tipos unificados, la
    mayoría de los `as any` en llamadas a `propertiesService.update/create` en toda la app
    dejaron de hacer falta (ya no eran descuido, eran un desajuste real de tipos). Se
    quitaron en `CalendarView.tsx` (2), `RecallsView.tsx` (1), `InvoicesView.tsx` (2) y
    `HousesView.tsx` (7 de 8 — el que queda, línea 1254, es legítimo: `dataForFirestore`
    incluye `beforePhotosExcluded`/`afterPhotosExcluded`, campos genuinamente locales de
    `HousesView.tsx` que no pertenecen al tipo canónico, con comentario explicándolo). En
    `App.tsx` se quitaron 6 `as any` más al pasar `properties`/`houseToInspect` a las vistas
    que no tienen extensión local de `Property` (`InvoicesView`, `CalendarView`,
    `QualityCheckView`, `RecallsView`, `StatusHistoryView`, `QCRouteView`) — se dejaron
    intactos los 2 de `HousesView` (×2 tabs: houses/pipeline), que sí necesita su tipo local
    más amplio.
  - Verificado con `tsc --noEmit` (sin errores en todo el proyecto, una sola pasada, sin
    iteración) y `eslint` combinado de los 11 archivos tocados: 257 → 23 problemas (el resto
    son `any` no relacionados y patrones ya documentados en otras entradas; sin regresiones
    — confirmado con `diff` contra el baseline que la única línea nueva es el mismo error
    preexistente de regex en `InvoicesView.tsx` desplazado por las líneas eliminadas).

- [x] **`src/views/PhotoSettingsView.tsx` enlazado a la navegación.** Decisión del usuario:
  mismo patrón que `CompanySettingsView.tsx` ("Empresa") — entrada propia en el Sidebar
  ("Fotos", ícono `Camera`), gateada por el mismo permiso `canViewSettings`, en vez de
  meterlo dentro de `SettingsView.tsx`. Se agregó la prop `onOpenMenu`/botón hamburguesa
  (antes no existía — era el único archivo de vista sin ese patrón, porque nunca se había
  usado dentro de la navegación real). De paso se encontró y corrigió una duplicación menor:
  `Sidebar.tsx` tenía su **propia copia local** del tipo `TabOptions` en vez de importar el
  que ya exporta `App.tsx` — al agregar `'photo_settings'` a una copia y no a la otra,
  `tsc` lo detectó de inmediato. Se resolvió importando `type { TabOptions } from '../App'`
  (import de solo-tipo, no genera dependencia circular en tiempo de ejecución) en vez de
  mantener las dos copias.

- [x] **Modal muerto de configuración de empresa eliminado de `QualityCheckView.tsx`.**
  Confirmado con `grep` que `setCompanyModalOpen(true)` no se llamaba desde ningún lado del
  archivo — el modal, `saveCompanySettings`, `handleCompanyLogoUpload`, `companyDraft`,
  `savingCompany` y `companyLogoInputRef` eran 100% inalcanzables. Se eliminaron todos
  (se conservó `companySettings`/`setCompanySettings`, que sí se usa activamente para
  branding del PDF/email). `CompanySettingsView.tsx` ya es la vía real y alcanzable para
  editar esta configuración. CSS huérfano (`.qcv-company-*`) también eliminado.

- [x] **`QCReportsDashboard` eliminado de `QualityCheckView.tsx`.** Duplicaba las métricas
  de `QCDashboardView.tsx` (score, recalls, mapa de calor, tendencia mensual) y era
  alcanzable a una pestaña de distancia dentro del mismo `QualityCheckHub.tsx`. Se eliminó
  el componente completo (259 líneas), la pestaña "Reportes" y el estado `mainTab` que ya
  no tenía sentido con una sola pestaña real; el botón "Inspecciones" se dejó como
  indicador visual fijo (sin `onClick`) junto al botón "Route". CSS huérfano (`.qcv-rd-*`,
  ~55 reglas) también eliminado. `QCDashboardView.tsx` queda como único dashboard.
  `eslint` de `QualityCheckView.tsx`: 105 → 86 (sin regresiones).

- [x] **Ruteo QC unificado — `src/utils/routing.ts` (nuevo) + `QCRouteView.tsx` mejorado
  + drawer embebido eliminado de `QualityCheckView.tsx`.** Decisión de producto del usuario:
  el equipo planifica rutas con anticipación → `QCRouteView.tsx` (rutas múltiples guardadas
  en Firestore) es la herramienta canónica, no el drawer "Route" embebido (una sola ruta
  "actual", sin guardar variantes). Alcance acordado: además de eliminar el drawer, llevar
  su motor de ruteo más sofisticado (mapa Leaflet + direcciones reales OSRM) a
  `QCRouteView.tsx`, que antes solo tenía distancia en línea recta (Haversine).
  - **`src/utils/routing.ts` (nuevo):** `LatLng`, `haversineKm`, `geocodeAddress`
    (Nominatim, cacheado en localStorage), `fetchOSRMRoute` (ruta real de manejo),
    `nearestNeighborOrder`, `getCurrentPosition`, `ensureLeaflet` (carga el mapa desde CDN
    bajo demanda). Extraído de la versión que tenía el drawer embebido (la más completa de
    las dos que existían), no de la de `QCRouteView.tsx` (que solo tenía Haversine).
  - **`QCRouteView.tsx` mejorado:** sus propias `haversineKm`/`geocodeAddress`/
    `getCurrentLocation`/`readGeo`/`writeGeo` (caché duplicada) reemplazadas por las
    importadas de `utils/routing.ts`. Se agregó un mapa Leaflet (`<div className="qcr-map">`)
    que se redibuja automáticamente (`useEffect` sobre `stops`/`origin`/`mode`) con
    marcadores numerados + la polyline de la ruta real de manejo (OSRM) o, si OSRM no
    responde, una línea punteada de respaldo. El resumen ahora muestra distancia/tiempo
    **reales** (OSRM) cuando están disponibles, con fallback silencioso al estimado en línea
    recta (`legKm`/`etaMin` por parada, que se conservan sin cambios — siguen siendo útiles
    para el ETA rápido por parada individual). Limpieza de instancia del mapa al desmontar.
  - **Drawer "Route" eliminado por completo de `QualityCheckView.tsx`:** estado
    (`routeItems`, `routeDrawerOpen`, `userLocation`, `routePlan*`, refs de mapa), handlers
    (`persistRoute`, `isInRoute`, `addToRoute`, `removeFromRoute`, `moveRouteItem`,
    `clearRoute`, `renderRouteMap`, `optimizeRoute`, `closeRouteDrawer`), los helpers de
    módulo ya migrados a `utils/routing.ts` (`ensureLeaflet`, `haversineKm`,
    `geocodeAddress`, `fetchOSRMRoute`, `nearestNeighborOrder`, `getCurrentPosition`,
    `fmtMinutes`), el fetch a `settings_qc_route/current` (el documento en Firestore queda
    huérfano sin tocar, no se migró — nadie más lo lee), la interfaz `RouteItem`, el botón
    "Route" de la barra de pestañas (que junto con la eliminación previa de "Reportes" dejó
    la barra de pestañas sin propósito — también se quitó), los botones "Agregar a ruta" en
    las tarjetas de casas pendientes/recall, y el drawer JSX completo (~100 líneas). CSS
    huérfano eliminado (`.qc-route-*`, `.qcv-route-*`, `.qcv-main-tab*`,
    `.qcv-house-route-btn*`, ~50 reglas).
  - Verificado con `tsc --noEmit` (sin errores en todo el proyecto), `npm run build`
    (build de producción exitoso) y `eslint` combinado de los 3 archivos:
    136 → 64 problemas (sin regresiones — mismos tipos de error preexistentes en líneas
    desplazadas). **No verificado manualmente en navegador** (mapa/geocoding/OSRM son
    difíciles de probar sin credenciales de ubicación reales) — recomendado probar
    "Generar ruta" y "Recalcular desde mi ubicación" en `QCRouteView.tsx` antes de dar por
    cerrado este cambio.

- [x] `src/components/PropertyDetailModal.tsx` — Modal de detalle de propiedad (325
  líneas, un solo componente cohesivo: header, info cards, workers, work log, stats,
  billing/payments, notas, fotos, historial). Es el único caller `RecallsView.tsx`, sin
  props de catálogo — carga sus propios datos de Firestore, lo cual está bien porque es
  autocontenido. Cambios aplicados:
  - **Duplicación cruzada con `utils/relations.ts`:** tenía sus propios `rel`/`relColor`
    (línea por línea idénticos a `getRelationName`/`getRelationColor`) — se había escapado
    de la búsqueda original de duplicaciones porque está en `src/components/`, no en
    `src/views/`. Migrado a la función compartida.
  - **Tipado completo, cero `any` restantes** (antes: 43 errores de `@typescript-eslint/no-explicit-any`
    solo en este archivo):
    - `currentUser?: any` → `SystemUser | null` (coincide con el único caller).
    - Los 8 `useState<any[]>` de catálogos → `Status[]`, `Team[]`, `Priority[]`, `Service[]`,
      `Customer[]`, `SystemUser[]`, más un `BilledService` local (no existe tipo compartido
      para `billing_services` todavía) y `PayrollRecord`.
    - El bloque de `getDocs(...).catch(() => ({ docs: [] }))` con `(x as any).docs` y
      `(d: any) => ...` se simplificó a `.catch(() => null)` + `(x?.docs || [])` con un cast
      puntual `as Status`/`as Team`/etc. por línea — sigue siendo un cast porque Firestore no
      valida la forma del documento (frontera externa legítima para castear), pero ya no hay
      `any` de por medio.
    - `(house as any).beforePhotos`/`afterPhotos` eran innecesarios — `Property` ya declara
      esos campos opcionales; simplemente se quitó el cast.
    - `{ statusId: newId } as any` en la llamada a `propertiesService.update` también era
      innecesario — el método acepta `Partial<Property>` y `statusId` ya es un campo real.
    - `(house as any).employeeStartedBy`/`employeeFinishedBy`/`employeeStartedAt`/
      `employeeFinishedAt` sí hacían falta (no están en `Property`) — resuelto igual que en
      `PipelineBoardView.tsx`: tipo local `Property = BaseProperty & { employeeStartedBy?...}`.
    - `<StatusHistoryPanel statuses={statuses as any} />` → ya no hace falta el cast, el
      prop espera `Status[]` y ahora `statuses` ya es `Status[]`.
  - **Bug encontrado en `src/types/index.ts` (archivo distinto, corregido de paso):** la
    interfaz `PayrollRecord` estaba declarada **dos veces** (líneas 124 y 141) — TypeScript
    las fusionaba por declaration merging así que no rompía nada, pero era claramente
    accidental (probablemente un copy-paste al agregar el campo `status`). Se eliminó la
    primera declaración, dejando solo la que incluye `status?: 'Pending' | 'Paid'`.
  - **Observación, no se tocó:** el dropdown de status inline (`pdm-status-dropdown`) es una
    tercera UI para cambiar status, distinta del `StatusChangeModal` compartido — pero su
    diseño (dropdown compacto en el header, no una grilla en modal centrado) es genuinamente
    distinto, así que no se consideró candidato a unificar.
  - Verificado: `tsc --noEmit` sin errores; `eslint` de `PropertyDetailModal.tsx` bajó de 43
    a 0 errores; `eslint` de `types/index.ts` se mantuvo en 1 error preexistente y no
    relacionado (`SettingOption.icon: any`, fuera de alcance de esta revisión).

- [x] `src/components/Sidebar.tsx` — Componente enfocado (197 líneas), sin `any`, sin
  código muerto, sin bugs de lógica. Único componente de la sesión sin duplicación cruzada
  ni tipado a corregir — los cambios fueron puramente estructurales:
  - **Semántica del JSX:** los 13 `<button className="nav-item">` eran hermanos planos
    dentro de `<nav>`, en vez de una lista real. Se envolvieron en `<nav><ul className="nav-list">
    <li><button>...</button></li></ul></nav>`. Se verificó `Sidebar.css` antes del cambio — ni
    `.sidebar-nav` ni `.nav-item` dependían de ser hijos directos en flex/grid, así que fue
    seguro; se agregó `.nav-list { list-style: none; margin: 0; padding: 0; }` para resetear
    el estilo nativo de lista. El divisor `<div className="menu-label spaced">ADMIN</div>` pasó
    a `<li>` (único hijo válido de `<ul>` junto a `<script>`/`<template>`).
  - **13 bloques de nav-item casi idénticos → array de configuración + `.map()`:** cada bloque
    tenía la forma `{condición && <button onClick={...}><Icon/>{isSidebarOpen && <span>Label</span>}</button>}`.
    Se extrajo un tipo `NavItemConfig { tab, label, icon: LucideIcon, visible, onClick? }` y dos
    arrays (`mainNavItems`, `adminNavItems`, separados por el divisor "ADMIN"), renderizados con
    una función `renderNavItem` compartida. Se preservaron **todos** los comentarios `⭐` que
    explican por qué cada ítem chequea el módulo que chequea (ej. "Status History" acepta
    `canView('Status History') || canView('Houses')`, "Settings" usa `onSettingsClick` en vez
    de `handleNavClick`) — se movieron junto a la entrada del array correspondiente en vez de
    perderse. Resultado: 197 → 155 líneas, mismo comportamiento.
  - **No se tocó:** la duplicación menor de `window.innerWidth <= 768` (aparece 2 veces) —
    demasiado pequeña para justificar una extracción.
  - Verificado con `tsc --noEmit` y `eslint` (ambos limpios antes y después, sin regresión).
    No se pudo probar visualmente en navegador en esta sesión (sin herramienta de automatización
    de navegador disponible) — se verificó por lectura cuidadosa que las condiciones de
    visibilidad, `onClick` y orden de ítems son equivalentes al código original.

- [x] `src/components/SidePanel.tsx` — **Eliminado por completo**. Hallazgos:
  - **Código muerto:** a diferencia de `Header.tsx` (que era un mockup roto), este era un
    drawer lateral genérico y funcional (props/callbacks reales, sin bugs) — pero **nadie lo
    importaba** en todo el proyecto (verificado con `grep`, incluyendo búsqueda de imports
    dinámicos). Ninguna vista lo usa; cada modal/panel del proyecto construye el suyo propio.
  - **CSS huérfano en cascada:** las clases `.side-panel-overlay`, `.side-panel`,
    `.fade-in-right` (+ su `@keyframes fadeInRight`), `.side-panel-header`,
    `.side-panel-title`, `.side-panel-actions`, `.side-panel-body` y `.btn-icon` en
    `src/App.css` solo las usaba este componente — se eliminaron todas junto con el archivo.
  - Verificado con `tsc --noEmit` tras el borrado — sin errores, ninguna otra parte del
    proyecto referenciaba el componente ni esas clases.

- [x] `src/components/StatusHistoryPanel.tsx` — Componente enfocado (108 líneas), sin
  bugs de lógica. Cambios aplicados:
  - **Duplicación con `utils/relations.ts` (7mo caso):** `findStatus`/`colorFor`/`nameFor`
    reimplementaban la misma búsqueda case-insensitive id-o-nombre. `colorFor` se reemplazó
    1:1 por `getRelationColor(statuses, idOrName) || '#64748b'`. `nameFor` **no** se
    reemplazó 1:1 — tenía una diferencia de comportamiento real: si el status ya no existe
    en el catálogo (fue borrado), cae al valor crudo guardado en el historial
    (`String(idOrName)`) en vez de un fallback genérico, para que el historial siga siendo
    legible aunque el status haya sido eliminado. Se resolvió con un wrapper delgado que
    delega la búsqueda a `getRelationName` pero pasa `String(idOrName)` como fallback en vez
    de uno fijo, preservando el comportamiento original exacto.
  - **Semántica del JSX:** `.shp-counts` (pills de conteo por status) y `.shp-timeline`
    (línea de tiempo de cambios) — ambos resultado de `.map()` — pasaron de `<div>` a
    `<ul>/<li>`. Verificado el CSS: ambos usan `display:flex`/`flex-wrap`, que funciona
    igual como hijos `<li>`; se agregó `list-style:none; margin:0;` (+`padding:0` en la
    timeline, que no tenía padding propio) a los `.shp-counts`/`.shp-timeline` para
    resetear el estilo nativo de lista.
  - **Hallazgo colateral resuelto:** `statusHistoryService.ts` tenía un método `countsFrom`
    **sin ningún caller** en todo el proyecto — el conteo real vivía reimplementado inline
    en este componente (con una diferencia real: usa el nombre ya resuelto contra el
    catálogo como key, no el valor crudo `toStatusName || toStatusId`). Se eliminó el
    método muerto.
  - **Observaciones anotadas, no corregidas (fuera del alcance acordado para este archivo):**
    - `setLoading(true)` se llama de forma síncrona dentro del `useEffect` de carga —
      `eslint` (regla `react-hooks/set-state-in-effect`) lo marca como error preexistente.
      No es un bug funcional (el componente ya usa `active` para evitar el "race condition"
      clásico de setState tras unmount), pero podría refactorizarse a un patrón de
      `reducer`/estado combinado si se quiere silenciar la regla.
    - `src/services/statusHistoryService.ts` línea 25: `addDoc(..., data as any)` — cast
      `any` preexistente sin relación con los hallazgos de este componente.
  - Verificado con `tsc --noEmit` (sin errores) y `eslint` — mismos 2 problemas
    preexistentes de antes (ninguno introducido por estos cambios, ver observaciones arriba).

- [x] `src/views/CalendarView.tsx` — 749 líneas. Esta revisión encontró el primer **bug
  funcional real** de la sesión (no solo limpieza), más varios hallazgos estructurales:
  - **🔴 Bug corregido — `properties` ignorado:** `App.tsx` le pasaba `properties={visibleProperties}`
    (lista en tiempo real vía `onSnapshot`, compartida con `HousesView`/`InvoicesView`/etc.),
    pero la firma del componente solo desestructuraba `{ onOpenMenu, onCheckHouse }` — el
    prop nunca se usaba. En su lugar, hacía su propio `propertiesService.getAll()` una sola
    vez al montar, en un estado local (`propertiesList`) totalmente desconectado. Efecto: el
    Calendario no reflejaba cambios en tiempo real hechos desde otras vistas/usuarios
    mientras estaba abierto, y duplicaba una lectura de Firestore que `App.tsx` ya tenía
    resuelta. Se corrigió: `CalendarView` ahora recibe `properties`/`setProperties` como
    props (igual que `HousesView`), se eliminó el estado local y el fetch redundante, y
    `handleSave`/`handleDelete` enrutan por `setProperties` en vez de estado propio.
  - **🔴 Bug corregido — botón "Quality Check" desconectado:** `App.tsx` nunca le pasaba
    `onCheckHouse` a `CalendarView` (sí se lo pasa a `HousesView`), así que el botón
    "Quality Check" del modal de detalle no hacía nada al hacer clic. Se conectó
    `onCheckHouse={handleCheckHouse}` en `App.tsx`.
  - **`CustomSelect` tipado genéricamente** (solo en este archivo): antes `({ options,
    value, onChange, ... }: any)` con `options.find((o: any) => ...)`; ahora
    `function CustomSelect<T extends { id: string; name: string; color?: string }>(...)`,
    eliminando 6 usos de `any` en este componente local.
  - **Semántica del JSX:** los 13 pares label/valor del modal "Property Overview"
    (`.cv-detail-item` con `<span className="cv-detail-label">`+`<span className="cv-detail-value">`)
    pasaron a `<dl className="grid-3-cols">` + `<dt>`/`<dd>` (wrapper `.cv-detail-item` se
    mantiene como `<div>`, válido dentro de `<dl>` en HTML5). Se resetearon los márgenes por
    defecto que el navegador aplica a `<dl>`/`<dd>` en `CalendarView.css`, incluyendo un
    override específico (`dl.grid-3-cols`) para no afectar los otros 2 archivos que usan la
    clase global `.grid-3-cols` sobre un `<div>` normal.
  - **🟡 Hallazgo grande, anotado en su momento, resuelto después** (ver sección
    "Extracciones compartidas" más abajo, entrada "`src/types.ts` eliminado"): existían dos
    archivos de tipos paralelos, `src/types.ts` (legacy) y `src/types/index.ts`, y sus
    versiones de `Property` divergían. Se intentó quitar los `as any` en `handleSave` de este
    archivo y `tsc` reveló el conflicto en su momento; se restauraron con un comentario
    explicando por qué hacían falta. Ese comentario y los `as any` ya no existen — se
    resolvieron al unificar los tipos.
  - **🟡 Hallazgo anotado en su momento, resuelto después** (ver sección "Extracciones
    compartidas" más abajo): `CustomSelect` estaba duplicado en 3 archivos (`SettingsView.tsx`,
    `CalendarView.tsx`, `HousesView.tsx`) con diferencias de comportamiento reales entre
    copias — se dejó sin tocar en esta revisión porque requería decidir un comportamiento
    canónico antes de unificar, mismo criterio que con `StatusChangeModal`.
  - Verificado con `tsc --noEmit` (sin errores) y `eslint`: `CalendarView.tsx` bajó de 11 a
    5 errores (los 5 restantes son preexistentes y no relacionados: 2 vars `id` sin usar por
    destructuring, 2 `as any` necesarios por el hallazgo de tipos de arriba, y una expresión
    sin usar en el botón de Quality Check). `App.tsx` ganó **un** `as any` nuevo
    (`setProperties={setProperties as any}`), inevitable por el mismo hallazgo de tipos y
    consistente con el patrón ya usado para `HousesView`/`InvoicesView`/etc.

- [x] `src/views/CompanySettingsView.tsx` — 196 líneas, componente único y cohesivo, sin
  `any`, sin duplicación. Cambios aplicados:
  - **🔴 Seguridad — XSS almacenado corregido en `src/utils/companyBranding.ts`:**
    `brandingHeaderHTML`/`brandingFooterHTML`/`brandLogoTag` interpolaban `name`, `address`,
    `phone`, `email` (y `logo` como atributo `src`) directamente en strings HTML **sin
    escapar**. `CompanySettingsView.tsx` los renderiza con `dangerouslySetInnerHTML` en la
    vista previa en vivo mientras el admin escribe — un nombre de empresa como
    `<img src=x onerror=alert(1)>` se ejecutaba de inmediato en el navegador del admin. El
    propio comentario del archivo dice que estos helpers están pensados para reutilizarse en
    "cualquier generador (PDF/HTML: Quality Check, nómina, facturas, etc.)" — hoy solo esta
    vista los usa, pero se corrigió en el archivo de utilidad (un `escapeHtml()` aplicado en
    los 3 helpers exportados) para blindar también los usos futuros, no solo este call site.
  - **Accesibilidad/semántica:** los 4 campos de texto (nombre, correo, dirección, teléfono)
    usaban `<span className="cs-label">` en vez de `<label>` asociado al input — a diferencia
    de `CalendarView.tsx` (donde los campos son `CustomSelect`, sin target nativo), acá son
    `<input>`/`<textarea>` nativos, así que se asociaron correctamente con `htmlFor`/`id`. El
    campo de logo (sin un único input natural — botón "Subir", input file oculto, botón
    "Quitar") se dejó como `<span id="cs-logo-label">` con `aria-labelledby`/
    `aria-describedby` en vez de forzar un `<label>` que no envuelve nada con sentido.
  - Verificado con `tsc --noEmit` y `eslint` — 0 errores antes y después en ambos archivos
    (sin regresión).

- [x] `src/views/CustomersView.tsx` — 248 líneas, componente único y cohesivo. Cambios
  aplicados:
  - **`formData` tipado:** era `useState<any>({...})` con `as any`/`as Customer` en cada
    guardado. Se comparó el `Customer` de `../types/index` (el que usa este archivo) contra
    el de `../types` (el que usa `customersService.ts`, el archivo de tipos legacy) — a
    diferencia de `Property` (ver hallazgo pendiente en `CalendarView.tsx`), acá **son
    estructuralmente idénticos**, así que los `as any` eran innecesarios sin condición
    alguna. Se tipó `formData` como `Customer` directamente y se quitaron los 3 casts.
    `c.id as string` en `handleDelete` también se quitó (`Customer.id` ya es `string`).
  - **Botón "Filters" no funcional eliminado:** `<button className="cx-btn-filters">` sin
    `onClick` ni estado de filtro asociado en ningún lugar del archivo — decorativo, no
    hacía nada al hacer clic. Se eliminó (y el import ahora-huérfano de `Filter` de
    `lucide-react`).
  - **Comentarios históricos eliminados:** 2 comentarios `{/* Corregido: ... */}` que
    describían un cambio ya hecho (unificar city/state/zip en `cityStateZip`) sin aportar
    contexto vigente sobre una restricción actual.
  - Verificado con `tsc --noEmit` (sin errores) y `eslint`: 4 → 1 problemas (el restante,
    `id` sin usar en el destructuring de `handleSave`, es el mismo patrón preexistente visto
    en otros archivos — no se tocó).

- [x] `src/views/DataImportView.tsx` — 1089 líneas, el archivo más grande revisado hasta
  ahora: un wizard de 5 pasos (upload → mapping → preview → importing → done) para
  importar CSVs a cualquier colección de Firestore con mapeo de columnas configurable.
  - **Decisión de estructura — se preguntó explícitamente al usuario:** ¿dividir los 5
    pasos en sub-componentes? Se decidió **no dividir**: cada paso comparte 10-15 variables
    de estado del wizard (`csvData`, `fieldMappings`, `selectedCollection`, `importProgress`,
    etc.), así que separar en componentes obligaría a un prop-drilling pesado sin beneficio
    real — ningún paso se reutiliza en otro lugar, es un flujo cohesivo, no varias features
    independientes. Coherente con el criterio ya aplicado en `CalendarView.tsx` (749 líneas,
    tampoco se dividió).
  - **Tipado completo, 14 `any` → 0:**
    - Se definió `type CsvRow = Record<string, string>` (así es como PapaParse entrega cada
      fila con `header:true`, sin `dynamicTyping`) y se tipó `csvData`, `detectType`,
      `transformRow` con eso en vez de `any[]`.
    - `Papa.parse(file, {...})` → `Papa.parse<CsvRow>(file, {...})` — la librería soporta
      un genérico, así que `results.data` sale tipado sin necesitar `results.data as any[]`.
    - El callback `error` de PapaParse en realidad está tipado `(error: Error, file) => void`
      en sus propios `.d.ts` — el `any` ahí no hacía falta ni siquiera antes.
    - Los 2 `catch (err: any)` (uno por fila al importar, uno para el batch completo) pasaron
      a `catch (err)` con `err instanceof Error ? err.message : 'valor por defecto'` —
      patrón seguro para capturar cualquier valor lanzado, no solo `Error`.
    - `(acc as any)[c]++` en el `reduce` de conteos por estado — el cast no hacía falta,
      `classifyHeader` ya devuelve exactamente el tipo de las claves de `acc`.
  - **De paso, 2 errores preexistentes de `eslint` corregidos:** `no-case-declarations` en
    el `switch` de `transformValue` (los `case 'number'`/`case 'date'` declaraban `const`
    sin llaves propias — cualquier otro `case` podía referenciar esa variable por error de
    scope). Se envolvieron en `{ }`.
  - **No se tocó** (fuera del alcance acordado): el `useCallback` de `handleDrop` con
    dependencia faltante (`handleFile`) — warning preexistente, no error.
  - Verificado con `tsc --noEmit` (sin errores) y `eslint`: 15 → 1 problemas (el restante es
    el warning de `useCallback` mencionado arriba).

- [x] `src/views/HousesView.tsx` — 3417 líneas (~3130 solo del componente principal: 59
  `useState`, ~25 handlers, luego un único `return` de ~1729 líneas de JSX). El archivo más
  grande del proyecto — se acordó con el usuario revisarlo en 2 pasadas completas (estado+
  handlers, luego JSX) en vez de una pasada estructural rápida.
  - **🔴 Bug crítico de pérdida de datos, corregido:** los botones "Eliminar" de la tabla y
    de las tarjetas móviles hacían `setSelectedHouse(prop); handleDelete();` en la misma
    línea. Como `setState` de React no es síncrono, `handleDelete()` se ejecutaba leyendo el
    `selectedHouse` **anterior** (closure del render actual, ej. la última casa abierta en
    el modal de detalle) en vez de `prop` (la fila recién clickeada). Escenario real: abrir
    la casa A, cerrar el modal, y darle "Eliminar" directo a la fila de la casa B en la
    tabla borraba la casa A por error — sin ningún indicio visual, el `confirm()` ni
    siquiera mostraba qué casa se iba a borrar. Se corrigió cambiando `handleDelete` para
    recibir la propiedad explícita como parámetro (`house?: Property`, con fallback a
    `selectedHouse` para el botón "Delete Property" dentro del propio modal de detalle, que
    sí depende correctamente de ese estado) y actualizando los 2 call sites afectados para
    pasar la fila/tarjeta directamente. De paso se corrigió un problema relacionado: el
    borrado también eliminaba los `billing_services` de `houseServices` (estado), que solo
    se llena al abrir el modal de detalle — al borrar directo desde la tabla sin abrirlo
    antes, ese estado estaba vacío o correspondía a otra casa. Ahora se consultan los
    `billing_services` de la propiedad correcta directo a Firestore dentro de `handleDelete`.
  - **🔴 XSS almacenado, corregido:** `generatePDF` armaba HTML crudo con el nombre del
    cliente y la dirección de la propiedad (datos escritos por un usuario) interpolados sin
    escapar, y lo escribía con `printWindow.document.write(html)` en una ventana nueva
    (`window.open('', '_blank')`). Más grave que el caso de `CompanySettingsView` porque esa
    ventana nueva conservaba acceso a `window.opener` (la pestaña principal de la app) — un
    script inyectado ahí podría alcanzar la sesión de otro admin que abriera ese mismo
    reporte después. Se extrajo el helper `escapeHtml` (antes privado en
    `companyBranding.ts`) a `src/utils/escapeHtml.ts` para reutilizarlo en ambos archivos, se
    aplicó a `clientLabel`/`addressLabel` antes de interpolar, y se agregó `'noopener'` al
    `window.open` para cortar el acceso a `window.opener` como defensa adicional.
  - **Prop `onCheckHouse` muerto, eliminado:** era requerido en la interfaz, `App.tsx` lo
    pasaba (`onCheckHouse={handleCheckHouse}`) en los tabs `houses` y `pipeline`, el
    componente lo recibía (renombrado a `_onCheckHouse`, indicando que ya se sabía que no se
    usaba) — pero no hay ningún botón de "Quality Check" en todo el archivo, a diferencia de
    `CalendarView`/`RecallsView` que sí lo tienen y lo conectan. Se eliminó de la interfaz,
    el destructuring, y los 2 call sites en `App.tsx` (el de `CalendarView` sí lo sigue
    usando y quedó intacto).
  - **Tipado, 54 → 9 `any`:**
    - `SearchableSelect`/`CustomSelect` (helpers a nivel de módulo, `CustomSelect` es la 3ra
      copia del hallazgo pendiente de duplicación cruzada) tipados genéricamente
      (`<T extends { id: string; name: string; color?: string }>`), igual que se hizo en
      `CalendarView.tsx`.
    - **21 casts `(selectedHouse as any).employeeXxx` eliminados** — el tipo local
      `Property` de este mismo archivo (línea 30) ya declaraba esos 4 campos; alguien los
      agregó al tipo en algún momento sin limpiar los casts que ya no hacían falta.
    - `employees`/`products`/`customersList` pasaron de `any[]`/`as any` a `SystemUser[]`/
      `ProductRecord[]` (interfaz local nueva, `settings_products` no tiene tipo compartido)/
      `Customer[]`.
    - `recordTotalMinusTax`, `isHiddenPipelineStatus`, `getServiceName` tipados con los
      tipos reales (`ServiceRecord`, `Property`, `products`/`services` ya tipados).
    - `addPhotoFiles` amplió su firma a `FileList | File[] | null` (antes solo `FileList`)
      para que la ráfaga de cámara pueda pasarle un array de `File` real en vez de
      `[file] as any`.
    - **2 campos agregados a `types/index.ts`** al descubrirlos usados en este archivo sin
      existir en el tipo canónico (sí estaban en el legacy `types.ts`): `Status.dashboardOrder`
      y `Tax.name` — mismo síntoma que el hallazgo pendiente de `Property.tag.type` en
      `CalendarView.tsx`, cada campo que falta se va parchando por separado con `any` en vez
      de arreglarse en el tipo, así que fueron agregados directamente.
    - Los 9 `any` restantes eran todos `propertiesService.update/create(... as any)` — mismo
      caso que en `CalendarView.tsx`/`CustomersView.tsx`: `propertiesService.ts` importaba
      `Property` del archivo de tipos legacy (`../types`), que divergía de `../types/index`.
      Resuelto después al unificar los tipos (ver "Extracciones compartidas" más abajo,
      entrada "`src/types.ts` eliminado") — de los 9, quedó exactamente 1 (línea 1254,
      `dataForFirestore`, por campos genuinamente locales de este archivo que no pertenecen
      al tipo canónico), los otros 8 ya no necesitan el cast.
    - Comentario histórico eliminado (`// Importación corregida a ../components/PhotoSection`).
  - Verificado con `tsc --noEmit` (sin errores en todo el proyecto) y `eslint` combinado de
    `HousesView.tsx` + `App.tsx` + `types/index.ts`: 90 → 32 problemas (58 menos, sin
    regresiones — confirmado contra el baseline vía `git stash`).

- [x] `src/views/InvoicesView.tsx` — 803 líneas, componente único. Cambios aplicados:
  - **Prop `onViewProperty` muerta, eliminada:** declarada en la interfaz pero nunca
    desestructurada ni llamada — el propio comentario del archivo explicaba que fue una
    decisión deliberada ("siempre usamos el modal interno propio"), pero la declaración
    quedaba en la interfaz de todas formas, insinuando una funcionalidad que no existía.
  - **Tipado:** `payrolls` → `PayrollRecord[]` (ya existía el tipo); `billedServices` →
    nueva interfaz local `BilledServiceRecord` (billing_services tampoco tiene tipo
    compartido); `getPayrollTotal(pay: any)` → `getPayrollTotal(pay: PayrollRecord)`.
    `(a/b as any).order` en el sort de statuses eliminado — `Status.order` ya está tipado.
  - **Semántica, alcance ajustado respecto a `CalendarView.tsx`:** en ese archivo el grid de
    detalle completo era uniformemente pares label/valor, así que se convirtió entero a
    `<dl>/<dt>/<dd>`. Acá `.grid-3-cols` mezcla pares label/valor reales con un resumen
    financiero de 3 tarjetas y una lista de chips de workers que no encajan en el modelo
    `dt`/`dd` — convertir todo el grid habría producido HTML inválido (`<dl>` solo admite
    grupos `dt`+`dd`, opcionalmente envueltos en `<div>`). Se convirtió únicamente el banner
    de dirección (`.inv-detail-banner`, un solo par limpio y aislado) a `<dl>`; el resto del
    grid se dejó como `<div>`.
  - **Observaciones anotadas, no corregidas (fuera del alcance acordado):**
    - `JobStatusPill` reimplementa su propio dropdown inline para cambiar el status del job,
      en vez de usar el `StatusChangeModal` compartido que ya adoptaron `HousesView`/
      `PipelineBoardView` — inconsistencia de UI, no bug.
    - El modal "Property Overview" es la 3ra reimplementación de ese detalle en el proyecto
      (junto a `CalendarView.tsx` y el componente compartido `PropertyDetailModal.tsx`) —
      candidato a una consolidación futura más grande, no para esta sesión.
  - Verificado con `tsc --noEmit` (sin errores) y `eslint`: 13 → 6 problemas (los 6
    restantes son preexistentes: un regex con escapes innecesarios y 2 `any` en
    `propertiesService.update(...)`, atados al hallazgo pendiente de tipos).

- [x] `src/views/NoticeBoardView.tsx` — 447 líneas. **El archivo más limpio de toda la
  sesión**: sin `any`, sin código muerto, sin bugs de lógica, `eslint` en cero antes de
  tocar nada. Cambios aplicados:
  - **Semántica del JSX:** el feed de posts (`announcements.map(...)`) y la lista de
    comentarios de cada post (`postComments.map(...)`) pasaron de secuencias de `<div>` a
    `<ul>/<li>` (`.nb-feed` y `.nb-comments-list` respectivamente), con el reset de
    `list-style`/`margin`/`padding` correspondiente. Se envolvió únicamente la rama que
    renderiza la lista real — los estados de loading/empty quedaron fuera del `<ul>`, como
    corresponde (no son ítems de la lista).
  - **Observación, no corregida (fuera de alcance, ya cubierta por el hallazgo pendiente de
    tipos):** las interfaces locales `Announcement`/`Comment` de este archivo son un
    duplicado exacto, campo por campo, de `Announcement`/`AnnouncementComment` en el
    `src/types.ts` legacy — pero esas del legacy están huérfanas (nadie las importa, ni
    siquiera este archivo). Mismo síntoma que el resto de los hallazgos de `types.ts` vs
    `types/index.ts`: cuando se resuelva ese pendiente, sería el momento de mover estos
    tipos al archivo canónico en vez de mantenerlos duplicados localmente.
  - Verificado con `tsc --noEmit` y `eslint` — 0 problemas antes y después (sin regresión).

- [x] `src/views/PayrollView.tsx` — 712 líneas. Cambios aplicados:
  - **`toTime` duplicado dentro del mismo archivo, unificado:** existían dos
    implementaciones — una simple dentro del `useEffect` de carga (solo soportaba ISO
    directo o lo que `new Date()` pudiera parsear) y otra más completa dentro de
    `filteredRecords` (soporta ISO, `MM/DD/YYYY`, `DD/MM/YYYY` y Timestamps de Firestore).
    La primera no solo era una duplicación sino una versión inferior de la segunda — se
    dejó una sola función a nivel de módulo (la robusta) y se usa en ambos lugares.
    `empName`/`fmtDate` también se subieron a nivel de módulo (estaban duplicadas dentro
    del componente sin necesidad, ya que no dependen de ningún estado).
  - **Tipo local `PayrollRecordExt`:** `paidAt`/`paidBy` se escriben en el documento
    (`handleMarkAsPaid`) y se leen en varios lugares, pero no están en el `PayrollRecord`
    compartido — de ahí salían casi todos los `any` del archivo. Se agregó
    `type PayrollRecordExt = PayrollRecord & { paidAt?: string | null; paidBy?: string | null }`
    y se usó en el estado y las funciones que lo necesitan. `payrollService.update` sigue
    tipando `Partial<PayrollRecord>` (el tipo compartido, sin esos 2 campos) — en los 2
    call sites que escriben `paidAt`/`paidBy` se dejó un cast puntual con un comentario
    explicando por qué, en vez de tocar el servicio compartido.
  - **`(a/b as any).order`/`.date` eliminados** — `Status.order` y `PayrollRecord.date` ya
    estaban tipados, los casts no hacían falta.
  - **Semántica:** el modal "Property Overview" tiene **dos** banners con la clase
    `.pv-detail-banner` — uno con nombre+dirección+botón "View Property" (no es un par
    label/valor limpio, se dejó como `<div>`) y otro con solo la dirección (idéntico al
    patrón de `InvoicesView.tsx`/`CalendarView.tsx`, convertido a `<dl>/<dt>/<dd>`). Se
    agregó un selector `dl.pv-detail-banner` en el CSS para resetear el margin solo donde
    se usa como `<dl>`, sin afectar el otro uso como `<div>`.
  - Verificado con `tsc --noEmit` (sin errores) y `eslint`: 35 → 1 problemas (34 `any`
    eliminados, más 4 `no-useless-escape` que desaparecieron solos al unificar el `toTime`
    duplicado — la copia simple tenía un regex con escapes innecesarios que ya no existe).
    El único problema restante es un warning preexistente de `useEffect`, no tocado.

- [x] `src/views/PhotoSettingsView.tsx` — 206 líneas, componente pequeño y bien construido
  (2 componentes: `PhotoSettingsView` y `ToggleSwitch` local, este último sin duplicar en
  ningún otro archivo). Hallazgo principal, distinto a los casos previos de código muerto:
  - **🟡 Vista huérfana, no eliminada:** a diferencia de `Header.tsx` (roto) o
    `SidePanel.tsx` (genérico sin caso de uso), esta vista es la **única forma de escribir**
    en `photoConfigService.update` — y ese documento (`app_settings/photo_config`) sí lo
    lee activamente `HousesView.tsx` para la compresión de fotos. Es decir: la
    funcionalidad de "configurar fotos" tiene su backend funcionando, pero **nadie puede
    tocar esos ajustes desde la UI** porque esta pantalla nunca quedó enlazada — no
    aparece en `SettingsView.tsx` ni en el Sidebar. También se notó que, a diferencia de
    todas las demás vistas de nivel superior de la app, no recibe `onOpenMenu` ni tiene
    botón de hamburguesa, lo que sugiere que pudo haberse pensado como una vista anidada
    dentro de `SettingsView` en vez de una pestaña propia. Decidir dónde y cómo enlazarla
    es una decisión de producto (¿pestaña propia? ¿dentro de Settings? ¿qué permiso la
    gatea?), así que se dejó anotada sin tocar la navegación.
  - **`catch (error)` con variable sin usar**, corregido a `catch { }` (el error no se
    usaba, solo se mostraba un mensaje genérico).
  - **Accesibilidad:** `ToggleSwitch` es un `<button>` que actúa como interruptor pero no
    tenía `role="switch"` ni `aria-checked` — un lector de pantalla no podía anunciar su
    estado. Se agregaron ambos atributos.
  - Verificado con `tsc --noEmit` y `eslint` — 1 → 0 problemas.

- [x] `src/views/QCDashboardView.tsx` — 620 líneas, dashboard analítico de Quality
  Check/Recall con harta lógica de agregación (`useMemo` en cascada) pero JSX de render
  relativamente simple. Cambios aplicados:
  - **6 componentes presentacionales subidos a nivel de módulo:** `KPICard`, `BarList`,
    `HeatList`, `TrendChart`, `Card`, `Empty` estaban definidos como `const` dentro del
    cuerpo de `QCDashboardView` — se recreaban en cada render sin necesidad, ya que
    ninguno depende de estado ni props del componente padre (todo lo reciben por props
    propias). Se movieron a nivel de módulo con `function`, siguiendo el mismo patrón que
    `SearchableSelect`/`CustomSelect`/`StatusPillSelector` en `HousesView.tsx`. De paso,
    `KPICard` y `Card` (que estaban tipados `any`) pasaron a tener interfaces de props
    reales (`icon: LucideIcon`, etc.).
  - **Prop `currentUser?: any` sin usar, eliminada:** se recibía renombrada a
    `_currentUser` (ya se sabía que no se usaba). `QualityCheckHub.tsx` la tipa
    correctamente como `SystemUser | null` y la sigue pasando a `QualityCheckView` (que sí
    la usa) — se quitó únicamente del paso a `QCDashboardView`.
  - **`loadData` tipado:** mismo patrón ya aplicado en `CalendarView.tsx`/
    `PropertyDetailModal.tsx` — `.catch(() => ({ docs: [] as any[] }))` → `.catch(() => null)`
    + `(snap?.docs || [])` con un cast puntual por colección en vez de `(snap as any).docs`
    y `.map((d: any) => ...)`.
  - **No se tocó (decisión explícita):** `qcData?: Record<string, any>` en `QCRecord` — la
    estructura del formulario de Quality Check es genuinamente dinámica (varía por
    área/tarea configurable), así que dejarlo como `any` en ese único campo es defendible.
  - Verificado con `tsc --noEmit` (sin errores) y `eslint` (`QCDashboardView.tsx` +
    `QualityCheckHub.tsx`): 24 → 5 problemas (el único `any` restante es el de `qcData`
    mencionado arriba; los 3 warnings de `useMemo` y el `any` de `QualityCheckHub.tsx` son
    preexistentes y no relacionados).

- [x] `src/views/QCRouteView.tsx` — 630 líneas, planificador de rutas para casas con QC
  pendiente (geocoding, ordenamiento por cercanía, rutas guardadas). Cambios aplicados:
  - **🟡 Descubrimiento durante la revisión — mucho más grande de lo esperado:** los
    propios comentarios del archivo ("misma lógica que Quality Check") admitían que
    `isQualityCheckStatus`/`latestQCForHouse`/`housePassedQC`/`houseFailedQC` estaban
    duplicadas en `QualityCheckView.tsx`. Al ir a extraerlas se descubrió que en realidad
    hay **dos features completas de ruteo en paralelo**: este archivo Y un drawer "Route"
    embebido dentro de `QualityCheckView.tsx` (con mapa visual, `haversineKm` y
    `geocodeAddress` propios). Se pausó y se le preguntó al usuario cómo ajustar el
    alcance — la respuesta fue extraer **solo** lo genuinamente idéntico (la lógica de
    "qué casas tienen QC pendiente") y **no tocar** las dos implementaciones de ruteo en
    sí, que quedaron anotadas como pendiente de decisión de producto.
  - **Extracción realizada:** `src/utils/qcStatus.ts` (nuevo) exporta `isQualityCheckStatus`,
    `latestQCForHouse`, `housePassedQC`, `houseFailedQC` como funciones puras (genéricas
    sobre `QCStatusLike`, reciben `statuses`/`qcList` como parámetros en vez de cerrar
    sobre el estado del componente). Migrados ambos archivos: en `QCRouteView.tsx` se
    quitaron las 4 definiciones locales; en `QualityCheckView.tsx` se hizo el cambio
    **mínimo posible** (solo estas 4 funciones y sus call sites) sin tocar nada más de ese
    archivo de 3124 líneas, ya que todavía no le toca su revisión completa.
  - **Tipado del resto del archivo:** `statuses`/`customers`/`teams` pasaron de `any[]` a
    `Status[]`/`Customer[]`/`Team[]`; `getClientName`/`getTeamName` migrados a
    `getRelationName` de `utils/relations.ts` (mismo patrón ya aplicado en ~8 archivos);
    `qcList` tipado con una interfaz local `QCListRecord` que satisface `QCStatusLike`; 3
    `as any` innecesarios en `updateDoc`/`addDoc` sobre `qc_routes` eliminados. Se dejó
    `preCoords(h: any)` sin tocar — hace duck-typing deliberado contra campos legacy que no
    existen en el tipo `Property` (`h.lat`, `h.latitude`, `h.coords.lat`, etc.), similar al
    caso de `qcData` en `QCDashboardView.tsx`.
  - Verificado con `tsc --noEmit` (sin errores en todo el proyecto) y `eslint` combinado de
    `QCRouteView.tsx` + `QualityCheckView.tsx`: 131 → 105 problemas (26 menos, sin
    regresiones — el resto de los problemas en `QualityCheckView.tsx` son preexistentes y
    quedan para cuando le toque su revisión completa).

- [x] `src/views/QualityCheckView.tsx` — 3098 líneas, el segundo archivo más grande del
  proyecto. Revisado en 2 pasadas (Pasada 1: helpers de módulo + estado + handlers, líneas
  1-2298; Pasada 2: JSX de render, líneas 2298-3098), decisión explícita del usuario dado el
  tamaño. Cambios aplicados:
  - **🔴 XSS corregido (3ra ocurrencia del mismo patrón en el proyecto,** después de
    `CompanySettingsView.tsx`/`companyBranding.ts` y `HousesView.tsx`/`generatePDF`):
    `buildAndExportQCPDF` construye un template HTML crudo por interpolación de strings,
    que se usa tanto para abrir una ventana de impresión (`window.open` +
    `document.write`) como para el cuerpo de un email (guardado en la colección `mail` de
    Firestore, consumida por la extensión "Trigger Email"). Se envolvieron en
    `escapeHtml()` (reutilizando `src/utils/escapeHtml.ts`, ya creado para los 2 casos
    anteriores) todos los campos de texto libre o de catálogo interpolados: `branding.name`/
    `address`/`logo`, `inspector`, `clientName`, `teamName`, `house.address`, nombre de
    tarea (`t.name`), nombre de área (`pd.place.name`), y — el punto de mayor riesgo, texto
    que escribe el inspector directamente — `pd.notes`/`pd.damage`. El `src` de las
    imágenes (`<img>`) se dejó sin escapar deliberadamente: son URLs de Firebase Storage o
    base64, no texto libre. También se agregó `noopener` al `window.open` como defensa
    adicional.
  - **Migración parcial a `utils/relations.ts`** (alcance acotado, aprobado explícitamente
    por el usuario): `getTeamNameForHouse`/`getClientName`/`resolveStatusName` reemplazaron
    sus `.find()` locales por `getRelationName`. `teams`/`customersList`/`statuses` pasaron
    de `any[]` a `Team[]`/`Customer[]`/`Status[]`. **No se tocaron** (fuera del alcance
    aprobado, quedan para una revisión completa futura del archivo):
    `getQualityCheckStatusId`, `getRecallStatusId`, `isRecallStatus`, `houseStatusInfo` —
    siguen con `.find((s: any) => ...)` inline.
  - **Limpieza menor de Pasada 2:** cast `(st: any)` redundante en el `.map()` del modal
    "Cambiar status", eliminado tras el tipado de `statuses` de la Pasada 1.
  - **🟡 2 hallazgos grandes de features paralelas, descubiertos y NO tocados** (decisión
    explícita del usuario, ver sección de pendientes más abajo): un dashboard de reportes
    (`QCReportsDashboard`) embebido como pestaña "Reportes" dentro de este archivo, que
    duplica a `QCDashboardView.tsx` (que además ya es una pestaña separada del mismo
    componente vía `QualityCheckHub.tsx` — confirmado al inspeccionar ese archivo); y un
    editor de configuración de empresa embebido (`companyModalOpen`/`companyDraft`) que
    lee/escribe el mismo documento Firestore (`settings_company/main`) que
    `CompanySettingsView.tsx`/`companyService.ts`.
  - **No se encontraron bugs de lógica/closures** en el resto del archivo: el planificador
    de rutas embebido (Leaflet + OSRM + geocoding real, más sofisticado que
    `QCRouteView.tsx`, que solo usa distancia haversine) reafirma — sin cambiarla — la
    decisión ya tomada de dejar las dos features de ruteo paralelas sin tocar; el manejo de
    fotos offline (IndexedDB), la cámara en ráfaga, el anotador de fotos (`PhotoAnnotator`)
    y `buildEmail` (cuerpo de texto plano para `mailto:`, ya seguro con
    `encodeURIComponent`) se revisaron y están correctos.
  - Verificado con `tsc --noEmit` (sin errores) y `eslint`: 105 → 93 problemas (todos
    `no-explicit-any` preexistentes; sin categorías nuevas, sin regresiones).

- [x] `src/views/RecallsView.tsx` — 939 líneas, tabla histórica de recalls + reporte de
  performance por equipo. Revisado en una sola pasada. Cambios aplicados:
  - **🔴 Bug funcional corregido (mismo patrón que `CalendarView.tsx`):** el componente
    recibe `properties` como prop, alimentado en `App.tsx` por un listener `onSnapshot` en
    tiempo real (el propio comentario de `App.tsx` dice que se agregó justo para que vistas
    como Recalls siempre tengan datos actualizados sin depender de que `HousesView` esté
    montado). Pero `RecallsView` hacía además su **propio fetch único** de `properties`
    (`getDocs`, en un `useEffect` sin dependencias) y, en cuanto ese fetch terminaba, su
    resultado (`loadedProps`) dominaba para siempre sobre el prop — cualquier cambio
    posterior en tiempo real (nueva casa, cambio de status desde otra pestaña, etc.)
    quedaba invisible hasta desmontar/remontar el componente. Se eliminó el fetch
    redundante de `properties` (junto con el estado `loadedProps`) y ahora `houses` usa el
    prop `properties` directamente. También se quitó un update local optimista en
    `changeStatus` que ya no hace falta: el listener en tiempo real refleja el cambio solo.
  - **Migración completa a `utils/relations.ts`:** `getClientName`/`getTeamName`/
    `getStatusName`/`statusNameById` reemplazados por `getRelationName`. `teams`/
    `statuses`/`customersList` tipados (`Team[]`/`Status[]`/`Customer[]`); `qcList`/
    `recallDocs` con interfaces locales nuevas (`QCRecordLite`, `RecallDoc` — colecciones
    sin tipo compartido); `historyDocs` tipado con `StatusHistoryEntry` (ya exportado por
    `statusHistoryService.ts`, no se creó uno nuevo). Se dejó `as any` únicamente en
    `propertiesService.update(..., { statusId } as any)`, atado al hallazgo pendiente de
    `types.ts` vs `types/index.ts` (mismo patrón en el resto del proyecto). También se
    dejaron sin tipar por diseño los campos legacy duck-typed en `isRecallProperty`
    (`isRecall`/`recall`/`hasRecall`/`recalled`/`recallCount`/`status`/`stage`/
    `pipelineStatus`/`jobStatus`) y en la fuente 2 del histórico (`recallDate`/`date`/
    `updatedAt`/`recallReason`) — no existen en el tipo `Property`, son datos históricos
    fuera del esquema canónico, mismo tratamiento que casos similares en
    `QCDashboardView.tsx`/`QCRouteView.tsx`.
  - **Hallazgo anotado, no accionado:** `isRecallText`/`RECALL_STATUS_HINTS` duplican
    conceptualmente `isRecallStatus`/`RECALL_HINTS` de `QualityCheckView.tsx` (detectar si
    un status es "Recall" por texto). No se unificó en esta pasada — candidato a
    `src/utils/qcStatus.ts` o un archivo hermano cuando se revisen ambos en conjunto.
  - Verificado con `tsc --noEmit` (sin errores) y `eslint`: 67 → 3 problemas (el único
    error restante es el `any` de `propertiesService.update` ya mencionado; los 2 warnings
    de `exhaustive-deps` son preexistentes, no relacionados con estos cambios).

- [x] `src/views/SettingsView.tsx` — 971 líneas, pantalla de configuración genérica que
  administra 12 tipos de settings (categorías, equipos, prioridades, status, tax, places,
  servicios, métodos de pago, tareas, productos, negocios, catálogo de equipo por
  empleado) con el mismo componente. Revisado en una sola pasada. Cambios aplicados:
  - **`SettingOption.icon: any` → `LucideIcon`** en `src/types/index.ts` (tipo compartido,
    usado por este archivo) — mismo patrón ya corregido antes en `QCDashboardView.tsx`/
    `QualityCheckHub.tsx`.
  - **`systemUsers` tipado a `SystemUser[]`** (antes `any[]`) — el tipo ya existía en
    `types/index.ts` con exactamente los campos usados (`firstName`, `lastName`, `email`,
    `teamId`).
  - **`key={idx}` → `key={t.id}`** en la lista de tareas asociadas a un Place dentro del
    formulario (`formData.placeTasks.map(...)`) — los items ya tienen `id` propio (real o
    temporal `temp-${Date.now()}`), es más correcto que el índice de array.
  - **Semántica del modal de detalle:** los bloques repetidos `<div class="stv-detail-item">
    <span class="stv-detail-label">/<span class="stv-detail-value">` (~10 apariciones,
    pares etiqueta/valor) convertidos a `<dl className="stv-detail-list"><div
    class="stv-detail-item"><dt>/<dd></div></dl>` en las 2 ramas donde forman un grupo real
    (`team_catalog`, rama por defecto). Se dejaron como `<div>` sueltos los casos de un solo
    par (`place`, `tax`) — un `<dl>` de un solo ítem no aporta valor semántico. Se agregó
    `.stv-detail-list` en `SettingsView.css` (reset de margen + el mismo `flex/gap` que
    antes daba directamente `.stv-modal-body`) y reset de margen en `dt`/`dd`.
  - **No se tocó (decisión explícita del usuario):** `selectedItem: any` y `dataToSave: any`
    — son genuinamente heterogéneos entre las 12 formas de dato que maneja este único
    estado; tipar una unión agregaría complejidad desproporcionada al beneficio, mismo
    criterio ya aceptado con `qcData: any` en `QCDashboardView.tsx`.
  - **`CustomSelect` local a este archivo** — en su momento se dejó anotado como pendiente
    ("CustomSelect triplicado"); resuelto después, ver sección "Extracciones compartidas".
  - Verificado con `tsc --noEmit` (sin errores en todo el proyecto) y `eslint` combinado de
    `SettingsView.tsx` + `types/index.ts`: 17 → 15 problemas (2 `any` menos, sin
    regresiones).

- [x] `src/views/StatusHistoryView.tsx` — 631 líneas, tabla de historial de status por casa
  + modal de "recorrido completo" (línea de tiempo de estados y episodios de Recall).
  Revisado en una sola pasada. Cambios aplicados:
  - **Prop `currentUser?: any` sin usar, eliminada** — se recibía en la interfaz y se
    pasaba desde `App.tsx`, pero el componente nunca la desestructuraba ni la usaba. Se
    quitó de la interfaz de props y del `<StatusHistoryView currentUser={currentUser} />`
    en `App.tsx`. Mismo patrón ya corregido antes en `QCDashboardView.tsx`.
  - **Migración completa a `utils/relations.ts`:** `getClientName`/`statusName` ahora usan
    `getRelationName`; `statusColor`/`teamInfo` usan `getRelationColor` (antes hacían el
    mismo `.find()` id-o-nombre a mano, con `statusColor` preservando su matiz de gris
    distinto según el caso — `'#94a3b8'` si no hay valor, `'#64748b'` si no se encuentra en
    el catálogo — para no cambiar el resultado visual).
  - **Tipado:** `teams` → `Team[]` (antes `any[]`); `historyAsc` → `StatusHistoryEntry[]`
    (tipo ya exportado por `statusHistoryService.ts`, reutilizado igual que en
    `RecallsView.tsx`). Se limpiaron de paso los casts `any` que quedaron redundantes en
    `journey`/`recallEpisodes` (`useMemo`s que iteran `historyAsc`) y en el sort de
    `statuses` por `order`, todos consecuencia directa de estos dos tipados.
  - **Hallazgo pendiente actualizado:** `isRecallText`/`RECALL_STATUS_HINTS` de este
    archivo son **idénticos letra por letra** a los de `RecallsView.tsx` — tercera
    ocurrencia del mismo concepto en el proyecto (contando la versión con nombres distintos
    de `QualityCheckView.tsx`). Se actualizó la nota de pendientes para reflejar los 3
    archivos en vez de 2.
  - No se encontraron bugs funcionales: el prop `properties` se usa directo (no hay fetch
    propio que lo pise, a diferencia del bug ya corregido en `CalendarView.tsx`/
    `RecallsView.tsx`).
  - Verificado con `tsc --noEmit` (sin errores en todo el proyecto) y `eslint` combinado de
    `StatusHistoryView.tsx` + `App.tsx`: 40 → 27 problemas (sin regresiones).

- [x] `src/views/admin/RolesView.tsx` — 428 líneas, matriz de permisos por rol (módulos ×
  view/add/edit/delete/scope, más filtros específicos del módulo Houses: statuses
  permitidos y visibilidad de grupos de elementos). Ya llegaba bien tipado — usa tipos
  locales `PermissionExt`/`RoleExt` con comentarios explicando por qué extienden los tipos
  canónicos (Firestore acepta propiedades extra que el tipo global `Permission` aún no
  declara). Cambios aplicados:
  - **2 `as any` innecesarios eliminados** en `handleSaveRole` (`updateDoc`/`addDoc`) —
    se verificó quitándolos y corriendo `tsc --noEmit`: compilaba limpio sin ellos, eran
    simplemente sobrantes.
  - **`handlePermissionChange` tipado como genérico** (`<K extends keyof PermissionExt>
    (moduleName: string, field: K, value: PermissionExt[K])`) en vez de `value: any`. El
    único cast que quedó es puntual y justificado: `e.target.value as 'Own' | 'All'` en el
    `onChange` del `<select>` de `scope`, porque el DOM siempre da `string` pero el
    `<select>` solo tiene esas dos `<option>`.
  - No se encontraron bugs de lógica ni problemas de semántica JSX — la tabla de roles y la
    matriz de permisos son genuinamente tabulares.
  - Verificado con `tsc --noEmit` (sin errores) y `eslint`: 6 → 2 problemas (los 2
    restantes son el patrón preexistente `const { id, ...rest } = formData` — desestructurar
    `id` para excluirlo del payload de Firestore — que se repite igual en 10+ archivos del
    proyecto, no relacionado con estos cambios).

- [x] `src/views/admin/UsersView.tsx` — 561 líneas, whitelist de usuarios del sistema (CRUD
  individual + bulk import + flujo de invitación por email vía Firebase Auth). Revisado en
  una sola pasada. Cambios aplicados:
  - **🔴 Bug de UI corregido, encontrado a través de un `any`:** el tipo compartido
    `SystemUser.status` (`types/index.ts`) solo declaraba `'Active' | 'Pending Invite'`,
    pero el `<select>` de este formulario ofrece una tercera opción, "Inactive". El
    `onChange` usaba `status: e.target.value as any`, que enmascaraba exactamente ese
    desajuste de tipos. Efecto visible: en la tabla, `statusVariant` solo distinguía
    "Pending" de todo lo demás como `'active'`, así que un usuario "Inactive" se mostraba
    con el punto y texto **verdes de "Active"** (`#10b981`) — justo lo opuesto de lo que
    debía comunicar. Se amplió `SystemUser.status` a `'Active' | 'Pending Invite' |
    'Inactive'`, se quitó el `any` del `onChange` (ahora `as SystemUser['status']`), y se
    agregó una variante visual `inactive` propia (rojo `#ef4444`) en `UsersView.css` y en
    el cálculo de `statusVariant`.
  - **Tipo local `SystemUserExt`** (mismo patrón que `PermissionExt` en `RolesView.tsx`):
    `inviteSent`/`inviteSentAt` se leen y escriben en Firestore pero no estaban declarados
    en el tipo global `SystemUser`. Antes se accedía vía `(user as any).inviteSent` en 2
    sitios; ahora el estado `users` y `handleSendInvite` están tipados con `SystemUserExt`
    y el acceso es directo y chequeado.
  - **Casts redundantes eliminados:** `user.id as string`/`u.id as string` (3 sitios —
    `SystemUser.id` ya es `string` obligatorio); `(newData as any).phone`/`.altPhone` (ya
    accesibles directo, `newData` es `Partial<SystemUser>`); `updateData as any` en el
    `updateDoc` de `handleSave` (se verificó quitándolo: compilaba limpio sin él).
  - **No se tocó (patrón preexistente en 6+ archivos):** `catch (error: any)` en
    `handleSave`/`handleSendInvite` — convención ya establecida en el proyecto para acceder
    a `error.message`.
  - Verificado con `tsc --noEmit` (sin errores en todo el proyecto) y `eslint` combinado de
    `UsersView.tsx` + `types/index.ts`: 12 → 5 problemas (sin regresiones; los 2 `catch
    (error: any)` y 2 `const { id, ...} = formData` sin usar son el mismo patrón preexistente
    ya visto en `RolesView.tsx`).

## Patrones a tener en cuenta en próximas revisiones
- **Convención de definición de componentes:** `export default function Componente(props: Props) {...}`.
  No usar `React.FC<Props>` (visto en `Header.tsx`, ya eliminado — no debería reaparecer).
- **Íconos:** usar `lucide-react`, no SVGs inline a mano, salvo que el ícono no exista en la librería.
- **Listas renderizadas con `.map()`:** si el resultado es conceptualmente una lista de ítems
  (fotos, tarjetas, filas), preferir `<ul>/<li>` sobre `<div>/<div>` cuando no haya una razón
  de layout que lo impida (ninguna hasta ahora — CSS Grid/Flexbox funcionan igual en `<ul>`).
- **`key` en listas:** preferir un identificador único de dato (id, url) sobre combinaciones
  con índice de array, salvo que el dato no tenga identificador único garantizado.
