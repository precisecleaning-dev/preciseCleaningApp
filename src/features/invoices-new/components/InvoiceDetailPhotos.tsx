// Detalle · fotos del PDF: resumen, miniaturas y Manage photos (con Edit y con
// el job cargado). Qué fotos van lo decide resolveInvoicePhotos (invoicePhotos.ts),
// lo mismo que usa el PDF.
import { useState } from 'react';
import type { Invoice, Property, SystemUser } from '../../../types/index';
import { buildAllJobPhotoItems } from '../invoiceSnapshot';
import { getPhotoLabel, resolveInvoicePhotos } from '../invoicePhotos';
import { useInvoicePhotoSelection } from '../hooks/useInvoicePhotoSelection';
import ManagePhotosDialog from './ManagePhotosDialog';

const THUMBNAIL_LIMIT = 8;

interface InvoiceDetailPhotosProps {
  invoice: Invoice;
  /** Casa del job (null si no está en la ventana de 12 meses). */
  jobProperty: Property | null;
  canEdit: boolean;
  currentUser: SystemUser | null;
}

const InvoiceDetailPhotos = ({ invoice, jobProperty, canEdit, currentUser }: InvoiceDetailPhotosProps) => {
  const [isManageOpen, setIsManageOpen] = useState(false);
  const { selection, isLoading, hasError } = useInvoicePhotoSelection(invoice.id);
  const jobPhotos = jobProperty ? buildAllJobPhotoItems(jobProperty) : null;
  const { include: isIncluded, photos: shownPhotos, missingCount } = resolveInvoicePhotos(
    selection, jobPhotos, invoice.photos.include,
  );
  const beforeCount = shownPhotos.filter((photo) => photo.category === 'before').length;
  const summaryText = isIncluded
    ? `${shownPhotos.length} photo(s) in the PDF · ${beforeCount} before / ${shownPhotos.length - beforeCount} after`
    : 'Photos are not included in the PDF.';
  const hiddenThumbnailCount = shownPhotos.length - THUMBNAIL_LIMIT;

  if (isLoading) return <span className="skel-line skel-row-main" aria-hidden="true" />;

  return (
    <div className="invdt-photos">
      <div className="invdt-photos-head">
        <span>{summaryText}</span>
        {canEdit && jobPhotos && (
          <button type="button" className="invf-text-btn" onClick={() => setIsManageOpen(true)}>Manage photos</button>
        )}
      </div>
      {hasError && <p className="invf-error" role="alert">Could not load the selected photos.</p>}
      {!jobProperty && <p className="invdt-secondary">The job is outside the last 12 months: load the full history to manage its photos.</p>}
      {missingCount > 0 && <p className="invf-warning">{`${missingCount} selected photo(s) were removed from the job.`}</p>}
      {isIncluded && shownPhotos.length > 0 && (
        <ul className="invdt-thumbnails">
          {shownPhotos.slice(0, THUMBNAIL_LIMIT).map((photo) => (
            <li key={photo.url}>
              <img className="invdt-thumbnail" src={photo.url} alt={getPhotoLabel(photo)} loading="lazy" />
            </li>
          ))}
          {hiddenThumbnailCount > 0 && <li className="invdt-thumbnail-more">{`+${hiddenThumbnailCount}`}</li>}
        </ul>
      )}
      {isManageOpen && jobPhotos && (
        <ManagePhotosDialog
          invoice={invoice}
          savedSelection={selection}
          jobPhotos={jobPhotos}
          currentUser={currentUser}
          onClose={() => setIsManageOpen(false)}
        />
      )}
    </div>
  );
};

export default InvoiceDetailPhotos;
