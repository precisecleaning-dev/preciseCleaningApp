// ⭐ Nota de la casa en formato de CONVERSACIÓN: cada nota es un mensaje con
//    autor y fecha-hora (sale del historial `notesHistory`), y abajo un
//    compositor para escribir la siguiente. Se usa en el detalle de la casa
//    (tab Notes & Photos) para Office Notes, General Note y Employee's Note.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Send } from 'lucide-react';
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
  /** Entrada antigua que guardó el TEXTO COMPLETO de la nota al editarla. */
  edited?: boolean;
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
  onSend: (text: string) => Promise<boolean>;
}

const fmtWhen = (iso: string) =>
  iso
    ? new Date(iso).toLocaleString('en-US', {
        month: 'short', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true,
      })
    : '';

export default function NoteThread({
  title, icon, tone, messages, emptyText, canWrite, placeholder, sending, onSend,
}: NoteThreadProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLOListElement | null>(null);

  // Siempre mostrar el mensaje más reciente (abajo), como en un chat.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    if (await onSend(text)) setDraft('');
  };

  return (
    <section className={`nt-box ${tone}`} aria-label={title}>
      <header className="nt-head">
        <span className="nt-title">{icon} {title}</span>
        <span className="nt-count">{messages.length}</span>
      </header>

      <ol className="nt-list" ref={listRef}>
        {messages.length === 0 ? (
          <li className="nt-empty">{emptyText}</li>
        ) : (
          messages.map((m) => (
            <li key={m.key} className={`nt-msg${m.mine ? ' mine' : ''}`}>
              <div className="nt-bubble">
                <p className="nt-text">{m.text}</p>
              </div>
              <span className="nt-meta">
                {m.author}
                {m.at && ` · ${fmtWhen(m.at)}`}
                {m.edited && ' · editada'}
              </span>
            </li>
          ))
        )}
      </ol>

      {canWrite && (
        <div className="nt-composer">
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
            disabled={sending || draft.trim() === ''}
            aria-label="Enviar nota"
          >
            <Send size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
