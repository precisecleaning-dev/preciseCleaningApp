# CSS Cleanup Notes — Precise Cleaning App

Contexto persistente para la tarea de migrar estilos inline (JSX) hacia clases CSS.
Objetivo: reducir el uso de `style={{...}}` en los componentes reutilizando clases
existentes en `src/App.css` / `src/index.css`, y crear clases nuevas cuando haga falta.

## Estado del proyecto (2026-07-06)

- Solo existen 2 archivos CSS globales: `src/App.css` y `src/index.css`. No hay CSS
  Modules ni styled-components — todo lo "por componente" vive en JSX inline o no
  existe todavía como clase.
- 28 archivos `.tsx` en `src/`. Aún no se han revisado para ver el nivel real de
  inline styles (eso viene en el siguiente paso, empezando por `Header.tsx`).

## Inventario: `src/index.css`

- Reset/base de Vite (tipografía, `body`, `button`, `a`, `h1`, color-scheme light/dark).
  **Nota:** este boilerplate de light/dark (`prefers-color-scheme`) probablemente no
  aplica al diseño real de la app (que usa variables fijas en App.css). Revisar si
  conviene limpiar el boilerplate de Vite que ya no se usa.
- `.view-header-title-group` — flex row, gap 16px; en móvil (`≤768px`) se invierte a
  `row-reverse` para mover el botón hamburguesa a la derecha.
- `.hamburger-btn` — botón cuadrado blanco con borde, sombra sutil, hover gris claro.
  Esta clase es candidata a reusarse en cualquier header de vista con menú móvil.

## Inventario: `src/App.css`

### Variables (`:root`)
`--bg-sidebar`, `--bg-sidebar-hover`, `--bg-sidebar-active`, `--bg-main`,
`--text-primary`, `--text-secondary`, `--text-sidebar`, `--border-color`,
`--primary-blue`, `--primary-blue-hover`, `--bg-gray`.
Cuando reemplacemos un `style={{ color: '#111827' }}` inline, mapear al var
equivalente (`--text-primary`) en vez de hardcodear el hex de nuevo.

### Layout raíz
- `.app-container` — flex, 100vh/100vw, overflow hidden.
- `.sidebar` (+ `.open` / `.collapsed`) — sidebar fijo/colapsable, con versión
  responsive (`position: fixed` en `≤1024px`, full width en `≤768px`).
- `.main-content` — columna principal con padding y scroll propio.

### Sidebar
`.sidebar-header`, `.logo-container`, `.logo-icon`, `.logo-text`,
`.sidebar-toggle-container`, `.sidebar-toggle-btn`, `.menu-label`, `.sidebar-nav`,
`.nav-item` (+ `.active`).

### Header de vista / acciones
`.main-header`, `.header-titles`, `.header-actions`, `.mobile-menu-btn`,
`.dashboard-actions-wrapper`, `.dashboard-filters`, `.dashboard-header-container`.
**Relevante para Header.tsx**: ya existe bastante cobertura de clases para
título + acciones + botón móvil. Muy probable que Header.tsx pueda apoyarse casi
100% en estas clases existentes en vez de crear nuevas.

### Buscador
`.search-box` (+ `input`, `.input-icon`, `::placeholder`), `.search-box-container`
(usado solo en media queries — revisar si existe la clase base fuera de los `@media`
o si falta definirla en desktop).

### Botones genéricos
`.btn-filter`, `.btn-primary`, `.btn-outline`, `.add-btn-mobile`, `.bell-btn-mobile`.

### Tarjetas de resumen (KPIs)
`.status-summary-grid`, `.status-summary-card` (+ `border-top` dinámico por color,
probablemente vía inline style todavía), `.status-summary-title`,
`.status-summary-count`, `.dash-grid`.

### Acordeones
`.accordion-section-wrapper`, `.accordion-header` (+ `h2`), `.accordion-toggle`
(+ `.expanded`), `.count-pill`.

### Tarjetas de propiedades
`.cards-grid` (+ `.collapsed` / `.expanded`), `.property-card` (+ `.border-red`),
`.card-header`, `.tag` (+ `.team`, `.prepaid`), `.card-address`, `.card-pills`,
`.pill`, `.card-desc`, `.card-bottom-note`.
**Nota:** `.tag` y `.property-card` usan variantes de color por clase modificadora
(`.team`, `.prepaid`, `.border-red`) — es el patrón a seguir para reemplazar
`style={{ backgroundColor: dynamicColor }}` inline: agregar más variantes de clase
en vez de estilos calculados en JS, cuando el set de colores sea finito.

### Modales
`.modal-overlay`, `.modal-overlay-centered`, `.modal-content` (+ anim
`modalScaleIn`), `.modal-header` (+ `h3`), `.modal-body` (+ `.modal-body-scroll`),
`.modal-footer`, `.modalWide`, `.modal-70`, `.modal-90`, `.modal-full`
(+ `.modal-full-left`, `.modal-full-right`).
Bastante cobertura responsive ya escrita a propósito para pantalla completa en
móvil — cuidado al tocar estas clases, tienen mucho detalle fino de iOS
(safe-area, 16px anti-zoom, min-height 44/48px táctil).

### Layout de dashboard
`.dash-grid`, `.main-columns`, `.left-col`, `.right-col`.

### Vista de casas (`HousesView`)
`.houses-view` — tiene overrides específicos en móvil para arreglar scroll
(`height: auto !important`, `overflow: visible !important`). Cualquier cambio a
este componente debe respetar ese fix (estaba roto antes, ver comentario en CSS).

### Tablas
`.responsive-table` — solo referenciada en media query (`td button` táctil).
Revisar si la clase base existe fuera del `@media` o si la tabla es 100% inline
en desktop.

### Filtros / tabs
`.filters-section`, `.tabs-container`, `.property-select-container`.

## Patrones a tener en cuenta al migrar JSX → clases

1. Muchas media queries usan `!important` porque están "ganándole" a estilos
   inline existentes (comentario explícito en el CSS, línea ~249). Si movemos
   esos estilos a clases base, probablemente podamos **quitar los `!important`**
   uno por uno — no hacerlo a ciegas, verificar cada caso.
2. Ya hay una convención de "clase base + variante" (`.tag.team`, `.property-card.border-red`,
   `.sidebar.collapsed`, `.accordion-toggle.expanded`). Seguir este patrón para
   estados/colores dinámicos en vez de `style={{...}}` calculado en JS.
3. Varias clases (`.search-box-container`, `.responsive-table`, `.property-select-container`)
   solo aparecen dentro de `@media` — probable señal de que su versión "base/desktop"
   sigue siendo inline en el JSX y falta crear la clase real. Confirmar por componente.
4. `index.css` trae boilerplate de Vite (dark mode, botón genérico) que puede no
   aplicar al diseño real — evaluar limpieza cuando lleguemos a esos componentes.

## Hallazgo transversal: `.view-header-title-group` duplicado/inconsistente

Al revisar `Header.tsx` se detectó un patrón que afecta a varias vistas, no solo a
este componente. Anotarlo aquí para no tener que re-buscarlo después:

- La clase `.view-header-title-group` (definida en `index.css:71`, con variante
  responsive en `index.css:96` que hace `row-reverse` en `≤768px`) se usa en:
  `PayrollView.tsx`, `CustomersView.tsx`, `CalendarView.tsx`, `UsersView.tsx`,
  `HousesView.tsx`.
- **Inconsistencia 1 (inline redundante):** `PayrollView.tsx:353` y
  `UsersView.tsx:345` aplican la clase **y además** repiten
  `style={{ display:'flex', alignItems:'center', gap:'16px' }}` inline — el inline
  no aporta nada porque ya lo hace la clase. Candidato a limpiar cuando se revisen
  esos archivos: quitar el `style` inline.
- **Inconsistencia 2 (CSS duplicado embebido):** `PayrollView.tsx:347`,
  `CustomersView.tsx:106`, `CalendarView.tsx:470`, `HousesView.tsx:1938`,
  `UsersView.tsx:334` reinyectan la **misma regla** `.view-header-title-group {...}`
  vía un `<style>` embebido en el propio componente, en vez de confiar en la que ya
  existe globalmente en `index.css`. Candidato a eliminar esos bloques `<style>`
  duplicados cuando revisemos cada vista (confirmar antes que no haya un motivo,
  ej. orden de carga / especificidad, que justifique la duplicación).

## Progreso por componente (índice)
Ver detalle completo más abajo. Resumen rápido de archivos ya tratados:
Header.tsx, PhotoSection.tsx (+ PhotoSection.css), 5 vistas de
`.view-header-title-group`, `.hamburger-btn` (6 archivos),
`.modal-70`/`.grid-3-cols`/`.fade-in` scrollbar (6 archivos),
PipelineBoardView.tsx (+ PipelineBoardView.css),
PropertyDetailModal.tsx (+ PropertyDetailModal.css),
Sidebar.tsx (+ Sidebar.css), SidePanel.tsx (CSS agregado a App.css),
StatusHistoryPanel.tsx (+ StatusHistoryPanel.css),
RolesView.tsx (+ RolesView.css), UsersView.tsx (+ UsersView.css),
LoginView.tsx (+ LoginView.css), CalendarView.tsx (+ CalendarView.css),
CompanySettingsView.tsx (+ CompanySettingsView.css),
CustomersView.tsx (+ CustomersView.css), DataImportView.tsx (+ DataImportView.css),
HousesView.tsx (+ HousesView.css, completo), InvoicesView.tsx (+ InvoicesView.css),
NoticeBoardView.tsx (+ NoticeBoardView.css), PayrollView.tsx (+ PayrollView.css),
PhotoSettingsView.tsx (+ PhotoSettingsView.css), QCDashboardView.tsx (+ QCDashboardView.css),
QCRouteView.tsx (+ QCRouteView.css), QualityCheckHub.tsx (+ QualityCheckHub.css),
QualityCheckView.tsx (+ QualityCheckView.css, completo), RecallsView.tsx (+ RecallsView.css), SettingsView.tsx (+ SettingsView.css), StatusHistoryView.tsx (+ StatusHistoryView.css), App.tsx (clases movidas a App.css).



- [x] `src/components/Header/Header.tsx` — Solo tenía **un** inline style (el
  contenedor título+botón móvil, línea 14: `display:flex; alignItems:center;
  gap:12px`). Se detectó que existe `.view-header-title-group` en `index.css` con
  el mismo propósito pero `gap:16px`. Se preguntó al usuario si unificar a 16px o
  mantener 12px con clase propia → **decisión: mantener 12px**, para no alterar el
  diseño visual actual de este componente. Se creó `.header-title-group` en
  `App.css` (junto a `.header-titles`) con `gap:12px` y se reemplazó el inline
  style por `className="header-title-group"`. `.view-header-title-group` se deja
  intacta para las demás vistas.
  Resto del componente (botones, search box, SVGs) ya usaba clases existentes
  (`main-header`, `header-titles`, `mobile-menu-btn`, `header-actions`,
  `search-box`, `input-icon`, `btn-filter`, `btn-primary`) — sin cambios ahí.
- [x] `.view-header-title-group` — limpiado en las 5 vistas. En cada una se
  eliminó la(s) regla(s) duplicada(s) dentro de su `<style>` embebido (la base
  `display:flex;align-items:center;gap:16px` donde existía, y la variante
  `@media (max-width:768px) { flex-direction: row-reverse; ... }` en las 5), y
  se quitó el inline `style={{display:'flex',alignItems:'center',gap:'16px'}}`
  redundante en `PayrollView.tsx` y `admin/UsersView.tsx` (el resto ya usaba
  solo `className`). Ahora `index.css` es la única fuente de verdad para esta
  clase. Verificado con `grep "view-header-title-group"` (solo quedan los
  `className`, cero reglas CSS embebidas) y `tsc --noEmit` (sin errores).
  - `src/views/PayrollView.tsx`
  - `src/views/CustomersView.tsx`
  - `src/views/CalendarView.tsx`
  - `src/views/admin/UsersView.tsx`
  - `src/views/HousesView.tsx`
