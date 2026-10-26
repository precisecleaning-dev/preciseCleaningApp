// src/shared/utils/downloadFile.ts
// Descarga un archivo armado en el navegador (PDF de Quality Check, Excel del
// Pipeline…). Un <a download> funciona aunque no venga de un clic del usuario.

/** Tiempo antes de soltar el archivo en memoria (el navegador ya lo tomó). */
const DOWNLOAD_URL_LIFETIME_MS = 60_000;

export const downloadBlob = (blob: Blob, fileName: string): void => {
  const downloadUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement('a');
  downloadLink.href = downloadUrl;
  downloadLink.download = fileName;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), DOWNLOAD_URL_LIFETIME_MS);
};
