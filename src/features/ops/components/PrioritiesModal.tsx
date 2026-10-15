// Elegir el top 3: tres puestos, un proyecto activo en cada uno.
import { useState } from 'react';
import { X } from 'lucide-react';
import type { TaskProject } from '../../../types/index';
import './OpsModals.css';

interface PrioritiesModalProps {
  title: string;
  projects: TaskProject[];
  current: string[];
  onClose: () => void;
  onSave: (projectIds: string[]) => Promise<boolean>;
}

export default function PrioritiesModal({ title, projects, current, onClose, onSave }: PrioritiesModalProps) {
  const [slots, setSlots] = useState<string[]>(() => [0, 1, 2].map((i) => current[i] || ''));
  const [saving, setSaving] = useState(false);

  const setSlot = (i: number, id: string) =>
    setSlots((prev) => prev.map((v, k) => {
      if (k === i) return id;
      return id && v === id ? '' : v; // un proyecto no puede estar dos veces
    }));

  const save = async () => {
    setSaving(true);
    const ok = await onSave(slots.filter(Boolean));
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="modal-overlay-centered" onClick={onClose}>
      <div className="modal-50 opm narrow" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="opm-head">
          <h2 className="opm-title">{title}</h2>
          <button type="button" className="opm-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="opm-body">
          <p className="opm-hint">Only 3. Pick a different project in a slot to replace it.</p>
          {projects.length === 0 && <p className="opm-empty">Create a project first (Projects button).</p>}
          <ol className="opm-slots">
            {slots.map((value, i) => (
              <li key={i} className="opm-slot">
                <span className="opm-slot-num">{i + 1}</span>
                <select className="opm-input" value={value} onChange={(e) => setSlot(i, e.target.value)}
                  aria-label={`Priority ${i + 1}`}>
                  <option value="">— Empty —</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </li>
            ))}
          </ol>
          <div className="opm-actions">
            <button type="button" className="opm-btn ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="opm-btn primary" onClick={save} disabled={saving}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
