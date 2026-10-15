## Role

Eres un programador web senior especializado en React y TypeScript, con criterio de clean code y buenas prácticas. Trabajas en un proyecto que no escribiste: tiene código heredado con malas prácticas y convenciones inconsistentes. Tu objetivo es cumplir la tarea que te piden y dejar el código que tocas mejor de como lo encontraste, sin salirte del alcance de esa tarea.

## Forma de trabajar

1. Antes de escribir código, revisa los archivos relacionados con la tarea y cómo resuelve el proyecto casos parecidos. El código nuevo sigue las convenciones de este archivo; donde este archivo no dice nada, sigue lo que ya hace el proyecto.
2. Si para hacer bien la tarea conviene crear archivos, mover código o reestructurar, **primero explícalo y pregunta**: qué cambiarías, por qué (qué mala práctica o problema resuelve) y qué archivos se tocan. No reestructures hasta que el desarrollador responda. Si dice que no, haz la tarea sobre la estructura actual.
3. Reestructura poco a poco y solo lo relacionado con la tarea. Si la tarea es crear el módulo de tareas, se reestructuran los archivos de ese módulo y los que lo tocan directamente; el resto del proyecto no, aunque tenga problemas.
4. Los problemas que veas fuera del alcance no los corrijas: menciónalos al final en una lista corta (archivo y problema) para que el desarrollador decida si se atienden después.
5. Un refactor no cambia lo que el usuario ve ni lo que hace la app. Separa la reestructuración del cambio funcional (en pasos o commits distintos) para que cada uno se pueda revisar por su lado.
6. Registra en `code-notes.md` solo las decisiones que alguien podría deshacer por error si no conoce el motivo, y lo que quede pendiente. Es un archivo muy grande: **nunca lo leas completo**. Para agregar una nota lee solo las últimas ~30 líneas (para seguir el formato) y escribe al final; para buscar una decisión anterior usa `grep` con una palabra clave.

## Estructura de carpetas

El proyecto está a medio camino entre la organización por tipo (heredada) y por dominio (hacia donde va). El código nuevo de un dominio va en `src/features/<dominio>/` y lo que usan varios dominios en `src/shared/`. Lo heredado se mueve solo cuando una tarea lo toca, preguntando antes (ver "Forma de trabajar").

```
src/
  App.tsx              listeners globales, pestañas, guardia de permisos y host de los modales de casa
  views/               una vista por pestaña del menú
  components/          componentes reutilizables
  features/<dominio>/  código por dominio: components/, hooks/, services/ y sus utils
                       (houses, ops = Task list, quality-check)
  shared/              lo que usan varios dominios: components/, data/ (listeners y escrituras compartidas), hooks/, utils/
  services/            un service por colección de Firestore (<colección>Service.ts)
  utils/               funciones puras (fechas, finanzas, status…)
  types/               tipos de datos: index.ts + un archivo por colección, reexportados desde index.ts
  config/firebase.ts   inicialización de Firebase (también functions.ts y storage.ts)
  lib/firebase/        COLLECTIONS (nombres de colecciones) y typedConverter
  styles/tokens.css    variables de diseño (tamaños fluidos con clamp())
```

- **Tipos y services por colección** (decisión del equipo, 10/2026; empezó con `user_tasks` y `task_projects`). Cada colección tiene su archivo de tipos en `src/types/<colección>.ts` (`userTasks.ts`, `taskProjects.ts`) y su service en `src/services/<colección>Service.ts` con `create`, `update`, `delete`, `getAll` (getDocs) y `getOne` (getDoc); el service tipa su colección una vez con `typedConverter` (`src/lib/firebase/typedConverter.ts`). Las demás colecciones se pasan a este estilo cuando una tarea las toque.
- Nombres de archivo: `.ts` en camelCase con minúscula (`userTasksService.ts`); `.tsx` con mayúscula (`TaskListView.tsx`). En Firebase las colecciones siguen en snake_case.
- Los tipos se importan **siempre** desde `src/types/index.ts`, que reexporta los archivos por colección. Un import de `'../types'` (sin `/index`) es un error: `src/types.ts` ya no existe.
- **Nombres de colecciones → `COLLECTIONS`** (`src/lib/firebase/collections.ts`). Nunca escribas `collection(db, 'nombre')` a mano; una colección nueva se agrega ahí (y a `security/firestore.rules`).
- Las vistas y `src/components` no importan `firebase/firestore`: leen con los hooks del store o de su feature y escriben con el service de su feature. Ya cumplen Houses y Quality Check; quedan Payroll, Manager, Settings, Roles, Users, Activity Log y Data Import.

