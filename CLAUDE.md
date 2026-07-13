# CLAUDE.md

Instrucciones para Claude Code al trabajar en este repositorio. Este archivo crecerá con el tiempo para cubrir distintos aspectos del proyecto. Cubre estilos (CSS) y buenas prácticas de código (React/TypeScript) surgidas de la revisión progresiva de calidad documentada en `code-notes.md`.

## Estilos (CSS)

Este proyecto tuvo una limpieza completa de estilos inline (`style={{...}}`) en todos los archivos `.tsx`, migrándolos a clases CSS en archivos `.css` hermanos o en `App.css`/`index.css`. Al escribir código nuevo o modificar componentes existentes, sigue estas reglas para no reintroducir el problema:

### Regla general
**No uses `style={{...}}` para valores que ya conoces en tiempo de escritura.** Si un valor es fijo (colores, tamaños, espaciados, tipografía, layout), va en una clase CSS. `style` inline solo se justifica para valores que solo existen en tiempo de ejecución.

### Cuándo SÍ usar `style={{...}}` (con variables CSS)
Cuando el valor es genuinamente dinámico y viene de datos (Firestore, cálculos en runtime, props arbitrarias) — no un estado finito conocido de antemano:

- Colores configurables por el usuario (color de un status, equipo, prioridad, etc.)
- Anchos/alturas calculados en runtime (barras de progreso, gráficas)
- Posiciones calculadas con `getBoundingClientRect()` (menús flotantes, tooltips)

En estos casos, usa **variables CSS personalizadas**, no propiedades sueltas:

```tsx
// ✅ Correcto
<span className="status-dot" style={{ '--dot-color': status.color } as CSSProperties} />
```
```css
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dot-color); }
```

Requiere `import type { CSSProperties } from 'react'` y el cast `as CSSProperties` (React/TS no tipan custom properties por defecto).

### Cuándo NO usar `style={{...}}` (usa clases con modificador)
Cuando el valor es uno de un conjunto **finito y conocido** de estados (2-4 valores), aunque se "calcule" con un ternario:

```tsx
// ❌ Mal
<button style={{ background: active ? '#3b82f6' : '#f1f5f9', color: active ? '#fff' : '#64748b' }}>

// ✅ Bien
<button className={`chip${active ? ' active' : ''}`}>
```
```css
.chip { background: #f1f5f9; color: #64748b; }
.chip.active { background: #3b82f6; color: #fff; }
```

Aplica también a: badges de 2-3 estados, botones con `:disabled` nativo (usa el atributo `disabled` + `.btn:disabled{...}` en CSS en vez de calcular `opacity`/`cursor` a mano cuando el botón ya tiene ese atributo), y cualquier "clase base + variante" (patrón ya usado en el proyecto: `.tag.team`, `.property-card.border-red`).

### Hover: nunca simulado con JS
No uses `onMouseEnter`/`onMouseLeave` para mutar `e.currentTarget.style` a mano. Usa `:hover` real en CSS.

```tsx
// ❌ Mal
<div onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>

// ✅ Bien
<div className="row">
```
```css
.row:hover { background: #f8fafc; }
```

Si un elemento tiene un estado "activo/seleccionado" que debe seguir resaltado incluso sin hover, y el hover debe ganarle visualmente al pasar el mouse, declara la regla `:hover` **después** de la regla `.active`/`.current` en el CSS (mismo peso de especificidad, gana la que está más abajo).

### Objetos de estilos en JS (`const s = {...}`)
No crees objetos como `const s = { input: {...}, label: {...}, btnPrimary: {...} }` para reutilizar estilos entre elementos. Son el equivalente a clases CSS pero sin las ventajas de CSS (cascada, pseudo-clases, media queries). Usa clases directamente.

### `<style>` embebido en JSX
No uses `<style>{`...`}</style>` dentro de un componente. Dos problemas:
1. Si el componente se monta más de una vez en pantalla, el bloque `<style>` se duplica en el DOM.
2. No se beneficia de tree-shaking ni de las herramientas de CSS del proyecto.

Mueve el CSS a un archivo `.css` hermano del componente (`MiComponente.tsx` → `MiComponente.css`) e impórtalo una sola vez al inicio del archivo: `import './MiComponente.css';`.

