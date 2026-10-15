import { useLayoutEffect, useMemo, useState } from 'react';

/** Con menos elementos se dibuja todo: virtualizar una lista corta no gana nada. */
const MIN_ITEMS = 60;
/** Lo que se dibuja de más arriba y abajo de la pantalla, en px. */
const OVERSCAN_PX = 900;
/** La posición se redondea a este paso: la vista se vuelve a dibujar cada 300 px de scroll, no en cada evento. */
const STEP_PX = 300;

const NO_SIZES: ReadonlyMap<number, number> = new Map();

/** Primer índice cuyo inicio queda después de `y`. */
function indexAfter(offsets: Float64Array, y: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] <= y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Lista larga dibujada por ventana: solo están en el DOM los elementos cerca de
 * la pantalla; arriba y abajo va un relleno (`u-vr-spacer`) con el alto de los
 * que faltan. Cada elemento debe ser UN hijo directo del contenedor que recibe
 * `setAnchor` (fila o tarjeta) y en el mismo orden: así se miden al dibujarse,
 * con el espacio entre ellos incluido. Los que aún no se vieron usan el promedio.
 */
export function useVirtualRows(count: number, estimate: number) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const enabled = count > MIN_ITEMS;
  // ojo: se mide por cantidad y no por identidad de la lista; muchas vistas la
  // recalculan en cada render. Si cambia la cantidad, se mide de nuevo.
  const [measured, setMeasured] = useState<{ count: number; sizes: ReadonlyMap<number, number> }>({ count, sizes: NO_SIZES });
  const sizes = measured.count === count ? measured.sizes : NO_SIZES;
  // Parte visible de la lista, en px desde su primer elemento (redondeada a STEP_PX).
  const [view, setView] = useState({ from: 0, height: 1000 });

  const offsets = useMemo(() => {
    let total = 0;
    sizes.forEach((h) => { total += h; });
    const average = sizes.size ? total / sizes.size : estimate;
    const out = new Float64Array(count + 1);
    for (let i = 0; i < count; i++) out[i + 1] = out[i] + (sizes.get(i) ?? average);
    return out;
  }, [count, estimate, sizes]);

  useLayoutEffect(() => {
    if (!enabled) return;
    // ojo: el scroll puede ser de .main-content, de un contenedor o de la ventana;
    // se escucha en captura y se mide contra la pantalla, así da igual quién se mueve.
    const update = () => {
      if (!anchor) return;
      const from = Math.max(0, Math.floor(-anchor.getBoundingClientRect().top / STEP_PX) * STEP_PX);
      const height = window.innerHeight;
      setView((v) => (v.from === from && v.height === height ? v : { from, height }));
    };
    update();
    document.addEventListener('scroll', update, { capture: true, passive: true });
    window.addEventListener('resize', update);
    return () => {
      document.removeEventListener('scroll', update, { capture: true });
      window.removeEventListener('resize', update);
    };
  }, [enabled, anchor]);

  const start = enabled ? Math.max(0, indexAfter(offsets, view.from - OVERSCAN_PX) - 1) : 0;
  const end = enabled ? Math.min(count, indexAfter(offsets, view.from + view.height + STEP_PX + OVERSCAN_PX)) : count;

  useLayoutEffect(() => {
    if (!enabled || !anchor) return;
    const items = [...anchor.children].filter((c) => c.tagName !== 'THEAD' && !c.classList.contains('u-vr-spacer'));
    const tops = items.map((c) => c.getBoundingClientRect().top);
    let next: Map<number, number> | null = null;
    items.forEach((item, k) => {
      const i = start + k;
      // el alto de un elemento es hasta donde empieza el siguiente (incluye el gap);
      // el último solo se mide si es el final de la lista.
      const h = k + 1 < items.length ? tops[k + 1] - tops[k] : i === count - 1 ? item.getBoundingClientRect().height : -1;
      if (h >= 0 && Math.abs((sizes.get(i) ?? -1) - h) > 0.5) (next ??= new Map(sizes)).set(i, h);
    });
    if (next) setMeasured({ count, sizes: next });
  }, [enabled, anchor, count, sizes, start, end]);

  return {
    setAnchor,
    start,
    end,
    padTop: offsets[start],
    padBottom: offsets[count] - offsets[end],
  };
}