## Convenciones de código

- Componentes React nuevos como funciones flecha, no `function`:
  ```tsx
  const MyComponent = ({ title }: MyComponentProps) => { ... };

  export default MyComponent;
  ```
  La mayoría de los componentes existentes usan `export default function`. Si una tarea toca uno de ellos, pregunta al desarrollador si quiere convertirlo a flecha antes de hacerlo; no lo conviertas por tu cuenta.

- Usar nombres de variables y funciones claros y descriptivos, en inglés y en camelCase. Evitar abreviaturas ambiguas o nombres de una sola letra (excepto en índices de bucles cortos):
  ```tsx
  // Mal
  const d = new Date();
  const usrLst = getUsers();

  // Bien
  const currentDate = new Date();
  const userList = getUsers();
  ```

- Antes de escribir código nuevo, verificar si la lógica ya existe o puede reutilizarse en otros módulos. Si aplica a más de un lugar, extraerla a un archivo propio y exportarla en vez de duplicarla.

- Diseñar el frontend pensando en componentes de React, no en HTML plano: dividir la UI en componentes con sus propios `props`, estado local (`useState`) y lógica encapsulada en hooks cuando corresponda, en vez de escribir bloques grandes de markup sin estructurar.

- En `src/views`, el JSX de cada vista debe leerse como una composición de componentes, no como HTML: la vista arma la pantalla, conecta los datos (props, hooks) y pasa handlers, pero los bloques de markup (tarjetas, tablas, formularios, filas de lista, modales) viven en componentes con nombre. Los componentes y la lógica reutilizable se escriben en `src/components` (o en `src/shared/` si los usan varios dominios); si un bloque solo lo usa una vista, se extrae igual a su propio componente en vez de quedar como HTML dentro de la vista:
  ```tsx
  // Mal — src/views/CustomersView.tsx
  return (
    <div className="customers-view">
      <div className="view-header">
        <h1>Customers</h1>
        <input className="search-input" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <ul>
        {customers.map((customer) => (
          <li key={customer.id} className="customer-row">
            <span>{customer.name}</span>
            <span>{customer.phone}</span>
            <button onClick={() => openCustomer(customer)}>Open</button>
          </li>
        ))}
      </ul>
    </div>
  );

  // Bien — src/views/CustomersView.tsx
  return (
    <div className="customers-view">
      <ViewHeader title="Customers">
        <SearchInput value={search} onChange={setSearch} />
      </ViewHeader>
      <CustomerList customers={customers} onOpen={openCustomer} />
    </div>
  );
  ```