- [x] `.hamburger-btn` — auditado en los 6 archivos que lo redefinían dentro de
  su `<style>` embebido:
  - Duplicados **exactos** de `index.css` → regla eliminada, sin cambio visual:
    `src/views/PayrollView.tsx`, `src/views/CustomersView.tsx`,
    `src/views/admin/UsersView.tsx`, `src/views/HousesView.tsx`.
  - `src/views/NoticeBoardView.tsx` — casi idéntico, solo le faltaba
    `transition: all 0.2s`. Confirmado con el usuario → se eliminó el duplicado;
    ahora hereda la transición de hover de `index.css` (cambio visual mínimo,
    aprobado).
  - `src/views/DataImportView.tsx` — **no era un duplicado accidental**, es una
    variante visual real y más compacta (radius 7px vs 8px, padding 7px 10px vs
    8px 12px, color `#475569` vs `#111827`, sin box-shadow, transition 0.15s vs
    0.2s). Confirmado con el usuario → se renombró a `.hamburger-btn-compact`
    (clase propia del archivo) en vez de sobrescribir el nombre de la clase
    global. Se actualizó el `className` del botón. Cero cambio visual en este
    archivo.
  - `index.css` queda como única definición de `.hamburger-btn` en todo el
    proyecto. Verificado con `grep "\.hamburger-btn\b"` y `tsc --noEmit` (sin
    errores).

- [x] `.modal-70`, `.grid-3-cols` + `.col-span-full`, scrollbar de `.fade-in` —
  A diferencia de `.hamburger-btn`/`.view-header-title-group`, estas 3 **no
  existían todavía** en `App.css`/`index.css`: estaban duplicadas 3-4 veces
  entre vistas sin una fuente única. Se creó la fuente canónica en `App.css`:
  - `.modal-70` (base 1000px, doble sombra) + `@media (min-width:769px){width:70%}`
    junto a la sección "Modales y Formularios". Se detectó que `CustomersView`
    usaba una variante real más angosta (800px, sombra simple) → se preservó
    como modificador `.modal-70.modal-narrow` (confirmado con el usuario), y se
    actualizó su `className` a `"modal-70 modal-narrow"`.
  - `.grid-3-cols` + `.col-span-full` (base + variante `1fr` en `@media
    max-width:768px`), junto a `.dash-grid`.
  - Scrollbar fina de `.fade-in *::-webkit-scrollbar-*`, junto al keyframe
    `.fade-in`. Dos versiones coexistían (con/sin `transition` en el thumb y
    `::-webkit-scrollbar-corner`); se confirmó con el usuario usar la versión
    completa como única — Payroll y UsersView ganan esas 2 mejoras menores.
  - Se eliminaron los duplicados en: `PayrollView.tsx`, `CustomersView.tsx`,
    `CalendarView.tsx` (solo grid-3-cols/col-span-full), `InvoicesView.tsx`,
    `admin/UsersView.tsx` (solo fade-in scrollbar), `HousesView.tsx`.
  - **Se preservaron intencionalmente** los overrides *view-specific* que no
    son duplicados reales: el breakpoint propio de `InvoicesView` (`@media
    max-width:820px`, distinto del `768px` global) para `.grid-3-cols` y el
    modo pantalla-completa de `.modal-70` en móvil; y en `HousesView` los
    overrides de `.modal-90` (clase que no existe en App.css) y el modo
    pantalla-completa combinado `.modal-70, .modal-90` en móvil.
  - Verificado con `grep` (sin definiciones base duplicadas restantes, solo
    overrides legítimos view-specific) y `tsc --noEmit` (sin errores).
  - **Nota:** `App.css` ya tenía, desde antes de esta tarea, su propia regla
    mobile para `.modal-70/.modal-90/.modal-full` (pantalla completa en
    `≤768px`, sección "MEDIA QUERIES"). Esto se solapa parcialmente con los
    overrides propios de `HousesView`/`InvoicesView` mencionados arriba (ambos
    fuerzan ancho 100% en móvil con valores ligeramente distintos, 100vw vs
    100%). No se tocó — es una redundancia preexistente de menor riesgo, no
    parte del pedido actual. Queda anotada por si se quiere consolidar después.

- [x] `src/components/PipelineBoardView.tsx` — El más grande hasta ahora: 49
  `style={{...}}` + 2 `<style>` embebidos (solo con media queries). Se hizo la
  pasada completa (confirmada con el usuario dado el tamaño):
  - Se creó `src/components/PipelineBoardView.css` (import al tope del
    archivo) con ~45 clases nuevas (prefijo `pb-` + `pipeline-board` /
    `board-column`) que cubren layout, tipografía y estados.
  - **2 hovers simulados con JS eliminados por completo:** `StatusPill` y la
    tarjeta de trabajo (`pb-job-card`) mutaban `e.currentTarget.style` a mano en
    `onMouseEnter`/`onMouseLeave`. Ahora son `:hover` real en CSS
    (`.pb-status-pill:hover:not(:disabled)`, `.pb-job-card:hover`) — mismo
    resultado visual, menos JS, sin re-render extra por evento de mouse.
  - **Estados finitos → modificador de clase:** `.pb-status-option.selected`
    (antes `isSelected ? ... : ...` calculado en cada render); el botón
    "Aceptar" ahora usa el propio atributo `disabled` del `<button>` con
    `.pb-btn-primary:disabled` en vez de calcular `opacity`/`boxShadow`/`cursor`
    a mano según `selectedIsCurrent`.
  - **Colores de datos (no son un enum finito, vienen de Firestore) → CSS
    variables inline**, todo lo demás a clase estática:
    - Punto de color de status (`.pb-status-dot`, `.pb-status-option-dot`) via
      `--dot-color` / `--dot-shadow`.
    - Borde superior de columna según el color del status (`.pb-column-head`)
      via `--col-color`.
    - Avatar de equipo (`.pb-job-team-avatar`) via `--team-bg` / `--team-color`.
    - Se tipó con `style={{ '--x': val } as CSSProperties}` (React 19 acepta
      custom properties en `style` con ese cast; sin él da error de tipos).
  - Resultado: 0 `style={{` restantes en el archivo (verificado con `grep`).
    `tsc --noEmit` sin errores. `eslint` reporta los mismos 12 errores
    `no-explicit-any` que ya existían antes del cambio (comparado con
    `git stash` — no se introdujeron nuevos, son casts `any` preexistentes en
    la lógica de datos, fuera del alcance de esta tarea de CSS).

- [x] `src/components/PropertyDetailModal.tsx` — 59 `style={{...}}` (el más
  grande hasta ahora) + 1 `<style>` embebido + un objeto `st` de JS con
  estilos reutilizados (mismo patrón "objeto de estilos" visto en otras
  vistas, ej. `PayrollView`/`CustomersView`). Pasada completa:
  - Se creó `src/components/PropertyDetailModal.css` (~55 clases, prefijo
    `pdm-`) que reemplaza tanto el `<style>` embebido como el objeto `st`.
  - **Hover simulado con JS eliminado:** el dropdown de selección de status
    mutaba `e.currentTarget.style.background` a mano en cada
    `onMouseEnter`/`onMouseLeave`. Ahora es `.pdm-status-option:hover` +
    modificador `.active` — mismo comportamiento (el hover siempre gana sobre
    el estado "activo", igual que la lógica JS original), sin manipulación
    directa del DOM.
  - **Estados finitos → modificador de clase:** el cursor del selector de
    status (`default`/`pointer`/`wait` según `canEdit`/`saving` →
    `.pdm-status-trigger.editable` / `.saving`), la rotación del chevron
    (`.pdm-chevron.open`), y el color de la tarjeta de "Profit" según
    `profit >= 0` (`.pdm-stat-profit.positive` / `.negative`, 3 clases
    hermanas para label/valor/fondo).
  - **Colores de datos → CSS variables inline:** el punto de color de cada
    status (`.pdm-dot-8` en el selector, `.pdm-dot-10` en las tarjetas de
    info) y los colores de prioridad/equipo, todos vía `--dot-color`.
  - **Un solo caso de discrepancia real detectado y corregido en el momento:**
    el contenedor del título (nombre del cliente + badge "Finished") tenía
    `display:flex;align-items:center;gap:12px` **más** `min-width:0` — casi
    idéntico a la clase global `.header-title-group` (creada para
    `Header.tsx`) pero con `min-width:0` extra (necesario para que el
    `text-overflow:ellipsis` del título funcione en pantallas angostas). En
    vez de reusar la clase global y perder ese `min-width:0`, se creó
    `.pdm-header-title-group` propia con la propiedad completa — se detectó
    ANTES de verificar visualmente, revisando el JSX original con cuidado.
  - Resultado: 0 `style={{` estático restante; solo quedan 5 usos de
    `style={{ '--dot-color': ... }}` para colores dinámicos de datos —
    exactamente lo esperado. `tsc --noEmit` sin errores. `eslint` reporta los
    mismos 43 errores `no-explicit-any` preexistentes (comparado con
    `git stash`, cero nuevos).

- [x] `src/components/Sidebar.tsx` — El más simple hasta ahora: 5
  `style={{...}}`, todos estáticos (sin colores de datos), + 1 `<style>`
  embebido. Se movió el CSS a `src/components/Sidebar.css` (import al tope) y
  se reemplazaron los 5 inline:
  - Spacer del header (`flex:1`) → `.sidebar-header-spacer`.
  - `<nav>` (`flex:1;overflow-y:auto;padding-top:4px`) → se agregó como regla
    **base** de `.sidebar-nav` (antes solo existía su override
    `padding-top:6px !important` dentro del `@media max-width:768px`, mismo
    patrón de "solo aparece en media query" visto antes en otros archivos).
    Igual con `.sidebar-footer` (antes solo su override móvil existía).
  - `margin-top:24px` del label "ADMIN" → modificador `.menu-label.spaced`.
  - **Hover simulado con JS eliminado** en el botón de Logout
    (`onMouseEnter`/`onMouseLeave` mutando `backgroundColor` a mano) → ahora
    `.logout-btn:hover` en CSS. Igual que `.logout-btn` en general, solo
    existía su override móvil antes de esta pasada; ahora tiene su regla base
    completa.
  - Resultado: 0 `style={{` restantes (no había ningún color dinámico de datos
    en este archivo, así que no quedó ningún inline). `tsc --noEmit` y
    `eslint` sin errores.

- [x] `src/components/SidePanel.tsx` — **0 inline styles** (ya usaba solo
  `className`), pero al auditarlo apareció algo más serio: **ninguna** de sus
  8 clases (`side-panel`, `side-panel-overlay`, `fade-in-right`,
  `side-panel-header`, `side-panel-title`, `side-panel-actions`,
  `side-panel-body`, `btn-icon`) estaba definida en ningún CSS del proyecto, y
  **el componente no se importa/usa en ningún otro archivo** — código muerto
  que, de usarse, se renderizaría sin overlay, sin posicionamiento ni
  animación. Confirmado con el usuario → se creó el CSS que le faltaba en
  `App.css` (sección nueva "Side Panel (drawer lateral)", junto a la sección
  de Modales, ya que sigue el mismo vocabulario visual: overlay a pantalla
  completa, panel fijo a la derecha con `box-shadow`, header/body al estilo
  `.modal-header`/`.modal-body`, y reutiliza `.btn-outline`/`.btn-primary` ya
  existentes para las acciones). Se agregó `.btn-icon` (botón solo-ícono,
  reutilizable) y la animación `fadeInRight` (slide-in desde la derecha) +
  breakpoint móvil (`width:100vw` en `≤768px`). El componente sigue sin
  usarse en ninguna vista — eso no cambió, solo se completó el CSS para que
  esté listo si se conecta en el futuro. `tsc --noEmit` sin errores (no se
  tocó el `.tsx`, solo se agregó CSS).

- [x] `src/components/StatusHistoryPanel.tsx` — 16 `style={{...}}`. CSS movido
  a `StatusHistoryPanel.css` (import al tope). Detalles:
  - El `@keyframes shp-spin` estaba embebido en un `<style>` que solo se
    renderiza mientras `loading` es `true` (dentro del bloque condicional) —
    se movió al `.css` como regla global normal, más simple y sin depender
    del ciclo de render.
  - **Simplificación real, no solo movimiento:** el borde inferior de cada fila
    del timeline usaba un ternario en JS (`i < entries.length - 1 ? '1px solid
    #f1f5f9' : 'none'`) para no dibujar el borde en la última fila. Se
    reemplazó por el selector CSS `.shp-timeline-row:not(:last-child)`,
    eliminando la dependencia del índice para ese estilo.
  - Colores de datos (color de cada status) → CSS variables inline:
    `--dot-color` (puntos de 8px/10px y el badge de conteo, que usa el mismo
    color como fondo) y `--pill-bg`/`--pill-border` (la pastilla de conteo
    por status usa el color del status + sufijo de alpha en hex, ej.
    `${color}12` — se pasa el string ya calculado como variable, no se
    intenta hacer aritmética de color en CSS).
  - Resultado: solo quedan 4 `style={{ '--x': ... }}` (todos colores de
    datos). `tsc --noEmit` sin errores. `eslint` reporta 1 error
    preexistente (`react-hooks/set-state-in-effect` en el `useEffect` de
    carga) — confirmado con `git stash` que ya existía antes, es de lógica de
    React no relacionada a este trabajo de CSS.

