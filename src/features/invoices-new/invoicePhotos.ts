// src/features/invoices-new/invoicePhotos.ts
// ============================================================================
// Qué fotos van en el PDF de un invoice guardado. Las fotos del job se
// identifican por URL (no tienen id):
//   · "All job photos"  → las fotos ACTUALES del job.
//   · "Selected photos" → las elegidas que el job todavía tiene.
// Sin el job cargado (fuera de la ventana de 12 meses) se usan las guardadas.
// ============================================================================
import type { InvoicePhotoItem, InvoicePhotoSelection } from '../../types/index';

export interface ResolvedInvoicePhotos {
  include: boolean;
  /** Fotos que van en el PDF (vacío si no se incluyen). */
  photos: InvoicePhotoItem[];
  /** Fotos elegidas que ya no están en el job. */
  missingCount: number;
}

export const resolveInvoicePhotos = (
  selection: InvoicePhotoSelection | null,
  jobPhotos: InvoicePhotoItem[] | null,
  includeFallback: boolean,
): ResolvedInvoicePhotos => {
  const include = selection?.include ?? includeFallback;
  const savedItems = selection?.items ?? [];
  if (!jobPhotos) return { include, photos: include ? savedItems : [], missingCount: 0 };
  if (selection?.mode === 'all') return { include, photos: include ? jobPhotos : [], missingCount: 0 };
  const jobPhotoUrls = new Set(jobPhotos.map((photo) => photo.url));
  const selectedItems = savedItems.filter((photo) => jobPhotoUrls.has(photo.url));
  return { include, photos: include ? selectedItems : [], missingCount: savedItems.length - selectedItems.length };
};

/** "Before 3" / "After 1". */
export const getPhotoLabel = (photo: InvoicePhotoItem): string =>
  `${photo.category === 'before' ? 'Before' : 'After'} ${photo.order + 1}`;