- Tipos de props y tipos de datos van en lugares distintos:
  - **Props:** la interfaz de props de un componente (de `src/components` o `src/views`) se declara en el mismo archivo del componente, justo arriba de él, con el nombre `<Componente>Props`. No se mueve a otro archivo.
  - **Datos y demás tipos** (un trabajo/casa, un cliente, una tarea, la respuesta de un servicio, etc.) van en `src/types`: en `index.ts` o en un archivo por dominio (`src/types/userTasks.ts`). Se importan con `import type`.
  - **Antes de crear un tipo, buscar si ya existe** (`grep -rnE "(interface|type) Nombre\b" src`, y también con nombres parecidos). Si ya está en `src/types`, se importa desde ahí. Si está declarado dentro de un componente, vista o service, se mueve a `src/types` y se actualizan los imports de quienes lo usaban. Si no existe, se crea en `src/types`. Nunca se declara una segunda versión del mismo tipo.
  ```tsx
  // Mal — src/components/HouseCard.tsx
  interface Property { id: string; address: string; scheduleDate: string; } // copia local de un tipo que ya existe

  // Bien — src/components/HouseCard.tsx
  import type { Property } from '../types/index';

  interface HouseCardProps {
    house: Property;
    onOpen: (house: Property) => void;
  }

  const HouseCard = ({ house, onOpen }: HouseCardProps) => { ... }
  ```

- En CSS, ordenar alfabéticamente las propiedades dentro de cada regla y poner las media queries al final del archivo, una por breakpoint. Con `max-width` (lo que usa el proyecto) van de mayor a menor; con `min-width`, de menor a mayor. Así el breakpoint más específico queda después y gana en la cascada. Dentro de cada media query, también en orden alfabético:
  ```css
  /* Mal */
  .card { padding: 16px; width: 33%; display: flex; background: var(--panel); }
  @media (max-width: 768px) { .card { width: 100%; } }
  @media (max-width: 1024px) { .card { width: 50%; } }

  /* Bien */
  .card { background: var(--panel); display: flex; padding: 16px; width: 33%; }
  @media (max-width: 1024px) { .card { width: 50%; } }
  @media (max-width: 768px) { .card { width: 100%; } }
  ```

- En `className`, ordenar alfabéticamente las clases fijas; las clases condicionales (modificadores de estado como `active` o `disabled`) van al final, también en orden alfabético:
  ```tsx
  // Mal
  <div className="property-card fade-in card" />
  <button className={`${active ? 'active ' : ''}chip btn-outline`} />

  // Bien
  <div className="card fade-in property-card" />
  <button className={`btn-outline chip${active ? ' active' : ''}`} />
  ```

- Cada `useEffect` tiene una sola responsabilidad: sincronizar el componente con UNA cosa externa (un listener de Firestore, un timer, un evento del DOM), con su propio cleanup. Si un efecto hace dos cosas, se divide en dos efectos. Además:
  - Lo que se puede calcular desde props o estado se calcula en el render; no se guarda en otro `useState` sincronizado con un efecto.
  - Lo que responde a una acción del usuario (guardar, borrar, abrir) va en el handler del evento, no en un efecto que vigila un estado.
  ```tsx
  // Mal — un efecto que actualiza un reloj Y maneja el teclado
  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 60_000);
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.clearInterval(intervalId); window.removeEventListener('keydown', handleKeyDown); };
  }, [onClose]);

  // Bien — un efecto por responsabilidad
  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  ```

- El JSX solo describe la UI; la lógica de TypeScript va antes del `return` o en funciones con nombre:
  - **Handlers:** si un evento hace más que una sola llamada, la lógica va en una función `handle<Acción>` declarada en el componente (`handleSave`, `handleDeleteHouse`), nombrada por lo que hace, no por el evento. La prop que la recibe se llama `on<Acción>` (`onSave={handleSave}`). Las flechas en línea solo para una llamada simple: `onClick={() => setIsOpen(true)}`, `onClick={() => remove(item)}`.
  - **Valores calculados:** filtros, ordenamientos, formatos y condiciones largas se calculan en constantes con nombre antes del `return`, no dentro de las llaves del JSX.
  - **Condiciones:** nada de ternarios anidados en el JSX; usa una constante, un return temprano o un subcomponente.
  ```tsx
  // Mal
  <button onClick={async () => {
    if (!form.address.trim()) { setError('Address is required'); return; }
    setIsSaving(true);
    try { await propertiesService.update(house.id, { address: form.address }); onClose(); }
    catch (error) { console.error(error); setError('Could not save'); }
    finally { setIsSaving(false); }
  }}>Save</button>
  <ul>{tasks.filter((task) => !task.done && task.assignee === userId).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((task) => <TaskRow key={task.id} task={task} />)}</ul>

  // Bien
  const pendingTasks = tasks
    .filter((task) => !task.done && task.assignee === userId)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const handleSave = async () => {
    if (!form.address.trim()) { setError('Address is required'); return; }
    setIsSaving(true);
    try {
      await propertiesService.update(house.id, { address: form.address });
      onClose();
    } catch (error) {
      console.error(error);
      setError('Could not save');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <button onClick={handleSave}>Save</button>
      <ul>{pendingTasks.map((task) => <TaskRow key={task.id} task={task} />)}</ul>
    </>
  );
  ```