- [x] `src/views/admin/RolesView.tsx` — 69 `style={{...}}` + un objeto `s` de
  JS (th/td/input/checkbox/select/btnCancel). CSS movido a `RolesView.css`
  (~55 clases, prefijo `rv-`). Puntos destacados:
  - **Redundancia detectada y eliminada:** el botón hamburguesa combinaba
    `className="mobile-menu-btn"` (clase global de `index.css`) **con** un
    inline `style` que redefinía casi las mismas propiedades
    (`background:none;border:1px solid #e5e7eb;border-radius:8px;padding:8px
    12px;cursor:pointer`) — al comparar con la variable `--border-color:
    #e5e7eb` de `App.css` se confirmó que eran 100% idénticos. Se eliminó el
    inline por completo, sin cambio visual.
  - **Reuso de clase global:** el contenedor del ícono hamburguesa + título
    (`display:flex;align-items:center;gap:12px`) es exactamente
    `.header-title-group` (creada para `Header.tsx`) — se reusó en vez de
    crear una clase local, ya que aquí no hace falta `min-width:0` (el título
    "Roles & Permissions" no trunca con ellipsis, a diferencia del caso de
    `PropertyDetailModal`).
  - **Simplificación real:** el borde inferior de cada fila de la matriz de
    permisos estaba en un inline `style={{borderBottom:'1px solid
    #f1f5f9'}}` idéntico en todas las filas → reemplazado por el selector
    `.rv-matrix-table tbody tr` en CSS, sin necesidad de className por fila.
  - **Estados finitos → modificador de clase:** checkbox seleccionado/no
    (`.rv-status-option.checked`, `.rv-group-option.visible`), y los cursores
    de "Create Role" (`disabled={isLoading}`) y "Save Configuration"
    (`disabled={isSaving}`) ahora usan `:disabled` nativo del botón en vez de
    calcular `cursor`/`opacity` a mano.
  - Color de status (dato de Firestore) → `--dot-color` vía CSS variable,
    único inline restante.
  - Resultado: solo 1 `style={{` remanente (el color dinámico). `tsc
    --noEmit` sin errores. `eslint` reporta los mismos 5 errores preexistentes
    (`no-explicit-any` + `no-unused-vars` en destructuring de `id`),
    confirmado con `git stash` — mismas líneas de código, solo se corrieron
    los números de línea al quitar el `<style>` y el objeto `s`.

- [x] `src/views/admin/UsersView.tsx` — 68 `style={{...}}` + objeto `s`
  (th/td/label/input/inputDisabled) + `<style>` embebido (ya habíamos limpiado
  sus duplicados de `.hamburger-btn`/`.view-header-title-group`/fade-in
  scrollbar en una pasada anterior). CSS movido a `UsersView.css`
  (~55 clases, prefijo `uv-`). Puntos destacados:
  - **Hover simulado con JS eliminado:** cada `<tr>` de la tabla mutaba
    `e.currentTarget.style.backgroundColor` a mano en
    `onMouseEnter`/`onMouseLeave` → ahora `.uv-table tbody tr:hover` en CSS.
  - **`s.inputDisabled` eliminado por completo:** el input de email en modo
    edición intercambiaba todo un objeto de estilos (`formData.id ?
    s.inputDisabled : s.input`) solo para cambiar 3 propiedades. Como el
    input ya recibe el atributo nativo `disabled={!!formData.id}`, se
    reemplazó por pseudo-clase `.uv-input:disabled{...}` — mismo resultado,
    sin duplicar el objeto de estilos completo.
  - **3 botones "disabled calculado" → `:disabled` nativo:** el botón "Save"
    (cursor `wait`/opacity `.7` según `isSaving`) y el botón "Import Users"
    (cursor `not-allowed`/opacity `.6` según 3 condiciones combinadas) ya
    tenían el atributo `disabled` con exactamente esas mismas condiciones —
    se movieron a `.uv-btn-primary-modal.save:disabled` /
    `.uv-btn-primary-modal.import:disabled` en vez de calcular
    `cursor`/`opacity` en JS.
  - **Estado de status (3 valores finitos: not-invited/invited-pending/active)
    → modificador de clase** en vez de condicionales anidados de color
    (`.uv-status-dot`/`.uv-status-text` + `.not-invited`/`.invited-pending`/
    `.active`), igual patrón que el botón de "enviar invitación"
    (`.uv-btn-send` + `.resent`/`.busy`).
  - Los tres banners de aviso (ámbar/azul/rojo, en el modal de alta y en bulk
    import) comparten estructura (`.uv-banner` + `.uv-banner-icon` +
    `.uv-banner-text`) con modificador de color por variante.
  - Resultado: **0 `style={{` restantes** (no había ningún color de datos en
    este archivo, a diferencia de Pipeline/PropertyDetail/Sidebar). `tsc
    --noEmit` sin errores. `eslint` reporta los mismos 10 errores
    preexistentes (`no-explicit-any` + `no-unused-vars`), confirmado con
    `git stash` — mismas líneas de código, solo cambiaron los números de
    línea.

- [x] `src/views/auth/LoginView.tsx` — 25 `style={{...}}` + `<style>` embebido
  (varias clases `.login-*` ya existían pero solo con overrides de `@media`,
  sin regla base — mismo patrón "solo aparece en media query" visto en otros
  archivos). CSS movido a `LoginView.css`. Puntos destacados:
  - **`.login-screen`, `.login-label`, `.login-forgot`, `.login-submit`,
    `.login-bypass`** solo tenían su versión mobile en el `<style>` embebido;
    el desktop vivía 100% inline cada vez que se usaba la clase. Se agregaron
    las reglas base que faltaban.
  - **`.login-subtitle` resultó ser 3 instancias con contenido totalmente
    distinto** (Recover Access / Reset link sent / Forgot password intro),
    cada una con su propio color/margen/line-height en inline — no había un
    estilo "compartido" real detrás de la clase común. Se crearon 3
    modificadores explícitos (`.recover`, `.reset-sent`, `.forgot-intro`) en
    vez de forzar una única definición que no encajaría con ninguna.
  - **Logo con 2 estados (con/sin logo de empresa)** → modificador de clase
    `.login-logo.has-logo` en vez de calcular `backgroundColor`/`padding` con
    un ternario en JS.
  - **2 botones "disabled calculado" → `:disabled` nativo:** "Sign In"
    (cursor `wait` según `isLoading`) y "Send reset link" (según
    `resetLoading`) ya tenían el atributo `disabled` con la misma condición
    exacta → `.login-submit:disabled{cursor:wait}`.
  - Resultado: **0 `style={{` restantes**. `tsc --noEmit` sin errores.
    `eslint` reporta los mismos 3 errores preexistentes (`no-unused-vars` +
    2× `no-explicit-any`), confirmado con `git stash` — mismas líneas de
    código, solo cambiaron los números de línea.

- [x] `src/views/CalendarView.tsx` — 56 `style={{...}}` + objeto `s` (14
  propiedades reutilizadas por los 2 modales) + `<style>` embebido + un
  componente interno (`CustomSelect`) 100% inline con 2 hovers simulados en
  JS. El más grande de esta pasada. CSS movido a `CalendarView.css`. Puntos
  destacados:
  - **`CustomSelect`** (dropdown personalizado reutilizado en todo el
    formulario): sus 2 `onMouseEnter`/`onMouseLeave` (fondo del hover en cada
    opción) se eliminaron a favor de `.cs-option:hover` en CSS. El resto del
    componente (trigger, dropdown, chequeo de abierto/cerrado) pasó a clases
    `cs-*`.
  - **Colores de status en los eventos del calendario (mes y vista
    día/semana)** — genuinamente dinámicos (vienen de la configuración de
    Status) → CSS variables: `--event-bg`, `--event-color`, `--event-border`.
    En la vista día/semana, además la posición/alto del evento
    (`top`/`height`, calculados en px según la hora) se pasó también como
    variables (`--event-top`, `--event-height`) en vez de propiedades style
    sueltas, por consistencia con el resto del archivo.
  - **Objeto `s` eliminado por completo** (overlayCentered, modal70, header,
    title, body, footer, footerBetween, label, inputWrapper, icon, input,
    btnPrimary, btnOutline, btnDangerLight, closeBtn, detailBanner,
    detailItem, detailLabel, detailValue, noteBoxGray, noteBoxOrange,
    filterCard, filterFieldLabel, filterDateInput) → todas a clases `cv-*`.
    `s.btnPrimary` calculaba `opacity: isSaving ? 0.7 : 1`; como los 3 botones
    que lo usan ya tenían `disabled={isSaving}`, pasó a
    `.cv-btn-primary:disabled{opacity:.7}`.
  - **Nota de diseño:** este archivo NO reutiliza `.modal-70` global (el que
    se creó en `App.css` durante la limpieza de duplicados) porque su sombra
    tiene una sola capa (`0 20px 25px -5px rgba(0,0,0,.1)`) en vez de las dos
    capas del global. Se creó `.cv-modal` local en vez de forzar la clase
    global y arriesgar un cambio visual sutil no solicitado.
  - Resultado: solo quedan 7 `style={{ '--x': ... }}` (colores/posiciones de
    datos, todos justificados). `tsc --noEmit` sin errores. `eslint` reporta
    los mismos 11 errores preexistentes, confirmado con `git stash` — mismas
    líneas de código, solo cambiaron los números de línea.

- [x] `src/views/CompanySettingsView.tsx` — 31 `style={{...}}` + 2 objetos JS
  (`label`, `input`) + `<style>` embebido. CSS movido a
  `CompanySettingsView.css`. Puntos destacados:
  - **`.company-view` solo tenía `overflow-x`/`max-width:100%`** en el
    `<style>` embebido; el padding/box-sizing/max-width real (900px)/margin
    vivían inline. Se consolidó todo en una sola regla base de la clase (nota:
    el `max-width:100%` original quedaba igualmente sobrescrito por el inline
    `900px` en el código anterior — mismo resultado final, ahora sin
    declaración duplicada).
  - **Botón hamburguesa con estilo propio real:** usaba `className=
    "hamburger-btn"` (global) pero con `border-radius:10px`/`padding:'10px
    12px'` en vez de los `8px`/`8px 12px` del global — no era un duplicado
    accidental. Se renombró a `.cs-hamburger-btn` (clase propia de este
    archivo) en vez de dejarlo pisando el nombre de la clase global, mismo
    criterio aplicado antes en `DataImportView.tsx` con
    `.hamburger-btn-compact`.
  - El botón "Guardar" calculaba `cursor`/`opacity` según `saving`, y ya tenía
    `disabled={saving}` → `.cs-btn-save:disabled{cursor:wait;opacity:.7}`.
  - Las 3 líneas "esqueleto" de la vista previa (mismo estilo, solo cambia
    `width`/`margin-top`) se separaron en 3 clases dedicadas
    (`.cs-fake-line-1/2/3`) en vez de una clase + width inline, ya que sus 3
    anchos son fijos y conocidos de antemano (no vienen de datos).
  - Resultado: **0 `style={{` restantes**. `tsc --noEmit` y `eslint` sin
    errores (antes y después, comparado con `git stash`).

