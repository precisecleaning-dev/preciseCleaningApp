# Guía del código — Precise Cleaning Services App

Actualizada el 10/15/2026, al cerrar la optimización de velocidad (rama `rendimiento`).
Las referencias `archivo:línea` son de esa versión: si el código cambia, pueden moverse unas líneas.

## 1. La app en un minuto

**Qué hace.** Es la herramienta interna de Precise Cleaning, una empresa de limpieza residencial en Killeen, TX.
Sigue cada casa (un trabajo de limpieza) desde que entra hasta que se cobra y se paga al equipo:

- Programar trabajos y asignar equipos: Overview (Houses), Pipeline y Calendar.
- Revisar la calidad: Quality Check, rutas de inspección y reportes con PDF.
- Facturar (Invoices) y pagar al personal (Payroll).
- Tableros del dueño y del gerente (Owner, Manager) y tareas internas (Task list).
- Administración: catálogos (Settings), clientes, usuarios, roles con permisos por módulo, bitácora, papelera e importación de datos.

**Para quién.** Dueño, gerentes de operaciones, inspectores de calidad, oficina (facturas y nómina) y equipos de limpieza.
La oficina la usa en escritorio. En campo se usa en el teléfono, instalada como app (PWA).

**Con qué.**

- Frontend: React 19 y TypeScript 5.9, compilados con Vite 7.
- Firebase 12:
  - Auth para el login.
  - Firestore como base de datos, con caché en el teléfono.
  - Storage para las fotos.
  - Cloud Functions para Google Calendar, los correos y los permisos.
- PWA con `vite-plugin-pwa`.
- Hosting en Cloudflare Workers.
- Solo 7 dependencias de producción (`package.json:13-21`): firebase, react, react-dom, lucide-react (íconos), html2pdf.js (PDF), xlsx (Excel) y papaparse (CSV).

## 2. Mapa del proyecto

```
.
├── index.html              Página de arranque; pinta el esqueleto si hay sesión guardada
├── vite.config.ts          Build, número de versión, chunks y PWA
├── wrangler.jsonc          Hosting en Cloudflare Workers (sube ./dist)
├── firebase.json           Cloud Functions y emulador de Firestore (no publica reglas)
├── app-version.json        Contador de builds; sube solo en cada build
├── CLAUDE.md               Reglas y convenciones del repo
├── code-notes.md           Bitácora de decisiones, la más reciente arriba
├── public/                 _headers (caché en Cloudflare) y archivos estáticos
├── security/               Reglas por rol, índices y sus pruebas (propuesta, sin publicar)
├── functions/              Cloud Functions (Node 22): Calendar, correos y espejo de permisos
├── docs/                   Esta guía
└── src/
    ├── main.tsx            Monta React
    ├── App.tsx             Sesión, permisos, pestaña activa y carga de casas
    ├── config/             Firebase (app, Auth, Firestore); Storage y Functions bajo demanda
    ├── lib/firebase/       Nombres de colecciones (COLLECTIONS) y conversores tipados
    ├── services/           Un service por colección: lee y escribe en Firestore
    ├── shared/data/        Listeners compartidos, ventana de casas, escrituras por lotes
    ├── shared/hooks/       Hooks comunes: media query, guardado por fila, listas por ventana
    ├── shared/components/  Componentes comunes: DateInput, MenuButton, VirtualItems…
    ├── shared/utils/       Caché en memoria con vencimiento
    ├── features/houses/    Casas: lista, detalle, formulario, modales, hooks y services
    ├── features/ops/       Task list: tareas, proyectos, prioridades y permisos
    ├── features/quality-check/  Formulario de QC, reportes por casa y rutas
    ├── views/              Pantallas de primer nivel (se bajan solo al abrirlas)
    ├── views/admin/        Roles y usuarios
    ├── views/auth/         Login
    ├── components/         UI compartida: menú, esqueletos, tabla de trabajos, KPIs…
    ├── hooks/              Aviso de versión nueva
    ├── utils/              Cálculos y formatos: fechas, dinero, QC, periodos, precarga de vistas
    ├── types/              Tipos de los documentos de Firestore
    └── styles/             Tokens de diseño (colores, espacios) y utilidades
```

## 3. Cómo funciona por dentro

Así es el recorrido desde que alguien abre la app hasta que ve sus datos.

```
index.html ──► JS de arranque ──► Auth valida la sesión ──┬─► perfil (system_users)
(esqueleto)    (react, firebase,                          └─► roles (settings_roles) ──► menú y permisos
                index)                                                                      │
pestaña activa ──► código de la vista (lazy) ──► casas (ventana de 12 meses) + catálogos ──► datos
```

1. **El navegador baja `index.html`.**
   - Si hay una sesión guardada (`firebase:authUser:` en localStorage), un script en línea pinta al instante la barra del menú y el esqueleto de la pantalla (`index.html:73-91`).
   - La fuente de Google no frena ese pintado (`index.html:20`).
   - La conexión con Firebase se abre por adelantado con los preconnect (`index.html:10-13`).
2. **Baja el JS de arranque, unos 206 KB comprimidos.** Son tres archivos: `react`, `firebase` e `index` (la app). Los separa `vite.config.ts:45-49`.
   - `main.tsx` monta React (`src/main.tsx:44-48`).
   - Si un deploy dejó un archivo viejo, la página se recarga una vez (`src/main.tsx:25-36`).
3. **Arranca Firebase** (`src/config/firebase.ts`).
   - Firestore usa una caché persistente en el disco del navegador, compartida entre pestañas (`:29-34`).
   - Auth arranca con IndexedDB y, como respaldo, localStorage (`:45-47`). Después `src/App.tsx:174-178` fija localStorage, que es donde mira `index.html`.
4. **`App.tsx` elige la pestaña.** Es la última que se usó (`src/App.tsx:83-97`). El código de esa pantalla empieza a bajar enseguida (`:102-106`).
5. **Sesión.** Firebase valida la sesión guardada con su servidor y avisa con `onAuthStateChanged` (`src/App.tsx:227`).
   - Mientras tanto se queda el esqueleto (`:431-433`).
   - Si no hay sesión, aparece el login (`:435-437`).
