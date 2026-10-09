// src/features/houses/components/StatusPillSelector.tsx
// Pastilla con el estado de una casa; al tocarla pide abrir StatusChangeModal.
// Extraído de HousesView.tsx.
import type { CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Status } from '../../../types/index';
import type { StatusModalConfig } from '../../../components/StatusChangeModal';
import './StatusPillSelector.css';

// StatusPillSelector: muestra el estado actual como "badge" con el color del estado.
// Al tocarlo YA NO abre una lista desplegable: solicita abrir el modal central de
// selección de estado (StatusChangeModal), que se ve igual de claro en móvil y escritorio.
// Variantes: normal (tabla), `fullWidth` (tarjeta móvil) y `large` (detalle de la casa).
export default function StatusPillSelector({
  currentStatusId,
  statuses,
  onChange,
  disabled,
  fullWidth = false,
  large = false,
  onRequestOpen,
  modalTitle,
  modalSubtitle,
}: {
  currentStatusId: string;
  statuses: Status[];
  onChange: (id: string) => void;
  disabled: boolean;
  fullWidth?: boolean;
  large?: boolean;
  onRequestOpen?: (cfg: StatusModalConfig) => void;
  modalTitle?: string;
  modalSubtitle?: string;
}) {
  const safeValue = String(currentStatusId || "")
    .toLowerCase()
    .trim();
  const status = statuses.find(
    (s) =>
      String(s.id).toLowerCase().trim() === safeValue ||
      String(s.name).toLowerCase().trim() === safeValue,
  );

  const pointColor = status ? status.color : "#64748b";
  const text = status ? status.name : "Unassigned";
  const block = fullWidth || large;

  const handleOpen = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || !onRequestOpen) return;
    onRequestOpen({
      currentId: currentStatusId,
      onSelect: onChange,
      title: modalTitle,
      subtitle: modalSubtitle,
    });
  };

  const pillVars = {
    "--pill-bg": large ? `${pointColor}12` : `${pointColor}14`,
    "--pill-border": large ? pointColor : `${pointColor}40`,
    "--pill-text": large ? pointColor : "#1e293b",
    "--pill-shadow": `${pointColor}26`,
    "--dot-color": pointColor,
    "--dot-ring": `${pointColor}22`,
  } as CSSProperties;

  return (
    <div className={`hv-statuspill-outer${block ? " block" : ""}`}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleOpen(e);
        }}
        className={`hv-statuspill${large ? " large" : fullWidth ? " full" : ""}${disabled ? " disabled" : ""}`}
        style={pillVars}
        title={disabled ? undefined : "Cambiar estado"}
      >
        <span className={`hv-statuspill-label-wrap${large ? " large" : ""}`}>
          <span className={`hv-statuspill-dot${large ? " large" : ""}`}></span>
          <span className="hv-statuspill-text">{text}</span>
        </span>
        <ChevronDown
          size={large ? 22 : fullWidth ? 16 : 14}
          color={large ? pointColor : "#94a3b8"}
          className="hv-statuspill-chevron"
        />
      </div>
    </div>
  );
}
