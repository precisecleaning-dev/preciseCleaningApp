// Un reporte de QC dentro de la pestaña "Quality check" del detalle de la casa:
// fecha y horas, resultado, %, inspector, equipo, duración, correcciones del
// Recall y, por área, lo aprobado, su nota (con las líneas "Fail <tarea>") y
// sus fotos. Es de lectura: se inspecciona o corrige desde Quality Check.
import type { CSSProperties } from 'react';
import { Check, Clock, User, Users } from 'lucide-react';
import type { QcReportArea, QcReportRow } from '../../../types/index';
import { formatDate } from '../../../utils/dateFormat';
import { passRateColors } from '../../../utils/qcScore';
import { formatInspectionDuration, formatReportClock } from '../qcReports';

interface HouseQcReportItemProps {
  report: QcReportRow;
  areas: QcReportArea[];
  score: { passRate: number; hasData: boolean };
}

/** Fotos por área que se ven como miniatura (el resto se cuenta). */
const MAX_AREA_THUMBNAILS = 6;

const getResultLabel = (report: QcReportRow): { label: string; tone: 'passed' | 'failed' | 'pending' } => {
  if (report.status !== 'Finished') return { label: 'In progress', tone: 'pending' };
  return report.result === 'failed'
    ? { label: 'Did Not Pass', tone: 'failed' }
    : { label: 'Passed', tone: 'passed' };
};

const HouseQcReportItem = ({ report, areas, score }: HouseQcReportItemProps) => {
  const result = getResultLabel(report);
  const scoreColors = passRateColors(score.passRate, score.hasData);
  const scoreStyle = { '--badge-bg': scoreColors.bg, '--badge-fg': scoreColors.fg } as CSSProperties;
  const scoreText = score.hasData ? `${score.passRate}%` : '—';
  const timeRange = `${formatReportClock(report.checkInAt)} – ${formatReportClock(report.checkOutAt)}`;
  const correctionsDoneDate = report.correctionsDoneAt ? formatDate(String(report.correctionsDoneAt).split('T')[0]) : '';

  return (
    <li className="hqc-report">
      <div className="hqc-report-top">
        <div>
          <div className="hqc-report-date">{formatDate(report.date)}</div>
          <div className="hqc-report-time">{timeRange}</div>
        </div>
        <div className="hqc-report-badges">
          <span className="hqc-score" style={scoreStyle} title="Tareas aprobadas sobre las respondidas">{scoreText}</span>
          <span className={`hqc-result ${result.tone}`}>{result.label}</span>
        </div>
      </div>

      <div className="hqc-report-meta">
        <span className="hqc-meta-item"><User size={13} /> {report.inspector || 'Unknown'}</span>
        <span className="hqc-meta-item"><Users size={13} /> {report.team || '—'}</span>
        <span className="hqc-meta-item"><Clock size={13} /> {formatInspectionDuration(report.durationMinutes)}</span>
      </div>

      {correctionsDoneDate !== '' && (
        <div className="hqc-corrections">
          <Check size={13} /> Correcciones hechas · {correctionsDoneDate}{report.correctionsDoneBy ? ` · ${report.correctionsDoneBy}` : ''}
        </div>
      )}

      {areas.length === 0 && <p className="hqc-empty-areas">Sin respuestas, notas ni fotos todavía.</p>}
      {areas.length > 0 && (
        <ul className="hqc-areas">
          {areas.map((area) => {
            const shownPhotoUrls = area.photoUrls.slice(0, MAX_AREA_THUMBNAILS);
            const hiddenPhotoCount = area.photoUrls.length - shownPhotoUrls.length;
            return (
              <li key={area.id} className="hqc-area">
                <div className="hqc-area-head">
                  <span className="hqc-area-name">{area.name}</span>
                  {area.answeredCount > 0 && (
                    <span className="hqc-area-count">{area.passedCount}/{area.answeredCount} passed</span>
                  )}
                </div>
                {area.notes !== '' && <p className="hqc-area-notes">{area.notes}</p>}
                {shownPhotoUrls.length > 0 && (
                  <div className="hqc-area-photos">
                    {shownPhotoUrls.map((photoUrl, photoIndex) => (
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