- [x] `src/views/CustomersView.tsx` — 34 `style={{...}}` + objeto `s`
  (th/td/label/input) + `<style>` embebido (ya habíamos limpiado sus
  duplicados de `.hamburger-btn`/`.view-header-title-group`/`.col-span-full`
  en una pasada anterior). CSS movido a `CustomersView.css`. Puntos
  destacados:
  - **3 casos donde el inline pisaba una clase global/local con un valor
    distinto** (mismo patrón de "no es duplicado, es variante real" visto en
    `RolesView`/`DataImportView`): `.dashboard-actions-wrapper` (gap 12 vs 16
    del global), `.search-box-container` (diseño propio, no coincide con
    `.search-box` de `App.css`) y `.responsive-table` (base solo inline). En
    vez de dejar el inline pisando la clase por casualidad de orden de carga,
    se usó el patrón de **selector combinado** (`.cx-header-actions
    .dashboard-actions-wrapper`, `.cx-search-box.search-box-container`,
    `.cx-table.responsive-table`) que garantiza cuál gana sin depender del
    orden de imports.
  - **Tipo de cliente (Commercial/Residential, 2 valores finitos)** → clases
    `.cx-type-badge.commercial` / `.residential` en vez de un ternario de
    colores en JS.
  - **Celda de acciones con `gap:12` pisando el `gap:4` de `.td-content`:**
    iguales patrón de selector combinado, `.td-content.cx-actions-cell`.
  - Color del cliente (dato de Firestore) → única variable CSS restante
    (`--dot-color`).
  - Resultado: solo 1 `style={{` remanente (el color del cliente). `tsc
    --noEmit` sin errores. `eslint` reporta los mismos 4 errores preexistentes
    (`no-explicit-any` + `no-unused-vars`), confirmado con `git stash` —
    mismas líneas de código, solo cambiaron los números de línea.

- [x] `src/views/DataImportView.tsx` — **114 `style={{...}}`** (el archivo
  más grande de todos) + objeto `s`
  (card/label/input/select/btnPrimary/btnSecondary/stepBadge/th/td) + una
  función `filterPill` con estilos inline + un objeto `STATUS_UI` (colores
  por estado) + `<style>` embebido (ya habíamos renombrado su
  `.hamburger-btn-compact` en una pasada anterior). 5 pasos de wizard
  (Upload/Mapping/Preview/Importing/Done). CSS movido a `DataImportView.css`
  (~90 clases, prefijo `di-`). Puntos destacados:
  - **`s.stepBadge(active, complete)` (función que devolvía un objeto de
    estilo) → modificadores de clase** `.di-step-badge.active`/`.complete`,
    ya que activo/completo/pendiente es un estado de 3 valores conocido, no
    un dato arbitrario.
  - **`STATUS_UI` (colores fijos para matched/custom/skipped)** → como es una
    tabla fija de 3 estados (no datos de usuario), se volvieron clases
    directamente (`.di-status-badge.matched/.custom/.skipped`,
    `.di-row.matched/.custom/.skipped`) en vez de variables CSS — a
    diferencia de los colores de status en `CalendarView`/`PipelineBoardView`
    que sí vienen de Firestore y sí ameritan variables.
  - **`filterPill(key, label, count, color)`** — el color de acento por pill
    SÍ se mantuvo como variable CSS (`--pill-color`) porque la función es
    genérica y reutilizable con cualquier color, a diferencia de `STATUS_UI`
    que es una tabla fija ya conocida de antemano.
  - **Hover simulado con JS eliminado:** el botón "Import N records" mutaba
    `backgroundColor` a mano en `onMouseEnter`/`onMouseLeave` → ahora
    `.di-btn-import:hover` en CSS.
  - **Barra de progreso:** el único valor genuinamente calculado en runtime
    (`width` según `current/total`) se pasó como variable CSS
    (`--progress-width`), todo lo demás (altura, colores, transición) quedó
    en la clase `.di-progress-fill`.
  - **Simplificación real:** el borde entre errores del listado final
    (`i < errors.length - 1 ? '1px solid #fecaca' : 'none'`) se reemplazó por
    `.di-error-item:not(:last-child)`, eliminando la dependencia del índice.
  - **3 elementos "disabled calculado" → `:disabled` nativo:** el botón de
    descargar plantilla (opacity/cursor según `!exportCollection`), el select
    de campo destino en cada fila (opacity según `isSkipped`, ya
    `disabled={isSkipped}`) y el botón "Preview Data" (según
    `!selectedCollection`) — todos ya tenían el atributo `disabled` con la
    misma condición exacta.
  - **Unificación menor:** varios `<strong>` usaban `color:'#0f172a'` a veces
    con `fontWeight:600` explícito y a veces sin él (heredando el bold nativo
    ~700 de `<strong>`). Se unificó todo bajo `.di-accent-dark{color:#0f172a;
    font-weight:600;}` — diferencia visual imperceptible (600 vs 700) pero
    elimina la inconsistencia sin necesidad de dos clases casi idénticas.
  - Resultado: solo 2 `style={{` restantes (`--pill-color` y
    `--progress-width`, ambos justificados). `tsc --noEmit` sin errores.
    `eslint` reporta los mismos 15 problemas preexistentes (14 errores + 1
    warning), confirmado con `git stash` — mismas líneas de código, solo
    cambiaron los números de línea.

- [x] `src/views/HousesView.tsx` — **EL ARCHIVO MÁS GRANDE DEL PROYECTO**:
  3767 líneas, empezó con **427 `style={{...}}`** + un objeto `s` gigante
  (usado en TODO el archivo, incluidos varios modales) + un `<style>`
  embebido que define clases COMPARTIDAS por todo el componente (`.status-modal`,
  `.modal-90`, `.modal-full`, `.houses-view`, `.filters-section`, etc.) +
  varios sub-componentes internos con sus propios hooks de estado.
  Dado el tamaño (~4× el archivo más grande anterior, `DataImportView.tsx`),
  se acordó con el usuario dividir la conversión en **varias pasadas por
  sección**, en vez de un solo intento arriesgado. Progreso:
  - **[x] Parte 1 — Vista principal** (dashboard header, badge de
    sync offline/pendientes, buscador, botón "New Job", grid de KPIs,
    columna izquierda "Daily Jobs" con filtros + vista tabla (desktop) +
    vista tarjetas (móvil), columna derecha "Active Teams"). CSS movido a
    `HousesView.css` (incluye TODO el `<style>` embebido original, ya que
    define clases compartidas por el resto del archivo que aún no se ha
    convertido — no se puede mover a pedazos sin romper los modales
    pendientes).
    - **2 hovers simulados con JS eliminados:** las tarjetas KPI (borde de
      color al pasar el mouse) y los ítems de equipo en "Active Teams"
      (borde + sombra al pasar el mouse) → ahora `:hover` real en CSS.
    - **Colores de datos (status, equipo)** → CSS variables (`--kpi-color`,
      `--team-color`, `--job-border`, etc.), igual patrón que en
      Calendar/PipelineBoard/PropertyDetailModal.
    - **2 badges "High priority" con colores distintos** (rojo en la tabla
      principal, naranja en la lista de equipos) — se detectó que NO eran el
      mismo componente visual pese al nombre similar, así que se crearon
      2 clases separadas (`.hv-badge-high` rojo, `.hv-badge-high-orange`
      naranja) para no fusionarlos por error.
    - `s.pillBtn` (tabs "All/Status") convertido por completo a
      `.hv-pill-btn` + `.active` ya que solo se usaba en esta sección.
    - Resultado de esta parte: **427 → 338 inline styles** (89 eliminados).
      `tsc --noEmit` sin errores. `eslint`: mismos 79 problemas preexistentes,
      confirmado con `git stash` (solo cambiaron números de línea).
  - **[x] Parte 2 — Form Modal "Work Order"** (crear/editar propiedad; 6
    tarjetas: General Info, Logistics & Settings, Schedule & Team [+ sección
    de Assigned Workers con buscador y dropdown], Billed Services [tabla],
    Notes, Photos; más el sidebar derecho "Job Summary" con costos y
    botones Save/Cancel). ~104 inline styles en esta sección → **0**. Puntos
    destacados:
    - Se crearon `.hv-label`/`.hv-input-wrap`/`.hv-input-icon`/`.hv-input`
      (paralelos a `s.label`/`s.inputWrapper`/`s.icon`/`s.input`) para no
      depender del objeto `s` en las partes ya convertidas — se reutilizarán
      en las partes 3-7 según haga falta.
    - **Hover simulado con JS eliminado:** las opciones del dropdown de
      "Assigned Workers" (buscador de empleados) mutaban `backgroundColor` a
      mano según `isAssigned` → ahora `.hv-worker-option:hover` +
      `.assigned` en CSS, preservando la misma prioridad que tenía la lógica
      JS (asignado se mantiene resaltado incluso en hover).
    - **Tabla de Billed Services:** color del monto de impuesto (rojo si
      `taxAmount > 0`, gris si no) → modificadores `.tax.positive`/`.neutral`
      en vez de `color` calculado inline.
    - Grids con distintos `minmax` (300px/200px/280px según la tarjeta) →
      una sola clase base `.hv-form-grid` + modificadores `.cols-300`/
      `.cols-200`/`.cols-280`, evitando 3 clases redundantes casi idénticas.
    - Resultado: 234 inline styles restantes en TODO el archivo (venía de
      338 tras la parte 1). `tsc --noEmit` sin errores. `eslint`: mismos 79
      problemas preexistentes, confirmado con `git stash`.
  - **[x] Parte 3 — Detail Modal** (header con acciones de workflow
    Sync/Start/Finish/Pay/Duplicate, banner prominente de status, 3 tabs
    Overview/Financials/Media, cada uno con sus propias tarjetas/tablas).
    ~126 inline styles en esta sección → 2 (más 1 CSS var ya contado).
    Puntos destacados:
    - **Clases compartidas creadas para TODOS los modales restantes**
      (Detail/Customer/Service/Payroll/FieldConfig): `.hv-modal-header`,
      `.hv-modal-title`, `.hv-modal-footer`, `.hv-modal-footer-between`,
      `.hv-btn-primary-modal`, `.hv-btn-outline-modal`,
      `.hv-btn-danger-light-modal` — equivalentes de clase de `s.header`,
      `s.title`, `s.footer`, `s.footerBetween`, `s.btnPrimary`,
      `s.btnOutline`, `s.btnDangerLight`. Se usan ya en Detail Modal; se
      reutilizarán directamente en las partes 4-7 (mismo diseño exacto).
    - **Simplificación documentada:** `s.btnPrimary` calculaba
      `opacity: isSaving ? 0.7 : 1` en el objeto compartido, pero no todos
      los botones que lo usan tienen `disabled={isSaving}` (ej. "Edit
      Details" nunca estuvo realmente deshabilitado, solo se atenuaba
      visualmente por compartir el objeto de estilos con otros botones que
      sí lo estaban). `.hv-btn-primary-modal:disabled{opacity:.7}` replica el
      comportamiento correcto (atenuar solo cuando el botón específico está
      deshabilitado) — el botón "Edit Details" deja de atenuarse
      "por simpatía" cuando se guarda algo en otra parte del modal, lo cual
      era una rareza cosmética menor del código original, no un
      comportamiento buscado.
    - **4 estados de botones de acción del header (Sync/Start/Finish/Pay/
      Duplicate)** → clase base `.hv-action-btn` + modificadores por tipo y
      estado (`.start.done`, `.finish.done`), reemplazando los objetos
      `{...s.actionBtn, backgroundColor: ...}` calculados en cada render.
    - **KPIs financieros (Revenue/Payroll/Profit)** → incluido el caso
      dinámico de Profit (positivo/negativo, 2 estados) con clases
      `.hv-fin-kpi-card.profit.positive/.negative`.
    - Reuso directo de clases ya creadas en la Parte 2
      (`.hv-worker-option`, `.hv-worker-chip`, `.hv-workers-none-text`,
      `.hv-btn-toggle-workers`, `.hv-workers-header`) para la sección de
      "Specific Assigned Workers", que tiene una estructura casi idéntica.
    - Resultado: 110 inline styles restantes en TODO el archivo (venía de
      234). `tsc --noEmit` sin errores. `eslint`: **75 problemas** (bajó de
      79) — mejora neta, no regresión; probablemente varias expresiones
      `style={{...}}` con casts `any` desaparecieron al convertir a clases.
  - **[x] Parte 4 — Customer Modal + Service Modal + Payroll Modal** (los 3
    modales pequeños/medianos restantes, hechos juntos en una misma pasada).
    ~38 inline styles → 0. Puntos destacados:
    - Los 3 reutilizan directamente las clases compartidas creadas en la
      Parte 3 (`.hv-modal-header`, `.hv-modal-title`, `.hv-modal-footer(-
      between)`, `.hv-btn-primary-modal` [+ modificador `.green` ya
      existente para los 2 casos que pintan el botón de guardar en verde],
      `.hv-btn-outline-modal`, `.hv-label`, `.hv-input-wrap`, `.hv-input-
      icon`, `.hv-input`, `.hv-required`, `.hv-full-col`) — cero
      duplicación, tal como se planeó.
    - `s.segmentBtn`/`s.segmentContainer` (toggle Yes/No de impuestos en
      Service Modal, solo usado ahí) → `.hv-segment-btn` +
      `.active.yes`/`.active.no` (2 colores según el tipo de segmento).
    - 2 inputs sin ícono que sobreescribían `paddingLeft:'14px'` de `s.input`
      (que por defecto reserva espacio para un ícono a la izquierda) →
      modificador `.hv-input.no-icon`.
    - Resultado: **72 inline styles restantes en TODO el archivo** (venía de
      110). `tsc --noEmit` sin errores. `eslint`: 75 problemas, igual que la
      Parte 3 (sin regresión), confirmado con `git stash`.
  - **[x] Parte 5 — Field Config Modal + Cámara Ráfaga + objeto `s`
    eliminado.** La Field Config Modal (visibilidad de campos/botones por
    rol) reutilizó las clases compartidas ya creadas (`.hv-modal-header`,
    `.hv-modal-title`, `.hv-modal-footer`, `.hv-btn-primary-modal`,
    `.hv-btn-outline-modal`, `.hv-modal-body-padded`) y sumó
    `.hv-role-toggle` + `.hidden` (2 estados: rol oculta/no oculta el
    elemento). Además se encontró y convirtió la **cámara rápida en
    pantalla completa** (overlay de captura ráfaga con contador de fotos),
    que no estaba en el plan original de 5 modales pero vivía en el mismo
    archivo — se le crearon sus propias clases `hv-camera-*`.
    Al terminar, se confirmó que el objeto `s` (líneas ~1817-1869) ya no
    tenía ningún uso (`grep` de todas sus propiedades) y **se eliminó por
    completo**, junto con las funciones `s.kpiIconBox`, `s.pillBtn`,
    `s.segmentBtn`, `s.detailTab` que calculaban estilos en cada render.
    Resultado: **46 inline styles restantes** (venía de 72). `tsc --noEmit`
    sin errores. `eslint`: 75 problemas, igual que las partes 3-4 (sin
    regresión).
  - **[x] Parte 6 — Los 4 sub-componentes internos fuera del `return`**
    (`SearchableSelect`, `CustomSelect`, `StatusPillSelector`,
    `StatusChangeModal`, líneas ~116-382, no contemplados en el plan
    original de "5 modales"). Puntos destacados:
    - **`StatusPillSelector`** era el más complejo: construía un objeto
      `baseStyle` completo con ternarios por `large`/`fullWidth` en cada
      render, más un hover simulado con JS (`onMouseEnter/Leave` mutando
      `filter`). Se separaron las diferencias **estructurales** (padding,
      border-radius, font-size — dependen del modo, no de datos) en
      modificadores de clase (`.large`, `.full`), y las diferencias de
      **color** (dependen de `status.color`, dato arbitrario) en variables
      CSS (`--pill-bg`, `--pill-border`, `--pill-text`, `--pill-shadow`,
      `--dot-color`, `--dot-ring`). El hover se convirtió en
      `:hover:not(.disabled)` en CSS.
    - **`SearchableSelect`/`CustomSelect`**: mismo patrón ya usado en
      `CalendarView.tsx`/`PipelineBoardView.tsx` — hover simulado con JS
      eliminado a favor de `:hover` en CSS.
    - **`StatusChangeModal`**: ya usaba varias clases compartidas
      (`status-modal`, `status-option`, `status-btn-accept`, etc.) definidas
      en el `<style>` que se había movido en la Parte 1, pero esas clases
      compartidas **solo tenían las reglas de `@media` móvil** — la base de
      escritorio seguía siendo 100% inline. Se completaron las clases
      compartidas (`.status-option` ganó su regla base completa +
      modificador `.selected`; `.status-btn-accept:disabled` ganó la
      `opacity` que le faltaba) en vez de crear clases nuevas duplicadas,
      ya que estas clases posiblemente se reutilizan en otras vistas que
      también tienen su propio "modal de cambio de estado" con el mismo
      diseño (`PipelineBoardView.tsx`, `PropertyDetailModal.tsx`).
    - Se detectó y eliminó una duplicación de la propia limpieza: al mover
      código se había dejado `.status-option{font-family:inherit;}` y
      `.status-btn-accept:disabled{...}` (sin opacity) declarados dos veces
      en el CSS — se consolidó en una sola definición completa.
    - Resultado: **10 inline styles restantes en TODO el archivo** (venía de
      46), todos variables CSS de datos (colores de status/equipo/KPI)
      correctamente justificadas. `tsc --noEmit` sin errores. `eslint`: 75
      problemas, igual que las partes 3-5 (sin regresión).

  **`HousesView.tsx` completo: 427 → 10 inline styles (97.7% de reducción),
  objeto `s` de 55 líneas eliminado, 3 hovers simulados con JS convertidos a
  CSS real, ~250 clases nuevas organizadas en `HousesView.css` con prefijo
  `hv-`.**
  - **Importante:** el objeto `s` (líneas ~1817-1869) sigue existiendo — NO
    eliminar hasta que la ÚLTIMA parte esté convertida, porque partes 2-7
    todavía lo usan (`s.header`, `s.body`, `s.footer`, `s.label`, `s.input`,
    `s.btnPrimary`, `s.infoCard`, `s.detailLabel`, `s.segmentBtn`,
    `s.detailTab`, etc.).

