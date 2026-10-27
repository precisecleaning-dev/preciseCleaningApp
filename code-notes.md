# Code Review Notes — Precise Cleaning App

Notas persistentes para la revisión progresiva de calidad de código React: buenas prácticas,
funcionalidad, lógica/algoritmia, decisiones de "un componente por archivo vs. varios en el
mismo archivo", y semántica del JSX (componentes/tags nativos de HTML en vez de `<div>` genéricos
donde haya una opción más significativa).

Ver `css-notes.md` para el historial de la limpieza de estilos inline (tarea previa, ya cerrada).

## Empresas Normal y Cavalry, Fase 1 (2026-10-15, rama `empresa-cavalry`)

- Customers: tipo "Cavalry" en el formulario y en el alta rápida desde la casa (badge ámbar).
  Una casa es de Cavalry si su cliente tiene ese tipo (`shared/utils/businesses.ts`:
  `cavalryClientKeys` resuelve el `client` por id, id legacy o nombre, con la misma regla que el
  nombre del cliente).
- Settings → Status: "Business" pasa de texto libre a casillas Normal / Cavalry (al menos una; la
  última marcada no se puede quitar). Se guarda en el mismo campo `business` ("Normal", "Cavalry" o
  "Normal, Cavalry"). Los códigos viejos de AppSheet (746d872a…) que nada usaba cuentan como Normal y
  se reemplazan al guardar ese status. Teams, Priorities y Services siguen con texto libre.
- Pipeline: pestañas Normal / Cavalry (`shared/components/BusinessTabs`, empresa elegida en
  `shared/hooks/useBusiness`, una sola para toda la app y guardada en `pc.business`). Cada pestaña
  muestra solo las casas de esa empresa, con los status de esa empresa como columnas y KPIs; el
  número de la pestaña son las casas que salen en su tablero. Hasta que llegan los clientes el
  tablero espera ("Loading metrics..."), para no pintar casas de Cavalry en Normal. Cambiar de
  empresa quita el filtro de la tarjeta KPI. Una empresa sin status muestra un aviso.
- Form Order propio de Cavalry (`cavalryOrder` en el status, campo "Form Order (Cavalry)" que sale
  al marcar Cavalry): ordena solo las columnas y KPIs de la pestaña Cavalry (`statusOrderIn`). Vacío =
  usa el Form Order de siempre. El Form Order normal sigue ordenando la pestaña Normal y los
  desplegables de status.
- Ojo: una casa cuyo status no es de su empresa no sale en ningún tablero (p. ej. una casa de
  Cavalry en Recall mientras Recall solo sea Normal). El cambio de status desde el tablero ofrece
  solo los status de esa empresa.
- Pendiente (Fase 2): separar también Overview, Invoices, Calendar, Payroll, Quality Check, QC
  Reports, QC Dashboard y Owner/Manager.

## Rendimiento: reporte final y guía (2026-10-15, rama `rendimiento`)

- `docs/guia-del-codigo.md`: cómo funciona la app, datos, pantallas críticas, resultados antes/después
  (contra `acae38d`) y guion para presentarla. Las referencias `archivo:línea` son de esta versión.
- Medición final de la caché de Firestore con documentos "bajados del servidor" (cargados con
  `loadBundle`, no como escrituras pendientes): 3,600 casas salen de la caché en ~1.4 s en escritorio
  y ~4.0 s en el teléfono (CPU ×4), contando desde que se abre la página. Es el piso que impide llegar
  a 1 s en las pantallas con casas; ver "Dónde no se llegó a 1 segundo" en la guía.

## Rendimiento, Paso 5: limpieza (2026-10-15, rama `rendimiento`)

- knip: dejan de exportarse funciones y tipos que solo se usan en su archivo; se borran el tipo
  `CollectionName`, los reexports de `QcFormData`/`QcPlaceData`, el parámetro sin uso de
  `windowStartIso` y `vite-env.d.ts` de la raíz (ningún tsconfig lo incluía). Métodos sin uso:
  `settingsService.getAll`, `qualityChecks.remove`.
- Lo que knip sigue marcando y se queda a propósito: `functions/` (otro paquete),
  `security/tests` y `@firebase/rules-unit-testing` (los usa `npm run test:rules`), el binario
  `firebase` (CLI global) y `taskProjectsCol`/`taskProjectRef` (convención de services por
  colección; `userTasksService` exporta los suyos igual). `getAll`/`getOne` de los services de
  tareas tampoco se usan todavía, pero son parte de esa convención.
- Duplicados (jscpd, 0.6 % del código): unificados los campos de dinero de PayrollModal, el email
  del login, los botones por rol de FieldConfigModal, el input del PDF en QC Reports, la celda de
  acciones de Settings y el "último QC por casa" (jobQuality usa `latestByHouse`). Capturas antes y
  después idénticas (login, olvido de contraseña, Settings, pago, QC Reports) y la batería de
  modales de la casa sin diferencias.
- Sin cambiar: hay 5 `getClientName` locales con textos distintos para un cliente que no se
  encuentra ("Unknown", "-", "Unknown Client", "Cliente sin registrar"…). Unificarlos cambia lo que
  se ve: decisión de producto, pendiente. Estado sincronizado con `useEffect`: no quedó ningún caso.
  CSS sin uso: el detector no encontró reglas (la Fase 1 ya quitó ~1,900 líneas).

## Rendimiento, Paso 4: render e interacción (2026-10-15, rama `rendimiento`)

Medido con el arnés de vistas en producción (3,600 casas) y la Event Timing API (≈ INP): la
interacción más lenta y las tareas largas por clic. Teléfono = CPU ×4.
- **Listas por ventana** (`shared/hooks/useVirtualRows` + `shared/components/VirtualItems`, sin
  dependencias): solo están en el DOM los elementos cerca de la pantalla; el resto es un relleno
  (`u-vr-spacer`, tokens.css) con el alto medido. Desde 60 elementos. Cada elemento es UN hijo
  directo (fila o tarjeta) y se mide por la distancia al siguiente (incluye el gap). La lista vive
  en su propio componente para que el scroll no vuelva a dibujar toda la vista. El ancla es un ref
  de callback: el lint `react-hooks/refs` no deja leer un ref devuelto por un hook en el render.
- Aplicado a Payroll (tabla), Overview (tabla y tarjetas) e Invoices (tabla y tarjetas). Encabezados
  de grupo, filas y "Show more" van en una sola lista plana. Verificado recorriendo cada lista con
  scroll: mismos elementos, en el mismo orden, mismo alto total; plegar, "Show more", editar Team en
  línea y abrir detalle igual que antes.
- Payroll: conteos, totales y `filteredRecords` memoizados (`classifyRecord` fuera del componente).
- `money()` con un solo `Intl.NumberFormat` (`toLocaleString` creaba uno por llamada) y el orden por
  fecha del Overview con la clave calculada una vez por casa (antes se convertía la fecha en cada
  comparación del sort). Eran lo que más pesaba al pasar a Year según el perfil de CPU.
- Resultado en el teléfono: Payroll Paid 8.0 s → 0.14 s, Pending 2.4 → 0.10 s; Overview Year
  3.5 s → 0.3 s, Month 1.1 → 0.15 s, Week 0.74 → 0.13 s; Invoices Year 3.9 → 0.22 s, chip All
  2.3 → 0.26 s, búsqueda 1.7 → 0.08 s. Scroll de 16,000 px en Paid: 7.0 s de tareas largas → 0.56 s.
- Límites conocidos: "buscar en la página" del navegador solo encuentra lo que está dibujado; las
  columnas de una tabla se calculan con las filas dibujadas (con nombres muy largos pueden moverse
  unos px al hacer scroll; con los datos de prueba, ±1 px).
- Sin cambiar: grilla de casas de Quality Check (varias columnas, no encaja con la ventana por
  filas; "All" tarda ~0.5 s en el teléfono) y el mes del Calendar (~0.55 s). Esqueletos que solo
  aparecen pasados 300 ms: no mejora ninguna métrica medible, no se hizo. Guardados sin esperar al
  servidor (`isSaving` global en el detalle de la casa): pendiente de aprobación.

## Rendimiento, Paso 3: datos en Firestore (2026-10-15, rama `rendimiento`)

Medido con el SDK real de Firestore y caché persistente, sin red (banco en el scratchpad: 3,600
casas, 5,400 servicios, 5,400 pagos, 2,000 QC; CPU ×4). Ojo: los documentos se sembraron como
escrituras pendientes, no bajados del servidor; sirve para comparar, no como cifra absoluta.
- Leer las ~3,600 casas de la ventana desde la caché tarda **~3.4 s** en un teléfono, y Firestore
  atiende las consultas en fila: lo que se pide después espera.
- **Casas solo cuando una pestaña las usa** (App.tsx, `propertiesWanted`): el listener se abre
  con la primera pestaña de `TABS_WITH_PROPERTIES` y ya no se cierra. Entrar por Task list: las
  tareas salen de la caché en 1.2 s en vez de 3.9 s, y al iniciar sesión se leen ~25 documentos
  en vez de ~4,700 (arnés).
- `security/firestore.indexes.json`: índices compuestos que pide el código (solo la bitácora).
- **Probado y descartado: `in` por tandas de 30 para servicios, pagos y QC del periodo.** En el
  servidor se leen muchos menos documentos, pero cada consulta nueva (otra semana, otro filtro)
  hace que Firestore recorra en la caché la colección COMPLETA, una vez por tanda: 12 s contra
  8.7 s con las tres colecciones completas. Mismo motivo para no acotar el QC de Owner/Manager:
  el grupo de casas cambia en el día y cada cambio vuelve a recorrer los 2,000 reportes.
- **Propuesta pendiente (cambia el modelo de datos): totales en la casa.** `billingTotal`,
  `payrollTotal` y `qcLast` (id, status, result, passRate, date, áreas fallidas) dentro de
  `properties`, mantenidos por Cloud Functions al escribir en `billing_services`, `payroll` y
  `quality_checks`, con una función de relleno para las casas existentes. Overview, Invoices y
  Owner/Manager dejarían de escuchar esas tres colecciones completas (~12,800 documentos por
  sesión nueva).
- Sin cambiar: recalls con `getDocs` y caché de 5 min (marca secundaria del Overview); el `getDoc`
  por registro al restaurar la papelera (no es pantalla crítica); Payroll sigue con la colección
  completa (su `date` tiene formatos mixtos, ver la nota en PayrollView).

## Rendimiento, Paso 2: arranque y red (2026-10-15, rama `rendimiento`)

- **Esqueleto desde `index.html`**: si localStorage tiene `firebase:authUser:*` (sesión guardada;
  App.tsx la deja ahí con `setPersistence(browserLocal)`), un script en línea marca
  `html.has-session` y pinta el menú + `ViewSkeleton` antes de que baje el JS. App.tsx muestra el
  mismo esqueleto mientras Firebase confirma la sesión (`hasStoredSession`). **El marcado de
  `index.html` debe ser igual al de `appSkeleton` y `ViewSkeleton`**: si se cambia uno, se cambia
  el otro (capturas comparadas píxel a píxel: idénticas en escritorio y teléfono). Sin sesión,
  todo igual que antes ("Verificando sesión..." y el login).
- **Brillo del esqueleto con `transform`** en un `::after` (RouteTransition.css): con
  `background-position` repintaba el hilo principal en cada fotograma mientras arrancaba la app.
- **Google Fonts con `media="print"` + `onload`**: ya no frena el primer pintado (el login y el
  menú usan system-ui).
- Medido con un arnés que corre `App.tsx` real (Auth y Firestore simulados, sesión guardada,
  600 ms de Auth): menú y esqueleto visibles en 1.35 s en vez de 2.7 s en el teléfono, y 0.13 s
  en vez de 0.88 s en escritorio. Los datos llegan igual (±30 ms, ruido).
- **No se cambió (medido o revisado):**
  - Cadena de arranque: el SDK de Auth valida la sesión guardada contra el servidor
    (`accounts:lookup`) antes de `onAuthStateChanged`, y Firestore no lee ni su caché hasta que
    Auth termina. Perfil, roles y casas ya arrancan en paralelo. Leer el rol de custom claims no
    quita ningún paso (igual hace falta el documento del rol con sus permisos).
  - Orden de persistencia de Auth (`[browserLocal, indexedDB]` y quitar el `setPersistence` de
    App): hoy la sesión pasa de localStorage a IndexedDB y vuelve en cada arranque, pero medido
    no cambia nada (±30 ms). Se dejó como está.
  - Preconnects y `public/_headers` (assets inmutables, `index.html`/`sw.js` con no-cache) ya
    estaban.
- **Propuestas pendientes de aprobación** (cambian datos o el uso sin conexión): miniaturas de
  fotos de Storage; sacar html2pdf y xlsx del precache del Service Worker.

## Rendimiento, Paso 1: bundle (2026-10-15, rama `rendimiento`)

Prompt "Optimización de velocidad". Medido contra `acae38d` (Lighthouse en el login, mediana de 5).
- **Login sin gapi**: `usersService` creaba una app secundaria con `getAuth()` al importarse, y el
  login lo importa. `getAuth` trae el resolver de popups y baja `apis.google.com/js/api.js`. Se
  borró `inviteUser` (nadie lo usaba; invitar vive en `userAuthService`) y `userAuthService` usa
  `initializeAuth` en memoria. No usamos login con popup ni redirect.
- **Chunks `react` y `firebase`** (`manualChunks` en vite.config.ts): el JS de arranque pesa lo
  mismo (206 KB gz), pero un deploy normal solo cambia `index` (21 KB gz). Storage y functions
  NO van en `firebase`, si no se cargarían al arrancar.
- **firebase/functions bajo demanda** (`src/config/functions.ts`, `callable(nombre)`): HousesView
  baja de 52.8 a 49.7 KB gz.
- Ya estaba bien y no se tocó: vistas con `lazy()` + `ViewSkeleton`, precarga en hover/toque y en
  reposo (`viewPrefetch.ts`), Storage diferido, html2pdf/xlsx/papaparse con `import()`, íconos
  importados uno a uno, Firestore con `initializeFirestore` + caché persistente.
- knip: ninguna dependencia de producción sin uso. Lo que marca (exports sin uso,
  `vite-env.d.ts` de la raíz) no pesa en el bundle; queda para el Paso 5.

## Tipos y services por colección: user_tasks y task_projects (2026-10-15, rama `features-cr`)

Tarea de Antonio ("cambio de estructura", la primera de varias). Decisiones de Omar: rama desde
`main` de GitHub con todo lo de los zips encima, y "mover y reusar" (sin duplicar).
- **Rama `features-cr`**: sale de `origin/main` (a7de797, igual a nuestra V00036) con los 31
  commits locales encima (Task List, Fases 0–2, renombres, Scope, pestañas…) y la tarea al final.
  En GitHub la rama principal se llama `main`, no `master`.
- **Tipos**: `src/types/userTasks.ts` (`UserTask`, `UserTaskStatus`, `UserTaskApproval`,
  `UserTaskApprovalStatus`, `TaskAttachment`, `TaskComment`, `Repeat`, `RepeatFreq`) y
  `src/types/taskProjects.ts` (`TaskProject`, `TaskProjectStatus`). Antes `OpsTask`,
  `OpsProject`, `OpsApproval`… en `index.ts`; se renombraron en todo el código. `index.ts` los
  reexporta (se sigue importando desde `'../types/index'`). `OpsPriorities` (user_priorities) se
  queda en `index.ts`: no era parte de la tarea.