6. **Perfil y rol, en paralelo.**
   - El perfil se busca en `system_users` por email (`:243-255`).
   - Los roles llegan del store compartido (`:183`).
   - Con los dos se dibujan el menú y los permisos (`:416`, `:439`).
7. **Casas, solo si la pantalla las usa.**
   - Las pestañas de `TABS_WITH_PROPERTIES` (`:74-77`) abren el listener de casas la primera vez que se visitan (`:199-200`, `:203-220`).
   - Ese listener lee la ventana de 12 meses con cuatro consultas (`src/shared/data/propertiesWindow.ts:116-121`).
   - Hasta su primera respuesta, la pantalla muestra su esqueleto (`src/App.tsx:417`, `:496`).
8. **Cada pantalla carga lo suyo.**
   - Pide catálogos y colecciones con `useLiveData('…')` (`src/shared/data/liveCollections.ts:212`).
   - Hay un solo listener por colección para toda la app. Sigue abierto 15 min después de que nadie lo usa (`:35`, `:166-177`).
   - Gracias a la caché, la primera respuesta sale del disco, sin esperar a la red.
9. **En reposo se precargan las 7 pantallas más usadas.**
   - Bajan una por una (`src/App.tsx:401-409`, `src/utils/viewPrefetch.ts:65-73`).
   - Con ahorro de datos o red 2G no se precarga nada (`viewPrefetch.ts:110-111`).
   - Cualquier pantalla se precarga también al pasar el mouse por su botón del menú o al tocarlo (`viewPrefetch.ts:158-161`).
10. **Escrituras.**
    - Casi todas pasan por el service de su colección (`src/services/`, `src/features/*/services/`).
    - Payroll y Manager todavía escriben directo en algunos puntos (`src/views/PayrollView.tsx:569`, `src/views/ManagerView.tsx:127`).
    - Lo que debe cambiar junto va en un solo lote (`src/shared/data/batchWrites.ts:68`). Por ejemplo, el estado de una casa y su historial (`src/features/houses/services/houseStatus.ts:159-171`).
    - Firestore muestra el cambio en pantalla al instante y lo sube a su servidor después.

**El Service Worker (PWA)** lo genera `vite-plugin-pwa` (`vite.config.ts:66-67`).

- La página se pide primero a la red. Sin red, usa la copia guardada (`vite.config.ts:100-111`).
- Cada 4 minutos la app revisa si hay una versión nueva y, si la hay, muestra un aviso (`src/hooks/useVersionCheck.ts:50-76`).

## 4. Los datos en Firestore

Firestore guarda documentos (fichas) dentro de colecciones.

- La lista oficial de nombres de colecciones está en `src/lib/firebase/collections.ts:8-49`. Todavía hay archivos que escriben el nombre a mano, por ejemplo `src/App.tsx:243`.
- Los tipos principales están en `src/types/`. Los demás viven junto a su service o hook (columna "Tipo").

| Colección | Qué guarda | Campos clave | Tipo |
|---|---|---|---|
| `properties` | Casas (trabajos) | `statusId`, `client`, `teamId`, `serviceId`, `assignedWorkers`, `scheduleDate`, `invoiceStatus` | `src/types/index.ts:64` |
| `billing_services` | Servicios cobrados de cada casa | `propertyId`, `serviceId`, `quantity`, `price`, `total` | `src/features/houses/serviceRecords.ts:6` |
| `payroll` | Pagos al personal por casa | `propertyId`, `employeeId`, `date`, `totalAmount`, `status` (Pending/Paid) | `src/types/index.ts:218` |
| `quality_checks` | Reportes de QC | `houseId`, `date`, `status`, `result`, `passRate`, `qcData` (por área) | `src/types/index.ts:255` |
| `status_history` | Cada cambio de estado de una casa | `propertyId`, estado anterior y nuevo, `changedAt` | `src/services/statusHistoryService.ts:4` |
| `user_tasks` | Tareas internas | `assigneeUserId`, `projectId`, `status`, `dueDate`, `approval` | `src/types/userTasks.ts:67` |
| `task_projects` | Proyectos de tareas | `ownerUserId`, `taskCount`, `doneCount`, `openMinutes` | `src/types/taskProjects.ts:17` |
| `system_users` | Usuarios | `email`, `roleId`, `status`, `teamId` | `src/types/index.ts:24` |
| `settings_roles` | Roles y permisos por módulo | `permissions[]`: ver, agregar, editar, borrar y alcance | `src/types/index.ts:17` |
| `settings_*` | Catálogos: estados, equipos, servicios, prioridades, impuestos, áreas… | `name` y campos propios | `src/types/index.ts:168-212` |
| `customers` | Clientes | `name`, `applyTax` | `src/types/index.ts:181` |
| `qc_routes` | Rutas de inspección | `stops[]`, posición en vivo | `src/features/quality-check/services/qcRoutes.ts:23` |
| `damages`, `checklists` | Daños y checklist por casa | `houseId` | `src/features/houses/hooks/useHouseDamages.ts:14` |
| `activity_logs` | Bitácora de cambios | `ts`, `userId`, `action`, `changes` | `src/services/activityLogService.ts:36` |
| `trash` | Papelera: copia completa de lo borrado | `targetLabel`, `deletedAt` | `src/services/trashService.ts:43` |
| `time_clock` | Entrada y salida del gerente | `userId`, `inAt`, `outAt` | `src/services/timeClockService.ts:10` |
| `user_access` | Copia de permisos para las reglas; solo la escriben Cloud Functions | `m` (permisos por módulo) | `functions/src/userAccess.ts:72` |
| `mail` | Cola de correos; los envía una Cloud Function | `to`, `message` | `src/utils/sendMail.ts:56` |

**Cómo se relacionan**

