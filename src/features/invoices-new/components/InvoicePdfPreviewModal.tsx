// Vista previa del PDF: una página a la vez (anterior / siguiente y "Page 2 of
// 5", que cuenta las páginas de notas y de fotos) y Download PDF. Cada página
// se dibuja en un iframe aislado con el MISMO HTML que va en el archivo.
// `data` null = todavía se están leyendo las fotos del invoice.
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useCompanyBranding } from '../../../shared/hooks/useCompanyBranding';
import { buildInvoicePdfPages, buildInvoicePdfPreviewPage, type InvoicePdfData } from '../invoicePdf';
import { downloadInvoicePdf, getMissingPhotosWarning } from '../invoicePdfFile';
import InvoiceDialog from './InvoiceDialog';
import './InvoicePdfPreviewModal.css';

interface InvoicePdfPreviewModalProps {
  data: InvoicePdfData | null;
  onClose: () => void;
}

const InvoicePdfPreviewModal = ({ data, onClose }: InvoicePdfPreviewModalProps) => {
  const branding = useCompanyBranding();
  const [pageIndex, setPageIndex] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [downloadWarning, setDownloadWarning] = useState('');
  const pages = useMemo(() => (data ? buildInvoicePdfPages(data, branding) : []), [data, branding]);
  const pageCount = pages.length;
  const currentPageIndex = Math.min(pageIndex, Math.max(0, pageCount - 1));
  const pageDocument = data && pages.length > 0 ? buildInvoicePdfPreviewPage(data, pages[currentPageIndex]) : '';
  const title = data?.number ? `Invoice ${data.number}` : 'Draft invoice';

  const handleDownload = async () => {
    if (!data || isDownloading) return;
    setIsDownloading(true);
    setDownloadError('');
    setDownloadWarning('');
    try {
      const { missingPhotoCount } = await downloadInvoicePdf(data, branding);
      if (missingPhotoCount > 0) setDownloadWarning(getMissingPhotosWarning(missingPhotoCount));
    } catch (error) {
      console.error('Could not create the PDF:', error);
      setDownloadError('Could not create the PDF. Check your connection and try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <InvoiceDialog title={title} subtitle="PDF preview" isCloseDisabled={isDownloading} onClose={onClose}>
      <div className="invd-body ipp-body">
        {data ? (
          <div className="ipp-page-scroll">
            <iframe className="ipp-page" title={`${title} · page ${currentPageIndex + 1}`} srcDoc={pageDocument} sandbox="" />
          </div>
        ) : (
          <span className="skel-line skel-row-main" aria-hidden="true" />
        )}
      </div>
      <footer className="invd-footer ipp-footer">
        {downloadError && <p className="invd-footer-error" role="alert">{downloadError}</p>}
        {downloadWarning && <p className="invd-footer-error" role="status">{downloadWarning}</p>}
        <div className="ipp-pager">
          <button
            type="button"
            className="invd-secondary-btn ipp-nav-btn"
            aria-label="Previous page"
            disabled={currentPageIndex === 0}
            onClick={() => setPageIndex(currentPageIndex - 1)}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <span className="ipp-counter" aria-live="polite">{`Page ${pageCount === 0 ? 0 : currentPageIndex + 1} of ${pageCount}`}</span>
          <button
            type="button"
            className="invd-secondary-btn ipp-nav-btn"
            aria-label="Next page"
            disabled={currentPageIndex >= pageCount - 1}
            onClick={() => setPageIndex(currentPageIndex + 1)}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        <button type="button" className="btn-primary invd-primary-btn" disabled={!data || isDownloading} onClick={handleDownload}>
          <Download size={16} aria-hidden="true" /> {isDownloading ? 'Preparing PDF…' : 'Download PDF'}
        </button>
      </footer>
    </InvoiceDialog>
  );
};

export default InvoicePdfPreviewModal;
