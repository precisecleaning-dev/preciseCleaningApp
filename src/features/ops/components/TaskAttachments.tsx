// Archivos de una tarea: botón para adjuntar y una tarjeta por archivo.
import { useRef } from 'react';
import { FileText, Loader2, Paperclip, X } from 'lucide-react';
import type { TaskAttachment } from '../../../types/index';
import { fileKind, formatBytes } from '../opsOptions';

interface TaskAttachmentsProps {
  attachments: TaskAttachment[];
  canRemove: boolean;
  uploading: boolean;
  onAttach: (files: File[]) => void;
  onRemove: (attachment: TaskAttachment) => void;
}

export default function TaskAttachments({ attachments, canRemove, uploading, onAttach, onRemove }: TaskAttachmentsProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <section className="task-panel-section" aria-label="Attachments">
      <div className="task-panel-section-head">
        <h3 className="task-panel-section-title">Attachments · {attachments.length}</h3>
        <button type="button" className="task-panel-attach-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 size={14} className="task-panel-spin" /> : <Paperclip size={14} />} Attach file
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="task-panel-file-input"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = '';
            if (files.length > 0) onAttach(files);
          }}
        />
      </div>
      {attachments.length > 0 && (
        <ul className="task-panel-files">
          {attachments.map((a) => (
            <li key={a.path} className="task-panel-file">
              <a className="task-panel-file-link" href={a.url} target="_blank" rel="noopener noreferrer">
                {a.type.startsWith('image/') ? (
                  <img className="task-panel-thumb" src={a.url} alt="" width={40} height={40} loading="lazy" />
                ) : (
                  <span className="icon task-panel-thumb"><FileText size={18} /></span>
                )}
                <span className="task-panel-file-text">
                  <span className="task-panel-file-name">{a.name}</span>
                  <span className="task-panel-file-meta">{formatBytes(a.size)} · {fileKind(a.type)}</span>
                </span>
              </a>
              {canRemove && (
                <button type="button" className="task-panel-file-remove" onClick={() => onRemove(a)} aria-label={`Remove ${a.name}`}>
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
