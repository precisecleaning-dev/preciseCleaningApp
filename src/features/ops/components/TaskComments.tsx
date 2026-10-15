// Comentarios de una tarea y el campo para escribir uno nuevo.
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { OpsComment } from '../../../types/index';
import { formatDate, formatTime } from '../../../utils/dateFormat';
import OpsAvatar from './OpsAvatar';

interface TaskCommentsProps {
  comments: OpsComment[];
  me: { id: string; name: string };
  onAdd: (text: string) => Promise<boolean>;
}

export default function TaskComments({ comments, me, onAdd }: TaskCommentsProps) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  const post = async () => {
    const value = text.trim();
    if (!value || posting) return;
    setPosting(true);
    const ok = await onAdd(value);
    setPosting(false);
    if (ok) setText('');
  };

  return (
    <section className="otp-section" aria-label="Comments">
      <h3 className="otp-section-title">Comments · {comments.length}</h3>
      {comments.length > 0 && (
        <ol className="otp-comments">
          {comments.map((c) => (
            <li key={`${c.userId}-${c.createdAt}`} className="otp-comment">
              <OpsAvatar id={c.userId} name={c.userName} size="sm" />
              <div className="otp-comment-body">
                <p className="otp-comment-head">
                  <span className="otp-comment-author">{c.userName}</span>
                  <span className="otp-comment-date">{formatDate(c.createdAt)} · {formatTime(c.createdAt)}</span>
                </p>
                <p className="otp-comment-text">{c.text}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="otp-composer">
        <OpsAvatar id={me.id} name={me.name} size="sm" />
        <textarea
          className="otp-composer-input"
          rows={2}
          value={text}
          placeholder="Add a comment…"
          aria-label="Add a comment"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(); }}
        />
        <button type="button" className="otp-post" onClick={post} disabled={!text.trim() || posting}>
          {posting ? <Loader2 size={14} className="otp-spin" /> : 'Post'}
        </button>
      </div>
    </section>
  );
}
