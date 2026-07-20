import { escapeHtml } from './escapeHtml';

// ============================================================================
// ⭐ GENERADOR DEL PDF DE QUALITY CHECK — extraído de QualityCheckView.tsx para
//    compartirlo con la pestaña Reportes (QCReportsView) sin duplicar lógica.
//    La vista que lo llama aporta el contexto: catálogos (places/tasks), branding
//    de la empresa y los nombres ya resueltos de cliente y equipo.
//    El flujo anti "PDF en blanco" (ventana síncrona + Blob URL) vive aquí.
// ============================================================================

export interface QCPdfPlace { id: string; name: string }
export interface QCPdfTask { id: string; placeId: string; name: string }
export interface QCPdfBranding { name: string; address?: string; logo?: string; email?: string }

  // ⭐ Reúne las áreas que tienen datos (tareas, notas o fotos) para el reporte
export const collectPlacesWithData = (places: QCPdfPlace[], qcDataObj: Record<string, any>) => {
    const out: { place: QCPdfPlace; photos: string[]; tasksData: any; notes: string; damage: string; score: any; corrections: string }[] = [];
    places.forEach(p => {
      const data = qcDataObj[p.id];
      if (!data) return;
      const hasPhotos = (data.photos || []).length > 0;
      const hasTasks = Object.keys(data.tasks || {}).length > 0;
      const hasNotes = (data.notes || data.damage || '').trim().length > 0;
      if (hasPhotos || hasTasks || hasNotes) {
        out.push({
          place: p,
          photos: data.photos || [],
          tasksData: data.tasks || {},
          notes: data.notes || '',
          damage: data.damage || '',
          score: data.score,
          corrections: data.corrections,
        });
      }
    });
    return out;
  };

  // ⭐ Generar PDF profesional del Quality Check.