- **Services** en `src/services` (estilo objeto, como `propertiesService`):
  - `taskProjectsService`: `create`, `update` (maneja `doneAt`), `delete` (solo sin tareas),
    `getAll`, `getOne`; y `bumpProjectCounters` para que las tareas muevan los contadores en su
    batch.
  - `userTasksService`: `create`, `update`, `delete` (con contadores del proyecto y archivos de
    Storage), `getAll(filtros)`, `getOne`, y lo que ya usaba la pantalla: `complete`, `reopen`,
    `requestApproval`, `decideApproval`, `setApproval`, `addComment`, `addAttachment`,
    `removeAttachment`. `getAll` acepta filtros de igualdad (`status`, `assigneeUserId`,
    `createdByUserId`, `projectId`); sin filtros trae toda la colección (CLAUDE.md: evitarlo).
  - Se borraron `features/ops/services/opsRefs.ts` y `opsTasksService.ts`; el top 3 quedó en
    `features/ops/services/prioritiesService.ts`. El converter tipado pasó a
    `src/lib/firebase/typedConverter.ts`.
- La pantalla no cambia: el Task list, Owner y Manager usan los services nuevos. Verificado con
  el arnés: las 10 funciones contra el mock (crear/editar/borrar con contadores, getAll con y sin
  filtros, getOne de uno que no existe → null) y los recorridos del Task list, Owner/Manager,
  pestañas y reasignar escriben lo mismo que antes (solo cambia la fecha del día).

## Task list: quién puede reasignar una tarea (2026-10-14, rama `tareas-reasignar`)

Pedido de Omar: "Si me asignaron una tarea, no puedo cambiar el Assignee. Si la asigné yo, sí".
- `canReassignTask` (opsPermissions.ts): quien la asignó (`createdByUserId`) siempre puede;
  a quien se la asignó otra persona, nunca (aunque su rol tenga Edit). Con Task List → Edit se
  pueden seguir reasignando las tareas de OTRAS personas (como antes), para que el dueño o un
  gerente reparta trabajo.
- Panel: sin permiso, "Assignee" se ve como texto (como "Assigned by"), no como selector
  deshabilitado. El resto de la tarea (fecha, hora, prioridad, proyecto…) lo sigue editando la
  persona asignada.
- Reglas propuestas: un `update` que cambie `assigneeUserId`/`assigneeUserName` solo pasa si
  `createdByUserId` es uno mismo, o con Edit y la tarea no está asignada a uno mismo. Pruebas en
  security/tests.

## Task list: quién asignó la tarea, de solo lectura (2026-10-14, rama `tareas-asignado-por`)

Pedido de Omar: ver quién le asignó una tarea, y que ese dato no se pueda editar.
- Fila: "From Jesus" junto a la persona cuando la asignó otra persona (`assignedByLabel` en
  TaskListView: no sale si se la asignó la misma persona ni en la pestaña "Assigned by" de quien
  se mira; "From Me" si la asignó uno mismo y se ve en "Everyone").
- Panel: fila "Assigned by" con avatar, nombre y fecha de creación (MM/DD/AAAA), como texto, sin
  control. Sale de `createdByUserId` / `createdByUserName` / `createdAt`, que ninguna pantalla
  escribe después de crear la tarea (`TaskPatch` no los incluye). Las reglas propuestas también
  lo impiden: un `update` de `user_tasks` que toque `createdByUserId`, `createdByUserName` o
  `createdAt` se rechaza (prueba nueva en security/tests).
- Sin cambio: quien tiene la tarea asignada todavía puede cambiar "Assignee" en el panel (regla
  de antes: edita sus tareas). Si se quiere que solo quien la asignó o Edit puedan reasignar, es
  otro cambio.

## Task list: pestañas "Assigned to me" / "Assigned by me" (2026-10-14, rama `tareas-asignadas-pestanas`)

Pedido de Omar: ver las tareas que uno asignó y las que le asignaron, para todos los roles,
separadas en pestañas.
- Debajo de la fila para agregar: "Assigned to me · N" (las que tiene asignadas, como antes, con
  "Waiting for your OK") y "Assigned by me · N" (las abiertas que creó para OTRA persona; las
  que se asignó a sí mismo salen en la primera). Al ver a otra persona dicen "Assigned to Sandy"
  / "Assigned by Sandy". Con "Everyone" no hay pestañas.
- Rige igual con Scope Own: lo que uno asignó también es "suyo" (las reglas ya dejaban leer las
  tareas con `createdByUserId` propio). Nueva consulta `useCreatedTasks`:
  `createdByUserId == x && status == open` (solo igualdades, sin índice compuesto); una prueba
  más en security/tests.
- Desde "Assigned by me" se abre el panel, se edita (quien la creó puede) y se marca hecha.
- Owner y Manager no cambian (siguen con las pendientes según el Scope).
- Verificado con el arnés (Sandy con All y con Own, mirando a otra persona y "Everyone"); los
  recorridos del Task list escriben lo mismo que antes.

## Owner y Manager: solo ver y completar tareas; sin selector Owner/Manager (2026-10-14, rama `home-solo-completar`)

Pedido de Omar: "lo que se muestra en Owner es lo mismo que en Task list"; las tareas se agregan
SOLO desde el Task list. En Owner y Manager solo se ven las pendientes y se marcan hechas.
- Owner: se quitan el formulario "New task" y el botón de borrar. Quedan la lista (con filtro por
  persona), la casilla para completar (con Undo) y el enlace "Open Task List". Con Scope All
  muestra lo mismo que el Task list en "Everyone" (verificado: 7 / 7 en el arnés).
- `TaskChecklist` ya no tiene `onDelete`.
- **Sin selector Owner / Manager** arriba a la derecha (`HomeHeader` solo dibuja menú, saludo
  y fecha); entre las dos vistas se cambia con el menú lateral. `homeTabs`/`canViewHome` de
  App.tsx ya no existen.
- CSS borrado: formulario (`hm-newtask`, `hm-field`, `hm-input`, `hm-due-row`, `hm-btn.big`,
  `hm-btn.primary`), `hm-task-del` y `hm-switch`.

## Task list: Scope de Roles y tareas en Owner/Manager (2026-10-14, rama `tareas-scope-home`)

Pedido de Omar (con capturas de Task list, Roles, Owner y Manager). Decisiones suyas:
- **"Assign to"** sigue saliendo de `system_users`, solo usuarios activos cuyo rol puede abrir
  Task List (más uno mismo): así nadie recibe una tarea que no puede ver. Un empleado aparece en
  cuanto su rol tenga Task List → View. Helper único `assignablePeople` (opsPermissions.ts), lo
  usan el Task list y el formulario rápido de Owner.
- **Scope de Task List en Roles** (columna Scope que ya existía): `All` ve las tareas de todos
  (selector de persona y "Everyone"); `Own` solo las suyas (asignadas a él, más las que esperan
  su OK). `taskListRights().seesAll`. Rige en Task list, Owner y Manager. Un rol que no declara
  el módulo (roles viejos que heredan de Manager/Owner) ve todas, como antes; Administrator,
  todas. Ojo: Roles pone `Own` por defecto al declarar un módulo nuevo: los roles Owner y Admin
  deben quedar en `All`.
- **Owner y Manager muestran las tareas pendientes del Task list** (`user_tasks` abiertas) en vez
  de `manager_tasks`, que ya no se usa (sus documentos quedan en Firestore; se borró
  `services/managerTasksService.ts` y su regla). Hook `features/ops/hooks/useHomeTasks.ts`: un
  listener (`status == open`, o `assigneeUserId == yo` con Own) y las mismas acciones del Task
  list (contadores del proyecto, repeticiones, visto bueno, Undo).
  - Owner: "Open tasks" (o "My open tasks" con Own), filtro por persona con quienes tienen
    tareas, borrar con Task List → Delete, formulario rápido que crea en `user_tasks` (sin
    duración ni proyecto) y enlace "Open Task List". El resumen "Team" y "Today's time" usan
    estas tareas. Vencida = fecha anterior a hoy (igual que el Task list; antes contaba la hora).
  - Manager: "Manager tasks" = las de los usuarios cuyo rol tiene Manager → View (y las
    propias); con Own, "My tasks". Antes eran solo las del que entra.
  - Ya no se ven las hechas de los últimos 2 días tachadas: al marcarla sale de la lista (con
    Undo unos segundos, `UndoToast`, el mismo del Task list).
  - Si el rol no puede abrir Task List, la tarjeta de tareas no se muestra.
- **Reglas propuestas**: el espejo `user_access` guarda `o` (Scope Own) por módulo
  (functions/src/userAccess.ts); `user_tasks` con Own solo deja leer/cambiar/borrar las tareas
  asignadas, creadas o por aprobar de uno mismo. Las consultas de la app con Own siempre filtran
  por `assigneeUserId` o `approval.approverUserId`. Pruebas nuevas en security/tests (no se
  pudieron correr aquí: el emulador no se descarga en este entorno). **Hace falta desplegar las
  funciones y correr `rebuilduseraccess` para que `o` exista antes de publicar las reglas.**
- Verificado con el arnés: Owner como admin (todas, filtro, crear con fecha y hora, completar con
  contadores y Undo, tarea con OK pendiente no se marca, borrar), Owner con Own (solo las suyas,
  sin borrar), Manager con All (las de gerentes) y con Own, Task list con Own (sin selector,
  consulta filtrada por persona). Los recorridos del Task list escriben lo mismo que antes.

## Task list: nombres de colecciones y campos (2026-10-14, rama `user-tasks-nombres`)

Pedido de Omar: `ops_tasks` parecía "operadores"; los campos de usuario se leen mejor con
`User`. Decisiones suyas: renombrar las tres colecciones y TODOS los campos que guardan un
usuario; no hay tareas reales que conservar (lo que haya en `ops_*` era de prueba y deja de
verse en la app, no se migra).

- Colecciones: `ops_tasks` → `user_tasks` (+ `comments`), `ops_projects` → `projects`
  (+ `updates`), `ops_priorities` → `user_priorities` (id = id del usuario). Nombres en
  `COLLECTIONS` / `SUBCOLLECTIONS`; `OPS_COLLECTIONS` ya no existe. Clave del store:
  `useLiveData('projects')` (antes `opsProjects`).
- Campos: `assigneeId/Name` → `assigneeUserId/UserName`, `createdById/Name` →
  `createdByUserId/UserName`, `doneById` → `doneByUserId`, `authorId/Name` →
  `authorUserId/UserName` (comentarios y updates), `ownerId/Name` → `ownerUserId/UserName`,
  `teamIds` → `teamUserIds`, y en `approval`: `approverUserId/UserName`, `requestedByUserId`.
  Las consultas usan los nombres nuevos (`where('assigneeUserId'…)`,
  `where('approval.approverUserId'…)`): ninguna necesita índice compuesto.
- Storage: adjuntos nuevos en `user_tasks/{taskId}/…` (antes `ops/tasks/…`; la regla de
  Storage es una sola para todo el bucket).
- `security/firestore.rules` y sus pruebas con los nombres nuevos. **Antes de publicar, las
  reglas de la consola deben permitir `user_tasks`, `projects` y `user_priorities`** (si siguen
  con `match /ops_tasks…`, la vista Task list queda sin permiso).
- **`commentCount` se queda.** `comments.length` solo existe con los comentarios cargados (al
  abrir una tarea); para el 💬 de cada fila habría que leer los comentarios de todas las tareas
  de la lista. El contador viaja en el mismo batch que el comentario (`increment(1)`); hoy los
  comentarios no se borran sueltos (solo con la tarea). Si se agrega "borrar comentario", va
  con `increment(-1)` en el mismo batch.
- Sin cambio: `manager_tasks` (las tareas rápidas de Owner/Manager) conserva
  `assigneeId/assigneeName`: es otra colección, con datos en uso. (Después, el mismo día, Owner
  y Manager pasaron a usar `user_tasks` y `manager_tasks` dejó de usarse.)
- Los nombres de código (`OpsTask`, `features/ops`, `opsRefs.ts`) siguen con "Ops": son de la
  Fase 3 (nombres).
- Verificado con el arnés: los 4 recorridos del Task list (agregar, completar con repetición y
  deshacer, panel, comentario, archivo, top 3, proyectos, otra persona, borrar, visto bueno)
  escriben lo mismo que antes con los nombres nuevos; capturas iguales salvo la hora.

### Segunda ronda (mismo día): comentarios dentro de la tarea, sin seriesId, durationMinutes
Decisiones de Omar tras revisar el diagrama:
- **Comentarios → `user_tasks.comments[]`** = `{ userId, userName, text, createdAt }` (se va la
  subcolección `comments` y `commentCount`; la fila cuenta con `comments.length`). Comentar y
  cada paso del visto bueno es UNA escritura de la tarea con `arrayUnion`. `createdAt` es ISO:
  Firestore no acepta `serverTimestamp()` dentro de un arreglo. Un comentario se identifica por
  `userId` + `createdAt` (no tiene id). Costo: abrir una tarea ya no lee sus comentarios (antes
  una lectura por comentario); la lista trae los comentarios de cada tarea (documentos algo más
  grandes, mismas lecturas). Se pierde: con la subcolección las reglas impedían editar un
  comentario; dentro del arreglo, quien edita la tarea podría reescribirlos (igual que
  `notesHistory` de las casas). Borrar una tarea ya no lee sus comentarios.
- **`seriesId` fuera**: solo se escribía, ninguna pantalla lo leía. Cada repetición es una tarea
  suelta; si algún día se quiere el historial de una serie, se agrega entonces.
- **`durationMin` → `durationMinutes`**: sigue en minutos (2 h = 120, medio día = 240) porque
  se suma en `projects.openMinutes`; mismo nombre que `quality_checks.durationMinutes`.
- Sin cambio, a propósito: `status` ya es texto (`open`/`done`) y el front controla los valores;
  `approval.approverUserId` ya es quien aprueba y `approval.status` tiene 4 estados (`draft`,
  `pending`, `approved`, `changes`), así que no se agrega `isApproved` (duplicaría el status).
  "Assign to" ya sale de `system_users`, filtrado a quien puede abrir Task List (Roles &
  Permissions). Correo al aprobador: "ahora no"; si se quiere, va con una Cloud Function (las
  reglas propuestas solo dejan escribir en `mail` correos al email de la empresa).

### Tercera ronda (mismo día): `task_projects` y campos del proyecto; QC sin Finished
Pedido de Omar: `projects` → `task_projects` y una estructura nueva del proyecto.
- **Colección `task_projects`** (`COLLECTIONS.taskProjects`, clave del store `taskProjects`).
  Campos: `title` (antes `name`), `description` (antes `goal`; en pantalla sigue "Goal"),
  `ownerUserId/UserName`, `teamId` (→ `settings_teams`, o `null`; antes `teamUserIds[]`, que
  nadie llenaba), `startDate` y `dueDate` (`AAAA-MM-DD` o vacío), `repeat` (texto `daily`/
  `weekdays`/`weekly`/`monthly` o `null`; sin pantalla todavía), `color` (nombre plano de
  `PROJECT_COLORS` en `opsOptions.ts`, o `null` = color automático por id, como antes),
  `status`, contadores, `comments[]` (mismo map que las tareas, sin adjuntos; sin pantalla
  todavía), `doneAt` (ISO al pasar a `done`, `null` al salir de `done`; `updateProject` lo
  maneja solo), `createdByUserId`, `createdAt`. La tarea guarda `projectTitle` (antes
  `projectName`). Se van la subcolección `updates` (solo existía el tipo) y la carpeta de
  Storage `projects/…`: solo las tareas llevan archivos.
- Lo que se propuso y NO se hizo, a propósito:
  - `tasks: ID[]` en el proyecto: la tarea ya guarda `projectId` y Firestore las trae con
    `where('projectId', '==', id)` (no hace falta JOIN). Un arreglo duplicaría la relación,
    habría que mantenerlo en cada alta, baja y cambio de proyecto, y se desincroniza.
  - `userOwnerId` / `createdBy`: se dejan `ownerUserId` y `createdByUserId` para seguir la
    regla acordada (todo campo de usuario termina en `UserId`).
  - Se quedan `ownerUserName`, `status` y los contadores (`taskCount`, `doneCount`,
    `openMinutes`): la lista y el top 3 los muestran sin leer las tareas.
