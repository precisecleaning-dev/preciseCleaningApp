// ⭐ MODAL CHECKLIST del empleado — MISMO FORMATO que "Iniciar Inspección" de
//    Quality Check (cabecera azul, buscador de áreas, chips y una tarjeta por
//    área), con dos diferencias de negocio:
//      1) cada tarea solo tiene el botón "Yes" (no existe "No"), y
//      2) no hay "DID NOT PASS": el empleado no puede mandar a Recall.
//    Guarda en 'checklists' con el mismo modelo (checked + notes), así que los
//    registros previos siguen sirviendo. Extraído de HousesView.
import { useMemo, useState } from "react";
import { Check, ClipboardCheck, Clock, Plus, Save, Search, StickyNote, User, X } from "lucide-react";
import { addDoc, collection, doc, updateDoc } from "firebase/firestore";
import { db } from "../../../config/firebase";
import { COLLECTIONS } from "../../../lib/firebase/collections";
import type { Property, SystemUser } from "../../../types/index";
import { useLiveData } from "../../../shared/data/liveCollections";
import { formatTime, todayIso } from "../../../utils/dateFormat";
import { isActiveTask, sortPlacesByOrder } from "../../../utils/qcCatalog";
import type { ChecklistRecord } from "../hooks/useHouseChecklist";

interface ChecklistModalProps {
  house: Property;
  clientName: string;
  currentUser?: SystemUser | null;
  readOnly: boolean;
  record: ChecklistRecord | null;
  onClose: () => void;
}

/** Hora corta (p. ej. "11:46 PM") de la cabecera, igual que la "Entrada" de Quality Check. */
const fmtClockTime = (iso: string): string => formatTime(iso);

