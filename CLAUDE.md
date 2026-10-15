# CLAUDE.md

Reglas para Claude Code en este repositorio (React + TypeScript + Vite + Firebase). Objetivo: código fácil de mantener, carga rápida y el menor número posible de lecturas y escrituras en Firebase. Las reglas de la sección final "Específico de este proyecto" tienen prioridad sobre las generales.

## Forma de trabajar

- Cambios pequeños y verificables, un área a la vez. Un refactor no cambia lo que el usuario ve ni lo que la app hace.
- Pregunta antes de: instalar o quitar dependencias, cambiar Security Rules o índices, desplegar, mover carpetas en bloque o fusionar dos funcionalidades que ambas funcionan.
- Registra en `code-notes.md` las decisiones no obvias y lo que quede pendiente.

## Estructura

Organiza por dominio (feature), no por tipo de archivo:

```
src/
  app/                 App.tsx, router, providers globales
  features/<dominio>/  components/ (X.tsx + X.css), hooks/, services/, types.ts
  shared/              components/, hooks/, utils/ reutilizables entre dominios
  lib/firebase.ts      única inicialización de Firebase
  types/               tipos compartidos (única fuente)
```

En un proyecto existente no reorganices todo de golpe: aplica esta estructura al código nuevo y mueve archivos cuando ya los estés tocando.

## Componentes

- Solo componentes funcionales: `export default function Nombre(props: Props)`. Sin `React.FC` ni clases (excepción: un Error Boundary).
- Una responsabilidad por componente. Si pasa de ~150 líneas o mezcla varias tareas (datos + formulario + tabla), divídelo en subcomponentes, un custom hook o un util.
- Evita el prop drilling con composición (`children`, props que reciben elementos) antes de crear un Context; Context antes que una librería de estado global.
- Íconos desde la librería del proyecto (p. ej. `lucide-react`), no SVG a mano salvo que el ícono no exista.
- JSX semántico: listas de `.map()` en `<ul>/<li>`; pares etiqueta/valor en `<dl>/<dt>/<dd>`; acciones en `<button>`, nunca `<div onClick>`.
- `key` estable tomada del dato (`id`, `url`); el índice solo si la lista es estática y no tiene identificador.
- Los handlers que actúan sobre un ítem lo reciben como parámetro (`onClick={() => remove(item)}`), no leen un "ítem seleccionado" del estado que pudo cambiar antes de confirmar.

## Estado y efectos

- Estado lo más cerca posible de donde se usa; súbelo solo cuando dos componentes lo necesitan.
- Lo que se puede calcular desde props o estado se calcula en el render; no lo guardes en otro `useState` sincronizado con `useEffect`.
- `useEffect` solo para sincronizar con algo externo (listeners de Firestore, DOM, timers), siempre con cleanup. La lógica que responde a una acción del usuario va en el handler, no en un efecto.
- Lógica con estado o efectos que se repite → custom hook (`useAlgo`) dentro del dominio o en `shared/hooks`.
- Contexts pequeños por dominio; no pongas en un Context valores que cambian a cada tecla.
- Memoización: si el proyecto tiene React Compiler activo, no agregues `useMemo`/`useCallback`/`memo` manuales. Si no lo tiene, úsalos solo ante un problema medido (React DevTools Profiler) o para estabilizar dependencias de un efecto o props de un hijo memoizado.

## TypeScript

- `strict` activo. Nada de `any` en estado, props o parámetros; usa `unknown` y reduce el tipo.
- Tipa cada colección de Firestore una sola vez, en su service, con `withConverter<T>()` (o un cast en el punto de lectura si no hay converter). El resto del código recibe `T` sin casts.
- Una sola fuente de tipos compartidos (`src/types`). Si un archivo necesita campos extra, evalúa si pertenecen al tipo canónico; si son locales, usa un tipo extendido con nombre y un comentario que explique por qué.
- Todo `as any` que sobreviva lleva un comentario con la razón. Excepción aceptable: datos genuinamente dinámicos (p. ej. un formulario cuya estructura depende de configuración) como `Record<string, unknown>`, documentado donde ocurre.
- `import type` para imports que solo son tipos.

## Firebase — acceso a datos

### Inicialización
- Una sola inicialización en `src/lib/firebase.ts`, SDK modular (`firebase/firestore`, nunca `firebase/compat`), configuración desde `import.meta.env.VITE_FIREBASE_*`.
- Los componentes no llaman a Firestore directamente: usan los hooks o services de su dominio.

