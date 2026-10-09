// ⭐ Lo que el inspector debe leer antes de empezar: las notas de la oficina
//    (nota general + Office Notes si tiene el permiso) y las notas y fotos de
//    los limpiadores (Employee's Note y fotos de la casa).
import { formatDate, formatTime } from '../../../utils/dateFormat';
import './QcIncomingNotes.css';

export interface QcNoteItem {
  key: string;
  text: string;
  author: string;
  /** ISO; vacío si se desconoce (notas viejas sin historial). */
  at: string;
}

interface QcIncomingNotesProps {
  officeNotes: QcNoteItem[];
  cleanerNotes: QcNoteItem[];
  cleanerTeam: string;
  cleanerPhotos: string[];
}

const MAX_PHOTOS = 8;

export default function QcIncomingNotes({ officeNotes, cleanerNotes, cleanerTeam, cleanerPhotos }: QcIncomingNotesProps) {
  const lastOffice = officeNotes[officeNotes.length - 1];
  const shownPhotos = cleanerPhotos.slice(0, MAX_PHOTOS);
  const extraPhotos = cleanerPhotos.length - shownPhotos.length;
  return (
    <>
      {officeNotes.length > 0 && (
        <section className="qin-office" aria-label="From the office">
          <header className="qin-head">
            <p className="qin-lbl office">From the office</p>
            {lastOffice && (
              <span className="qin-meta office">
                {lastOffice.author}{lastOffice.at ? ` · ${formatDate(lastOffice.at)}` : ''}
              </span>
            )}
          </header>
          <ul className="qin-list">
            {officeNotes.map((n) => <li key={n.key}>{n.text}</li>)}
          </ul>
        </section>
      )}

      {(cleanerNotes.length > 0 || cleanerPhotos.length > 0) && (
        <section className="qin-cleaners" aria-label="Notes from the cleaners">
          <header className="qin-head">
            <p className="qin-lbl cleaners">Notes from the cleaners</p>
            {cleanerNotes.length > 0 && (
              <span className="qin-badge">
                {cleanerNotes.length} note{cleanerNotes.length === 1 ? '' : 's'} · read first
              </span>
            )}
          </header>
          {cleanerNotes.length > 0 && (
            <ul className="qin-notes">
              {cleanerNotes.map((n) => (
                <li key={n.key} className="qin-note">
                  <div className="qin-note-meta">
                    <span className="qin-note-author">{n.author}{cleanerTeam ? ` · ${cleanerTeam}` : ''}</span>
                    {n.at && <span>{formatDate(n.at)} · {formatTime(n.at)}</span>}
                  </div>
                  <p className="qin-note-text">{n.text}</p>
                </li>
              ))}
            </ul>
          )}
          {cleanerPhotos.length > 0 && (
            <div className="qin-photos">
              <span className="qin-lbl cleaners">Cleaner photos</span>
              <ul className="qin-photo-grid">
                {shownPhotos.map((url) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noreferrer" className="qin-photo">
                      <img src={url} alt="Foto del equipo" loading="lazy" width={120} height={120} />
                    </a>
                  </li>
                ))}
                {extraPhotos > 0 && <li className="qin-photo more">+{extraPhotos}</li>}
              </ul>
            </div>
          )}
        </section>
      )}
    </>
  );
}
