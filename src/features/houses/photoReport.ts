// src/features/houses/photoReport.ts
// ⭐ Reporte de fotos Before/After para imprimir o guardar como PDF (botón
//    "Export PDF" del detalle). Extraído de HousesView sin cambiar la lógica:
//    las fotos se incrustan en base64 y el reporte se abre en una ventana nueva
//    como Blob URL. El cliente y la dirección pasan por escapeHtml().
import { formatDate } from '../../utils/dateFormat';
import { escapeHtml } from '../../utils/escapeHtml';

interface PhotoReportInput {
  type: 'before' | 'after';
  urls: string[];
  /** Nombre del cliente ("Propiedad" si la casa no tiene). */
  clientName: string;
  /** Dirección ("N/A" si no tiene). */
  address: string;
}

/** Abre el reporte. Devuelve false si el navegador bloqueó la ventana. */
export async function openPhotoReport({ type, urls, clientName, address }: PhotoReportInput): Promise<boolean> {
  const base64Images = await Promise.all(
    urls.map(async (url, idx) => {
      try {
        const response = await fetch(url, { mode: 'cors' });
        const blob = await response.blob();
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (err) {
        console.error(`Error loading image ${idx + 1}:`, err);
        return url;
      }
    }),
  );

  const title = type === 'before' ? 'Before Photos' : 'After Photos';
  const accentColor = type === 'before' ? '#1e3a8a' : '#047857';
  const clientLabel = escapeHtml(clientName);
  const addressLabel = escapeHtml(address);

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>${title} - ${clientLabel}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #f1f5f9;
            padding: 24px;
            color: #1e293b;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .container {
            max-width: 1000px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            padding: 48px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding-bottom: 24px;
            border-bottom: 1px solid #e2e8f0;
            margin-bottom: 32px;
          }
          .logo-section { display: flex; align-items: center; gap: 12px; }
          .logo-text {
            font-size: 22px; font-weight: 800; color: #1e3a8a;
            letter-spacing: 2px; line-height: 1;
          }
          .logo-subtitle {
            font-size: 10px; font-weight: 500; color: #64748b;
            letter-spacing: 3px; text-transform: uppercase; margin-top: 4px;
          }
          .address-section { text-align: right; font-size: 13px; color: #475569; max-width: 60%; }
          .address-label { font-weight: 700; color: #0f172a; margin-bottom: 2px; }
          h1.report-title {
            text-align: center; font-size: 38px; font-weight: 800;
            color: ${accentColor}; margin: 40px 0 32px 0;
          }
          .photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
          .photo-item {
            aspect-ratio: 1 / 1; border-radius: 8px; overflow: hidden;
            box-shadow: 0 4px 8px rgba(0,0,0,0.12);
            background-color: #f1f5f9; page-break-inside: avoid;
          }
          .photo-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
          .footer {
            margin-top: 40px; padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            text-align: center; font-size: 11px; color: #94a3b8;
          }
          @media print {
            @page { margin: 12mm; size: A4; }
            body { background: white; padding: 0; }
            .container { box-shadow: none; padding: 0; max-width: 100%; }
            .photo-item { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo-section">
              <div>
                <div class="logo-text">PRECISE CLEANING</div>
                <div class="logo-subtitle">Professional Services</div>
              </div>
            </div>
            <div class="address-section">
              <div class="address-label">Address:</div>
              <div>${addressLabel}</div>
            </div>
          </div>

          <h1 class="report-title">${title}</h1>

          <div class="photo-grid">
            ${base64Images
      .map(
        (src) => `
              <div class="photo-item">
                <img src="${src}" alt="${type} photo" />
              </div>
            `,
      )
      .join("")}
          </div>

          <div class="footer">
            ${clientLabel} • Generated on ${formatDate(new Date())}
          </div>
        </div>
        <script>
          window.addEventListener('load', function() {
            const images = document.querySelectorAll('img');
            if (images.length === 0) {
              setTimeout(() => window.print(), 300);
              return;
            }
            let loaded = 0;
            const checkDone = () => {
              loaded++;
              if (loaded >= images.length) {
                setTimeout(() => window.print(), 500);
              }
            };
            images.forEach(img => {
              if (img.complete) { checkDone(); }
              else {
                img.addEventListener('load', checkDone);
                img.addEventListener('error', checkDone);
              }
            });
          });
        </script>
      </body>
    </html>
  `;

  // Se abre el reporte como Blob URL en vez de document.write sobre about:blank.
  // Nota: NO usar la feature 'noopener' aquí — hace que window.open retorne null
  // y era la causa de la ventana en blanco + falsa alerta de pop-ups.
  // La protección equivalente se logra con printWindow.opener = null (abajo).
  const blob = new Blob([html], { type: 'text/html' });
  const blobUrl = URL.createObjectURL(blob);
  const printWindow = window.open(blobUrl, '_blank');
  if (!printWindow) {
    URL.revokeObjectURL(blobUrl);
    return false;
  }
  // Corta el acceso de la ventana nueva a la pestaña principal (defensa en profundidad,
  // complementa el escapeHtml de nombre de cliente/dirección).
  printWindow.opener = null;
  // Liberar el Blob URL cuando la ventana ya cargó el contenido.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  return true;
}