```
customers ◄──────────── properties.client
settings_statuses/teams/services/priorities ◄── properties.statusId / teamId / serviceId / priorityId
properties ◄── billing_services.propertyId
           ◄── payroll.propertyId ─────────► system_users (employeeId)
           ◄── quality_checks.houseId ─────► system_users (inspectorId)
           ◄── status_history.propertyId, damages.houseId, checklists.houseId
system_users.roleId ──► settings_roles
user_tasks.projectId ──► task_projects      user_tasks.assigneeUserId ──► system_users
```

Ojo: `properties.client` puede guardar tres cosas: el id del cliente, un id viejo de AppSheet o el nombre. Lo resuelve `src/utils/customerDocs.ts:40-82`.

**Qué está desnormalizado (copiado) y por qué**

- **Nombres de usuario y de proyecto en las tareas** (`assigneeUserName`, `projectTitle`, `createdByUserName`: `src/types/userTasks.ts:71`, `:77`, `:86`). La lista se pinta sin buscar a cada usuario.
- **Contadores del proyecto** (`taskCount`, `doneCount`, `openMinutes`). Suben y bajan con `increment()` en el mismo lote que la tarea (`src/services/taskProjectsService.ts:64-75`).
- **Totales de cada servicio y de cada pago.** Se calculan al guardar (`src/features/houses/serviceRecords.ts:30-51`, `src/features/houses/payrollRecords.ts:34-35`). Así el importe de un servicio queda congelado aunque cambie el catálogo.
- **Nombres en el historial de estados, la bitácora y la papelera** (`src/features/houses/services/houseStatus.ts:92-95`, `src/services/activityLogService.ts:49-50`, `src/features/houses/services/houseTrash.ts:30`). Se leen sin abrir otro documento y siguen legibles aunque el original se borre.
- **Fecha de envío a facturar** (`sentToInvoiceAt`, `src/types/index.ts:124-128`). Ordena la pantalla de Invoices.
- **Lo que no está copiado y hoy cuesta lecturas:** el total cobrado, el total pagado y el último QC de cada casa. Para mostrarlos, Overview y Owner/Manager leen tres colecciones completas (servicios, pagos y QC). Invoices lee dos (servicios y pagos). Ver la propuesta A en la sección 6.

**Índices**

- `security/firestore.indexes.json` declara 3 índices compuestos. Los tres son de la bitácora: filtrar por usuario o por acción y ordenar por fecha (`src/services/activityLogService.ts:152-178`).
- Todo lo demás usa a propósito índices de un solo campo, que Firestore crea solo. Por ejemplo, la ventana de casas usa cuatro consultas simples en vez de un `or()` (`src/shared/data/propertiesWindow.ts:17-22`).

**Reglas de seguridad**

- Las reglas publicadas hoy se administran en la consola de Firebase.
- La propuesta por rol está lista en `security/`:
  - las reglas (`security/firestore.rules`);
  - el espejo de permisos `user_access`, que mantienen las Cloud Functions (`functions/src/userAccess.ts`);
  - las pruebas (`npm run test:rules`).
- Cómo publicarla, paso a paso: `security/README.md:119-138`.

**Volumen de prueba.** Las cifras de esta guía se calcularon con este volumen:

- 3,600 casas dentro de la ventana de 12 meses;
- 5,400 servicios cobrados;
- 5,400 pagos;
- 2,000 reportes de QC;
- unos 400 documentos de catálogos y usuarios.

## 5. Recorrido por cada pantalla crítica

Cómo leer las cifras de esta sección:

- **"Lecturas"** son los documentos que Firestore cobra cuando esa pantalla es la primera que se abre en una sesión nueva (o tras más de 30 min sin conexión), con el volumen de prueba.
- Las colecciones ya abiertas por otra pantalla no se vuelven a cobrar en la misma sesión.
- Los tiempos están en la tabla de la sección 6.

### Overview (Houses) y Pipeline

**Archivos**

- Orquestador: `src/views/HousesView.tsx:55`.
- Página: `src/features/houses/components/HouseList.tsx:91`.
- Tabla: `src/components/UnifiedJobsTable.tsx:64`.
- Tarjetas en el teléfono: `src/features/houses/components/JobCard.tsx:32`.
- Tablero de Pipeline: `src/components/PipelineBoardView.tsx:76`.
- Detalle de la casa: `src/features/houses/components/HouseDetail.tsx:83`.
- Formulario: `src/features/houses/components/HouseForm.tsx:189`.

**Datos**

- Casas: las recibe de `App.tsx`.
- Catálogos: `useHouseCatalogs` (`src/features/houses/hooks/useHouseCatalogs.ts:13-23`).
- Dinero por casa: `useJobFinancials`, que lee `billing_services` y `payroll` completas (`src/utils/jobFinancials.ts:61-62`).
- Último QC: `useQcRecords` (`src/utils/jobQuality.ts:27`).
- Recalls: `getDocs` con caché de 5 min (`src/utils/jobRecall.ts:46-51`, `:72-76`).
- El tablero de Pipeline no abre ni dinero, ni QC, ni recalls (`HouseList.tsx:300-305`).

**Lecturas:** ~16,800.

- 3,600 casas;
- 5,400 servicios;
- 5,400 pagos;
- 2,000 QC;
- ~400 de catálogos.

**Decisiones**

- **Lista por ventana.** Grupos, filas y "Show more" van en una sola lista (`UnifiedJobsTable.tsx:82-95`), dibujada con `VirtualItems` (`:277`). En el teléfono se hace igual con las tarjetas (`HouseList.tsx:935`).
- **Tabla o tarjetas, nunca las dos** (`HouseList.tsx:550`, `:903`).
- **Periodo.** Day, Week, Month, Year o Custom. Se recuerda en el navegador y por defecto es Week (`HouseList.tsx:291-299`).
- **Cálculos memoizados**, es decir, guardados hasta que cambian los datos:
  - casas por permiso (`HouseList.tsx:155-190`);
  - casas por periodo (`:307-337`);
  - grupos (`:339-360`);
  - clave de orden calculada una vez por casa (`:62-68`).
