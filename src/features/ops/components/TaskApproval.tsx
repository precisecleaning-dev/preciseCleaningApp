// Visto bueno de una tarea ("Approval"): quién tiene que dar el OK antes de
// que se pueda terminar (p. ej. una publicación en redes). Se envía, quien
// aprueba responde "Approve" o "Request changes", y queda constancia en los
// comentarios de la tarea.
import { useState } from 'react';
import { Check, RotateCcw, Send, X } from 'lucide-react';
import type { Actor, ApprovalDecision, AssignableUser, UserTaskApproval } from '../../../types/index';
import { formatDate, formatTime } from '../../../utils/dateFormat';

/** Fecha y hora de un envío o una respuesta ("10/17/2026 · 3:05 PM"). */
const formatDecisionTime = (isoDateTime: string | null) =>
  (isoDateTime ? `${formatDate(isoDateTime)} · ${formatTime(isoDateTime)}` : '');

interface ApprovalSendRowProps {
  approval: UserTaskApproval | null;
  approvers: AssignableUser[];
  defaultApproverUserId: string;
  isBusy: boolean;
  isResend: boolean;
  onSendForApproval: (approver: Actor) => void;
}

/** Elegir a quién se le pide el OK y enviarlo (sin requisito, por enviar o
 *  después de que pidieron cambios). */
const ApprovalSendRow = ({
  approval, approvers, defaultApproverUserId, isBusy, isResend, onSendForApproval,
}: ApprovalSendRowProps) => {
  const [selectedApproverUserId, setSelectedApproverUserId] = useState('');

  const approverUserId = selectedApproverUserId || approval?.approverUserId || defaultApproverUserId || approvers[0]?.id || '';
  const selectedApprover = approvers.find((approverOption) => approverOption.id === approverUserId);
  // Quien ya tenía la tarea puede no estar en la lista (p. ej. ya no tiene el rol).
  const hasUnlistedApprover = !!approval && !selectedApprover;

  const handleSendForApproval = () => {
    const approverToSend = selectedApprover
      ?? (approval ? { id: approval.approverUserId, name: approval.approverUserName } : null);
    if (approverToSend) onSendForApproval(approverToSend);
  };

  return (
    <div className="task-panel-approval-row">
      <label className="task-panel-approval-for">
        <span>For</span>
        <select className="slim task-panel-input" value={approverUserId}
          onChange={(event) => setSelectedApproverUserId(event.target.value)} aria-label="Who approves">
          {hasUnlistedApprover && <option value={approval.approverUserId}>{approval.approverUserName}</option>}
          {approvers.map((approverOption) => (
            <option key={approverOption.id} value={approverOption.id}>{approverOption.name}</option>
          ))}
        </select>
      </label>
      <button type="button" className="task-panel-approval-send" disabled={isBusy || !approverUserId}
        onClick={handleSendForApproval}>
        <Send size={14} /> {isResend ? 'Send again' : 'Send for approval'}
      </button>
    </div>
  );
};

interface TaskApprovalProps {
  approval: UserTaskApproval | null;
  /** Personas que pueden dar el OK (sin quien está usando la app). */
  approvers: AssignableUser[];
  defaultApproverUserId: string;
  currentUserId: string;
  /** ¿Puede enviar, cancelar o quitar el requisito? (quien edita la tarea). */
  canManageApproval: boolean;
  isBusy: boolean;
  onSendForApproval: (approver: Actor) => void;
  /** Guarda la respuesta; true si se guardó (si falla, el aviso lo da useTaskActions). */
  onDecideApproval: (decision: ApprovalDecision, note: string) => Promise<boolean>;
  onApprovalChange: (approval: UserTaskApproval | null) => void;
}