### Lecturas (cada documento devuelto se cobra)
- Filtra, ordena y limita en el servidor (`where`, `orderBy`, `limit`). Nunca descargues una colección entera para filtrarla o contarla en el cliente.
- Paginación con cursores (`startAfter`), no con `offset`: los documentos saltados también se cobran.
- Conteos y sumas con `getCountFromServer` / `getAggregateFromServer`.
- Sin lecturas N+1 dentro de loops: agrupa ids con `where(documentId(), 'in', ids)` en tandas de 30.
- Documentos pequeños: imágenes y archivos van a Storage (en Firestore se guarda la URL, nunca base64); los campos pesados que se leen poco van a una subcolección o a un documento aparte.
- Las Security Rules que usan `get()`/`exists()` suman lecturas en cada petición; tenlo en cuenta al diseñarlas.

### Tiempo real
- `onSnapshot` solo para datos que cambian mientras el usuario mira la pantalla. Catálogos y configuración que casi no cambian → lectura única + caché (ver "Caché").
- Cada `onSnapshot` devuelve su `unsubscribe` en el cleanup del efecto.
- Un solo listener por consulta compartida, en un provider o hook de nivel superior que entrega los datos a las vistas. Antes de crear un listener o un `getDocs`, revisa si esos datos ya llegan por props o context: un fetch propio de una colección que ya se escucha congela los datos en el momento de la carga y duplica lecturas.
- El listener usa la consulta más acotada posible (`where`, `limit`), no la colección completa.

### Escrituras
- `updateDoc` solo con los campos que cambian; no reescribas el documento completo con `setDoc`.
- `serverTimestamp()`, `increment()`, `arrayUnion()`/`arrayRemove()` en vez de leer-modificar-escribir.
- Varias escrituras relacionadas → `writeBatch`; las que dependen del valor actual (contadores, consecutivos) → `runTransaction`.
- No escribas en cada tecla: guarda al confirmar o con debounce.
- Toda escritura en `try/catch` con feedback visible para el usuario.

### Seguridad
- La configuración de Firebase del cliente no es secreta; la protección real son las Security Rules. No confíes en validaciones que solo existen en el cliente.
- Nunca subas al repo archivos `.env` con secretos ni llaves de cuentas de servicio.
- Todo texto libre interpolado en HTML crudo (`dangerouslySetInnerHTML`, `window.open()` + `document.write()`, cuerpos de email) pasa por `escapeHtml()`. No hace falta en el `src` de `<img>` con URLs de Storage o base64.

## Caché

Usa el nivel más simple que resuelva el problema. No apiles varias capas de caché sobre el mismo dato sin una razón: cada capa extra es otro lugar que hay que invalidar.

### 1. Caché persistente de Firestore (base)

```ts
// src/lib/firebase.ts
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
```

- Guarda en IndexedDB: los datos aparecen al instante al recargar y la app funciona offline. Un listener que se reconecta antes de 30 minutos solo cobra los cambios; después de 30 minutos (o sin persistencia) se cobra como una consulta nueva.
- `initializeFirestore` se llama una sola vez y antes de cualquier `getFirestore`.
- Este caché no se borra entre sesiones. Si la app maneja datos sensibles en equipos compartidos, al cerrar sesión ejecuta `terminate(db)`, luego `clearIndexedDbPersistence(db)`, y recarga.

### 2. Listeners compartidos (datos en vivo)
Ver "Tiempo real": un listener por consulta, compartido por todas las vistas.

### 3. Caché en memoria con TTL (lecturas únicas)
Para `getDocs`/`getDoc` de datos que cambian poco, evita repetir la lectura al navegar entre vistas. Se guarda la promesa para que dos componentes que piden lo mismo a la vez compartan una sola petición:

```ts
// src/shared/utils/memoryCache.ts
const store = new Map<string, { expires: number; value: Promise<unknown> }>();

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  const value = load().catch((err: unknown) => {
    store.delete(key); // los errores no se cachean
    throw err;
  });
  store.set(key, { expires: Date.now() + ttlMs, value });
  return value;
}

export function invalidate(prefix: string): void {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}
```

- El service que escribe en una colección invalida su prefijo (`invalidate('services:')`) después de la escritura.
- Si el proyecto ya usa TanStack Query, úsalo en su lugar (`staleTime`, `invalidateQueries`); no lo instales sin preguntar.

