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
  options: PDFOptions,
): Promise<void> {
  await renderPDF(htmlContent, options, 'save');
}

/**
 * ⭐ Igual que generatePDFFromHTML pero devuelve el PDF como Blob en vez de
 *    descargarlo. Es lo que permite ENVIARLO por WhatsApp: la API de compartir
 *    del sistema (navigator.share) necesita un File real, no una descarga.
 */
export async function generatePDFBlob(
  htmlContent: string,
  options: PDFOptions,
): Promise<Blob> {
  const blob = await renderPDF(htmlContent, options, 'blob');
  if (!blob) throw new Error('No se pudo generar el PDF');
  return blob;
}

// ⭐ Ancho de A4 en píxeles CSS a 96 dpi (210 mm − 20 mm de margen ≈ 190 mm).
//    html2canvas trabaja en píxeles, no en milímetros: si el contenido se
//    maqueta a un ancho distinto del que jsPDF espera, el resultado sale
//    reescalado y descuadrado. Fijar este número es lo que mantiene la
//    proporción correcta.
const A4_CONTENT_PX = 718;

async function renderPDF(
  htmlContent: string,
  options: PDFOptions,
  mode: 'save' | 'blob',
): Promise<Blob | void> {
  // Crear iframe oculto para aislar estilos del documento principal
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-99999px';
  iframe.style.top = '0';
  // ⭐ El iframe mide EXACTAMENTE el ancho de contenido de una A4, en px.
  //    Antes medía 210mm de ancho y 297mm de ALTO: al ser tan bajo, el
  //    contenido largo se desbordaba y html2canvas lo capturaba recortado o
  //    reflowed. La altura ahora es enorme para que todo el reporte quepa en
  //    un solo layout continuo y los saltos los decida jsPDF.
  iframe.style.width = `${A4_CONTENT_PX}px`;
  iframe.style.height = '20000px';
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

    // ⭐ FORZAR EL LAYOUT DE IMPRESIÓN.
    //
    //    El HTML del reporte está maquetado para PANTALLA (max-width: 1000px,
    //    sombras, fondo gris, padding grande) y trae las correcciones de papel
    //    dentro de un bloque `@media print`.
    //
    //    html2canvas NO evalúa `@media print`: fotografía la versión de
    //    pantalla. Por eso el PDF salía con el diseño ancho comprimido dentro de
    //    una hoja A4 — texto apretado, tarjetas cortadas y columnas corridas.
    //
    //    Esta hoja de estilos replica esas reglas SIN la media query, así el
    //    render ya nace con proporciones de papel.
    const printFix = doc.createElement('style');
    printFix.textContent = `
      html, body {
        width: ${A4_CONTENT_PX}px !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .container {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        border-top: none !important;
      }
      img { max-width: 100% !important; height: auto !important; }
      /* Nada debe desbordar el ancho de la hoja: un solo elemento más ancho
         obliga a html2canvas a encoger TODA la página. */
      * { max-width: 100% !important; box-sizing: border-box !important; }
    `;
    doc.head.appendChild(printFix);

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
      margin: [10, 10, 10, 10],      // mm: arriba, izq, abajo, der
      filename: options.filename,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: {
        scale: 2,                    // mayor calidad
        useCORS: true,               // permitir imágenes externas
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        // ⭐ Ancho FIJO, no `doc.body.scrollWidth`. Ese valor cambiaba según el
        //    contenido (una foto ancha, una tabla larga) y cada reporte salía
        //    con una escala distinta: la causa de que "a veces" se viera bien.
        width: A4_CONTENT_PX,
        windowWidth: A4_CONTENT_PX,
        // Sin esto html2canvas hereda el scroll de la página principal y
        // captura el contenido desplazado.
        scrollX: 0,
        scrollY: 0,
      },
      jsPDF: {
        unit: 'mm',
        format: options.format || 'a4',
        orientation: options.orientation || 'portrait',
        compress: true
      },
      pagebreak: {
        // ⭐ Se quitó 'avoid-all'.
        //
        //    'avoid-all' le pide a html2pdf que NINGÚN elemento se parta entre
        //    páginas. En un reporte con muchas áreas eso es imposible de
        //    cumplir, así que empuja bloques enteros a la página siguiente y
        //    deja huecos gigantes en blanco — el "desorden" más visible.
        //
        //    Con 'css' + 'legacy' se respetan los saltos que el HTML declara, y
        //    `avoid` protege solo lo que de verdad no debe partirse: una foto y
        //    el encabezado de un área.
        mode: ['css', 'legacy'],
        avoid: ['.photo-item', 'img', '.no-break'],
      }
    };

    // Generar el PDF: descargarlo o devolverlo como Blob para compartir.
    const worker = html2pdf().set(opt).from(doc.body);
    if (mode === 'blob') {
      return (await worker.output('blob')) as Blob;
    }
    await worker.save();
  } finally {
    // Limpiar iframe
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
  }
}