import { type LatLng, geocodeAddress } from './routing';

// ============================================================================
// ⭐ GEOCODING FORZADO (Quality Check → Rutas)
// Hay direcciones capturadas con apartamento/unidad/typos que Nominatim no
// encuentra tal cual. Este helper intenta VARIANTES progresivamente más simples
// de la dirección hasta dar con coordenadas, para que "esa dirección siempre se
// encuentre":
//   1. La dirección original.
//   2. Sin apt/unit/suite/#/lot/trlr/bldg.
//   3. Variante 2 + ", TX" (o la original + ", TX") si no menciona estado.
//   4. Variante 2 + ", USA".
//   5. Solo "calle + código postal" (si hay ZIP de 5 dígitos).
// Entre intentos se espera ~1.1 s para respetar el rate-limit de Nominatim, y
// el resultado (incluso el fallo) se cachea en memoria por sesión.
// ============================================================================

const cache = new Map<string, LatLng | null>();

const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

// quita apt/unit/suite/#/lot/trlr/bldg + su identificador
const stripUnit = (addr: string): string =>
  addr
    .replace(/\b(apt|apartment|unit|suite|ste|lot|trlr|bldg|building)\.?\s*#?\s*[\w-]+/gi, '')
    .replace(/#\s*[\w-]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();

// ⭐ quita la LETRA de unidad pegada tras el tipo de calle sin coma ni "apt":
//    "2500 Westcliff Rd A, Killeen" → "2500 Westcliff Rd, Killeen"
//    "2816 Leroy Cir B, Killeen"    → "2816 Leroy Cir, Killeen"
const STREET_SUFFIX = '(?:rd|road|dr|drive|st|street|ave|avenue|cir|circle|ct|court|ln|lane|way|blvd|boulevard|pkwy|parkway|loop|trl|trail|hwy|highway|cv|cove|pl|place)';
const stripUnitLetter = (addr: string): string =>
  addr
    .replace(new RegExp(`\\b(${STREET_SUFFIX})\\.?\\s+[a-z]\\b`, 'gi'), '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();

// ciudad: el segmento antes de ", TX" (o la palabra previa a TX sin coma)
const extractCity = (addr: string): string => {
  const m = addr.match(/([A-Za-z][A-Za-z .]+?),?\s+TX\b/i);
  return m ? m[1].trim() : '';
};

const buildVariants = (address: string): string[] => {
  const original = address.trim();
  const noUnit = stripUnit(original);
  const noLetter = stripUnitLetter(noUnit || original);
  const hasState = /\b(TX|Texas)\b/i.test(original);
  const zip = original.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] || '';
  const city = extractCity(original);
  const base = noLetter || noUnit || original;
  const street = stripUnitLetter(base.split(',')[0].trim());

  const variants: string[] = [original];
  if (noUnit && noUnit !== original) variants.push(noUnit);
  if (noLetter && noLetter !== noUnit && noLetter !== original) variants.push(noLetter);
  if (!hasState) {
    variants.push(`${base}, TX`);
    variants.push(`${base}, Texas, USA`);
  } else {
    variants.push(`${base}, USA`);
  }
  if (street && zip) variants.push(`${street}, ${zip}`);
  if (street && city) variants.push(`${street}, ${city}, TX`);
  if (street) variants.push(`${street}, Killeen, TX`);
  // ⭐ ÚLTIMO RECURSO para que NUNCA quede "Sin ubicación": el centroide del ZIP
  //    o de la ciudad (ubicación aproximada, suficiente para ordenar la ruta).
  if (zip) variants.push(`${zip}, USA`);
  if (city) variants.push(`${city}, TX, USA`);

  // sin duplicados, sin vacíos
  return Array.from(new Set(variants.map(v => v.replace(/\s{2,}/g, ' ').trim()).filter(Boolean)));
};

/**
 * Geocodifica la dirección probando variantes hasta encontrarla.
 * Devuelve null solo si TODAS las variantes fallan.
 */
export const geocodeAddressForced = async (address: string): Promise<LatLng | null> => {
  const key = address.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  const variants = buildVariants(address);
  for (let i = 0; i < variants.length; i++) {
    try {
      const coords = await geocodeAddress(variants[i]);
      if (coords) {
        cache.set(key, coords);
        return coords;
      }
    } catch { /* seguir con la siguiente variante */ }
    // respetar el rate-limit de Nominatim entre variantes
    if (i < variants.length - 1) await sleep(1100);
  }
  cache.set(key, null);
  return null;
};