### 4. localStorage
- Solo datos pequeños, no sensibles y que cambian poco (preferencias de UI, configuración). Clave versionada (`app:v2:settings`) con fecha de expiración; lectura y escritura dentro de `try/catch`.
- Nunca datos personales de clientes ni tokens. Si la caché persistente de Firestore está activa, no copies datos de Firestore a localStorage.

### 5. Archivos estáticos y Storage
- Vite genera `assets/*` con hash en el nombre: caché inmutable de un año. `index.html` no debe tener caché larga, para que cada deploy llegue de inmediato. En Cloudflare Pages/Workers, `public/_headers`:
  ```
  /assets/*
    Cache-Control: public, max-age=31536000, immutable
  ```
  En Firebase Hosting, lo equivalente va en `headers` de `firebase.json`.
- Al subir a Storage, incluye `cacheControl: 'public, max-age=31536000'` en la metadata; si el archivo cambia, súbelo con un nombre nuevo en vez de sobrescribirlo.
- Redimensiona y comprime las imágenes en el cliente antes de subirlas. En `<img>`: `loading="lazy"`, `width` y `height`.

## Velocidad de carga

- Rutas, vistas y modales pesados con `React.lazy` + `Suspense`.
- Librerías pesadas (mapas, PDF, gráficas, Excel) con `import()` dinámico en el momento en que se usan, no en el arranque.
- Importa Firebase por submódulo; `firebase/storage`, `firebase/functions`, etc. solo en los módulos que los usan.
- Búsquedas y filtros que consultan datos, con debounce (~300 ms). Listas de cientos de filas: paginación o virtualización.
- Compara el tamaño de los chunks de `npm run build` antes y después de cualquier cambio que afecte la carga.

## Estilos (CSS)

Ningún CSS dentro del código React/TypeScript. Los estilos viven en un archivo hermano (`Componente.tsx` → `Componente.css`, importado una sola vez con `import './Componente.css'`) o en el CSS global (`App.css`/`index.css`).

- Prohibido: `style={{...}}` con valores fijos, objetos de estilo en JS (`const s = {...}`), `<style>` embebido en JSX y hover simulado con `onMouseEnter`/`onMouseLeave`.
- Estados finitos (activo, seleccionado, variantes) → clase con modificador: ``className={`chip${active ? ' active' : ''}`}`` y `.chip.active {...}` en el CSS.
- Botones deshabilitados: atributo `disabled` + `.btn:disabled {...}`, sin calcular opacidad ni cursor a mano.
- `:hover` en CSS. Si un elemento `.active` también debe cambiar al pasar el mouse, declara `:hover` después de `.active`.
- Valores que solo existen en runtime (un color que viene de Firestore, un ancho calculado, la posición de un menú flotante) → variable CSS (`import type { CSSProperties } from 'react'`):
  ```tsx
  <span className="status-dot" style={{ '--dot-color': status.color } as CSSProperties} />
  ```
  ```css
  .status-dot { background: var(--dot-color); }
  ```
- Antes de crear una clase, busca si ya existe una global. Si necesitas algo parecido pero distinto a propósito, crea un modificador o una clase con otro nombre y deja una nota de por qué.
- Si el proyecto usa de forma consistente CSS Modules o Tailwind, respeta esa convención; no lo migres sin preguntar.

## Código limpio

- Antes de escribir un helper, busca en `shared/utils` (o `src/utils`) si ya existe.
- Si unificas dos versiones de la misma lógica, compara su comportamiento punto por punto (mayúsculas, eventos, debounce) y quédate con lo más robusto de cada una; anótalo en `code-notes.md`.
- Elimina: imports, variables, funciones, exports y archivos sin uso; código comentado; `console.log` de depuración (los `console.error` dentro de un `catch` se quedan); dependencias que ya no se importan.
- Código que parece inalcanzable: confírmalo con `grep` (¿alguien abre ese modal, llama esa función, importa ese archivo?). Si nadie lo usa, elimínalo. Si se usa por un flujo no obvio, entiéndelo antes de tocarlo.
- Dos implementaciones de la misma funcionalidad que ambas funcionan son una decisión de producto: anótalo en `code-notes.md` y pregunta cuál se queda.
- `npx knip` ayuda a detectar archivos, exports y dependencias sin uso; confirma cada caso antes de borrar.

## Pruebas