- **Búsqueda sin trabar la escritura:** `useDeferredValue` (`HouseList.tsx:114`).
- **Guardado por fila.** Al editar Team en línea solo se marca esa fila como pendiente (`HouseList.tsx:118`, `src/shared/hooks/usePendingById.ts:9-29`).
- **El detalle y el formulario leen la casa viva**, no una copia congelada (`HousesView.tsx:74-75`). Sus servicios y pagos se piden solo mientras están abiertos, filtrados por `propertyId` (`src/features/houses/hooks/useLiveHouse.ts:80`, `:85`).

**Escrituras**

- **Cambio de estado.** Un lote con la casa y su historial (`houseStatus.ts:159-171`), más la bitácora.
- **Formulario.**
  - Primero valida los campos obligatorios (`HouseForm.tsx:474-494`).
  - Al editar, guarda solo lo que cambió (`:616-637`).
- **Borrar.** Mueve la casa y sus pagos y servicios a la papelera en un solo lote (`houseTrash.ts:48-93`).

### Owner y Manager

**Archivos:**

- Vistas: `src/views/OwnerView.tsx:53` y `src/views/ManagerView.tsx:58`.
- Datos: `src/utils/homeData.ts:100` (`useHomeData`).
- Tareas: `src/features/ops/hooks/useHomeTasks.ts:13`.

**Datos**

- Casas (Manager solo ve las de su alcance, `src/App.tsx:615`).
- Catálogos y QC completo (`homeData.ts:102-110`).
- Dinero: `useJobFinancials` (`homeData.ts:114`).
- Reloj de la semana: `time_clock` desde el lunes (`src/services/timeClockService.ts:29`).
- Tareas abiertas: `user_tasks` filtradas (`src/features/ops/hooks/useOpsData.ts:36-38`).

**Lecturas:** ~16,900. Es lo mismo que Overview, más el reloj y las tareas.

**Decisiones**

- Las reglas del negocio son código simple:
  - trabajos de hoy (`homeData.ts:170-179`);
  - casas esperando QC (`:183-203`);
  - recalls (`:206-242`);
  - facturas sin cobrar (`:245-257`).
- Owner calcula sus KPIs una vez por cambio de datos (`OwnerView.tsx:81-101`). Muestra "…" mientras llega el dinero (`:254`).
- Manager marca como ocupado solo el trabajo que está guardando (`ManagerView.tsx:64`).

**Escrituras**

- **Completar tarea:** igual que en Task list.
- **Manager:**
  - marcar entrada y salida (`ManagerView.tsx:77-87`);
  - asignar equipo (`:104-119`);
  - "Pass" rápido de QC (`:122-151`).

### Task list

**Archivos:**

- Vista: `src/features/ops/TaskListView.tsx:50`.
- Datos: `src/features/ops/hooks/useOpsData.ts`.
- Acciones: `src/features/ops/hooks/useTaskActions.ts:25`.
- Permisos: `src/features/ops/opsPermissions.ts:27-87`.

**Datos**

- Del store: usuarios, roles, prioridades, equipos y proyectos (`TaskListView.tsx:51-55`).
- De `user_tasks`, solo consultas filtradas:
  - abiertas de una persona (`useOpsData.ts:36-38`);
  - creadas por alguien;
  - cola de aprobación (`:67`).
- Prioridades del usuario: un documento (`:94-95`).
- **No usa casas.**

**Lecturas:** ~100. Antes eran ~3,700, porque al iniciar sesión se abría el listener de casas en cualquier pantalla. Ahora se abre solo en las que lo usan (`src/App.tsx:196-200`).

**Decisiones**

- Una tarea que pide visto bueno no se completa hasta que se aprueba (`useTaskActions.ts:69-77`).
- Hay protección contra doble clic (`:37-55`).
- "Deshacer" dura 6 s (`:12`).
- El alcance (yo o todos) sale del rol (`TaskListView.tsx:59-63`).

**Escrituras**

- Crear, editar, completar y reabrir van en un lote junto con los contadores del proyecto (`src/services/userTasksService.ts:146-244`).
- Al completar una tarea que se repite, se crea la siguiente (`:209-228`).

### Quality Check

**Archivos:**

- `src/views/QualityCheckHub.tsx:43`: dos pestañas, inspección y rutas.
- `src/views/QualityCheckView.tsx:322`.
- `src/views/QCReportsTableView.tsx:90`.
- `src/views/QualityDashboardView.tsx:65`.

**Datos**

- Casas.
- Catálogos (`QualityCheckView.tsx:351-356`).
- Reportes solo de las casas que están en Quality Check o Recall. Se piden por tandas de 30 ids (`src/features/quality-check/useQcForHouses.ts:31-34`).
- Los reportes y el dashboard usan el QC completo del store (`QCReportsTableView.tsx:96`).

**Lecturas:** ~4,100 en la inspección.

- 3,600 casas;
- ~400 de catálogos;
- ~100 reportes de las casas en curso.

**Decisiones**

- **El inspector ve solo lo pendiente y los recalls** (`QualityCheckView.tsx:338-340`).
- **Guardar no espera al servidor.** La pantalla sigue al instante. Si el servidor rechaza el lote, un aviso dice que no se guardó nada (`QualityCheckView.tsx:1125-1156`).

**Escrituras**

- **Guardar el QC.** Un lote con el reporte y el cambio de estado de la casa: recall con factura retenida, o liberarla (`QualityCheckView.tsx:1101-1124`).
- **Fotos por área.** Se guardan con `patchPlacePhotos` (`src/features/quality-check/services/qualityChecks.ts:17-28`).

### Payroll

**Archivos:** `src/views/PayrollView.tsx:135`.

**Datos**

- `payroll` completa, del store (`:155`). A propósito no lleva `limit` ni `orderBy`: el campo `date` tiene formatos mezclados (`:352-365`).
- Catálogos (`:177-191`).
- Casas, indexadas por id (`:163`).

**Lecturas:** ~9,400.

- 3,600 casas;
- 5,400 pagos;
- ~400 de catálogos.

**Decisiones**

