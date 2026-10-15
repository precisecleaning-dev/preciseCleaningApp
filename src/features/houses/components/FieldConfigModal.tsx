// ⭐ CONFIGURE FIELDS — visibilidad y solo lectura de campos, status y botones
//    de Houses por rol (app_settings/houses_form_config). Cada rol tiene UN
//    chip con 3 estados (Visible → Solo lectura → Oculto); los botones y los
//    status solo Visible ↔ Oculto. Extraído de HousesView.
import { useState } from "react";
import { Eye, EyeOff, Lock, Save, X } from "lucide-react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../../config/firebase";
import { COLLECTIONS } from "../../../lib/firebase/collections";
import type { Role, Status } from "../../../types/index";
import { CONFIGURABLE_BUTTONS, CONFIGURABLE_FIELDS, type FormVisibilityConfig } from "../houseFieldConfig";

interface FieldConfigModalProps {
  formConfig: FormVisibilityConfig;
  roles: Role[];
  statuses: Status[];
  onClose: () => void;
}

export default function FieldConfigModal({ formConfig, roles, statuses, onClose }: FieldConfigModalProps) {
  // Borrador: copia de la configuración al abrir; se guarda con "Save Configuration".
  const [fieldConfigDraft, setFieldConfigDraft] = useState<FormVisibilityConfig>(() => ({
    visibility: { ...(formConfig.visibility || {}) },
    readOnly: { ...(formConfig.readOnly || {}) },
  }));
  const [isSavingFieldConfig, setIsSavingFieldConfig] = useState(false);

  const toggleElementVisibilityForRole = (
    elementId: string,
    roleId: string,
  ) => {
    setFieldConfigDraft((prev) => {
      const currentHidden = prev.visibility?.[elementId] || [];
      const newHidden = currentHidden.includes(roleId)
        ? currentHidden.filter((r) => r !== roleId)
        : [...currentHidden, roleId];
      return {
        ...prev,
        visibility: { ...prev.visibility, [elementId]: newHidden },
      };
    });
  };

  // ⭐ CONFIGURADOR REDISEÑADO: cada rol tiene UN solo chip con 3 estados claros.
  //    Visible (verde)      = el rol ve y edita el elemento.
  //    Solo lectura (ámbar) = el rol lo ve pero NO lo edita (solo campos).
  //    Oculto (rojo)        = el rol NO lo ve.
  //    Un clic recorre: Visible → Solo lectura → Oculto → Visible.
  type FieldRoleState = "visible" | "readonly" | "hidden";

  const getFieldStateForRole = (
    elementId: string,
    roleId: string,
  ): FieldRoleState => {
    if ((fieldConfigDraft.visibility?.[elementId] || []).includes(roleId))
      return "hidden";
    if ((fieldConfigDraft.readOnly?.[elementId] || []).includes(roleId))
      return "readonly";
    return "visible";
  };

  const cycleFieldStateForRole = (elementId: string, roleId: string) => {
    setFieldConfigDraft((prev) => {
      const hiddenList = prev.visibility?.[elementId] || [];
      const roList = prev.readOnly?.[elementId] || [];
      const isHidden = hiddenList.includes(roleId);
      const isRO = roList.includes(roleId);
      // Base: quitar el rol de ambas listas y luego colocarlo según el siguiente estado
      let newHidden = hiddenList.filter((r) => r !== roleId);
      let newRO = roList.filter((r) => r !== roleId);
      if (!isHidden && !isRO) {
        // Visible → Solo lectura
        newRO = [...newRO, roleId];
      } else if (isRO && !isHidden) {
        // Solo lectura → Oculto
        newHidden = [...newHidden, roleId];
      }
      // Oculto → Visible (queda fuera de ambas listas)
      return {
        ...prev,
        visibility: { ...prev.visibility, [elementId]: newHidden },
        readOnly: { ...(prev.readOnly || {}), [elementId]: newRO },
      };
    });
  };

  // ⭐ Botones/tabs solo tienen 2 estados: Visible ↔ Oculto
  const getButtonStateForRole = (
    elementId: string,
    roleId: string,
  ): "visible" | "hidden" =>
    (fieldConfigDraft.visibility?.[elementId] || []).includes(roleId)
      ? "hidden"
      : "visible";

  // Un botón Visible/Oculto por rol (statuses, botones y tabs).
  const roleToggles = (elementId: string) =>
    roles.map((role) => {
      const state = getButtonStateForRole(elementId, role.id);
      return (
        <button
          key={role.id}
          onClick={() => toggleElementVisibilityForRole(elementId, role.id)}
          className={`hv-role-state ${state}`}
          title="Clic para alternar: Visible ↔ Oculto"
        >
          {state === "visible" ? <Eye size={13} /> : <EyeOff size={13} />}
          <span className="hv-role-state-name">{role.name}</span>
          <span className="hv-role-state-label">
            {state === "visible" ? "Visible" : "Oculto"}
          </span>
        </button>
      );
    });

  const saveFieldConfig = async () => {
    setIsSavingFieldConfig(true);
    try {
      const ref = doc(db, COLLECTIONS.appSettings, "houses_form_config");
      await setDoc(
        ref,
        {
          visibility: fieldConfigDraft.visibility,
          readOnly: fieldConfigDraft.readOnly || {},
        },
        { merge: true },
      );
      onClose();
    } catch (error) {
      console.error("Error guardando configuración de campos:", error);
      // ⭐ Mostrar el error REAL de Firebase (code + message) para diagnosticar:
      //    'permission-denied' = reglas/sesión; 'invalid-argument' = datos inválidos.
      const fbErr = error as { code?: string; message?: string };
      alert(
        `Error al guardar la configuración.\n\nCódigo: ${fbErr.code || "desconocido"}\nDetalle: ${fbErr.message || String(error)}`,
      );
    } finally {
      setIsSavingFieldConfig(false);
    }
  };

  return (
    <div
      className="modal-overlay-centered"
      onClick={onClose}
    >
      <div className="modal-70" onClick={(e) => e.stopPropagation()}>
        <header className="hv-modal-header">
          <div>
            <h3 className="hv-modal-title">Field & Button Visibility</h3>
            <p className="hv-modal-subtitle">
              Haz clic en el chip de cada rol para cambiar su estado. Los
              cambios se aplican al presionar "Save Configuration".
            </p>
          </div>
          <button
            className="hv-modal-close-btn"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>
        <div className="hv-modal-body-padded">
          {roles.length === 0 ? (
            <div className="hv-fieldconfig-empty">
              No hay roles configurados.
            </div>
          ) : (
            <>
              {/* ⭐ LEYENDA: qué significa cada color/estado */}
              <div className="hv-fieldconfig-legend">
                <span className="hv-role-state visible demo">
                  <Eye size={13} /> Visible — lo ve y lo edita
                </span>
                <span className="hv-role-state readonly demo">
                  <Lock size={13} /> Solo lectura — lo ve pero NO lo edita
                </span>
                <span className="hv-role-state hidden demo">
                  <EyeOff size={13} /> Oculto — NO lo ve
                </span>
              </div>

              <h4 className="hv-fieldconfig-section-title">Form Fields</h4>
              <div className="hv-fieldconfig-list">
                {CONFIGURABLE_FIELDS.map((field) => (
                  <div key={field.id} className="hv-fieldconfig-row">
                    <div className="hv-fieldconfig-row-label">
                      {field.label}{" "}
                      <span className="hv-fieldconfig-section-tag">
                        · {field.section}
                      </span>
                    </div>
                    <div className="hv-fieldconfig-roles-wrap">
                      {roles.map((role) => {
                        const state = getFieldStateForRole(
                          field.id,
                          role.id,
                        );
                        return (
                          <button
                            key={role.id}
                            onClick={() =>
                              cycleFieldStateForRole(field.id, role.id)
                            }
                            className={`hv-role-state ${state}`}
                            title="Clic para cambiar: Visible → Solo lectura → Oculto"
                          >
                            {state === "visible" && <Eye size={13} />}
                            {state === "readonly" && <Lock size={13} />}
                            {state === "hidden" && <EyeOff size={13} />}
                            <span className="hv-role-state-name">
                              {role.name}
                            </span>
                            <span className="hv-role-state-label">
                              {state === "visible"
                                ? "Visible"
                                : state === "readonly"
                                  ? "Solo lectura"
                                  : "Oculto"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* ⭐ VISIBILIDAD DE STATUS por rol (Pipeline y Overview).
                  Cada status genera un elemento "status_<id>"; oculto = el
                  rol no ve esa columna/KPI ni las casas en ese status. */}
              <h4 className="hv-fieldconfig-section-title">
                Status Visibility (Pipeline & Overview)
              </h4>
              <p className="hv-fieldconfig-hint">
                Controla qué columnas de status ve cada rol. Oculto = esa
                columna y sus casas no aparecen para ese rol. (Visible u
                Oculto.)
              </p>
              <div className="hv-fieldconfig-list">
                {statuses.map((st) => (
                  <div key={st.id} className="hv-fieldconfig-row">
                    <div className="hv-fieldconfig-row-label">
                      {st.name}{" "}
                      <span className="hv-fieldconfig-section-tag">
                        · Status
                      </span>
                    </div>
                    <div className="hv-fieldconfig-roles-wrap">
                      {roleToggles(`status_${st.id}`)}
                    </div>
                  </div>
                ))}
              </div>

              <h4 className="hv-fieldconfig-section-title">
                Buttons & Tabs
              </h4>
              <p className="hv-fieldconfig-hint">
                Los botones y tabs solo tienen dos estados: Visible u
                Oculto (clic para alternar).
              </p>
              <div className="hv-fieldconfig-list no-mb">
                {CONFIGURABLE_BUTTONS.map((btn) => (
                  <div key={btn.id} className="hv-fieldconfig-row">
                    <div className="hv-fieldconfig-row-label">
                      {btn.label}{" "}
                      <span className="hv-fieldconfig-section-tag">
                        · {btn.section}
                      </span>
                    </div>
                    <div className="hv-fieldconfig-roles-wrap">
                      {roleToggles(btn.id)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <footer className="hv-modal-footer">
          <button
            onClick={onClose}
            className="hv-btn-outline-modal"
          >
            Cancel
          </button>
          <button
            onClick={saveFieldConfig}
            disabled={isSavingFieldConfig}
            className="hv-btn-primary-modal"
          >
            <Save size={16} />{" "}
            {isSavingFieldConfig ? "Saving..." : "Save Configuration"}
          </button>
        </footer>
      </div>
    </div>
  );
}
