// ⭐ Panel lateral de una inspección — diseño "Quality Check panel" del lienzo.
//    Se abre desde el QC Dashboard. Es de LECTURA: muestra lo que la oficina
//    pidió, lo que reportaron los limpiadores, el checklist con Pass/Fail, el
//    resultado, fotos y notas. Para inspeccionar o corregir se usa el flujo de
//    siempre (botón "Inspect" → vista Quality Check), así no hay dos editores
//    distintos del mismo reporte.
import { useEffect } from 'react';
import { X, Mail, Printer, ClipboardCheck, ExternalLink, RotateCcw } from 'lucide-react';
import type { Property } from '../types/index';
import WhatsAppIcon from './WhatsAppIcon';
import type { QcDashRow, QcPlace, QcTask } from '../utils/qcDashboard';
import { RESULT_LABEL } from '../utils/qcDashboard';
import './QcInspectionPanel.css';

interface CleanerNote { key: string; author: string; at: string; text: string }

interface QcInspectionPanelProps {
  row: QcDashRow;
  client: string;
  type: string;
  team: string;
  places: QcPlace[];
  tasks: QcTask[];
  /** null = el rol no puede ver notas de oficina. */
  officeNote: string | null;
  cleanerNotes: CleanerNote[];
  busy: string | null;
  onClose: () => void;
  onInspect?: (p: Property) => void;
  onOpenJob: (p: Property) => void;
  onWhatsApp: () => void;
  onEmail: () => void;
  onPrint: () => void;
}

const fmtWhen = (iso: string) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true }) : '';