- **Fechas.** `toTime` y `fmtDate` entienden ISO, MM/DD, DD/MM y Timestamps (`:54-111`).
- **Clasificación.** `classifyRecord` decide si un pago está pendiente, en nómina o pagado (`:132-133`).
- **Cálculos memoizados.** El filtro base (`:371-402`), los conteos (`:406-410`), los grupos por equipo (`:422-449`) y los totales (`:556-560`).
- **Tabla por ventana** (`:456-462`, `:1037-1042`).
- **El pago, la semana, editar y borrar esperan al servidor** con un `isSaving` general (`:196`). Ver las propuestas pendientes.

**Escrituras**

- Pago consolidado. Actualiza los pagos de las casas elegidas y crea un ajuste si hay bonus o descuento, todo en un lote (`:513-550`).
- Marcar pagado o volver a pendiente (`:569`, `:682`).
- Marcar pagada la semana entera en un lote (`:579-594`).

### Invoices

**Archivos:** `src/views/InvoicesView.tsx:183`.

**Datos**

- Casas en estado "Invoice" (`:327-345`).
- Catálogos (`:191-199`).
- Dinero: `useJobFinancials` (`:204`).

**Lecturas:** ~14,800.

- 3,600 casas;
- 5,400 servicios;
- 5,400 pagos;
- ~400 de catálogos.

**Decisiones**

- Primero salen las casas que llegaron a facturar más recientemente (`:374-393`).
- Periodo por defecto: Month (`:211-214`).
- Lista por ventana, en tabla y en tarjetas (`:837`, `:872`).
- Montos con `money()` (`src/utils/jobFinancials.ts:22-23`).

**Escrituras:**

- Nota, estado de factura, estado del trabajo y exento de impuestos (`InvoicesView.tsx:258-301`).
- Ninguna escritura bloquea la pantalla: cada una se marca por fila (`InvoicesView.tsx:186`).

### Calendar

**Archivos:** `src/views/CalendarView.tsx:36`.

**Datos:**

- Casas del alcance del usuario (`src/App.tsx:551`).
- Estados, equipos y clientes (`CalendarView.tsx:44-52`).

**Lecturas:** ~4,000.

- 3,600 casas;
- ~400 de catálogos.

**Decisiones**

- Las casas se agrupan por fecha una sola vez (`CalendarView.tsx:178-196`). Antes, cada celda del mes recorría todas las casas.
- El mes muestra hasta 5 trabajos por día (`CalendarView.tsx:173`).

**Escrituras:** ninguna. Un clic abre el detalle de la casa (`CalendarView.tsx:206-209`).

## 6. Qué se optimizó y por qué

### Resultados

**Cómo se midió.** "Antes" es el commit `acae38d`; "después", la versión final de la rama.

- **JS:** se midió con `npm run build`, en KB comprimidos (gzip).
- **LCP:** Lighthouse 12.2.1 en el login, es decir, una primera visita sin sesión.
  - Mediana de 5 corridas, alternando antes y después.
  - "Teléfono" es el 4G lento que simula Lighthouse.
- **Datos útiles:** un arnés de producción con las vistas reales y Firestore simulado en memoria, con 3,600 casas.
  - Mediana de 3 corridas, en dos series.
  - "Teléfono" significa CPU 4 veces más lenta y 1.6 Mbps.
  - El arnés no incluye lo que tarda Firestore en leer su caché. Eso se midió aparte, con el SDK real.
- **Lecturas:** estimadas desde el código, con el volumen de prueba.

| Métrica | Antes | Después | Objetivo | ¿Cumple? |
|---|---|---|---|---|
| JS del arranque (chunk inicial) | 213.1 KB | 206.3 KB | ≤ 200 KB (orientativo) | No, por 6 KB |
| JS total | 874.2 KB | 869.7 KB | — | — |
| LCP primera visita, escritorio | 0.60 s | 0.62 s | ≤ 1 s | Sí |
| LCP primera visita, teléfono 4G | 3.43 s | 2.75 s | mínimo posible, nunca > 2.5 s | No |
| CLS (saltos de la pantalla) | 0 | 0 | < 0.1 | Sí |
| Datos útiles, visita repetida (teléfono / escritorio): Overview | 5.3 / 1.00 s | 4.3 / 0.84 s | ≤ 1 s | No (1) |
| · Owner | 3.4 / 0.72 s | 3.1 / 0.74 s | ≤ 1 s | No (1) |
| · Manager | 3.7 / 0.84 s | 3.5 / 0.78 s | ≤ 1 s | No (1) |
| · Task list (SDK real, teléfono) | 3.9 s | 1.2 s | ≤ 1 s | Casi |
| · Quality Check | 4.4 / 0.75 s | 4.3 / 0.76 s | ≤ 1 s | No (1) |
| · Payroll | 7.7 / 1.34 s | 4.4 / 0.69 s | ≤ 1 s | No (1) |
| · Invoices | 5.5 / 0.93 s | 4.0 / 0.75 s | ≤ 1 s | No (1) |
| · Calendar | 5.1 / 0.56 s | 4.9 / 0.54 s | ≤ 1 s | No (1) |
| 3,600 casas desde la caché de Firestore (SDK real, teléfono / escritorio) | 4.0 / 1.4 s | 4.0 / 1.4 s | ≤ 1 s | No |
| Lecturas por sesión nueva: Overview | ~16,800 | ~16,800 | lo que se muestra + catálogos | No |
| · Owner / Manager | ~16,900 | ~16,900 | ídem | No |
| · Task list | ~3,700 | ~100 | ídem | Sí |
| · Quality Check | ~4,100 | ~4,100 | ídem | No |
| · Payroll | ~9,400 | ~9,400 | ídem | No |
| · Invoices | ~14,800 | ~14,800 | ídem | No |
| · Calendar | ~4,000 | ~4,000 | ídem | No |
| Interacción más lenta (≈ INP), teléfono | 8.0 s (Payroll → Paid) | 0.62 s (Calendar → Month) | < 200 ms | No: 5 de 19 acciones pasan de 200 ms |
| Interacción más lenta, escritorio | ~1.5 s (Payroll → Paid) | 0.21 s (QC → All) | < 200 ms | Casi: 1 de 19 |
| Dependencias eliminadas | — | 0 (knip no encontró ninguna sin uso; tampoco se agregó ninguna) | — | — |
| Líneas netas de código | — | +120 en total (942 añadidas, 822 quitadas; 88 de las añadidas son comentarios). Solo la limpieza: −116 | menos código | Ver nota (2) |