- [x] `src/components/PhotoSection.tsx` — Patrón distinto a Header: este
  componente ya trae su propio `<style>` scoped con clases `.ps-*` (no toca
  App.css/index.css, es autocontenido). Tenía 7 inline styles, todos eliminados:
  - 2 eran **estáticos** disfrazados de dinámicos: el badge "pend." (`.ps-pending`)
    y el botón "Reporte PDF" (`.ps-btn-pdf`) — se movieron tal cual a clases.
  - 2 eran los `<input type="file">` ocultos (`style={{display:'none'}}`) →
    clase `.ps-hidden-input`.
  - 3 eran realmente dinámicos: el color de acento según `type` ('before'/'after')
    usado en el punto del título, el botón "Subir" y el botón "Cámara"; y el
    fondo del toggle "en reporte" según `excluded`.
    Como ambos casos son de **cardinalidad finita** (2 valores), se aplicó el
    mismo patrón de "clase base + modificador" que ya usa el proyecto
    (`.tag.team`, `.property-card.border-red`):
    - Se eliminó el objeto `ACCENTS` de JS. Ahora `<div className={photo-section ${type}}>`
      y las reglas `.photo-section.before` / `.photo-section.after` definen
      variables CSS (`--ps-accent-main/soft/border`) que consumen `.ps-dot`,
      `.ps-btn-upload`, `.ps-btn-camera`.
    - El toggle de reporte pasó a `.ps-report.included` / `.ps-report.excluded`.
  - Resultado: 0 inline styles en el archivo, sin tocar CSS global. Verificado
    con `grep "style={{"` (sin matches) y `tsc --noEmit` (sin errores).
  - **Follow-up (mismo día):** el CSS scoped estaba como `<style>{`...`}</style>`
    embebido directamente en el JSX — no es CSS Modules, es un `<style>` real
    inyectado en el DOM cada render. Problema: si el componente se monta 2 veces
    en pantalla (caso típico: uno para "before" y otro para "after"), duplica el
    bloque de CSS en el DOM. Se movió todo el contenido a
    `src/components/PhotoSection.css` + `import './PhotoSection.css'` al tope del
    archivo. Mismas clases, mismo comportamiento, sin duplicación en runtime.
    Verificado con `tsc --noEmit` (sin errores).

- [x] `src/views/InvoicesView.tsx` — 107 `style={{...}}` + objeto `s`
  (label/inputWrapper/icon/input/th/td/header/title/body/closeBtn/
  detailBanner/detailItem/detailLabel/detailValue/noteBoxGray/noteBoxOrange) +
  2 funciones generadoras de estilo (`pillFilterBtn`, `countBadge`) + 2
  componentes internos con dropdown y hovers simulados en JS
  (`InvoiceStatusPill`, `JobStatusPill`) + un `<style>` embebido que ya venía
  parcialmente limpio de una pasada anterior (solo `.modal-overlay-centered`,
  `.inv-cards-wrap`/`.inv-table-wrap` toggling, y los breakpoints propios
  `820px`/`480px` de esta vista, distintos del `768px` global — igual que se
  documentó para `CalendarView`, se preservaron intactos). CSS movido a
  `InvoicesView.css` (~130 clases, prefijo `inv-`). Puntos destacados:
  - **`InvoiceStatusPill`/`JobStatusPill`** (dropdowns de status, casi
    idénticos entre sí): 4 hovers simulados con JS eliminados → `:hover` real
    en CSS. Color dinámico del status (dato de config) → CSS variables
    (`--pill-border`, `--pill-bg`, `--pill-bg-hover`, `--dot-color` en
    `InvoiceStatusPill`; solo `--dot-color` en `JobStatusPill`, que por lo
    demás es 100% estático blanco/gris). Mismo patrón de "hover siempre gana
    sobre el estado seleccionado" que en `PropertyDetailModal`/`DataImportView`:
    `.inv-pill-option:hover` se declaró después de `.inv-pill-option.current`
    en el CSS para que la regla de hover tenga prioridad al pasar el mouse.
  - **`pillFilterBtn`/`countBadge`** (igual patrón que `filterPill` en
    `DataImportView`): el color es genérico/reutilizable (Pre-Paid/Needs
    Invoice/Pending/Paid + "All"), así que se mantuvo como variable CSS
    (`--pill-color`, más `--pill-color-15`/`--pill-color-20` ya calculados en
    JS con el sufijo de alpha en hex, igual que en otros archivos) en vez de
    clases fijas — a diferencia de `STATUS_UI` en `DataImportView`, que sí era
    una tabla fija y se volvió clases directas.
  - **Objeto `s` eliminado por completo** → clases `inv-label`,
    `inv-input-wrap`, `inv-input-icon`, `inv-input`, `inv-th`(+`.center`/
    `.right`), `inv-td`(+ modificadores), `inv-modal-header`, `inv-modal-title`,
    `inv-modal-body`, `inv-modal-close`, `inv-detail-banner`, `inv-detail-item`,
    `inv-detail-label`(+`.blue`/`.orange`/`.spaced`), `inv-detail-value`(+`.small`),
    `inv-note-box`(+`.orange`).
  - **Estado finito (profit positivo/negativo, 2 valores)** en tabla, tarjetas
    y modal de detalle → modificadores `.positive`/`.negative` en vez de
    ternarios de color inline, mismo patrón que `PipelineBoardView`/
    `CalendarView`.
  - **Fila de tabla con hover simulado + botones de acción con hover
    simulado** (Eye/Edit2/Trash2, 3 handlers cada uno) → todos a `:hover` real
    en CSS (`.inv-row:hover`, `.inv-icon-btn.view/.edit/.delete:hover`).
  - Reuso de clases ya globales: `.modal-70`, `.grid-3-cols`, `.col-span-full`,
    `.modal-overlay-centered` (sin cambios, ya estaban bien aplicadas).
  - **1 leftover corregido en el detalle:** un `<div style={{marginTop:'4px'}}>`
    que envolvía el chip de status se había quedado sin convertir en la
    primera pasada; se movió a `.inv-mt-4` antes de la verificación final.
  - Resultado: **8 `style={{` restantes**, todos variables CSS de datos
    (colores de status/prioridad/equipo/pill-filter) correctamente
    justificadas. `tsc --noEmit` sin errores. `eslint` reporta los mismos 13
    errores `no-explicit-any` preexistentes, confirmado con `git stash` —
    mismas líneas de código, solo cambiaron los números de línea.

