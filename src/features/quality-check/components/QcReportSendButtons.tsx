// Botones para enviar un reporte: WhatsApp, email y PDF. En la tabla son solo
// iconos (`layout="icons"`); en la tarjeta del teléfono, botones anchos con texto.
import { Loader2, Mail, Printer } from 'lucide-react';
import WhatsAppIcon from '../../../components/WhatsAppIcon';
import type { QcReportRow } from '../../../types/index';

interface QcReportSendButtonsProps {
  report: QcReportRow;
  layout: 'icons' | 'full';
  companyEmail: string;
  isSharing: boolean;
  isSendingEmail: boolean;
  isExporting: boolean;
  onShareWhatsApp: (report: QcReportRow) => void;
  onSendEmail: (report: QcReportRow) => void;
  onExportPdf: (report: QcReportRow) => void;
}

const QcReportSendButtons = ({
  report, layout, companyEmail, isSharing, isSendingEmail, isExporting, onShareWhatsApp, onSendEmail, onExportPdf,
}: QcReportSendButtonsProps) => {
  if (layout === 'full') {
    return (
      <>
        <button type="button" className="full qcrs-pdf-btn" onClick={() => onExportPdf(report)} disabled={isExporting}>
          {isExporting ? <Loader2 size={15} className="qcrs-spin" /> : <Printer size={15} />} Ver reporte PDF
        </button>
        <button type="button" className="full qcrs-wa-btn" onClick={() => onShareWhatsApp(report)} disabled={isSharing}>
          {isSharing ? <Loader2 size={15} className="qcrs-spin" /> : <WhatsAppIcon size={17} />} Enviar por WhatsApp
        </button>
        <button type="button" className="full qcrs-mail-btn" onClick={() => onSendEmail(report)} disabled={isSendingEmail}>
          {isSendingEmail ? <Loader2 size={15} className="qcrs-spin" /> : <Mail size={15} />} Enviar por email
        </button>
      </>
    );
  }

  return (
    <div className="qcrs-actions-row">
      <button
        type="button"
        className="qcrs-wa-btn"
        onClick={() => onShareWhatsApp(report)}
        disabled={isSharing}
        title="Enviar por WhatsApp"
        aria-label="Enviar por WhatsApp"
      >
        {isSharing ? <Loader2 size={16} className="qcrs-spin" /> : <WhatsAppIcon size={18} />}
      </button>
      <button
        type="button"
        className="qcrs-mail-btn"
        onClick={() => onSendEmail(report)}
        disabled={isSendingEmail}
        title={`Enviar por email a ${companyEmail || '(sin correo configurado)'}`}
        aria-label="Enviar por email"
      >
        {isSendingEmail ? <Loader2 size={16} className="qcrs-spin" /> : <Mail size={16} />}
      </button>
      <button
        type="button"
        className="qcrs-pdf-icon-btn"
        onClick={() => onExportPdf(report)}
        disabled={isExporting}
        title="Ver el reporte en PDF"
        aria-label="Ver el reporte en PDF"
      >
        {isExporting ? <Loader2 size={16} className="qcrs-spin" /> : <Printer size={16} />}
      </button>
    </div>
  );
};

export default QcReportSendButtons;
