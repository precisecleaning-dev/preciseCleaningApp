// ⭐ BORRADORES del formulario de casa (lo que quedó sin guardar al salir).
//    Retomar abre el formulario con todos sus campos. Extraído de HousesView.
import { Trash2, X } from "lucide-react";
import { formatDateTime } from "../../../utils/dateFormat";
import type { HouseDraft } from "../houseDrafts";

interface DraftsModalProps {
  drafts: HouseDraft[];
  onRestore: (draft: HouseDraft) => void;
  onDelete: (draftId: string) => void;
  onClose: () => void;
}

export default function DraftsModal({ drafts, onRestore, onDelete, onClose }: DraftsModalProps) {


  return (
    <div
      className="modal-overlay-centered"
      onClick={onClose}
    >
      <div className="modal-50" onClick={(e) => e.stopPropagation()}>
        <header className="hv-modal-header">
          <h3 className="hv-modal-title">Borradores</h3>
          <button
            className="hv-gcal-close"
            aria-label="Cerrar"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>
        <div className="hv-gcal-body">
          {drafts.length === 0 ? (
            <p className="hv-gcal-hint">No hay borradores guardados.</p>
          ) : (
            <ul className="hv-drafts-list">
              {drafts.map((d) => (
                <li key={d.id} className="hv-draft-item">
                  <div className="hv-draft-info">
                    <span className="hv-draft-label">{d.label}</span>
                    <span className="hv-draft-when">
                      {formatDateTime(d.savedAt)}
                    </span>
                  </div>
                  <div className="hv-draft-actions">
                    <button
                      className="hv-draft-btn resume"
                      onClick={() => onRestore(d)}
                    >
                      Retomar
                    </button>
                    <button
                      className="hv-draft-btn remove"
                      onClick={() => onDelete(d.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
