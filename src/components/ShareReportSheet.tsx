import { useState } from 'react';
import { Download, X, FileText, Check } from 'lucide-react';
import WhatsAppIcon from './WhatsAppIcon';
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
  // ⚠ Sin `await` antes de shareNow: cualquier espera aquí volvería a romper la
  //   activación por gesto y estaríamos igual que al principio.
  const handleNativeShare = () => {
    shareNow(prepared).then(res => {
      if (res.status === 'shared') { onClose(); return; }
      if (res.status === 'cancelled') return;
      // El navegador dijo que podía compartir archivos y no pudo: en vez de
      // dejar al usuario sin nada, se abre WhatsApp con el resumen.
      openWhatsAppWithText(prepared.message, phone);
      onClose();
    });
  };

  // ⭐ ABRIR WHATSAPP. Antes esto descargaba el PDF ANTES de abrir el chat, y en
  //    escritorio lo que el usuario veía era el documento abriéndose — no
  //    WhatsApp. Ahora WhatsApp es lo primero y lo único que ocurre al tocar el
  //    botón; el PDF queda disponible en "Descargar PDF" para adjuntarlo si hace
  //    falta. El texto ya lleva cliente, dirección, fecha y resultado, así que el
  //    mensaje es útil por sí solo.
  const handleWhatsAppText = () => {
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
          {/* ⭐ WhatsApp SIEMPRE es la acción principal y la primera de la lista.
              En móvil se usa la hoja del sistema, que adjunta el PDF de verdad;
              en escritorio se abre WhatsApp Web con el resumen escrito. En los
              dos casos lo que ocurre al tocar es que se abre WhatsApp — que es
              lo que el botón promete. */}
          {supportsNativeShare ? (
            <>
              <button type="button" className="srs-btn whatsapp" onClick={handleNativeShare}>
                <WhatsAppIcon size={20} />
                <span className="srs-btn-text">
                  <strong>Enviar por WhatsApp</strong>
                  <small>Con el PDF adjunto</small>
                </span>
              </button>
              <p className="srs-hint">
                Se abre el menú de compartir con el PDF listo: elige WhatsApp y
                luego el contacto.
              </p>
            </>
          ) : (
            <>
              <button type="button" className="srs-btn whatsapp" onClick={handleWhatsAppText}>
                <WhatsAppIcon size={20} />
                <span className="srs-btn-text">
                  <strong>Abrir WhatsApp</strong>
                  <small>Con el resumen ya escrito</small>
                </span>
              </button>
              {/* Este navegador no puede adjuntar archivos por sí solo, así que
                  hay que decirlo: si no, el usuario espera ver el PDF en el chat
                  y cree que se perdió el reporte. */}
              <p className="srs-hint warn">
                Desde el navegador de escritorio WhatsApp no admite adjuntos
                automáticos. Si necesitas mandar el PDF, descárgalo abajo y
                arrástralo al chat.
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
