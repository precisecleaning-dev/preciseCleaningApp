// Visto bueno de una tarea ("Approval"): quién tiene que dar el OK antes de
// que se pueda terminar (p. ej. una publicación en redes). Se envía, quien
// aprueba responde "Approve" o "Request changes", y queda constancia en los
// comentarios de la tarea.
import { useState } from 'react';
import { Check, RotateCcw, Send, X } from 'lucide-react';
import type { UserTaskApproval } from '../../../types/index';
import { formatDate, formatTime } from '../../../utils/dateFormat';
import type { PersonOption } from '../opsPermissions';

interface TaskApprovalProps {
  approval: UserTaskApproval | null;
  /** Personas que pueden dar el OK (sin quien está usando la app). */
  approvers: PersonOption[];
  defaultApproverId: string;
  meId: string;
  /** ¿Puede enviar, cancelar o quitar el requisito? (quien edita la tarea). */
  canManage: boolean;
  busy: boolean;
  onSend: (approver: PersonOption) => void;
  onDecide: (decision: 'approved' | 'changes', note: string) => void;
  onSetApproval: (approval: UserTaskApproval | null) => void;
}

const when = (iso: string | null) => (iso ? `${formatDate(iso)} · ${formatTime(iso)}` : '');

export default function TaskApproval({
  approval, approvers, defaultApproverId, meId, canManage, busy, onSend, onDecide, onSetApproval,
}: TaskApprovalProps) {
  const status = approval?.status ?? 'none';
  const [pickedId, setPickedId] = useState('');
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');

  const approverId = pickedId || approval?.approverUserId || defaultApproverId || approvers[0]?.id || '';
  const approver = approvers.find((p) => p.id === approverId);
  const isApprover = !!approval && approval.approverUserId === meId;

  // Elegir a quién se le pide el OK y enviarlo (sin requisito, por enviar o
  // después de que pidieron cambios).
  const sendRow = canManage && (status === 'none' || status === 'draft' || status === 'changes') && (
    <div className="otp-approval-row">
      <label className="otp-approval-for">
        <span>For</span>
        <select className="otp-input slim" value={approverId} onChange={(e) => setPickedId(e.target.value)}
          aria-label="Who approves">
          {approval && !approver && <option value={approval.approverUserId}>{approval.approverUserName}</option>}
          {approvers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <button type="button" className="otp-approval-send" disabled={busy || !approverId}
        onClick={() => {
          const target = approver || (approval ? { id: approval.approverUserId, name: approval.approverUserName, label: approval.approverUserName } : null);
          if (target) onSend(target);
        }}>
        <Send size={14} /> {status === 'changes' ? 'Send again' : 'Send for approval'}
      </button>
    </div>
  );

  return (
    <section className={`otp-approval ${status}`} aria-label="Approval">
      <p className="otp-approval-title">Approval</p>

      {(status === 'none' || status === 'draft') && (
        <p className="otp-approval-hint">Who needs to OK this before it&apos;s done? (e.g. a social media post)</p>
      )}

      {status === 'pending' && approval && (
        <p className="otp-approval-state">
          Waiting for <strong>{approval.approverUserName}</strong>
          {approval.requestedAt && <span className="otp-approval-when"> · sent {when(approval.requestedAt)}</span>}
        </p>
      )}

      {status === 'approved' && approval && (
        <p className="otp-approval-state ok">
          <Check size={15} /> Approved by <strong>{approval.approverUserName}</strong>
          <span className="otp-approval-when"> · {when(approval.decidedAt)}</span>
        </p>
      )}

      {status === 'changes' && approval && (
        <>
          <p className="otp-approval-state bad">
            <strong>{approval.approverUserName}</strong> asked for changes
            <span className="otp-approval-when"> · {when(approval.decidedAt)}</span>
          </p>
          {approval.note && <p className="otp-approval-note">“{approval.note}”</p>}
        </>
      )}

      {sendRow}

      {status === 'pending' && isApprover && !asking && (
        <div className="otp-approval-actions">
          <button type="button" className="otp-approval-btn ok" disabled={busy} onClick={() => onDecide('approved', '')}>
            <Check size={14} /> Approve
          </button>
          <button type="button" className="otp-approval-btn" disabled={busy} onClick={() => setAsking(true)}>
            <RotateCcw size={14} /> Request changes
          </button>
        </div>
      )}

      {status === 'pending' && isApprover && asking && (
        <div className="otp-approval-ask">
          <textarea className="otp-composer-input" rows={2} value={note} placeholder="What needs to change?"
            aria-label="What needs to change" onChange={(e) => setNote(e.target.value)} />
          <div className="otp-approval-actions">
            <button type="button" className="otp-approval-btn" onClick={() => { setAsking(false); setNote(''); }}>
              <X size={14} /> Cancel
            </button>
            <button type="button" className="otp-approval-btn bad" disabled={busy || !note.trim()}
              onClick={() => { onDecide('changes', note.trim()); setAsking(false); setNote(''); }}>
              Send changes
            </button>
          </div>
        </div>
      )}

      {status === 'pending' && !isApprover && canManage && approval && (
        <button type="button" className="otp-approval-link" disabled={busy}
          onClick={() => onSetApproval({ ...approval, status: 'draft', requestedAt: null, requestedByUserId: null })}>
          Cancel request
        </button>
      )}

      {status === 'draft' && canManage && (
        <button type="button" className="otp-approval-link" disabled={busy} onClick={() => onSetApproval(null)}>
          Doesn&apos;t need approval
        </button>
      )}
    </section>
  );
}
