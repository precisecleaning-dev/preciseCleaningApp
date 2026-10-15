// ⭐ CÁMARA RÁPIDA (ráfaga): se abre una vez y permite tomar varias fotos
//    seguidas sin cerrarse; cada toma pasa por el mismo flujo de compresión y
//    vista previa (onCapture). Va por PORTAL a body: el overlay fixed cubre el
//    viewport real y el obturador queda SIEMPRE visible en el teléfono.
//    Extraído de HousesView.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, X } from "lucide-react";

interface BurstCameraProps {
  type: "before" | "after";
  /** Abierta desde la tarjeta: "Guardar" sube las fotos al terminar. */
  autoSave: boolean;
  /** Comprimiendo la última toma. */
  busy: boolean;
  onCapture: (file: File) => Promise<void>;
  /** Cerrar sin guardar (o la cámara no se pudo abrir). */
  onCancel: () => void;
  /** "Listo" / "Guardar" con el número de tomas. */
  onDone: (count: number) => void;
}

export default function BurstCamera({ type, autoSave, busy, onCapture, onCancel, onDone }: BurstCameraProps) {
  const [burstCount, setBurstCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // La cámara vive mientras el componente está montado.
  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => { });
        }
      } catch (e) {
        console.error("No se pudo abrir la cámara:", e);
        alert('No se pudo abrir la cámara. Revisa los permisos del navegador o usa "Cargar/Galería".');
        onCancel();
      }
    };
    void start();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // Solo al montar: onCancel cambia en cada render del padre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const captureBurst = async () => {
    const video = videoRef.current;
    if (!video) return;
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const maxW = 1600;
    const scale = w > maxW ? maxW / w : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.9));
    if (!blob) return;
    // Mismo flujo que "Cargar" (compresión + preview + cola offline al guardar)
    await onCapture(new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" }));
    setBurstCount((c) => c + 1);
  };

  // ⭐ "Cerrar" descarta la sesión SIN guardar. Con fotos en modo autoguardado
  //    pide confirmación para no perder el trabajo por un toque accidental.
  const cancel = () => {
    if (autoSave && burstCount > 0 && !window.confirm("Tienes fotos sin guardar. ¿Cerrar sin guardarlas?")) return;
    onCancel();
  };

  return createPortal(
    <div className="hv-camera-overlay">
      <div className="hv-camera-topbar">
        <div className="hv-camera-title">
          <Camera size={18} />{" "}
          {type === "before" ? "Fotos Before" : "Fotos After"} ·{" "}
          {burstCount} tomada(s)
        </div>
        <button
          onClick={cancel}
          className="hv-camera-close-btn"
        >
          <X size={18} /> Cerrar
        </button>
      </div>
      <div className="hv-camera-video-wrap">
        <video
          ref={videoRef}
          playsInline
          muted
          className="hv-camera-video"
        />
        {busy && (
          <div className="hv-camera-processing-badge">Procesando…</div>
        )}
        {burstCount > 0 && (
          <div className="hv-camera-count-badge">
            {burstCount} foto(s) agregada(s)
          </div>
        )}
      </div>
      <div className="hv-camera-controls">
        <button
          onClick={captureBurst}
          aria-label="Tomar foto"
          className="hv-camera-shutter"
        />
        <button
          onClick={() => onDone(burstCount)}
          className="hv-camera-done-btn"
        >
          {autoSave
            ? `Guardar (${burstCount})`
            : `Listo (${burstCount})`}
        </button>
      </div>
    </div>,
    document.body,
  );
}