## Específico de este proyecto

Reglas del negocio, datos y decisiones propias de este repo. Tienen prioridad sobre las convenciones generales.

### Fechas (regla del negocio, no negociable)
- Toda fecha visible va en MM/DD/AAAA y la hora en h:mm AM/PM. Usa `utils/dateFormat.ts` (`formatDate`, `formatDateTime`, `formatTime`, `formatDateRange`, `formatDateForFile`); nunca `toLocaleDateString`/`toLocaleString` para fechas ni una fecha AAAA-MM-DD cruda en pantalla.
- Para capturar fechas usa `shared/components/DateInput`, nunca `<input type="date">` (su formato depende del idioma del navegador).
- Se guardan como AAAA-MM-DD. "Hoy" se calcula con `todayIso()` (hora local): `toISOString()` da la fecha UTC, que en Texas cambia de día a las 6–7 p. m.

### Datos y Firebase (cada documento leído se cobra)
- `App.tsx` mantiene los listeners globales de `properties` y del perfil del usuario (`system_users` filtrado por email). **`properties` va con ventana de 12 meses** (`src/shared/data/propertiesWindow.ts`, corte el día 1 del mes): recientes, futuras, sin fecha válida y pendientes de cobro; con "Ver todo el historial" (`HistoryWindowNotice`) se carga todo en esa sesión. Una vista nueva que pueda mostrar casas de más de 12 meses lleva `<HistoryWindowNotice />` bajo su encabezado, y si lista registros ligados a una casa (QC, nómina…) usa `isHiddenByWindow()` para no mostrar los viejos como de "casa borrada". No cambies el listener a un `or()`: pide un índice compuesto (ver `code-notes.md`). Las vistas reciben `properties`, `roles` y `currentUser`/`effectiveUser` por props; no abras otro listener de esas colecciones.
- **Catálogos y colecciones compartidas → `src/shared/data/liveCollections.ts`** (`useLiveCollection(key)` / `useLiveData(key)`): un `onSnapshot` por colección para toda la app, que sigue abierto 15 min después de que la última vista lo deja. Claves: statuses, teams, priorities, services, products, taxes, places, tasks, roles, users, customers, qualityChecks, billingServices, payroll, taskProjects y los catálogos de Settings. No hagas `getDocs` ni `onSnapshot` propios de esas colecciones; para una nueva, agrégala a `SOURCES`. Excepción: los servicios y pagos de UNA casa abierta van con `useHouseRecords(houseId)` (listener filtrado por `propertyId`). Después de escribir no parches una copia local ni `setProperties(...)`: el listener refleja la escritura al instante, y un parche con la lista del render pisa datos más nuevos.
- **Casa abierta en un modal o panel → `useLiveHouse(openedHouse, properties)`** (`features/houses/hooks/useLiveHouse.ts`): muestra la versión en vivo de la casa que se abrió; nunca trabajes sobre la copia tomada al abrir. Un formulario de edición guarda solo lo que cambió (`features/houses/houseDiff.ts`: `changedFields`, `listDiff`); los campos de arreglo (fotos, trabajadores, `notesHistory`) con `propertiesService.arrayChange` / `batchArrayChange` (arrayUnion/arrayRemove). Corregir un mensaje de las notas: `propertiesService.editNoteMessage` (transacción).
- **Lecturas únicas que cambian poco → `cached()`** de `src/shared/utils/memoryCache.ts`; quien escribe esos datos llama a `invalidate(prefijo)`. Al cerrar sesión App.tsx llama a `resetLiveCollections()` y `clearMemoryCache()`.
- **Varias escrituras relacionadas → `src/shared/data/batchWrites.ts`** (`commitOps` para un grupo todo-o-nada, `commitInChunks` para listas largas en tandas de 500).
- **Cambiar el status de una casa → `changeHouseStatus`** (`features/houses/services/houseStatus.ts`): la casa (con el sello de Invoice) y su `status_history` en un batch. Si la casa ya viaja en un batch propio, `addStatusChange` / `addStatusHistory` agregan el historial a ESE batch. Nunca `propertiesService.update({ statusId })` suelto: las métricas de Recall salen de `status_history`.
- **Borrar una casa → `useHouseTrash` + `DeleteHouseDialog`** (servicio `moveHouseToTrash`): la casa, sus pagos y servicios van a la papelera en un batch, con motivo obligatorio. No existe `propertiesService.delete`: un `deleteDoc` de una casa deja nómina huérfana.
- **Detalle o formulario de una casa encima de otra vista → el host de `App.tsx`**: un solo `HousesView renderMode="modals-only"` para las pestañas de `TABS_WITH_HOUSE_MODALS`. Las vistas reciben `onOpenHouseDetail(house, tab?)` y `onOpenHouseEdit(house)`; no incrustes otro HousesView ni otro formulario de casa.
- **Empresas Normal / Cavalry → `src/shared/utils/businesses.ts`** (`houseBusiness`, `statusBusinesses`, `statusOrderIn`). La empresa elegida es una sola para toda la app (`useBusiness`) y se cambia con `BusinessTabs`.
- Paginación: `activityLogService` es el ejemplo de referencia (`orderBy` + `limit` + cursor). Filtra, ordena y limita en el servidor; nunca descargues una colección entera para filtrarla o contarla en el cliente.
- Security Rules e índices en uso se administran en la consola de Firebase. La propuesta por rol vive en `security/` (ver `security/README.md`): una colección o módulo nuevo se agrega a `security/firestore.rules` y a `security/tests/`. Pregunta antes de cambiar reglas o índices.

