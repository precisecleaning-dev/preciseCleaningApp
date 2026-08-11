// src/utils/shareQCReport.ts
//
// ============================================================================
// ⭐ ENVIAR UN QUALITY CHECK POR WHATSAPP
//
// Antes, mandar un reporte era: generar PDF → se abre una pestaña → imprimir →
// "Guardar en Archivos" → salir de la app → abrir WhatsApp → adjuntar → buscar
// el archivo. Ocho pasos y salir de la app dos veces.
//
// Hay un límite técnico que conviene tener claro, porque condiciona todo el
// diseño de esta función:
//
//   Los enlaces de WhatsApp (wa.me / whatsapp://) SOLO pueden llevar TEXTO.
//   No existe forma de adjuntar un archivo desde una URL. Cualquier tutorial
//   que prometa lo contrario está enviando un enlace al archivo, no el archivo.
//
// Por eso hay dos caminos, y la función elige el mejor disponible:
//
//   1. COMPARTIR NATIVO (móvil, y es el bueno). `navigator.share` con un File
//      abre la hoja del sistema con el PDF ya adjunto; se toca WhatsApp, se
//      elige el contacto y se envía. Dos toques, sin salir de la app, con el
//      PDF real. Requiere HTTPS y navegador compatible (Chrome/Safari móvil).
//
//   2. RESPALDO POR TEXTO (escritorio, o si el navegador no soporta archivos).
//      Se descarga el PDF y se abre WhatsApp con un resumen escrito listo. El
//      usuario adjunta el archivo recién descargado. No es ideal, pero es
//      honesto: el resumen ya comunica el resultado aunque nadie abra el PDF.
// ============================================================================

import { generatePDFBlob } from './pdfGenerator';

export interface QCShareSummary {
  clientName: string;
  address?: string;
  date?: string;
  inspectorName?: string;
  teamName?: string;
  /** Porcentaje de aprobación (el mismo del PDF). */
  passRate?: number | null;
  /** true si la inspección se marcó como "DID NOT PASS". */
  failed?: boolean;
}

/** Nombre de archivo seguro: sin acentos, espacios ni caracteres que rompan
 *  la descarga en Windows o iOS. */
