// ⭐ Cuadrícula de fotos del panel de Quality Check: fotos guardadas (con
//    editar y quitar), las que se están subiendo y las que esperan conexión,
//    más los botones para tomar o elegir fotos.
import { useRef } from 'react';
import { Camera, ImagePlus, Loader2, Pencil, WifiOff, X } from 'lucide-react';
import './QcPhotoGrid.css';

export interface QcPhotoItem {
  key: string;
  url: string;
  /** Área de qcData donde vive la foto (para quitarla o editarla). */
  slot: string;
  index: number;
}

interface QcPhotoGridProps {
  saved: QcPhotoItem[];
  pending: { id: string; preview: string }[];
  queued: { id: string; preview: string }[];
  onCamera: () => void;
  onPickFiles: (files: FileList | null) => void;
  onRemove: (item: QcPhotoItem) => void;
  onAnnotate: (item: QcPhotoItem) => void;
  tone?: 'plain' | 'card';
}

export default function QcPhotoGrid({
  saved, pending, queued, onCamera, onPickFiles, onRemove, onAnnotate, tone = 'plain',
}: QcPhotoGridProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <ul className={`qpg-grid ${tone}`}>
      {saved.map((p) => (
        <li key={p.key} className="qpg-tile">
          <img src={p.url} alt="" loading="lazy" width={120} height={120} className="qpg-img" />
          <button type="button" className="qpg-act edit" onClick={() => onAnnotate(p)} title="Dibujar en la foto" aria-label="Dibujar en la foto">
            <Pencil size={13} />
          </button>
          <button type="button" className="qpg-act remove" onClick={() => onRemove(p)} title="Quitar foto" aria-label="Quitar foto">
            <X size={13} />
          </button>
        </li>
      ))}
      {pending.map((p) => (
        <li key={`p-${p.id}`} className="qpg-tile busy">
          <img src={p.preview} alt="" className="qpg-img" />
          <span className="qpg-overlay"><Loader2 size={18} className="spin-qc" /></span>
        </li>
      ))}
      {queued.map((p) => (
        <li key={`q-${p.id}`} className="qpg-tile">
          <img src={p.preview} alt="" className="qpg-img" />
          <span className="qpg-queued"><WifiOff size={10} /> En cola</span>
        </li>
      ))}
      <li className="qpg-tile">
        <button type="button" className="qpg-add" onClick={onCamera}>
          <Camera size={16} /> Camera
        </button>
      </li>
      <li className="qpg-tile">
        <button type="button" className="qpg-add" onClick={() => fileRef.current?.click()}>
          <ImagePlus size={16} /> + Add
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="qpg-file"
          onChange={(e) => { onPickFiles(e.target.files); e.target.value = ''; }}
        />
      </li>
    </ul>
  );
}
