// Archivos de una tarea: botón para adjuntar y una tarjeta por archivo.
import { useRef } from 'react';
import { FileText, Loader2, Paperclip, X } from 'lucide-react';
import type { OpsAttachment } from '../../../types/index';
import { fileKind, formatBytes } from '../opsOptions';

interface TaskAttachmentsProps {
  attachments: OpsAttachment[];
  canRemove: boolean;
  uploading: boolean;
  onAttach: (files: File[]) => void;
  onRemove: (attachment: OpsAttachment) => void;
}

export default function TaskAttachments({ attachments, canRemove, uploading, onAttach, onRemove }: TaskAttachmentsProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <section className="otp-section" aria-label="Attachments">
      <div className="otp-section-head">
        <h3 className="otp-section-title">Attachments · {attachments.length}</h3>
        <button type="button" className="otp-attach-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 size={14} className="otp-spin" /> : <Paperclip size={14} />} Attach file
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="otp-file-input"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = '';
            if (files.length > 0) onAttach(files);
          }}
        />
      </div>
      {attachments.length > 0 && (
        <ul className="otp-files">
          {attachments.map((a) => (
            <li key={a.path} className="otp-file">
              <a className="otp-file-link" href={a.url} target="_blank" rel="noopener noreferrer">
                {a.type.startsWith('image/') ? (
                  <img className="otp-thumb" src={a.url} alt="" width={40} height={40} loading="lazy" />
                ) : (
                  <span className="otp-thumb icon"><FileText size={18} /></span>
                )}
                <span className="otp-file-text">
                  <span className="otp-file-name">{a.name}</span>
                  <span className="otp-file-meta">{formatBytes(a.size)} · {fileKind(a.type)}</span>
                </span>
              </a>
              {canRemove && (
                <button type="button" className="otp-file-remove" onClick={() => onRemove(a)} aria-label={`Remove ${a.name}`}>
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
