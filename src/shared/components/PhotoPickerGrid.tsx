// src/shared/components/PhotoPickerGrid.tsx
// Galería para elegir fotos: filtro por categoría (All / Before / After…),
// miniaturas con su nombre y casilla, contador, "Select all in this category"
// y "Clear this category". Las miniaturas se cargan por bloques ("Show more
// photos") porque un job puede tener 50 fotos o más. La barra de categorías
// queda fija arriba al desplazarse.
import { useState } from 'react';
import { Check } from 'lucide-react';
import './PhotoPickerGrid.css';

export interface PickablePhoto {
  /** Identificador estable (la URL si la foto no tiene otro). */
  id: string;
  url: string;
  category: string;
  /** Nombre visible: "Before 3". */
  label: string;
}

interface PhotoPickerGridProps {
  photos: PickablePhoto[];
  categories: { key: string; label: string }[];
  selectedIds: string[];
  onSelectedIdsChange: (selectedIds: string[]) => void;
  /** Fotos por bloque (Show more photos). */
  blockSize?: number;
}

const ALL_CATEGORIES = 'all';

const PhotoPickerGrid = ({
  photos, categories, selectedIds, onSelectedIdsChange, blockSize = 18,
}: PhotoPickerGridProps) => {
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES);
  const [visibleCount, setVisibleCount] = useState(blockSize);
  const selectedIdSet = new Set(selectedIds);
  const categoryPhotos = activeCategory === ALL_CATEGORIES
    ? photos
    : photos.filter((photo) => photo.category === activeCategory);
  const visiblePhotos = categoryPhotos.slice(0, visibleCount);
  const hiddenCount = categoryPhotos.length - visiblePhotos.length;
  const filterOptions = [{ key: ALL_CATEGORIES, label: 'All' }, ...categories];
  const getCategoryCount = (categoryKey: string) =>
    (categoryKey === ALL_CATEGORIES ? photos.length : photos.filter((photo) => photo.category === categoryKey).length);

  const handleCategoryChange = (categoryKey: string) => {
    setActiveCategory(categoryKey);
    setVisibleCount(blockSize);
  };

  const handleTogglePhoto = (photoId: string) => {
    const nextIds = selectedIdSet.has(photoId)
      ? selectedIds.filter((selectedId) => selectedId !== photoId)
      : [...selectedIds, photoId];
    onSelectedIdsChange(nextIds);
  };

  const handleSelectCategory = () => {
    const categoryIds = categoryPhotos.map((photo) => photo.id).filter((photoId) => !selectedIdSet.has(photoId));
    onSelectedIdsChange([...selectedIds, ...categoryIds]);
  };

  const handleClearCategory = () => {
    const categoryIdSet = new Set(categoryPhotos.map((photo) => photo.id));
    onSelectedIdsChange(selectedIds.filter((selectedId) => !categoryIdSet.has(selectedId)));
  };

  return (
    <div className="ppg-wrap">
      <div className="ppg-toolbar">
        <div className="ppg-filters" role="group" aria-label="Photo category">
          {filterOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`ppg-filter${activeCategory === option.key ? ' active' : ''}`}
              aria-pressed={activeCategory === option.key}
              onClick={() => handleCategoryChange(option.key)}
            >
              {`${option.label} (${getCategoryCount(option.key)})`}
            </button>
          ))}
        </div>
        <div className="ppg-bulk">
          <span className="ppg-counter" aria-live="polite">{`${selectedIds.length} of ${photos.length} selected`}</span>
          <button type="button" className="ppg-link-btn" onClick={handleSelectCategory}>Select all in this category</button>
          <button type="button" className="ppg-link-btn" onClick={handleClearCategory}>Clear this category</button>
        </div>
      </div>

      {categoryPhotos.length === 0 && <p className="ppg-empty">No photos in this category.</p>}
      <ul className="ppg-grid">
        {visiblePhotos.map((photo) => {
          const isSelected = selectedIdSet.has(photo.id);
          return (
            <li key={photo.id}>
              <button
                type="button"
                className={`ppg-photo${isSelected ? ' selected' : ''}`}
                aria-pressed={isSelected}
                aria-label={`${photo.label}${isSelected ? ', selected' : ''}`}
                onClick={() => handleTogglePhoto(photo.id)}
              >
                <img className="ppg-image" src={photo.url} alt="" loading="lazy" />
                <span className="ppg-check" aria-hidden="true">{isSelected && <Check size={14} />}</span>
                <span className="ppg-label">{photo.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 && (
        <button type="button" className="ppg-more-btn" onClick={() => setVisibleCount((count) => count + blockSize)}>
          {`Show more photos (${hiddenCount} left)`}
        </button>
      )}
    </div>
  );
};

export default PhotoPickerGrid;