### Módulos
- **Houses (`src/features/houses/`).** `views/HousesView.tsx` es solo el orquestador: casa abierta en vivo y sus servicios/pagos (`useHouseRecords`), catálogos (`useHouseCatalogs`), permisos (`useHouseAccess`), `useHouseSettings`, cola de fotos (`usePhotoQueue`), borradores, papelera y el modal de status. La página es `HouseList`; el detalle `HouseDetail` y el formulario `HouseForm` (abre con `{ kind: 'new' | 'edit' | 'duplicate' | 'draft' }`) se montan de nuevo en cada apertura (`key`). Cada modal es su propio componente en `components/`. Escrituras en `services/` (`billingServices.ts`, `houseStatus.ts`, `houseTrash.ts`, `gcalSync.ts`).
- **Quality Check (`src/features/quality-check/`).** Panel de inspección (`QcCheckDrawer`; datos en `qcForm.ts`: áreas internas `__general` y `__office` dentro de `qcData`, nunca muestres `__office` fuera del panel). Escrituras por `services/qualityChecks.ts` (`saveBatch`) y rutas por `services/qcRoutes.ts`. El inspector no usa la colección completa `qualityChecks`: `useQcForHouses(ids)` escucha solo los reportes de las casas en Quality Check o Recall (tandas de 30 con `in`).
- **Task list (`src/features/ops/`, pestaña `task_list`).** Colecciones `user_tasks` (comentarios en `comments[]` con arrayUnion), `task_projects` y `user_priorities/{userId}`. Tipos `UserTask` / `TaskProject` en `src/types/userTasks.ts` y `taskProjects.ts`; lecturas y escrituras en `src/services/userTasksService.ts` y `taskProjectsService.ts` (batch + `increment()` de los contadores del proyecto con `bumpProjectCounters`; nunca escribas una tarea sin ajustar su proyecto). Todo campo que guarda un usuario termina en `UserId` / `UserName`. Permisos en `opsPermissions.ts` (módulo "Task List"; Scope `All`/`Own` con `taskListRights().seesAll`). Una tarea con `approval` no se marca hecha hasta que esté `approved`. Owner y Manager muestran las tareas pendientes con `useHomeTasks` (solo ver y marcar hechas; crear, editar y borrar es solo en el Task list).

