// src/shared/components/BusinessTabs.tsx
// Pestañas Normal / Cavalry. La empresa elegida es una sola para toda la app
// (useBusiness): cambiarla aquí la cambia en las demás pantallas.
import { BUSINESSES, type BusinessName } from '../utils/businesses';
import { setBusiness, useBusiness } from '../hooks/useBusiness';
import './BusinessTabs.css';

interface BusinessTabsProps {
  /** Elementos de cada empresa en la pantalla; sin conteo si no se pasa. */
  counts?: Record<BusinessName, number>;
}

export default function BusinessTabs({ counts }: BusinessTabsProps) {
  const business = useBusiness();
  return (
    <div className="biz-tabs" role="tablist" aria-label="Business">
      {BUSINESSES.map((b) => (
        <button
          key={b}
          type="button"
          role="tab"
          aria-selected={business === b}
          className={`biz-tab${business === b ? ' active' : ''}`}
          onClick={() => setBusiness(b)}
        >
          {b}
          {counts && <span className="biz-tab-count">{counts[b]}</span>}
        </button>
      ))}
    </div>
  );
}
