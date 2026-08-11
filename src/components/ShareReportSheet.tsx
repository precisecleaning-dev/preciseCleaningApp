import { useState } from 'react';
import { Send, Download, Share2, X, FileText, Check } from 'lucide-react';
import {
  shareNow, downloadPrepared, openWhatsAppWithText, canShareFiles,
  type PreparedQCShare,
} from '../utils/shareQCReport';
import './ShareReportSheet.css';

// ============================================================================
// ⭐ HOJA "REPORTE LISTO"
//
// Existe por una razón técnica concreta, no estética: en iOS Safari,
// `navigator.share()` solo funciona si se llama dentro de la activación por
// gesto del usuario, que dura ~1 segundo tras el toque. Generar el PDF tarda
// varios segundos, así que compartir DESPUÉS del await siempre fallaba en
// silencio. (Ver el comentario largo en src/utils/shareQCReport.ts.)
//
// Esta hoja recibe el PDF ya generado y ofrece los botones. Cada uno es un
// toque NUEVO, con activación fresca, así que las APIs del sistema responden.
//
// El toque extra se compensa mostrando el peso del archivo: con inspecciones
// de 20 fotos el PDF puede pasar de 5 MB, y saberlo antes de mandarlo por
// datos móviles es información útil, no ruido.
// ============================================================================

interface ShareReportSheetProps {
  prepared: PreparedQCShare;
  /** Título del reporte, para que se vea qué se está por enviar. */
  clientName: string;
  /** Teléfono destino opcional (formato internacional). */
  phone?: string | null;
  onClose: () => void;
}

export default function ShareReportSheet({
  prepared, clientName, phone, onClose,
}: ShareReportSheetProps) {
  const [downloaded, setDownloaded] = useState(false);
  const supportsNativeShare = canShareFiles();

  // ⚠ Sin `await` antes de shareNow: cualquier espera aquí volvería a romper la
  //   activación por gesto y estaríamos igual que al principio.
  const handleNativeShare = () => {
    shareNow(prepared).then(res => {
      if (res.status === 'shared') onClose();
      // 'cancelled' deja la hoja abierta a propósito: el usuario cerró el
      // selector del sistema, quizá para elegir otra opción de aquí.
    });
  };

  const handleWhatsAppText = () => {
    // Se descarga primero para que el archivo esté disponible al adjuntarlo.
    downloadPrepared(prepared);
    openWhatsAppWithText(prepared.message, phone);
    onClose();
  };

  const handleDownload = () => {
    downloadPrepared(prepared);
    setDownloaded(true);
  };

  return (
    <div className="srs-overlay" onClick={onClose}>
      <div className="srs-sheet" onClick={e => e.stopPropagation()}>
        <header className="srs-head">
          <div className="srs-head-info">
            <span className="srs-file-icon"><FileText size={20} /></span>
            <div className="srs-min-w-0">
              <h3 className="srs-title">Reporte listo</h3>
              <p className="srs-subtitle">
                {clientName} · PDF {prepared.sizeLabel}
              </p>
            </div>
          </div>
          <button type="button" className="srs-close" onClick={onClose} aria-label="Cerrar">
            <X size={22} />
          </button>
        </header>

        <div className="srs-actions">
          {supportsNativeShare ? (
            <>
              <button type="button" className="srs-btn primary" onClick={handleNativeShare}>
                <Share2 size={18} />
                <span className="srs-btn-text">
                  <strong>Compartir</strong>
                  <small>WhatsApp, correo, o cualquier app</small>
                </span>
              </button>
              <p className="srs-hint">
                Se abre el menú del sistema con el PDF ya adjunto. Elige WhatsApp
                y luego el contacto.
              </p>
            </>
          ) : (
            <>
              <button type="button" className="srs-btn whatsapp" onClick={handleWhatsAppText}>
                <Send size={18} />
                <span className="srs-btn-text">
                  <strong>Abrir WhatsApp</strong>
                  <small>Descarga el PDF y abre el chat</small>
                </span>
              </button>
              {/* Este navegador no puede adjuntar archivos por sí solo, así que
                  hay que decirlo: si no, el usuario ve WhatsApp abrirse "vacío"
                  y cree que se perdió el reporte. */}
              <p className="srs-hint warn">
                Este navegador no permite adjuntar el archivo automáticamente.
                El PDF se descarga y lo adjuntas desde el clip de WhatsApp.
              </p>
            </>
          )}

          <button type="button" className="srs-btn ghost" onClick={handleDownload}>
            {downloaded ? <Check size={18} /> : <Download size={18} />}
            <span className="srs-btn-text">
              <strong>{downloaded ? 'PDF descargado' : 'Descargar PDF'}</strong>
              <small>{downloaded ? 'Búscalo en tus descargas' : 'Guardarlo en el dispositivo'}</small>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
