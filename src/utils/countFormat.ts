// src/utils/countFormat.ts
// Cantidades para mostrar: "1,234" y "1 job" / "3 jobs".

/** Cantidad con separador de miles: 1234 → "1,234". */
export const formatCount = (count: number): string => count.toLocaleString('en-US');

/** Cantidad con su palabra en singular o plural: (1, 'job', 'jobs') → "1 job". */
export const pluralize = (count: number, singular: string, plural: string): string =>
  `${formatCount(count)} ${count === 1 ? singular : plural}`;
