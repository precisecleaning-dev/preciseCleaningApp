// ⭐ MODAL DAMAGES — daños reportados de la casa (colección 'damages').
//    Permisos SOLO por configurador: card_damages visible = ver; NO solo
//    lectura = agregar, editar y eliminar. Los datos y las escrituras vienen
//    de useHouseDamages (el detalle muestra el conteo). Extraído de HousesView.
import { useState } from "react";
import { AlertTriangle, Edit2, Image as ImageIcon, Plus, Save, Trash2, X } from "lucide-react";
import type { Property } from "../../../types/index";
import type { HouseDamages } from "../hooks/useHouseDamages";
import PhotoUploadToast from "./PhotoUploadToast";

interface DamagesModalProps {
  house: Property;
  clientName: string;
  readOnly: boolean;
  api: HouseDamages;
  onClose: () => void;
}

export default function DamagesModal({ house, clientName, readOnly, api, onClose }: DamagesModalProps) {
  // ⭐ El formulario de nuevo daño vive COLAPSADO tras "Agregar más daños".
  const [isAddingDamage, setIsAddingDamage] = useState(false);
  const [newDamageDesc, setNewDamageDesc] = useState("");
  const [newDamageNotes, setNewDamageNotes] = useState("");
  const [newDamageFiles, setNewDamageFiles] = useState<File[]>([]);
  const [editingDamageId, setEditingDamageId] = useState<string | null>(null);
  const [editDamageDesc, setEditDamageDesc] = useState("");
  const [editDamageNotes, setEditDamageNotes] = useState("");

  const addDamage = async () => {
    if (!(await api.add(newDamageDesc, newDamageNotes, newDamageFiles))) return;
    setNewDamageDesc("");
    setNewDamageNotes("");
    setNewDamageFiles([]);
    setIsAddingDamage(false);
  };

  const saveEdit = async () => {
    if (editingDamageId && (await api.saveEdit(editingDamageId, editDamageDesc, editDamageNotes))) setEditingDamageId(null);
  };

  return (
    <>
      <div
        className="modal-overlay-centered"
        onClick={onClose}
      >
        <div
          className="hv-damages-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="hv-damages-modal-header">
            <h3 className="hv-damages-modal-title">
              <AlertTriangle size={18} /> Damages
              <span className="hv-damages-count">{api.damages.length}</span>
            </h3>
            <button
              className="hv-damages-modal-close"
              onClick={onClose}
            >
              <X size={22} />
            </button>
          </header>
          <p className="hv-damages-modal-sub">
            {clientName} ·{" "}
            {house.address || "—"}
          </p>

          <div className="hv-damages-modal-body">
            {api.isLoading ? (
              <div className="hv-damages-empty">Cargando daños…</div>
            ) : api.damages.length === 0 ? (
              <div className="hv-damages-empty">
                Sin daños reportados para esta casa.
              </div>
            ) : (
              <ul className="hv-damages-list">
                {api.damages.map((dam) => (
                  <li key={dam.id} className="hv-damage-item">
                    <div className="hv-damage-top">
                      <span className="hv-damage-id" title={dam.id}>
                        ID: {dam.id.slice(0, 8).toUpperCase()}
                      </span>
                      {!readOnly && (
                        <div className="hv-damage-actions">
                          <button
                            className="hv-damage-btn edit"
                            title="Editar daño"
                            onClick={() => {
                              setEditingDamageId(dam.id);
                              setEditDamageDesc(dam.description || "");
                              setEditDamageNotes(dam.notes || "");
                            }}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            className="hv-damage-btn delete"
                            title="Eliminar daño"
                            onClick={() => api.remove(dam)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>

                    {editingDamageId === dam.id ? (
                      <div className="hv-damage-edit-form">
                        <input
                          className="hv-input"
                          value={editDamageDesc}
                          onChange={(e) => setEditDamageDesc(e.target.value)}
                          placeholder="Description *"
                        />
                        <textarea
                          className="hv-input hv-damage-textarea"
                          value={editDamageNotes}
                          onChange={(e) => setEditDamageNotes(e.target.value)}
                          placeholder="Notes"
                        />
                        <div className="hv-damage-edit-actions">
                          <button
                            className="hv-btn-compact bg-blue"
                            onClick={saveEdit}
                            disabled={api.isSaving}
                          >
                            <Save size={13} /> Guardar
                          </button>
                          <button
                            className="hv-btn-compact"
                            onClick={() => setEditingDamageId(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="hv-damage-desc">
                          {dam.description}
                        </div>
                        {dam.notes && (
                          <div className="hv-damage-notes">{dam.notes}</div>
                        )}
                      </>
                    )}

                    {(dam.photos || []).length > 0 && (
                      <div className="hv-damage-photos">
                        {(dam.photos || []).map((url, i) => (
                          <div
                            key={`${dam.id}-${i}`}
                            className="hv-damage-photo-wrap"
                          >
                            <a href={url} target="_blank" rel="noreferrer">
                              <img
                                src={url}
                                alt={`Damage ${i + 1}`}
                                className="hv-damage-photo"
                              />
                            </a>
                            {!readOnly && (
                              <button
                                className="hv-damage-photo-remove"
                                onClick={() => api.removePhoto(dam, i)}
                                title="Quitar foto"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {!readOnly && (
                      <label className="hv-damage-add-photos">
                        <ImageIcon size={13} /> Agregar fotos
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hv-damage-file-input"
                          onChange={(e) => {
                            void api.addPhotos(dam, e.target.files);
                            e.target.value = "";
                          }}
                          disabled={api.isSaving}
                        />
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {!readOnly && !isAddingDamage && (
              <button
                className="hv-damage-add-btn"
                onClick={() => setIsAddingDamage(true)}
              >
                <Plus size={16} />{" "}
                {api.damages.length > 0 ? "Agregar más daños" : "Agregar daño"}
              </button>
            )}

            {!readOnly && isAddingDamage && (
              <div className="hv-damage-new">
                <span className="hv-detail-label">REPORTAR NUEVO DAÑO</span>
                <input
                  className="hv-input"
                  value={newDamageDesc}
                  onChange={(e) => setNewDamageDesc(e.target.value)}
                  placeholder="Description *"
                />
                <textarea
                  className="hv-input hv-damage-textarea"
                  value={newDamageNotes}
                  onChange={(e) => setNewDamageNotes(e.target.value)}
                  placeholder="Notes"
                />
                <label className="hv-damage-add-photos">
                  <ImageIcon size={13} /> Fotos ({newDamageFiles.length})
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hv-damage-file-input"
                    onChange={(e) => {
                      if (e.target.files)
                        setNewDamageFiles(Array.from(e.target.files));
                    }}
                    disabled={api.isSaving}
                  />
                </label>
                <div className="hv-damage-new-actions">
                  <button
                    className="hv-btn-outline-modal"
                    onClick={() => {
                      setIsAddingDamage(false);
                      setNewDamageDesc("");
                      setNewDamageNotes("");
                      setNewDamageFiles([]);
                    }}
                    disabled={api.isSaving}
                  >
                    Cancelar
                  </button>
                  <button
                    className="hv-btn-primary-modal"
                    onClick={addDamage}
                    disabled={api.isSaving}
                  >
                    <Plus size={15} />{" "}
                    {api.isSaving ? "Guardando…" : "Guardar daño"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {api.upload && <PhotoUploadToast progress={api.upload} />}
    </>
  );
}
