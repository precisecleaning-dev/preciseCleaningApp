// src/utils/dateFormat.ts
// ⭐ Formateo UNIFICADO de fechas a MM/DD/YYYY en toda la app.
//    REGLA DEL NEGOCIO (no negociable): toda fecha que se MUESTRA va en formato
//    de Estados Unidos MM/DD/AAAA, y la hora en h:mm AM/PM. No uses
//    toLocaleDateString/toLocaleString para fechas: usa estas funciones.
//    (Guardar es otra cosa: los campos de fecha se guardan AAAA-MM-DD para que
//    Firestore pueda ordenar y filtrar; ver shared/data/propertiesWindow.ts.)
//    Maneja: ISO (YYYY-MM-DD), objetos Date, Timestamps de Firestore, números (epoch)
//    y strings con barras (DD/MM/YYYY o MM/DD/YYYY). Los casos ambiguos (día <= 12
//    con barras) se dejan como están porque no se puede saber el formato de origen.

const pad = (n: number) => String(n).padStart(2, '0');
const toMDY = (d: Date) => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;

/** Timestamp de Firestore (o cualquier objeto con `toDate()`). */
const hasToDate = (value: unknown): value is { toDate: () => Date } =>
  typeof value === 'object' && value !== null && typeof (value as { toDate?: unknown }).toDate === 'function';

const isEmpty = (value: unknown) => value === null || value === undefined || value === '';

/** "2026-10-09T13:45…": fecha con hora (un instante), no solo un día. */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function formatDate(value: unknown): string {
  if (isEmpty(value)) return '';

  if (hasToDate(value)) {
    const d = value.toDate();
    return isNaN(d.getTime()) ? '' : toMDY(d);
  }
  if (value instanceof Date) return isNaN(value.getTime()) ? '' : toMDY(value);
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? '' : toMDY(d);
  }

  const str = String(value).trim();

  // Fecha y hora ISO completa ("2026-10-09T01:00:00.000Z"): es un instante, se
  // muestra el día LOCAL (a las 8 p. m. de Texas ya es el día siguiente en UTC).
  if (ISO_TIMESTAMP.test(str)) {
    const t = new Date(str);
    if (!isNaN(t.getTime())) return toMDY(t);
  }

  // ISO: YYYY-MM-DD (solo fecha) -> confiable
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${pad(Number(iso[2]))}/${pad(Number(iso[3]))}/${iso[1]}`;

  // Con barras o guiones: DD/MM/YYYY o MM/DD/YYYY
  const slash = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const y = slash[3];
    // Si el primero > 12 (y el segundo es mes válido) era DD/MM -> lo pasamos a MM/DD
    if (a > 12 && b <= 12) return `${pad(b)}/${pad(a)}/${y}`;
    // Si no, asumimos que ya viene como MM/DD (o es ambiguo: se deja tal cual)
    return `${pad(a)}/${pad(b)}/${y}`;
  }

  // Último recurso: intentar parsear
  const d = new Date(str);
  return isNaN(d.getTime()) ? str : toMDY(d);
}

// Fecha + hora: MM/DD/YYYY, h:mm AM/PM
export function formatDateTime(value: unknown): string {
  if (isEmpty(value)) return '';
  let d: Date | null = null;
  if (hasToDate(value)) d = value.toDate();
  else if (value instanceof Date) d = value;
  else {
    const p = new Date(value as string | number);
    if (!isNaN(p.getTime())) d = p;
  }
  if (!d || isNaN(d.getTime())) return formatDate(value);
  return `${toMDY(d)}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
}

// Solo la hora: h:mm AM/PM. Sin valor (o ilegible) → ''.
export function formatTime(value: unknown): string {
  if (isEmpty(value)) return '';
  const d = hasToDate(value) ? value.toDate() : value instanceof Date ? value : new Date(value as string | number);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Fecha para nombres de archivo: MM-DD-YYYY (las barras no se permiten).
export function formatDateForFile(value: unknown): string {
  return formatDate(value).replace(/\//g, '-');
}

// Rango de fechas: "MM/DD/YYYY – MM/DD/YYYY" (una sola fecha si coinciden).
export function formatDateRange(from: unknown, to: unknown): string {
  const a = formatDate(from);
  const b = formatDate(to);
  return a === b ? a : `${a} – ${b}`;
}

// Fecha de HOY para guardar, AAAA-MM-DD en hora LOCAL. No uses
// `new Date().toISOString().split('T')[0]`: eso es la fecha en UTC y en Texas,
// desde las 6–7 p. m., ya es el día siguiente.
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ⭐ Valor numérico (timestamp) para ORDENAR fechas de formatos mixtos.
//    Sin fecha => 0 (queda al final en orden descendente).
export function dateSortValue(value: unknown): number {
  if (isEmpty(value)) return 0;
  if (hasToDate(value)) {
    const d = value.toDate();
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  if (value instanceof Date) return isNaN(value.getTime()) ? 0 : value.getTime();
  if (typeof value === 'number') return value;

  const str = String(value).trim();
  if (ISO_TIMESTAMP.test(str)) {
    const t = new Date(str).getTime();
    if (!isNaN(t)) return t;
  }
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();

  const slash = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const y = Number(slash[3]);
    let day: number, mon: number;
    if (a > 12 && b <= 12) { day = a; mon = b; }   // DD/MM
    else { mon = a; day = b; }                      // MM/DD (o ambiguo)
    return new Date(y, mon - 1, day).getTime();
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