- Formulario de Projects: Team (de Settings → Teams), Start date y 7 colores. Un proyecto
  nuevo toma el siguiente color libre de la lista; al editar uno viejo sin color se marca el
  que ya se veía, así que guardarlo no cambia cómo se ve.
- Reglas propuestas: `match /task_projects/{projectId}`; los que no editan proyectos solo
  pueden cambiar contadores y `comments`. **La consola debe permitir `task_projects`.**
- **Quality Check: las casas con QC Finished ya no se muestran** en la pantalla del inspector
  (pedido de Omar con captura). Se quitan las tarjetas de reportes terminados, la pestaña
  "Finished" (quedan All / Pending / Recall; All = Pending + Recall) y el aviso "No hay
  registros…". Esos reportes siguen en Quality Check Reports (PDF y correo). Se pierde en esa
  pantalla: Editar, Borrar y exportar un reporte terminado; si hace falta, se agrega en
  Quality Check Reports.
- Verificado con el arnés: proyectos (crear con equipo, fechas y color; editar color, que
  cambia el chip de la fila; done → `doneAt`, active → `null`), los 4 recorridos del Task list
  (mismas escrituras salvo los nombres) y la vista QC antes/después (sin Finished, mismas
  casas pendientes y en Recall, sin errores).

## Refactor de la auditoría V00038 — Fase 2: carpetas y archivos (2026-10-14, rama `refactor/fase-2`)

Pedido: "Continúa con el refactor". Fase 2 solo mueve y divide (H-11 división, H-16, H-17 tipos),
sin cambiar reglas ni lo que se ve. Antes, en `refactor/fase-1`, el commit 8fb812e (barra de
sesión `SessionActions`, sin fondo gris, notas con scroll y ampliables).

### Resultado
- `views/HousesView.tsx`: 8,549 → **328 líneas** (orquestador). Nuevos en `features/houses`:
  `HouseList` (958), `HouseDetail` (2,069), `HouseForm` (1,942), 14 modales sueltos, hooks
  `useHouseCatalogs`, `useHouseAccess`, `useHouseSettings`, `useHouseDamages`, `useHouseChecklist`,
  `usePhotoQueue` (+ `usePendingForHouse`), `useHousePhotos`; `photoReport.ts`,
  `payrollRecords.ts`, `services/billingServices.ts`, `services/gcalSync.ts`.
- `src/lib/firebase/collections.ts` (`COLLECTIONS`); houses y quality-check ya no escriben
  nombres de colección a mano.
- Quality Check: `services/qualityChecks.ts` y `services/qcRoutes.ts`; `QualityCheckView`,
  `QCRoutesTableView` y `QCRouteDrawer` ya no importan `firebase/firestore`.
- Tipos de `quality_checks` en `types/index.ts` (`QualityCheckRecord`, `QcRecordLite`,
  `QcStatusRecord`, `QcFormData`, `QcPlaceData`); `Property.unit` también (antes `PropertyU`).
- Líneas (src, contra 8fb812e): ts/tsx 36,733 → 37,466 (+733: encabezados, imports y props de
  ~30 archivos nuevos); CSS sin cambio (16,563).
- Build (KB / gzip), contra 8fb812e: HousesView 181.33 / 48.47 → 186.44 / 52.76 (los nombres de
  props y de lo que devuelven los hooks no se minifican; el costo de dividir) · QualityCheckHub
  99.71 / 31.88 · style.css 355.59 · index 683.10 · `COLLECTIONS` en su propio chunk de 0.9 KB.
- Commits: 516abbd (hooks + 14 modales) · 9c69416 (HouseList, ServiceModal, PayrollModal) ·
  fcfb666 (HouseDetail, HouseForm) · 1ff2093 (Quality Check, tipos, COLLECTIONS) · cierre (V00042).

### Decisiones no obvias
- **La casa abierta y sus servicios/pagos se quedan en HousesView.** Un solo `useHouseRecords`
  para el detalle Y el formulario: "Edit Details" desde el detalle abre con los datos ya cargados
  (si cada componente tuviera su listener, el formulario esperaría uno nuevo). El cambio de status
  del detalle también se queda ahí (usa `properties` para el status anterior, igual que antes).
- **Detalle y formulario se montan en cada apertura** (`key` = contador). Lo que antes eran 15
  `setX([])` de reseteo en `handleOpenDetail`/`handleOpenForm`/`handleDuplicate`/`restoreDraft`
  ahora es el estado inicial (`initialForm()` en HouseForm).
- **Ramas muertas fuera.** `handleSavePayroll`/`handleSaveService`/`handleOpenServiceForm` tenían
  la rama "desde el formulario" y la "desde el detalle" juntas (`fromForm`); cada componente se
  queda con la suya. La lógica de cada rama es la misma.
- **Fotos sin conexión.** `usePhotoQueue` (HousesView) sube o encola, sincroniza al volver la
  señal y lleva el contador; `usePendingForHouse(id, syncVersion)` cuenta las pendientes de la casa
  abierta y se vuelve a contar después de cada sincronización.
- **"HouseModals" no es un archivo:** cada modal es su propio componente (más fácil de encontrar y
  de cargar), y los que solo usa el detalle o el formulario se dibujan dentro de él, DESPUÉS de su
  modal (mismo z-index 9999: el orden del DOM decide cuál queda arriba).

### Diferencias de comportamiento (casos borde, antes eran errores)
- Retomar un borrador muestra sus propias fotos y "fuera del reporte"; antes quedaban las del
  formulario anterior (y al guardar se escribían en la casa equivocada).
- "Edit" desde la lista cuenta las fotos pendientes de ESA casa; antes, las de la última abierta.
- "Duplicate" ya no se lleva a la copia las fotos nuevas que se agregaron en el detalle sin
  guardar (antes se subían a la casa nueva sin verse en el formulario).
- CfTest (temporal) tiene 3 botones: el de "email de QC" dependía de la función
  `onqualitycheckfinished`, que se quitó en Fase 1.
- Las fotos de Damages siguen yendo a la carpeta AfterPhotos (igual que antes; ahora sin cast).

### Verificación
- tsc y eslint sin errores (las 2 advertencias de siempre en QualityCheckView), build V00042.
- Arnés (Firebase simulado + Playwright): los 9 recorridos de `regress.sh` iguales a la línea base
  (solo cambia una hora); modales del detalle y formulario iguales; 3 recorridos nuevos (detalle:
  Start, Financials, editar/borrar servicio y pago, Export PDF, Sync manual, Edit Details, salir
  sin cambios, Duplicate, New Job; duplicar con servicios y retomar borrador; QC: rutas, editar y
  borrar ruta, correcciones hechas) con resultado idéntico antes y después (`git stash`).
- 36 capturas (escritorio y teléfono) iguales salvo el reloj de Owner/Manager.
- No probado: Firebase real, la Cloud Function de Calendar real (el simulador responde vacío y se
  va al método manual), el contenido del PDF impreso, la sincronización real al volver la señal.

### Pendiente para fases siguientes
- Vistas que aún importan `firebase/firestore`: Payroll, Manager, Settings, Roles, Users,
  Activity Log, Data Import (y `utils/liveRoute.ts`).
- Tablas de servicios y pagos casi iguales en HouseDetail y HouseForm, y los menús de
  trabajadores: candidatas a un componente compartido (Fase 5).
- `liveCollections` (`SOURCES`) todavía con nombres a mano: pasa a `COLLECTIONS` con los
  converters de Fase 4.

## Refactor de la auditoría V00038 — Fase 1: velocidad y menos código (2026-10-14, rama `refactor/fase-1`)

Pedido de Omar: seguir con el plan y "disminuir líneas de código, más sencillo y rápido".
Decisiones suyas en esta fase: borrar MigrarPayroll (ya terminó), Calendar usa el detalle y el
formulario de Houses, el QC se cierra sin esperar con el reporte completo por correo (y se quita
el resumen del servidor para que no lleguen dos), y el inspector baja solo los QC de casas en
flujo (H-05a).

### Resultado
- Líneas (src): ts/tsx 37,507 → 36,751 · CSS 18,600 → 16,597 · `functions/src/index.ts`
  1,177 → 1,075. En total ≈2,860 líneas menos (diff: +963 / −3,827).
- Build (KB / gzip), contra el cierre de Fase 0: style.css 393.05 → 356.14 / 61.31 ·
  index 683.61 → 682.96 · HousesView 186.50 → 180.57 · InvoicesView 22.08 → 20.97 ·
  CalendarView 22.50 → 9.97 · QualityCheckHub 98.93 → 99.97 (+1 KB: escucha por casas y guardado
  sin esperar) · PayrollView 46.00.
- Commits: 16d3bf7 (MigrarPayroll fuera) · ac3a36a (Calendar → Houses) · 068b1c2 (CSS sin uso) ·
  5c5fba5 (H-07) · 9f4e27f (H-05a) · 7371027 (H-15) · 60094e6 (H-09/H-08/H-10/H-06/H-11, V00041).

### Decisiones no obvias
- **Host único de modales de Houses (App).** Invoices y Payroll ya no incrustan su propio
  `HousesView`: piden la casa con `onOpenHouseDetail(house, 'media'?)` / `onOpenHouseEdit`. El host
  se monta la primera vez que se pide una casa (`houseModalsUsed`) y va en su propio
  `<Suspense fallback={null}>`: si el chunk de HousesView no estaba descargado, no cambia la
  pestaña por el esqueleto. Calendar, QC, QC Dashboard y Owner/Manager tampoco lo montan ya si
  nadie abre una casa.
- **`setProperties` fuera de las vistas.** Solo lo usaba "Revisar fechas" para parchar la lista
  después de escribir; el listener de App ya refleja la escritura al instante (y un parche local
  pisaba el siguiente snapshot igual).
- **Guardado por fila (H-06).** `usePendingById` no deshabilita la fila: la marca con
  `.is-pending` (opacidad 0.6) hasta que el servidor confirma. Sin señal queda marcada; es el
  aviso de "pendiente de sincronizar". Los `isSaving` de modales (formularios, pagos) se quedan:
  bloquean su propio botón, no la lista. El modal de nota de Invoices se cierra al guardar.
- **Edit al instante (H-08).** `useHouseRecords` escucha la casa mientras el detalle O el
  formulario están abiertos. Un efecto copia servicios y pagos al borrador UNA vez por apertura
  (`formSeedFor`), conserva lo `temp-` que el usuario ya agregó y reescribe la "foto" de cambios
  sin guardar; va declarado DESPUÉS del efecto de la foto para que lo reemplace en el mismo commit.
  Guardar antes de que lleguen no borra nada (las bajas son explícitas). Si el listener falla
  (permisos), el esqueleto se queda: antes salían listas vacías.
- **Tabla o tarjetas (H-10).** Houses usa `PHONE_QUERY` (48rem = 768px) e Invoices
  `(max-width: 900px)`: los mismos cortes de su CSS, que se queda como respaldo.
- **memo (H-11, parcial).** `UnifiedJobsTable` y `JobCard` con `memo`; HousesView les pasa
  handlers de `useStableCallback` y `renderRowStatus`/`wasRecall` con `useCallback` (con
  `eslint-disable` porque `getClientName` y `findStatusOf` dependen de `customersList` y
  `statusIndex`). Escribir en el formulario de la casa ya no redibuja la lista. Falta
  "HouseForm con su propio estado": va con la división de HousesView (Fase 2).
- **H-15.** `useDeferredValue` difiere el filtro; en Invoices las filas no tienen `memo`, así que
  el render urgente las vuelve a pintar con los mismos datos. Para quitarlo del todo, la lista de
  Invoices como componente con `memo` (Fase 2).
- **H-05a.** `useQcForHouses`: tandas de 30 ids con `where('houseId', 'in', …)`. Si cambia el grupo
  de casas en flujo se vuelven a abrir las tandas (≈ los reportes de esas casas, decenas) y se
  muestra lo anterior mientras llegan. `qcListInFlow` ya no tiene la rama de "casa borrada".
- **H-07.** `batch.commit()` sin `await`: el panel se cierra con el batch aplicado en local. La
  bitácora y el correo corren al confirmar; si el servidor rechaza, aviso con la casa y el
  código. Se quitó `onqualitycheckfinished`: el próximo `firebase deploy --only functions`
  pregunta si borrarla (responder que sí) y `QC_REPORT_EMAIL` ya no se usa.
- Calendar borra desde el detalle de Houses: la bitácora dice "Houses", no "Calendar". El botón
  "Quality Check" del detalle viejo de Calendar ya no existe (el de Houses no lo tiene).
- `reportToEdit` (QualityCheckView/Hub) se quitó: la pestaña Reportes del hub ya no existía.
- `knip` carga `vite.config.ts` y sube `app-version.json`: revertirlo después (anotado en CLAUDE.md).

### Verificación
- `tsc` (app y functions) sin errores · `eslint .` 0 errores, los mismos 3 avisos de antes ·
  `style={{` sin cambios salvo `JobCard` (1, variable CSS `--team-bg` que venía de HousesView) ·
  sin `any` nuevos.
- Arnés (Firebase simulado, Playwright): 36 capturas antes/después idénticas salvo el reloj de
  Owner/Manager; con red simulada de 1.5 s, Edit muestra el formulario en ~200 ms y servicios/
  pagos llegan después; Invoices pinta filas sin "Loading financial data"; cambiar el invoice
  status no deshabilita ninguna otra fila; en 390 px no existe la tabla y en escritorio no
  existen las tarjetas (Houses e Invoices); Fotos/PDF de Invoices abre el detalle en "Notes &
  Photos"; Editar casa desde Invoices y Payroll abre el formulario de Houses. Las pruebas de
  Fase 0 (historial en 7 rutas, QC todo o nada, papelera en 4 vistas y restaurar) siguen igual.
- **No probado aquí:** Firebase real, sin señal en un teléfono real, Lighthouse/CLS/INP, React
  Profiler, ni lecturas reales por pantalla (con `medir-lecturas.patch`).

### Pendiente
- H-11 completo (HouseForm con su propio estado) y la lista de Invoices con `memo`: Fase 2.
- Medir en producción las lecturas del inspector antes/después de H-05a.

## Refactor de la auditoría V00038 — Fase 0 (2026-10-13, rama `refactor/fase-0`)

Auditoría completa (hallazgos H-01…H-26) y prompt por fases: entregados a Omar como
`auditoria-V00038.md`. Esta fase cubre H-01, H-02, H-03 y H-12.

### Línea base (antes de cambiar nada, commit 854ac57)
- `tsc --noEmit -p tsconfig.app.json`: 0 errores. `eslint src`: 0 errores, 3 avisos
  (exhaustive-deps en DataImportView, HousesView, QualityCheckView) + 34 `eslint-disable` de
  exhaustive-deps.
- `vite build` (chunks principales, KB / gzip): index 683.57 / 212.40 · style.css 391.27 / 67.01 ·
  HousesView 189.37 / 50.69 · QualityCheckHub 99.17 / 31.35 · PayrollView 47.02 / 11.17 ·
  storage 32.20 / 10.71 · InvoicesView 22.01 / 6.51 · CalendarView 21.78 / 5.54 ·
  html2pdf 975.76 / 281.18 y xlsx 429.19 / 142.94 (los dos últimos con `import()` al usarse).
