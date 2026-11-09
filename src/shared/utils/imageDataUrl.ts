// src/shared/utils/imageDataUrl.ts
// ============================================================================
// Imagen remota → data URL (base64) para meterla en un PDF: html2canvas no
// dibuja una imagen de otro dominio sin CORS, y así el PDF no depende de la
// red al generarse. Si la descarga falla, devuelve la URL original (la imagen
// se intenta cargar directo). Mismo criterio que utils/qcReportPdf.ts.
// ============================================================================

export const fetchImageAsDataUrl = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return url;
    const blob = await response.blob();
    if (blob.size === 0 || (blob.type && !blob.type.startsWith('image/'))) return url;
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : url);
      reader.onerror = () => resolve(url);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Could not load the image for the PDF, using its URL:', error);
    return url;
  }
};
