// ⭐ Nota de la casa en formato de CONVERSACIÓN: cada nota es un mensaje con
//    autor y fecha-hora (sale del historial `notesHistory`), y abajo un
//    compositor para escribir la siguiente. Se usa en el detalle de la casa
//    (tab Notes & Photos) para Office Notes, General Note y Employee's Note.
//    Los mensajes pueden llevar archivos (clip del compositor) y su autor los
//    puede corregir (lápiz en la burbuja; quedan marcados "editada").
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Maximize2, Minimize2, Paperclip, Pencil, Send, StickyNote, X } from 'lucide-react';
import type { NoteAttachment } from '../types/index';
import { formatDate, formatTime } from '../utils/dateFormat';
import './NoteThread.css';

export interface NoteMessage {
  key: string;
  text: string;
  /** Nombre para mostrar (o "Nota anterior" si no hay autor registrado). */
  author: string;
  /** ISO; vacío si se desconoce. */
  at: string;
  /** Mensaje del usuario actual (se alinea a la derecha). */
  mine: boolean;
  /** El mensaje se corrigió después de enviarlo (o es una entrada antigua que
   *  guardó el texto completo de la nota al editarla). */
  edited?: boolean;
  /** Archivos del mensaje. */
  attachments?: NoteAttachment[];
  /** ¿Quien mira puede corregir este mensaje? */
  canEdit?: boolean;
}

interface NoteThreadProps {
  title: string;
  icon: ReactNode;
  tone: 'office' | 'general' | 'employee';
  messages: NoteMessage[];
  emptyText: string;
  canWrite: boolean;
  placeholder: string;
  sending: boolean;
  /** Envía el mensaje (texto, archivos o ambos). */
  onSend: (text: string, files: File[]) => Promise<boolean>;
  /** Corrige el texto de un mensaje. Sin esta función no se muestra el lápiz. */
  onEdit?: (message: NoteMessage, text: string) => Promise<boolean>;
}

const fmtTime = formatTime;
const fmtDay = formatDate;

/** Inicial del autor para el círculo (como en WhatsApp). */
const initialOf = (name: string) => (name.trim().match(/[A-Za-zÀ-ÿ0-9]/)?.[0] || '?').toUpperCase();

/** Color fijo por autor: siempre el mismo tono para la misma persona
 *  (6 tonos posibles → clases modificadoras, no estilos en línea). */
const AVATAR_TONES = 6;
const toneOf = (name: string) => {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `t${h % AVATAR_TONES}`;
};

const fileSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function MessageFiles({ files }: { files: NoteAttachment[] }) {
  return (
    <ul className="nt-files">
      {files.map((f) => (
        <li key={f.path || f.url} className="nt-file">
          <a href={f.url} target="_blank" rel="noopener noreferrer" className="nt-file-link">
            {f.type.startsWith('image/') ? (
              <img className="nt-file-img" src={f.url} alt={f.name} width={160} height={110} loading="lazy" />
            ) : (
              <span className="nt-file-doc">
                <FileText size={16} />
                <span className="nt-file-name">{f.name}</span>
                <span className="nt-file-size">{fileSize(f.size)}</span>
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function NoteThread({
  title, icon, tone, messages, emptyText, canWrite, placeholder, sending, onSend, onEdit,
}: NoteThreadProps) {
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [editing, setEditing] = useState<{ key: string; text: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  // ⭐ Ventana grande: la misma conversación en un panel casi de pantalla
  //    completa encima del detalle (Escape o clic afuera la cierra).
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLOListElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Siempre mostrar el mensaje más reciente (abajo), como en un chat; también
  // al abrir o cerrar la ventana grande (la lista se vuelve a montar).
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, expanded]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  const send = async () => {
    const text = draft.trim();
    if ((!text && files.length === 0) || sending) return;
    if (await onSend(text, files)) {
      setDraft('');
      setFiles([]);
    }
  };

  const saveEdit = async (m: NoteMessage) => {
    if (!editing || !onEdit) return;
    const text = editing.text.trim();
    if (!text || text === m.text.trim()) {
      setEditing(null);
      return;
    }
    setSavingEdit(true);
    const ok = await onEdit(m, text);
    setSavingEdit(false);
    if (ok) setEditing(null);
  };

  const box = (
    <section
      className={`nt-box ${tone}${expanded ? ' expanded' : ''}`}
      aria-label={title}
      onClick={expanded ? (e) => e.stopPropagation() : undefined}
    >
      <header className="nt-head">
        <span className="nt-title">{icon} {title}</span>
        <span className="nt-head-side">
          <span className="nt-count">{messages.length}</span>
          <button
            type="button"
            className="nt-expand"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Cerrar ventana grande' : 'Ampliar notas'}
            title={expanded ? 'Cerrar ventana grande (Esc)' : 'Ampliar notas'}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </span>
      </header>

      <ol className="nt-list" ref={listRef}>
        {messages.length === 0 ? (
          <li className="nt-empty">{emptyText}</li>
        ) : (
          messages.map((m, i) => {
            const legacy = !m.at;
            // Separador de día cuando cambia la fecha (como en un chat)
            const day = fmtDay(m.at);
            const showDay = !!day && (i === 0 || fmtDay(messages[i - 1].at) !== day);
            const isEditing = editing?.key === m.key;
            return (
              <li key={m.key} className="nt-item">
                {showDay && <span className="nt-day">{day}</span>}
                <div className={`nt-msg${m.mine ? ' mine' : ''}`}>
                  <span
                    className={`nt-avatar ${legacy ? 'legacy' : toneOf(m.author)}`}
                    aria-hidden="true"
                    title={m.author}
                  >
                    {legacy ? <StickyNote size={14} /> : initialOf(m.author)}
                  </span>
                  <div className={`nt-bubble${isEditing ? ' editing' : ''}`}>
                    <span className="nt-bubble-head">
                      <span className={`nt-author ${legacy ? 'legacy' : toneOf(m.author)}`}>{m.author}</span>
                      {m.canEdit && onEdit && !isEditing && (
                        <button
                          type="button"
                          className="nt-edit-btn"
                          onClick={() => setEditing({ key: m.key, text: m.text })}
                          aria-label="Editar nota"
                          title="Editar"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                    </span>
                    {isEditing ? (
                      <div className="nt-edit">
                        <textarea
                          className="nt-input nt-edit-input"
                          rows={3}
                          value={editing.text}
                          aria-label="Corregir la nota"
                          onChange={(e) => setEditing({ key: m.key, text: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditing(null);
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              void saveEdit(m);
                            }
                          }}
                        />
                        <span className="nt-edit-actions">
                          <button type="button" className="nt-edit-cancel" onClick={() => setEditing(null)} disabled={savingEdit}>
                            Cancelar
                          </button>
                          <button type="button" className="nt-edit-save" onClick={() => void saveEdit(m)}
                            disabled={savingEdit || !editing.text.trim()}>
                            Guardar
                          </button>
                        </span>
                      </div>
                    ) : (
                      m.text && <p className="nt-text">{m.text}</p>
                    )}
                    {m.attachments && m.attachments.length > 0 && <MessageFiles files={m.attachments} />}
                    <span className="nt-meta">
                      {m.edited && 'editada · '}
                      {fmtTime(m.at)}
                    </span>
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ol>

      {canWrite && files.length > 0 && (
        <ul className="nt-pending" aria-label="Archivos por enviar">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${f.lastModified}`} className="nt-pending-file">
              <Paperclip size={12} />
              <span className="nt-pending-name">{f.name}</span>
              <button
                type="button"
                className="nt-pending-remove"
                onClick={() => setFiles((prev) => prev.filter((_, k) => k !== i))}
                aria-label={`Quitar ${f.name}`}
                disabled={sending}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {canWrite && (
        <div className="nt-composer">
          <button
            type="button"
            className="nt-attach"
            onClick={() => fileRef.current?.click()}
            disabled={sending}
            aria-label="Adjuntar archivos"
            title="Adjuntar archivos"
          >
            <Paperclip size={16} />
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="nt-file-input"
            onChange={(e) => {
              const picked = Array.from(e.target.files || []);
              e.target.value = '';
              if (picked.length > 0) setFiles((prev) => [...prev, ...picked]);
            }}
          />
          <textarea
            className="nt-input"
            rows={2}
            placeholder={placeholder}
            aria-label={`Nuevo mensaje en ${title}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter envía; Shift+Enter hace salto de línea (como un chat).
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="button"
            className="nt-send"
            onClick={() => void send()}
            disabled={sending || (draft.trim() === '' && files.length === 0)}
            aria-label="Enviar nota"
          >
            <Send size={16} />
          </button>
        </div>
      )}
    </section>
  );

  if (!expanded) return box;
  // En la ventana grande el lugar original queda vacío (mismo ancho de columna).
  return (
    <>
      <div className="nt-slot" aria-hidden="true" />
      {createPortal(
        <div className="nt-overlay" onClick={() => setExpanded(false)}>{box}</div>,
        document.body,
      )}
    </>
  );
}
