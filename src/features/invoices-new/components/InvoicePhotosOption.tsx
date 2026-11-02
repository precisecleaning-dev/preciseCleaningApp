// "Include before & after photos" del PDF. Por ahora incluye TODAS las fotos
// del job; la galería para elegir algunas llega en la etapa de fotos.
interface InvoicePhotosOptionProps {
  includePhotos: boolean;
  onIncludePhotosChange: (includePhotos: boolean) => void;
  beforeCount: number;
  afterCount: number;
  hasJob: boolean;
}

const InvoicePhotosOption = ({
  includePhotos, onIncludePhotosChange, beforeCount, afterCount, hasJob,
}: InvoicePhotosOptionProps) => {
  const photoCount = beforeCount + afterCount;
  const photoSummary = hasJob
    ? `All job photos · ${photoCount} (${beforeCount} before / ${afterCount} after)`
    : 'Select a job to see its photos.';

  return (
    <div className="invf-option-card">
      <label className="invf-option-row" htmlFor="invoice-include-photos">
        <input
          id="invoice-include-photos"
          type="checkbox"
          checked={includePhotos}
          onChange={(event) => onIncludePhotosChange(event.target.checked)}
        />
        <span className="invf-option-copy">
          <span className="invf-option-title">Include before &amp; after photos</span>
          <span className="invf-option-help">Before and after photos from the selected job appear in the invoice PDF.</span>
        </span>
      </label>
      {includePhotos && <p className="invf-option-summary">{photoSummary}</p>}
    </div>
  );
};

export default InvoicePhotosOption;
