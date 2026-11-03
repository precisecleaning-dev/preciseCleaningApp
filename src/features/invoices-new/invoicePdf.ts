// src/features/invoices-new/invoicePdf.ts
// ============================================================================
// HTML del PDF de un invoice, sin React. Las PÁGINAS se arman aquí para que la
// vista previa y el archivo descargado sean iguales:
//   · página 1: marca, datos del invoice, montos, enlace de pago y el inicio
//     de las notas;
//   · páginas de notas: lo que no cupo (las notas no se cortan ni se pierden);
//   · páginas de fotos: 6 por página (2 columnas × 3 filas) con Before / After.
// El archivo lo arma generatePDFBlob (utils/pdfGenerator.ts, html2pdf ya
// cargado por import dinámico): no se agrega jsPDF como dependencia.
// ⚠ Todo texto escrito por usuarios pasa por escapeHtml (hubo XSS en PDFs).
// ============================================================================
import type {
  Invoice, InvoiceClientSnapshot, InvoiceJobSnapshot, InvoicePaymentTerms, InvoicePhotoItem, InvoiceStatus, YmdDate,
} from '../../types/index';
import type { Branding } from '../../utils/companyBranding';
import { brandingHeaderHTML } from '../../utils/companyBranding';
import { escapeHtml } from '../../utils/escapeHtml';
import { formatDate, formatDateForFile } from '../../utils/dateFormat';
import { INVOICE_PAYMENT_TERM_LABELS, bpsToPercent, formatCents } from './invoiceMath';
import { INVOICE_STATUS_LABELS, isPaidStatus } from './invoiceStatus';
import { getPhotoLabel } from './invoicePhotos';

/** Lo que necesita el PDF (de un invoice guardado o del formulario). */
export interface InvoicePdfData {
  /** null = borrador (todavía sin número): el PDF dice DRAFT. */
  number: string | null;
  status: InvoiceStatus;
  client: InvoiceClientSnapshot;
  recipientEmail: string;
  job: InvoiceJobSnapshot;
  issueDate: YmdDate;
  paymentTerms: InvoicePaymentTerms;
  dueDate: YmdDate;
  subtotalCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
  notes: string[];
  paymentLinkUrl: string;
  photos: InvoicePhotoItem[];
}

// Capacidad aproximada de texto (Arial 12 px en el ancho de una A4). Se usa un
// margen amplio: es mejor una página de notas más que una nota cortada.
const CHARS_PER_LINE = 88;
const FIRST_PAGE_NOTE_LINES = 12;
const NOTE_PAGE_LINES = 46;
const PHOTOS_PER_PAGE = 6;

/** Una nota partida en renglones aproximados (respeta los saltos de línea). */
const splitNoteIntoLines = (noteText: string): string[] =>
  noteText.split('\n').flatMap((paragraph) => {
    if (paragraph.length <= CHARS_PER_LINE) return [paragraph];
    const words = paragraph.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    words.forEach((word) => {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (candidate.length > CHARS_PER_LINE && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = candidate;
      }
    });
    if (currentLine) lines.push(currentLine);
    return lines;
  });

/** Bloques de notas por página: [lo que va en la 1, lo de la 2, …]. Cada
 *  bloque es una lista de notas (o pedazos de nota) con sus renglones. */
const paginateNotes = (notes: string[]): string[][][] => {
  const pages: string[][][] = [[]];
  let freeLines = FIRST_PAGE_NOTE_LINES;
  notes.forEach((noteText) => {
    let pendingLines = splitNoteIntoLines(noteText);
    while (pendingLines.length > 0) {
      if (freeLines <= 1) {
        pages.push([]);
        freeLines = NOTE_PAGE_LINES;
      }
      const fittingLines = pendingLines.slice(0, freeLines - 1);
      pages[pages.length - 1].push(fittingLines);
      freeLines -= fittingLines.length + 1;
      pendingLines = pendingLines.slice(fittingLines.length);
    }
  });
  return pages;
};

const notesHtml = (noteBlocks: string[][]): string =>
  noteBlocks
    .map((noteLines) => `<p class="note">${noteLines.map(escapeHtml).join('<br />')}</p>`)
    .join('');

const factHtml = (label: string, value: string): string =>
  `<div class="fact"><div class="fact-label">${escapeHtml(label)}</div><div class="fact-value">${escapeHtml(value)}</div></div>`;