(1) En escritorio, el código y el dibujo ya quedan por debajo de 1 s en todas las pantallas. Pero en la vida real hay que sumar la lectura de la caché de Firestore (fila "3,600 casas"), así que las pantallas con casas no llegan a 1 s. En el teléfono no llegan ni con Firestore simulado.

(2) El código creció sobre todo por dos piezas nuevas:

- las listas por ventana: el hook `useVirtualRows` y el componente `VirtualItems`, unas 130 líneas;
- el esqueleto de `index.html`.

Lo que se quitó al limpiar no alcanzó a compensarlo.

**Interacciones en el teléfono, antes y después:**

| Acción | Antes | Después |
|---|---|---|
| Payroll → Paid | 8.0 s | 0.14 s |
| Payroll → Pending | 2.4 s | 0.14 s |
| Overview → Year | 3.5 s | 0.26 s |
| Overview → Month | 1.1 s | 0.16 s |
| Invoices → Year | 3.9 s | 0.22 s |
| Invoices → chip All | 2.3 s | 0.22 s |
| Invoices → buscar | 1.7 s | 0.09 s |
| Scroll largo en Paid, tiempo trabado | 7.0 s | 0.56 s |

**Arranque con sesión guardada.** El menú y la forma de la pantalla salen en 1.35 s en lugar de 2.7 s en el teléfono, y en 0.13 s en lugar de 0.88 s en escritorio.

### Qué hace cada técnica, en lenguaje sencillo

- **Carga diferida (lazy).**
  - El código de cada pantalla se baja solo cuando se abre, y en reposo se precargan las 7 más usadas. Ya estaba hecho (`src/App.tsx:21-53`, `src/utils/viewPrefetch.ts`).
  - Se agregó lo mismo para Cloud Functions: su librería baja la primera vez que se llama una (`src/config/functions.ts:3-6`).
- **Login sin el script de Google.**
  - Antes, la pantalla de login bajaba `apis.google.com/js/api.js`, que nunca usaba. Lo traía un `getAuth()` a nivel de módulo en `usersService`, que el login importa.
  - Se quitó de ahí (`src/services/usersService.ts:6-7`). Crear usuarios vive en `userAuthService`, que ahora usa `initializeAuth` en memoria (`src/services/userAuthService.ts:32-40`).
- **Archivos separados para React y Firebase** (`vite.config.ts:45-49`). Tras un deploy normal el teléfono solo baja de nuevo la parte de la app, unos 21 KB. React y Firebase siguen en su caché.
- **Esqueleto desde `index.html`.**
  - Con sesión guardada, el menú y la forma de la pantalla salen antes de que llegue el JS (`index.html:73-91`).
  - El brillo del esqueleto se anima con `transform` (`src/components/RouteTransition.css:76-87`), que no obliga a repintar.
  - La fuente ya no frena el primer pintado (`index.html:20`).
- **Caché persistente de Firestore.**
  - Ya estaba (`src/config/firebase.ts:29-34`).
  - En una visita repetida, los datos salen del disco sin esperar a la red.
  - Ojo: leer 3,600 casas de esa caché tarda ~4.0 s en un teléfono y ~1.4 s en escritorio, contando desde que se abre la página. Además, Firestore atiende las consultas de una en una.
- **Casas solo cuando hacen falta** (`src/App.tsx:196-200`). Task list ya no espera a que se lean las 3,600 casas: sus tareas salen de la caché en 1.2 s en lugar de 3.9 s, en un teléfono.
- **Listas por ventana (virtualización).**
  - Solo existen en pantalla las filas cercanas a lo que se ve. Arriba y abajo hay un relleno con el alto de las que faltan (`src/shared/hooks/useVirtualRows.ts`, `src/shared/components/VirtualItems.tsx`).
  - Con pocas filas (60 o menos) se dibuja todo, como antes (`useVirtualRows.ts:4`).
- **Cálculos guardados (memoizados).** En Payroll los conteos y totales se calculan una vez por cambio de datos, no en cada clic (`src/views/PayrollView.tsx:406-411`, `:556-560`).
- **Formato de dinero con un solo formateador** (`src/utils/jobFinancials.ts:22-23`). Antes se creaba uno por cada número.
- **Orden por fecha calculado una vez por casa** (`src/features/houses/components/HouseList.tsx:62-68`). Antes se convertía la fecha en cada comparación.
- **Índices declarados** en `security/firestore.indexes.json` para la bitácora.
- **Limpieza.**
  - Fuera exports, tipos y métodos sin uso.
  - Seis bloques que se repetían quedaron, cada uno, en una función.
  - Detalle completo en `code-notes.md`.

### Lo que se probó y se descartó

- **Pedir servicios, pagos y QC del periodo en tandas de 30 ids.** En el servidor se leen menos documentos. Pero cada consulta nueva hace que Firestore recorra en la caché la colección completa, una vez por tanda: 12 s contra 8.7 s en un teléfono.
- **Cambiar el orden de la persistencia de Auth.** Medido, no cambia nada (±30 ms).
- **Leer el rol de los custom claims.** No quita ningún paso: igual hace falta el documento del rol con sus permisos.
- **Esqueletos que aparecen solo si la espera pasa de 300 ms.** No mejoran ninguna métrica medible.

### Pendiente de tu aprobación (cambian datos o comportamiento)

- **A. Totales en la casa.**
  - Guardar `billingTotal`, `payrollTotal` y el último QC dentro de cada casa. Los mantienen Cloud Functions y una función rellena las casas existentes.
  - Overview, Invoices y Owner/Manager dejarían de leer completas las colecciones de servicios, pagos y QC. Overview pasaría de ~16,800 a ~4,000 lecturas por sesión nueva.
