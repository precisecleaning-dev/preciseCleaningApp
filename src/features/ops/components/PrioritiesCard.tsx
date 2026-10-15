// "My top 3 priorities": los 3 proyectos prioritarios de la persona, con su
// avance (tareas hechas / tareas del proyecto).
import { Pencil, Plus } from 'lucide-react';
import type { OpsProject } from '../../../types/index';
import './PrioritiesCard.css';

interface PrioritiesCardProps {
  title: string;
  /** Proyectos del top 3, en orden (los borrados ya vienen filtrados). */
  projects: OpsProject[];
  canChange: boolean;
  onEdit: () => void;
}

const RING = 2 * Math.PI * 15; // circunferencia del anillo (r = 15)

function ProgressRing({ project }: { project: OpsProject }) {
  const total = project.taskCount || 0;
  const done = Math.min(project.doneCount || 0, total);
  const pct = total > 0 ? done / total : 0;
  return (
    <svg className="opr-ring" viewBox="0 0 36 36" width="36" height="36" role="img"
      aria-label={total > 0 ? `${done} of ${total} tasks done` : 'No tasks yet'}>
      <circle className="opr-ring-track" cx="18" cy="18" r="15" />
      {pct > 0 && (
        <circle className="opr-ring-value" cx="18" cy="18" r="15"
          strokeDasharray={`${(pct * RING).toFixed(1)} ${RING.toFixed(1)}`} />
      )}
    </svg>
  );
}

export default function PrioritiesCard({ title, projects, canChange, onEdit }: PrioritiesCardProps) {
  const slots = [0, 1, 2];
  return (
    <section className="opr" aria-label={title}>
      <header className="opr-head">
        <h2 className="opr-title">{title}</h2>
        <p className="opr-hint">Only 3. A new one replaces one of these.</p>
        {canChange && (
          <button type="button" className="opr-edit" onClick={onEdit}>
            <Pencil size={13} /> Edit
          </button>
        )}
      </header>
      <ol className="opr-list">
        {slots.map((i) => {
          const p = projects[i];
          if (!p) {
            return (
              <li key={`empty-${i}`} className="opr-item empty">
                <span className="opr-num">{i + 1}</span>
                {canChange ? (
                  <button type="button" className="opr-add" onClick={onEdit}>
                    <Plus size={14} /> Add a priority
                  </button>
                ) : (
                  <span className="opr-empty-text">No priority</span>
                )}
              </li>
            );
          }
          return (
            <li key={p.id} className="opr-item">
              <span className="opr-num">{i + 1}</span>
              <div className="opr-text">
                <p className="opr-name">{p.title}</p>
                {p.description && <p className="opr-goal">{p.description}</p>}
              </div>
              <ProgressRing project={p} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
