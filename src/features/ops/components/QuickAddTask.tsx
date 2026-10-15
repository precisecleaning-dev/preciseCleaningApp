// Fila para agregar una tarea rápido: qué, a quién, cuánto dura, cuándo y de
// qué proyecto. Enter en el campo de texto también la agrega.
import { useState, type FormEvent } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { TaskProject } from '../../../types/index';
import DateInput from '../../../shared/components/DateInput';
import { todayIso } from '../../../utils/dateFormat';
import { addDays, ymdToDate } from '../opsDates';
import { DURATION_OPTIONS } from '../opsOptions';
import './QuickAddTask.css';

import type { PersonOption } from '../opsPermissions';

export interface QuickAddValues {
  title: string;
  assigneeUserId: string;
  durationMinutes: number;
  dueDate: string;
  projectId: string | null;
  /** Necesita el visto bueno de alguien antes de terminarse. */
  needsApproval: boolean;
}

interface QuickAddTaskProps {
  people: PersonOption[];
  defaultAssigneeId: string;
  projects: TaskProject[];
  onAdd: (values: QuickAddValues) => Promise<boolean>;
}

type DueChoice = 'today' | 'tomorrow' | 'nextweek' | 'none' | 'pick';

function dueFor(choice: DueChoice, picked: string): string {
  const today = todayIso();
  if (choice === 'today') return today;
  if (choice === 'tomorrow') return addDays(today, 1);
  if (choice === 'nextweek') {
    const day = ymdToDate(today).getDay(); // lunes de la semana que viene
    return addDays(today, day === 0 ? 1 : 8 - day);
  }
  if (choice === 'pick') return picked;
  return '';
}

export default function QuickAddTask({ people, defaultAssigneeId, projects, onAdd }: QuickAddTaskProps) {
  const [title, setTitle] = useState('');
  const [assigneeUserId, setAssigneeUserId] = useState(defaultAssigneeId);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [due, setDue] = useState<DueChoice>('today');
  const [picked, setPicked] = useState(todayIso());
  const [projectId, setProjectId] = useState('');
  const [needsApproval, setNeedsApproval] = useState(false);
  const [saving, setSaving] = useState(false);

  // Si cambia la persona que se está viendo, la tarea nueva va para ella.
  const [lastDefault, setLastDefault] = useState(defaultAssigneeId);
  if (defaultAssigneeId !== lastDefault) {
    setLastDefault(defaultAssigneeId);
    setAssigneeUserId(defaultAssigneeId);
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = title.trim();
    if (!text || saving) return;
    setSaving(true);
    const ok = await onAdd({
      title: text,
      assigneeUserId,
      durationMinutes,
      dueDate: dueFor(due, picked),
      projectId: projectId || null,
      needsApproval,
    });
    setSaving(false);
    if (ok) {
      setTitle('');
      setNeedsApproval(false);
    }
  };

  return (
    <form className="oqa" onSubmit={submit} aria-label="Add a task">
      <label className="oqa-field grow">
        <span className="oqa-lbl">Task</span>
        <input
          className="oqa-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to get done?"
          maxLength={200}
        />
      </label>
      <label className="oqa-field">
        <span className="oqa-lbl">Assign to</span>
        <select className="oqa-input" value={assigneeUserId} onChange={(e) => setAssigneeUserId(e.target.value)}>
          {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <label className="oqa-field">
        <span className="oqa-lbl">How long</span>
        <select className="oqa-input" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}>
          {DURATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="oqa-field">
        <span className="oqa-lbl">Due</span>
        <select className="oqa-input" value={due} onChange={(e) => setDue(e.target.value as DueChoice)}>
          <option value="today">Today</option>
          <option value="tomorrow">Tomorrow</option>
          <option value="nextweek">Next Monday</option>
          <option value="pick">Pick a date…</option>
          <option value="none">No date</option>
        </select>
      </label>
      {due === 'pick' && (
        <label className="oqa-field">
          <span className="oqa-lbl">Date</span>
          <DateInput className="oqa-input" value={picked} onChange={setPicked} aria-label="Due date" />
        </label>
      )}
      <label className="oqa-field">
        <span className="oqa-lbl">Project</span>
        <select className="oqa-input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">No project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </label>
      <div className="oqa-field approval">
        <span className="oqa-lbl">Approval</span>
        <label className="oqa-check">
          <input type="checkbox" checked={needsApproval} onChange={(e) => setNeedsApproval(e.target.checked)} />
          <span>Needs OK</span>
        </label>
      </div>
      <button type="submit" className="oqa-add" disabled={!title.trim() || saving}>
        {saving ? <Loader2 size={16} className="oqa-spin" /> : <Plus size={16} />} Add
      </button>
    </form>
  );
}
