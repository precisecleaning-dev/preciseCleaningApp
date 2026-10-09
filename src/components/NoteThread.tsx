// ⭐ Nota de la casa en formato de CONVERSACIÓN: cada nota es un mensaje con
//    autor y fecha-hora (sale del historial `notesHistory`), y abajo un
//    compositor para escribir la siguiente. Se usa en el detalle de la casa
//    (tab Notes & Photos) para Office Notes, General Note y Employee's Note.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Send, StickyNote } from 'lucide-react';
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
          messages.map((m, i) => {
            const legacy = !m.at;
            // Separador de día cuando cambia la fecha (como en un chat)
            const day = fmtDay(m.at);
            const showDay = !!day && (i === 0 || fmtDay(messages[i - 1].at) !== day);
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
                  <div className="nt-bubble">
                    <span className={`nt-author ${legacy ? 'legacy' : toneOf(m.author)}`}>{m.author}</span>
                    <p className="nt-text">{m.text}</p>
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
