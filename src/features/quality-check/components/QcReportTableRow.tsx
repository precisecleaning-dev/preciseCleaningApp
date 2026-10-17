// Fila de la tabla de reportes (escritorio): envíos, puntaje, status de la
// casa, cliente y dirección (con las notas de la inspección), fecha y horas,
// equipo, inspector y duración.
import type { CSSProperties, ReactNode } from 'react';
import { Clock, MapPin, StickyNote, User, Users } from 'lucide-react';
import type { QcReportRow } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import { passRateColors } from '../../../utils/qcScore';
import { formatInspectionDuration, formatReportClock } from '../qcReports';

interface QcReportTableRowProps {
  report: QcReportRow;
  clientName: string;
  teamName: string;
  notes: string;
  score: { passRate: number; hasData: boolean };
  /** Botones de envío (QcReportSendButtons con layout "icons"). */
  sendButtons: ReactNode;
  /** Píldora del status de la casa (QcReportStatusPill). */
  statusPill: ReactNode;
}

const QcReportTableRow = ({ report, clientName, teamName, notes, score, sendButtons, statusPill }: QcReportTableRowProps) => {
  const scoreColors = passRateColors(score.passRate, score.hasData);
  const scoreStyle = { '--badge-bg': scoreColors.bg, '--badge-fg': scoreColors.fg } as CSSProperties;

  return (
    <tr className="qcrs-row">
      <td className="actions center qcrs-td">{sendButtons}</td>
      <td className="center qcrs-td">
        {/* El MISMO % que imprime el PDF (src/utils/qcScore.ts). */}
        <span className="qcrs-score" style={scoreStyle} title="Tareas aprobadas sobre las respondidas">
          {score.hasData ? `${score.passRate}%` : '—'}
        </span>
      </td>
      <td className="qcrs-td">{statusPill}</td>
      <td className="qcrs-td">
        <div className="qcrs-client-name">{clientName}</div>
        <div className="qcrs-client-address"><MapPin size={12} /> {report.address || '—'}</div>
        {notes !== '' && (
          <div className="qcrs-note-line" title={notes}>
            <StickyNote size={11} className="qcrs-note-icon" />
            <span className="qcrs-note-text">{notes}</span>
          </div>
        )}
      </td>
      <td className="qcrs-td strong">
        {formatDate(report.date)}
        <div className="qcrs-td-sub">{formatReportClock(report.checkInAt)} – {formatReportClock(report.checkOutAt)}</div>
      </td>
      <td className="muted qcrs-td">
        <span className="qcrs-inline-cell"><Users size={14} /> {teamName}</span>
      </td>
      <td className="muted qcrs-td">
        <span className="qcrs-inline-cell"><User size={14} /> {report.inspector || 'Unknown'}</span>
      </td>
      <td className="muted qcrs-td">
        <span className="qcrs-inline-cell"><Clock size={14} /> {formatInspectionDuration(report.durationMinutes)}</span>
      </td>
    </tr>
  );
};

export default QcReportTableRow;
