// src/features/ops/opsOptions.ts
// Opciones de los selectores del Task list y colores derivados (sin campos
// nuevos en Firestore: el color de un proyecto o de un avatar sale de su id).
import type { Repeat, RepeatFreq } from '../../types/index';
import { formatMinutes } from './opsDates';

/** "How long": 0 = no aplica (la fila no muestra duración ni suma minutos al proyecto). */
export const DURATION_OPTIONS = [
  { value: 0, label: 'N/A' },
  ...[5, 10, 15, 30, 45, 60, 90, 120, 180, 240].map((minutes) => ({
    value: minutes,
    label: formatMinutes(minutes),
  })),
];

export const REPEAT_OPTIONS: { value: '' | RepeatFreq; label: string }[] = [
  { value: '', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
];

export const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const repeatValue = (repeat: Repeat | null | undefined): '' | RepeatFreq => repeat?.freq ?? '';

/** Colores de proyecto: en Firestore se guarda el NOMBRE (`project.color`); el
 *  hex vive aquí. Son los mismos de la paleta automática de abajo. */
export const PROJECT_COLORS: { id: string; label: string; hex: string }[] = [
  { id: 'blue', label: 'Blue', hex: '#2546d8' },
  { id: 'green', label: 'Green', hex: '#047857' },
  { id: 'amber', label: 'Amber', hex: '#b45309' },
  { id: 'purple', label: 'Purple', hex: '#7c3aed' },
  { id: 'pink', label: 'Pink', hex: '#be185d' },
  { id: 'teal', label: 'Teal', hex: '#0e7490' },
  { id: 'olive', label: 'Olive', hex: '#4d7c0f' },
];

const PALETTE = PROJECT_COLORS.map((c) => c.hex);

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** Color estable para un id (proyectos y avatares). */
export const colorFor = (id: string): string => PALETTE[hash(id || '?') % PALETTE.length];

/** Nombres cortos de varias personas: "Me, Sandy" o "Me, Sandy +2". */
export function namesSummary(names: string[], maxShown = 2): string {
  const shown = names.slice(0, maxShown).join(', ');
  return names.length > maxShown ? `${shown} +${names.length - maxShown}` : shown;
}

/** "Sandy Martinez" → "SM"; "sandy@x.com" → "SA". */
export function initials(name: string): string {
  const words = (name || '?').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] || '?').slice(0, 2).toUpperCase();
}

/** 1_258_291 → "1.2 MB". */
export function formatBytes(bytes: number): string {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "image/jpeg" → "image"; "application/pdf" → "pdf". */
export function fileKind(type: string): string {
  if (type.startsWith('image/')) return 'image';
  if (type === 'application/pdf') return 'pdf';
  return type.split('/').pop() || 'file';
}

/** Color de un proyecto: el que eligieron o, si no tiene, el automático por id. */
export const projectHex = (project: { id: string; color?: string | null } | null | undefined, fallbackId = ''): string =>
  PROJECT_COLORS.find((c) => c.id === project?.color)?.hex || colorFor(project?.id || fallbackId);
