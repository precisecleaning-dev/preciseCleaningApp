// "Include before & after photos" del PDF: todas las fotos del job o solo las
// elegidas en la galería (Choose photos). Desactivar la inclusión esconde los
// controles pero conserva la selección. Lo usan el formulario y Manage photos.
import { useId, useState } from 'react';
import type { InvoicePhotoItem } from '../../../types/index';
import type { PhotoChoice } from '../hooks/usePhotoChoice';
import JobPhotoPickerModal from './JobPhotoPickerModal';

interface InvoicePhotosOptionProps {
  photoChoice: PhotoChoice;
  /** Fotos actuales del job (null = el job no está cargado). */
  jobPhotos: InvoicePhotoItem[] | null;
  /** Error de validación a mostrar (después de intentar guardar). */
  error?: string;
}

const InvoicePhotosOption = ({ photoChoice, jobPhotos, error }: InvoicePhotosOptionProps) => {
  const fieldIdPrefix = useId();
  const includeId = `${fieldIdPrefix}-include`;
  const modeId = `${fieldIdPrefix}-mode`;
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const availableCount = jobPhotos?.length ?? 0;
  const selectedCount = photoChoice.items.length;
  const summaryText = jobPhotos
    ? `${selectedCount} of ${availableCount} photos · ${photoChoice.beforeCount} before / ${photoChoice.afterCount} after`
    : 'Select a job to see its photos.';

  const handleApplyGallery = (selectedUrls: string[]) => {
    photoChoice.setSelectedUrls(selectedUrls);
    setIsGalleryOpen(false);
  };

  return (
    <div className="invf-option-card">
      <label className="invf-option-row" htmlFor={includeId}>
        <input
          id={includeId}
          type="checkbox"
          checked={photoChoice.include}
          onChange={(event) => photoChoice.setInclude(event.target.checked)}
        />
        <span className="invf-option-copy">
          <span className="invf-option-title">Include before &amp; after photos</span>
          <span className="invf-option-help">Before and after photos from the selected job appear in the invoice PDF.</span>
        </span>
      </label>
      {photoChoice.include && (
        <div className="invf-photo-controls">
          <label className="invn-sr-only" htmlFor={modeId}>Photos to include</label>
          <select
            id={modeId}
            className="invf-input invf-photo-mode"
            value={photoChoice.mode}
            disabled={!jobPhotos}
            onChange={(event) => photoChoice.setMode(event.target.value as 'all' | 'selected')}
          >
            <option value="all">All job photos</option>
            <option value="selected">Selected photos</option>
          </select>
          <span className="invf-option-summary">{summaryText}</span>
          {photoChoice.mode === 'selected' && (
            <button
              type="button"
              className="invf-text-btn"
              disabled={!jobPhotos || availableCount === 0}
              onClick={() => setIsGalleryOpen(true)}
            >
              Choose photos
            </button>
          )}
        </div>
      )}
      {error && <p className="invf-error" role="alert">{error}</p>}
      {isGalleryOpen && jobPhotos && (
        <JobPhotoPickerModal
          jobPhotos={jobPhotos}
          selectedUrls={photoChoice.selectedUrls}
          onCancel={() => setIsGalleryOpen(false)}
          onApply={handleApplyGallery}
        />
      )}
    </div>
  );
};

export default InvoicePhotosOption;
