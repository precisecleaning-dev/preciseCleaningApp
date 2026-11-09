// src/features/invoices-new/invoicePdfFile.ts
// ============================================================================
// Genera el archivo PDF de un invoice (para descargarlo o para adjuntarlo al
// correo). Las fotos se convierten a data URL antes (fetchImageAsDataUrl) para
// que salgan en el archivo.
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

/** Un PDF generado y las fotos que no se pudieron incrustar. */
export interface InvoicePdfFile {
  blob: Blob;
  fileName: string;
  missingPhotoCount: number;
}

/** Resultado de una descarga: fotos que no se pudieron incrustar. */
export interface InvoicePdfDownloadResult {
  missingPhotoCount: number;
}

/**
 * Arma el PDF. Lanza un error si no se pudo generar.
 * Una foto que no se puede leer desde la app (su servidor no lo permite: CORS)
 * NO se dibujaría en el archivo; va con el aviso "Photo could not be added" y
 * se cuenta en el resultado. La vista previa sí la muestra (un <img> no
 * necesita permiso), por eso se avisa al descargar o enviar.
 */
export const createInvoicePdfFile = async (data: InvoicePdfData, branding: Branding): Promise<InvoicePdfFile> => {
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
  const blob = await generatePDFBlob(buildInvoicePdfDocument(fileData, pages), { filename: fileName, format: 'a4' });
  return { blob, fileName, missingPhotoCount: missingPhotos.length };
};

/** PDF de un invoice GUARDADO: lee sus fotos elegidas y la marca de la empresa. */
export const createSavedInvoicePdfFile = async (invoice: Invoice, jobProperty: Property | null): Promise<InvoicePdfFile> => {
  const [selection, branding] = await Promise.all([invoicesService.getPhotoSelection(invoice.id), getBranding()]);
  const jobPhotos = jobProperty ? buildAllJobPhotoItems(jobProperty) : null;
  const { photos } = resolveInvoicePhotos(selection, jobPhotos, invoice.photos.include);
  return createInvoicePdfFile(buildPdfDataFromInvoice(invoice, photos), branding);
};

/** Arma el PDF y lo descarga. */
export const downloadInvoicePdf = async (data: InvoicePdfData, branding: Branding): Promise<InvoicePdfDownloadResult> => {
  const pdfFile = await createInvoicePdfFile(data, branding);
  downloadBlob(pdfFile.blob, pdfFile.fileName);
  return { missingPhotoCount: pdfFile.missingPhotoCount };
};

/** Download PDF de un invoice guardado (menú de la fila y detalle). */
export const downloadSavedInvoicePdf = async (
  invoice: Invoice, jobProperty: Property | null,
): Promise<InvoicePdfDownloadResult> => {
  const pdfFile = await createSavedInvoicePdfFile(invoice, jobProperty);
  downloadBlob(pdfFile.blob, pdfFile.fileName);
  return { missingPhotoCount: pdfFile.missingPhotoCount };
};