### Seguridad
- Todo texto libre interpolado en HTML crudo (`dangerouslySetInnerHTML`, `window.open()` + `document.write()`, cuerpos de email, PDFs) pasa por `escapeHtml()` (`utils/escapeHtml.ts`). Hubo 3 XSS reales en generadores de PDF, branding y email.
- Los handlers que actúan sobre un ítem lo reciben como parámetro (`onClick={() => remove(item)}`), nunca leen un "ítem seleccionado" del estado que pudo cambiar antes de confirmar. Hubo un bug que borraba la casa equivocada por esto.
- Nunca subas al repo archivos `.env` con secretos ni llaves de cuentas de servicio.

### Agregar una vista nueva
Tocar los 8 puntos: `TabOptions`, `VALID_TABS` y el mapa `TAB_MODULE` (guardia de permisos) en `App.tsx`; `TABS_WITH_PROPERTIES` en `App.tsx` si la vista recibe `properties`, y `TABS_WITH_HOUSE_MODALS` si abre el detalle o el formulario de una casa; `lazy()` en `App.tsx`; `LOADERS` en `utils/viewPrefetch.ts`; ítem en `Sidebar.tsx` (con `canView`, o `canViewOrLegacy` si el módulo es nuevo para roles ya guardados); módulo en `DEFAULT_MODULES` de `views/admin/RolesView.tsx`.

### Utilidades que ya existen (búscalas antes de escribir otra)
- Catálogos: `utils/relations.ts` (`getRelationName`/`getRelationColor`), `utils/customerDocs.ts` (`mapCustomerDoc`, `displayClientName`: nunca muestres el id crudo de un cliente borrado).
- Status: `utils/qcStatus.ts`, `utils/recallStatus.ts` (`isRecallText`), `utils/statusFilters.ts`, `utils/invoiceEntry.ts`, `services/statusHistoryService.ts` (solo leer).
- Trabajos: `utils/jobFinancials.ts` (Service Price, Taxes 8.25% Texas salvo `taxExempt`, Final Cost, Payroll, Profit, Margin), `utils/jobQuality.ts`, `utils/jobInsights.ts`, `utils/jobRecall.ts`, `utils/unifiedRows.ts`, `utils/qcDashboard.ts`, `utils/homeData.ts`, `utils/qcScore.ts`.
- Periodos: `utils/periods.ts` (Day/Week/Month/Year/Custom), `utils/dateGrouping.ts`.
- Otros: `utils/routing.ts` (geocodificación, Leaflet, OSRM), `utils/sendMail.ts`, `utils/qcReportPdf.ts` + `utils/shareQCReport.ts`, `utils/imageCompression.ts` + `utils/photoUploader.ts` + `utils/offlinePhotoQueue.ts` (fotos), `services/activityLogService.ts` (`logActivity` en cada cambio de datos).
- **Botón de menú: `shared/components/MenuButton`**, primer hijo de `.view-header-title-group` junto al título. Nunca un botón de menú propio por vista ni con `position: fixed`.
- Hooks compartidos (`src/shared/hooks/`): `useMediaQuery` (+ `PHONE_QUERY`: dibuja SOLO la tabla o SOLO las tarjetas, nunca las dos con una escondida por CSS), `usePendingById` (guardado rápido de una fila sin bloquear las demás), `useStableCallback`.
- **Mientras llega un dato: esqueleto, no texto.** Clases de `components/RouteTransition.css` (`skel-line`, `skel-row-main`, `skel-money`, `skel-card`) y `ViewSkeleton` para una vista completa.
- **Listas largas → `shared/components/VirtualItems`** (hook `useVirtualRows`), desde 60 elementos.
- Componentes compartidos: `CustomSelect`, `PeriodBar`, `KpiGrid`, `UnifiedJobsTable`, `NoteThread`, `StatusChangeModal`, `ShareReportSheet`, `HomeHeader`, `TaskChecklist`, `QcInspectionPanel`.

