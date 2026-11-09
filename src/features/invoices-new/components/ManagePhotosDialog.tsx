// Manage photos (detalle): cambia qué fotos del job van en el PDF. Guarda la
// selección y su evento en Activity (invoicesService.updatePhotoSelection).
import { useState } from 'react';
import type { Invoice, InvoicePhotoItem, InvoicePhotoSelection, SystemUser } from '../../../types/index';
import { invoicesService } from '../../../services/invoicesService';
import { fullName } from '../../../utils/homeData';
import { usePhotoChoice } from '../hooks/usePhotoChoice';
import InvoiceDialog from './InvoiceDialog';
import InvoicePhotosOption from './InvoicePhotosOption';

interface ManagePhotosDialogProps {
  invoice: Invoice;
  savedSelection: InvoicePhotoSelection | null;
  jobPhotos: InvoicePhotoItem[];
  currentUser: SystemUser | null;
  onClose: () => void;
}

const ManagePhotosDialog = ({ invoice, savedSelection, jobPhotos, currentUser, onClose }: ManagePhotosDialogProps) => {
  const photoChoice = usePhotoChoice(savedSelection, jobPhotos);
  const [hasTriedSave, setHasTriedSave] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const handleSave = async () => {
    setHasTriedSave(true);
    if (photoChoice.error || isSaving) return;
    if (!photoChoice.isChanged) {
      onClose();
      return;
    }
    if (!currentUser) {
      setSaveError('Your user profile is not loaded. Reload the app and try again.');
      return;
    }
    setIsSaving(true);
    setSaveError('');
    try {
      await invoicesService.updatePhotoSelection(invoice.id, photoChoice.toInput(), {
        id: currentUser.id, name: fullName(currentUser),
      });
      onClose();
    } catch (error) {
      console.error('Could not save the photos:', error);
      // El service explica algunos casos (p. ej. un invoice que pasó a la papelera).
      const detail = error instanceof Error ? error.message : '';
      setSaveError(['Could not save the photos.', detail, 'Check your connection and try again.'].filter(Boolean).join(' '));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <InvoiceDialog
      title="Manage photos"
      subtitle={`${invoice.number} · ${invoice.job.address}`}
      size="narrow"
      isCloseDisabled={isSaving}
      onClose={onClose}
    >
      <div className="invd-body">
        <InvoicePhotosOption photoChoice={photoChoice} jobPhotos={jobPhotos} error={hasTriedSave ? photoChoice.error : ''} />
      </div>
      <footer className="invd-footer">
        {saveError && <p className="invd-footer-error" role="alert">{saveError}</p>}
        <button type="button" className="invd-secondary-btn" disabled={isSaving} onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary invd-primary-btn" disabled={isSaving} onClick={handleSave}>
          {isSaving ? 'Saving…' : 'Save photos'}
        </button>
      </footer>
    </InvoiceDialog>
  );
};

export default ManagePhotosDialog;
