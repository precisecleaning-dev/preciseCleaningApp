// src/features/quality-check/components/QcCheckDrawer.tsx
// ============================================================================
// ⭐ PANEL DE QUALITY CHECK (diseño "Quality Check", 10/2026). Reemplaza el
//    modal con selector de áreas: panel lateral a la derecha en computadora y
//    pantalla completa en el teléfono, con todo en una sola columna:
//    notas de oficina y limpiadores → inspector y fecha → checklist Pass/Fail →
//    puntaje → fotos → notas para el equipo → solo oficina → resultado.
//
// Es de presentación: QualityCheckView guarda, sube fotos y mueve la casa.
// ============================================================================
import { useEffect, useRef, type ReactNode } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import DateInput from '../../../shared/components/DateInput';
import QcChecklist from './QcChecklist';
import QcIncomingNotes, { type QcNoteItem } from './QcIncomingNotes';
import { checklistTotals, type QcAnswer, type QcExtras, type QcSection } from '../qcForm';
import './QcCheckDrawer.css';

interface QcCheckDrawerProps {
  address: string;
  subtitle: string;
  /** Botones PDF / WhatsApp / Email. */
  headerActions: ReactNode;
  onClose: () => void;
  officeNotes: QcNoteItem[];
  cleanerNotes: QcNoteItem[];
  teamName: string;
  cleanerPhotos: string[];
  inspectors: { id: string; name: string }[];
  extras: QcExtras;
  onExtras: (patch: Partial<QcExtras>) => void;
  sections: QcSection[];
  answers: Record<string, Record<string, string> | undefined>;
  onAnswer: (placeId: string, taskId: string, value: QcAnswer | null) => void;
  generalPhotos: ReactNode;
  officePhotos: ReactNode;
  /** Sección "Office only" (permiso Office Notes). */
  showOffice: boolean;
  teamNotes: string;
  onTeamNotes: (value: string) => void;
  saving: boolean;
  /** "Cambios sin guardar" / "Guardado h:mm". */
  saveState: ReactNode;
  onSave: () => void;
}

