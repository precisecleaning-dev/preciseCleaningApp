// ⭐ MODAL CHECKLIST del empleado — MISMO FORMATO que "Iniciar Inspección" de
//    Quality Check (cabecera azul, buscador de áreas, chips y una tarjeta por
//    área), con dos diferencias de negocio:
//      1) cada tarea solo tiene el botón "Yes" (no existe "No"), y
//      2) no hay "DID NOT PASS": el empleado no puede mandar a Recall.
//    Guarda en 'checklists' con el mismo modelo (checked + notes), así que los
//    registros previos siguen sirviendo. Extraído de HousesView.
//    Lo que se ve es la versión EN VIVO del checklist más las marcas que esta
//    persona cambió; al guardar se escriben SOLO esas marcas (checked.<tarea>:
//    true o deleteField()) y las notas si se tocaron. Antes se reescribía el
//    mapa completo con la copia tomada al abrir: se perdían las marcas que otra
//    persona guardó mientras tanto, o todas si se guardaba antes de que cargara.
import { useMemo, useState } from "react";
import { Check, ClipboardCheck, Clock, Plus, Save, Search, StickyNote, User, X } from "lucide-react";
import { addDoc, collection, deleteField, doc, FieldPath, updateDoc } from "firebase/firestore";
import { db } from "../../../config/firebase";
import { COLLECTIONS } from "../../../lib/firebase/collections";
import type { ChecklistRecord, Property, SystemUser } from "../../../types/index";
import { useLiveData } from "../../../shared/data/liveCollections";
import { formatTime, todayIso } from "../../../utils/dateFormat";
import { isActiveTask, sortPlacesByOrder } from "../../../utils/qcCatalog";

interface ChecklistModalProps {
  property: Property;
  clientName: string;
  currentUser?: SystemUser | null;
  isReadOnly: boolean;
  /** Último checklist de la casa, en vivo (null = no tiene o todavía no llega). */
  savedChecklist: ChecklistRecord | null;
  /** Ya llegó el primer dato del listener: antes no se deja guardar. */
  isChecklistLoaded: boolean;
  hasChecklistLoadError: boolean;
  onClose: () => void;
}

const EMPTY_CHECKED: Record<string, boolean> = {};

