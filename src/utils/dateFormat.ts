// src/utils/dateFormat.ts
// ⭐ Formateo UNIFICADO de fechas a MM/DD/YYYY en toda la app.
//    Maneja: ISO (YYYY-MM-DD), objetos Date, Timestamps de Firestore, números (epoch)
//    y strings con barras (DD/MM/YYYY o MM/DD/YYYY). Los casos ambiguos (día <= 12
//    con barras) se dejan como están porque no se puede saber el formato de origen.

const pad = (n: number) => String(n).padStart(2, '0');
const toMDY = (d: Date) => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;

export function formatDate(value: any): string {
  if (value === null || value === undefined || value === '') return '';

  // Firestore Timestamp
  if (typeof value === 'object' && typeof (value as any).toDate === 'function') {
    const d = (value as any).toDate();
    return isNaN(d.getTime()) ? '' : toMDY(d);
  }
  if (value instanceof Date) return isNaN(value.getTime()) ? '' : toMDY(value);
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? '' : toMDY(d);
  }

  const str = String(value).trim();

  // ISO: YYYY-MM-DD (con o sin hora) -> confiable
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${pad(Number(iso[2]))}/${pad(Number(iso[3]))}/${iso[1]}`;

  // Con barras o guiones: DD/MM/YYYY o MM/DD/YYYY
  const slash = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
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
export function formatDateTime(value: any): string {
  if (value === null || value === undefined || value === '') return '';
  let d: Date | null = null;
  if (typeof value === 'object' && typeof (value as any).toDate === 'function') d = (value as any).toDate();
  else if (value instanceof Date) d = value;
  else {
    const p = new Date(value);
    if (!isNaN(p.getTime())) d = p;
  }
  if (!d || isNaN(d.getTime())) return formatDate(value);
  return `${toMDY(d)}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
}

// ⭐ Valor numérico (timestamp) para ORDENAR fechas de formatos mixtos.
//    Sin fecha => 0 (queda al final en orden descendente).
export function dateSortValue(value: any): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'object' && typeof (value as any).toDate === 'function') {
    const d = (value as any).toDate();
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  if (value instanceof Date) return isNaN(value.getTime()) ? 0 : value.getTime();
  if (typeof value === 'number') return value;

  const str = String(value).trim();
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();

  const slash = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
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