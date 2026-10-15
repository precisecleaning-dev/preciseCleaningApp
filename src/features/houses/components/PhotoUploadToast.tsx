// ⭐ BARRA DE PROGRESO DE FOTOS: flotante abajo al centro, POR ENCIMA de los
//    modales (z 10001): el usuario ve que sus fotos están viajando y cuánto
//    falta. Extraído de HousesView.
import type { CSSProperties } from "react";

export interface UploadProgress {
  label: string;
  done: number;
  total: number;
  percent: number;
}

interface PhotoUploadToastProps {
  progress: UploadProgress;
}

export default function PhotoUploadToast({ progress }: PhotoUploadToastProps) {


  return (
    <div className="hv-upload-toast" role="status">
      <div className="hv-upload-toast-head">
        <span className="hv-upload-spinner" />
        <span className="hv-upload-title">
          Subiendo {progress.label}… {progress.done}/{progress.total}
        </span>
        <span className="hv-upload-pct">{progress.percent}%</span>
      </div>
      <div className="hv-upload-track">
        <div
          className="hv-upload-fill"
          style={{ "--pct": `${progress.percent}%` } as CSSProperties}
        />
      </div>
      <span className="hv-upload-hint">
        No cierres la app hasta que termine.
      </span>
    </div>
  );
}