export default function QcInspectionPanel({
  row, client, type, team, places, tasks, officeNote, cleanerNotes, busy,
  onClose, onInspect, onOpenJob, onWhatsApp, onEmail, onPrint,
}: QcInspectionPanelProps) {
  // Esc cierra el panel (como cualquier diálogo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const qcData = row.rec?.qcData || {};
  const areas = Object.entries(qcData)
    .map(([placeId, data]) => {
      const entries = Object.entries(data?.tasks || {});
      return {
        id: placeId,
        name: places.find((p) => p.id === placeId)?.name || 'Area',
        items: entries.map(([taskId, v]) => ({
          id: taskId,
          name: tasks.find((t) => t.id === taskId)?.name || 'Task',
          ok: String(v).toLowerCase() === 'yes',
        })),
        notes: [data?.notes, data?.damage, data?.corrections].filter(Boolean).join(' · '),
        photos: (data?.photos || []).filter((u) => typeof u === 'string'),
      };
    })
    .filter((a) => a.items.length > 0 || a.notes || a.photos.length > 0);
  const yes = areas.reduce((n, a) => n + a.items.filter((i) => i.ok).length, 0);
  const answered = areas.reduce((n, a) => n + a.items.length, 0);
  const photos = areas.flatMap((a) => a.photos.map((url) => ({ url, area: a.name })));
  const teamNotes = areas.filter((a) => a.notes).map((a) => ({ area: a.name, text: a.notes }));
  const finished = !!row.rec && row.result !== 'todo';
  const scoreTone = row.result === 'reclean' ? 'bad' : row.result === 'passed' ? 'good' : 'warn';
  const officeLines = (officeNote || '').split('\n').map((l) => l.trim()).filter(Boolean);

  return (
    <div className="qip-overlay" onClick={onClose}>
      <aside
        className="qip-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Quality check · ${row.prop.address || client}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="qip-head">
          <div className="qip-head-text">
            <p className="qip-eyebrow">Quality check</p>
            <h2 className="qip-title">{row.prop.address || client}</h2>
            <p className="qip-sub">{[client, type, row.date, team].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" className="qip-close" aria-label="Close panel" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <div className="qip-body">
          {row.recall && (
            <p className="qip-recall"><RotateCcw size={14} /> Esta casa estuvo en Recall.</p>
          )}

          {officeNote !== null && officeLines.length > 0 && (
            <section className="qip-card office">
              <div className="qip-card-head"><p className="qip-lbl office">From the office</p></div>
              <ul className="qip-office-list">
                {officeLines.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </section>
          )}

          <section className="qip-card cleaners">
            <div className="qip-card-head">
              <p className="qip-lbl cleaners">Notes from the cleaners</p>
              {cleanerNotes.length > 0 && (
                <span className="qip-badge">{cleanerNotes.length} {cleanerNotes.length === 1 ? 'note' : 'notes'} · read first</span>
              )}
            </div>
            {cleanerNotes.length === 0 ? (
              <p className="qip-muted">Sin notas del equipo de limpieza.</p>
            ) : (
              <ul className="qip-note-list">
                {cleanerNotes.map((n) => (
                  <li key={n.key} className="qip-note">
                    <div className="qip-note-meta"><span>{n.author}</span><span>{fmtWhen(n.at)}</span></div>
                    <p className="qip-note-text">{n.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <dl className="qip-facts">
            <div><dt>Inspector</dt><dd>{row.inspector || '—'}</dd></div>
            <div><dt>Inspection date</dt><dd>{row.rec?.date || '—'}</dd></div>
          </dl>

          <section className="qip-section">
            <div className="qip-row-between">
              <p className="qip-lbl">Checklist</p>
              {answered > 0 && <span className="qip-muted">{yes} of {answered} passed</span>}
            </div>
            {areas.length === 0 ? (
              <p className="qip-muted">{finished ? 'La inspección no tiene tareas registradas.' : 'Aún no se ha inspeccionado.'}</p>
            ) : (
              areas.filter((a) => a.items.length > 0).map((a) => {
                const ok = a.items.filter((i) => i.ok).length;
                return (
                  <div key={a.id} className="qip-area">
                    <div className="qip-area-head">
                      <span>{a.name}</span>
                      <span className={`qip-area-score ${ok === a.items.length ? 'good' : 'bad'}`}>{ok}/{a.items.length}</span>
                    </div>
                    <ul className="qip-items">
                      {a.items.map((it) => (
                        <li key={it.id} className="qip-item">
                          <span>{it.name}</span>
                          <span className={`qip-yn ${it.ok ? 'ok' : 'bad'}`}>{it.ok ? 'Pass' : 'Fail'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </section>

          <section className={`qip-score ${scoreTone}`}>
            <div>
              <p className="qip-lbl">Score</p>
              <p className="qip-score-num">
                {answered > 0 ? `${yes} / ${answered} · ` : ''}{row.score !== null ? `${row.score}%` : '—'}
              </p>
            </div>
            <p className="qip-score-note">
              {row.result === 'reclean'
                ? `${answered - yes} item${answered - yes === 1 ? '' : 's'} failed${row.issues.length ? ` (${row.issues.join(', ').toLowerCase()})` : ''} — re-clean required`
                : row.result === 'passed'
                  ? 'Inspection passed'
                  : 'Completed, no QC yet'}
            </p>
          </section>

          {photos.length > 0 && (
            <section className="qip-section">
              <p className="qip-lbl">Photos</p>
              <ul className="qip-photos">
                {photos.slice(0, 12).map((ph, i) => (
                  <li key={`${ph.url}-${i}`}>
                    <a href={ph.url} target="_blank" rel="noreferrer" className="qip-photo">
                      <img src={ph.url} alt={ph.area} loading="lazy" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {teamNotes.length > 0 && (
            <section className="qip-section">
              <p className="qip-lbl">Notes for the team</p>
              <ul className="qip-team-notes">
                {teamNotes.map((n) => (
                  <li key={n.area}><strong>{n.area}:</strong> {n.text}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="qip-section">
            <p className="qip-lbl">Result</p>
            <span className={`qip-result ${scoreTone}`}>{RESULT_LABEL[row.result]}</span>
          </section>
        </div>

        <footer className="qip-foot">
          {finished && (
            <div className="qip-send" aria-label="Enviar reporte">
              <button type="button" className="qip-icon wa" onClick={onWhatsApp} disabled={!!busy} aria-label="Enviar por WhatsApp" title="WhatsApp">
                <WhatsAppIcon size={16} />
              </button>
              <button type="button" className="qip-icon" onClick={onEmail} disabled={!!busy} aria-label="Enviar por email" title="Email">
                <Mail size={16} />
              </button>
              <button type="button" className="qip-icon" onClick={onPrint} disabled={!!busy} aria-label="Imprimir / PDF" title="PDF">
                <Printer size={16} />
              </button>
            </div>
          )}
          <button type="button" className="qip-btn" onClick={() => onOpenJob(row.prop)}>
            <ExternalLink size={15} /> Open job
          </button>
          {onInspect && (
            <button type="button" className="qip-btn primary" onClick={() => onInspect(row.prop)}>
              <ClipboardCheck size={15} /> {row.result === 'todo' ? 'Inspect' : 'Re-inspect'}
            </button>
          )}
        </footer>
      </aside>
    </div>
  );
}