- Vitest + React Testing Library (encajan con Vite). Si no están instalados, propónlo antes de instalarlos.
- Prueba la lógica pura (utils, hooks, services) y los componentes por lo que el usuario ve y hace, no por detalles internos.
- Services y Security Rules se prueban contra el Firebase Emulator Suite, nunca contra producción.

## Verificación al terminar cada archivo o lote

1. `grep -c "style={{" archivo.tsx` → solo quedan variables CSS justificadas.
2. `npx tsc --noEmit -p tsconfig.app.json` (o `npx tsc -b`, según el proyecto) → sin errores nuevos en todo el proyecto.
3. `npx eslint archivo.tsx` comparado con el estado anterior (`git stash` / `git stash pop`) → ningún problema nuevo.
4. `npm run build` termina bien; si el cambio afecta la carga, compara el tamaño de los chunks.
5. Si cambiaste lógica de runtime (listeners, caché, mapas, APIs externas), di explícitamente qué no pudiste probar en el navegador: tsc, eslint y build verifican que compila, no que funciona.

## Específico de este proyecto

Utilidades existentes, listeners globales, excepciones documentadas y decisiones propias de este repo. Tienen prioridad sobre las reglas generales. Historial completo de decisiones en `code-notes.md`.

### Estructura actual
- El proyecto todavía está organizado por tipo (`src/views`, `src/components`, `src/services`, `src/utils`, `src/hooks`). Firebase se inicializa en `src/config/firebase.ts` (equivale a `lib/firebase.ts`). Código nuevo de datos compartidos va en `src/shared/`; lo existente se mueve solo cuando se toca.
- **Tipos y services por colección (decisión del equipo, 10/2026; empezó con `user_tasks` y `task_projects`).** Cada colección tiene su archivo de tipos en `src/types/<colección>.ts` (`userTasks.ts`, `taskProjects.ts`) y su service en `src/services/<colección>Service.ts` con `create`, `update`, `delete`, `getAll` (getDocs) y `getOne` (getDoc); el service tipa su colección una vez con `typedConverter` (`src/lib/firebase/typedConverter.ts`). Las demás colecciones se pasan a este estilo cuando una tarea las toque. Archivos `.ts` en camelCase con minúscula (`userTasksService.ts`); `.tsx` con mayúscula (`TaskListView.tsx`). En Firebase las colecciones siguen en snake_case.
- Tipos compartidos: se importan **siempre** desde `src/types/index.ts`, que reexporta los archivos por colección. Un import de `'../types'` (sin `/index`) es un error: `src/types.ts` ya no existe. Los reportes de Quality Check también: `QualityCheckRecord` (documento completo), `QcRecordLite` (store compartido), `QcStatusRecord`, `QcFormData`, `QcPlaceData`.
- **Nombres de colecciones → `COLLECTIONS`** (`src/lib/firebase/collections.ts`). Nunca escribas `collection(db, 'nombre')` a mano; una colección nueva se agrega ahí (y a `security/firestore.rules`).
- Las vistas y `src/components` no importan `firebase/firestore`: leen con los hooks del store o de su feature y escriben con el service de su feature. Ya cumplen Houses y Quality Check; quedan Payroll, Manager, Settings, Roles, Users, Activity Log y Data Import.
- `src/features/quality-check/` tiene el panel de inspección de Quality Check (`QcCheckDrawer` y sus partes; datos en `qcForm.ts`: áreas internas `__general` y `__office` dentro de `qcData`, nunca muestres `__office` fuera del panel). QualityCheckView guarda, sube fotos y mueve la casa; sus escrituras van por `services/qualityChecks.ts` (el batch de "Save QC" sale de `saveBatch`) y las rutas por `services/qcRoutes.ts`. La pantalla del inspector NO usa la colección completa `qualityChecks`: `useQcForHouses(ids)` escucha solo los reportes de las casas en Quality Check o Recall (tandas de 30 con `in`). Esa pantalla no muestra casas con QC Finished (sus reportes están en Quality Check Reports).
- `src/features/ops/` tiene el **Task list de gerentes** (pestaña `task_list`): colecciones `user_tasks` (los comentarios van dentro, `comments[]` = `{ userId, userName, text, createdAt }` con arrayUnion; se cuentan con `comments.length`), `task_projects` (también con `comments[]`; `color` = nombre de `PROJECT_COLORS` o `null`; `teamId` → `settings_teams`; `doneAt` lo pone `updateProject`; sin lista de tareas: se piden con `where('projectId', '==', id)`), `user_priorities/{userId}` (antes `ops_*`); la duración es `durationMinutes` (minutos: se suma en `openMinutes` del proyecto); todo campo que guarda un usuario termina en `UserId` / `UserName` (`assigneeUserId`, `createdByUserId`, `approval.approverUserId`…); adjuntos solo en tareas, Storage `user_tasks/{id}/…`; tipos `UserTask` / `TaskProject` en `src/types/userTasks.ts` y `taskProjects.ts`; lecturas y escrituras en `src/services/userTasksService.ts` y `taskProjectsService.ts` (batch + `increment()` de los contadores del proyecto con `bumpProjectCounters`; nunca escribas una tarea sin ajustar su proyecto); el top 3 en `features/ops/services/prioritiesService.ts`; permisos en `opsPermissions.ts` (módulo "Task List", con respaldo a Manager/Owner; su **Scope** en Roles decide si se ven las tareas de todos (`All`) o solo las propias (`Own`): `taskListRights().seesAll`, y las reglas lo aplican con `o` en `user_access`). La lista tiene pestañas "Assigned to" (`useOpenTasks`) y "Assigned by" (`useCreatedTasks`: las que la persona creó para otros); quién asignó una tarea (`createdByUserId/UserName`) se muestra ("From X", "Assigned by") y nunca se edita; "Assignee" solo lo cambia quien la asignó, o alguien con Edit si la tarea no es suya (`canReassignTask`, también en las reglas). "Assign to" = `assignablePeople` (usuarios activos con Task List). Una tarea con `approval` no se marca hecha hasta que esté `approved`. **Owner y Manager muestran las tareas pendientes de `user_tasks`** con `useHomeTasks` (la colección `manager_tasks` ya no se usa): ahí solo se ven y se marcan hechas (con las acciones del Task list, nunca escrituras sueltas); crear, editar y borrar es solo en el Task list. Entre Owner y Manager se cambia con el menú lateral (sin selector en el encabezado).
- **Houses (`src/features/houses/`).** `views/HousesView.tsx` es solo el orquestador: casa abierta en vivo y sus servicios/pagos (`useHouseRecords`, un listener para detalle y formulario), catálogos (`useHouseCatalogs`), permisos (`useHouseAccess`), `useHouseSettings`, cola de fotos (`usePhotoQueue`), borradores, papelera y el modal de status. La página es `HouseList`; el detalle `HouseDetail` y el formulario `HouseForm` (abre con `{ kind: 'new' | 'edit' | 'duplicate' | 'draft' }`) tienen su propio estado y se montan de nuevo en cada apertura (`key`): nada de resetear campo por campo. Cada modal es su propio componente en `components/`. Escrituras: `services/billingServices.ts`, `houseStatus.ts`, `houseTrash.ts`, `gcalSync.ts`; reporte de fotos en `photoReport.ts`; servicio y pago nuevos en `serviceRecords.ts` / `payrollRecords.ts`; fotos de una pantalla en `useHousePhotos`.

