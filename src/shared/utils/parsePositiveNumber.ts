// src/shared/utils/parsePositiveNumber.ts
// Montos y cantidades escritos en un campo de texto (Payroll y System Users).

/** Número mayor que 0 escrito en un campo; null si está vacío o no es válido. */
export const parsePositiveNumber = (text: string): number | null => {
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? value : null;
};