const amountRowHtml = (label: string, value: string, className = ''): string =>
  `<tr class="${className}"><td>${escapeHtml(label)}</td><td class="money">${escapeHtml(value)}</td></tr>`;

const firstPageHtml = (data: InvoicePdfData, branding: Branding, firstNoteBlocks: string[][]): string => {
  const isPaid = isPaidStatus(data.status);
  const balanceCents = isPaid ? 0 : data.totalCents;
  const clientLines = [data.recipientEmail || data.client.email, data.client.phone, data.client.address, data.client.cityStateZip]
    .filter(Boolean);
  const jobLines = [[data.job.address, data.job.unit].filter(Boolean).join(' · '), data.job.city].filter(Boolean);
  const serviceName = data.job.serviceName || 'Cleaning service';
  const paymentLink = !isPaid && data.paymentLinkUrl
    ? `<div class="pay-link"><strong>Pay online:</strong> ${escapeHtml(data.paymentLinkUrl)}</div>`
    : '';
  const notesSection = firstNoteBlocks.length > 0 ? `<h3>Notes</h3>${notesHtml(firstNoteBlocks)}` : '';

  return `
    ${brandingHeaderHTML(branding)}
    <div class="title-row">
      <div>
        <span class="doc-tag">${data.number ? 'Invoice' : 'Draft'}</span>
        <div class="doc-title">${data.number ? `Invoice ${escapeHtml(data.number)}` : 'DRAFT invoice'}</div>
        <div class="doc-status">${escapeHtml(INVOICE_STATUS_LABELS[data.status])}</div>
      </div>
      <div class="total-box">
        <div class="total-label">Balance due</div>
        <div class="total-value">${escapeHtml(formatCents(balanceCents))}</div>
      </div>
    </div>
    <div class="parties">
      <div class="party">
        <div class="fact-label">Bill to</div>
        <div class="party-name">${escapeHtml(data.client.name || 'Client')}</div>
        ${clientLines.map((line) => `<div class="party-line">${escapeHtml(line)}</div>`).join('')}
      </div>
      <div class="party">
        <div class="fact-label">Job</div>
        <div class="party-name">${escapeHtml(serviceName)}</div>
        ${jobLines.map((line) => `<div class="party-line">${escapeHtml(line)}</div>`).join('')}
      </div>
    </div>
    <div class="facts">
      ${factHtml('Service date', data.job.serviceDate ? formatDate(data.job.serviceDate) : '—')}
      ${factHtml('Issue date', formatDate(data.issueDate))}
      ${factHtml('Due date', formatDate(data.dueDate))}
      ${factHtml('Terms', INVOICE_PAYMENT_TERM_LABELS[data.paymentTerms])}
    </div>
    <table class="items">
      <thead><tr><th>Description</th><th class="qty">Qty</th><th class="money">Amount</th></tr></thead>
      <tbody><tr><td>${escapeHtml(serviceName)}${data.job.address ? ` · ${escapeHtml(data.job.address)}` : ''}</td><td class="qty">1</td><td class="money">${escapeHtml(formatCents(data.subtotalCents))}</td></tr></tbody>
    </table>
    <table class="totals">
      ${amountRowHtml('Subtotal', formatCents(data.subtotalCents))}
      ${amountRowHtml(`Tax (${bpsToPercent(data.taxRateBps)}%)`, formatCents(data.taxCents))}
      ${amountRowHtml('Total (USD)', formatCents(data.totalCents), 'grand')}
      ${amountRowHtml('Balance due', formatCents(balanceCents), 'balance')}
    </table>
    ${paymentLink}
    ${notesSection}
  `;
};

const notesPageHtml = (noteBlocks: string[][], pageLabel: string): string =>
  `<h3>Notes <span class="muted">${escapeHtml(pageLabel)}</span></h3>${notesHtml(noteBlocks)}`;

/** Marco de una foto. URL vacía = no se pudo incrustar en el archivo (su
 *  servidor no permite leerla desde la app): se dice en vez de dejar el cuadro en blanco. */
const photoFrameHtml = (photo: InvoicePhotoItem): string =>
  (photo.url
    ? `<div class="photo-frame"><img src="${escapeHtml(photo.url)}" alt="" /></div>`
    : '<div class="photo-frame photo-missing">Photo could not be added</div>');

