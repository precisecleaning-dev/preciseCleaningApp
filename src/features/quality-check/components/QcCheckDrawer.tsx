// src/features/quality-check/components/QcCheckDrawer.tsx
// ============================================================================
// ⭐ PANEL DE QUALITY CHECK (diseño "Quality Check", 10/2026). Reemplaza el
//    modal con selector de áreas: panel lateral a la derecha en computadora y
//    pantalla completa en el teléfono, con todo en una sola columna:
//    notas de oficina y limpiadores → inspector y fecha → checklist Pass/Fail
//    (cada área con sus fotos y su nota; se contraen y, con permiso, se ordenan
//    y editan) → puntaje → otras fotos (General) → solo oficina → resultado.
//
// Es de presentación: QualityCheckView guarda, sube fotos y mueve la casa.
// ============================================================================
import { useEffect, useRef, type ReactNode } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import DateInput from '../../../shared/components/DateInput';
import QcChecklist from './QcChecklist';
import QcIncomingNotes, { type QcNoteItem } from './QcIncomingNotes';
import { checklistTotals, type QcAnswer, type QcExtras, type QcSection, type QcSectionTask } from '../qcForm';
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
  /** Nota de cada área, por id (incluye las líneas "Fail <tarea>"). */
  sectionNotes: Record<string, string>;
  onAnswer: (placeId: string, taskId: string, value: QcAnswer | null) => void;
  onSectionNotesChange: (section: QcSection, notes: string) => void;
  /** Fotos de un área del checklist (van debajo de sus tareas). */
  renderSectionPhotos: (section: QcSection) => ReactNode;
  /** Permisos de "QC Checklist Setup" (Roles) para ordenar áreas y editar tareas. */
  canAddChecklistTasks: boolean;
  canEditChecklistTasks: boolean;
  canRemoveChecklistTasks: boolean;
  /** Áreas o tareas del checklist que se están guardando (usePendingById). */
  pendingChecklistIds: ReadonlySet<string>;
  onMoveChecklistSection: (section: QcSection, positionOffset: -1 | 1) => void;
  onAddChecklistTask: (section: QcSection, taskName: string) => void;
  onRenameChecklistTask: (section: QcSection, task: QcSectionTask, name: string) => void;
  onRemoveChecklistTask: (section: QcSection, task: QcSectionTask) => void;
  /** Fotos que no son de un área del checklist (área General). */
  generalPhotos: ReactNode;
  officePhotos: ReactNode;
  /** Sección "Office only" (permiso Office Notes). */
  showOffice: boolean;
  saving: boolean;
  /** "Cambios sin guardar" / "Guardado h:mm". */
  saveState: ReactNode;
  onSave: () => void;
}

const QcCheckDrawer = (props: QcCheckDrawerProps) => {
  const {
    address, subtitle, headerActions, onClose, officeNotes, cleanerNotes, teamName, cleanerPhotos,
    inspectors, extras, onExtras, sections, answers, sectionNotes, onAnswer, onSectionNotesChange, renderSectionPhotos,
    canAddChecklistTasks,
    canEditChecklistTasks, canRemoveChecklistTasks, pendingChecklistIds, onMoveChecklistSection, onAddChecklistTask, onRenameChecklistTask,
    onRemoveChecklistTask, generalPhotos, officePhotos,
    showOffice, saving, saveState, onSave,
  } = props;
  const checklistTotal = checklistTotals(sections, answers);
  const passRatePercent = checklistTotal.answered ? Math.round((checklistTotal.passed / checklistTotal.answered) * 100) : 0;
  const scoreTone = checklistTotal.answered === 0 ? 'none' : checklistTotal.failed > 0 ? 'bad' : 'ok';
  const hasInspector = inspectors.some((inspector) => inspector.id === extras.inspectorId);

  const handleInspectorChange = (inspectorId: string) => {
    const selectedInspector = inspectors.find((inspector) => inspector.id === inspectorId);
    onExtras({ inspectorId, inspectorName: selectedInspector?.name ?? '' });
  };

  // Al abrir, el foco entra al panel (lectores de pantalla y teclado) y al
  // cerrar vuelve a donde estaba.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const previouslyFocusedElement = document.activeElement as HTMLElement | null;
    rootRef.current?.focus();
    return () => { previouslyFocusedElement?.focus?.(); };
  }, []);

  // Texto junto al puntaje (fuera del JSX: sin ternarios anidados).
  const scoreNote = (() => {
    if (checklistTotal.answered === 0) return 'Mark each item Pass or Fail.';
    if (checklistTotal.failed === 0) return 'Every checked item passed.';
    const shownFailedNames = checklistTotal.failedNames.slice(0, 3).join(', ');
    const moreFailedSuffix = checklistTotal.failedNames.length > 3 ? '…' : '';
    return `${checklistTotal.failed} item${checklistTotal.failed === 1 ? '' : 's'} failed (${shownFailedNames}${moreFailedSuffix}) — re-clean required`;
  })();

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
              onChange={(event) => handleInspectorChange(event.target.value)}
            >
              {!hasInspector && <option value={extras.inspectorId}>{extras.inspectorName || '—'}</option>}
              {inspectors.map((inspector) => <option key={inspector.id} value={inspector.id}>{inspector.name}</option>)}
            </select>
          </label>
          <label className="qcd-field">
            <span className="qcd-lbl">Inspection date</span>
            <DateInput className="qcd-input" value={extras.date} onChange={(isoDate) => onExtras({ date: isoDate })} />
          </label>
        </div>

        <section className="qcd-block" aria-label="Checklist">
          <div className="qcd-row">
            <p className="qcd-lbl">Checklist</p>
            <span className="qcd-hint">{checklistTotal.passed} of {checklistTotal.total} passed</span>
          </div>
          <QcChecklist
            sections={sections}
            answers={answers}
            sectionNotes={sectionNotes}
            onAnswer={onAnswer}
            onSectionNotesChange={onSectionNotesChange}
            renderSectionPhotos={renderSectionPhotos}
            canAddTasks={canAddChecklistTasks}
            canEditTasks={canEditChecklistTasks}
            canRemoveTasks={canRemoveChecklistTasks}
            pendingChecklistIds={pendingChecklistIds}
            onMoveSection={onMoveChecklistSection}
            onAddTask={onAddChecklistTask}
            onRenameTask={onRenameChecklistTask}
            onRemoveTask={onRemoveChecklistTask}
          />
        </section>

        <div className={`qcd-score ${scoreTone}`}>
          <div>
            <p className="qcd-lbl">Score</p>
            <p className="qcd-score-num">
              {checklistTotal.answered ? `${checklistTotal.passed} / ${checklistTotal.answered} · ${passRatePercent}%` : '—'}
            </p>
          </div>
          <p className="qcd-score-note">
            {scoreNote}
          </p>
        </div>

        <section className="qcd-block small" aria-label="Photos">
          <p className="qcd-lbl">Other photos (before / after)</p>
          {generalPhotos}
        </section>

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
                onChange={(event) => onExtras({ clientNotes: event.target.value })}
              />
            </label>
            <label className="qcd-check">
              <input type="checkbox" checked={extras.notifyManager} onChange={(event) => onExtras({ notifyManager: event.target.checked })} />
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
              <input type="checkbox" checked={extras.reclean} onChange={(event) => onExtras({ reclean: event.target.checked })} />
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
};

export default QcCheckDrawer;