### Datos y listeners globales
- `App.tsx` mantiene los listeners globales de `properties` y del perfil del usuario (`system_users` filtrado por email). **`properties` va con ventana de 12 meses** (`src/shared/data/propertiesWindow.ts`, corte el día 1 del mes): recientes, futuras, sin fecha válida y pendientes de cobro; con "Ver todo el historial" (`HistoryWindowNotice`) se carga todo en esa sesión. Una vista nueva que pueda mostrar casas de más de 12 meses lleva `<HistoryWindowNotice />` bajo su encabezado, y si lista registros ligados a una casa (QC, nómina…) usa `isHiddenByWindow()` para no mostrar los viejos como de "casa borrada". No cambies el listener a un `or()`: pide un índice compuesto (ver `code-notes.md`). Schedule Date se guarda AAAA-MM-DD (se muestra MM/DD/AAAA). Las vistas los reciben por props (`properties`, `roles`, `currentUser`/`effectiveUser`); no abras otro listener de esas colecciones.
- **Catálogos y colecciones compartidas → `src/shared/data/liveCollections.ts`** (`useLiveCollection(key)` / `useLiveData(key)`): un `onSnapshot` por colección para toda la app, que sigue abierto 15 min después de que la última vista lo deja. Claves: statuses, teams, priorities, services, products, taxes, places, tasks, roles, users, customers, qualityChecks, billingServices, payroll, taskProjects y los catálogos de Settings. No hagas `getDocs` ni `onSnapshot` propios de esas colecciones; para una nueva, agrégala a `SOURCES`. Excepción: los servicios y pagos de UNA casa abierta van con `useHouseRecords(houseId)` (listener filtrado por `propertyId`), no con el store completo. Después de escribir no parches una copia local ni `setProperties(...)`: el listener refleja la escritura al instante, y un parche con la lista del render pisa datos más nuevos.
- **Casa abierta en un modal o panel → `useLiveHouse(openedHouse, properties)`** (`features/houses/hooks/useLiveHouse.ts`): guarda la casa que se abrió y muestra su versión en vivo. Nunca trabajes sobre la copia tomada al abrir. Un formulario de edición guarda solo lo que cambió contra esa copia (`features/houses/houseDiff.ts`: `changedFields`, `listDiff`); los campos de arreglo (fotos, trabajadores, `notesHistory`) con `propertiesService.arrayChange` / `batchArrayChange` (arrayUnion/arrayRemove). Corregir un mensaje de las notas: `propertiesService.editNoteMessage` (transacción; nunca reescribas `notesHistory` completo fuera de ella).
- **Lecturas únicas que cambian poco → `cached()`** de `src/shared/utils/memoryCache.ts` (ya lo usan: historia de recall y colección `recalls` en `utils/jobRecall.ts`, `getCompanySettings`, `trashService.getAll`). Quien escribe esos datos llama a `invalidate(prefijo)`. Al cerrar sesión App.tsx llama a `resetLiveCollections()` y `clearMemoryCache()`.
- **Empresas Normal / Cavalry → `src/shared/utils/businesses.ts`.** Una casa es de Cavalry si su cliente tiene Type "Cavalry" (`cavalryClientKeys` + `houseBusiness`); un status es de las empresas marcadas en su `business` ("Normal", "Cavalry" o ambas; sin ninguna cuenta como Normal: `statusBusinesses`); la pestaña Cavalry ordena sus columnas con `cavalryOrder` (vacío = `order`, `statusOrderIn`). La empresa elegida es una sola para toda la app (`useBusiness`) y se cambia con `BusinessTabs`. Hoy separa el Pipeline (casas, columnas y KPIs).
- **Varias escrituras relacionadas → `src/shared/data/batchWrites.ts`** (`commitOps` para un grupo todo-o-nada, `commitInChunks` para listas largas en tandas de 500).
- **Cambiar el status de una casa → `changeHouseStatus`** (`features/houses/services/houseStatus.ts`): la casa (con el sello de Invoice) y su `status_history` en un batch, la bitácora después. Si la casa ya viaja en un batch propio (formularios, cierre de QC), `addStatusChange` / `addStatusHistory` agregan el historial a ESE batch. Nunca `propertiesService.update({ statusId })` suelto: las métricas de Recall salen de `status_history`.
- **Borrar una casa → `useHouseTrash` + `DeleteHouseDialog`** (`features/houses`; servicio `moveHouseToTrash`): la casa, sus pagos y servicios van a la papelera en un batch, con motivo obligatorio. No existe `propertiesService.delete`: un `deleteDoc` de una casa deja nómina huérfana.
- **Detalle o formulario de una casa encima de otra vista → el host de `App.tsx`**: un solo `HousesView renderMode="modals-only"` para las pestañas de `TABS_WITH_HOUSE_MODALS` (Calendar, Invoices, Payroll, Quality Check, QC Dashboard, Owner/Manager), montado la primera vez que una vista pide una casa. Las vistas reciben `onOpenHouseDetail(house, tab?)` (`'media'` abre en fotos/PDF) y `onOpenHouseEdit(house)`; no incrustes otro HousesView ni otro formulario de casa.
- Las Security Rules y los índices en uso se administran en la consola de Firebase. La **propuesta por rol** vive en `security/` (no conectada a `firebase.json`, ver `security/README.md`): permisos por usuario en `user_access/{email}`, que mantienen las funciones de `functions/src/userAccess.ts`. Una colección o un módulo nuevo se agrega a `security/firestore.rules` y a `security/tests/` (`npm run test:rules`, necesita el emulador).
- `activityLogService` es el ejemplo de referencia de paginación correcta (`orderBy` + `limit` + cursor).