export const exportQCReportPDF = async (args: {
  house: { address?: string };
  clientName: string;
  teamName: string;
  qcData: Record<string, any>;
  inspectorName: string;
  recordDate?: string;
  places: QCPdfPlace[];
  tasks: QCPdfTask[];
  branding: QCPdfBranding;
  setLoading?: (loading: boolean) => void;
  returnHtml?: boolean;
}): Promise<string | void> => {
  {
    const { house, qcData: qcDataObj, inspectorName, recordDate, places, tasks, branding, setLoading } = args;
    const brandInitials = (branding.name || 'PC').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'PC';
    const returnHtml = args.returnHtml === true;
    const placesWithData = collectPlacesWithData(places, qcDataObj);

    // ⭐ FIX PDF EN BLANCO: la ventana se abre SÍNCRONA (dentro del gesto del clic,
    //    antes del trabajo async de imágenes) con un placeholder; al terminar se le
    //    carga el HTML final vía Blob URL. El window.open anterior usaba 'noopener',
    //    que hace que el navegador devuelva null / ignore document.write → ventana
    //    en blanco. El contenido es 100% generado y escapado por nosotros, por lo
    //    que prescindir de noopener aquí es seguro (ver escapeHtml en todo el HTML).
    let printWindow: Window | null = null;
    if (!returnHtml) {
      printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Por favor permite las ventanas emergentes (pop-ups) para generar el PDF.');
        if (setLoading) setLoading(false);
        return;
      }
      printWindow.document.write('<title>Quality Check</title><p style="font-family:sans-serif;padding:24px;color:#334155;">Generando el reporte de Quality Check…</p>');
    }

    if (placesWithData.length === 0) {
      if (!returnHtml) {
        printWindow?.close();
        alert('No hay datos para exportar. Este Quality Check no tiene tareas evaluadas, notas ni fotos.');
      }
      return;
    }

    if (setLoading) setLoading(true);

    try {
      // Para el correo se usan las URLs directas (más liviano); para el PDF se
      // convierten a base64 para que se impriman aunque no haya conexión.
      const placesWithBase64 = returnHtml
        ? placesWithData.map((pd) => ({ ...pd, photosBase64: pd.photos }))
        : await Promise.all(
          placesWithData.map(async (pd) => ({
            ...pd,
            photosBase64: await Promise.all(
              pd.photos.map(async (url) => {
                try {
                  const response = await fetch(url, { mode: 'cors' });
                  // Si la descarga no es válida, usamos la URL real (carga directa en <img>)
                  if (!response.ok) return url;
                  const blob = await response.blob();
                  if (!blob || blob.size === 0 || (blob.type && !blob.type.startsWith('image/'))) return url;
                  return await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve((reader.result as string) || url);
                    reader.onerror = () => resolve(url);
                    reader.readAsDataURL(blob);
                  });
                } catch (err) {
                  console.error('Error loading image, using direct URL:', err);
                  return url;
                }
              })
            )
          }))
        );

      // Estos valores terminan en HTML crudo (ventana de impresión y/o email) — se
      // escapan porque incluyen texto libre (notas de inspector) y catálogos.
      const inspector = escapeHtml(inspectorName || 'Unknown');
      const displayDate = recordDate
        ? new Date(recordDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const date = displayDate;
      const clientName = escapeHtml(args.clientName);
      const teamName = escapeHtml(args.teamName);

      // Resumen general del reporte
      const scoredVals = placesWithData.map(p => p.score).filter((v): v is number => typeof v === 'number' && v > 0);
      const avgScore = scoredVals.length ? (scoredVals.reduce((a, b) => a + b, 0) / scoredVals.length) : 0;
      let yesCount = 0, noCount = 0;
      placesWithData.forEach(pd => {
        const ptasks = tasks.filter(t => t.placeId === pd.place.id);
        ptasks.forEach(t => {
          const v = pd.tasksData[t.id];
          if (v === 'Yes') yesCount++;
          else if (v === 'No') noCount++;
        });
      });
      const totalAnswered = yesCount + noCount;
      const passRate = totalAnswered ? Math.round((yesCount / totalAnswered) * 100) : 0;
      const hasData = totalAnswered > 0;
      const verdict = !hasData ? 'Inspection Recorded' : passRate >= 90 ? 'Excellent Result' : passRate >= 75 ? 'Satisfactory' : 'Needs Attention';
      const verdictClass = !hasData ? 'mid' : passRate >= 90 ? 'pass' : passRate >= 75 ? 'mid' : 'low';

      const placeSections = placesWithBase64.map(pd => {
        const placeTasks = tasks.filter(t => t.placeId === pd.place.id);
        const tasksHtml = placeTasks.length > 0 ? `
          <table class="tasks-table">
            <thead>
              <tr><th>Task</th><th>Result</th></tr>
            </thead>
            <tbody>
              ${placeTasks.map(t => {
                const val = pd.tasksData[t.id];
                const cls = val === 'Yes' ? 'yes' : val === 'No' ? 'no' : 'na';
                return `
                  <tr>
                    <td>${escapeHtml(t.name)}</td>
                    <td style="text-align:right;"><span class="result-pill ${cls}">${val || 'N/A'}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        ` : '';

        const scoreHtml = pd.score ? `
          <div class="score-badge score-${pd.score}">
            Score: ${pd.score}/3
          </div>
        ` : '';

        // pd.notes/pd.damage son texto libre que escribe el inspector — el punto de
        // mayor riesgo de todo este generador, se escapan sin excepción.
        const notesHtml = (pd.notes || pd.damage) ? `
          <div class="notes-block">
            ${pd.notes ? `<div><strong>Notes:</strong> ${escapeHtml(pd.notes)}</div>` : ''}
            ${pd.damage ? `<div style="margin-top: 8px; color: #b91c1c;"><strong>Damage:</strong> ${escapeHtml(pd.damage)}</div>` : ''}
          </div>
        ` : '';

        const placeName = escapeHtml(pd.place.name);
        const photosHtml = pd.photosBase64.length > 0 ? `
          <div class="photos-label">Photographic Evidence (${pd.photosBase64.length})</div>
          <div class="photo-grid">
            ${pd.photosBase64.map((src, idx) => `
              <figure class="photo-item">
                <div class="photo-frame"><img src="${src}" alt="QC photo ${idx + 1}" /></div>
                <figcaption class="photo-cap">${placeName} — Photo ${String(idx + 1).padStart(2, '0')}</figcaption>
              </figure>
            `).join('')}
          </div>
        ` : '';

        return `
          <section class="place-section">
            <div class="place-header">
              <h2>${placeName}</h2>
              ${scoreHtml}
            </div>
            <div class="place-body">
              ${tasksHtml || '<div style="color:#94a3b8;font-size:13px;margin-bottom:8px;">No tasks evaluated for this area.</div>'}
              ${notesHtml}
              ${photosHtml}
            </div>
          </section>
        `;
      }).join('');

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8" />
            <title>Quality Check Report - ${clientName}</title>
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background-color: #eef2f7;
                padding: 24px;
                color: #1e293b;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .container {
                max-width: 1000px;
                margin: 0 auto;
                background: #ffffff;
                border-radius: 16px;
                padding: 48px;
                box-shadow: 0 10px 30px rgba(15,23,42,0.08);
                border-top: 6px solid #1e40af;
              }
              .brandbar {
                display: flex; justify-content: space-between; align-items: center;
                padding-bottom: 20px; border-bottom: 1px solid #e2e8f0;
              }
              .brand { display: flex; align-items: center; gap: 14px; }
              .brand-logo {
                width: 46px; height: 46px; border-radius: 12px;
                background: linear-gradient(135deg, #1e40af, #3b82f6);
                color: #fff; font-weight: 800; font-size: 16px; letter-spacing: 1px;
                display: flex; align-items: center; justify-content: center;
              }
              .logo-text { font-size: 20px; font-weight: 800; color: #1e3a8a; letter-spacing: 2px; line-height: 1; }
              .logo-subtitle { font-size: 10px; font-weight: 600; color: #64748b; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px; }
              .doc-tag {
                font-size: 11px; font-weight: 700; color: #1e40af; text-transform: uppercase; letter-spacing: 1px;
                background: #eff6ff; border: 1px solid #bfdbfe; padding: 8px 14px; border-radius: 20px;
              }
              h1.report-title { text-align: center; font-size: 34px; font-weight: 800; color: #0f172a; margin: 36px 0 6px 0; }
              .report-sub { text-align: center; font-size: 13px; color: #94a3b8; margin-bottom: 32px; }
              .info-grid {
                display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px;
                background: #e2e8f0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 24px;
              }
              .info-item { background: #f8fafc; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
              .info-k { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.6px; }
              .info-v { font-size: 14px; font-weight: 700; color: #0f172a; word-break: break-word; }
              .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 40px; }
              .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; text-align: center; }
              .summary-num { font-size: 26px; font-weight: 800; color: #0f172a; line-height: 1; }
              .summary-num.ok { color: #047857; }
              .summary-num.bad { color: #b91c1c; }
              .summary-sm { font-size: 13px; font-weight: 700; color: #94a3b8; }
              .summary-lbl { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; margin-top: 8px; }
              .place-section { margin-bottom: 32px; page-break-inside: avoid; }
              .place-header {
                display: flex; justify-content: space-between; align-items: center;
                padding: 12px 18px; background: #1e40af; border-radius: 10px 10px 0 0;
              }
              .place-header h2 { font-size: 17px; font-weight: 700; color: #ffffff; }
              .place-body { border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px; padding: 18px; }
              .score-badge { padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; }
              .score-1 { background: #fee2e2; color: #991b1b; }
              .score-2 { background: #fef3c7; color: #854d0e; }
              .score-3 { background: #d1fae5; color: #065f46; }
              .tasks-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
              .tasks-table th {
                background: #f8fafc; color: #64748b; font-weight: 700; text-align: left;
                padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;
              }
              .tasks-table th:last-child { text-align: right; }
              .tasks-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; }
              .tasks-table tr:last-child td { border-bottom: none; }
              .result-pill { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; }
              .result-pill.yes { background: #d1fae5; color: #047857; }
              .result-pill.no { background: #fee2e2; color: #b91c1c; }
              .result-pill.na { background: #f1f5f9; color: #94a3b8; }
              .notes-block { background: #f8fafc; padding: 14px 16px; border-left: 3px solid #1e40af; border-radius: 6px; font-size: 13px; color: #334155; margin-bottom: 16px; }
              .photos-label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 10px; }
              .photo-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
              .photo-item { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #ffffff; page-break-inside: avoid; }
              .photo-frame { width: 100%; height: 240px; background: #f1f5f9; }
              .photo-item img { width: 100%; height: 240px; object-fit: cover; display: block; }
              .photo-cap { font-size: 10px; font-weight: 600; color: #64748b; padding: 8px 10px; background: #f8fafc; border-top: 1px solid #eef2f7; text-transform: uppercase; letter-spacing: 0.4px; }
              .result-banner { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; border-radius: 12px; margin-bottom: 32px; }
              .result-banner.pass { background: #ecfdf5; border: 1px solid #a7f3d0; }
              .result-banner.mid { background: #fffbeb; border: 1px solid #fde68a; }
              .result-banner.low { background: #fef2f2; border: 1px solid #fecaca; }
              .rb-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; }
              .rb-verdict { font-size: 22px; font-weight: 800; margin-top: 4px; }
              .result-banner.pass .rb-verdict { color: #047857; }
              .result-banner.mid .rb-verdict { color: #b45309; }
              .result-banner.low .rb-verdict { color: #b91c1c; }
              .rb-score { text-align: right; }
              .rb-pct { font-size: 30px; font-weight: 900; color: #0f172a; line-height: 1; }
              .rb-pct-lbl { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; margin-top: 4px; }
              .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; }
              @media print {
                @page { margin: 12mm; size: A4; }
                body { background: #ffffff; padding: 0; }
                .container { box-shadow: none; border-radius: 0; padding: 0; max-width: 100%; border-top: none; }
                .place-section, .photo-item, .summary-card, .info-item { break-inside: avoid; }
              }
            </style>
          </head>
          <body>
            <div class="container">

              <div class="brandbar">
                <div class="brand">
                  ${branding.logo
        ? `<img src="${branding.logo}" alt="logo" style="width:46px;height:46px;border-radius:12px;object-fit:contain;background:#fff;border:1px solid #e2e8f0;" />`
        : `<div class="brand-logo">${brandInitials}</div>`}
                  <div>
                    <div class="logo-text">${branding.name}</div>
                    <div class="logo-subtitle">${branding.address || 'Professional Cleaning Services'}</div>
                  </div>
                </div>
                <div class="doc-tag">Quality Check Report</div>
              </div>

              <h1 class="report-title">Quality Check Report</h1>
              <div class="report-sub">Detailed inspection summary &amp; photographic evidence</div>

              <div class="result-banner ${verdictClass}">
                <div>
                  <div class="rb-label">Overall Assessment</div>
                  <div class="rb-verdict">${verdict}</div>
                </div>
                <div class="rb-score">
                  <div class="rb-pct">${hasData ? passRate + '%' : '—'}</div>
                  <div class="rb-pct-lbl">Tasks Passed</div>
                </div>
              </div>

              <div class="info-grid">
                <div class="info-item"><span class="info-k">Client</span><span class="info-v">${clientName}</span></div>
                <div class="info-item"><span class="info-k">Address</span><span class="info-v">${escapeHtml(house.address || '—')}</span></div>
                <div class="info-item"><span class="info-k">Team</span><span class="info-v">${teamName}</span></div>
                <div class="info-item"><span class="info-k">Inspector</span><span class="info-v">${inspector}</span></div>
                <div class="info-item"><span class="info-k">Date</span><span class="info-v">${date}</span></div>
                <div class="info-item"><span class="info-k">Areas Inspected</span><span class="info-v">${placesWithBase64.length}</span></div>
              </div>

              <div class="summary">
                <div class="summary-card">
                  <div class="summary-num">${passRate}%</div>
                  <div class="summary-lbl">Pass Rate</div>
                </div>
                <div class="summary-card">
                  <div class="summary-num ok">${yesCount}</div>
                  <div class="summary-lbl">Passed Tasks</div>
                </div>
                <div class="summary-card">
                  <div class="summary-num bad">${noCount}</div>
                  <div class="summary-lbl">Failed Tasks</div>
                </div>
                <div class="summary-card">
                  <div class="summary-num">${avgScore ? avgScore.toFixed(1) : '—'}<span class="summary-sm">${avgScore ? ' /3' : ''}</span></div>
                  <div class="summary-lbl">Avg. Score</div>
                </div>
              </div>

              ${placeSections}

              <div class="footer">
                ${branding.name}${branding.address ? ' • ' + branding.address : ''} • Generated on ${date}
              </div>
            </div>
            <script>
              window.addEventListener('load', function() {
                var images = document.querySelectorAll('img');
                if (images.length === 0) { setTimeout(function(){ window.print(); }, 300); return; }
                var loaded = 0;
                var done = function(){ loaded++; if (loaded >= images.length) setTimeout(function(){ window.print(); }, 500); };
                images.forEach(function(img){ if (img.complete) done(); else { img.addEventListener('load', done); img.addEventListener('error', done); } });
              });
            </script>
          </body>
        </html>
      `;

      // Para el correo: devolvemos el HTML en lugar de abrir la ventana de impresión.
      if (returnHtml) return html;

      // Carga el reporte final en la ventana ya abierta (Blob URL: los scripts del
      // documento y las imágenes base64 funcionan; document.write ya no se usa).
      const blob = new Blob([html], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      if (printWindow) {
        printWindow.location.href = blobUrl;
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) {
      console.error('Error generating Quality Check PDF:', error);
      printWindow?.close();
      alert('Error generando el PDF. Revisa la consola.');
    } finally {
      if (setLoading) setLoading(false);
    }
  };
}