- **No medido aquí (requiere sesión real contra Firebase):** Lighthouse móvil de Overview,
  Invoices y Quality Check, y lecturas por carga en frío. Estimado de la auditoría (no medido):
  Overview ≈13,600 · Invoices ≈10,850 · Owner/Manager ≈13,600 · Quality Check ≈3,500 ·
  Payroll ≈6,000 documentos. Cómo medirlo: DevTools → Lighthouse (móvil) con sesión iniciada; y
  en Firebase Console → Firestore → Usage, una sesión nueva por pantalla. Para contar por
  pantalla: `medir-lecturas.patch` (entregado aparte, NO está en el repo) agrega un
  `console.info('[lecturas] …')` con el tamaño del primer snapshot de cada listener; se aplica con
  `git apply`, se corre `npm run dev` en una ventana de incógnito (caché vacía = carga en frío) y
  se quita con `git checkout -- src/shared/data`.

### H-12 · Cambios de status con historial (commit 6acd75d)
- `features/houses/services/houseStatus.ts`: `changeHouseStatus` (casa + `status_history` en un
  batch, bitácora después), `addStatusChange` / `addStatusHistory` para meter el historial en un
  batch que ya existe (formularios de Houses y Calendar, cierre de QC).
- Rutas: Overview/Pipeline, formulario de Houses, Invoices (Job Status), formulario de Calendar
  (ahora también con bitácora; App le pasa `currentUser`), modal de status de Quality Check y QC
  Reports (que ahora también estampa `sentToInvoiceAt`, antes no lo hacía).
- `statusHistoryService` quedó solo para leer. Probado en el arnés: cada ruta escribe 1 casa + 1
  historial en el mismo batch y 1 bitácora.

### H-03 · Cierre de QC atómico (commit 6acd75d)
- Reporte (id generado en el cliente) + casa (status, `invoiceHold`) + historial en un
  `writeBatch`. Si el batch falla no queda nada escrito y el aviso lo dice con el código; el
  aviso de éxito usa el status real que quedó. Probado con fallo forzado en la casa
  (`permission-denied` simulado): reporte y casa sin cambios.
- El commit todavía espera la confirmación del servidor (sin señal no se cierra): es H-07, Fase 1.

### H-02 · Borrar casa = papelera en las 4 vistas (commit 1560542)
- Decisión de Omar (2026-10-13): **motivo obligatorio** también en Invoices, Calendar y QC.
- `moveHouseToTrash` + `useHouseTrash` + `DeleteHouseDialog` (Escape cierra, sin motivo no
  habilita "Delete"). A la papelera va la versión en vivo de la casa al confirmar. La bitácora
  dice desde qué vista se borró; en la papelera el módulo es siempre "Houses" (es su colección).
- Se quitó `propertiesService.delete`. Probado: Houses, Invoices, Calendar y QC mueven casa +
  pago + servicio; restaurar desde Invoices los regresa completos.

### H-01 · Reglas por rol (propuesta, sin publicar)
- Omar aprobó instalar `@firebase/rules-unit-testing` y `firebase-tools` como devDependencies. Se
  instaló solo la primera (5.0.2, la que pide `firebase` 12; 14 líneas en el lock). Para
  `firebase-tools` basta el CLI global que ya se usa para desplegar funciones (pesa ~600 paquetes).
- `security/` (firestore.rules, storage.rules, README con decisiones D-1…D-9, 28 pruebas en
  `tests/`). **No está en `firebase.json`**: un deploy no la publica. `firebase.json` solo ganó un
  bloque `emulators` (no afecta el deploy) para `npm run test:rules`.
- Por qué el espejo `user_access/{email}`: `system_users` no usa el uid como id y los permisos son
  una lista de objetos; las reglas no pueden leer ninguna de las dos cosas. Lo mantienen
  `syncuseraccessonuser`, `syncuseraccessonrole` y `rebuilduseraccess` (functions/src/userAccess.ts,
  `computeAccess` probado aparte con 7 casos: admin, empleado sin dinero, gerente heredando Task
  List, herencia de Settings, permiso declarado que gana a la herencia, inactivo, sin rol).
- Modelo: "ver un módulo = trabajar en él", como la app hoy (salvo Houses y Task List). Endurecer
  más (separar ver/editar) primero exige cambiar las pantallas.
- Funciones: `synchousetocalendar`, `calendardiagnostics` y `setupcalendarwatch` piden usuario
  activo con Houses (antes solo sesión). `LoginView`: `permission-denied` al revisar la lista
  blanca ahora es "ACCESS DENIED" (hoy nunca ocurre; con las reglas, un correo fuera de la lista
  quedaba adentro con la app vacía).
- Revisión independiente de la propuesta (otro agente, solo lectura) y lo que se corrigió:
  · el trigger del espejo podía borrar el acceso de un usuario recién invitado (Users lo mueve de
    id con set + delete y los avisos llegan en cualquier orden) → ahora recalcula por email desde
    `system_users`;
  · se podía fabricar una entrada de `trash` (p. ej. un usuario con rol de admin) para que un
    administrador la "restaurara" → la regla solo deja crearla en el mismo batch que borra una
    casa, y `trashService.restore` solo restaura casas con pagos y servicios;
  · poner el propio correo en otro usuario, o editar el rol propio, daba otro rol → bloqueado
    (D-8 en el README);
  · `houses_form_config` lo guarda quien edita Roles & Permissions, la campana lee la bitácora para
    todos, MigrarPayroll se abre con Settings, `notice_board` (Data Import) y el alta de casas con
    solo "agregar" (D-9) → las reglas ahora lo permiten;
  · el historial de notas no puede vaciarse, la salida del reloj se marca una vez y en Storage
    solo borran Quality Check y Task List.
- **No verificado:** las pruebas de reglas no corrieron aquí (el emulador no se puede descargar
  en este entorno). El lint de `functions/` tampoco (eslint no está instalado en
  `functions/node_modules`; `index.ts` ya tenía 61 líneas de más de 80 que `google` marcaría).

### Pendiente de Fase 0
- **Export de las reglas e índices actuales** de la consola: con eso se crean `firestore.rules`,
  `storage.rules` y `firestore.indexes.json` en la raíz, idénticos, y se declaran en `firebase.json`.
  No se crean antes: declararlos con otro contenido haría que un `firebase deploy` cambiara
  producción.
- Decisiones D-1…D-7 de `security/README.md` antes de publicar las reglas.
- ~~¿Dos correos por QC?~~ Resuelto en Fase 1 (H-07): se quitó `onqualitycheckfinished`; queda
  el reporte completo que manda la app.

## Visto bueno en tareas y archivos + corrección en las notas de la casa (2026-10-13)

- **Approval en el Task list** (diseño "Approval"): map `approval` en `ops_tasks`
  (`OpsApproval`: status draft · pending · approved · changes, approverId/Name, requestedById/At,
  decidedAt, note; null = no hace falta). Casilla "Needs OK" en la fila para agregar (crea el
  requisito "por enviar" con el dueño como aprobador: rol con Owner, si no Administrator). En el
  panel: "For [persona] · Send for approval"; quien aprueba ve arriba "Waiting for your OK"
  (listener `approval.approverId == yo` y `approval.status == 'pending'`, solo igualdades) y
  responde Approve / Request changes (con nota). Cada envío o respuesta deja un comentario en la
  tarea (mismo batch). **Regla:** la tarea no se puede marcar hecha hasta que esté aprobada. Al
  repetirse, la siguiente vuelve a "por enviar" con el mismo aprobador. Etiquetas en la fila:
  Needs OK, Waiting for {nombre}, Approved, Changes requested.
- **Notas de la casa (Office, General, Employee) con archivos y corrección** (pedido de Omar):
  - Clip en el compositor: los archivos se suben a `{Cliente}/NoteFiles/` (misma carpeta del
    cliente que las fotos; imágenes comprimidas, si no se pueden comprimir va la original) y el
    mensaje guarda `attachments` en su entrada de `notesHistory` (`NoteHistoryEntry` en
    types/index.ts). Un mensaje puede ser solo archivos: entonces el texto acumulado del campo no
    cambia.
  - Lápiz en la burbuja: cada quien corrige SUS mensajes; un administrador, cualquiera; la "Nota
    anterior" (texto sin historial, de AppSheet) la corrige quien tiene Edit en Houses.
    `propertiesService.editNoteMessage` usa `runTransaction`: cambia esa entrada (por autor +
    hora; marca `editedAt`/`editedBy`) y rehace el texto acumulado del campo conservando el texto
    viejo que hubiera antes del historial. Corregir la "Nota anterior" reemplaza el campo y deja
    una entrada 'edited' con el texto completo (como las ediciones antiguas). El mensaje se ve
    "editada"; el modal Historial muestra la corrección y los archivos.
  - No incluido: quitar un archivo de un mensaje ya enviado, borrar mensajes.

## Task list de gerentes (2026-10-13)

Vista nueva "Task List" (pestaña `task_list`) según el diseño "Sandy's tasks". Código en
`src/features/ops/` (vista, componentes, hooks, servicios); tipos en `src/types/index.ts` (sección 5).
- **Datos:** colecciones del diagrama entidad-relación: `ops_tasks` (+ `comments`), `ops_projects`,
  `ops_priorities/{userId}`; adjuntos en Storage `ops/tasks/{id}/…`. Referencias tipadas con
  `withConverter` en `services/opsRefs.ts`. Campo agregado al modelo: `ops_tasks.priorityId` (FK →
  `settings_priorities`, el mismo catálogo de prioridades de la app; el diseño muestra "Priority").
- **Lecturas acotadas:** tareas ABIERTAS de la persona (`assigneeId ==` y `status == 'open'`) o de
  todos (`status == 'open'`): solo igualdades, sin índice compuesto. Las hechas no se descargan.
  Proyectos por el store compartido (`useLiveData('opsProjects')`). Comentarios y top 3 con
  listener propio solo mientras se ven.
- **Escrituras:** cada acción en un `writeBatch`; los contadores del proyecto (`taskCount`,
  `doneCount`, `openMinutes`) con `increment()` al crear, completar, reabrir, borrar, cambiar de
  proyecto o de duración (solo si el proyecto existe). Comentario = documento + `commentCount`
  +1 en el mismo batch. Adjuntos con `arrayUnion`/`arrayRemove`; imágenes comprimidas antes de subir.
- **Repetición:** al marcar hecha una tarea que se repite se crea la siguiente en el mismo batch
  (misma `seriesId`). La fecha se cuenta desde el vencimiento o desde hoy, la más tarde (una tarea
  diaria atrasada vuelve mañana). "Undo" (6 s) reabre la tarea y borra la repetición creada.
- **Secciones:** Overdue, Today, This week (hasta el domingo, semana lunes–domingo como
  `utils/periods.ts`), Later, No date. Fechas en MM/DD/AAAA (el diseño mostraba "Oct 9": se aplicó
  la regla del negocio) y horas h:mm AM/PM; la hora se elige de una lista cada 15 min (un
  `<input type="time">` depende del idioma del navegador).
- **Permisos (módulo "Task List" en Roles):** sin declarar, lo ven quienes tienen Manager u Owner
  (`opsPermissions.ts`). Todos los que la ven agregan, completan, comentan y adjuntan; editan las
  tareas que crearon o les asignaron y su propio top 3. `canEdit`: cualquier tarea, proyectos y el
  top 3 de otros. `canDelete`: borrar tareas y proyectos (un proyecto con tareas solo se archiva).
  Todos los gerentes ven todo: selector de persona o "Everyone" en el encabezado.
- **Colores** de proyectos y avatares: derivados del id (sin campo nuevo).
- **Pendiente / no incluido:** menciones con @ (el composer del diseño las sugiere), subcolección
  `updates` de proyectos (sin pantalla todavía), equipo (`teamIds`) y repetición de proyectos,
  historial de tareas hechas, integración con Slack (`/tarea`).
- **Security Rules (las aplica Omar en la consola; no están en el repo):** si las reglas no tienen
  un permiso general para usuarios con sesión, hay que agregar `ops_tasks` (+ `comments`),
  `ops_projects` y `ops_priorities` para `request.auth != null`, y en Storage `ops/**` (lectura y
  borrado con sesión; subida con sesión y tamaño < 20 MB). Sin eso la vista queda vacía y las
  escrituras avisan "permission-denied".

## Lote B — "La información tarda en mostrarse" (2026-10-13)

- **La app ya no espera a las casas para dibujarse.** Antes "Cargando datos..." tapaba toda la
  pantalla hasta tener casas + roles + perfil. Ahora basta roles + perfil (deciden menú y
  permisos): el menú y las vistas que no usan casas (Settings, Customers, Users, Roles, Activity,
  Trash…) aparecen de inmediato; las que sí las usan (`TABS_WITH_PROPERTIES` en App.tsx) muestran
  el esqueleto de la vista (`ViewSkeleton`) hasta el primer snapshot. Una vista nueva que reciba
  `properties` va en ese conjunto.
- **El código de la última pestaña se descarga antes.** Si el equipo ya usó la app
  (`pc_active_tab` en localStorage), `prefetchView` arranca al cargar el módulo, en paralelo con
  la verificación de sesión (antes esperaba a que Firebase confirmara la sesión).
- **`preconnect`** a Firestore, Auth (securetoken, identitytoolkit) y Storage en `index.html`: el
  DNS + TLS se resuelven mientras baja el JavaScript.
- **HousesView en modo `modals-only`** (encima de Quality Check, Payroll, Invoices,
  Owner/Manager…) ya no filtra, ordena ni agrupa las ~3,600 casas en cada cambio: no dibuja la
  tabla. "Mi historial" solo se calcula con el panel abierto.
- **Búsqueda del Overview con `useDeferredValue`**: la caja responde al instante y el filtrado va
  un paso atrás (equivale al debounce de CLAUDE.md sin temporizadores).
- **Búsquedas por id en O(1)** (`propById`) en Payroll, Quality Check y QC Reports: cada fila
  buscaba su casa con `properties.find` (registros × 3,600 casas en cada render). Payroll además
  convierte las fechas una vez por registro antes de ordenar (antes en cada comparación).
- **Calendar** agrupa los trabajos por fecha una vez por cambio de casas (antes cada celda
  recorría todas las casas en cada render). Mismo criterio (`scheduleDate || receiveDate`) y orden.
- Medido: el chunk principal (≈676 KB, 210 KB gzip) es casi todo Firebase (Firestore 263 KB, Auth
  75 KB, WebChannel 50 KB) + React DOM (178 KB); el código propio pesa ~40 KB. Bajarlo más
  requiere cambiar de arquitectura (ver "Prompt de plan de acción").

Evaluado y NO cambiado (cambia lo que se ve o requiere aprobación):
- Las compuertas de carga de Invoices/Payroll/Calendar esperan catálogos chicos (statuses,
  customers): quitarlas mostraría ids o "cliente eliminado" por un instante.
- El guardado del QC espera el envío del email automático antes de avisar y cerrar: mandarlo en
  segundo plano cambia el mensaje final (hoy incluye el resultado del email).
- El Overview abre `billing_services` y `payroll` completos para las columnas de finanzas (todos los
  roles las ven). Totales por casa mantenidos en el servidor (Cloud Function) quitarían esas
  descargas: requiere aprobación (desplegar Functions y escribir campos nuevos en `properties`).

## Lote A — "Hay que recargar para ver los cambios" (2026-10-13)

Causas encontradas y arreglo:
- **Copias congeladas de la casa abierta.** El detalle de Houses, el de Calendar, el panel de
  Quality Check y el modal de casa de Payroll trabajaban sobre la casa tal como estaba al abrirlos;
  lo que cambiaba en otra vista u otro equipo no aparecía hasta cerrar y reabrir. Ahora guardan la
  casa abierta (`openedHouse`) y muestran su versión EN VIVO con
  `features/houses/hooks/useLiveHouse.ts` (`useLiveHouse`): la toma de la lista global y, si no
  está (fuera de la ventana de 12 meses o de lo visible para el rol), abre un listener de ese
  documento mientras siga abierta. El pago abierto en Payroll también se toma en vivo por id.