### Utilidades que ya existen (búscalas antes de escribir otra)
- Catálogos: `utils/relations.ts` (`getRelationName`/`getRelationColor`, id o nombre, sin mayúsculas), `utils/customerDocs.ts` (`mapCustomerDoc`, `displayClientName` — nunca muestres el id crudo de un cliente borrado).
- Status: `utils/qcStatus.ts` (¿QC pendiente/pasado/fallido?), `utils/recallStatus.ts` (`isRecallText`), `utils/statusFilters.ts`, `utils/invoiceEntry.ts` (sello `sentToInvoiceAt` al pasar a Invoice), `features/houses/services/houseStatus.ts` (escribir cambios de status), `services/statusHistoryService.ts` (solo leer).
- Trabajos: `utils/jobFinancials.ts` (fórmulas de la hoja "Operations": Service Price, Taxes 8.25% Texas salvo `taxExempt`, Final Cost, Payroll, Profit, Margin), `utils/jobQuality.ts`, `utils/jobInsights.ts`, `utils/jobRecall.ts`, `utils/unifiedRows.ts`, `utils/qcDashboard.ts`, `utils/homeData.ts`, `utils/qcScore.ts` (`computeQCScore`, mismo % que el PDF).
- **Fechas (regla del negocio, no negociable): toda fecha visible va en MM/DD/AAAA y la hora en h:mm AM/PM.** Usa `utils/dateFormat.ts` (`formatDate`, `formatDateTime`, `formatTime`, `formatDateRange`, `formatDateForFile`, `todayIso`); nunca `toLocaleDateString`/`toLocaleString` para fechas ni una fecha AAAA-MM-DD cruda en pantalla. Para capturar fechas usa `shared/components/DateInput` (nunca `<input type="date">`: su formato depende del idioma del navegador). Se guarda AAAA-MM-DD; "hoy" se calcula con `todayIso()` (hora local; `toISOString()` da la fecha UTC, que en Texas cambia de día a las 6–7 p. m.). Fechas viejas guardadas con barras: `features/houses/components/PropertyDateFixTool` ("Revisar fechas", en Overview y Payroll).
- Barra de periodo y agrupación: `utils/periods.ts` (Day/Week/Month/Year/Custom), `utils/dateGrouping.ts`.
- Otros: `utils/escapeHtml.ts`, `utils/routing.ts` (geocodificación, Leaflet, OSRM), `utils/sendMail.ts`, `utils/qcReportPdf.ts` + `utils/shareQCReport.ts` (PDF y WhatsApp del QC), `utils/imageCompression.ts` + `utils/photoUploader.ts` + `utils/offlinePhotoQueue.ts` (fotos), `services/activityLogService.ts` (`logActivity` en cada cambio de datos).
- **Botón de menú: `shared/components/MenuButton`** (uno para toda la app), primer hijo de `.view-header-title-group` junto al título: izquierda en computadora, derecha en el teléfono. Nunca un botón de menú propio por vista ni con `position: fixed` (la fila de arriba a la derecha de la computadora es de `SessionActions`).
- **Hooks compartidos (`src/shared/hooks/`)**: `useMediaQuery` (+ `PHONE_QUERY`): dibuja SOLO la tabla o SOLO las tarjetas, nunca las dos con una escondida por CSS. `usePendingById`: guardado rápido de una fila (status, equipo, impuestos…) sin bloquear las demás ni esperar al servidor; marca la fila con `.is-pending` y avisa si falla. Ningún control de fila depende de un `isSaving` global. `useStableCallback`: handlers con identidad fija para hijos con `memo` (filas, tarjetas); solo se llaman en eventos.
- **Mientras llega un dato: esqueleto, no texto.** Clases de `components/RouteTransition.css`: `skel-line` + `skel-row-main` (fila), `skel-money` (dinero, ancho fijo), `skel-card`; `ViewSkeleton` para una vista completa. Pinta en cuanto llega lo que decide las filas (las casas y los statuses); el resto se completa después ("…" para nombres, nunca el id crudo).
- Componentes compartidos: `CustomSelect`, `PeriodBar`, `KpiGrid`, `UnifiedJobsTable`, `NoteThread`, `StatusChangeModal`, `ShareReportSheet`, `HomeHeader`, `TaskChecklist`, `QcInspectionPanel`.
- **Listas largas → `shared/components/VirtualItems`** (hook `shared/hooks/useVirtualRows`): dibuja solo lo que está cerca de la pantalla, desde 60 elementos. Recibe la lista plana (encabezados de grupo, filas y "Show more" juntos); cada elemento es UN nodo hijo (fila o tarjeta), en orden. Como `<tbody>` con `colSpan` o como `<div className>`. Ya la usan Overview, Invoices y Payroll. No sirve para grillas de varias columnas.

