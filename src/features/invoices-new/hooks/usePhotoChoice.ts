// src/features/invoices-new/hooks/usePhotoChoice.ts
// ============================================================================
// Qué fotos del job van al PDF: incluir sí/no, "All job photos" o "Selected
// photos" y cuáles. Lo usan el formulario y Manage photos del detalle.
//
// Mientras el usuario no toca nada, vale lo guardado (`saved`, que puede
// llegar después) o lo de siempre (incluir, todas): se deriva en el render,
// sin efecto que lo copie. La selección se cruza con las fotos ACTUALES del
// job: una foto borrada del job ya no aparece.
// ============================================================================
import { useState } from 'react';
import type { InvoicePhotoItem, InvoicePhotoSelectionInput } from '../../../types/index';

type PhotoMode = InvoicePhotoSelectionInput['mode'];

interface PhotoChoiceOverrides {
  include?: boolean;
  mode?: PhotoMode;
  selectedUrls?: string[];
}

/** Lo que devuelve usePhotoChoice (lo reciben los componentes de fotos). */
export type PhotoChoice = ReturnType<typeof usePhotoChoice>;

export function usePhotoChoice(saved: InvoicePhotoSelectionInput | null, jobPhotos: InvoicePhotoItem[]) {
  const [overrides, setOverrides] = useState<PhotoChoiceOverrides>({});

  const include = overrides.include ?? saved?.include ?? true;
  const mode = overrides.mode ?? saved?.mode ?? 'all';
  const selectedUrls = overrides.selectedUrls ?? saved?.items.map((photo) => photo.url) ?? [];
  const selectedUrlSet = new Set(selectedUrls);
  const items = mode === 'all' ? jobPhotos : jobPhotos.filter((photo) => selectedUrlSet.has(photo.url));
  const hasNoSelectedPhotos = include && mode === 'selected' && items.length === 0;
  const savedUrls = saved?.items.map((photo) => photo.url).join('|') ?? '';
  const isChanged = !saved || include !== saved.include || mode !== saved.mode
    || items.map((photo) => photo.url).join('|') !== savedUrls;

  return {
    include,
    mode,
    selectedUrls,
    /** Fotos que se guardan (se conservan aunque se desactive la inclusión). */
    items,
    beforeCount: items.filter((photo) => photo.category === 'before').length,
    afterCount: items.filter((photo) => photo.category === 'after').length,
    error: hasNoSelectedPhotos ? 'Choose at least one photo, or turn off "Include before & after photos".' : '',
    /** ¿Difiere de lo guardado? (al editar, solo entonces se guarda) */
    isChanged,
    /** Lo que recibe el service. */
    toInput: (): InvoicePhotoSelectionInput => ({ include, mode, items }),
    setInclude: (nextInclude: boolean) => setOverrides((current) => ({ ...current, include: nextInclude })),
    setMode: (nextMode: PhotoMode) => setOverrides((current) => ({ ...current, mode: nextMode })),
    setSelectedUrls: (nextUrls: string[]) => setOverrides((current) => ({ ...current, selectedUrls: nextUrls })),
    /** Otro job: la selección vuelve a "todas" las fotos de ese job. */
    resetForNewJob: () => setOverrides((current) => ({ ...current, mode: 'all', selectedUrls: [] })),
  };
}
