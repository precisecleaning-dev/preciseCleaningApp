# CLAUDE.md

Instrucciones para Claude Code al trabajar en este repositorio. Este archivo crecerá con el tiempo para cubrir distintos aspectos del proyecto — por ahora solo cubre estilos (CSS).

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
