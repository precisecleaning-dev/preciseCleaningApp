// src/features/invoices-new/invoicePdfFile.ts
// ============================================================================
// Genera y descarga el archivo PDF de un invoice. Las fotos se convierten a
// data URL antes (fetchImageAsDataUrl) para que salgan en el archivo.
// ============================================================================
import type { Invoice, Property } from '../../types/index';
import type { Branding } from '../../utils/companyBranding';
import { getBranding } from '../../utils/companyBranding';
import { generatePDFBlob } from '../../utils/pdfGenerator';
import { downloadBlob } from '../../shared/utils/downloadFile';
import { fetchImageAsDataUrl } from '../../shared/utils/imageDataUrl';
import { invoicesService } from '../../services/invoicesService';
import {
  buildInvoicePdfDocument, buildInvoicePdfPages, buildPdfDataFromInvoice, getInvoicePdfFileName, type InvoicePdfData,
} from './invoicePdf';
import { resolveInvoicePhotos } from './invoicePhotos';
import { buildAllJobPhotoItems } from './invoiceSnapshot';

/** Aviso cuando algunas fotos no entraron en el archivo. */
export const getMissingPhotosWarning = (missingPhotoCount: number): string =>
  `${missingPhotoCount} photo(s) could not be added to the PDF: their storage does not allow the app to read them (CORS).`;

/** Resultado de una descarga: fotos que no se pudieron incrustar. */
export interface InvoicePdfDownloadResult {
  missingPhotoCount: number;
}

/**
 * Arma el PDF y lo descarga. Lanza un error si no se pudo generar.
 * Una foto que no se puede leer desde la app (su servidor no lo permite: CORS)
 * NO se dibujaría en el archivo; va con el aviso "Photo could not be added" y
 * se cuenta en el resultado. La vista previa sí la muestra (un <img> no
 * necesita permiso), por eso se avisa al descargar.
 */
export const downloadInvoicePdf = async (data: InvoicePdfData, branding: Branding): Promise<InvoicePdfDownloadResult> => {
  const embeddedPhotos = await Promise.all(data.photos.map(async (photo) => {
    const dataUrl = await fetchImageAsDataUrl(photo.url);
    return { ...photo, url: dataUrl.startsWith('data:') ? dataUrl : '' };
  }));
  const missingPhotos = data.photos.filter((_photo, photoIndex) => !embeddedPhotos[photoIndex].url);
  if (missingPhotos.length > 0) {
    const missingHosts = [...new Set(missingPhotos.map((photo) => photo.url.split('/')[2] ?? photo.url))];
    console.warn(`${missingPhotos.length} photo(s) could not be embedded in the PDF. Check CORS for:`, missingHosts);
  }
  const fileData = { ...data, photos: embeddedPhotos };
  const pages = buildInvoicePdfPages(fileData, branding);
  const fileName = getInvoicePdfFileName(data);
  const pdfBlob = await generatePDFBlob(buildInvoicePdfDocument(fileData, pages), { filename: fileName, format: 'a4' });
  downloadBlob(pdfBlob, fileName);
  return { missingPhotoCount: missingPhotos.length };
};

/** Download PDF de un invoice guardado (menú de la fila): lee sus fotos y la marca. */
export const downloadSavedInvoicePdf = async (
  invoice: Invoice, jobProperty: Property | null,
): Promise<InvoicePdfDownloadResult> => {
  const [selection, branding] = await Promise.all([invoicesService.getPhotoSelection(invoice.id), getBranding()]);
  const jobPhotos = jobProperty ? buildAllJobPhotoItems(jobProperty) : null;
  const { photos } = resolveInvoicePhotos(selection, jobPhotos, invoice.photos.include);
  return downloadInvoicePdf(buildPdfDataFromInvoice(invoice, photos), branding);
};