- **Miniaturas de fotos de Storage** para las listas.
- **Sacar html2pdf y xlsx del precache del Service Worker.** Hoy se bajan al instalar la app aunque no se usen.
- **Guardar sin esperar al servidor** en el detalle de la casa y en Payroll. Hoy un `isSaving` general bloquea mientras guarda.
- **Respuesta inmediata al cambiar de periodo** en Overview e Invoices: el botón cambia al instante y la lista llega después.

### Dónde no se llegó a 1 segundo

1. **Pantallas con casas** (Overview, Owner, Manager, Quality Check, Payroll, Invoices, Calendar).
   - **Mínimo medido.**
     - Escritorio: ~0.5–0.85 s de código y dibujo, más ~1.4 s de leer las casas de la caché.
     - Teléfono: ~4 s.
   - **Qué lo impide.** Firestore lee de la caché las 3,600 casas de la ventana y atiende las consultas de una en una. Además, Overview y Owner/Manager leen completos los servicios, los pagos y los QC (Invoices, los dos primeros). Con las casas son 16,400 documentos, que en el teléfono tardan 6.3 s en salir de la caché.
   - **Qué haría falta, de mayor a menor impacto:**
     - **Propuesta A (totales en la casa).** Quita hasta 12,800 documentos de esas pantallas. Esfuerzo: 2–3 días, más el relleno de datos y el deploy de Functions.
     - **Probar los índices de la caché local de Firestore** (`enablePersistentCacheIndexAutoCreation`). Podrían evitar que cada consulta recorra la colección entera. Esfuerzo: medio día para medirlo.
     - **Abrir cada pantalla solo con su periodo** (por ejemplo, las casas de esta semana) y la ventana completa después, en segundo plano. La lista se llenaría en dos tiempos: necesita tu visto bueno. Esfuerzo: 3–5 días.
2. **LCP de la primera visita en el teléfono: 2.75 s.**
   - **Qué lo impide.** El login lo dibuja React. Antes hace falta bajar y ejecutar 206 KB de JS, y Firebase es el 60 % de eso. Para pintar el login no hace falta Firestore: solo se usa después de entrar, para revisar la lista de usuarios.
   - **Qué haría falta.**
     - **Pintar el login desde `index.html`,** como ya se hace con el esqueleto. Esfuerzo: medio día a 1 día.
     - **Cargar Firestore después de pintar el login.** Esfuerzo: 2–3 días. Esto también dejaría el chunk inicial por debajo de 200 KB.
3. **Interacciones de más de 200 ms en el teléfono.**
   - **Calendar → Month (0.62 s).** El mes dibuja 42 días con sus trabajos.
   - **QC → All (0.45 s).** La grilla de casas tiene varias columnas y no encaja con la lista por ventana.
   - **Overview → Year y Invoices → Year / All (0.22–0.26 s).**
   - **Qué haría falta:** dibujar por ventana la grilla de QC y aligerar las celdas del mes. Esfuerzo: 1–2 días.
4. **Lecturas por pantalla.** Solo Task list cumple. Para el resto, el camino es la propuesta A y después pedir al servidor solo el periodo visible.

## 7. Cómo correrlo

1. **Requisitos.**
   - Node 20.19 o superior (lo pide Vite 7). El repo no fija la versión.
   - Las Cloud Functions usan Node 22 (`functions/package.json:13-15`).
