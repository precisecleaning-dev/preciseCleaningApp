# Code Review Notes — Precise Cleaning App

Notas persistentes para la revisión progresiva de calidad de código React: buenas prácticas,
funcionalidad, lógica/algoritmia, decisiones de "un componente por archivo vs. varios en el
mismo archivo", y semántica del JSX (componentes/tags nativos de HTML en vez de `<div>` genéricos
donde haya una opción más significativa).

Ver `css-notes.md` para el historial de la limpieza de estilos inline (tarea previa, ya cerrada).

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
