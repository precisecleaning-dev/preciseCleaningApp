import { useRef } from 'react';
import { Upload, Camera, Printer, Loader2, X, Check, CloudOff } from 'lucide-react';
import type { PhotoConfig } from '../services/photoConfigService';
import './PhotoSection.css';

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

export default function PhotoSection({
  label, type, urls, excludedUrls = [], pendingCount = 0,
  canEdit = true, isSaving, isCompressing, photoConfig,
  showUpload = true, showCamera = true, showExportPdf = false,
  reportSelectable = false,
  onAddFiles, onRemove, onToggleReport, onExportPdf,
}: PhotoSectionProps) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const busy = isSaving || isCompressing;

  const inReportCount = urls.filter(u => !excludedUrls.includes(u)).length;

  return (
    <div className={`photo-section ${type}`}>
      <div className="ps-head">
        <span className="ps-title">
          <span className="ps-dot" />
          {label} Photos
        </span>
        <span className="ps-count">
          {urls.length} foto{urls.length === 1 ? '' : 's'}
          {reportSelectable && urls.length > 0 ? ` · ${inReportCount} en reporte` : ''}
          {pendingCount > 0 && (
            <span className="ps-pending">
              <CloudOff size={12} /> {pendingCount} pend.
            </span>
          )}
        </span>
      </div>

      {canEdit && (
        <div className="ps-actions">
          {showUpload && photoConfig.allowUploadFromDevice && (
            <>
              <button type="button" className="ps-btn ps-btn-upload" disabled={busy}
                onClick={() => uploadRef.current?.click()}>
                <Upload size={18} /> Subir
              </button>
              <input ref={uploadRef} type="file" multiple accept="image/*" className="ps-hidden-input"
                onChange={e => { onAddFiles(e.target.files); e.target.value = ''; }} />
            </>
          )}
          {showCamera && photoConfig.allowTakePhoto && (
            <>
              <button type="button" className="ps-btn ps-btn-camera" disabled={busy}
                onClick={() => cameraRef.current?.click()}>
                <Camera size={18} /> Cámara
              </button>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple
                className="ps-hidden-input"
                onChange={e => { onAddFiles(e.target.files); e.target.value = ''; }} />
            </>
          )}
          {showExportPdf && (
            <button type="button" className="ps-btn ps-btn-pdf" disabled={urls.length === 0}
              onClick={onExportPdf}>
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
                    className={`ps-report ${excluded ? 'excluded' : 'included'}`}
                    title={excluded ? 'Incluir en el reporte' : 'Quitar del reporte'}
                    onClick={() => onToggleReport(url)}
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