const TaskApproval = ({
  approval, approvers, defaultApproverUserId, currentUserId, canManageApproval, isBusy,
  onSendForApproval, onDecideApproval, onApprovalChange,
}: TaskApprovalProps) => {
  const approvalStatus = approval?.status ?? 'none';
  const [isRequestingChanges, setIsRequestingChanges] = useState(false);
  const [changesNote, setChangesNote] = useState('');

  const isCurrentUserApprover = !!approval && approval.approverUserId === currentUserId;
  const canSendForApproval = canManageApproval
    && (approvalStatus === 'none' || approvalStatus === 'draft' || approvalStatus === 'changes_requested');

  const handleCancelChanges = () => {
    setIsRequestingChanges(false);
    setChangesNote('');
  };

  // Si no se pudo guardar, la nota se queda escrita para reintentar.
  const handleSendChanges = async () => {
    const wasSaved = await onDecideApproval('changes_requested', changesNote.trim());
    if (!wasSaved) return;
    setIsRequestingChanges(false);
    setChangesNote('');
  };

  const handleCancelRequest = () => {
    if (approval) onApprovalChange({ ...approval, status: 'draft', requestedAt: null, requestedByUserId: null });
  };

  return (
    <section className={`task-panel-approval ${approvalStatus}`} aria-label="Approval">
      <p className="task-panel-approval-title">Approval</p>

      {(approvalStatus === 'none' || approvalStatus === 'draft') && (
        <p className="task-panel-approval-hint">Who needs to OK this before it&apos;s done? (e.g. a social media post)</p>
      )}

      {approvalStatus === 'pending' && approval && (
        <p className="task-panel-approval-state">
          Waiting for <strong>{approval.approverUserName}</strong>
          {approval.requestedAt && (
            <span className="task-panel-approval-when"> · sent {formatDecisionTime(approval.requestedAt)}</span>
          )}
        </p>
      )}

      {approvalStatus === 'approved' && approval && (
        <p className="ok task-panel-approval-state">
          <Check size={15} /> Approved by <strong>{approval.approverUserName}</strong>
          <span className="task-panel-approval-when"> · {formatDecisionTime(approval.decidedAt)}</span>
        </p>
      )}

      {approvalStatus === 'changes_requested' && approval && (
        <>
          <p className="bad task-panel-approval-state">
            <strong>{approval.approverUserName}</strong> asked for changes
            <span className="task-panel-approval-when"> · {formatDecisionTime(approval.decidedAt)}</span>
          </p>
          {approval.note && <p className="task-panel-approval-note">“{approval.note}”</p>}
        </>
      )}

      {canSendForApproval && (
        <ApprovalSendRow
          approval={approval}
          approvers={approvers}
          defaultApproverUserId={defaultApproverUserId}
          isBusy={isBusy}
          isResend={approvalStatus === 'changes_requested'}
          onSendForApproval={onSendForApproval}
        />
      )}

      {approvalStatus === 'pending' && isCurrentUserApprover && !isRequestingChanges && (
        <div className="task-panel-approval-actions">
          <button type="button" className="ok task-panel-approval-btn" disabled={isBusy}
            onClick={() => onDecideApproval('approved', '')}>
            <Check size={14} /> Approve
          </button>
          <button type="button" className="task-panel-approval-btn" disabled={isBusy} onClick={() => setIsRequestingChanges(true)}>
            <RotateCcw size={14} /> Request changes
          </button>
        </div>
      )}

      {approvalStatus === 'pending' && isCurrentUserApprover && isRequestingChanges && (
        <div className="task-panel-approval-ask">
          <textarea className="task-panel-composer-input" rows={2} value={changesNote} placeholder="What needs to change?"
            aria-label="What needs to change" onChange={(event) => setChangesNote(event.target.value)} />
          <div className="task-panel-approval-actions">
            <button type="button" className="task-panel-approval-btn" onClick={handleCancelChanges}>
              <X size={14} /> Cancel
            </button>
            <button type="button" className="bad task-panel-approval-btn" disabled={isBusy || !changesNote.trim()}
              onClick={handleSendChanges}>
              Send changes
            </button>
          </div>
        </div>
      )}

      {approvalStatus === 'pending' && !isCurrentUserApprover && canManageApproval && approval && (
        <button type="button" className="task-panel-approval-link" disabled={isBusy} onClick={handleCancelRequest}>
          Cancel request
        </button>
      )}

      {approvalStatus === 'draft' && canManageApproval && (
        <button type="button" className="task-panel-approval-link" disabled={isBusy} onClick={() => onApprovalChange(null)}>
          Doesn&apos;t need approval
        </button>
      )}
    </section>
  );
};

export default TaskApproval;
