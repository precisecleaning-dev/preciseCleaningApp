// ⭐ VERIFICACIÓN: lo que Google REALMENTE guardó (releído del calendario por la
//    Cloud Function tras enviar), con enlace al evento para rectificarlo.
//    Extraído de HousesView.
import { Calendar, X } from "lucide-react";

export interface GcalVerification {
  summary: string;
  htmlLink: string;
  colorId: string;
  start: string;
  end: string;
  location: string;
  meetRemoved: boolean;
  remindersOff: boolean;
}

interface GcalVerificationModalProps {
  verification: GcalVerification;
  onClose: () => void;
}

export default function GcalVerificationModal({ verification, onClose }: GcalVerificationModalProps) {


  return (
    <div
      className="modal-overlay-centered"
      onClick={onClose}
    >
      <div className="modal-50" onClick={(e) => e.stopPropagation()}>
        <header className="hv-modal-header">
          <h3 className="hv-modal-title">✅ Evento guardado en Google Calendar</h3>
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
            Esto es lo que Google confirmó que quedó guardado en el
            calendario (leído de vuelta después de enviar):
          </p>
          <div className="hv-gcal-row">
            <span className="hv-gcal-label">Título</span>
            <span className="hv-gcal-value strong">{verification.summary || "—"}</span>
          </div>
          <div className="hv-gcal-row">
            <span className="hv-gcal-label">Horario</span>
            <span className="hv-gcal-value">
              {verification.start || "—"} – {verification.end || "—"}
            </span>
          </div>
          <div className="hv-gcal-row">
            <span className="hv-gcal-label">Color</span>
            <span className="hv-gcal-value">
              {verification.colorId
                ? `Aplicado (colorId ${verification.colorId} de Google)`
                : "Por defecto del calendario"}
            </span>
          </div>
          <div className="hv-gcal-row">
            <span className="hv-gcal-label">Ubicación</span>
            <span className="hv-gcal-value">{verification.location || "—"}</span>
          </div>
          <div className="hv-gcal-row">
            <span className="hv-gcal-label">Meet</span>
            <span className="hv-gcal-value">
              {verification.meetRemoved ? "Sin Google Meet ✓" : "⚠ Google agregó un Meet"}
            </span>
          </div>
          <div className="hv-gcal-row">
            <span className="hv-gcal-label">Aviso</span>
            <span className="hv-gcal-value">
              {verification.remindersOff ? "Sin notificación ✓" : "⚠ El evento tiene notificación"}
            </span>
          </div>
          <p className="hv-gcal-note">
            Si editas el evento en Google Calendar (fecha, horas, dirección
            o nota), el cambio regresará a la app automáticamente.
          </p>
        </div>
        <footer className="hv-gcal-footer">
          <button
            className="hv-gcal-btn-cancel"
            onClick={onClose}
          >
            Cerrar
          </button>
          {verification.htmlLink && (
            <button
              className="hv-btn-primary-modal"
              onClick={() => window.open(verification.htmlLink, "_blank")}
            >
              <Calendar size={16} /> Ver en Google Calendar
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