- [x] `src/views/NoticeBoardView.tsx` — 50 `style={{...}}` + un `<style>`
  embebido con clases genuinamente scoped (`.post-card`, `.post-header`,
  `.post-avatar`, `.post-body`, `.post-actions`, `.action-btn`,
  `.comments-section`, `.comment-bubble` — no pisan nada global, mismo
  patrón que `PhotoSection.tsx`). CSS movido a `NoticeBoardView.css`
  (import al tope), conservando esas clases tal cual y sumando ~45 clases
  nuevas (prefijo `nb-`). Puntos destacados:
  - **Sin colores de datos reales:** a diferencia de la mayoría de archivos
    anteriores, aquí no hay colores de Firestore — todos los "dinámicos" son
    en realidad estados finitos (2-3 valores), así que **cero variables CSS**
    fueron necesarias, resultado en 0 `style={{` restantes.
  - **Botón "Like" (2 estados: gustado/no)** → `.nb-action-btn-flex.liked`/
    `.default` en vez de `color: hasLiked ? ... : ...` inline. El `fill` del
    ícono `ThumbsUp` se dejó como prop de componente (no es un `style`, lo
    acepta directamente `lucide-react`).
  - **Botón "Publish Announcement" y botón de enviar comentario** calculaban
    `opacity`/`color` según una condición que YA estaba en su atributo
    `disabled` (mismo patrón visto en casi todos los archivos anteriores) →
    `.nb-publish-btn:disabled{opacity:.5}`. El botón de enviar comentario es
    un caso mixto: su `disabled` cubre "guardando o vacío", pero el color
    azul/gris visualmente solo depende de "vacío o no" — se mantuvo como
    modificador de clase `.active` (no `:disabled`) para no acoplar el color
    a un estado (`isSaving`) que no lo determina en la versión original.
  - **Botón "Mark as Seen" / indicador "Seen by you"** (2 variantes según
    `hasSeen`) → `.nb-action-btn-flex.seen-btn` / `.nb-seen-indicator`.
  - **Badge "ADMIN"** condicional al nombre del autor → estático, ya no
    depende de nada dinámico salvo su renderizado condicional (`.nb-admin-badge`).
  - Resultado: **0 `style={{` restantes**. `tsc --noEmit` sin errores.
    `eslint` reporta 0 problemas, igual que antes del cambio (comparado con
    `git stash`).

- [x] `src/views/PayrollView.tsx` — 114 `style={{...}}` + objeto `s`
  (input/label/th/td/header/title/body/detailBanner/detailItem/detailLabel/
  detailValue/noteBoxGray/noteBoxOrange/btnPrimary/btnOutline/closeBtn) +
  1 hover simulado con JS (fila de tabla) + 1 hover simulado con JS (botón
  "View Property") + un `<style>` embebido que solo reinyectaba
  `.modal-overlay-centered` (regla ya existente globalmente, mismo patrón de
  duplicación detectado antes con `.hamburger-btn`/`.view-header-title-group`
  — aquí se eliminó el `<style>` embebido por completo). CSS movido a
  `PayrollView.css` (~90 clases, prefijo `pv-`). El archivo tiene 3 modales
  read-only/CRUD casi idénticos en estructura a los ya vistos en
  `InvoicesView`/`HousesView` (mismo patrón "Property Overview"). Puntos
  destacados:
  - **Objeto `s` eliminado por completo** → clases `pv-label`, `pv-input`,
    `pv-th`(+`.actions`/`.right`/`.center`), `pv-td`(+ modificadores),
    `pv-modal-header`, `pv-modal-title`, `pv-modal-body`, `pv-modal-close`,
    `pv-modal-footer`, `pv-detail-banner`, `pv-detail-item`, `pv-detail-label`
    (+`.blue`/`.orange`/`.spaced`), `pv-detail-value`(+`.small`), `pv-note-box`
    (+`.orange`), `pv-btn-primary-modal`(+`.green`), `pv-btn-outline-modal`.
  - **2 hovers simulados con JS eliminados:** la fila de la tabla principal
    (`onMouseEnter/Leave` mutando `backgroundColor`) → `.pv-row:hover`; el
    botón "View Property" del modal de detalle de pago → `.pv-view-property-btn:hover`.
  - **2 variantes reales del footer de modal detectadas y preservadas por
    separado, no fusionadas:** los footers de "Payment Details"/"Edit
    Payment" usan `background-color:#f9fafb` (→ `.pv-modal-footer` base),
    pero el de "Property Overview" usa `#f8fafc` — 1px de diferencia real,
    no un error de tipeo — se preservó como modificador `.pv-modal-footer.alt-bg`
    en vez de forzar un solo color.
  - **Botón "Close" de "Property Overview" con estilo propio real:** distinto
    de `.pv-btn-outline-modal` (`border:#e5e7eb` vs `#cbd5e1`, `color:#111827`
    vs `#334155`, `font-weight:500` vs `600`) — no era el mismo botón
    reutilizado con props distintas, así que se creó `.pv-btn-close-plain`
    en vez de forzar la clase compartida y cambiar el look sutilmente.
  - **`s.btnPrimary` con 2 variantes de color** (verde en "Mark as Paid" del
    modal de detalle, azul —igual al color base— en "Save Changes" del
    modal de edición) → `.pv-btn-primary-modal` base ya es azul, se agregó
    `.green` solo donde hacía falta.
  - Colores de datos (prioridad/equipo) en el modal "Property Overview" →
    únicas 2 variables CSS restantes (`--dot-color`).
  - **Hallazgo transversal (anotado, no corregido):** la regla base de
    `.modal-overlay-centered` sigue duplicada textualmente en varios
    `.css` ya migrados (`InvoicesView.css`, `HousesView.css`,
    `CustomersView.css`, `admin/UsersView.css`) — cada vista la trae en su
    propio `<style>`/`.css` en vez de vivir una sola vez en `App.css`. No es
    un problema introducido por esta tarea (ya era así antes de convertir
    cada archivo) y consolidarlo tocaría 5 archivos a la vez, fuera del
    alcance de esta pasada — candidato para una futura limpieza dedicada,
    igual que la nota ya dejada sobre `.modal-90`/`.modal-70` en móvil.
  - Resultado: **2 `style={{` restantes**, ambos CSS variables de datos
    (`--dot-color` de prioridad/equipo). `tsc --noEmit` sin errores. `eslint`
    reporta los mismos 35 problemas (34 errores + 1 warning) preexistentes,
    confirmado con `git stash` — mismas líneas de código, solo cambiaron los
    números de línea.

- [x] `src/views/PhotoSettingsView.tsx` — 39 `style={{...}}`, el más pequeño
  y simple de esta tanda (238 líneas, sin objeto `s`, sin `<style>` embebido).
  CSS movido a `PhotoSettingsView.css` (prefijo `ps-`). Puntos destacados:
  - **Todos los "dinámicos" eran en realidad 2 estados finitos** (toggle
    activado/desactivado): las 2 filas de opciones (Tomar Foto/Cargar
    Dispositivo, cada una con su color de acento propio azul/verde) y el
    componente `ToggleSwitch` (posición del knob + color de fondo según
    `checked`) → modificadores de clase (`.active-blue`/`.active-green` en
    la fila, `.blue`/`.green` en el ícono, `.on` en el switch y su knob) en
    vez de ternarios de color calculados en cada render. Cero variables CSS
    necesarias (no hay colores de datos/Firestore en este archivo).
  - **Botón "Guardar" con `cursor`/`opacity` calculados según `isSaving`**
    (que ya tenía `disabled={isSaving}`) → `.ps-save-btn:disabled{cursor:
    not-allowed;opacity:.7}`, mismo patrón visto en casi todos los archivos
    anteriores.
  - **Autocorrección durante la propia conversión:** al mover `cursor` del
    botón guardar se creó por accidente una regla `.ps-save-btn:disabled`
    duplicada (una solo con `cursor`, otra completa con `cursor`+`opacity`)
    — detectado y consolidado en una sola antes de la verificación final,
    mismo tipo de auto-chequeo aplicado en `HousesView.tsx` Parte 6.
  - Resultado: **0 `style={{` restantes**. `tsc --noEmit` sin errores.
    `eslint` reporta el mismo 1 error preexistente (`no-unused-vars` en el
    catch de `handleSave`), confirmado con `git stash` — misma línea de
    código, solo cambió el número de línea.

- [x] `src/views/QCDashboardView.tsx` — 65 `style={{...}}` + un `<style>`
  embebido ya limpio (clases genuinamente propias del dashboard: `.qcd-grid-*`,
  `.qcd-tabs`, `.qcd-tab`, `.qcd-sel`, `.qcd-table` — se movieron tal cual a
  `QCDashboardView.css`, prefijo `qcd-`). Caso distinto a la mayoría de vistas
  anteriores: este archivo es un dashboard de analítica con varios
  sub-componentes UI reutilizables definidos dentro del componente
  (`KPICard`, `BarList`, `HeatList`, `TrendChart`, `Card`, `Empty`), cada uno
  recibiendo un `color`/`tone` **genérico** como prop (no un enum fijo de la
  app, sino cualquier valor de la paleta `PALETTE` según quién lo invoque).
  Puntos destacados:
  - **`KPICard`** (llamado ~12 veces con colores distintos): `color` (fondo
    del ícono al 10% alpha) y `tone` (color condicional del valor grande,
    con umbrales que varían por KPI — a veces 3 tramos, a veces 2, a veces
    fijo) → CSS variables (`--kpi-icon-bg`, `--kpi-tone`), igual criterio que
    `pillFilterBtn` en `DataImportView`/`InvoicesView`: es un componente
    genérico reutilizable, no una tabla fija de estados conocidos de
    antemano.
  - **`BarList`**: el `width` de la barra (porcentaje calculado en runtime
    según `count/max`) y su `color` (parámetro genérico) → `--bar-width`/
    `--bar-color`.
  - **`HeatList`**: a diferencia de los anteriores, aquí SÍ había un enum
    fijo de 3 tramos (`ratio > 0.66/0.33/resto`) con 3 combinaciones de
    color ya fijas en el propio código (no vienen de fuera) → se convirtieron
    en clases modificadoras reales (`.qcd-heat-row.high/.mid/.low`) en vez de
    variables, y solo el color de texto (que reutiliza esos mismos 3 valores)
    quedó como variable `--heat-text` por simplicidad de no triplicar
    selectores por 2 elementos hijos.
  - **`Card`**: el color del ícono es igual de genérico que en `KPICard`,
    pero como el ícono ya acepta `color` como prop directo del componente
    lucide (no un `style`), no hizo falta ninguna variable ahí — se dejó tal
    cual.
  - **Tabla "Rendimiento por equipo"**: `passColor`/color de recalls (3 y 2
    tramos respectivamente, calculados inline en cada fila) → variable
    `--tone-color` reutilizando la misma clase `.qcd-td-tone` para ambos
    casos.
  - Resultado: **6 `style={{` restantes**, todos CSS variables de datos/
    parámetros genéricos de componentes reutilizables (`--kpi-icon-bg`,
    `--kpi-tone`, `--bar-width`/`--bar-color`, `--heat-text`, `--tone-color`).
    `tsc --noEmit` sin errores. `eslint` reporta los mismos 23 problemas
    (20 errores + 3 warnings) preexistentes, confirmado con `git stash` —
    mismas líneas de código, solo cambiaron los números de línea.

- [x] `src/views/QCRouteView.tsx` — 77 `style={{...}}` + un `<style>`
  embebido ya limpio y genuinamente propio del componente (clases
  `.route-*`/`.stop-*`, incluida la animación `route-spin` — se movieron tal
  cual a `QCRouteView.css`, prefijo `qcr-` para las clases nuevas). Vista de
  planificación de rutas GPS (Quality Check) con modo selección y modo ruta.
  Puntos destacados:
  - **Tarjeta de selección de casa (`sel` true/false)** y su checkbox interno
    → modificador `.selected` en vez de 3 propiedades (`background`,
    `border`, `boxShadow`) calculadas con ternarios en cada render.
  - **Tarjeta de parada (`stop-card`) con estado `arrived`**: el componente
    ya tenía la clase base `stop-card` pero seguía recibiendo
    `background`/`borderColor` inline calculados según `s.arrived` — se
    consolidó todo en el modificador `.stop-card.arrived` (ya existía
    `.stop-num.done` de una limpieza previa, mismo criterio aplicado ahora al
    resto de la tarjeta). El texto del cliente con `text-decoration:
    line-through` cuando `arrived` → `.qcr-stop-client.arrived`.
  - **Botón "Llegué"/"Marcar pendiente"** (2 estados de color/borde) →
    `.qcr-arrive-btn.arrived`.
  - **Botones de reordenar parada (subir/bajar)**: `cursor`/`opacity`
    calculados según `disabled` (ya usaban el atributo nativo
    `disabled={i === 0}`/`disabled={i === stops.length - 1}`) →
    `.qcr-order-btn:disabled{cursor:not-allowed;opacity:.4}`.
  - Resto del archivo (paneles de rutas guardadas, resumen de KPIs de la
    ruta, controles de nombre/velocidad, selector de "agregar parada") era
    100% estático → clases directas sin necesidad de ninguna variable CSS.
  - Resultado: **0 `style={{` restantes** (no hay colores de datos/Firestore
    en este archivo, todo lo dinámico era de cardinalidad finita).
    `tsc --noEmit` sin errores. `eslint` reporta los mismos 25 errores
    `no-explicit-any` preexistentes, confirmado con `git stash` — mismas
    líneas de código, solo cambiaron los números de línea.