const photosPageHtml = (pagePhotos: InvoicePhotoItem[], pageLabel: string): string => `
  <h3>Job photos <span class="muted">${escapeHtml(pageLabel)}</span></h3>
  <div class="photos">
    ${pagePhotos.map((photo) => `
      <div class="photo-item">
        ${photoFrameHtml(photo)}
        <div class="photo-label">${escapeHtml(getPhotoLabel(photo))}</div>
      </div>`).join('')}
  </div>
`;

/** Contenido (cuerpo HTML) de cada página, en orden. */
export const buildInvoicePdfPages = (data: InvoicePdfData, branding: Branding): string[] => {
  const notePages = paginateNotes(data.notes.filter((noteText) => noteText.trim() !== ''));
  const photoPageCount = Math.ceil(data.photos.length / PHOTOS_PER_PAGE);
  const extraNotePages = notePages.slice(1);
  const pages = [firstPageHtml(data, branding, notePages[0] ?? [])];
  extraNotePages.forEach((noteBlocks, index) => {
    pages.push(notesPageHtml(noteBlocks, `(continued ${index + 1} of ${extraNotePages.length})`));
  });
  for (let photoPageIndex = 0; photoPageIndex < photoPageCount; photoPageIndex += 1) {
    const pagePhotos = data.photos.slice(photoPageIndex * PHOTOS_PER_PAGE, (photoPageIndex + 1) * PHOTOS_PER_PAGE);
    pages.push(photosPageHtml(pagePhotos, `(${photoPageIndex + 1} of ${photoPageCount})`));
  }
  return pages;
};

// ⚠ El <style> va DENTRO del <body> y todo cuelga de `.invpdf`: generatePDFBlob
//   escribe el HTML en un iframe, pero html2pdf copia solo el <body> a la
//   página principal para fotografiarlo. Un <style> en el <head> se pierde (el
//   PDF salía sin formato y con una foto gigante por página) y uno sin prefijo
//   cambiaría el resto de la app mientras se genera el archivo.
// ⚠ html2pdf 0.14 dibuja directo en el PDF (toContext2d): un contenedor con
//   `overflow: hidden` + `border-radius` recorta todo lo de adentro (las fotos
//   desaparecían). El marco de las fotos NO lleva overflow ni esquinas; el
//   tamaño lo limitan max-width / max-height de la imagen. Y el texto de una
//   pastilla se dibuja bajo con line-height "normal": las pastillas llevan
//   altura y line-height fijos (doc-tag).
const PDF_STYLES = `
  .invpdf, .invpdf * { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
  .invpdf { background: #ffffff; color: #0f172a; font-size: 12px; line-height: 1.4; width: 100%; }
  .invpdf .page { padding: 4px 2px; position: relative; }
  .invpdf .page + .page { page-break-before: always; break-before: page; }
  .invpdf .draft-mark { position: absolute; top: 380px; left: 0; right: 0; text-align: center; font-size: 110px; font-weight: 800; color: rgba(29, 63, 207, 0.07); transform: rotate(-24deg); pointer-events: none; }
  .invpdf h3 { font-size: 14px; margin: 22px 0 10px; color: #1e3a8a; }
  .invpdf .muted { color: #64748b; font-size: 11px; font-weight: 400; }
  .invpdf .title-row { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 22px; }
  .invpdf .doc-tag { display: inline-block; height: 24px; line-height: 24px; padding: 0 12px; margin-bottom: 8px; border: 1px solid #bfdbfe; border-radius: 12px; background: #eff6ff; color: #1e40af; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
  .invpdf .doc-title { font-size: 22px; font-weight: 800; line-height: 1.2; }
  .invpdf .doc-status { margin-top: 4px; color: #475569; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
  .invpdf .total-box { text-align: right; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 10px 16px; }
  .invpdf .total-label { font-size: 11px; color: #1e40af; font-weight: 700; text-transform: uppercase; }
  .invpdf .total-value { font-size: 22px; font-weight: 800; color: #1e3a8a; }
  .invpdf .parties { display: flex; gap: 20px; margin-top: 20px; }
  .invpdf .party { flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; }
  .invpdf .party-name { font-size: 14px; font-weight: 700; margin-top: 4px; }
  .invpdf .party-line { color: #475569; margin-top: 2px; word-break: break-word; }
  .invpdf .facts { display: flex; gap: 12px; margin-top: 16px; }
  .invpdf .fact { flex: 1; background: #f8fafc; border-radius: 8px; padding: 8px 10px; }
  .invpdf .fact-label { font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
  .invpdf .fact-value { font-size: 12px; font-weight: 700; margin-top: 3px; }
  .invpdf table { width: 100%; border-collapse: collapse; }
  .invpdf .items { margin-top: 20px; }
  .invpdf .items th { text-align: left; font-size: 10px; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; padding: 6px 4px; }
  .invpdf .items td { border-bottom: 1px solid #e2e8f0; padding: 10px 4px; }
  .invpdf .qty { text-align: center; width: 60px; }
  .invpdf .money { text-align: right; white-space: nowrap; }
  .invpdf .totals { width: 280px; margin: 14px 0 0 auto; }
  .invpdf .totals td { padding: 5px 4px; }
  .invpdf .totals .grand td { border-top: 1px solid #cbd5e1; font-weight: 800; font-size: 13px; }
  .invpdf .totals .balance td { color: #1e40af; font-weight: 800; }
  .invpdf .pay-link { margin-top: 16px; padding: 10px 12px; border: 1px dashed #93c5fd; border-radius: 8px; word-break: break-all; }
  .invpdf .note { margin: 0 0 10px; line-height: 1.5; white-space: normal; word-break: break-word; }
  .invpdf .photos { display: flex; flex-wrap: wrap; gap: 14px; }
  .invpdf .photo-item { width: calc(50% - 7px); }
  .invpdf .photo-frame { height: 250px; border: 1px solid #e2e8f0; background: #f8fafc; display: flex; align-items: center; justify-content: center; }
  .invpdf .photo-frame img { display: block; height: auto; max-height: 246px; max-width: 100%; width: auto; }
  .invpdf .photo-missing { color: #94a3b8; font-size: 12px; font-weight: 700; }
  .invpdf .photo-label { margin-top: 4px; font-size: 11px; font-weight: 700; color: #334155; }
`;