const ChecklistModal = ({ house, clientName, currentUser, readOnly, record, onClose }: ChecklistModalProps) => {
  // Usa los mismos places/tasks del Quality Check (settings_places/_tasks).
  // Áreas en su orden manual y solo las tareas que siguen en el checklist (no archivadas).
  const clPlacesData = useLiveData("places");
  const clTasksData = useLiveData("tasks");
  const clTasks = useMemo(() => clTasksData.filter(isActiveTask), [clTasksData]);
  const clPlaces = useMemo(() => sortPlacesByOrder(clPlacesData), [clPlacesData]);
  const clActivePlaces = clPlaces.filter((pl) => clTasks.some((t) => t.placeId === pl.id));
  // ⭐ Áreas disponibles: si la casa define sus propias áreas (qcPlaces) se
  //    respetan; si no, todas las que tengan tareas configuradas (mismo criterio
  //    que el modal de Quality Check).
  const clHouseAreaIds = house.qcPlaces;
  const clAvailablePlaces = clActivePlaces.filter(
    (pl) => !Array.isArray(clHouseAreaIds) || clHouseAreaIds.length === 0 || clHouseAreaIds.includes(pl.id),
  );

  const [clChecked, setClChecked] = useState<Record<string, boolean>>(() => record?.checked || {});
  const [clNotes, setClNotes] = useState(record?.notes || "");
  const [isSavingChecklist, setIsSavingChecklist] = useState(false);
  // ⭐ Formato "Iniciar Inspección": buscador de áreas + chips + hora de entrada.
  const [clPlaceSearch, setClPlaceSearch] = useState("");
  // Preselecciona las áreas que ya traen tareas marcadas; si el checklist es
  // nuevo, el empleado elige las áreas con los chips (igual que en QC).
  const [clSelectedPlaceIds, setClSelectedPlaceIds] = useState<string[]>(() =>
    clAvailablePlaces
      .filter((pl) => clTasks.some((t) => t.placeId === pl.id && record?.checked?.[t.id]))
      .map((pl) => pl.id),
  );
  const [clOpenedAt] = useState(() => new Date().toISOString());

  const clPlaceQuery = clPlaceSearch.trim().toLowerCase();
  const clSearchablePlaces = clAvailablePlaces.filter((pl) => !clPlaceQuery || pl.name.toLowerCase().includes(clPlaceQuery));
  const clRenderPlaces = clAvailablePlaces.filter((pl) => clSelectedPlaceIds.includes(pl.id));
  // Avance: solo sobre las tareas de las áreas seleccionadas
  const clSelectedTasks = clTasks.filter((t) => clSelectedPlaceIds.includes(t.placeId));
  const clSelectedTotal = clSelectedTasks.length;
  const clSelectedDone = clSelectedTasks.filter((t) => !!clChecked[t.id]).length;

  const toggleClPlace = (placeId: string) =>
    setClSelectedPlaceIds((prev) => (prev.includes(placeId) ? prev.filter((x) => x !== placeId) : [...prev, placeId]));

  const toggleClTask = (taskId: string) => {
    if (readOnly) return;
    setClChecked((prev) => {
      const next = { ...prev };
      if (next[taskId]) delete next[taskId];
      else next[taskId] = true;
      return next;
    });
  };

  const handleSaveChecklist = async () => {
    setIsSavingChecklist(true);
    try {
      if (record?.id) {
        await updateDoc(doc(db, COLLECTIONS.checklists, record.id), { checked: clChecked, notes: clNotes.trim() });
      } else {
        await addDoc(collection(db, COLLECTIONS.checklists), {
          houseId: house.id,
          address: house.address || "",
          client: house.client || "",
          date: todayIso(),
          inspector: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : "Unknown",
          checked: clChecked,
          notes: clNotes.trim(),
          createdAt: new Date().toISOString(),
        });
      }
      onClose();
    } catch (err) {
      console.error("Error guardando checklist:", err);
      const e = err as { code?: string; message?: string };
      alert(`Error al guardar el checklist.\n\nCódigo: ${e.code || "desconocido"}\nDetalle: ${e.message || String(err)}`);
    } finally {
      setIsSavingChecklist(false);
    }
  };

  return (
    <div
      className="modal-overlay-centered hv-cl-overlay"
      onClick={() => !isSavingChecklist && onClose()}
    >
      <div className="hv-cl-modal" onClick={(e) => e.stopPropagation()}>
        <header className="hv-cl-header">
          <div className="hv-cl-header-title-wrap">
            <h2 className="hv-cl-title">
              <ClipboardCheck size={20} /> Checklist
              {readOnly && (
                <span className="hv-checklist-ro-badge">Solo lectura</span>
              )}
            </h2>
            <p className="hv-cl-prop">
              {clientName} ·{" "}
              {house.address || "—"}
            </p>
            <p className="hv-cl-insp">
              <User size={13} />{" "}
              {currentUser
                ? `${currentUser.firstName} ${currentUser.lastName}`
                : record?.inspector || "Unknown"}
              {clOpenedAt && (
                <>
                  {" · "}
                  <Clock size={13} /> Entrada {fmtClockTime(clOpenedAt)}
                </>
              )}
            </p>
          </div>
          <button
            className="hv-cl-close-btn"
            onClick={onClose}
            disabled={isSavingChecklist}
            aria-label="Cerrar"
          >
            <X size={22} />
          </button>
        </header>

        {/* Buscador de áreas */}
        <div className="hv-cl-search-bar">
          <div className="hv-cl-search">
            <Search size={18} className="hv-cl-search-icon" />
            <input
              type="text"
              value={clPlaceSearch}
              onChange={(e) => setClPlaceSearch(e.target.value)}
              placeholder="Buscar área del checklist..."
            />
            {clPlaceSearch && (
              <button
                onClick={() => setClPlaceSearch("")}
                aria-label="Limpiar"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="hv-cl-body">
          {/* Selector de áreas (chips) */}
          <div className="hv-cl-picker">
            <div className="hv-cl-picker-title">
              <span>
                Áreas del checklist ({clSelectedPlaceIds.length}{" "}
                seleccionada(s))
              </span>
              {clSelectedTotal > 0 && (
                <span className="hv-cl-picker-progress">
                  {clSelectedDone} de {clSelectedTotal} marcados
                </span>
              )}
            </div>
            {clSearchablePlaces.length === 0 ? (
              <div className="hv-cl-picker-empty">
                No hay áreas con tareas configuradas.
              </div>
            ) : (
              <div className="hv-cl-chip-list">
                {clSearchablePlaces.map((pl) => {
                  const sel = clSelectedPlaceIds.includes(pl.id);
                  return (
                    <button
                      key={pl.id}
                      className={`hv-cl-chip${sel ? " selected" : ""}`}
                      onClick={() => toggleClPlace(pl.id)}
                    >
                      {sel ? <Check size={14} /> : <Plus size={14} />}{" "}
                      {pl.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Una tarjeta por área seleccionada — SOLO "Yes" */}
          {clRenderPlaces.map((pl) => {
            const placeTasks = clTasks.filter((t) => t.placeId === pl.id);
            return (
              <div key={pl.id} className="hv-cl-card">
                <h3 className="hv-cl-card-title">{pl.name}</h3>
                {placeTasks.map((task) => {
                  const on = !!clChecked[task.id];
                  return (
                    <div key={task.id} className="hv-cl-task-item">
                      <span className="hv-cl-task-name">{task.name}</span>
                      <div className="hv-cl-task-buttons">
                        <button
                          className={`hv-cl-toggle yes${on ? " active" : ""}`}
                          onClick={() => toggleClTask(task.id)}
                          disabled={readOnly}
                          title={
                            on ? "Quitar la marca" : "Marcar como hecho"
                          }
                        >
                          <Check size={15} /> Yes
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {clRenderPlaces.length === 0 && clSearchablePlaces.length > 0 && (
            <div className="hv-cl-no-places">
              Selecciona al menos un área arriba para comenzar el checklist.
            </div>
          )}

          {/* Notas generales del checklist */}
          <div className="hv-cl-notes-card">
            <label className="hv-cl-label">
              <StickyNote size={13} /> Notas
            </label>
            <textarea
              className="hv-cl-textarea"
              value={clNotes}
              onChange={(e) => setClNotes(e.target.value)}
              placeholder="Observaciones del checklist…"
              disabled={readOnly}
            />
          </div>
        </div>

        {/* Barra de guardado: solo "Guardar Checklist" (sin DID NOT PASS) */}
        <div className="hv-cl-savebar">
          {readOnly ? (
            <button
              className="hv-cl-btn-save"
              onClick={onClose}
            >
              Cerrar
            </button>
          ) : (
            <button
              className="hv-cl-btn-save"
              onClick={handleSaveChecklist}
              disabled={isSavingChecklist}
            >
              <Save size={18} />{" "}
              {isSavingChecklist ? "Guardando…" : "Guardar Checklist"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChecklistModal;