- [x] `src/views/QualityCheckHub.tsx` — el más pequeño de toda la tarea (74
  líneas, solo 4 `style={{...}}`). Es un contenedor simple con 2 pestañas
  que envuelve `QualityCheckView`/`QCDashboardView` sin modificarlos. CSS
  movido a `QualityCheckHub.css` (prefijo `qch-`). Único punto de interés:
  - **`tabBtn(key, label, Icon, activeColor)`**: función que genera un botón
    de pestaña, con `activeColor` genérico (2 colores fijos pero pasados
    como parámetro reutilizable, mismo patrón que `pillFilterBtn`/`KPICard`
    en archivos anteriores) → única variable CSS restante (`--qch-active-color`),
    aplicada solo quando `active` es true (el resto de la lógica de
    active/inactive pasó a la clase `.qch-tab-btn.active`).
  - Resultado: **0 `style={{` restantes**. `tsc --noEmit` sin errores.
    `eslint` reporta el mismo 1 error preexistente (`no-explicit-any` en el
    parámetro `Icon: any`), confirmado con `git stash` — misma línea de
    código, solo cambió el número de línea.

- [x] `src/views/QualityCheckView.tsx` — **el segundo archivo más grande del
  proyecto** (3318 líneas, empezó con **276 `style={{...}}`**), superado
  solo por `HousesView.tsx`. Contiene 2 sub-componentes internos
  (`PhotoAnnotator`, `QCReportsDashboard`) + el componente principal con
  6 modales/overlays (inspección, cámara en ráfaga, cambiar status, email,
  configuración de empresa, drawer de ruta de inspección) + un `<style>`
  embebido de ~170 líneas con clases compartidas (`.qc-*`) entre varios de
  esos modales. Igual que con `HousesView.tsx`, se acordó con el usuario
  dividir la conversión en **5 partes por sección**. Progreso:
  - **[x] Parte 1 — `PhotoAnnotator`** (editor de fotos estilo WhatsApp:
    lápiz/círculo/flecha, paleta de 7 colores, lienzo, deshacer/guardar).
    12 → 1 inline style. La función `toolBtn(active)` (generaba el estilo
    del botón de herramienta) → `.qcv-pa-tool-btn` + `.active`. El único
    color realmente dinámico (swatch de paleta) → `--swatch-color`.
  - **[x] Parte 2 — `QCReportsDashboard`** (KPIs y analítica de Quality
    Check: problemas más comunes, mapa de calor por área, desempeño por
    equipo, ranking de inspectores, tendencia de recalls por mes). 42 → 8.
    Puntos destacados:
    - `heatColor(val, max)` calculaba un objeto `{bg, fg}` de 4 tramos fijos
      (>66%/>50%/>25%/resto) → se separó en `heatBand()` (4 clases
      `.band-1..4`, colores de fondo ya fijos en CSS) + `heatFg()` (color de
      texto, único que quedó como variable `--heat-fg` para no triplicar
      selectores).
    - Los 6 KPIs (`color`/`bg` por tarjeta) y el ranking de inspectores/tabla
      de equipos (colores de "pass rate" con 2-3 umbrales) → variables CSS
      (`--kpi-color`, `--kpi-bg`, `--tone-color`), mismo criterio de
      "función/tabla genérica reutilizable" aplicado en `QCDashboardView.tsx`.
    - Barra de "problemas más comunes" y barra de tendencia mensual (ancho/
      alto calculados en runtime) → `--bar-width`/`--bar-height`.
  - **[x] Parte 3 — Vista principal** (header, pestañas principales
    Inspecciones/Route/Reportes, buscador + pestañas de estado, aviso de
    offline/fotos pendientes, bloques de casas Pendientes/Recall con sus
    tarjetas, tabla de registros de escritorio, tarjetas de registros
    móvil). El `<style>` embebido (~170 líneas, clases `.qc-overlay`,
    `.qc-modal`, `.qc-header`, `.qc-body`, `.qc-toolbar`, `.qc-chip`, etc. —
    compartidas por los modales de las partes 4-5) se movió tal cual a
    `QualityCheckView.css`. 104 → 4. Puntos destacados:
    - **Tarjetas de casa Pendiente/Recall** (estructuralmente casi idénticas,
      solo cambia acento azul vs. morado + un 3er estado "failed" en
      Pendiente) → clase compartida `.qcv-house-card` con modificadores
      `.recall`/`.failed`, en vez de duplicar el JSX de la tarjeta.
    - **Badge Finished/Recall** en tabla y tarjetas de registros (2 combos
      de color fijos pero definidos inline en un objeto `badge` por fila) →
      `.qcv-badge` + variables `--badge-bg`/`--badge-fg` (se mantuvo el
      objeto `badge` en JS ya que es sencillo y claro, solo se pasó su color
      como variable en vez de aplicarlo con `style` disperso).
    - Color del punto de estado de la casa (`houseStatusInfo(house).color`,
      dato configurable) → `--dot-color`, reutilizado en ambos bloques.
  - **[x] Parte 4 — Modal de inspección + cámara en ráfaga** (formulario
    principal de Quality Check: selector de áreas en chips, tarjetas por
    área con tareas Yes/No, score, notas/daños, fotos con editor/cámara/
    galería; más el overlay de cámara en ráfaga a pantalla completa, no
    contemplado en el plan original de "solo el modal" pero vive en el
    mismo bloque de JSX). 104 → 38 → 0 en esta parte específica (dropped a
    0 tras esta pasada). Puntos destacados:
    - Los botones `qc-toggle` Yes/No/Score usaban 3 funciones del objeto `s`
      (`btnYes`/`btnNo`/`btnScore`) que devolvían el mismo patrón (borde+
      fondo+texto en un color si `active`) → 3 modificadores de clase
      (`.qc-toggle.yes.active`, `.no.active`, `.score.active`), eliminando
      las 3 funciones.
    - Chip de selección de área (`sel` true/false) → `.qc-chip.selected`.
    - 3 variantes de foto (guardada/pendiente de subir/en cola offline) →
      `.qcv-im-photo-tile` + modificadores `.pending`/`.queued`.
  - **[x] Parte 5 — Modales de Status/Email/Configuración de Empresa +
    Drawer de Ruta de Inspección** (con planificador GPS + mapa Leaflet +
    resumen de tiempo/distancia + lista de paradas reordenable) — el drawer
    de ruta no estaba en el plan original de "3 modales pequeños" pero vive
    en el mismo bloque final del archivo, se incluyó en esta última parte.
    80 → 13 (total del archivo). Puntos destacados:
    - Los 3 modales pequeños (Status/Email/Empresa) comparten estructura
      casi idéntica (overlay + tarjeta blanca + header de color + footer con
      Cancelar/Guardar) → clases compartidas `.qcv-sm-modal` + modificadores
      `.wide`/`.scrollable`, `.qcv-sm-modal-header` + `.green`/`.sticky`.
    - **Objeto `s` (líneas ~2306-2323) eliminado por completo** una vez
      confirmado que sus últimos usos (`s.th`/`s.td`/`s.closeBtn`/
      `s.routeIconBtn`/`s.cardTitle`/`s.taskItem`/`s.btnYes`/`s.btnNo`/
      `s.btnScore`/`s.extraFields`/`s.labelQC`/`s.textareaQC`/`s.btnSaveQC`/
      `s.btnFailQC`/`s.pillBtn`) ya no aparecían en ningún lugar del archivo
      (verificado con `grep`) — igual metodología que el cierre de
      `HousesView.tsx`.
    - Resumen de tiempo del planificador (3 cajas Total/Manejo/Inspección) →
      clases estáticas, sin necesidad de variables (todo el color es fijo,
      solo el texto cambia).
  - **Nota de alcance:** el archivo también genera un documento HTML
    completo para exportar/imprimir el reporte (función que arma un string
    con su propio `<style>` embebido, usado por `window.open`/impresión).
    Ese bloque **no es JSX ni React** — es HTML estático servido como
    documento aparte — por lo que se dejó intacto, fuera del alcance de esta
    tarea de limpieza de `style={{...}}` en componentes React.
  - Resultado: **13 `style={{` restantes en todo el archivo** (de 276,
    95.3% de reducción), todos CSS variables de datos legítimas (colores de
    KPI/badge/status/tono, anchos/altos de barra calculados en runtime).
    `tsc --noEmit` sin errores. `eslint` reporta los mismos 106 problemas
    (103 errores + 3 warnings) preexistentes — confirmado con `git stash` y
    un diff normalizado (ignorando números de línea) que dio **idéntico**,
    cero errores nuevos introducidos.

