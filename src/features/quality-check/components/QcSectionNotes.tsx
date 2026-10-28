// Nota de un área del checklist de Quality Check (al final del área, debajo de
// sus fotos). Marcar Fail le agrega "Fail <tarea>"; también se escribe a mano.
// QualityCheckView la arma con renderSectionNotes, como las fotos del área.
import type { QcSection } from '../qcForm';

interface QcSectionNotesProps {
  section: QcSection;
  notes: string;
  onNotesChange: (section: QcSection, notes: string) => void;
}

/** Líneas que se ven sin scroll aunque la nota esté vacía. */
const MIN_NOTES_ROWS = 2;

const QcSectionNotes = ({ section, notes, onNotesChange }: QcSectionNotesProps) => {
  // El campo crece con las líneas "Fail …" para que se vean todas.
  const notesRowCount = Math.max(MIN_NOTES_ROWS, notes.split('\n').length);

  return (
    <label className="qcl-notes">
      <span className="qcl-photos-lbl">Notes · {section.name}</span>
      <textarea
        className="qcd-textarea"
        rows={notesRowCount}
        value={notes}
        placeholder="Notes for the team about this area"
        onChange={(event) => onNotesChange(section, event.target.value)}
      />
    </label>
  );
};

export default QcSectionNotes;