- **Parches manuales con la lista vieja.** `setProperties(properties.map(...))` después de cada
  escritura usaba el `properties` del render (closure viejo): si el listener ya había entregado
  datos más nuevos, el parche los PISABA con la copia vieja y esos cambios no se veían hasta
  recargar. Quitados: HousesView ×11, InvoicesView ×5, CalendarView ×3, QCReportsTableView ×1. El
  listener refleja cada escritura al instante (también sin internet). Calendar y QCReportsTable ya
  no reciben `setProperties`. Quedan los de `PropertyDateFixTool` (funcionales, inofensivos).
- **Servicios y pagos del detalle leídos una sola vez.** Ahora `useHouseRecords(houseId)` escucha
  `billing_services` y `payroll` filtrados por `propertyId` (consultas de un solo campo, sin
  índice) mientras el detalle está abierto. Excepción documentada a "usa el store compartido": el
  store de esas colecciones las baja completas (miles) para mostrar 2–5 documentos.
  `housePayrollRecords` queda solo como borrador del FORMULARIO. Editar desde el detalle reutiliza
  esos datos: el formulario abre sin consultar Firestore; si no, las dos lecturas van en paralelo.
- **Fotos del detalle.** Quitar una foto guardada solo la escondía: "Save Photos" reescribía la
  lista completa desde la copia y la foto volvía al recargar (y la cuenta de índices de archivos
  nuevos quedaba corrida). Ahora las guardadas se leen en vivo, las quitadas se marcan
  (`detailRemoved`) y al guardar viajan `arrayRemove` + `arrayUnion` en un batch; "fuera del
  reporte" se guarda como diferencia contra lo que había al abrir.
- **Escrituras de leer-modificar-escribir.** Nota nueva (`notesHistory`), trabajadores asignados,
  fotos encoladas sin conexión (`syncPendingPhotos`, además una lectura menos) → `arrayUnion` /
  `arrayRemove` (`propertiesService.arrayChange` / `batchArrayChange`). El formulario de edición
  de Houses y el de Calendar escriben SOLO los campos que cambiaron desde que se abrieron
  (`features/houses/houseDiff.ts`); los arreglos van con union/remove. Antes reescribían la casa
  completa y borraban lo que otra persona había guardado mientras tanto. Alta nueva y borrador
  restaurado siguen escribiendo todo (no hay "antes" contra qué comparar).
- **Editar un pago en Payroll** reescribía el registro completo: si alguien lo marcaba Paid en el
  intermedio, volvía a Pending. Ahora solo manda montos, notas y total.
- **Ventana de 12 meses.** Firestore entrega el cambio `removed` con los datos VIEJOS (que aún
  cumplían la ventana), así que toda casa que salía por una edición (p. ej. factura vieja marcada
  Paid) se trataba como borrada y desaparecía de la lista donde se estaba editando. Ahora se
  escucha ese documento suelto: si existe se conserva (en vivo), si no, se quita. El corte es el
  día 1 del mes (antes "hoy − 12 meses"): la consulta es idéntica todo el mes y la caché local la
  reutiliza; carga hasta ~30 días más de historial. Las cuatro consultas publican una vez por
  tarea (microtask) en vez de una por consulta.
- **Listeners compartidos que fallaban** (p. ej. permisos que aún no llegan al iniciar sesión)
  quedaban muertos hasta que otra vista los pidiera. Ahora se reabren solos con espera creciente
  (2 s → 60 s) mientras alguien los use.
- **Mapeo incremental** (`shared/data/incrementalSnapshot.ts`) en `liveCollections` y en el
  listener completo de casas: solo se re-mapean los documentos que cambiaron; los demás conservan
  su objeto (menos renders en listas grandes).
- **Service Worker.** La página salía del precache: tras cada deploy la primera apertura mostraba
  la versión vieja. Ahora las navegaciones son NetworkFirst (4 s, navigation preload) con respaldo
  al `index.html` del precache sin red; `directoryIndex: null` evita que el precache conteste "/".
  `_headers` marca `no-cache` explícito para `/`, `index.html`, `sw.js`, `registerSW.js`,
  `version.json` y el manifest. Al detectar versión nueva se pide `registration.update()`.
- **Papelera:** los pagos de una casa borrada se guardaban como `payroll_records` (colección
  vieja): el pago NO se borraba de `payroll` (quedaba huérfano en Payroll) y al restaurar se
  escribía en la colección equivocada. Ahora `payroll`; al restaurar entradas viejas,
  `payroll_records` se mapea a `payroll` (reescribe el mismo documento).

Correcciones tras la revisión independiente del lote:
- `navigateFallback: null` explícito: si se omite, vite-plugin-pwa pone `"index.html"` por defecto
  y esa ruta cache-first gana antes que la regla NetworkFirst (el cambio no hacía nada). Probado
  con `vite preview` + Playwright: con la config vieja la primera recarga tras un "deploy" seguía en
  el bundle viejo; con la nueva trae el nuevo, y sin red la app abre desde la caché.
- Restaurar una entrada vieja de la papelera (`payroll_records`): si el pago sigue en `payroll`
  (nunca se borraba) NO se reescribe; pudo marcarse Paid después y volvería a Pending.
- Formulario de Houses: el sello de entrada a Invoice y la bitácora comparan contra la casa tal
  como se abrió (no contra la versión en vivo): no se atribuyen a esta persona cambios ajenos.
- Reintentos de `liveCollections`: máximo 6 seguidos (≈2 min); un rol sin permiso de lectura no
  queda reintentando para siempre. Una vista nueva que pida la colección vuelve a intentar.
- Al borrar la casa abierta (Houses, Calendar) se suelta `openedHouse` (no queda un listener del
  documento borrado).

Pendiente (no hecho en este lote):
- El texto acumulado de una nota (`note`/`officeNote`/`employeeNote`) sigue siendo
  leer-modificar-escribir sobre la casa en vivo; dos mensajes simultáneos pueden dejar uno solo en
  el texto (el historial guarda ambos). Requiere `runTransaction` si llega a pasar.
- InvoicesView y CalendarView borran casas DIRECTO (sin papelera ni motivo), a diferencia de
  Houses. Decisión de producto: preguntar si deben usar la papelera.
- No todas las vías de cambio de status escriben `status_history` (solo algunas). Unificarlas
  cambia datos guardados: preguntar.

## Vistas quitadas, Pipeline sin fotos y botón Pagar en Payroll (2026-10-13)

- **No Status y Status History quitadas** (pedido del usuario): archivos, pestañas `no_status` y
  `status_history` de App.tsx (tipos, `VALID_TABS`, guardia de permisos), menú lateral,
  `viewPrefetch` y módulos de Roles. Quien tenía guardada una de esas pestañas entra a Houses. El
  historial de status de cada casa sigue en el detalle (pestaña History, `StatusHistoryPanel`) y la
  colección `status_history` se sigue escribiendo. Ojo: las casas SIN status ya no tienen una vista
  propia; se ven en Overview (buscador) mientras no se les asigne uno.
- **Pipeline sin botones Before / After**: se quitaron de la tarjeta, sus props
  (`showBeforePhotos`, `showAfterPhotos`, `onOpenPhotos`, `photoGate`), su CSS y los dos elementos
  del configurador de campos (`board_beforePhotos`, `board_afterPhotos`). Las fotos siguen en el
  detalle de la casa (Notes & Photos).
- **Payroll: botón "Pagar" en cada fila** (solo con alcance de nómina "All", casas sin pagar).
  Casa sin nómina: filtra al empleado de esa casa, la deja marcada y abre el mismo pago de "Pagar
  seleccionadas" (el modal arranca en Status "Pending" como ese flujo; se elige "Paid" para dejarla
  pagada). Casa ya en una nómina sin pagar: la marca como pagada (`handleMarkAsPaid`). Antes había
  que elegir primero un empleado en el filtro para que aparecieran los checks y el botón.

## Botón de menú único (2026-10-09)

- Cada vista tenía su propio botón de menú (13 clases distintas: `ns-`, `inv-`, `al-`, `cs-`, `ps-`,
  `qcv-`, `qcrt-`, `shv-`, `stv-`, `tv-menu-btn`, `hamburger-btn-compact`, `mobile-menu-btn`…). En
  Quality Check, Quality Check Reports y Rutas iba `position: fixed` arriba a la derecha y en la
  computadora quedaba encima de los íconos de `TopRightActions` (campana, ver como, salir); en Roles,
  Settings y Trash no aparecía en la computadora (sin forma de plegar el menú lateral desde ahí).
- Ahora todas usan `shared/components/MenuButton` (clase global `.hamburger-btn`) como primer hijo de
  `.view-header-title-group`: a la izquierda del título en computadora y a la derecha en el teléfono
  (regla que ya existía en index.css). Se quitó el CSS de los 13 botones viejos y el espacio que
  reservaban (`padding-right: 56px`). De paso: el aviso de la ventana de 12 meses de Invoices
  estaba dentro del encabezado (al lado del título) y pasó debajo; el subtítulo de Settings en el
  teléfono vuelve a ir debajo del título.
- Probado en el arnés (16 vistas, computadora y teléfono): un solo botón por vista, nunca fijo,
  izquierda/derecha según el ancho. Vistas fuera del arnés (Company, Photo Settings, Data Import,
  Trash, Rutas) solo verificadas por código.

## Detalle de la casa y nuevo panel de Quality Check (2026-10-09)

- **Detalle de la casa:** "Notes & Photos" es la primera pestaña y abre por defecto (pedido del
  usuario). Si el usuario no la puede ver (permiso, o empleado antes de Start Job) abre en
  "Overview & Log"; si deja de estar disponible estando abierta (Undo Start Job) se muestra
  Overview (`shownDetailTab`). Invoices (fila/ojo) y No Status ya no fuerzan Overview.