- [x] `src/views/RecallsView.tsx` — 163 `style={{...}}` + objeto `s`
  (th/td) + un `<style>` embebido ya limpio (clases `.rc-*` genuinamente
  propias del archivo, incluidas 2 animaciones `rc-spin`/`rc-pop` — movidas
  tal cual a `RecallsView.css`). Contiene un sub-componente
  (`RowStatusPill`, dropdown de status posicionado con coordenadas
  absolutas calculadas en JS) + 2 sub-vistas (tabla/tarjetas de Recalls,
  Reporte con highlights/KPIs/ranking/bar charts/lista de casas). Puntos
  destacados:
  - **`RowStatusPill`**: igual patrón que `InvoiceStatusPill`/`JobStatusPill`
    de otras vistas — color dinámico del status → CSS variables
    (`--dot-color`, `--pill-ring`, `--dot-ring`); 1 hover simulado con JS en
    las opciones del menú eliminado a favor de `:hover` real, preservando
    "hover siempre gana sobre el estado actual" (`.rcv-pill-option:hover`
    declarado después de `.current` en el CSS). El posicionamiento del menú
    flotante (`top`/`left`/`width` calculados con `getBoundingClientRect()`
    para evitar que el overflow de la tabla lo recorte) es un cálculo
    genuinamente dinámico en píxeles → se dejó como `style={{top,left,width}}`
    normal (no aplica el patrón CSS-var, son valores de posicionamiento en
    tiempo real, no colores).
  - **`FailedQCBadge`** (badge reutilizable "Vino de QC · No pasó"): único
    estado variable es `compact` (2 tamaños) → modificador de clase.
  - **Filas de tabla con 2-3 estados de fondo + hover simulado con JS**
    (tabla principal: `fromQC` sí/no; tabla "casas en recall": `current`/
    `fromQC`/normal) → clases `.rcv-row`/`.rcv-recall-row` + modificadores,
    con `:hover` real reemplazando los `onMouseEnter`/`onMouseLeave` que
    mutaban `backgroundColor` a mano (2 casos eliminados).
  - **Objeto `s` (th/td) eliminado por completo** → clases `.rcv-th`(+
    modificadores de ancho) / `.rcv-td`(+ modificadores de alineación/color).
  - **Ranking de equipos**: `scoreColor(v)` (3 tramos fijos de color según
    score) es una función ya existente y genérica (se usa en el número de
    score, el fill de la barra y el texto) → se mantuvo la función, solo se
    pasó su resultado como variable CSS (`--score-color`) en vez de 3
    lugares con `style={{color:...}}` separados — mismo criterio que
    `passColor`/`t.recalls` en `QCDashboardView`/`QualityCheckView`.
  - **KPIs de reporte** (4 tarjetas con `color` fijo por ítem, ya no
    necesitaban variable porque el color solo lo usa el ícono lucide como
    prop directo `color={k.color}`, no un `style`) → sin inline styles
    restantes ahí.
  - **Autocorrección durante la conversión:** varios `style={{...}}`
    puramente estáticos que habían quedado sin convertir en una primera
    pasada (contenedor `.rc-toolbar`/`.rc-count` duplicando su propia
    definición CSS, 2 mensajes "empty state", el `<h2>` de "Recalls by
    Team", el párrafo de nota final) — detectados en la verificación final
    con `grep` y convertidos a clases/modificadores antes de cerrar el
    archivo.
  - Resultado: **7 `style={{` restantes**, todos justificados (variables
    CSS de colores de datos + un cálculo de posición en píxeles del menú
    flotante). `tsc --noEmit` sin errores. `eslint` reporta los mismos 68
    problemas (65 errores + 3 warnings) preexistentes — confirmado con
    `git stash` y diff normalizado (ignorando números de línea): idéntico.

- [x] `src/views/SettingsView.tsx` — 134 `style={{...}}` + 2 objetos de estilo
  (`thStyle`/`tdStyle` sueltos + el objeto `s` grande de 17 propiedades
  compartido por los 3 modales: overlayCentered/modal/modalWide/header/
  title/body/footer/formGroup/label/input/btnPrimary/btnOutline/
  btnDangerLight/closeBtn/detailItem/detailLabel/detailValue) + un
  `<style>` embebido ya limpio (media query de tabla responsive → tarjetas
  en móvil, movida tal cual). Vista de catálogo genérico con **13 tipos de
  entidad** (category/team/team_catalog/responsable/priority/status/tax/
  place/service/payment/task/product/business) todas compartiendo la misma
  tabla y los mismos 3 modales (formulario/detalle/eliminar), con altísima
  repetición literal de JSX entre filas de tabla. Puntos destacados:
  - **`CustomSelect`** (dropdown reutilizado en 2 formularios): 1 hover
    simulado con JS en las opciones eliminado a favor de `:hover` real;
    color del punto de la opción seleccionada/cada opción (dato arbitrario)
    → CSS variable `--dot-color` sobre una clase `.stv-color-dot` genérica
    con 3 modificadores de tamaño (`.sz-12/.sz-16/.sz-24`) reutilizada en
    toda la vista para cualquier punto de color (equipos, prioridades,
    status, responsables).
  - **`thStyle`/`tdStyle` + objeto `s` eliminados por completo** → clases
    `.stv-th`(+`.center`/`.right`/`.actions`), `.stv-td`(+ modificadores),
    `.stv-modal-overlay`, `.stv-modal`(+`.wide`), `.stv-modal-header`,
    `.stv-modal-title`, `.stv-modal-body`, `.stv-modal-footer`(+`.between`),
    `.stv-modal-close`, `.stv-form-group`(+`.checkbox-row`/`.spaced`),
    `.stv-label`, `.stv-input`(+`.narrow`/`.grow`), `.stv-btn-primary`(+
    `.danger`), `.stv-btn-outline`(+`.small`/`.borderless`),
    `.stv-btn-danger-light`, `.stv-detail-item`, `.stv-detail-label`,
    `.stv-detail-value`(+`.large`/`.muted-italic`/`.mono`).
  - **Menú principal de Settings**: 13 tarjetas de acceso con 1 hover
    simulado con JS (mutaba `borderColor`/`transform`/`boxShadow` a mano en
    cada una) → `.stv-menu-card:hover` real en CSS.
  - **13 filas de tabla casi idénticas**: cada tipo de entidad tenía su
    propio `<tr onMouseEnter/Leave>` mutando `backgroundColor` a mano
    (13 handlers idénticos) → un solo `.stv-row:hover` real, y una celda de
    acciones (editar/eliminar) repetida ~11 veces con los mismos estilos
    inline → `.stv-actions-cell` + `.stv-icon-btn`(+`.delete`).
  - **Badge "In Dash?" del status** (2 estados sí/no) → `.stv-dash-badge`
    + modificador `.on`.
  - Resultado: **9 `style={{` restantes**, todos la misma variable CSS
    `--dot-color` para puntos de color de datos (equipo/prioridad/status/
    responsable). `tsc --noEmit` sin errores. `eslint` reporta los mismos
    14 errores preexistentes (`no-explicit-any`) — confirmado con
    `git stash` y diff normalizado (ignorando números de línea): idéntico.

- [x] `src/views/StatusHistoryView.tsx` — 121 `style={{...}}` + un `<style>`
  embebido ya limpio (clases `.sh-*` genuinamente propias del componente:
  tarjetas, tabla estilo hoja de cálculo P&L con `<th>` sticky, chips,
  modal — movidas tal cual a `StatusHistoryView.css`). Vista de auditoría
  con tabla financiera por casa + modal de "recorrido completo" (línea de
  tiempo de todos los cambios de status + episodios de entrada/salida de
  Recall). Puntos destacados:
  - **`invoicePill(status)`** — función ya existente que devuelve un
    objeto fijo `{label, bg, color, border}` según 4 valores conocidos de
    `invoiceStatus` (Paid/Pre-Paid/Pending/Needs Invoice) + fallback. Se
    mantuvo la función tal cual (no se convirtió a clases porque el color
    depende del *string* que puede no calzar exactamente, y ya era un
    patrón centralizado) y su resultado se pasó como 3 variables CSS
    (`--pill-bg`/`--pill-color`/`--pill-border`) sobre una clase
    `.shv-invoice-pill` reutilizada en 2 lugares (tabla y modal).
  - **`onSolid`/`onTint`** (funciones de contraste de texto según
    luminancia del color de fondo, ya existentes) — se mantuvieron tal
    cual; su resultado también pasa como variable CSS en vez de
    recalcularse en cada `style` disperso.
  - **Chips de filtro de status** (`.sh-chip`, ya definida en el `<style>`
    embebido con `!important` en bg/color): el `borderColor`/`boxShadow`/
    `fontWeight` calculados dinámicamente por chip → 2 modificadores
    (`.tinted`/`.active-tinted`) + variables CSS (`--chip-border`,
    `--chip-color`, `--chip-shadow`) en vez de tocar `border-color` suelto.
  - **Journey (recorrido completo) y episodios de Recall**: el punto de
    color de cada nodo de la línea de tiempo (`n.color`, dato de status) →
    `--dot-color`/`--dot-ring`; el badge "estado inicial"/"estado actual" y
    el badge "aún en recall"/"duración" son estados finitos reales (2-3
    valores fijos, sin dependencia de datos externos) → modificadores de
    clase puros (`.shv-journey-badge.initial/.current`,
    `.shv-recall-status-badge.in/.out`, `.shv-recall-card-head.still-in`).
  - **Tabla financiera principal**: colores condicionales de Taxes/Payroll/
    Profit (2-3 tramos calculados inline con ternarios) → variable CSS
    `--tone-color` sobre clases `.shv-td-tone`/`.shv-td-profit` compartidas.
  - Resultado: **19 `style={{` restantes**, todos CSS variables de datos o
    de resultados de funciones de color ya existentes en el archivo
    (ninguno estático). `tsc --noEmit` sin errores. `eslint` reporta los
    mismos 25 problemas (24 errores + 1 warning) preexistentes — confirmado
    con `git stash` y diff normalizado (ignorando números de línea):
    idéntico.

- [x] `src/App.tsx` — **último archivo del proyecto con inline styles
  reales**, 6 `style={{...}}` + 1 `<style>` embebido (keyframe
  `spin-load`). El componente `LoadingScreen` (spinner de pantalla completa
  reutilizado en varios checkpoints de carga/autenticación) y la vista
  "Under Construction" (placeholder para tabs aún no implementados) — ambos
  100% estáticos, sin ningún color de dato. Como `App.tsx` ya importaba
  `App.css` globalmente, las clases nuevas (`.app-loading-screen`,
  `.app-loading-spinner`, `.app-loading-text`, `.app-under-construction`
  + `.app-under-construction-title`/`.app-under-construction-text`) se
  agregaron directamente ahí, junto con el `@keyframes spin-load` promovido
  a regla global (antes se re-inyectaba en el DOM cada vez que
  `LoadingScreen` se montaba, mismo problema de duplicación ya visto y
  corregido en `PhotoSection.tsx` al inicio de esta tarea).
  - Resultado: **0 `style={{` restantes, 0 `<style>` embebidos**. `tsc
    --noEmit` sin errores. `eslint` reporta los mismos 14 errores
    preexistentes (`no-explicit-any` + 1 `react-hooks/set-state-in-effect`
    de lógica no relacionada), confirmado con `git stash` — mismas líneas
    de código, solo cambiaron los números de línea.

## 🎉 Tarea de limpieza CSS completada

Con `App.tsx`, se cerró la revisión de **todos los `.tsx` del proyecto**
que usaban `style={{...}}`. Resumen final:
- Todas las vistas de `src/views/` y componentes de `src/components/`
  fueron auditados y convertidos.
- Los `style={{...}}` que permanecen en el código (decenas dispersas,
  visibles con `grep -rn "style={{" src`) son, sin excepción, **variables
  CSS para datos genuinamente dinámicos** (colores de status/equipo/
  prioridad configurados en Firestore, anchos/alturas de barras calculados
  en runtime, posiciones de menús flotantes) — no quedan estilos estáticos
  disfrazados de dinámicos ni objetos de estilos duplicando lo que ya
  puede vivir en una clase.
- Todo hover simulado con JS (`onMouseEnter`/`onMouseLeave` mutando
  `style` a mano) fue reemplazado por `:hover` real en CSS.
- Todos los bloques `<style>` embebidos en JSX que reinyectaban CSS
  global duplicado fueron eliminados; los que definían CSS genuinamente
  propio del componente se movieron a un `.css` hermano importado una
  sola vez (evitando duplicación en el DOM si el componente se monta más
  de una vez).
- `tsc --noEmit` y `eslint` se verificaron en cada archivo tocado, sin
  ninguna regresión introducida en todo el proceso.

**Pendientes anotados para una futura pasada dedicada (fuera del alcance
de esta tarea)**, documentados más arriba en sus hallazgos respectivos:
- Duplicación cross-file de `.modal-overlay-centered` (definida por
  separado en `InvoicesView.css`, `HousesView.css`, `CustomersView.css`,
  `admin/UsersView.css`) — candidata a consolidarse en `App.css`.
- `.spin` / `@keyframes spin` sin usar y una regla `.left-col,.right-col`
  duplicada en `HousesView.css`, ambas preexistentes a esta tarea.
- Boilerplate de tema claro/oscuro de Vite en `index.css`, probablemente
  sin aplicar al diseño real de la app.

## Hallazgo transversal: `<style>` embebido en JSX (patrón muy extendido)

`grep -rl "<style>" src --include="*.tsx"` da **20 archivos** con este patrón
(no solo las 5 vistas del hallazgo de `.view-header-title-group` de arriba):
`App.tsx`, `StatusHistoryPanel.tsx`, `PropertyDetailModal.tsx`,
`QualityCheckView.tsx`, `PayrollView.tsx`, `PipelineBoardView.tsx`,
`CustomersView.tsx`, `NoticeBoardView.tsx`, `CalendarView.tsx`, `Sidebar.tsx`,
`QCRouteView.tsx`, `RecallsView.tsx`, `CompanySettingsView.tsx`,
`DataImportView.tsx`, `SettingsView.tsx`, `auth/LoginView.tsx`,
`InvoicesView.tsx`, `HousesView.tsx`, `QCDashboardView.tsx`,
`StatusHistoryView.tsx`, `admin/UsersView.tsx`.

Criterio a aplicar por archivo cuando lo revisemos (igual que con PhotoSection):
1. Si el `<style>` define CSS **genuinamente scoped/propio del componente**
   (como era el caso de PhotoSection) → mover a un `.css` hermano + `import`.
2. Si el `<style>` solo **reinyecta una regla que ya existe en `index.css`/`App.css`**
   (como `.view-header-title-group` en las 5 vistas ya anotadas arriba) → eliminar
   el bloque `<style>` por completo, confiar en la clase global.
3. Revisar si el componente se puede montar más de una vez simultáneamente
   (como PhotoSection before/after) — si sí, es razón de más para sacar el CSS
   del JSX y evitar duplicados en el DOM.
