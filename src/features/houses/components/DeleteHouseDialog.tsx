// Diálogo de "Enviar a la papelera" con motivo obligatorio. Es el mismo que
// tenía HousesView; ahora lo comparten Houses, Invoices, Calendar y Quality
// Check (features/houses/hooks/useHouseTrash.ts lleva el estado y el envío).
import { useEffect, useId, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import './DeleteHouseDialog.css';

interface DeleteHouseDialogProps {
  /** "Cliente — Dirección" de la casa que se va a borrar. */
  label: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export default function DeleteHouseDialog({ label, busy, onCancel, onConfirm }: DeleteHouseDialogProps) {
  const [reason, setReason] = useState('');
  const titleId = useId();
  const reasonId = useId();
  const canSend = reason.trim() !== '' && !busy;

  // Escape cierra (salvo mientras se envía).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div className="modal-overlay-centered" onClick={() => { if (!busy) onCancel(); }}>
      <div
        className="modal-50 dhd-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dhd-header">
          <h3 className="dhd-title" id={titleId}>Enviar a la papelera</h3>
          <button type="button" className="dhd-close" aria-label="Cerrar" onClick={onCancel} disabled={busy}>
            <X size={22} />
          </button>
        </header>
        <div className="dhd-body">
          <p className="dhd-hint">
            <b>{label}</b> no se borrará definitivamente: irá a <b>Recycle Bin</b> junto con sus
            pagos y servicios, desde donde se puede restaurar íntegra o eliminar para siempre.
            Quedará registrado quién la borró, cuándo y el motivo.
          </p>
          <label className="dhd-label" htmlFor={reasonId}>
            Motivo del borrado (obligatorio)
          </label>
          <textarea
            id={reasonId}
            className="dhd-input"
            placeholder="Ej: casa duplicada, el cliente canceló el servicio, se capturó por error..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </div>
        <footer className="dhd-footer">
          <button type="button" className="dhd-btn-cancel" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="dhd-btn-danger"
            disabled={!canSend}
            title={reason.trim() ? undefined : 'Escribe el motivo para poder borrar'}
            onClick={() => onConfirm(reason.trim())}
          >
            <Trash2 size={16} /> {busy ? 'Enviando...' : 'Enviar a la papelera'}
          </button>
        </footer>
      </div>
    </div>
  );
}
