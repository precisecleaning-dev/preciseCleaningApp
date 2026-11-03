// Detalle · notas del invoice (salen en el PDF) y, para quien tiene Edit, la
// caja para agregar una nueva.
import { useState, type FormEvent } from 'react';
import type { Invoice, SystemUser } from '../../../types/index';
import { invoicesService, INVOICE_LIMITS } from '../../../services/invoicesService';
import { formatDateTime } from '../../../utils/dateFormat';
import { fullName } from '../../../utils/homeData';

interface InvoiceDetailNotesProps {
  invoice: Invoice;
  canEdit: boolean;
  currentUser: SystemUser | null;
}

const InvoiceDetailNotes = ({ invoice, canEdit, currentUser }: InvoiceDetailNotesProps) => {
  const [noteText, setNoteText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const isNoteEmpty = noteText.trim() === '';
  const isAtNoteLimit = invoice.notes.length >= INVOICE_LIMITS.maxNotes;

  const handleAddNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isNoteEmpty || isSaving || !currentUser) return;
    setIsSaving(true);
    setSaveError('');
    try {
      await invoicesService.addNote(invoice.id, noteText, { id: currentUser.id, name: fullName(currentUser) });
      setNoteText('');
    } catch (error) {
      console.error('Could not add the note:', error);
      const detail = error instanceof Error ? error.message : '';
      setSaveError(`Could not add the note. ${detail} Check your connection and try again.`.trim());
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="invdt-notes">
      {invoice.notes.length === 0 && <p className="invdt-secondary">No notes yet.</p>}
      {invoice.notes.map((note) => (
        <article key={note.id} className="invdt-note">
          <p className="invdt-note-text">{note.text}</p>
          <span className="invdt-secondary">{`${note.createdByUserName} · ${formatDateTime(note.createdAt)}`}</span>
        </article>
      ))}
      {canEdit && isAtNoteLimit && (
        <p className="invdt-secondary">{`This invoice has the maximum of ${INVOICE_LIMITS.maxNotes} notes.`}</p>
      )}
      {canEdit && !isAtNoteLimit && (
        <form className="invdt-note-form" onSubmit={handleAddNote}>
          <label className="invn-sr-only" htmlFor={`invoice-new-note-${invoice.id}`}>New note</label>
          <textarea
            id={`invoice-new-note-${invoice.id}`}
            className="invf-input invf-textarea"
            rows={2}
            maxLength={INVOICE_LIMITS.noteText}
            placeholder="Add a note (appears on the PDF)"
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
          />
          {saveError && <p className="invf-error" role="alert">{saveError}</p>}
          <button type="submit" className="invd-secondary-btn" disabled={isNoteEmpty || isSaving}>
            {isSaving ? 'Adding…' : 'Add note'}
          </button>
        </form>
      )}
    </div>
  );
};

export default InvoiceDetailNotes;