### Agregar una vista nueva
Tocar los 8 puntos: `TabOptions` y `VALID_TABS` y el mapa `TAB_MODULE` (guardia de permisos) en `App.tsx`; `TABS_WITH_PROPERTIES` en `App.tsx` si la vista recibe `properties` (espera su primer snapshot con el esqueleto), y `TABS_WITH_HOUSE_MODALS` si abre el detalle o el formulario de una casa; `lazy()` en `App.tsx`; `LOADERS` en `utils/viewPrefetch.ts`; ítem en `Sidebar.tsx` (con `canView` o `canViewOrLegacy` si el módulo es nuevo para roles ya guardados); módulo en `DEFAULT_MODULES` de `views/admin/RolesView.tsx`.

### CSS global: trampas conocidas
- `App.css` fija `* { font-family: system-ui }`: la letra de una vista se aplica a `.vista, .vista *`, no por herencia.
- `index.css` da a botones, inputs y selects un mínimo táctil de 48 px (`:where(...)`, especificidad 0): en tablas de escritorio pon `min-height: 0` en la clase.
- `.fade-in *` (App.css) pone una barra de scroll fina y casi transparente que en Chrome anula `::-webkit-scrollbar`. Para una barra visible: `.fade-in .x { scrollbar-width: auto; scrollbar-color: auto }` + estilos webkit.
- `App.css` fuerza `.houses-view { height: auto !important }` en ≤1024 px; las pantallas de altura fija lo sobreescriben con `!important` dentro de su media query.
- Clases globales reutilizables: `.hamburger-btn`, `.modal-70`, `.grid-3-cols`, `.btn-primary`; patrón de variante ya usado: `.tag.team`.
- **CSS sin uso:** una regla cuyas clases no aparecen en ningún `.ts/.tsx` se borra (la Fase 1 quitó ~1,900 líneas así, verificado con capturas antes/después). Antes de crear una clase nueva, búscala; al quitar un elemento, quita su CSS.
- `vite.config.ts` usa `cssCodeSplit: false` a propósito (un solo CSS: los modales nunca quedan sin estilo). No lo cambies sin preguntar.

