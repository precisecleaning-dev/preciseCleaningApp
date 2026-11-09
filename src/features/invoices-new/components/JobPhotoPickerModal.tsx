// Galería para elegir las fotos del job que van en el PDF. Los cambios son
// provisionales: Cancel conserva la selección anterior y "Use selected photos"
// la aplica (con al menos una foto).
import { useState } from 'react';
import type { InvoicePhotoItem } from '../../../types/index';
import PhotoPickerGrid, { type PickablePhoto } from '../../../shared/components/PhotoPickerGrid';
import { getPhotoLabel } from '../invoicePhotos';
import InvoiceDialog from './InvoiceDialog';

const PHOTO_CATEGORIES = [
  { key: 'before', label: 'Before' },
  { key: 'after', label: 'After' },
];

const toPickablePhoto = (photo: InvoicePhotoItem): PickablePhoto => ({
  id: photo.url,
  url: photo.url,
  category: photo.category,
  label: getPhotoLabel(photo),
});

interface JobPhotoPickerModalProps {
  jobPhotos: InvoicePhotoItem[];
  selectedUrls: string[];
  onCancel: () => void;
  onApply: (selectedUrls: string[]) => void;
}

const JobPhotoPickerModal = ({ jobPhotos, selectedUrls, onCancel, onApply }: JobPhotoPickerModalProps) => {
  const [draftUrls, setDraftUrls] = useState(selectedUrls);
  const [hasTriedApply, setHasTriedApply] = useState(false);
  const pickablePhotos = jobPhotos.map(toPickablePhoto);
  const isSelectionEmpty = draftUrls.length === 0;

  const handleApply = () => {
    setHasTriedApply(true);
    if (isSelectionEmpty) return;
    onApply(draftUrls);
  };

  return (
    <InvoiceDialog title="Choose photos" subtitle="Select the job photos that appear in the invoice PDF." onClose={onCancel}>
      <div className="invd-body">
        <PhotoPickerGrid
          photos={pickablePhotos}
          categories={PHOTO_CATEGORIES}
          selectedIds={draftUrls}
          onSelectedIdsChange={setDraftUrls}
        />
      </div>
      <footer className="invd-footer">
        {hasTriedApply && isSelectionEmpty && (
          <p className="invd-footer-error" role="alert">Select at least one photo, or turn off the photos in the invoice.</p>
        )}
        <button type="button" className="invd-secondary-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn-primary invd-primary-btn" onClick={handleApply}>Use selected photos</button>
      </footer>
    </InvoiceDialog>
  );
};

export default JobPhotoPickerModal;