const safeFileName = (summary: QCShareSummary): string => {
  const base = [
    'QC',
    summary.date || new Date().toISOString().slice(0, 10),
    summary.clientName,
  ]
    .filter(Boolean)
    .join('-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 70);
  return `${base}.pdf`;
};

/**
 * Mensaje de acompañamiento. Se manda siempre, incluso con el PDF adjunto:
 * quien lo recibe ve de qué se trata sin tener que abrir el archivo, que en
 * WhatsApp es un toque extra y una descarga.
 */
export const buildQCMessage = (summary: QCShareSummary): string => {
  const lines: string[] = ['*Quality Check*'];
  if (summary.clientName) lines.push(`Cliente: ${summary.clientName}`);
  if (summary.address) lines.push(`Dirección: ${summary.address}`);
  if (summary.date) lines.push(`Fecha: ${summary.date}`);
  if (summary.teamName) lines.push(`Equipo: ${summary.teamName}`);
  if (summary.inspectorName) lines.push(`Inspector: ${summary.inspectorName}`);

  if (summary.failed) {
    lines.push('', 'Resultado: *NO APROBADO* — requiere corrección.');
  } else if (typeof summary.passRate === 'number') {
    lines.push('', `Resultado: *${summary.passRate}%* de tareas aprobadas.`);
  }
  return lines.join('\n');
};

/** Deja solo dígitos: WhatsApp exige el número con código de país y sin +,
 *  espacios ni guiones. Un número con formato hace que el enlace falle sin
 *  ningún mensaje de error, así que se limpia siempre. */
export const normalizePhone = (phone?: string | null): string =>
  String(phone || '').replace(/\D/g, '');

/** ¿El dispositivo puede compartir archivos de forma nativa? */
export const canShareFiles = (): boolean => {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  try {
    const probe = new File(['x'], 'probe.pdf', { type: 'application/pdf' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
};

export type ShareResult =
  | { status: 'shared' }        // se abrió la hoja del sistema con el PDF
  | { status: 'fallback' }      // se descargó el PDF y se abrió WhatsApp con texto
  | { status: 'cancelled' };    // el usuario cerró la hoja de compartir

/**
 * Envía el reporte por WhatsApp por el mejor camino disponible.
 *
 * @param html      HTML completo del reporte (el que ya produce exportQCReportPDF
 *                  con `returnHtml: true`). No se duplica la maquetación.
 * @param summary   Datos para el mensaje y el nombre del archivo.
 * @param phone     Opcional. Con número, WhatsApp abre ese chat directamente;
 *                  sin número, abre el selector de contactos.
 */
export const shareQCViaWhatsApp = async (
  html: string,
  summary: QCShareSummary,
  phone?: string | null,
): Promise<ShareResult> => {
  const fileName = safeFileName(summary);
  const message = buildQCMessage(summary);

  // --- Camino 1: compartir nativo con el PDF adjunto ---
  if (canShareFiles()) {
    const blob = await generatePDFBlob(html, { filename: fileName, format: 'a4' });
    const file = new File([blob], fileName, { type: 'application/pdf' });
    try {
      await navigator.share({ files: [file], text: message, title: 'Quality Check' });
      return { status: 'shared' };
    } catch (err) {
      // AbortError = el usuario cerró la hoja a propósito. NO es un fallo y no
      // debe disparar el respaldo: abrirle WhatsApp a alguien que acaba de
      // cancelar es exactamente lo contrario de lo que pidió.
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { status: 'cancelled' };
      }
      // Cualquier otro error (permiso, tipo no soportado) sí cae al respaldo.
      console.warn('Compartir nativo falló, usando respaldo:', err);
    }
  }

  // --- Camino 2: descargar el PDF + abrir WhatsApp con el texto ---
  const blob = await generatePDFBlob(html, { filename: fileName, format: 'a4' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);

  const digits = normalizePhone(phone);
  const waUrl = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  // Se abre en pestaña nueva para no perder la inspección que está en pantalla.
  window.open(waUrl, '_blank', 'noopener,noreferrer');
  return { status: 'fallback' };
};

// ============================================================================
// ⭐ FLUJO EN DOS PASOS — el arreglo del "no me deja enviar" en iPhone
//
// PROBLEMA REAL (iOS Safari, y también Chrome en Android):
//   `navigator.share()` y `window.open()` solo funcionan si se invocan DENTRO
//   de la ventana de "activación por gesto del usuario", que dura poco más de
//   un segundo tras el toque.
//
//   El flujo anterior hacía:
//       toque → await generatePDFBlob(...)   ← tarda 2-8 s con fotos
//             → navigator.share(...)          ← la activación YA EXPIRÓ
//
//   Safari lanza `NotAllowedError`, el código cae al respaldo, y el respaldo
//   usa `window.open('https://wa.me/...')` — que por la misma razón se bloquea
//   como popup. Resultado: no pasa absolutamente nada al tocar el botón. Es
//   exactamente el síntoma reportado.
//
// SOLUCIÓN:
//   Separar en dos pasos. El primero (lento) prepara el archivo sin tocar
//   ninguna API restringida. El segundo lo dispara un SEGUNDO toque del
//   usuario, que trae activación fresca:
//
//       toque 1 → prepareQCShare()  → PDF listo, se muestra "Reporte listo"
//       toque 2 → shareNow()        → hoja del sistema / WhatsApp: SÍ funciona
//
//   Un toque extra a cambio de que funcione. Y además el usuario ve el peso
//   del archivo antes de mandarlo, que con fotos importa.
// ============================================================================

export interface PreparedQCShare {
  blob: Blob;
  file: File;
  fileName: string;
  message: string;
  /** Tamaño legible, para mostrarlo antes de enviar. */
  sizeLabel: string;
}

const humanSize = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * PASO 1 — trabajo pesado. Genera el PDF y arma el mensaje.
 * No llama a ninguna API que exija gesto, así que puede tardar lo que necesite.
 */
export const prepareQCShare = async (
  html: string,
  summary: QCShareSummary,
): Promise<PreparedQCShare> => {
  const fileName = safeFileName(summary);
  const blob = await generatePDFBlob(html, { filename: fileName, format: 'a4' });
  return {
    blob,
    file: new File([blob], fileName, { type: 'application/pdf' }),
    fileName,
    message: buildQCMessage(summary),
    sizeLabel: humanSize(blob.size),
  };
};

/**
 * PASO 2 — debe llamarse DIRECTAMENTE desde el onClick del botón, sin ningún
 * `await` previo. Ahí la activación por gesto está viva y la hoja del sistema
 * se abre.
 */
export const shareNow = async (prepared: PreparedQCShare): Promise<ShareResult> => {
  if (canShareFiles()) {
    try {
      await navigator.share({
        files: [prepared.file],
        text: prepared.message,
        title: 'Quality Check',
      });
      return { status: 'shared' };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { status: 'cancelled' };
      }
      console.warn('Compartir nativo falló:', err);
    }
  }
  return { status: 'fallback' };
};

/** Descarga el PDF ya preparado. Un <a download> sí funciona sin activación. */
export const downloadPrepared = (prepared: PreparedQCShare): void => {
  const url = URL.createObjectURL(prepared.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = prepared.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

/**
 * Abre WhatsApp con el mensaje escrito.
 *
 * Se usa un <a target="_blank"> con click sintético en vez de `window.open`:
 * los bloqueadores de popups tratan al enlace con mucha más tolerancia, y en
 * iOS es la única forma fiable de abrir WhatsApp desde una PWA instalada.
 */
export const openWhatsAppWithText = (message: string, phone?: string | null): void => {
  const digits = normalizePhone(phone);
  const url = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
};