### Excepciones documentadas
- `qcData` del formulario de Quality Check es dinámico según configuración: se usa el alias `QcFormData` (`types/index.ts`), el único `any` aceptado para esos datos.
- Leaflet llega por CDN y no hay `@types/leaflet`: todo el código del mapa usa el alias `Leaflet` de `utils/routing.ts` (único `any` para Leaflet).
- `<style>` dentro de strings HTML generados para imprimir o exportar (p. ej. `features/houses/photoReport.ts`) es válido: no es JSX.
- `onMouseLeave` en el canvas de anotación de fotos (QualityCheckView) es para dibujar, no hover.
- Los resúmenes "AI summary" del Overview, QC Dashboard y Owner/Manager son **reglas automáticas**, no un modelo de IA (decisión del usuario).

### Historial que explica reglas
- Hubo 3 XSS reales en generadores de PDF/branding/email → `escapeHtml()` siempre.
- Hubo un bug de pérdida de datos (se borraba la casa equivocada) → los handlers reciben el ítem como parámetro.

### Archivos y entorno
- En git todos los archivos de texto están en LF (`git ls-files --eol` → `i/lf`); en Windows la copia de trabajo puede tenerlos en CRLF. Guarda siempre en LF para no ensuciar el diff con el archivo completo.
- `npm run build` = `tsc -b && vite build` y **sube el número de versión en `app-version.json`** (se commitea junto con el cambio). La app avisa de versión nueva comparando `/version.json`. Cualquier herramienta que cargue `vite.config.ts` también lo sube (p. ej. `npx knip`): después de correrla, `git checkout app-version.json`.
- Hosting: Cloudflare Workers con assets estáticos (`wrangler.jsonc`) + PWA (`vite-plugin-pwa`). No se despliega desde Claude.
- El Service Worker sirve la página con NetworkFirst (`runtimeCaching` + `directoryIndex: null` en `vite.config.ts`) y respaldo al `index.html` del precache sin red. No vuelvas a `navigateFallback`: servía el index.html viejo y tras cada deploy había que recargar dos veces.