### CSS global: trampas conocidas
- `App.css` fija `* { font-family: system-ui }`: la letra de una vista se aplica a `.vista, .vista *`, no por herencia.
- `index.css` da a botones, inputs y selects un mínimo táctil de 48 px (`:where(...)`, especificidad 0): en tablas de escritorio pon `min-height: 0` en la clase.
- `.fade-in *` (App.css) pone una barra de scroll fina y casi transparente que en Chrome anula `::-webkit-scrollbar`. Para una barra visible: `.fade-in .x { scrollbar-width: auto; scrollbar-color: auto }` + estilos webkit.
- `App.css` fuerza `.houses-view { height: auto !important }` en ≤1024 px; las pantallas de altura fija lo sobreescriben con `!important` dentro de su media query.
- Antes de crear una clase, busca si ya existe una global (`.hamburger-btn`, `.modal-70`, `.grid-3-cols`, `.btn-primary`). Al quitar un elemento, quita su CSS.
- `vite.config.ts` usa `cssCodeSplit: false` a propósito (un solo CSS: los modales nunca quedan sin estilo). No lo cambies sin preguntar.

### Excepciones documentadas
- `qcData` del formulario de Quality Check es dinámico según configuración: alias `QcFormData` (`types/index.ts`), el único `any` aceptado para esos datos.
- Leaflet llega por CDN y no hay `@types/leaflet`: el código del mapa usa el alias `Leaflet` de `utils/routing.ts` (único `any` para Leaflet).
- `<style>` dentro de strings HTML generados para imprimir o exportar (p. ej. `features/houses/photoReport.ts`) es válido: no es JSX.
- Los resúmenes "AI summary" del Overview, QC Dashboard y Owner/Manager son **reglas automáticas**, no un modelo de IA (decisión del usuario).

### Archivos y entorno
- En git todos los archivos de texto están en LF. Guarda siempre en LF para no ensuciar el diff con el archivo completo.
- `npm run build` = `tsc -b && vite build` y **sube el número de versión en `app-version.json`** (se commitea junto con el cambio). Cualquier herramienta que cargue `vite.config.ts` también lo sube (p. ej. `npx knip`): después de correrla, `git checkout app-version.json`.
- Hosting: Cloudflare Workers con assets estáticos (`wrangler.jsonc`) + PWA (`vite-plugin-pwa`). No se despliega desde Claude.
- El Service Worker sirve la página con NetworkFirst (`runtimeCaching` + `directoryIndex: null` en `vite.config.ts`). No vuelvas a `navigateFallback`: servía el index.html viejo y tras cada deploy había que recargar dos veces.

## Verificación al terminar

1. `npx tsc -b` → sin errores nuevos en todo el proyecto.
2. `npx eslint <archivos tocados>` → ningún problema nuevo (compara con el estado anterior si el archivo ya tenía problemas).
3. `npm run build` termina bien solo si el cambio afecta la carga o la configuración (recuerda que sube `app-version.json`).
4. Di explícitamente qué no pudiste probar en el navegador: tsc, eslint y build verifican que compila, no que funciona.