const ChecklistModal = ({
  property, clientName, currentUser, isReadOnly, savedChecklist, isChecklistLoaded, hasChecklistLoadError, onClose,
}: ChecklistModalProps) => {
  // Usa los mismos places/tasks del Quality Check (settings_places/_tasks).
  // Áreas en su orden manual y solo las tareas que siguen en el checklist (no archivadas).
  const allPlaces = useLiveData("places");
  const allTasks = useLiveData("tasks");
  const activeTasks = useMemo(() => allTasks.filter(isActiveTask), [allTasks]);
  const sortedPlaces = useMemo(() => sortPlacesByOrder(allPlaces), [allPlaces]);
  const placesWithTasks = sortedPlaces.filter((place) => activeTasks.some((task) => task.placeId === place.id));
  // ⭐ Áreas disponibles: si la casa define sus propias áreas (qcPlaces) se
  //    respetan; si no, todas las que tengan tareas configuradas (mismo criterio
  //    que el modal de Quality Check).
  const propertyPlaceIds = property.qcPlaces;
  const availablePlaces = placesWithTasks.filter(
    (place) => !Array.isArray(propertyPlaceIds) || propertyPlaceIds.length === 0 || propertyPlaceIds.includes(place.id),
  );

  // Marcas guardadas (en vivo) + las que esta persona cambió (tarea → marcada o no).
  const savedCheckedByTaskId = savedChecklist?.checked ?? EMPTY_CHECKED;
  const [changedCheckByTaskId, setChangedCheckByTaskId] = useState<Record<string, boolean>>({});
  const isTaskChecked = (taskId: string) => changedCheckByTaskId[taskId] ?? !!savedCheckedByTaskId[taskId];
  // null = notas sin tocar: se muestran (y se conservan) las guardadas.
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const notes = notesDraft ?? savedChecklist?.notes ?? "";
  const [isSaving, setIsSaving] = useState(false);
  // ⭐ Formato "Iniciar Inspección": buscador de áreas + chips + hora de entrada.
  const [placeSearchText, setPlaceSearchText] = useState("");
  // Preselecciona las áreas que ya traen tareas marcadas (también si el
  // checklist llega después de abrir); en cuanto el empleado toca un chip,
  // manda su selección. Si el checklist es nuevo, elige las áreas con los chips.
  const [pickedPlaceIds, setPickedPlaceIds] = useState<string[] | null>(null);
  const placeIdsWithSavedMarks = availablePlaces
    .filter((place) => activeTasks.some((task) => task.placeId === place.id && savedCheckedByTaskId[task.id]))
    .map((place) => place.id);
  const selectedPlaceIds = pickedPlaceIds ?? placeIdsWithSavedMarks;
  const [openedAtIso] = useState(() => new Date().toISOString());

  const normalizedPlaceQuery = placeSearchText.trim().toLowerCase();
  const matchingPlaces = availablePlaces.filter((place) => !normalizedPlaceQuery || place.name.toLowerCase().includes(normalizedPlaceQuery));
  const selectedPlaces = availablePlaces.filter((place) => selectedPlaceIds.includes(place.id));
  // Avance: solo sobre las tareas de las áreas seleccionadas
  const selectedPlaceTasks = activeTasks.filter((task) => selectedPlaceIds.includes(task.placeId));
  const selectedTaskCount = selectedPlaceTasks.length;
  const checkedTaskCount = selectedPlaceTasks.filter((task) => isTaskChecked(task.id)).length;

  const canSave = isChecklistLoaded && !isSaving;
  let saveButtonLabel = "Guardar Checklist";
  if (hasChecklistLoadError) saveButtonLabel = "No se pudo cargar el checklist";
  else if (!isChecklistLoaded) saveButtonLabel = "Cargando checklist…";
  else if (isSaving) saveButtonLabel = "Guardando…";

  const handleTogglePlace = (placeId: string) =>
    setPickedPlaceIds(selectedPlaceIds.includes(placeId)
      ? selectedPlaceIds.filter((selectedId) => selectedId !== placeId)
      : [...selectedPlaceIds, placeId]);

  const handleToggleTask = (taskId: string) => {
    if (isReadOnly) return;
    const nextIsChecked = !isTaskChecked(taskId);
    setChangedCheckByTaskId((previousChanges) => {
      const nextChanges = { ...previousChanges };
      // Si vuelve a quedar como está guardada, deja de ser un cambio.
      if (nextIsChecked === !!savedCheckedByTaskId[taskId]) delete nextChanges[taskId];
      else nextChanges[taskId] = nextIsChecked;
      return nextChanges;
    });
  };

  /** checked.<tarea>: true / deleteField() por cada marca cambiada, y las notas si se tocaron. */
  const buildChangedFieldUpdates = (): unknown[] => {
    const fieldUpdates: unknown[] = Object.entries(changedCheckByTaskId).flatMap(([taskId, isChecked]) => [
      new FieldPath("checked", taskId),
      isChecked ? true : deleteField(),
    ]);
    if (notesDraft !== null) fieldUpdates.push("notes", notesDraft.trim());
    return fieldUpdates;
  };

  const handleSaveChecklist = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      if (savedChecklist?.id) {
        const [firstField, firstValue, ...moreFieldsAndValues] = buildChangedFieldUpdates();
        if (firstField) {
          const savePromise = updateDoc(
            doc(db, COLLECTIONS.checklists, savedChecklist.id),
            firstField as FieldPath | string,
            firstValue,
            ...moreFieldsAndValues,
          );
          // Sin red Firestore guarda el cambio en el teléfono y lo sube al
          // volver la señal (caché persistente): no se espera, para que el
          // modal no se quede en "Guardando…" (mismo criterio que las fotos).
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            savePromise.catch((error: unknown) => console.error("Error sincronizando checklist:", error));
            alert("Sin conexión: el checklist se guardará automáticamente al recuperar señal.");
            onClose();
            return;
          }
          await savePromise;
        }
      } else {
        const checkedTaskIds = Object.entries(changedCheckByTaskId)
          .filter(([, isChecked]) => isChecked)
          .map(([taskId]) => taskId);
        await addDoc(collection(db, COLLECTIONS.checklists), {
          houseId: property.id,
          address: property.address ?? "",
          client: property.client ?? "",
          date: todayIso(),
          inspector: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : "Unknown",
          checked: Object.fromEntries(checkedTaskIds.map((taskId) => [taskId, true])),
          notes: notes.trim(),
          createdAt: new Date().toISOString(),
        });
      }
      onClose();
    } catch (error) {
      console.error("Error guardando checklist:", error);
      const firebaseError = error as { code?: string; message?: string };
      alert(`Error al guardar el checklist.\n\nCódigo: ${firebaseError.code ?? "desconocido"}\nDetalle: ${firebaseError.message ?? String(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay-centered hv-cl-overlay"
      onClick={() => !isSaving && onClose()}
    >
      <div className="hv-cl-modal" onClick={(event) => event.stopPropagation()}>
        <header className="hv-cl-header">
          <div className="hv-cl-header-title-wrap">
            <h2 className="hv-cl-title">
              <ClipboardCheck size={20} /> Checklist
              {isReadOnly && (
                <span className="hv-checklist-ro-badge">Solo lectura</span>
              )}
            </h2>
            <p className="hv-cl-prop">
              {clientName} ·{" "}
              {property.address || "—"}
            </p>
            <p className="hv-cl-insp">
              <User size={13} />{" "}
              {currentUser
                ? `${currentUser.firstName} ${currentUser.lastName}`
                : savedChecklist?.inspector || "Unknown"}
              {openedAtIso && (
                <>
                  {" · "}
                  <Clock size={13} /> Entrada {formatTime(openedAtIso)}
                </>
              )}
            </p>
          </div>
          <button
            className="hv-cl-close-btn"
            onClick={onClose}
            disabled={isSaving}
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
              value={placeSearchText}
              onChange={(event) => setPlaceSearchText(event.target.value)}
              placeholder="Buscar área del checklist..."
            />
            {placeSearchText && (
              <button
                onClick={() => setPlaceSearchText("")}
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
                Áreas del checklist ({selectedPlaceIds.length}{" "}
                seleccionada(s))
              </span>
              {selectedTaskCount > 0 && (
                <span className="hv-cl-picker-progress">
                  {checkedTaskCount} de {selectedTaskCount} marcados
                </span>
              )}
            </div>
            {matchingPlaces.length === 0 ? (
              <div className="hv-cl-picker-empty">
                No hay áreas con tareas configuradas.
              </div>
            ) : (
              <div className="hv-cl-chip-list">
                {matchingPlaces.map((place) => {
                  const isSelected = selectedPlaceIds.includes(place.id);
                  return (
                    <button
                      key={place.id}
                      className={`hv-cl-chip${isSelected ? " selected" : ""}`}
                      onClick={() => handleTogglePlace(place.id)}
                    >
                      {isSelected ? <Check size={14} /> : <Plus size={14} />}{" "}
                      {place.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Una tarjeta por área seleccionada — SOLO "Yes" */}
          {selectedPlaces.map((place) => {
            const placeTasks = activeTasks.filter((task) => task.placeId === place.id);
            return (
              <div key={place.id} className="hv-cl-card">
                <h3 className="hv-cl-card-title">{place.name}</h3>
                {placeTasks.map((task) => {
                  const isChecked = isTaskChecked(task.id);
                  return (
                    <div key={task.id} className="hv-cl-task-item">
                      <span className="hv-cl-task-name">{task.name}</span>
                      <div className="hv-cl-task-buttons">
                        <button
                          className={`hv-cl-toggle yes${isChecked ? " active" : ""}`}
                          onClick={() => handleToggleTask(task.id)}
                          disabled={isReadOnly}
                          title={
                            isChecked ? "Quitar la marca" : "Marcar como hecho"
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

          {selectedPlaces.length === 0 && matchingPlaces.length > 0 && (
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
              value={notes}
              onChange={(event) => setNotesDraft(event.target.value)}
              placeholder="Observaciones del checklist…"
              disabled={isReadOnly}
            />
          </div>
        </div>

        {/* Barra de guardado: solo "Guardar Checklist" (sin DID NOT PASS) */}
        <div className="hv-cl-savebar">
          {isReadOnly ? (
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
              disabled={!canSave}
            >
              <Save size={18} />{" "}
              {saveButtonLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChecklistModal;
