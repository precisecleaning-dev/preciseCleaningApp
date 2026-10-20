// Tarjeta de un reporte en el teléfono: cliente y dirección, resultado
// (Passed / Did Not Pass), status de la casa, fecha, %, duración, equipo,
// inspector, notas y los botones de envío. Tocarla abre el detalle de la casa.
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { CalendarDays, Check, ClipboardCheck, Clock, MapPin, Repeat, StickyNote, User, Users } from 'lucide-react';
import type { QcReportRow } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import { formatInspectionDuration, isClickOnControl } from '../qcReports';
import QcReportClientName from './QcReportClientName';

interface QcReportCardProps {
  report: QcReportRow;
  clientName: string;
  teamName: string;
  notes: string;
  score: { passRate: number; hasData: boolean };
  /** Botones de envío (QcReportSendButtons con layout "full"). */
  sendButtons: ReactNode;
  /** Píldora del status de la casa (QcReportStatusPill). */
  statusPill: ReactNode;
  /** false si la casa ya no está cargada (borrada o fuera de la ventana de 12 meses). */
  canOpenHouse: boolean;
  /** Marca "Recall" antes del cliente: la casa estuvo alguna vez en Recall. */
  wasInRecall: boolean;
  onOpenHouse: (report: QcReportRow) => void;
}

const PASSED_BADGE = { background: '#dcfce7', color: '#166534', label: 'Passed', Icon: Check };
const FAILED_BADGE = { background: '#f3e8ff', color: '#7c3aed', label: 'Did Not Pass', Icon: Repeat };

const QcReportCard = ({
  report, clientName, teamName, notes, score, sendButtons, statusPill, canOpenHouse, wasInRecall, onOpenHouse,
}: QcReportCardProps) => {
  const resultBadge = report.result === 'failed' ? FAILED_BADGE : PASSED_BADGE;
  const resultBadgeStyle = { '--badge-bg': resultBadge.background, '--badge-fg': resultBadge.color } as CSSProperties;

  const handleOpenHouse = (event: MouseEvent<HTMLDivElement>) => {
    if (!canOpenHouse || isClickOnControl(event)) return;
    onOpenHouse(report);
  };

  return (
    <div className={`qcrs-card${canOpenHouse ? ' clickable' : ''}`} onClick={handleOpenHouse}>
      <div className="qcrs-card-top">
        <div className="qcrs-min-w-0">
          <QcReportClientName clientName={clientName} wasInRecall={wasInRecall} />
          <div className="qcrs-client-address"><MapPin size={12} /> {report.address || '—'}</div>
        </div>
        <span className="qcrs-badge" style={resultBadgeStyle}>
          <resultBadge.Icon size={12} /> {resultBadge.label}
        </span>
      </div>

      <div className="qcrs-card-status-row">
        <span className="qcrs-card-status-label"><ClipboardCheck size={13} /> Estado de la casa</span>
        {statusPill}
      </div>

      <div className="qcrs-card-meta">
        <div className="qcrs-card-meta-pair">
          <span className="qcrs-card-meta-label"><CalendarDays size={13} /> Fecha</span>
          <span className="qcrs-card-meta-value">{formatDate(report.date)}</span>
        </div>
        <div className="qcrs-card-meta-pair">
          <span className="qcrs-card-meta-label"><Check size={13} /> Resultado</span>
          <span className="qcrs-card-meta-value">{score.hasData ? `${score.passRate}%` : '—'}</span>
        </div>
        <div className="qcrs-card-meta-pair">
          <span className="qcrs-card-meta-label"><Clock size={13} /> Duración</span>
          <span className="qcrs-card-meta-value">{formatInspectionDuration(report.durationMinutes)}</span>
        </div>
        <div className="qcrs-card-meta-pair">
          <span className="qcrs-card-meta-label"><Users size={13} /> Equipo</span>
          <span className="qcrs-card-meta-value">{teamName}</span>
        </div>
        <div className="qcrs-card-meta-pair">
          <span className="qcrs-card-meta-label"><User size={13} /> Inspector</span>
          <span className="qcrs-card-meta-value">{report.inspector || 'Unknown'}</span>
        </div>
      </div>

      {notes !== '' && <div className="qcrs-card-notes"><StickyNote size={12} /> {notes}</div>}

      {sendButtons}
    </div>
  );
};

export default QcReportCard;
