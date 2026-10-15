import { useCallback, useState } from 'react';

/**
 * Estado "guardando" POR ELEMENTO, en vez de un `isSaving` global que
 * deshabilitaba todas las filas mientras el servidor respondía (y sin señal,
 * para siempre). La escritura ya se ve al instante por el listener; aquí solo
 * se marca la fila que espera, y si falla se avisa con `errorText`.
 */
export function usePendingById() {
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());

  const run = useCallback((id: string, write: () => Promise<unknown>, errorText: string) => {
    setPending((s) => new Set(s).add(id));
    write()
      .catch((error: unknown) => {
        console.error(errorText, error);
        alert(errorText);
      })
      .finally(() =>
        setPending((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        }),
      );
  }, []);

  return { pending, run };
}