### Antes de crear una clase nueva, busca si ya existe
Este proyecto tiene bastante CSS global reutilizable en `src/App.css` y `src/index.css` (`.modal-70`, `.grid-3-cols`, `.hamburger-btn`, `.header-title-group`, `.btn-primary`, `.btn-outline`, patrones de modal, etc.). Antes de inventar una clase local, revisa si el estilo que necesitas ya existe globalmente. Si necesitas algo casi igual pero con una diferencia real (no accidental), no lo fusiones a la fuerza — crea un modificador o una clase local con nombre distinto, y dejá una nota de por qué no se reusó la global.

### Verificación al terminar un archivo
Después de convertir o escribir un componente:
1. `grep -c "style={{" archivo.tsx` — confirma que lo que queda son solo variables CSS justificadas.
2. `npx tsc --noEmit -p tsconfig.app.json` — sin errores nuevos.
3. `npx eslint archivo.tsx` comparado contra el estado anterior (vía `git stash`/`git stash pop` si aplica) — mismos problemas preexistentes, ninguno nuevo.

## Código (React / TypeScript)

Este proyecto tuvo una revisión progresiva, archivo por archivo, de calidad de código (histórico completo en `code-notes.md`). Las reglas de abajo son las que salieron de esa revisión — síguelas al escribir código nuevo o modificar componentes existentes para no reintroducir los mismos problemas.

### Convención de componentes
`export default function Componente(props: Props) {...}`. No uses `React.FC<Props>` — es el único patrón que apareció una vez en todo el proyecto (`Header.tsx`, ya eliminado) y rompía la consistencia con los otros ~25 componentes/vistas.

### Íconos
Usa `lucide-react`, nunca SVGs inline a mano, salvo que el ícono no exista en la librería. El ícono de hamburguesa (`<Menu size={N} />`) es el caso más repetido — no lo redibujes con `<svg>`.

### Tipado — evita `any`
- No tipes `useState`, props, ni parámetros de función como `any`. Si el dato viene de Firestore, castea al tipo real (`as Status[]`, `as Customer`, etc.) en el punto donde se lee, no en cada uso posterior.
- Si un archivo necesita campos que el tipo canónico en `src/types/index.ts` no tiene, primero evalúa si esos campos son genuinamente locales a ese archivo o si varios archivos ya los redeclaran por separado (señal de que deberían vivir en el tipo canónico). Si son legítimamente locales, usa un tipo extendido con nombre y comentario explicando por qué:
  ```tsx
  // ⭐ Tipo extendido local: `inviteSent`/`inviteSentAt` se leen y escriben en Firestore
  //    pero aún no están declarados en el tipo global SystemUser.
  type SystemUserExt = SystemUser & { inviteSent?: boolean; inviteSentAt?: string };
  ```
- `src/types.ts` (archivo de tipos legacy paralelo a `src/types/index.ts`) fue eliminado — todo el proyecto usa `src/types/index.ts` como única fuente. Si ves un import de `'../types'` (sin `/index`), es un error, no un caso legítimo.
- Un `as any` que quede después de limpiar debe tener un comentario explicando por qué hace falta (ejemplo real: campos de un archivo que genuinamente no pertenecen al tipo canónico). Un `any` sin comentario cerca de un `propertiesService.update/create` casi siempre es señal de que el tipo canónico le falta un campo, no de que el cast sea necesario — probá quitarlo primero.
- Excepción aceptada: un campo genuinamente dinámico y heterogéneo (ej. `qcData: Record<string, any>` en un formulario de Quality Check cuya estructura varía por configuración) puede quedar en `any` si tipar una unión agregaría más complejidad que valor. Documentá la excepción donde ocurre.

### Lógica duplicada — extrae, no copies
Antes de escribir un helper que resuelve "un id o nombre contra un catálogo" (status, team, customer, etc.), revisa `src/utils/relations.ts` (`getRelationName`/`getRelationColor`) — ya cubre ese caso genérico. Lo mismo aplica a otros patrones ya extraídos: `src/utils/qcStatus.ts` (¿tiene esta casa un QC pendiente/pasado/fallido?), `src/utils/recallStatus.ts` (¿es este status un Recall?), `src/utils/escapeHtml.ts`, `src/utils/routing.ts` (geocoding, Leaflet, OSRM), `src/components/CustomSelect.tsx` (dropdown con catálogo + color).

Si vas a reimplementar algo que ya existe en 2 archivos con pequeñas diferencias de comportamiento, no elijas una copia al azar como "la buena" — compará las diferencias punto por punto (matching exacto vs. case-insensitive, `onClick` vs `onMouseDown`, con/sin debounce, etc.) y quedate con el comportamiento más robusto de cada punto, no con el de un solo archivo de origen. Documentá la decisión en `code-notes.md`.

