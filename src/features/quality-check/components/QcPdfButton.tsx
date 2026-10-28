// Botón para ver un reporte de QC en PDF. Lo usan los botones de envío de
// Quality Check Reports (tabla: solo el ícono; tarjeta del teléfono: ancho con
// texto) y la pestaña "Quality check" del detalle de la casa (ícono + "PDF").
import { Loader2, Printer } from 'lucide-react';
import './QcPdfButton.css';

interface QcPdfButtonProps {
  /** icon = solo el ícono · compact = ícono + "PDF" · full = ancho completo con texto. */
  variant: 'icon' | 'compact' | 'full';
  /** Se está armando el PDF: el botón espera. */
  isExporting: boolean;
  onExportPdf: () => void;
}

const PDF_BUTTON_TITLE = 'View report as PDF';
const LABEL_BY_VARIANT = { icon: '', compact: 'PDF', full: PDF_BUTTON_TITLE } as const;
const ICON_SIZE_BY_VARIANT = { icon: 16, compact: 14, full: 15 } as const;

const QcPdfButton = ({ variant, isExporting, onExportPdf }: QcPdfButtonProps) => {
  const iconSize = ICON_SIZE_BY_VARIANT[variant];
  const label = LABEL_BY_VARIANT[variant];
  const className = variant === 'compact' ? 'qc-pdf-btn' : `qc-pdf-btn ${variant}`;

  return (
    <button
      type="button"
      className={className}
      onClick={onExportPdf}
      disabled={isExporting}
      title={PDF_BUTTON_TITLE}
      aria-label={variant === 'icon' ? PDF_BUTTON_TITLE : undefined}
    >
      {isExporting ? <Loader2 size={iconSize} className="qc-pdf-btn-spin" /> : <Printer size={iconSize} />}
      {label !== '' && ` ${label}`}
    </button>
  );
};

export default QcPdfButton;
