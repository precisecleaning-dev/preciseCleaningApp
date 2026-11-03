// Vista previa del PDF de un invoice GUARDADO: lee sus fotos elegidas (en
// vivo) y las cruza con las del job antes de mostrar las páginas.
import { useMemo } from 'react';
import type { Invoice, Property } from '../../../types/index';
import { useInvoicePhotoSelection } from '../hooks/useInvoicePhotoSelection';
import { resolveInvoicePhotos } from '../invoicePhotos';
import { buildAllJobPhotoItems } from '../invoiceSnapshot';
import { buildPdfDataFromInvoice } from '../invoicePdf';
import InvoicePdfPreviewModal from './InvoicePdfPreviewModal';

interface SavedInvoicePdfPreviewProps {
  invoice: Invoice;
  /** Casa del job (null si no está en la ventana de 12 meses). */
  jobProperty: Property | null;
  onClose: () => void;
}

const SavedInvoicePdfPreview = ({ invoice, jobProperty, onClose }: SavedInvoicePdfPreviewProps) => {
  const { selection, isLoading } = useInvoicePhotoSelection(invoice.id);
  const data = useMemo(() => {
    if (isLoading) return null;
    const jobPhotos = jobProperty ? buildAllJobPhotoItems(jobProperty) : null;
    const { photos } = resolveInvoicePhotos(selection, jobPhotos, invoice.photos.include);
    return buildPdfDataFromInvoice(invoice, photos);
  }, [invoice, jobProperty, selection, isLoading]);

  return <InvoicePdfPreviewModal data={data} onClose={onClose} />;
};

export default SavedInvoicePdfPreview;