- **Panel de Quality Check** (`src/features/quality-check/`: `QcCheckDrawer`, `QcChecklist`,
  `QcIncomingNotes`, `QcPhotoGrid`, `qcForm.ts`) reemplaza el modal con selector de áreas, según
  el diseño del usuario. Panel lateral derecho en computadora, pantalla completa en el teléfono.
  Respuestas del usuario: checklist = áreas y tareas de Settings; se quitan el puntaje 1-3, Daños
  y fotos por área; se quedan PDF/WhatsApp/Email (íconos en el encabezado); "Notify property
  manager" y "Create re-clean job" funcionan.
  - Datos: Pass/Fail se guardan como antes (`qcData[área].tasks[tarea] = 'Yes'|'No'`), así el %,
    el PDF, QC Reports y el QC Dashboard no cambian. Fotos generales y "Notes for the team" van
    en el área interna `__general` (sale en el PDF como "General"); "Photos for office" en
    `__office` (nunca en PDF, WhatsApp, email ni en el panel del QC Dashboard). Campos nuevos del
    documento: `inspectorId`, `clientNotes`, `notifyManager`, `outcome`, `reclean`; el inspector
    y la fecha ahora se eligen (antes: usuario actual y hoy). Reportes viejos: sus fotos por área
    se ven en "Photos" y siguen en el PDF; notas, daños y puntaje viejos se conservan al guardar.
  - Flujo: "Save QC" sin resultado guarda el avance (Pending) y deja el panel abierto (antes
    "Done"). Con **Invoice**: terminado/aprobado, la casa pasa a "Quality Check" (como "Save
    All"), salvo que ya esté en Invoice (nunca se regresa), y se libera la factura retenida. Con
    **RECALL** + "Create re-clean job": la casa pasa a Recall (como antes) y queda
    `invoiceHold: true` (etiqueta "QC hold" en Invoices e "Invoice hold" en el Overview) hasta que
    un QC de la casa se apruebe. RECALL sin re-clean: queda registrado como no aprobado y la casa
    va a "Quality Check". Editar un reporte ya terminado sin elegir resultado conserva su estado
    y no mueve la casa ni reenvía el email automático.
  - "Notify property manager" (sección solo oficina, permiso Office Notes): al terminar abre el
    email al correo del cliente en Customers (o el de la empresa) con el resumen, las "Notes for
    client" y el PDF para adjuntar.
  - "From the office" = nota general + Office Notes (con permiso); "Notes from the cleaners" =
    Employee's Note + fotos Before/After de la casa.
  - Revisión independiente (corregido antes de entregar): reporte terminado que volvía a Pending
    al editarlo; casa en Invoice que regresaba a Quality Check; fecha vieja con barras que se
    cambiaba por hoy; fotos que terminaban de subir con el panel cerrado iban al formulario de
    otra casa (ahora van al reporte guardado de su casa) y no se puede terminar mientras suben;
    fotos en cola sin conexión de una casa se veían en otra (la cola ahora es por casa + área);
    correo del property manager que quedaba en el siguiente email; notas generales importadas
    de AppSheet (`generalNotes`); foco del teclado al abrir/cerrar; botones de foto más grandes
    en el teléfono. También el email automático del servidor (`functions/src/index.ts`) ahora
    escapa el texto y muestra la fecha MM/DD/AAAA — **hay que desplegar Functions** para que
    aplique.
  - CSS: se quitaron de `QualityCheckView.css` las ~130 reglas del modal viejo (selector de áreas,
    tarjetas por área, barra de áreas, botones Done/Save All).
  - **Pendiente / a decidir:** si alguien pasa a Invoice a mano una casa con la factura retenida,
    la etiqueta "QC hold" se queda como aviso hasta que un QC pase (¿liberarla al pasarla a mano?).
    El QC Dashboard sigue contando "invoices on hold" con su regla de antes (re-cleans sin pagar).
  - **No probado contra Firebase real** (sí en el arnés con Firestore simulado, escritorio y
    teléfono): subida real de fotos a Storage, cola sin conexión con fotos de General, y que las
    Security Rules acepten los campos nuevos.

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

## Task list: varias personas por tarea, hora libre, "N/A" y botón "Add Task" (2026-10-16, rama `tareas-varias-personas`)

Pedido de Omar: "Assign to"/"Assignee" como lista (una tarea la pueden hacer varias personas),
"How long" con opción de no aplica, "Time" como campo de hora (8:00 AM, 5:00 PM), y quitar el
top 3 y la fila para agregar tareas: en su lugar un botón "Add Task" que abre el panel lateral.
- **`assignees: { userId, userName }[]` en vez de `assigneeUserId` / `assigneeUserName`** (review del PR:
  antes eran dos listas paralelas, ids y nombres, que se podían desincronizar). `assigneeUserIds` se
  guarda solo para la consulta `array-contains` y lo arma `assigneeFields` en `userTasksService`
  (converter al crear y `update`); no escribirlo a mano en otro lado.
  Sin migración (decisión de Omar): el converter de `userTasksService` lee el formato viejo como
  lista, y `update` borra los campos viejos (`deleteField`) SOLO cuando cambian las personas. No
  convertirlo en cada escritura: la regla de reasignar rechazaría que la persona asignada cambie,
  p. ej., la fecha de una tarea vieja (el update tocaría campos assignee*).
- **Dos listeners por persona mientras queden tareas viejas abiertas** (`useOpsData.ts`):
  `assigneeUserIds array-contains` + `assigneeUserId ==` (`LEGACY_ASSIGNEE_FIELD`), juntados por id.
  Cuando ya no quede ninguna tarea abierta con `assigneeUserId`, se puede quitar la segunda consulta
  (y el campo del converter). `getAll` ya no filtra por persona.
- Reglas propuestas: `myTask` acepta los dos formatos; reasignar revisa los 4 campos assignee*.
  Pruebas actualizadas en security/tests (no se pudieron correr: el emulador no se descarga aquí).
- "Assigned by me" muestra también las tareas que uno comparte con otras personas (antes solo las
  de otros); "From X" no sale si la tarea es solo de quien la asignó (`isOnlyAssignee`).
- "How long": opción `N/A` = `durationMinutes: 0` (la fila no muestra duración; no suma minutos al
  proyecto). "Time": `shared/components/TimeInput` (h:mm AM/PM en cualquier navegador, como
  DateInput; guarda "HH:mm"). `formatHm` se movió de `opsDates.ts` a `utils/dateFormat.ts`.
- Crear: `NewTaskPanel` (borrador local, se guarda con "Add task"); comparte `TaskDrawer` (marco) y
  `TaskFields` (campos) con `TaskPanel`. Si elige quién aprueba, la tarea nace con el visto bueno
  "por enviar" (`draftApproval`), como la casilla "Needs OK" de antes.
- **Pendiente:** el top 3 (`user_priorities`) ya no tiene pantalla, pero siguen `useTopProjectIds`
  (antes `usePriorities`), `savePriorities`, `prioritiesService`, el tipo `UserPriorities` (antes
  `OpsPriorities`) y su regla. Decidir si se borran.
- Review del PR: `userTasksService.create`/`update` validan el título (no vacío, ≤ `MAX_TITLE_LENGTH`)
  y la duración (entero ≥ 0) con `assertValidTaskFields`; la pantalla ya los limita, pero el service
  es la última puerta antes de Firestore. `MAX_TITLE_LENGTH` y `DEFAULT_DURATION_MINUTES` viven en el
  service y los usan los paneles. Las reglas propuestas todavía no validan el título (pendiente).
- Review del PR: el visto bueno "pidieron cambios" ahora se guarda como `approval.status =
  'changes_requested'` (antes `'changes'`); tipo `ApprovalDecision` en `types/userTasks.ts`. Sin
  migración: el converter (`toApproval` en `userTasksService`) lee `'changes'` como `'changes_requested'`.
  No quitarlo mientras haya tareas viejas con `'changes'`. Las clases CSS siguen el valor
  (`.changes_requested` en TaskPanel.css y TaskRow.css).
- Review del PR (TaskListView): en "Waiting for your OK" la fila va sin `onMarkDone` (TaskRow no
  dibuja la casilla): quien da el visto bueno abre la tarea y aprueba o pide cambios, no la cierra.
  `useLiveTask` devuelve `loaded`: si la tarea abierta se borró o no se pudo leer, la vista avisa
  ("This task was deleted." / "Could not open the task…") en vez de dejar `selectedTaskId` apuntando
  a nada. No avisa mientras se borra desde el mismo panel (`actions.busyId === selectedTaskId`): el
  listener la ve borrada antes de que termine `remove`. El error del panel ya no reemplaza la lista.
- Review del PR (Manager): el "Pass" rápido ya no escribe `quality_checks` desde la vista. Hace lo
  mismo que el resultado "Invoice" de la inspección completa (decisión de Omar, 10/2026): en un batch
  (`qualityChecks.saveBatch` + `addStatusChange`) el reporte (`outcome: 'invoice'`, `quickPass: true`,
  fecha con `todayIso()`), la casa a "Quality Check" salvo que ya esté en Invoice, `invoiceHold: false`
  si estaba retenida y su `status_history`. Antes solo creaba el reporte y la casa no cambiaba de
  status (las métricas de status_history no lo veían). ManagerView ya no importa firebase/firestore.
- Review del PR (Owner): se quitaron "Updated …" y el botón "Refresh" del resumen (decisión de Omar):
  solo cambiaban la hora mostrada; los datos ya llegan en vivo. "% vs. mes anterior" compara contra el
  mismo día del mes anterior topado a los días que tuvo (antes topado a 28: del 29 al 31 salía
  inflado). El filtro por persona vuelve a "All" en el render si la persona ya no está en los chips.
  Sin `eslint-disable` de exhaustive-deps: los periodos salen de un `useMemo([now])` (`now` es estado
  de `useHomeData`) y `fin.sum` se pasa como dependencia (cambia cuando llegan billingServices/payroll).
- Task list (10/2026, pedido de Omar con nota del senior): la lista va por pestañas de sección
  (`TaskSectionTabs`; solo las que tienen tareas) y UN componente para todas (`TaskSection`, antes
  `TaskSections`). "Daily" = tareas que se repiten `daily` o `weekdays`, sin importar la fecha
  (`taskSectionOf`/`groupTasksBySection` en opsDates); las demás van por vencimiento (Overdue, Today,
  This week, Later, No date). `sectionOf` sigue sin devolver 'daily': Owner, Manager y la fila lo usan
  para saber si algo está vencido.
- Repetición con fin ("Ends: Never / After N times", `TaskRepeatPicker`): `repeat.timesLeft` = veces que
  falta hacerla contando la actual (null o sin campo = siempre). Al marcarla hecha, `complete` crea la
  siguiente con una vez menos; con `timesLeft: 1` ya no crea otra. Las reglas no validan `repeat`, así
  que no hubo que tocarlas; el service valida 1..`MAX_REPEAT_TIMES`.
- "My projects" (`MyProjectsPanel` + `TaskCalendar` + `ProjectCard`) usa solo lo que ya está cargado
  (tareas asignadas + dadas a otros de la persona que se mira y `taskProjects`): sin consultas nuevas.
  "Off track" = alguna de sus tareas abiertas CARGADAS está vencida; el avance sale de los contadores
  `doneCount`/`taskCount`. La tarjeta abre `ProjectsModal` con `initialProjectId`. Sin el top 3.
- Quality Check (10/2026, pedido de Omar): cada área del checklist (Porch, Rooms…) tiene sus fotos
  debajo de sus tareas (`QcChecklist` recibe `renderSectionPhotos`). Se guardan donde ya se guardaban
  las fotos por área (`qcData[placeId].photos`): misma subida, cola sin conexión, editor y PDF por
  área. "Other photos (before / after)" muestra el área General (`__general`) y las fotos de áreas que
  ya no salen en el checklist (inspecciones viejas): no quitarlas de ahí o esas fotos no se verían.
- Quality Check · "Edit checklist" (10/2026, pedido de Omar): las áreas se contraen/extienden (estado
  local del panel) y, con el módulo nuevo **"QC Checklist Setup"** de Roles (Add = agregar tareas,
  Edit = renombrarlas y ordenar áreas, Delete = quitarlas), se editan desde el panel. Los cambios son
  del CATÁLOGO (settings_places / settings_tasks): valen para todas las casas.
  · Orden manual: `Place.sortOrder` (sin valor = al final por nombre; `sortPlacesByOrder` en
    utils/qcCatalog.ts). Las flechas intercambian el área con la de al lado visible en esa casa y
    `settingsPlacesService.saveOrder` reescribe solo las posiciones que cambian, en un batch.
  · Quitar = ARCHIVAR (`Task.archived: true`), no borrar: los reportes viejos guardan respuestas por
    id de tarea y el PDF/puntaje necesitan el nombre, por eso `tasks` sigue trayendo las archivadas y
    solo el checklist las filtra (`isActiveTask`; también el checklist de Houses).
  · Reglas propuestas: ese módulo solo puede tocar `sortOrder` de un área y crear / renombrar /
    archivar tareas (no borrar). Pruebas en security/tests (no se corrieron: el emulador no se
    descarga aquí). Las reglas reales de la consola hay que actualizarlas a mano.
  · **Pendiente:** Settings → Places/Tasks todavía escribe con `settingsService` y muestra las tareas
    archivadas como si siguieran; pasar a `settingsPlacesService`/`settingsTasksService` y marcarlas.
- Quality Check Reports (10/2026, pedido de Omar): ya NO es una vista del menú (se quitó
  `qc_reports_table` de App.tsx, Sidebar y viewPrefetch, y se borró QCReportsTableView). Su tabla
  con filtros vive en Quality Check, debajo de Recall: `QcReportsBlock` → `QcReportsSection`.
  · El bloque va CERRADO y monta la sección solo al abrirlo: la sección lee la colección completa
    `qualityChecks` y Quality Check a propósito solo trae los reportes de sus casas
    (useQcForHouses). No dejarlo abierto por defecto.
  · Permiso: el módulo "Quality Check Reports" de Roles sigue y ahora decide si se ve la tabla; sin
    declararlo, la ve quien entra a Quality Check (lo mismo que hacía el menú).
  · Tabla o tarjetas con `useMediaQuery('(max-width: 900px)')` (antes las dos y una escondida).
  · Las clases pasaron de `qcrt-` a `qcrs-`: QCRoutesTableView también usa `qcrt-` y, al cargar los
    dos CSS juntos, se pisaban. La pestaña Rutas pierde reglas que le llegaban "prestadas" del CSS de
    reportes (p. ej. el padding de 24 px y min-height de `.qcrt-page`); se queda con las suyas.
  · Las tarjetas de casa (pendiente / Did Not Pass / Recall) son `QcHouseCard`.
- Houses · status por empresa en el formulario (10/2026, pedido de Omar): el cliente decide la
  empresa (`houseBusiness`: tipo Cavalry → Cavalry; cualquier otro → Normal) y "Status" solo ofrece
  los de esa empresa en su Form Order (`statusesForBusiness` en shared/utils/businesses.ts, el mismo
  que usa el tablero). Sin cliente, los de Normal. Al cambiar de cliente, si el status no es de la
  nueva empresa se pone el primero de esa empresa. Si una casa vieja tiene un status de la otra
  empresa, se sigue mostrando (no se pierde al editar).
- Tipos de cliente: "Commercial" pasó a llamarse "Property manager" (decisión de Omar). Normal =
  Private customer, Residential, Property manager (`NORMAL_CUSTOMER_TYPES`); los clientes viejos con
  "Commercial" siguen siendo Normal y conservan su tipo al editarlos (no se migró nada).
- Pipeline: la tarjeta, la columna, la pastilla de status y el indicador son componentes
  (`PipelineJobCard`, `PipelineColumn`, `PipelineStatusPill`, `PipelineKpiCard` en src/components,
  al lado de PipelineBoardView, decisión de Omar); los mismos para Normal y Cavalry.
- PeriodBar en más pantallas (10/2026, pedido de Omar): Quality Check (casas pendientes y Recall),
  Quality Check Reports, Payroll → Asignar nómina y Payroll → Nóminas. Los filtros de cada pantalla
  van DENTRO de la barra como `children` (fila `.pb-filters`); `allowedKinds` limita los periodos.
  · QC casas: filtra por Schedule Date y arranca en Year (`pc.qc.houses.period`); las casas SIN
    scheduleDate se muestran siempre (si no, una casa sin fecha desaparecería de la inspección).
  · QC Reports: por la fecha de la inspección, arranca en Month (`pc.qc.reports.period`).
  · Asignar nómina: por Schedule Date (`recScheduleTime`), arranca en Year
    (`pc.payroll.assign.period`). Antes, sin fechas, se veía TODO: para ver casas pendientes de un
    año anterior hay que ir al año anterior o usar Custom con las fechas vacías (= sin límite).
  · Nóminas: solo semanas (`allowedKinds={['week']}`), abre en la semana de HOY y no se recuerda
    (antes abría en la semana más reciente con nómina). La key de la semana es `periodRange().start`
    (lunes 00:00 local), el mismo valor que `mondayOf()` da a cada pago: no cambiar uno sin el otro.
    El estado de pago de la semana (Pagado / Pendiente) va como `extra` de la barra.
- CR de tonnydev1801 (10/2026) · status por id-o-nombre en Houses: `utils/relations.ts` tiene
  `normalizeRelationKey` / `matchesRelation` (sin mayúsculas ni espacios de más) y getRelationName /
  getRelationColor los usan. El tablero (`getPropertiesForStatus`), la pastilla, los conteos de
  HouseList (`statusCounts`, tarjetas KPI y del Overview) y el filtro de Status resuelven igual.
  · `statusIndex` (useHouseCatalogs) guarda las claves EXACTAS (HouseForm las busca con `.get`) y
    además las normalizadas; `findStatusInIndex` prueba exacta y luego normalizada. No quitar las
    exactas: los ids de Firestore distinguen mayúsculas.
  · Efecto visible: casas viejas con el status escrito con otras mayúsculas o espacios ("quality
    check ") vuelven a salir en la lista y el tablero (antes HouseList las descartaba).
- PeriodBar · `allowedKinds`: una lista vacía cuenta como "todos"; si el periodo que llega por props
  no está permitido, "Today" lo lleva al de respaldo (Week o el primero que no sea Custom) y en
  desarrollo sale un console.warn; con solo Custom no se muestra "Today".
- Checklist del empleado (ChecklistModal, CR de tonnydev1801, 10/2026): al guardar se escriben SOLO
  las marcas que esta persona cambió (`checked.<tarea>`: true o deleteField(), con FieldPath) y las
  notas si se tocaron. No volver a `updateDoc({ checked: mapaCompleto })`: borraba las marcas que
  otra persona guardó con el modal abierto, o todas si se guardaba antes de que llegara el listener.
  · `useHouseChecklist` devuelve `{ checklist, isLoaded, hasLoadError }`: el botón Guardar queda
    bloqueado hasta `isLoaded` (null también significa "no tiene checklist").
  · Las áreas preseleccionadas salen del checklist en vivo hasta que el empleado toca un chip.
  · Tipos `ChecklistRecord` / `HouseChecklistState` en types/index.ts.
  · **Pendiente:** el modal todavía importa `firebase/firestore` (regla de CLAUDE.md); mover sus
    escrituras a un service de `features/houses/services/`.
- HouseForm (mismo CR): `createdPropertyIdRef` guarda el id de la casa que creó el formulario; si un
  paso posterior falla y se presiona Save otra vez, se actualiza esa casa (antes se creaba otra) y
  sigue contando como alta. Si falla el batch de servicios y pagos, se guarda un borrador con la casa
  tal como quedó (id y fotos subidas) antes de cerrar. El borrador no lleva los borrados pendientes
  (servicesToDelete / payrollsToDelete).
- TaskApproval (CR de tonnydev1801, 10/2026): `onDecideApproval` devuelve Promise<boolean> (TaskListView
  pasa `.ok` de `actions.decide`); "Send changes" solo limpia la nota si se guardó, para no perder
  lo escrito si falla. El aviso del error lo sigue dando `run()` de useTaskActions. `Actor` vive en
  types/userTasks.ts (antes en userTasksService).
- Quality Check · periodo de Pending/Recall (CR de tonnydev1801, 10/2026): se mantiene el filtro por
  Schedule Date (decisión de Omar), pero las casas de la pestaña elegida que quedan FUERA del periodo
  se avisan con `QcOutOfPeriodNotice` ("N casa(s)… fuera de este periodo · Ver todas"; Ver todas =
  Custom sin fechas). No quitar el aviso: "Year" es el año calendario y una pendiente del 28/12 se
  escondía el 2/1 sin decir nada (también si el navegador recordaba "Week").
- Quality Check · "Edit checklist": cada escritura va por `usePendingById` (ids en utils/qcCatalog:
  `CHECKLIST_ORDER_PENDING_ID`, `addTaskPendingId(área)` y el id de la tarea) y su botón se
  deshabilita mientras guarda: un doble toque creaba dos tareas iguales o calculaba dos intercambios
  de orden con la misma lista.
- Sin red con el caché persistente de Firestore (`persistentLocalCache`, 10/2026): las lecturas NO
  fallan (responden desde el caché con `metadata.fromCache`) y las escrituras NO fallan (quedan en
  espera hasta que vuelve la señal). Decisiones:
  · Task list (`useTaskActions.run` y `attach`): sin red no se escribe; avisa "…: sin conexión" y la
    vista conserva lo escrito (antes el botón se quedaba girando sin aviso).
  · `useOpsData`: con `includeMetadataChanges`, una lista vacía que solo viene del caché y sin red es
    error ("Could not load the tasks"), y la tarea del panel que no está en caché es error, no
    "borrada". El error se quita solo al volver la red.
  · Checklist del empleado (`useHouseChecklist`): una respuesta VACÍA del caché no cuenta como
    cargada (si no, se creaba un checklist nuevo que tapaba al anterior). Con el checklist en caché y
    sin red, Guardar deja el cambio en espera (Firestore lo sube solo), avisa y cierra el modal.
  · HouseForm sin red: `addDoc` espera la señal y guarda una sola vez (no se tocó).
- Task list · pestaña "Done" (pedido de Omar, 10/2026): las hechas NO se escuchan en vivo (su historial
  crece sin fin); `userTasksService.getDonePage` las pide por páginas de 20 (status == done, orderBy
  doneAt desc, startAfter) solo con la pestaña abierta (`useDoneTasks`). Pide 3 índices compuestos de
  `user_tasks` (en security/firestore.indexes.json): assigneeUserIds CONTAINS + status + doneAt,
  createdByUserId + status + doneAt y status + doneAt. **Pendiente:** crearlos en la consola de
  Firebase; sin ellos la pestaña dice "Could not load the done tasks" (el link para crearlos sale en
  la consola del navegador). Las tareas viejas de una sola persona (assigneeUserId) o sin doneAt no
  salen. Reabrir una desde el panel vuelve a pedir la primera página.
- Task list · "My projects": los proyectos activos que la persona tiene a cargo Y aquellos donde tiene
  tareas abiertas asignadas o que asignó (decisión de Omar, 10/2026).
- Menú · círculo de "Task List" (`useTaskListBadgeCount` en App.tsx): tareas abiertas asignadas a la
  persona (effectiveUser) + las que esperan su OK, sin repetir. Usa las mismas consultas que la vista
  (el SDK las comparte). Solo si el rol puede ver Task List.
- Task list · pestañas (pedido de Omar, 10/2026; `features/ops/taskListTabs.ts`): Overdue, Daily (las
  que vencen HOY, también las que se repiten), Needs Approval (las que espero aprobar yo + las de la
  lista que esperan un OK: por enviar, enviadas o con cambios), This week, Later, No date, ALL (todas
  las abiertas de la lista por `createdAt` desc) y Done. Las que no tienen tareas no se ven (ALL y Done
  siempre). El orden es uno para todos y lo cambia quien tiene Edit en Task List:
  `app_settings/task_list_tabs` (`taskListTabsService`, `useTaskListTabOrder`; regla en
  security/firestore.rules). **Pendiente:** publicar esa regla en la consola de Firebase; sin ella,
  guardar el orden da "permission-denied" y la lista sigue con el orden de fábrica.
- Task list · diarias: una tarea que se repite ("Every day" / "Every day except") vence el día que
  toca. Al completarla se crea la siguiente con la fecha siguiente y NO sale en las pendientes (ni en
  el círculo del menú ni en Owner/Manager) hasta ese día (`isUpcomingDailyRepeat`); en ALL y en el
  calendario sí. Activar Repeat en una tarea sin fecha le pone hoy.
- Task list · Repeat Sí/No: "Every day except" se guarda como `freq: 'weekly'` con los días que SÍ
  tocan (no se agregó otra frecuencia: así `nextOccurrence` y las versiones viejas de la app siguen
  funcionando). Las viejas 'weekdays' se leen "except Sat, Sun"; las 'monthly' dicen "Every month"
  hasta que alguien las cambie; las viejas con fin (`timesLeft`) siguen contando hasta editarlas
  ("Ends" se quitó de la pantalla).
- Proyectos: "New project" abre solo el formulario (sin la lista) con las tareas que se crean junto con
  el proyecto en UN batch (`userTasksService.createProjectWithTasks`: el proyecto nace con sus
  contadores sumados, sin `increment()`, máx. 50 tareas). Esas tareas van sin fecha. El botón
  "Projects" sigue abriendo la lista (editar, archivar, borrar).
- Proyectos · ventana de tareas (clic en la tarjeta): con Scope "All" escucha `projectId == x &&
  status == open` (solo igualdades, sin índice compuesto); con "Own" las reglas rechazan esa consulta,
  así que muestra las que la persona ya tiene cargadas. Mientras hay una tarea abierta la ventana se
  esconde (el panel de la tarea está debajo de los modales) y vuelve al cerrarla.
- Task list · calendario: tocar un día filtra la lista (tareas cargadas, asignadas y dadas a otros,
  igual que los puntos del calendario, sin importar "Assigned to/by") y los proyectos (con tareas ese
  día o que vencen ese día).
- Task list · orden (pedido de Omar, 10/2026): TODAS las pestañas, la ventana del proyecto y el filtro del
  calendario van con la tarea más reciente arriba (`compareByNewest`: `createdAt` desc, fecha y hora).
  Done va por `doneAt` desc. `compareByDue` queda solo para la "Next" de la tarjeta del proyecto.
- Proyectos · ventana de tareas: muestra TODAS las abiertas del proyecto, también las diarias de otro
  día (si no, un proyecto "4/5 done" decía "no pending tasks").
- Task list · Done por páginas: se ve una página de 20 a la vez (Previous / Next, `useDoneTasks`); las ya
  leídas se guardan para volver atrás sin pedirlas otra vez. Si Firestore rechaza la consulta, la
  pestaña dice el motivo por su `code` (failed-precondition = falta el índice, con el link para
  crearlo; permission-denied = reglas; sin red) y "Try again", en vez de "Check your connection".
- Task list · ALL va SIEMPRE primero (pedido de Omar, 10/2026): `normalizeTabOrder` lo pone al inicio
  aunque el orden guardado diga otra cosa y en la ventana de orden su fila no se mueve.
- Menú contraído: sin el círculo de pendientes de Task List (pedido de Omar).
- Proyectos · permisos: módulo "Projects" en Roles (View = ver "My projects" y la lista, Add = crear,
  Edit = editar/archivar, Delete = borrar). Un rol que NO lo declara lo hereda de Task List (View de
  Task List; Add y Edit = Edit de Task List; Delete = Delete de Task List), igual en la app
  (`taskProjectRights`), en Roles (se muestra lo heredado para que guardar no quite nada) y en las
  reglas (`functions/src/userAccess.ts` arma `m.Projects`). **Pendiente:** desplegar la función que
  arma `user_access` y publicar la regla de `task_projects`; hasta entonces las reglas de la consola
  siguen con las de antes.
- Proyectos · borrar: el bote se ve siempre con Delete. Un proyecto con tareas se borra y sus tareas
  (abiertas y hechas) quedan sin proyecto (`userTasksService.deleteProjectKeepingTasks`, decisión de
  Omar, 10/2026). Necesita Scope "All" (con "Own" las reglas no dejan pedir las tareas de otros).
- Projects (lista): pestañas Active · Done · Archived y botón para ver las tareas de cada proyecto
  (también de los archivados).
- Proyectos · formulario (CR, 10/2026): un proyecto nuevo NO se guarda si alguna tarea escrita no se
  puede crear (sin título o con una persona que ya no está en la lista); se avisa "Task N needs…" (antes
  se descartaba en silencio). Cerrar con la X o tocando fuera pregunta si hay cambios sin guardar
  (Cancel no pregunta: es explícito). El guardado va en try/finally para que el botón no quede
  deshabilitado si onSaveProject lanza.
- Task list · Done (CR, 10/2026): si falla la página siguiente, `useDoneTasks` devuelve `nextPageError`
  y la lista lo muestra bajo la paginación (se sigue viendo la página actual); ya no hay alert.
  `useTopProjectIds` se borró (ninguna pantalla lo usaba desde que salió el top 3).
  **Pendiente de despliegue:** los 3 índices compuestos de `user_tasks` deben estar "Enabled" en la consola
  ANTES de publicar la app con Done (pasos en security/README.md, "Índices: antes de desplegar la app").
- Task list · Done "Assigned by" (CR, 10/2026): `getDonePage('created', …)` deja fuera las que la persona
  se asignó solo a sí misma DENTRO del service y sigue leyendo tandas (máx. `MAX_DONE_BATCHES` = 5 de 21)
  hasta llenar la página de 20; antes se filtraba en la vista y salían páginas de 3 con "Next". No se
  agregó un campo `assignedToOthers` (pediría migrar las tareas viejas y otro índice): si las lecturas
  crecen, esa es la alternativa.
- Task list · si falla solo el listener de aprobaciones, la lista se ve igual y sale el aviso "Could not
  load the tasks waiting for your OK" (antes escondía toda la lista).
- TaskListView se partió (CR): TaskListHeader, AssignmentTabs, hooks useTaskListLabels y
  useOpenedProjectTasks, y opsPermissions.getDefaultApproverUserId.
- Invoices · altura fija en escritorio (10/2026): la tabla tiene `min-height: 320px` (~4 filas entre el
  encabezado y el TOTAL fijos) y la página `overflow-y: auto`. Con `min-height: 0` en una laptop baja o
  con zoom la tabla quedaba de ~50 px y el TOTAL fijo tapaba la única fila. No volver a `min-height: 0`.
  El Overview (`HousesView.css`, `.hv-unified` / `.ujt-scroll`) usa el mismo patrón y puede tener el mismo
  problema; no se tocó.
- Task list · nueva tarea con archivos y comentarios (10/2026): el formulario usa los mismos
  `TaskAttachments` y `TaskComments` que el panel de la tarea, pero en borrador. Los comentarios viajan en
  el MISMO batch de `userTasksService.create` (`initialComments`, con la hora en que se escribieron; el
  autor siempre es quien crea). Los archivos se suben DESPUÉS de crear la tarea (`useTaskActions.add` →
  `attachFiles`): Storage usa `user_tasks/{id}/…` y la regla de update pide la tarea ya creada. Si un
  archivo falla, la tarea queda creada y se avisa. En el formulario "Post" solo agrega al borrador: lo
  escrito sin "Post" no se guarda.
- Task list · Assignee (10/2026): `AssigneePicker` es un campo de búsqueda (chips + texto), ya no un botón
  desplegable. La lista es la de `assignablePeople` (personas que pueden abrir Task List, más uno mismo)
  ordenada de la A a la Z por nombre (`compareByUserName`; "Me" queda en su lugar alfabético) y filtrada
  sin mayúsculas ni acentos (`matchesSearch`). Es `type="text"` a propósito: con `type="search"` Chrome
  borra el texto con Escape y la lista se volvía a abrir. Marcar agrega al final (la primera asignada no
  cambia).
- Task list · CR del formulario de nueva tarea (10/2026):
  - `attachFiles` sube archivo por archivo con su propio try/catch y un solo aviso nombra los que
    fallaron ("2 of 5 files weren't uploaded: …"); sin red no intenta ninguno y los nombra todos. `add`
    sigue devolviendo boolean: el panel se cierra igual, porque dejarlo abierto con "Add task" crearía
    la tarea dos veces. Si se quiere reintentar desde el formulario, hace falta un modo "reintentar
    subida" con el id de la tarea ya creada.
  - `InitialComment` vive en `src/types/userTasks.ts` (no exportado desde el service, como pedía el CR):
    CLAUDE.md manda los tipos a src/types.
  - `normalizeForSearch` usa `/[\u0300-\u036f]/g` escrito con escapes: con los caracteres combinantes
    literales la regex es invisible en el diff.
  - AssigneePicker: `onBlur` del contenedor cierra la lista cuando el foco sale del selector (Tab). La
    lista tiene `tabIndex={-1}` para que tocar una opción no la cierre antes del clic.
- Quality Check · reportes y tarjetas (10/2026): tocar un reporte (fila de la tabla o tarjeta en teléfono)
  abre el detalle de su casa con el host de App (`onOpenHouseDetail`); los clics en sus controles (envíos,
  status) no lo disparan (`isClickOnControl` en qcReports.ts). Si la casa no está cargada (borrada o fuera
  de la ventana de 12 meses) el reporte no se puede tocar. Las tarjetas de Pending / Did Not Pass / Recall
  ya NO tienen Editar ni Eliminar (decisión de Omar): se hacen desde el detalle. Por eso Quality Check ya
  no usa `useHouseTrash` ni recibe `onOpenHouseEdit`.
- Quality Check · notas por área (10/2026): "Notes for the team" (una sola, en `qcData.__general.notes`)
  se cambió por un campo de notas al final de cada área del checklist (`qcData[placeId].notes`, el campo
  que ya leían el PDF y la tabla de reportes). Marcar Fail agrega "Fail <tarea>" al final de la nota del
  área y quitar el Fail quita esa línea, en el handler de la respuesta (`syncFailNoteLine`); lo escrito a
  mano no se toca (si se edita la línea "Fail …", ya no se quita sola). Se quitó la línea automática
  `⚠ Marcado "No": …` que se agregaba AL GUARDAR (habría duplicado); al abrir un QC viejo esa línea se
  convierte en líneas "Fail …" (`qcDataWithFailNotes`). Las "Notes for the team" de reportes viejos siguen
  en el PDF (área General); si el QC que se abre las tiene, el panel las muestra para corregirlas o
  borrarlas (ver "Notes for the team" de QC empezados antes). En el PDF cada área lleva siempre su
  recuadro "Notes" (con "No notes for this area." si está vacío).
- REEMPLAZADA por "Quality Check Reports · sin pestañas" (ya no hay pestañas Invoice / Recall).
  Quality Check Reports · pestañas (10/2026): ya no existe "Quality Checks"; solo Invoice y Recall. La
  pestaña sigue el estado ACTUAL de la casa si está en Recall o Invoice; si está en otro estado (o ya no
  existe) decide el resultado: pasó → Invoice, no pasó → Recall (`getReportTab`, decisión de Omar). En
  Invoice, "Recall" antes del cliente = la casa estuvo alguna vez en Recall (`useRecallHouses`, misma
  fuente y etiqueta `.ujt-recall` que el Overview).
- Detalle de la casa · pestaña "Quality check" (10/2026): `HouseQcHistory` lista los reportes de ESA casa
  con `useQcForHouses([id])` (no la colección completa), del más reciente al más viejo, de solo lectura.
  Las fotos de oficina (`__office`) no salen. La línea vieja `⚠ Marcado "No": …` se muestra como líneas
  "Fail …" (solo al mostrar; el dato no cambia). Se oculta por rol con el elemento `btn_tabQualityCheck`
  (Configurar campos → Tabs), como Financials.
- Recall · una sola regla (10/2026): "la casa estuvo en Recall" = `wasHouseInRecall` (utils/jobRecall.ts):
  su `status_history` entró a un status de Recall (useRecallHouses) o su status actual es Recall. La usan
  la marca "Recall" (shared/components/RecallMark: Invoices, reportes de QC; el Overview y las filas del
  QC Dashboard ya la tenían) y los conteos del QC Dashboard: el KPI "Recalls" y la columna "Recalls" del
  Team Scorecard. Antes contaban solo los trabajos cuyo ÚLTIMO QC falló, y una casa que pasó por Recall y
  luego se re-inspeccionó y pasó no contaba (daba 10 en el año). Un QC fallado que NO movió la casa a
  Recall se muestra como "Did not pass" (antes "Re-clean"), pero no cuenta como Recall.
  `HouseList.wasRecall` repite la regla en línea (podría usar wasHouseInRecall).
- REEMPLAZADA en parte por "Quality Check Reports · casas HOY en Recall": esos reportes ya SÍ salen.
  Quality Check Reports · sin pestañas (10/2026): no salen los reportes de casas que HOY están en Recall
  (ya están en las tarjetas "Casas en Recall"; `isPropertyStatusRecall`). Queda el total y el buscador.
- REEMPLAZADA por "Recalls · UN solo número": la pestaña ya NO filtra por Invoice (el orden del Team
  Scorecard sí sigue). QC Dashboard · pestaña "Recalls" (antes "Re-clean", 10/2026): filtra las casas que YA están en Invoice y
  que alguna vez estuvieron en Recall (`isRowInTab`: `row.recall && row.isInvoice`), pedido de Omar. Por eso
  su número es menor que el KPI "Recalls", que cuenta todos los trabajos que estuvieron en Recall (también
  los que siguen en Recall o en Quality Check). Team Scorecard ordenado por Recalls de mayor a menor (a
  igual número, mejor Avg primero).
- REEMPLAZADA por "Recalls · UN solo número": ya no hay desglose "in invoice · still open" (la marca
  `RecallMark` antes del cliente sigue). QC Dashboard · Recalls (10/2026, revisión): el KPI "Recalls" (todos los trabajos que estuvieron en Recall)
  dice debajo "N in invoice · M still open": N es el número de la pestaña "Recalls" (solo casas ya en
  Invoice) y M los que siguen en Recall o en Quality Check. Así 97 vs 99 no se lee como error. Se quitó el
  "invoices on hold" del KPI (contaba re-cleans, otra cosa). La marca "Recall" va antes del cliente con
  `RecallMark` (como Invoices y reportes); salió de la columna Result y su CSS `.qd-recall`.
- Quality Check Reports · botón "Recalls" (10/2026): junto a "Reports" (todos) filtra solo los reportes de
  casas que estuvieron alguna vez en Recall (misma regla que la marca: `recallHouseIds`). Los dos totales
  salen del periodo y la búsqueda. Es un filtro, no una pestaña por status. (Las casas HOY en Recall ya
  salen en la tabla: ver "Quality Check Reports · casas HOY en Recall".)
- Recalls · UN solo número (10/2026, decisión de Omar; reemplaza las notas anteriores de "Recalls" del QC
  Dashboard): Recalls = todos los trabajos del periodo que estuvieron en Recall (`wasHouseInRecall`), ya
  facturados o todavía abiertos. La tarjeta "Recalls", la pestaña "Recalls" y la suma de la columna del
  Team Scorecard salen de la misma regla (`isRowInTab(row, 'recall')`) y dan el mismo número. Ya no se
  filtra la pestaña por "en Invoice" ni se desglosa "in invoice · still open".
  En Quality Check Reports el botón "Recalls" cuenta CASAS (no reportes) entre las que tienen reporte
  terminado en el periodo; es menor que el del Dashboard porque un trabajo sin reporte terminado no puede
  salir en esa tabla (las casas hoy en Recall ya cuentan: ver "Quality Check Reports · casas HOY en Recall").
- Task list · nueva tarea sin Assignee por defecto (10/2026, pedido de Omar): el panel abre sin nadie
  marcado (antes la persona que se estaba mirando). "Add task" sin Assignee muestra "Choose who will do
  this task." y no guarda. `TaskListView` ya no calcula `newTaskAssignee`.
- Task list · Assignee obligatorio (CR, 10/2026): `userTasksService.assertValidTaskFields` rechaza
  `assignees: []` (en create, createProjectWithTasks y update): una tarea sin asignados no sale en la lista
  de nadie porque las consultas filtran por `assigneeUserIds`. En el panel el aviso se calcula
  (`hasTriedToCreate && draft.assignees.length === 0`) y usa `.task-panel-error` (TaskPanel.css).
- Quality Check · error de lectura en `useQcForHouses` (CR, 10/2026): el hook devuelve `{ data, loaded,
  error }` como los de useOpsData. `error` sale si el listener falla (permisos, red) o si Firestore responde
  vacío desde la caché sin conexión (`includeMetadataChanges` + `isOfflineCacheOnly`): sin eso el esqueleto
  de la pestaña "Quality check" de la casa se quedaba para siempre o decía "no inspections" sin serlo. Con
  reportes en caché y sin conexión se muestran los de la caché, sin error. QualityCheckView (inspector) aún
  ignora `error`.
- Quality Check · insignias de resultado compartidas (CR, 10/2026): Passed / Did Not Pass viven en
  `qcReports.ts` (`PASSED_BADGE`, `FAILED_BADGE`, `getFinishedResultBadge`; tipo `QcResultBadge`) y las usan
  QcReportCard y HouseQcReportItem (este agrega "In progress"). Colores por `--badge-bg` / `--badge-fg`.
  La fecha de "Corrections done" va con `formatDate(report.correctionsDoneAt)`: cortar el ISO en la "T"
  mostraba el día UTC (desde las 7 p. m. de Texas, el día siguiente).
- Quality Check · nota del área con `renderSectionNotes` (CR, 10/2026): el campo vive en `QcSectionNotes` y
  QualityCheckView lo arma como las fotos (`renderSectionPhotos`). QcCheckDrawer y QcChecklist ya no
  reciben `sectionNotes` / `onSectionNotesChange`: solo pasan la función.
- Quality Check Reports · botón "Recalls" dice la unidad (CR, 10/2026, decisión de Omar: seguir contando
  casas): "7 houses" / "1 house", con title que explica que una casa con varias inspecciones sale en varias
  filas. "Reports" sigue contando reportes. La marca Recall de cada fila usa `wasHouseInRecall` de
  utils/jobRecall (misma regla que el QC Dashboard e Invoices).
- Recall · UNA regla para "la casa está HOY en Recall" (CR, 10/2026): `isPropertyStatusRecall(property,
  statuses)` en utils/recallStatus.ts (con `isRecallText`: también "Re-clean", "Callback"…). La usan las
  tarjetas "Casas en Recall" de QualityCheckView y la tabla de Quality Check Reports (antes
  `isHouseInRecall` con `isRecallName`, que solo buscaba "recall": una casa en "Re-clean" salía en las
  tarjetas Y en la tabla). `wasHouseInRecall` ya usaba `isRecallText`.
- Quality Check · líneas "Fail …" en el orden del checklist (CR, 10/2026): `getFailedTaskNames` (qcForm.ts)
  recorre `taskNameById` (orden del catálogo de tareas), no `Object.entries` de las respuestas. Dos tareas
  con el mismo nombre en un área comparten una línea (documentado en `syncFailNoteLine`).
- Quality Check · `damage` de reportes viejos (CR, 10/2026): el formulario ya no lo escribe, pero
  `getReportAreas` lo suma a la nota del área como "Damage: …" (igual que el PDF) para que la pestaña
  "Quality check" de la casa no lo pierda.
- Quality Check · "Notes for the team" de QC empezados antes de las notas por área (CR, 10/2026): si el QC
  que se abre trae `qcData.__general.notes`, el panel muestra ese campo debajo de "Other photos" (con
  `QcSectionNotes`, área General) para verlas, corregirlas o borrarlas: siguen saliendo en el PDF.
  `hasLegacyTeamNotes` se decide AL ABRIR (no por el texto actual), así el campo no desaparece mientras se
  borra. Un QC nuevo nunca lo muestra.
- QC Dashboard · "Did not pass" (CR, 10/2026): el resultado de un QC fallado (`RESULT_LABEL.reclean`), el
  seguimiento y el encabezado de cada grupo de fechas dicen "Did not pass" (como los reportes), no
  "Re-clean": "Recalls" es la casa que estuvo en el status Recall, otra métrica. La clave interna sigue
  siendo `reclean`.
- `useRecallHouses` devuelve `{ recallHouseIds, isLoaded, error }` (CR, 10/2026): si la historia o
  `recalls` falla se usa lo que sí se leyó y se avisa en `error` (antes se tragaba el error).
- Sin conexión FALSO (10/2026): `navigator.onLine === false` a veces miente (VPN o adaptadores virtuales, al
  despertar la computadora, al volver a la app en el teléfono) y la app no guardaba con "…: sin conexión"
  teniendo internet. `isDeviceOffline()` (src/shared/utils/connectivity.ts) lo confirma con un HEAD a
  `/version.json?probe=…` (no-store, tope 3 s): cualquier respuesta = hay conexión. Lo usan el Task list
  (`useTaskActions.run` y adjuntos, `useDoneTasks`), la cola de fotos de la casa (`usePhotoQueue`), las fotos
  y el aviso de Quality Check (`QualityCheckView`) y el checklist del empleado (`ChecklistModal`). No vuelvas a
  decidir un guardado con `navigator.onLine` solo. Los avisos de lectura (`isOfflineCacheOnly`) siguen con
  `navigator.onLine` porque además piden `metadata.fromCache`: al llegar datos del servidor se quitan solos.
- Aviso "Sin conexión" confirmado (CR, 10/2026): `useConnectivityStatus()` (src/shared/hooks) escucha online /
  offline y confirma con `isDeviceOffline()` antes de mostrar el aviso (y cada 30 s mientras el navegador diga
  "sin conexión"). Lo usan el aviso de Quality Check y el de Houses (`usePhotoQueue.isOnline` → HouseList).
  Antes salía "Sin conexión" con las fotos y el QC guardándose bien, y el inspector podía repetir el trabajo.
- Fotos de Houses · error al subir (CR, 10/2026): se encola solo si el código es de conexión
  (`storage/retry-limit-exceeded`, `storage/canceled`) o `isDeviceOffline()` lo confirma. Ya no con
  `!navigator.onLine` solo: con el "sin conexión" falso un error permanente (reglas de Storage) volvía a
  encolarse en silencio, el bug que ese bloque corrigió.
- Conexión · CR del hook y de la consulta (10/2026): `useConnectivityStatus` numera cada revisión y solo la
  más reciente cambia el aviso (una revisión vieja "sin conexión" que terminaba después de una nueva "hay
  conexión" dejaba el aviso pegado); la revisión cada 30 s corre si el navegador dice "sin conexión" O el
  aviso está puesto. `isDeviceOffline` reusa la consulta de los últimos 5 s (`PROBE_RESULT_TTL_MS`, también
  la que sigue en camino): la cola de fotos revisa antes de cada foto. Límite conocido: el portal de un wifi
  (hoteles, edificios) cuenta como "hay conexión".
- Quality Check Reports · casas HOY en Recall (10/2026, decisión de Omar; reemplaza "no salen los reportes de
  casas que HOY están en Recall"): sus reportes terminados SÍ salen en la tabla, además de las tarjetas "Casas
  en Recall" de arriba, con la marca Recall y su status (RECALL). Cuentan en "Reports" y en el botón
  "Recalls". Una casa en Recall sin reporte terminado solo sale en las tarjetas (la tabla lista reportes).
- Detalle de la casa · pestaña "Quality check" con PDF (10/2026, pedido de Omar): cada reporte TERMINADO lleva
  el botón "PDF" (el mismo de Quality Check Reports: `useQcReportActions.handleExportPdf`, clase
  `.qcrs-pdf-btn`). Uno en curso no lo lleva (todavía no tiene resultado). `HouseQcHistory` recibe la casa
  (`house`, antes `houseId`) para el equipo del PDF cuando el reporte no lo trae.
- Quality Check · `QcPdfButton` (CR, 10/2026): un solo botón de PDF (features/quality-check/components, con
  su CSS) para la tabla y las tarjetas de Quality Check Reports (`QcReportSendButtons`) y la pestaña
  "Quality check" de la casa; variantes `icon` / `compact` / `full`, textos "View report as PDF".
- Detalle de la casa · pestaña "Quality check" (decisión de Omar, 10/2026): se ve solo con View en el módulo
  "Quality Check" (Roles) Y el tab activo en Configure Fields (`useHouseAccess.canSeeQualityCheckTab`, doble
  candado como las notas de oficina). Antes la veía todo rol salvo que se ocultara por rol.
- Props de la pestaña (CR, 10/2026): `HouseQcHistory` recibe `house` (no `property`) por consistencia con
  `selectedHouse` de HouseDetail y el nombre del archivo. Unificar "house" / "property" en toda la app es un
  cambio aparte (renombra archivos): pendiente de decidir.
- Pipeline → Excel (10/2026, pedido de Omar): botón "Excel" en el Pipeline (solo con el grupo Financial) abre
  `OperationsSheetDialog`: exporta la hoja "Daily Operations" del periodo (default Month) y compara un Excel
  subido. MATCH por calle (número + primera palabra: "401 twin") + misma fecha; entre varios trabajos de la
  misma calle y día (Twin Creek) gana unidad / Service Price / Payroll / cliente / nota; lo que sobra se
  intenta ±7 días ("Different date"). Regla de impuesto = la de la app (Final Cost = Price − 8.25%, exento = 0;
  decisión de Omar): las filas de la hoja que SUMAN el impuesto salen como diferencia "Excel adds the tax".
  OJO hoja de October: 145 filas con `IF(...,F+G,F+G)` (suma el impuesto siempre). Export: fórmulas propias
  (Taxes, Final Cost, Profit, Margin, WEEKNUM), NO el XLOOKUP a la pestaña Customers (no viene en el archivo
  → #REF!). Notes = notas de oficina solo si el rol puede verlas. exceljs y xlsx se cargan solo al usarse;
  las listas de Invoice/Drip pans van por RANGO (`dataValidations.add`): por celda exceljs arma rangos
  encimados. Pendiente: QC Status, Recall Completed, Move in, Number of Days y Drip pans salen vacíos (la app
  no guarda esos datos); exceljs (~270 kB gzip) entra al precache del Service Worker como xlsx.
- Finanzas por trabajo = fórmulas de la hoja (10/2026, decisión de Omar; REEMPLAZA "regla de impuesto = la de
  la app" de la nota Pipeline → Excel): Service Price = suma de los servicios SIN impuesto (`subtotal`, o
  cantidad × precio; registros sin ninguno: su `total`), Taxes = Price × 8.25% (0 si `taxExempt`), Final Cost =
  Price + Taxes con Apply Tax = Yes del servicio, Price − Taxes con No (si mezcla: suma lo de Yes y resta lo
  de No). Antes el Price salía del `total` del servicio, que YA trae el impuesto: se cobraba el 8.25% dos
  veces ($100 → Final $99.32 en vez de $108.25). No volver a usar `total` como precio. Cambian a la vez
  Invoices, Overview, Owner/Manager, Payroll, Clients Report y Pipeline → Excel (todos usan useJobFinancials).
- Pipeline → Excel · CR del PR #25 (10/2026): el Excel subido lo guarda HouseList (`uploadedOperationsSheet`), no
  el diálogo: "Open" cierra el diálogo para mostrar el detalle y, al volver, sigue el mismo archivo (no pasar
  el estado de vuelta al diálogo). El botón tiene su propio elemento "btn_operationsSheet" en Configure Fields
  (además del grupo Financial); por defecto se ve. Su clase es la compartida del header, `.hv-btn-header` (antes
  `.hv-btn-history`, la de "Mi historial"). Los filtros de la comparación son botones con `aria-pressed` (no
  hay paneles: no usar role="tablist"). El diálogo cierra con Escape y devuelve el foco al botón Excel.
- Profit sin impuesto (CR 2 del PR #25, decisión de Omar 10/2026; CAMBIA la regla de la nota "Finanzas por
  trabajo"): Profit = Final Cost sin el impuesto que se SUMA (Apply Tax = Yes) − Payroll; el impuesto es del
  estado, no ganancia ($100 Yes, Payroll $50 → Profit $50, antes $58.25). Con No el impuesto ya se restó y queda
  Final Cost − Payroll. Margin sigue siendo Profit / Final Cost (como la columna K). La hoja de la oficina usa
  J = H − I: el Excel exportado pone H−G−I en las filas Yes y H−I en las No (mixtas: el valor). Cambia Profit y
  Margin en Invoices, Overview, Owner/Manager y el Excel. `isSameAmount` (menos de un centavo) vive en
  utils/jobFinancials.ts y lo usan la comparación y la exportación. Lectura del Excel: la coma es decimal solo
  con 1–2 dígitos al final ("$1,234" = 1234) y la fecha con hora toma el día (Math.floor, no round).