export default function QcCheckDrawer(props: QcCheckDrawerProps) {
  const {
    address, subtitle, headerActions, onClose, officeNotes, cleanerNotes, teamName, cleanerPhotos,
    inspectors, extras, onExtras, sections, answers, onAnswer, generalPhotos, officePhotos,
    showOffice, teamNotes, onTeamNotes, saving, saveState, onSave,
  } = props;
  const totals = checklistTotals(sections, answers);
  const rate = totals.answered ? Math.round((totals.passed / totals.answered) * 100) : 0;
  const scoreTone = totals.answered === 0 ? 'none' : totals.failed > 0 ? 'bad' : 'ok';
  const hasInspector = inspectors.some((u) => u.id === extras.inspectorId);

  // Al abrir, el foco entra al panel (lectores de pantalla y teclado) y al
  // cerrar vuelve a donde estaba.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    rootRef.current?.focus();
    return () => { prev?.focus?.(); };
  }, []);

  return (
    <div ref={rootRef} tabIndex={-1} className="qcd" role="dialog" aria-modal="true" aria-label={`Quality check · ${address}`}>
      <header className="qcd-head">
        <div className="qcd-title-wrap">
          <p className="qcd-lbl qcd-kicker">Quality check</p>
          <h2 className="qcd-title">{address || '—'}</h2>
          <p className="qcd-sub">{subtitle}</p>
        </div>
        <div className="qcd-head-actions">
          {headerActions}
          <button type="button" className="qcd-icon-btn" onClick={onClose} aria-label="Close panel">
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="qcd-body">
        <QcIncomingNotes officeNotes={officeNotes} cleanerNotes={cleanerNotes} cleanerTeam={teamName} cleanerPhotos={cleanerPhotos} />

        <div className="qcd-two">
          <label className="qcd-field">
            <span className="qcd-lbl">Inspector</span>
            <select
              className="qcd-input"
              value={extras.inspectorId}
              onChange={(e) => {
                const u = inspectors.find((x) => x.id === e.target.value);
                onExtras({ inspectorId: e.target.value, inspectorName: u?.name || '' });
              }}
            >
              {!hasInspector && <option value={extras.inspectorId}>{extras.inspectorName || '—'}</option>}
              {inspectors.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="qcd-field">
            <span className="qcd-lbl">Inspection date</span>
            <DateInput className="qcd-input" value={extras.date} onChange={(iso) => onExtras({ date: iso })} />
          </label>
        </div>

        <section className="qcd-block" aria-label="Checklist">
          <div className="qcd-row">
            <p className="qcd-lbl">Checklist</p>
            <span className="qcd-hint">{totals.passed} of {totals.total} passed</span>
          </div>
          <QcChecklist sections={sections} answers={answers} onAnswer={onAnswer} />
        </section>

        <div className={`qcd-score ${scoreTone}`}>
          <div>
            <p className="qcd-lbl">Score</p>
            <p className="qcd-score-num">
              {totals.answered ? `${totals.passed} / ${totals.answered} · ${rate}%` : '—'}
            </p>
          </div>
          <p className="qcd-score-note">
            {totals.answered === 0
              ? 'Mark each item Pass or Fail.'
              : totals.failed > 0
                ? `${totals.failed} item${totals.failed === 1 ? '' : 's'} failed (${totals.failedNames.slice(0, 3).join(', ')}${totals.failedNames.length > 3 ? '…' : ''}) — re-clean required`
                : 'Every checked item passed.'}
          </p>
        </div>

        <section className="qcd-block small" aria-label="Photos">
          <p className="qcd-lbl">Photos (before / after)</p>
          {generalPhotos}
        </section>

        <label className="qcd-field">
          <span className="qcd-lbl">Notes for the team</span>
          <textarea className="qcd-textarea" rows={3} value={teamNotes} onChange={(e) => onTeamNotes(e.target.value)} />
        </label>

        {showOffice && (
          <section className="qcd-office" aria-label="Office only">
            <div className="qcd-row">
              <p className="qcd-lbl office">Office only</p>
              <span className="qcd-hint">Not visible to the cleaning team</span>
            </div>
            <label className="qcd-field">
              <span className="qcd-lbl">Notes for client</span>
              <textarea
                className="qcd-textarea white"
                rows={3}
                value={extras.clientNotes}
                onChange={(e) => onExtras({ clientNotes: e.target.value })}
              />
            </label>
            <label className="qcd-check">
              <input type="checkbox" checked={extras.notifyManager} onChange={(e) => onExtras({ notifyManager: e.target.checked })} />
              <span>Notify property manager.</span>
            </label>
            <div className="qcd-block small">
              <span className="qcd-lbl">Photos for office</span>
              {officePhotos}
            </div>
          </section>
        )}

        <section className="qcd-block small" aria-label="Result">
          <p className="qcd-lbl">Result</p>
          <div className="qcd-two tight">
            <button
              type="button"
              className={`qcd-result invoice${extras.outcome === 'invoice' ? ' on' : ''}`}
              aria-pressed={extras.outcome === 'invoice'}
              onClick={() => onExtras({ outcome: extras.outcome === 'invoice' ? null : 'invoice' })}
            >
              Invoice
            </button>
            <button
              type="button"
              className={`qcd-result recall${extras.outcome === 'recall' ? ' on' : ''}`}
              aria-pressed={extras.outcome === 'recall'}
              onClick={() => onExtras({ outcome: extras.outcome === 'recall' ? null : 'recall' })}
            >
              RECALL
            </button>
          </div>
          {extras.outcome === 'recall' && (
            <label className="qcd-check">
              <input type="checkbox" checked={extras.reclean} onChange={(e) => onExtras({ reclean: e.target.checked })} />
              <span>Create re-clean job for {teamName || 'the team'} &amp; hold invoice until QC passes.</span>
            </label>
          )}
        </section>
      </div>

      <footer className="qcd-foot">
        <div className="qcd-save-state" aria-live="polite">{saveState}</div>
        <button type="button" className="qcd-btn ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="qcd-btn primary" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 size={16} className="spin-qc" /> : <Save size={16} />} Save QC
        </button>
      </footer>
    </div>
  );
}
