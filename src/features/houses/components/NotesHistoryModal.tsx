// ⭐ HISTORIAL DE NOTAS de una casa: una sección por nota (Office, General,
//    Employee's) con cada versión, la más reciente primero. Extraído de HousesView.
import { X } from "lucide-react";
import type { Property } from "../../../types/index";
import { formatDateTime } from "../../../utils/dateFormat";

interface NotesHistoryModalProps {
  house: Property;
  onClose: () => void;
}

export default function NotesHistoryModal({ house, onClose }: NotesHistoryModalProps) {


  return (
    <div className="modal-overlay-centered" onClick={onClose}>
      <div className="modal-50" onClick={(e) => e.stopPropagation()}>
        <header className="hv-modal-header">
          <h3 className="hv-modal-title">Historial de notas</h3>
          <button className="hv-gcal-close" aria-label="Cerrar" onClick={onClose}>
            <X size={22} />
          </button>
        </header>
        <div className="hv-gcal-body">
          {(house.notesHistory || []).length === 0 ? (
            <p className="hv-gcal-hint">Sin cambios registrados todavía (el historial arranca con la próxima nota que se guarde).</p>
          ) : (
            // ⭐ SEPARADO POR NOTA: una sección por cada tipo, cada una con
            //    sus propias versiones (más reciente primero).
            ([
              { f: "officeNote" as const, t: "Office Notes" },
              { f: "note" as const, t: "General Note" },
              { f: "employeeNote" as const, t: "Employee's Note" },
            ]).map(({ f, t }) => {
              const entries = (house.notesHistory || []).filter((e) => e.field === f);
              if (entries.length === 0) return null;
              return (
                <div key={f} className="hv-notehist-section">
                  <h4 className="hv-notehist-title">{t} ({entries.length})</h4>
                  <ul className="hv-drafts-list">
                    {[...entries].reverse().map((e, i) => (
                      <li key={`${e.at}|${e.user}|${i}`} className="hv-draft-item">
                        <div className="hv-draft-info">
                          <span className="hv-draft-label">
                            {e.action === "created" ? "Creada" : "Editada"} por {e.user}
                          </span>
                          <span className="hv-draft-when">
                            {formatDateTime(e.at)}
                            {e.editedAt ? ` · corregida ${formatDateTime(e.editedAt)}${e.editedBy ? ` por ${e.editedBy}` : ""}` : ""}
                          </span>
                          <span className="hv-draft-when">
                            {e.text ? e.text.slice(0, 160) : e.attachments?.length ? "" : "(vaciada)"}
                            {e.attachments?.length ? `${e.text ? " · " : ""}${e.attachments.length} archivo(s)` : ""}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