### Semántica del JSX
- **Listas renderizadas con `.map()`:** si el resultado es conceptualmente una lista de ítems (fotos, tarjetas, filas, comentarios), usa `<ul>/<li>` en vez de `<div>/<div>`, salvo que haya una razón de layout real que lo impida (rara vez la hay — CSS Grid/Flexbox funcionan igual en `<ul>`; solo hace falta `list-style: none; margin: 0;` en el CSS).
- **Pares etiqueta/valor** (ficha de detalle, resumen): usa `<dl>/<dt>/<dd>` en vez de `<div><span>label</span><span>value</span></div>`. Un `<div>` envolviendo cada par `dt`/`dd` dentro del `<dl>` es válido en HTML5. Si es un solo par suelto (no un grupo), no fuerces un `<dl>` de un solo ítem — déjalo como `<div>`.
- **`key` en listas:** preferí un identificador único de dato (`id`, `url`) sobre el índice del array, salvo que el dato no tenga identificador único garantizado.

### Datos en tiempo real — no dupliques el fetch
`App.tsx` mantiene listeners `onSnapshot` globales para colecciones que varias vistas necesitan (`properties`, roles, etc.) y los pasa como props. Si una vista hace su **propio** `getDocs`/fetch de la misma colección al montar, ese fetch congela los datos en el momento de la carga — cambios posteriores desde otra pestaña o usuario quedan invisibles hasta desmontar/remontar el componente. Antes de escribir un `useEffect` que carga una colección, revisá si ya llega como prop desde `App.tsx`; si sí, usala directo en vez de re-fetchear.

### Seguridad — HTML crudo siempre escapado
Cualquier valor de texto libre (nombre, notas, dirección, campos que escribe un usuario) que se interpole en un string HTML crudo — para `window.open()+document.write()`, `dangerouslySetInnerHTML`, o el cuerpo de un email guardado en Firestore — debe pasar por `escapeHtml()` (`src/utils/escapeHtml.ts`) antes de interpolarse. Esto ya causó 3 vulnerabilidades XSS reales en el proyecto (generadores de PDF/branding/email). Excepción: atributos `src` de `<img>` con URLs de Storage o base64 — no son texto libre, no hace falta escaparlos.

### Handlers y closures
Los handlers que actúan sobre un ítem específico de una lista (borrar, editar) deben recibir ese ítem como parámetro explícito en el momento del click (`onClick={() => handleDelete(item)}`), no depender de una variable de estado tipo "ítem seleccionado" que pudo haber cambiado entre que se abrió el menú/modal y que el usuario confirmó la acción — eso ya causó un bug real de pérdida de datos (se borraba la casa equivocada).

### Código sospechoso de no usarse — confirmá antes de tocar
Si un botón/modal/función parece no tener forma de activarse desde la UI, confirmalo con `grep` (¿algo llama al setter que lo abre? ¿algo importa esta función?) antes de asumir que es una feature real. Si el `grep` confirma que es inalcanzable, eliminalo — no lo dejes "por si acaso". Si el `grep` muestra que sí se usa mediante un flujo no obvio, no lo toques sin entender ese flujo primero.

### Features paralelas/duplicadas — no fusiones sin permiso
Si encontrás dos implementaciones distintas de la misma idea de producto (dos rutas de navegación, dos dashboards, dos editores del mismo dato) que **ambas funcionan y son alcanzables**, no es un problema de limpieza de código — es una decisión de producto. Documentalo en `code-notes.md` bajo "Pendientes de otra ronda" y preguntale al usuario cuál debe prevalecer antes de eliminar o fusionar nada. Sí es limpieza de código (y corresponde resolverlo directo) cuando una de las dos implementaciones está confirmada como código muerto/inalcanzable — ahí no hay decisión de producto que tomar.

### Verificación al terminar un archivo (además de lo de CSS)
1. `npx tsc --noEmit -p tsconfig.app.json` — sin errores nuevos en todo el proyecto (no solo el archivo tocado).
2. `npx eslint archivo.tsx` comparado contra el estado anterior (`git stash`/`git stash pop`) — mismos problemas preexistentes desplazados de línea, ninguna categoría nueva.
3. Si el cambio afecta lógica de runtime no trivial (mapas, APIs externas, geolocalización), decilo explícitamente si no se pudo probar a mano en el navegador — `tsc`/`eslint`/build verifican que compila, no que funciona.