2. **Instalar:** `npm install`.
3. **Variables de entorno.**
   - El frontend no usa ninguna. La configuración web de Firebase está en `src/config/firebase.ts:11-18`. Es pública por diseño: la protección real son las reglas de seguridad.
   - Las Cloud Functions leen `functions/.env`: `CALENDAR_ID`, `CALENDAR_WEBHOOK_URL` y, opcional, `GCAL_REDIRECT_URI` (ejemplo en `functions/.env.example`).
   - Los secretos de las Functions se cargan con `firebase functions:secrets:set`: `GCAL_CLIENT_ID`, `GCAL_CLIENT_SECRET`, `GCAL_REFRESH_TOKEN`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM` (`functions/src/index.ts:62-75`).
   - Ningún `.env` con secretos se sube al repo.
4. **Desarrollo:** `npm run dev`.
   - **Ojo:** la app se conecta a la base de datos real (`bdprecise-2d4bc`). No hay emulador para la app.
5. **Verificar antes de entregar:**
   - `npx tsc --noEmit -p tsconfig.app.json`;
   - `npm run lint`;
   - `npm run build`.
   - El build sube el número de `app-version.json` (`vite.config.ts:16-25`).
6. **Probar el build:** `npm run preview`.
7. **Reglas de seguridad:** `npm run test:rules`.
   - Usa el emulador de Firestore (`firebase.json:20-24`).
   - Necesita el Firebase CLI y Java 11 o superior (`security/README.md:140-150`).
8. **Deploy.**
   - **Frontend:** Cloudflare Workers sube la carpeta `./dist` (`wrangler.jsonc:5-11`). A mano sería `npm run build` y `npx wrangler deploy`.
   - **Caché en Cloudflare:** `public/_headers` deja los archivos de `/assets` un año en caché y obliga a revalidar `index.html` (`public/_headers:7-24`).
   - **Cloud Functions:** desde `functions/`, `npm run deploy` (`functions/package.json:10`).
   - **Reglas e índices:** se publican en la consola de Firebase, siguiendo `security/README.md:119-138`.

## 8. Guion para presentarlo

### Resumen de 30 segundos

> "Es el sistema de operaciones de Precise Cleaning. Sigue cada casa desde que entra hasta que se cobra: quién la limpia, cuándo, si pasó la inspección de calidad, cuánto se factura y cuánto se le paga al equipo. Funciona en la computadora de la oficina y en el teléfono de los gerentes e inspectores, se actualiza en vivo entre todos y sigue funcionando con mala señal. Lo acabamos de optimizar: las pantallas que antes se trababan varios segundos ahora responden al instante."

### Demo en 5 pasos

1. **Abrir la app con sesión guardada.** El menú y la forma de la pantalla salen enseguida, antes de que lleguen los datos.
2. **Overview.**
   - Cambiar de Week a Year: la tabla responde en una fracción de segundo.
   - Bajar por la lista: va fluida aunque haya miles de trabajos.
3. **Abrir una casa.**
   - Mostrar estado, equipo, notas y fotos.
   - Cambiar su estado y enseñar que el cambio aparece en otra pestaña o en otro teléfono sin recargar.
4. **Quality Check en el teléfono.** Hacer una inspección por áreas y guardarla. Si el inspector la manda a recall para volver a limpiar, la casa pasa sola a Recall y la factura queda retenida.
5. **Payroll e Invoices.**
   - Abrir Paid en Payroll: antes tardaba 8 s en un teléfono; ahora, 0.14 s.
   - Terminar en Owner: el resumen del día en 30 segundos.

### Resultados con números

- **Lo que más se nota.** Las pantallas grandes ya no se traban en el teléfono:
  - Payroll → Paid pasó de 8 s a 0.14 s.
  - Overview → Year, de 3.5 s a 0.26 s.
  - Invoices → Year, de 3.9 s a 0.22 s.
- **Al abrir la app con sesión guardada,** el menú aparece en 1.35 s en lugar de 2.7 s en el teléfono.
- **Task list** muestra sus tareas en 1.2 s en lugar de 3.9 s. Además, ahora lee ~100 documentos en vez de ~3,700.
- **Primera visita en el teléfono:**
  - La pantalla principal aparece en 2.75 s en lugar de 3.43 s.
  - La nota de Lighthouse pasa de 86 a 93.
- **Lo que falta, dicho claro.** Con miles de casas, abrir una pantalla de casas en el teléfono todavía tarda unos segundos la primera vez en cada sesión. El siguiente paso es guardar los totales en cada casa (propuesta A).

### Preguntas probables

- **¿Es segura?**
  - Se entra con correo y contraseña de Firebase. La app no tiene registro abierto: las cuentas las crea un administrador desde Users.
  - Al entrar, el correo debe estar en la lista de usuarios (`src/views/auth/LoginView.tsx:143-169`).
  - Cada rol ve solo los módulos que tiene permitidos (`src/App.tsx:336-359`).
  - Ojo: esas dos revisiones se hacen en el navegador. La protección de verdad, en el servidor, son las reglas por rol de `security/`. Ya están escritas, con pruebas que hay que correr antes de publicarlas. Publicarlas es el siguiente paso recomendado.
- **¿Cuánto cuesta Firebase?**
  - Firestore cobra por documento leído: 50,000 lecturas gratis al día y luego desde $0.03 por cada 100,000.
  - Ejemplo con el volumen de prueba: 10 personas que abren Overview 2 veces al día en sesiones nuevas son ~336,000 lecturas. Eso da unos 9 centavos al día, menos de $3 al mes.
  - Con la propuesta A bajaría a una cuarta parte.
  - Storage (fotos) y Functions se cobran aparte, según el uso.
- **¿Cómo crece?**
  - Las casas se leen solo de los últimos 12 meses: ese costo crece con las casas de cada año, no con los años acumulados.
  - Pero servicios, pagos y QC se leen completos, y esos sí crecen cada año.
  - Por eso el paso más importante para crecer es la propuesta A. Después vendría pedir al servidor solo el periodo que se ve.
- **¿Es fácil de mantener?**
  - Usa tecnologías estándar (React, TypeScript, Firebase).
  - Las lecturas y escrituras pasan, casi todas, por un service por colección. Las convenciones están escritas en `CLAUDE.md`.
  - Cada decisión queda registrada en `code-notes.md`.
  - Antes de cada entrega pasa por el chequeo de tipos, el lint y el build.

## 9. Glosario

- **Build:** convertir el código en los archivos que se suben al hosting.
- **Batch (lote):** varias escrituras que se guardan todas juntas o ninguna.
- **Caché persistente:** copia de los datos de Firestore en el disco del navegador; las visitas repetidas leen de ahí.
- **Catálogo:** lista corta de opciones (estados, equipos, servicios…) que casi no cambia.
- **Chunk:** cada archivo JS en que se parte la app para bajarla por partes.
- **Cloud Functions:** código que corre en los servidores de Google (correos, Calendar, permisos).
- **Colección / documento:** en Firestore, una colección es un grupo de documentos (fichas) del mismo tipo.
- **Custom claims:** datos extra que Firebase guarda en la sesión del usuario.
- **Desnormalizar:** copiar un dato en otro documento para no tener que leer los dos.
- **Esqueleto (skeleton):** la forma gris de la pantalla mientras llegan los datos.
- **gzip:** compresión con la que viaja el JS; los KB de esta guía son ya comprimidos.
- **Índice compuesto:** índice de Firestore para consultas que filtran u ordenan por varios campos.
- **INP:** tiempo desde un clic o toque hasta que la pantalla responde.
- **Lazy (carga diferida):** bajar el código de una pantalla solo cuando se va a usar.
- **LCP:** tiempo hasta que se pinta el elemento más grande de la primera pantalla.
- **Lectura (Firestore):** cada documento que Firestore entrega; es lo que cobra.
- **Listener (`onSnapshot`):** conexión en vivo que avisa cada vez que cambian los datos.
- **Memoizar:** guardar un cálculo y repetirlo solo si cambian sus datos.
- **Precache:** archivos que el Service Worker guarda al instalar la app para usarla sin red.
- **PWA:** web que se instala como app en el teléfono.
- **Scope (alcance):** si un rol ve todo ("All") o solo lo suyo ("Own").
- **Security Rules:** reglas en el servidor de Firebase que deciden quién puede leer o escribir cada documento.
- **Service:** archivo que agrupa las lecturas y escrituras de una colección.
- **Service Worker:** script del navegador que guarda la app para que abra rápido y sin red.
- **Virtualización (lista por ventana):** dibujar solo las filas visibles de una lista larga.
- **Ventana de 12 meses:** las casas que la app carga por defecto: recientes, futuras, sin fecha o sin cobrar.