const pageWrapper = (pageContent: string, isDraft: boolean): string =>
  `<div class="page">${isDraft ? '<div class="draft-mark">DRAFT</div>' : ''}${pageContent}</div>`;

const documentHtml = (bodyHtml: string, title: string): string =>
  `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title></head>`
  + `<body style="margin:0;background:#ffffff;"><div class="invpdf"><style>${PDF_STYLES}</style>${bodyHtml}</div></body></html>`;

/** Documento completo (todas las páginas) para generatePDFBlob. */
export const buildInvoicePdfDocument = (data: InvoicePdfData, pages: string[]): string =>
  documentHtml(pages.map((page) => pageWrapper(page, !data.number)).join(''), data.number ?? 'Draft invoice');

/** Documento de UNA página para la vista previa. */
export const buildInvoicePdfPreviewPage = (data: InvoicePdfData, page: string): string =>
  documentHtml(pageWrapper(page, !data.number), data.number ?? 'Draft invoice');

/** Datos del PDF de un invoice guardado (las fotos ya resueltas con resolveInvoicePhotos). */
export const buildPdfDataFromInvoice = (invoice: Invoice, photos: InvoicePhotoItem[]): InvoicePdfData => ({
  number: invoice.number,
  status: invoice.status,
  client: invoice.client,
  recipientEmail: invoice.recipientEmail,
  job: invoice.job,
  issueDate: invoice.issueDate,
  paymentTerms: invoice.paymentTerms,
  dueDate: invoice.dueDate,
  subtotalCents: invoice.subtotalCents,
  taxRateBps: invoice.taxRateBps,
  taxCents: invoice.taxCents,
  totalCents: invoice.totalCents,
  notes: invoice.notes.map((note) => note.text),
  paymentLinkUrl: invoice.paymentLinkUrl,
  photos,
});

/** Nombre del archivo: Invoice_INV-2026-0001_11-02-2026.pdf (o Invoice_DRAFT_…). */
export const getInvoicePdfFileName = (data: InvoicePdfData): string =>
  `Invoice_${data.number ?? 'DRAFT'}_${formatDateForFile(data.issueDate)}.pdf`;
