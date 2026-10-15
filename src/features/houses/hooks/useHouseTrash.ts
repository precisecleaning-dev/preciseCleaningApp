// Estado del borrado de una casa (diálogo con motivo → papelera), igual en
// Houses, Invoices, Calendar y Quality Check. La vista pinta
// <DeleteHouseDialog> mientras `target` no sea null.
import { useCallback, useState } from 'react';
import type { Property, SystemUser } from '../../../types/index';
import { moveHouseToTrash } from '../services/houseTrash';

interface UseHouseTrashOptions {
  actor: SystemUser | null | undefined;
  /** Vista que borra, para la bitácora ("Houses", "Invoices"...). */
  module: string;
  /** Etiqueta "Cliente — Dirección" de la casa. */
  labelOf: (house: Property) => string;
  /** Después de moverla a la papelera (p. ej. cerrar el detalle abierto). */
  onDone?: (house: Property) => void;
  /** Versión en vivo de la casa (la lista que llega por props): a la papelera
   *  va lo que hay al confirmar, no la copia tomada al abrir el diálogo. */
  liveOf?: (id: string) => Property | undefined;
}

export function useHouseTrash({ actor, module, labelOf, onDone, liveOf }: UseHouseTrashOptions) {
  const [target, setTarget] = useState<Property | null>(null);
  const [busy, setBusy] = useState(false);

  /** Abre el diálogo para ESTA casa (la del clic, nunca un "seleccionado"). */
  const request = useCallback((house: Property) => setTarget(house), []);
  const cancel = useCallback(() => { if (!busy) setTarget(null); }, [busy]);

  const confirm = async (reason: string) => {
    if (!target) return;
    const house = liveOf?.(target.id) ?? target;
    // Sin usuario identificado no hay borrado: la papelera exige saber QUIÉN.
    if (!actor || busy) return;
    setBusy(true);
    try {
      await moveHouseToTrash({ house, actor, reason, label: labelOf(house), module });
      setTarget(null);
      onDone?.(house);
    } catch (error) {
      console.error('Error moving to trash:', error);
      const fbErr = error as { code?: string; message?: string };
      alert(
        `No se pudo enviar a la papelera.\n\nCódigo: ${fbErr.code || 'desconocido'}\nDetalle: ${fbErr.message || String(error)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return { target, busy, request, cancel, confirm, label: target ? labelOf(target) : '' };
}
