import { useRef } from 'react';
import { Upload, Camera, Printer, Loader2, X, Check, CloudOff } from 'lucide-react';
import type { PhotoConfig } from '../services/photoConfigService';

export interface PhotoSectionProps {
  label: string;                       // "BEFORE" / "AFTER"
  type: 'before' | 'after';
  urls: string[];                      // todas las URLs visibles (guardadas + nuevas)
  excludedUrls?: string[];             // URLs que NO van al reporte
  pendingCount?: number;               // fotos en cola offline para este tipo
  canEdit?: boolean;
  isSaving: boolean;
  isCompressing: boolean;
  photoConfig: PhotoConfig;
  showUpload?: boolean;
  showCamera?: boolean;
  showExportPdf?: boolean;
  reportSelectable?: boolean;          // mostrar el toggle "en reporte"
  onAddFiles: (files: FileList | null) => void;
  onRemove: (index: number) => void;
  onToggleReport?: (url: string) => void;
  onExportPdf?: () => void;
}

const ACCENTS = {
  before: { main: '#2563eb', soft: '#eff6ff', border: '#bfdbfe' },
  after: { main: '#059669', soft: '#ecfdf5', border: '#a7f3d0' },
};

export default function PhotoSection({
  label, type, urls, excludedUrls = [], pendingCount = 0,
  canEdit = true, isSaving, isCompressing, photoConfig,
  showUpload = true, showCamera = true, showExportPdf = false,
  reportSelectable = false,
  onAddFiles, onRemove, onToggleReport, onExportPdf,
}: PhotoSectionProps) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const accent = ACCENTS[type];
  const busy = isSaving || isCompressing;

  const inReportCount = urls.filter(u => !excludedUrls.includes(u)).length;

  return (
    <div className="photo-section">
      <style>{`
        .photo-section {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 14px;
          overflow: hidden; display: flex; flex-direction: column;
        }
        .ps-head {
          display: flex; align-items: center; justify-content: space-between;
          gap: 8px; padding: 14px 16px; border-bottom: 1px solid #f1f5f9; flex-wrap: wrap;
        }
        .ps-title { display: flex; align-items: center; gap: 8px; font-weight: 800;
          font-size: .8rem; letter-spacing: .04em; color: #0f172a; text-transform: uppercase; }
        .ps-count { font-size: .72rem; font-weight: 600; color: #64748b; }
        .ps-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 10px; padding: 14px 16px; }
        .ps-btn {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          min-height: 48px; border-radius: 12px; font-weight: 700; font-size: .9rem;
          cursor: pointer; border: 1.5px solid transparent; transition: transform .12s, filter .15s;
          -webkit-tap-highlight-color: transparent; user-select: none;
        }
        .ps-btn:active { transform: scale(.97); }
        .ps-btn:disabled { opacity: .55; cursor: not-allowed; }
        .ps-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
          gap: 10px; padding: 0 16px 16px;
        }
        .ps-thumb { position: relative; aspect-ratio: 1; border-radius: 10px; overflow: hidden;
          border: 1px solid #e2e8f0; background: #f1f5f9; }
        .ps-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .ps-thumb.excluded img { filter: grayscale(1) brightness(.85); opacity: .6; }
        .ps-x {
          position: absolute; top: 5px; right: 5px; width: 24px; height: 24px;
          border-radius: 50%; border: none; background: rgba(15,23,42,.72); color: #fff;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .ps-report {
          position: absolute; left: 0; right: 0; bottom: 0; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 5px;
          padding: 5px 4px; font-size: .65rem; font-weight: 800; letter-spacing: .02em;
          text-transform: uppercase;
        }
        .ps-empty { text-align: center; color: #94a3b8; font-size: .85rem; padding: 24px 0 18px; }
        .ps-compress { display: flex; align-items: center; justify-content: center; gap: 8px;
          color: #2563eb; font-size: .82rem; font-weight: 700; padding: 4px 0 10px; }
        @media (max-width: 600px) {
          .ps-actions { grid-template-columns: 1fr 1fr; }
          .ps-grid { grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); }
          .ps-btn { min-height: 52px; font-size: .95rem; }
        }
      `}</style>

      <div className="ps-head">
        <span className="ps-title">
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: accent.main }} />
          {label} Photos
        </span>
        <span className="ps-count">
          {urls.length} foto{urls.length === 1 ? '' : 's'}
          {reportSelectable && urls.length > 0 ? ` · ${inReportCount} en reporte` : ''}
          {pendingCount > 0 && (
            <span style={{ marginLeft: 8, color: '#b45309', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <CloudOff size={12} /> {pendingCount} pend.
            </span>
          )}
        </span>
      </div>

      {canEdit && (
        <div className="ps-actions">
          {showUpload && photoConfig.allowUploadFromDevice && (
            <>
              <button type="button" className="ps-btn" disabled={busy}
                onClick={() => uploadRef.current?.click()}
                style={{ background: accent.soft, color: accent.main, borderColor: accent.border }}>
                <Upload size={18} /> Subir
              </button>
              <input ref={uploadRef} type="file" multiple accept="image/*" style={{ display: 'none' }}
                onChange={e => { onAddFiles(e.target.files); e.target.value = ''; }} />
            </>
          )}
          {showCamera && photoConfig.allowTakePhoto && (
            <>
              <button type="button" className="ps-btn" disabled={busy}
                onClick={() => cameraRef.current?.click()}
                style={{ background: accent.main, color: '#fff' }}>
                <Camera size={18} /> Cámara
              </button>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple
                style={{ display: 'none' }}
                onChange={e => { onAddFiles(e.target.files); e.target.value = ''; }} />
            </>
          )}
          {showExportPdf && (
            <button type="button" className="ps-btn" disabled={urls.length === 0}
              onClick={onExportPdf}
              style={{ background: '#fff', color: '#0f172a', borderColor: '#cbd5e1' }}>
              <Printer size={18} /> Reporte PDF
            </button>
          )}
        </div>
      )}

      {isCompressing && (
        <div className="ps-compress"><Loader2 size={15} className="spin" /> Optimizando imágenes…</div>
      )}

      {urls.length === 0 ? (
        <div className="ps-empty">Sin fotos todavía.</div>
      ) : (
        <div className="ps-grid">
          {urls.map((url, i) => {
            const excluded = excludedUrls.includes(url);
            return (
              <div key={`${url}-${i}`} className={`ps-thumb${excluded ? ' excluded' : ''}`}>
                <img src={url} alt={`${type} ${i + 1}`} loading="lazy" />
                {canEdit && (
                  <button type="button" className="ps-x" title="Eliminar" onClick={() => onRemove(i)}>
                    <X size={13} />
                  </button>
                )}
                {reportSelectable && onToggleReport && (
                  <button
                    type="button"
                    className="ps-report"
                    title={excluded ? 'Incluir en el reporte' : 'Quitar del reporte'}
                    onClick={() => onToggleReport(url)}
                    style={{
                      background: excluded ? 'rgba(100,116,139,.85)' : 'rgba(5,150,105,.9)',
                      color: '#fff',
                    }}
                  >
                    <Check size={12} /> {excluded ? 'Oculta' : 'En reporte'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}