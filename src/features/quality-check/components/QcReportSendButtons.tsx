// Botones para enviar un reporte: WhatsApp, email y PDF. En la tabla son solo
// iconos (`layout="icons"`); en la tarjeta del teléfono, botones anchos con texto.
import { Loader2, Mail } from 'lucide-react';
import WhatsAppIcon from '../../../components/WhatsAppIcon';
import type { QcReportRow } from '../../../types/index';
import QcPdfButton from './QcPdfButton';

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
        <QcPdfButton variant="full" isExporting={isExporting} onExportPdf={() => onExportPdf(report)} />
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
      <QcPdfButton variant="icon" isExporting={isExporting} onExportPdf={() => onExportPdf(report)} />
    </div>
  );
};

export default QcReportSendButtons;
