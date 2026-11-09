// src/shared/hooks/useCompanyBranding.ts
// ============================================================================
// Marca de la empresa (logo, nombre, contacto) para documentos: arranca con la
// copia en caché (render inmediato) y se actualiza con la de Firestore.
// ============================================================================
import { useEffect, useState } from 'react';
import { getBranding, getCachedBranding, type Branding } from '../../utils/companyBranding';

export function useCompanyBranding(): Branding {
  const [branding, setBranding] = useState<Branding>(getCachedBranding);

  useEffect(() => {
    let isCurrent = true;
    const loadBranding = async () => {
      try {
        const freshBranding = await getBranding();
        if (isCurrent) setBranding(freshBranding);
      } catch (error) {
        console.error('Could not load the company branding:', error);
      }
    };
    loadBranding();
    return () => {
      isCurrent = false;
    };
  }, []);

  return branding;
}
