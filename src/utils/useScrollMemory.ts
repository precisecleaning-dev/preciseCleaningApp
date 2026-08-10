import { useEffect, useRef } from 'react';

// ============================================================================
// ⭐ MEMORIA DE SCROLL POR PESTAÑA
//
// Es el detalle que más delata a una web disfrazada de app. Flujo típico:
// el usuario baja 40 casas en Overview, entra a una para verla, vuelve… y
// aparece arriba del todo. Tiene que volver a bajar. Una app nativa jamás
// pierde esa posición.
//
// Ocurre porque App.tsx desmonta la vista al cambiar de pestaña
// (`activeTab === 'x' && <Vista />`), y al volver a montarla el contenedor
// arranca en scrollTop = 0.
//
// Este hook guarda la posición al salir y la restaura al volver. La
// restauración NO es inmediata: cuando la vista se vuelve a montar, su lista
// todavía no tiene alto (los datos se pintan en el siguiente fotograma), así
// que asignar scrollTop en ese instante no haría nada. Se reintenta durante
// unos fotogramas hasta que el contenido tenga altura suficiente.
// ============================================================================

/** Posiciones vivas por pestaña. Fuera del componente: sobrevive a los
 *  remontajes, que es justo el caso que hay que cubrir. */
const positions = new Map<string, number>();

/** Cuántos fotogramas se reintenta antes de rendirse (~10 a 60fps = 166 ms).
 *  Suficiente para que Firestore pinte el primer lote; más que eso sería
 *  restaurar cuando el usuario ya empezó a desplazarse a mano. */
const MAX_FRAMES = 10;

export function useScrollMemory<T extends HTMLElement>(key: string) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const target = positions.get(key) ?? 0;
    let frame = 0;
    let raf = 0;
    let restored = false;

    // Si el usuario toca el scroll durante el intento, se abandona: mandar la
    // vista a otra posición mientras alguien la está desplazando se siente como
    // un tirón, peor que no restaurar nada.
    const abort = () => { restored = true; };
    el.addEventListener('wheel', abort, { passive: true, once: true });
    el.addEventListener('touchstart', abort, { passive: true, once: true });

    const tryRestore = () => {
      if (restored || target === 0) return;
      const max = el.scrollHeight - el.clientHeight;
      if (max >= target) {
        el.scrollTop = target;
        restored = true;
        return;
      }
      if (++frame < MAX_FRAMES) raf = requestAnimationFrame(tryRestore);
    };
    raf = requestAnimationFrame(tryRestore);

    // Se guarda en el desmontaje (al cambiar de pestaña), no en cada scroll:
    // un listener de scroll que escribe en un Map se dispara decenas de veces
    // por segundo y compite con el repintado.
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('wheel', abort);
      el.removeEventListener('touchstart', abort);
      positions.set(key, el.scrollTop);
    };
  }, [key]);

  return ref;
}

/** Olvida la posición de una pestaña. Útil tras una acción que cambia la lista
 *  por completo (por ejemplo un filtro nuevo), donde volver a la posición
 *  anterior no tendría sentido. */
export const resetScrollMemory = (key: string): void => {
  positions.delete(key);
};
