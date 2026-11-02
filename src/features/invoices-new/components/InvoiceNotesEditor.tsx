// Notas del invoice (salen en el PDF): varias, se agregan y se quitan. Las
// vacías no se guardan.
import { X } from 'lucide-react';
import type { InvoiceFormNote } from '../hooks/useInvoiceForm';
import { INVOICE_LIMITS } from '../../../services/invoicesService';

interface InvoiceNotesEditorProps {
  notes: InvoiceFormNote[];
  onChangeNote: (key: string, text: string) => void;
  onRemoveNote: (key: string) => void;
  error?: string;
}

const InvoiceNotesEditor = ({ notes, onChangeNote, onRemoveNote, error }: InvoiceNotesEditorProps) => (
  <div className="invf-notes">
    {notes.map((note, noteIndex) => {
      const noteNumber = noteIndex + 1;
      return (
        <div key={note.key} className="invf-note-row">
          <label className="invn-sr-only" htmlFor={`invoice-note-${note.key}`}>{`Note ${noteNumber}`}</label>
          <textarea
            id={`invoice-note-${note.key}`}
            className="invf-input invf-textarea"
            rows={2}
            maxLength={INVOICE_LIMITS.noteText}
            placeholder="Add a note for the client (appears on the PDF)"
            value={note.text}
            onChange={(event) => onChangeNote(note.key, event.target.value)}
          />
          <button
            type="button"
            className="invf-icon-btn"
            aria-label={`Remove note ${noteNumber}`}
            onClick={() => onRemoveNote(note.key)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      );
    })}
    {error && <p className="invf-error" role="alert">{error}</p>}
  </div>
);

export default InvoiceNotesEditor;
