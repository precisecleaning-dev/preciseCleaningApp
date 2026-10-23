// Un reporte de QC dentro de la pestaña "Quality check" del detalle de la casa:
// fecha y horas, resultado, %, inspector, equipo, duración, correcciones del
// Recall y, por área, lo aprobado, su nota (con las líneas "Fail <tarea>") y
// sus fotos. Es de lectura: se inspecciona o corrige desde Quality Check. Un
// reporte terminado se puede ver en PDF (el mismo de Quality Check Reports).
import type { CSSProperties } from 'react';
import { Check, Clock, Loader2, Printer, User, Users } from 'lucide-react';
import type { QcReportArea, QcReportRow, QcResultBadge } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import { passRateColors } from '../../../utils/qcScore';
import { formatInspectionDuration, formatReportClock, getFinishedResultBadge } from '../qcReports';

interface HouseQcReportItemProps {
  report: QcReportRow;
  areas: QcReportArea[];
  score: { passRate: number; hasData: boolean };
  /** Se está armando el PDF de este reporte. */
  isExportingPdf: boolean;
  onExportPdf: (report: QcReportRow) => void;
}

/** Fotos por área que se ven como miniatura (el resto se cuenta). */
const MAX_AREA_THUMBNAILS = 6;

/** Reporte que el inspector todavía no termina. */
const IN_PROGRESS_BADGE: QcResultBadge = { background: '#fef3c7', color: '#854d0e', label: 'In progress', Icon: Clock };

const getResultBadge = (report: QcReportRow): QcResultBadge =>
  (report.status === 'Finished' ? getFinishedResultBadge(report) : IN_PROGRESS_BADGE);

const HouseQcReportItem = ({ report, areas, score, isExportingPdf, onExportPdf }: HouseQcReportItemProps) => {
  const resultBadge = getResultBadge(report);
  const resultBadgeStyle = { '--badge-bg': resultBadge.background, '--badge-fg': resultBadge.color } as CSSProperties;
  const scoreColors = passRateColors(score.passRate, score.hasData);
  const scoreStyle = { '--badge-bg': scoreColors.bg, '--badge-fg': scoreColors.fg } as CSSProperties;
  const scoreText = score.hasData ? `${score.passRate}%` : '—';
  const timeRange = `${formatReportClock(report.checkInAt)} – ${formatReportClock(report.checkOutAt)}`;
  const correctionsDoneDate = formatDate(report.correctionsDoneAt);
  // Solo los terminados, como en Quality Check Reports: uno en curso aún no tiene resultado.
  const canExportPdf = report.status === 'Finished';

  return (
    <li className="hqc-report">
      <div className="hqc-report-top">
        <div>
          <div className="hqc-report-date">{formatDate(report.date)}</div>
          <div className="hqc-report-time">{timeRange}</div>
        </div>
        <div className="hqc-report-badges">
          <span className="hqc-score" style={scoreStyle} title="Passed tasks out of answered tasks">{scoreText}</span>
          <span className="hqc-result" style={resultBadgeStyle}>{resultBadge.label}</span>
          {canExportPdf && (
            <button
              type="button"
              className="qcrs-pdf-btn"
              onClick={() => onExportPdf(report)}
              disabled={isExportingPdf}
              title="Ver el reporte en PDF"
            >
              {isExportingPdf ? <Loader2 size={14} className="qcrs-spin" /> : <Printer size={14} />} PDF
            </button>
          )}
        </div>
      </div>

      <div className="hqc-report-meta">
        <span className="hqc-meta-item"><User size={13} /> {report.inspector || 'Unknown'}</span>
        <span className="hqc-meta-item"><Users size={13} /> {report.team || '—'}</span>
        <span className="hqc-meta-item"><Clock size={13} /> {formatInspectionDuration(report.durationMinutes)}</span>
      </div>

      {correctionsDoneDate !== '' && (
        <div className="hqc-corrections">
          <Check size={13} /> Corrections done · {correctionsDoneDate}{report.correctionsDoneBy ? ` · ${report.correctionsDoneBy}` : ''}
        </div>
      )}

      {areas.length === 0 && <p className="hqc-empty-areas">No answers, notes or photos yet.</p>}
      {areas.length > 0 && (
        <ul className="hqc-areas">
          {areas.map((area) => {
            const visiblePhotoUrls = area.photoUrls.slice(0, MAX_AREA_THUMBNAILS);
            const hiddenPhotoCount = area.photoUrls.length - visiblePhotoUrls.length;
            return (
              <li key={area.id} className="hqc-area">
                <div className="hqc-area-head">
                  <span className="hqc-area-name">{area.name}</span>
                  {area.answeredCount > 0 && (
                    <span className="hqc-area-count">{area.passedCount}/{area.answeredCount} passed</span>
                  )}
                </div>
                {area.notes !== '' && <p className="hqc-area-notes">{area.notes}</p>}
                {visiblePhotoUrls.length > 0 && (
                  <div className="hqc-area-photos">
                    {visiblePhotoUrls.map((photoUrl, photoIndex) => (
                      <a key={photoUrl} href={photoUrl} target="_blank" rel="noopener noreferrer" className="hqc-area-photo">
                        <img src={photoUrl} alt={`${area.name} · photo ${photoIndex + 1}`} loading="lazy" />
                      </a>
                    ))}
                    {hiddenPhotoCount > 0 && <span className="hqc-area-more">+{hiddenPhotoCount}</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
};

export default HouseQcReportItem;
