import { getCompanySettings, getCachedCompanySettings, type CompanyConfig } from '../services/companyService';

/* =========================================================================
   BRANDING PARA DOCUMENTOS
   Helpers que cualquier generador (PDF/HTML: Quality Check, nómina, facturas,
   etc.) puede usar para colocar el MISMO logo y datos de empresa.

   Uso típico en un generador HTML:
     const b = await getBranding();
     const html = `... ${brandingHeaderHTML(b, 'Reporte')} ...
                   <div class="footer">${brandingFooterHTML(b)}</div> ...`;
   ========================================================================= */

export interface Branding {
  name: string;
  address: string;
  email: string;
  phone: string;
  logo: string;
  initials: string;
}

const toBranding = (c: CompanyConfig): Branding => {
  const name = (c.name || '').trim() || 'Precise Cleaning';
  return {
    name,
    address: (c.address || '').trim(),
    email: (c.email || '').trim(),
    phone: (c.phone || '').trim(),
    logo: (c.logo || '').trim(),
    initials: name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'PC',
  };
};

/** Branding asíncrono (lee de Firestore con respaldo a caché). */
export const getBranding = async (): Promise<Branding> => toBranding(await getCompanySettings());

/** Branding instantáneo (desde caché) — para render inmediato sin esperar red. */
export const getCachedBranding = (): Branding => toBranding(getCachedCompanySettings());

/** Etiqueta del logo: <img> si hay logo, o recuadro con iniciales si no. */
export const brandLogoTag = (b: Branding, size = 46): string =>
  b.logo
    ? `<img src="${b.logo}" alt="${b.name}" style="width:${size}px;height:${size}px;border-radius:12px;object-fit:contain;background:#fff;border:1px solid #e2e8f0;" />`
    : `<div style="width:${size}px;height:${size}px;border-radius:12px;background:linear-gradient(135deg,#1e40af,#3b82f6);color:#fff;font-weight:800;font-size:${Math.round(size / 2.8)}px;letter-spacing:1px;display:flex;align-items:center;justify-content:center;">${b.initials}</div>`;

/** Encabezado estándar para documentos (logo + nombre + datos de contacto). */
export const brandingHeaderHTML = (b: Branding, docTag = ''): string => `
  <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;padding-bottom:20px;border-bottom:1px solid #e2e8f0;">
    <div style="display:flex;align-items:center;gap:14px;">
      ${brandLogoTag(b)}
      <div>
        <div style="font-size:20px;font-weight:800;color:#1e3a8a;letter-spacing:1px;line-height:1.1;">${b.name}</div>
        ${[b.address, b.phone, b.email].filter(Boolean).length
    ? `<div style="font-size:11px;font-weight:600;color:#64748b;margin-top:5px;">${[b.address, b.phone, b.email].filter(Boolean).join(' • ')}</div>`
    : ''}
      </div>
    </div>
    ${docTag ? `<div style="font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:1px;background:#eff6ff;border:1px solid #bfdbfe;padding:8px 14px;border-radius:20px;white-space:nowrap;">${docTag}</div>` : ''}
  </div>
`;

/** Texto de pie de página estándar para documentos. */
export const brandingFooterHTML = (b: Branding, extra = ''): string =>
  `${b.name}${b.address ? ' • ' + b.address : ''}${b.email ? ' • ' + b.email : ''}${extra ? ' • ' + extra : ''}`;