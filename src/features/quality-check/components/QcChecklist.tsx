// ⭐ Checklist del Quality Check: una sección por área de Settings con sus
//    tareas y botones Pass / Fail. Tocar el botón ya marcado lo deja sin
//    responder (las tareas sin responder no cuentan en el %).
import type { QcAnswer, QcSection } from '../qcForm';
import './QcChecklist.css';

interface QcChecklistProps {
  sections: QcSection[];
  answers: Record<string, Record<string, string> | undefined>;
  onAnswer: (placeId: string, taskId: string, value: QcAnswer | null) => void;
}

export default function QcChecklist({ sections, answers, onAnswer }: QcChecklistProps) {
  if (sections.length === 0) {
    return <p className="qcl-empty">No hay áreas con tareas configuradas para esta casa (Settings → Places y Tasks).</p>;
  }
  return (
    <div className="qcl">
      {sections.map((s) => {
        const a = answers[s.id] || {};
        const passed = s.tasks.filter((t) => a[t.id] === 'Yes').length;
        const failed = s.tasks.filter((t) => a[t.id] === 'No').length;
        const tone = failed > 0 ? 'bad' : passed === s.tasks.length ? 'ok' : 'muted';
        return (
          <section key={s.id} className="qcl-section" aria-label={s.name}>
            <header className="qcl-head">
              <h4 className="qcl-name">{s.name}</h4>
              <span className={`qcl-count ${tone}`}>{passed}/{s.tasks.length}</span>
            </header>
            <ul className="qcl-items">
              {s.tasks.map((t) => {
                const v = a[t.id];
                return (
                  <li key={t.id} className="qcl-item">
                    <span className="qcl-task">{t.name}</span>
                    <div className="qcl-yn" role="group" aria-label={t.name}>
                      <button
                        type="button"
                        className={`qcl-btn${v === 'Yes' ? ' ok' : ''}`}
                        aria-pressed={v === 'Yes'}
                        onClick={() => onAnswer(s.id, t.id, v === 'Yes' ? null : 'Yes')}
                      >
                        Pass
                      </button>
                      <button
                        type="button"
                        className={`qcl-btn${v === 'No' ? ' bad' : ''}`}
                        aria-pressed={v === 'No'}
                        onClick={() => onAnswer(s.id, t.id, v === 'No' ? null : 'No')}
                      >
                        Fail
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
