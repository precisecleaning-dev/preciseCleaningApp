// ⭐ PREVISUALIZACIÓN DEL SYNC A GOOGLE CALENDAR: muestra EXACTAMENTE lo que se
//    enviará (misma lógica que la Cloud Function) y los datos obligatorios con
//    ✓/✗; solo envía al confirmar. Extraído de HousesView.
import type { CSSProperties } from "react";
import { AlertTriangle, Calendar, Check, X } from "lucide-react";
import type { Property, Team } from "../../../types/index";
import { formatDate } from "../../../utils/dateFormat";

interface GcalPreviewModalProps {
  house: Property;
  teams: Team[];
  getClientName: (idOrName?: string | null) => string;
  busy: boolean;
  onSend: () => void;
  onClose: () => void;
}

export default function GcalPreviewModal({ house, teams, getClientName, busy, onSend, onClose }: GcalPreviewModalProps) {
  // ⭐ Datos EXACTOS que se enviarán a Google Calendar, calculados con la misma
  //    lógica que la Cloud Function, para mostrarlos en la previsualización.
  const buildGcalPreview = () => {
    const team = teams.find((t) => t.id === house.teamId);
    const teamName = (team?.name || "").trim();
    const base = house.address || getClientName(house.client);
    const title = teamName ? `${teamName} - ${base}` : `Cleaning: ${base}`;
    // ⭐ DATOS OBLIGATORIOS para poder enviar: sin ellos el evento no puede
    //    crearse (la fecha y la hora de entrada definen el evento). Se listan
    //    en el modal con su estado ✓/✗ y el botón de enviar se bloquea si
    //    falta alguno.
    const required = [
      {
        label: "Schedule Date",
        ok: !!house.scheduleDate,
        value: formatDate(house.scheduleDate),
      },
      {
        label: "Time In",
        ok: !!house.timeIn,
        value: house.timeIn || "",
      },
      {
        label: "Dirección o Cliente",
        ok: !!(house.address || getClientName(house.client)),
        value: house.address || getClientName(house.client) || "",
      },
    ];
    const canSend = required.every((r) => r.ok);

    const warnings: string[] = [];
    if (!teamName) warnings.push("La casa no tiene Team asignado: el título saldrá sin equipo.");
    if (team && !team.color) warnings.push("El Team no tiene color en el catálogo: el evento usará el color por defecto.");
    if (!house.timeOut) warnings.push("Sin Time Out: se usarán 2 horas de duración como respaldo.");
    return {
      required,
      canSend,
      title,
      teamColor: team?.color || "",
      teamName,
      warnings,
      date: formatDate(house.scheduleDate),
      timeIn: house.timeIn,
      timeOut: house.timeOut || "(+2 horas)",
      location: house.address || "",
      description: house.note || "",
    };
  };

  const gp = buildGcalPreview();
  return (
    <div
      className="modal-overlay-centered"
      onClick={onClose}
    >
      <div className="modal-50" onClick={(e) => e.stopPropagation()}>
        <header className="hv-modal-header">
          <h3 className="hv-modal-title">Enviar a Google Calendar</h3>
          <button
            className="hv-gcal-close"
            aria-label="Cerrar"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>
        <div className="hv-gcal-body">
          <p className="hv-gcal-hint">
            Revisa la información antes de enviarla. El evento se crea o
            actualiza en el calendario al confirmar.
          </p>
          {/* ⭐ DATOS OBLIGATORIOS: sin ellos no se puede enviar */}
          <div className={`hv-gcal-required${gp.canSend ? " ok" : ""}`}>
            <span className="hv-gcal-required-title">
              Datos obligatorios para enviar
            </span>
            {gp.required.map((r) => (
              <span
                key={r.label}
                className={`hv-gcal-req-row${r.ok ? " ok" : " missing"}`}
              >
                {r.ok ? <Check size={14} /> : <X size={14} />}
                <span className="hv-gcal-req-label">{r.label}:</span>{" "}
                {r.ok ? r.value : "FALTA — complétalo en Edit Details"}
              </span>
            ))}
          </div>
          <div className="hv-gcal-row">
            <span className="hv-gcal-label">Título</span>
            <span className="hv-gcal-value strong">{gp.title}</span>
          </div>
          <div className="hv-gcal-row">
            <span className="hv-gcal-label">Horario</span>
            <span className="hv-gcal-value">
              {gp.date} · {gp.timeIn} – {gp.timeOut}
            </span>
          </div>
          <div className="hv-gcal-row">
            <span className="hv-gcal-label">Color</span>
            <span className="hv-gcal-value">
              {gp.teamColor ? (
                <>
                  <span
                    className="hv-gcal-swatch"
                    style={{ "--gcal-swatch": gp.teamColor } as CSSProperties}
                  />
                  {gp.teamColor.toUpperCase()}
                  {gp.teamName ? ` (${gp.teamName})` : ""}
                </>
              ) : (
                "Por defecto (el Team no tiene color)"
              )}
            </span>
          </div>
          <div className="hv-gcal-row">
            <span className="hv-gcal-label">Ubicación</span>
            <span className="hv-gcal-value">{gp.location || "—"}</span>
          </div>
          <div className="hv-gcal-row">
            <span className="hv-gcal-label">Nota</span>
            <span className="hv-gcal-value">{gp.description || "—"}</span>
          </div>
          {gp.warnings.length > 0 && (
            <div className="hv-gcal-warnings">
              {gp.warnings.map((w) => (
                <span key={w} className="hv-gcal-warning">
                  <AlertTriangle size={13} /> {w}
                </span>
              ))}
            </div>
          )}
          <p className="hv-gcal-note">
            El evento se envía sin Google Meet, sin notificación y sin
            invitados (los correos de los colaboradores ya no se agregan
            al calendario).
          </p>
        </div>
        <footer className="hv-gcal-footer">
          <button
            className="hv-gcal-btn-cancel"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="hv-btn-primary-modal"
            disabled={busy || !gp.canSend}
            title={
              gp.canSend
                ? undefined
                : "Faltan datos obligatorios (ver lista arriba)"
            }
            onClick={onSend}
          >
            <Calendar size={16} />{" "}
            {busy
              ? "Enviando..."
              : gp.canSend
                ? "Confirmar y enviar"
                : "Faltan datos obligatorios"}
          </button>
        </footer>
      </div>
    </div>
  );
}
