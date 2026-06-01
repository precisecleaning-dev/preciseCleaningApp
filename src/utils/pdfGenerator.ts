import html2pdf from 'html2pdf.js';

interface PDFOptions {
  filename: string;
  format?: 'a4' | 'letter';
  orientation?: 'portrait' | 'landscape';
}

/**
 * Genera un PDF directamente desde HTML usando html2pdf.js (html2canvas + jsPDF).
 * 
 * Ventajas vs window.print():
 * - NO aparecen headers/footers del navegador (URL, fecha, título de tab)
 * - El PDF se descarga directamente sin pasar por el diálogo de impresión
 * - Salida idéntica en todos los navegadores
 * 
 * El htmlContent debe ser un documento HTML completo con DOCTYPE, html, head, body.
 * Los estilos se preservan completamente.
 */
export async function generatePDFFromHTML(
  htmlContent: string,
  options: PDFOptions
): Promise<void> {
  // Crear iframe oculto para aislar estilos del documento principal
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '0';
  iframe.style.width = '210mm';   // ancho A4
  iframe.style.height = '297mm';  // alto A4
  iframe.style.border = 'none';
  iframe.style.opacity = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error('Cannot access iframe document');

    // Escribir HTML completo en el iframe
    doc.open();
    doc.write(htmlContent);
    doc.close();

    // Esperar a que el iframe termine de cargar
    await new Promise<void>(resolve => {
      if (doc.readyState === 'complete') {
        resolve();
      } else {
        iframe.addEventListener('load', () => resolve(), { once: true });
        // Fallback por si el evento no se dispara
        setTimeout(resolve, 1500);
      }
    });

    // Esperar a que todas las imágenes carguen
    const images = Array.from(doc.querySelectorAll('img'));
    if (images.length > 0) {
      await Promise.all(
        images.map(img =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>(res => {
                const done = () => res();
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
                // Timeout de seguridad
                setTimeout(done, 5000);
              })
        )
      );
    }

    // Pequeño delay extra para asegurar render completo
    await new Promise(res => setTimeout(res, 300));

    // Configuración de html2pdf (tipo `any` para evitar conflictos con
    // los tipos estrictos que html2pdf.js trae internamente)
    const opt: any = {
      margin: 10,                    // mm uniforme en los 4 lados
      filename: options.filename,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: {
        scale: 2,                    // mayor calidad
        useCORS: true,               // permitir imágenes externas
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: doc.body.scrollWidth,
        windowHeight: doc.body.scrollHeight
      },
      jsPDF: {
        unit: 'mm',
        format: options.format || 'a4',
        orientation: options.orientation || 'portrait',
        compress: true
      },
      pagebreak: {
        mode: ['avoid-all', 'css', 'legacy'],
        avoid: ['.photo-item', '.place-section', '.no-break']
      }
    };

    // Generar y descargar PDF
    await html2pdf().set(opt).from(doc.body).save();
  } finally {
    // Limpiar iframe
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
  }
}