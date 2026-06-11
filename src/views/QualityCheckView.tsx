import { useState, useEffect, useRef } from 'react';
import { 
  ClipboardCheck, X, Camera, MapPin, CalendarDays, Activity, User, Edit2, Trash2,
  Upload, Printer, Loader2, Image as ImageIcon, Search
} from 'lucide-react';
import type { Property, SystemUser, Place, Task } from '../types/index';
import { settingsService } from '../services/settingsService';
import { storageService } from '../services/storageService';
import { compressImage } from '../utils/imageCompression';
import { generatePDFFromHTML } from '../utils/pdfGenerator';
import { db } from '../config/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

interface QCRecord {
  id?: string;
  houseId: string;
  date: string;
  address: string;
  client: string;
  status: 'Finished' | 'Pending';
  inspector?: string;
  qcData?: any;
}

interface QualityCheckViewProps {
  onOpenMenu: () => void;
  properties: Property[]; 
  houseToInspect: Property | null;
  clearHouseToInspect: () => void;
  currentUser?: SystemUser | null;
}

// Genera un id único para previews locales (con fallback si crypto.randomUUID no existe)
const uid = () =>
  (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
    ? (crypto as any).randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function QualityCheckView({ onOpenMenu, properties, houseToInspect, clearHouseToInspect, currentUser }: QualityCheckViewProps) {
  const [qcList, setQcList] = useState<QCRecord[]>([]);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState<Property | null>(null);
  const [editingQcId, setEditingQcId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Finished'>('All');

  const [places, setPlaces] = useState<Place[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // ⭐ Exportar PDF
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [exportingForQcId, setExportingForQcId] = useState<string | null>(null);

  // ⭐ Previews locales mientras las fotos se suben en segundo plano (UX instantáneo)
  const [pendingPhotos, setPendingPhotos] = useState<Record<string, { id: string; preview: string }[]>>({});

  // ⭐ Buscador de áreas dentro del modal
  const [placeSearch, setPlaceSearch] = useState('');

  // ⭐ Refs dinámicas para inputs file y camera (uno por cada place)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const cameraInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [qcData, setQcData] = useState<Record<string, any>>({});

  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoadingCatalogs(true);
      try {
        const [placesData, tasksData, qcSnap] = await Promise.all([
          settingsService.getAll('settings_places').catch(() => []),
          settingsService.getAll('settings_tasks').catch(() => []),
          getDocs(collection(db, 'quality_checks')).catch(() => ({ docs: [] }))
        ]);

        const sortedPlaces = (placesData as Place[]).sort((a, b) => a.name.localeCompare(b.name));
        const sortedTasks = (tasksData as Task[]).sort((a, b) => a.name.localeCompare(b.name));

        setPlaces(sortedPlaces);
        setTasks(sortedTasks);

        const docsArray = (qcSnap as any).docs || [];
        const loadedQCs: QCRecord[] = docsArray.map((document: any) => ({ 
          id: document.id, 
          ...document.data() 
        } as QCRecord));

        loadedQCs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setQcList(loadedQCs);
      } catch (error) {
        console.error("Error loading QC data:", error);
      } finally {
        setIsLoadingCatalogs(false);
      }
    };
    fetchAllData();
  }, []);

  useEffect(() => {
    if (houseToInspect && !isLoadingCatalogs) {
      handleOpenForm(houseToInspect);
      clearHouseToInspect();
    }
  }, [houseToInspect, isLoadingCatalogs]);

  const filteredQcList = qcList.filter(qc => statusFilter === 'All' || qc.status === statusFilter);

  // ⭐ Áreas activas para una casa: si la casa tiene áreas marcadas (qcPlaces),
  //    solo esas; si no marcó ninguna, se muestran todas (compatibilidad).
  const activePlacesFor = (house: Property | null): Place[] => {
    const ids = (house as any)?.qcPlaces as string[] | undefined;
    if (Array.isArray(ids) && ids.length > 0) return places.filter(p => ids.includes(p.id));
    return places;
  };

  const handleOpenForm = (house: Property) => {
    setSelectedHouse(house);
    setEditingQcId(null);
    setPendingPhotos({});
    setPlaceSearch('');
    
    const initialData: any = {};
    places.forEach(p => {
      initialData[p.id] = { tasks: {}, corrections: '', score: null, notes: '', damage: '', photos: [] };
    });
    setQcData(initialData);
    setIsFormModalOpen(true);
  };

  const handleEditQC = (qc: QCRecord) => {
    const house = properties.find(p => p.id === qc.houseId) || null;
    if (!house) {
      alert("The property associated with this report could not be found.");
      return;
    }
    setSelectedHouse(house);
    setEditingQcId(qc.id as string);
    setPendingPhotos({});
    setPlaceSearch('');
    
    const loadedData: any = qc.qcData || {};
    places.forEach(p => {
      if (!loadedData[p.id]) {
        loadedData[p.id] = { tasks: {}, corrections: '', score: null, notes: '', damage: '', photos: [] };
      } else if (!Array.isArray(loadedData[p.id].photos)) {
        // ⭐ Asegurar que photos sea siempre un array (compatibilidad con registros viejos)
        loadedData[p.id].photos = [];
      }
    });
    
    setQcData(loadedData);
    setIsFormModalOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormModalOpen(false);
    setSelectedHouse(null);
    setEditingQcId(null);
    setPendingPhotos({});
    setPlaceSearch('');
  };

  const handleSaveQC = async () => {
    if (!selectedHouse) return;
    setIsSaving(true);
    
    // ⭐ Solo se consideran las áreas activas de esta casa para decidir si está completo.
    const activePlaces = activePlacesFor(selectedHouse);
    let isPending = false;
    activePlaces.forEach(p => {
      const placeTasks = tasks.filter(t => t.placeId === p.id);
      placeTasks.forEach(t => {
        if (!qcData[p.id]?.tasks[t.id]) isPending = true;
      });
    });

    const recordData = {
      houseId: selectedHouse.id,
      date: editingQcId ? (qcList.find(q => q.id === editingQcId)?.date || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0],
      address: selectedHouse.address,
      client: selectedHouse.client,
      status: isPending ? 'Pending' : 'Finished',
      inspector: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown',
      qcData: qcData
    };

    try {
      if (editingQcId) {
        await updateDoc(doc(db, 'quality_checks', editingQcId), recordData);
        setQcList(prev => prev.map(qc => qc.id === editingQcId ? { id: editingQcId, ...recordData } as QCRecord : qc));
      } else {
        const docRef = await addDoc(collection(db, 'quality_checks'), recordData);
        setQcList([{ id: docRef.id, ...recordData } as QCRecord, ...qcList]);
      }
      alert("✅ Quality Check Saved Successfully!");
      handleCloseForm();
    } catch (error) {
      console.error("Error saving Quality Check:", error);
      alert("Error trying to save the record.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteQC = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this Quality Check report? This cannot be undone.")) return;
    
    try {
      await deleteDoc(doc(db, 'quality_checks', id));
      setQcList(prev => prev.filter(qc => qc.id !== id));
    } catch (error) {
      console.error("Error deleting Quality Check:", error);
      alert("Error trying to delete the record.");
    }
  };

  // ⭐ Subir fotos: muestra preview INSTANTÁNEO y sube cada foto en paralelo en
  //    segundo plano. El usuario puede seguir tomando fotos sin esperar.
  //    Ruta en Storage: {Address}/QualityCheck/{PlaceName}/photo_xxx.jpg
  const handlePhotoUpload = async (placeId: string, placeName: string, files: FileList | null) => {
    if (!files || files.length === 0 || !selectedHouse) return;
    const house = selectedHouse;

    // 1) Preview local inmediato (sin esperar compresión ni subida)
    const items = Array.from(files).map(file => ({
      id: uid(),
      preview: URL.createObjectURL(file),
      file
    }));

    setPendingPhotos(prev => ({
      ...prev,
      [placeId]: [...(prev[placeId] || []), ...items.map(({ id, preview }) => ({ id, preview }))]
    }));

    // 2) Comprimir + subir cada foto de forma independiente.
    //    En cuanto una termina, aparece en la galería real y se quita su preview.
    await Promise.all(items.map(async ({ id, preview, file }) => {
      try {
        const compressed = await compressImage(file, { quality: 0.85, maxWidth: 1920, maxSizeMB: 1 });
        const urls = await storageService.uploadQualityCheckPhotos([compressed], house.address, placeName);

        setQcData(prev => ({
          ...prev,
          [placeId]: {
            ...prev[placeId],
            photos: [...(prev[placeId]?.photos || []), ...urls]
          }
        }));
      } catch (error) {
        console.error('Error uploading QC photo:', error);
        alert('Error subiendo una foto. Inténtalo de nuevo.');
      } finally {
        setPendingPhotos(prev => ({
          ...prev,
          [placeId]: (prev[placeId] || []).filter(p => p.id !== id)
        }));
        URL.revokeObjectURL(preview);
      }
    }));
  };

  // ⭐ Eliminar foto del estado (también la borra de Storage)
  const handleRemovePhoto = async (placeId: string, index: number) => {
    if (!window.confirm('¿Eliminar esta foto?')) return;

    const photos = qcData[placeId]?.photos || [];
    const urlToDelete = photos[index];

    setQcData(prev => ({
      ...prev,
      [placeId]: {
        ...prev[placeId],
        photos: photos.filter((_: string, i: number) => i !== index)
      }
    }));

    if (urlToDelete?.startsWith('http')) {
      await storageService.deletePhotoByUrl(urlToDelete);
    }
  };

  // ⭐ Generar PDF profesional del Quality Check.
  const buildAndExportQCPDF = async (
    house: Property,
    qcDataObj: Record<string, any>,
    inspectorName: string,
    recordDate?: string,
    setLoading?: (loading: boolean) => void
  ) => {
    const placesWithData: { place: Place; photos: string[]; tasksData: any; notes: string; damage: string; score: any; corrections: string }[] = [];
    
    places.forEach(p => {
      const data = qcDataObj[p.id];
      if (!data) return;
      const hasPhotos = (data.photos || []).length > 0;
      const hasTasks = Object.keys(data.tasks || {}).length > 0;
      const hasNotes = (data.notes || data.damage || '').trim().length > 0;
      if (hasPhotos || hasTasks || hasNotes) {
        placesWithData.push({
          place: p,
          photos: data.photos || [],
          tasksData: data.tasks || {},
          notes: data.notes || '',
          damage: data.damage || '',
          score: data.score,
          corrections: data.corrections
        });
      }
    });

    if (placesWithData.length === 0) {
      alert('No hay datos para exportar. Este Quality Check no tiene tareas evaluadas, notas ni fotos.');
      return;
    }

    if (setLoading) setLoading(true);

    try {
      console.log(`📥 Preparing images for PDF...`);
      const placesWithBase64 = await Promise.all(
        placesWithData.map(async (pd) => ({
          ...pd,
          photosBase64: await Promise.all(
            pd.photos.map(async (url) => {
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
                console.error('Error loading image:', err);
                return url;
              }
            })
          )
        }))
      );
      console.log(`✅ All images ready`);

      const inspector = inspectorName || 'Unknown';
      const displayDate = recordDate 
        ? new Date(recordDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const date = displayDate;

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
                    <td>${t.name}</td>
                    <td class="${cls}">${val || '—'}</td>
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

        const notesHtml = (pd.notes || pd.damage) ? `
          <div class="notes-block">
            ${pd.notes ? `<div><strong>Notes:</strong> ${pd.notes}</div>` : ''}
            ${pd.damage ? `<div style="margin-top: 8px; color: #b91c1c;"><strong>Damage:</strong> ${pd.damage}</div>` : ''}
          </div>
        ` : '';

        const photosHtml = pd.photosBase64.length > 0 ? `
          <div class="photo-grid">
            ${pd.photosBase64.map((src) => `
              <div class="photo-item">
                <img src="${src}" alt="QC photo" />
              </div>
            `).join('')}
          </div>
        ` : '';

        return `
          <section class="place-section">
            <div class="place-header">
              <h2>${pd.place.name}</h2>
              ${scoreHtml}
            </div>
            ${tasksHtml}
            ${notesHtml}
            ${photosHtml}
          </section>
        `;
      }).join('');

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8" />
            <title>Quality Check Report - ${house.client}</title>
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
              .logo-text {
                font-size: 22px;
                font-weight: 800;
                color: #1e3a8a;
                letter-spacing: 2px;
                line-height: 1;
              }
              .logo-subtitle {
                font-size: 10px;
                font-weight: 500;
                color: #64748b;
                letter-spacing: 3px;
                text-transform: uppercase;
                margin-top: 4px;
              }
              .meta-section {
                text-align: right;
                font-size: 13px;
                color: #475569;
                max-width: 60%;
              }
              .meta-label {
                font-weight: 700;
                color: #0f172a;
              }
              h1.report-title {
                text-align: center;
                font-size: 38px;
                font-weight: 800;
                color: #1e40af;
                margin: 40px 0 16px 0;
              }
              .property-info {
                text-align: center;
                font-size: 14px;
                color: #475569;
                margin-bottom: 40px;
                padding-bottom: 20px;
                border-bottom: 1px solid #e2e8f0;
              }
              .property-info strong { color: #0f172a; }
              .place-section {
                margin-bottom: 40px;
                page-break-inside: avoid;
              }
              .place-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-bottom: 12px;
                border-bottom: 2px solid #1e40af;
                margin-bottom: 16px;
              }
              .place-header h2 {
                font-size: 22px;
                font-weight: 700;
                color: #1e40af;
              }
              .score-badge {
                padding: 6px 14px;
                border-radius: 20px;
                font-size: 13px;
                font-weight: 700;
              }
              .score-1 { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
              .score-2 { background: #fef9c3; color: #854d0e; border: 1px solid #fde68a; }
              .score-3 { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
              .tasks-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 16px;
                font-size: 13px;
              }
              .tasks-table th {
                background: #f8fafc;
                color: #64748b;
                font-weight: 700;
                text-align: left;
                padding: 10px 12px;
                border-bottom: 1px solid #e2e8f0;
                text-transform: uppercase;
                font-size: 11px;
                letter-spacing: 0.5px;
              }
              .tasks-table td {
                padding: 10px 12px;
                border-bottom: 1px solid #f1f5f9;
              }
              .tasks-table td.yes { color: #047857; font-weight: 700; }
              .tasks-table td.no { color: #b91c1c; font-weight: 700; }
              .tasks-table td.na { color: #94a3b8; }
              .notes-block {
                background: #f8fafc;
                padding: 14px 16px;
                border-left: 3px solid #1e40af;
                border-radius: 4px;
                font-size: 13px;
                color: #334155;
                margin-bottom: 16px;
              }
              .photo-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 12px;
                margin-top: 12px;
              }
              .photo-item {
                aspect-ratio: 1 / 1;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 2px 6px rgba(0,0,0,0.1);
                background-color: #f1f5f9;
                page-break-inside: avoid;
              }
              .photo-item img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
              }
              .footer {
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #e2e8f0;
                text-align: center;
                font-size: 11px;
                color: #94a3b8;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div>
                  <div class="logo-text">PRECISE CLEANING</div>
                  <div class="logo-subtitle">Professional Services</div>
                </div>
                <div class="meta-section">
                  <div><span class="meta-label">Inspector:</span> ${inspector}</div>
                  <div><span class="meta-label">Date:</span> ${date}</div>
                </div>
              </div>

              <h1 class="report-title">Quality Check Report</h1>
              <div class="property-info">
                <strong>${house.client}</strong> • ${house.address}
              </div>

              ${placeSections}

              <div class="footer">
                ${house.client} • Generated on ${date} • Precise Cleaning Services
              </div>
            </div>
          </body>
        </html>
      `;

      const safeClient = (house.client || 'Report').replace(/[^a-zA-Z0-9-_ ]/g, '').trim();
      const safeDate = recordDate || new Date().toISOString().split('T')[0];
      await generatePDFFromHTML(html, {
        filename: `Quality-Check-${safeClient}-${safeDate}.pdf`,
        format: 'a4',
        orientation: 'portrait'
      });
    } catch (error) {
      console.error('Error generating Quality Check PDF:', error);
      alert('Error generando el PDF. Revisa la consola.');
    } finally {
      if (setLoading) setLoading(false);
    }
  };

  const handleExportFromModal = async () => {
    if (!selectedHouse) return;
    const inspector = currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown';
    await buildAndExportQCPDF(selectedHouse, qcData, inspector, undefined, setIsExportingPDF);
  };

  const handleExportFromTable = async (qc: QCRecord) => {
    const house = properties.find(p => p.id === qc.houseId);
    if (!house) {
      alert('No se encontró la propiedad asociada a este reporte.');
      return;
    }
    const inspector = qc.inspector || 'Unknown';
    const recordQcData = (qc.qcData as Record<string, any>) || {};
    
    setExportingForQcId(qc.id as string);
    try {
      await buildAndExportQCPDF(house, recordQcData, inspector, qc.date);
    } finally {
      setExportingForQcId(null);
    }
  };

  const setTaskValue = (placeId: string, taskId: string, value: 'Yes' | 'No') => {
    setQcData(prev => ({
      ...prev, [placeId]: { ...prev[placeId], tasks: { ...prev[placeId].tasks, [taskId]: value } }
    }));
  };

  const setCorrectionValue = (placeId: string, value: 'Yes' | 'No') => {
    setQcData(prev => ({ ...prev, [placeId]: { ...prev[placeId], corrections: value } }));
  };

  const setScoreValue = (placeId: string, value: number) => {
    setQcData(prev => ({ ...prev, [placeId]: { ...prev[placeId], score: value } }));
  };

  const handleTextChange = (placeId: string, field: 'notes' | 'damage', value: string) => {
    setQcData(prev => ({ ...prev, [placeId]: { ...prev[placeId], [field]: value } }));
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const [year, month, day] = dateString.split('-');
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const s = {
    th: { backgroundColor: '#f9fafb', padding: '12px 16px', color: '#6b7280', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb', textAlign: 'left' as const },
    td: { padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#111827', fontSize: '0.95rem' },
    closeBtn: { background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
    cardTitle: { color: '#3b82f6', fontSize: '1.1rem', borderBottom: '2px solid #3b82f6', paddingBottom: '8px', marginTop: 0, fontWeight: 600 },
    taskItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid #eee' },
    // Las funciones de botón solo devuelven color dinámico; el tamaño/padding lo da la clase .qc-toggle
    btnYes: (active: boolean) => ({ border: active ? '1px solid #22c55e' : '1px solid #e1e4e8', backgroundColor: active ? '#22c55e' : 'white', color: active ? 'white' : '#111827' }),
    btnNo: (active: boolean) => ({ border: active ? '1px solid #ef4444' : '1px solid #e1e4e8', backgroundColor: active ? '#ef4444' : 'white', color: active ? 'white' : '#111827' }),
    btnScore: (active: boolean) => ({ border: active ? '1px solid #3b82f6' : '1px solid #e1e4e8', backgroundColor: active ? '#3b82f6' : 'white', color: active ? 'white' : '#111827' }),
    extraFields: { marginTop: '15px', backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px dashed #ccc' },
    labelQC: { display: 'block', fontWeight: 'bold' as const, fontSize: '11px', margin: '10px 0 5px', color: '#555', textTransform: 'uppercase' as const },
    textareaQC: { width: '100%', height: '60px', border: '1px solid #e1e4e8', borderRadius: '6px', padding: '10px', boxSizing: 'border-box' as const, outline: 'none', fontFamily: 'inherit', backgroundColor: '#ffffff', color: '#111827', fontSize: '0.9rem', resize: 'vertical' as const },
    btnSaveQC: { backgroundColor: '#22c55e', color: 'white', padding: '15px 60px', border: 'none', borderRadius: '30px', fontWeight: 'bold' as const, cursor: 'pointer', fontSize: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', opacity: isSaving ? 0.7 : 1 },
    pillBtn: (active: boolean) => ({ padding: '6px 16px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: active ? '#3b82f6' : '#f1f5f9', color: active ? 'white' : '#64748b', transition: 'all 0.2s' })
  };

  // ⭐ Áreas a renderizar: activas de la casa, con tareas configuradas y que pasen el buscador.
  const activePlaces = activePlacesFor(selectedHouse);
  const placeQuery = placeSearch.trim().toLowerCase();
  const renderablePlaces = activePlaces
    .filter(p => tasks.some(t => t.placeId === p.id))
    .filter(p => !placeQuery || p.name.toLowerCase().includes(placeQuery));

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <style>{`
        .spin-qc { animation: spin-qc 1s linear infinite; }
        @keyframes spin-qc { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* ===== MODAL RESPONSIVE: 80% en escritorio / pantalla completa nativa en móvil ===== */
        .qc-overlay {
          position: fixed; inset: 0;
          background-color: rgba(15, 23, 42, 0.5);
          backdrop-filter: blur(3px);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 24px; box-sizing: border-box; overflow: hidden;
        }
        .qc-modal {
          background-color: #eaeff2;
          width: 80vw; max-width: 1400px;
          height: 82vh;
          border-radius: 16px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
          display: flex; flex-direction: column; overflow: hidden;
        }
        .qc-header {
          background-color: #3b82f6; color: #fff;
          padding: 18px 20px;
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 12px; flex-shrink: 0;
        }
        .qc-title { margin: 0; font-size: 1.3rem; display: flex; align-items: center; gap: 8px; }
        .qc-prop { margin: 8px 0 0; font-size: 0.95rem; opacity: 0.9; }
        .qc-insp { margin: 4px 0 0; font-size: 0.85rem; opacity: 0.8; display: flex; align-items: center; gap: 4px; }

        /* ===== Buscador de áreas ===== */
        .qc-search-bar { flex-shrink: 0; padding: 12px 20px; background: #eaeff2; border-bottom: 1px solid #d8dee4; }
        .qc-search { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 0 12px; height: 44px; }
        .qc-search input { flex: 1; border: none; outline: none; background: transparent; color: #111827; font-size: 0.95rem; height: 100%; min-width: 0; }
        .qc-search button { background: none; border: none; color: #94a3b8; cursor: pointer; display: flex; align-items: center; padding: 4px; }

        .qc-body {
          padding: 20px; overflow-y: auto; -webkit-overflow-scrolling: touch;
          display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
          gap: 20px; flex: 1; align-content: start;
        }
        .qc-savebar {
          padding: 14px; text-align: center;
          border-top: 3px solid #22c55e; background-color: #fff;
          flex-shrink: 0;
          padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px));
        }
        .qc-savebar button { box-sizing: border-box; }

        .qc-card { background: #fff; border-radius: 10px; border: 1px solid #e1e4e8; padding: 20px; }

        .qc-toggle {
          padding: 8px 16px; border-radius: 6px; cursor: pointer;
          font-weight: 700; font-size: 0.9rem; transition: all 0.2s;
          min-width: 52px; -webkit-tap-highlight-color: transparent;
        }

        .qc-photo-actions { display: flex; gap: 8px; margin-bottom: 12px; }
        .qc-photo-btn {
          flex: 1; min-height: 46px; padding: 10px 12px; border-radius: 8px;
          font-weight: 600; font-size: 0.85rem; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          background: #fff; color: #2563eb; border: 1px solid #bfdbfe;
          -webkit-tap-highlight-color: transparent;
        }
        .qc-photo-btn-primary { background: #2563eb; color: #fff; border-color: #2563eb; }

        .qc-photo-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
          gap: 8px; margin-bottom: 12px;
        }

        /* ===== MÓVIL: experiencia nativa ===== */
        @media (max-width: 768px) {
          .qc-overlay { padding: 0; }
          .qc-modal {
            width: 100vw; max-width: none;
            height: 100vh; height: 100dvh;
            border-radius: 0;
          }
          .qc-header { padding: 14px 16px; }
          .qc-title { font-size: 1.05rem; }
          .qc-prop { font-size: 0.8rem; }
          .qc-insp { font-size: 0.72rem; }
          .qc-export-label { display: none; }
          .qc-search-bar { padding: 10px 12px; }
          .qc-search { height: 46px; }
          .qc-body { grid-template-columns: 1fr; padding: 12px; gap: 14px; }
          .qc-card { padding: 14px; }
          .qc-toggle { padding: 12px 16px; font-size: 0.95rem; min-width: 60px; }
          .qc-photo-btn { min-height: 54px; font-size: 0.95rem; }
          .qc-photo-btn-primary { flex: 1.5; }
          .qc-photo-grid { grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); }
          .qc-savebar button { width: 100%; }
        }
      `}</style>

      <header className="main-header" style={{ marginBottom: '24px' }}>
        <div className="view-header-title-group" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="hamburger-btn" onClick={onOpenMenu} aria-label="Open menu" style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div>
            <h1 style={{ margin: 0, color: '#111827', fontSize: '2rem' }}>Quality Check Reports</h1>
            <p style={{ marginTop: '4px', color: '#6b7280' }}>History and status of house inspections</p>
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button onClick={() => setStatusFilter('All')} style={s.pillBtn(statusFilter === 'All')}>All</button>
        <button onClick={() => setStatusFilter('Pending')} style={s.pillBtn(statusFilter === 'Pending')}>Pending</button>
        <button onClick={() => setStatusFilter('Finished')} style={s.pillBtn(statusFilter === 'Finished')}>Finished</button>
      </div>

      <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', width: '100%', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
            <thead>
              <tr>
                <th style={{...s.th, width: '130px'}}>Actions</th>
                <th style={{...s.th, width: '120px'}}><CalendarDays size={14} style={{display: 'inline', marginRight: '6px', verticalAlign: 'middle'}}/> Date</th>
                <th style={s.th}><User size={14} style={{display: 'inline', marginRight: '6px', verticalAlign: 'middle'}}/> Client</th>
                <th style={s.th}><MapPin size={14} style={{display: 'inline', marginRight: '6px', verticalAlign: 'middle'}}/> Address</th>
                <th style={{...s.th, textAlign: 'right'}}><Activity size={14} style={{display: 'inline', marginRight: '6px', verticalAlign: 'middle'}}/> Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingCatalogs ? (
                <tr><td colSpan={5} style={{ ...s.td, textAlign: 'center', color: '#6b7280', fontStyle: 'italic', padding: '30px' }}>Loading records from database...</td></tr>
              ) : filteredQcList.length === 0 ? (
                <tr><td colSpan={5} style={{ ...s.td, textAlign: 'center', color: '#6b7280', fontStyle: 'italic', padding: '30px' }}>No Quality Checks found.</td></tr>
              ) : (
                filteredQcList.map((qc) => (
                  <tr key={qc.id} style={{ transition: 'background-color 0.2s', borderBottom: '1px solid #f1f5f9' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <td style={s.td}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button 
                          onClick={() => handleEditQC(qc)} 
                          title="Edit Quality Check"
                          style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleExportFromTable(qc)} 
                          disabled={exportingForQcId === qc.id}
                          title="Export PDF Report"
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            color: '#059669', 
                            cursor: exportingForQcId === qc.id ? 'wait' : 'pointer', 
                            padding: '4px',
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            opacity: exportingForQcId === qc.id ? 0.6 : 1
                          }}
                        >
                          {exportingForQcId === qc.id 
                            ? <Loader2 size={16} className="spin-qc" /> 
                            : <Printer size={16} />
                          }
                        </button>
                        <button 
                          onClick={() => handleDeleteQC(qc.id as string)} 
                          title="Delete Quality Check"
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                    <td style={s.td}>{formatDate(qc.date)}</td>
                    <td style={{...s.td, fontWeight: 600}}>{qc.client}</td>
                    <td style={{...s.td, color: '#6b7280'}}>
                      <div>{qc.address}</div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '4px' }}>Inspected by: {qc.inspector || 'Unknown'}</div>
                    </td>
                    <td style={{...s.td, textAlign: 'right'}}>
                      <span style={{ 
                        backgroundColor: qc.status === 'Finished' ? '#dcfce7' : '#fef3c7', 
                        color: qc.status === 'Finished' ? '#166534' : '#b45309', 
                        padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 
                      }}>
                        {qc.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- MODAL DE QUALITY CHECK --- */}
      {isFormModalOpen && selectedHouse && (
        <div className="qc-overlay">
          <div className="qc-modal">
            
            <div className="qc-header">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 className="qc-title">
                  <ClipboardCheck size={22}/> Quality Check Inspection
                </h1>
                <p className="qc-prop">
                  Property: <strong style={{backgroundColor: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: '4px'}}>{selectedHouse.client} - {selectedHouse.address}</strong>
                </p>
                <p className="qc-insp">
                  <User size={14} /> Inspector: {currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown User'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                <button
                  onClick={handleExportFromModal}
                  disabled={isExportingPDF || isLoadingCatalogs}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    color: 'white',
                    border: '1px solid rgba(255,255,255,0.3)',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: isExportingPDF ? 'wait' : 'pointer',
                    opacity: isExportingPDF ? 0.7 : 1
                  }}
                  title="Generate PDF Report"
                >
                  {isExportingPDF ? <Loader2 size={16} className="spin-qc" /> : <Printer size={16} />}
                  <span className="qc-export-label">{isExportingPDF ? 'Exporting...' : 'Export PDF'}</span>
                </button>
                <button style={s.closeBtn} onClick={handleCloseForm}><X size={24} /></button>
              </div>
            </div>

            {/* ⭐ Buscador de áreas */}
            {!isLoadingCatalogs && places.length > 0 && (
              <div className="qc-search-bar">
                <div className="qc-search">
                  <Search size={16} color="#94a3b8" />
                  <input
                    type="text"
                    value={placeSearch}
                    onChange={(e) => setPlaceSearch(e.target.value)}
                    placeholder="Buscar área (Bathroom, Kitchen, Bedroom...)"
                  />
                  {placeSearch && (
                    <button type="button" onClick={() => setPlaceSearch('')} aria-label="Limpiar búsqueda">
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>
            )}
            
            <div className="qc-body">
              
              {isLoadingCatalogs ? (
                <div style={{ color: '#6b7280', padding: '20px', textAlign: 'center', gridColumn: '1 / -1' }}>
                  Loading Inspection Checklist...
                </div>
              ) : places.length === 0 ? (
                <div style={{ color: '#ef4444', padding: '20px', textAlign: 'center', gridColumn: '1 / -1', backgroundColor: '#fef2f2', borderRadius: '8px' }}>
                  Please go to Settings &gt; Places and configure your rooms and tasks first.
                </div>
              ) : renderablePlaces.length === 0 ? (
                <div style={{ color: '#6b7280', padding: '30px', textAlign: 'center', gridColumn: '1 / -1', backgroundColor: 'white', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                  {placeSearch
                    ? `No se encontraron áreas para "${placeSearch}".`
                    : 'Esta casa no tiene áreas asignadas para inspeccionar. Configúralas en el formulario de la casa (Houses).'}
                </div>
              ) : (
                renderablePlaces.map(place => {
                  const placeData = qcData[place.id] || { tasks: {}, photos: [] };
                  const placeTasks = tasks.filter(t => t.placeId === place.id);
                  const placePhotos: string[] = placeData.photos || [];
                  const pending = pendingPhotos[place.id] || [];

                  return (
                    <div key={place.id} className="qc-card">
                      <h2 style={s.cardTitle}>{place.name}</h2>
                      
                      <div style={{ marginBottom: '16px' }}>
                        {placeTasks.map(task => (
                          <div key={task.id} style={s.taskItem}>
                            <span style={{ fontSize: '0.95rem', color: '#374151' }}>{task.name}</span>
                            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                              <button className="qc-toggle" onClick={() => setTaskValue(place.id, task.id, 'Yes')} style={s.btnYes(placeData.tasks[task.id] === 'Yes')}>Yes</button>
                              <button className="qc-toggle" onClick={() => setTaskValue(place.id, task.id, 'No')} style={s.btnNo(placeData.tasks[task.id] === 'No')}>No</button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={s.extraFields}>
                        <label style={s.labelQC}>¿Correcciones del Manager?</label>
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                          <button className="qc-toggle" onClick={() => setCorrectionValue(place.id, 'Yes')} style={s.btnYes(placeData.corrections === 'Yes')}>Yes</button>
                          <button className="qc-toggle" onClick={() => setCorrectionValue(place.id, 'No')} style={s.btnNo(placeData.corrections === 'No')}>No</button>
                        </div>

                        <label style={s.labelQC}>Score (1-3)</label>
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                          {[1, 2, 3].map(num => (
                            <button key={num} className="qc-toggle" onClick={() => setScoreValue(place.id, num)} style={s.btnScore(placeData.score === num)}>{num}</button>
                          ))}
                        </div>
                        
                        {/* ⭐ Sección de fotos — cámara como acción principal */}
                        <label style={s.labelQC}>
                          Fotos ({placePhotos.length}{pending.length ? ` · ${pending.length} subiendo…` : ''})
                        </label>
                        
                        <div className="qc-photo-actions">
                          <button
                            type="button"
                            className="qc-photo-btn qc-photo-btn-primary"
                            onClick={() => cameraInputRefs.current[place.id]?.click()}
                          >
                            <Camera size={16} /> Tomar foto
                          </button>
                          <input
                            ref={el => { cameraInputRefs.current[place.id] = el; }}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              handlePhotoUpload(place.id, place.name, e.target.files);
                              if (e.target) e.target.value = '';
                            }}
                          />

                          <button
                            type="button"
                            className="qc-photo-btn"
                            onClick={() => fileInputRefs.current[place.id]?.click()}
                          >
                            <Upload size={14} /> Galería
                          </button>
                          <input
                            ref={el => { fileInputRefs.current[place.id] = el; }}
                            type="file"
                            multiple
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              handlePhotoUpload(place.id, place.name, e.target.files);
                              if (e.target) e.target.value = '';
                            }}
                          />
                        </div>

                        {(placePhotos.length === 0 && pending.length === 0) ? (
                          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', padding: '20px', backgroundColor: 'white', borderRadius: '6px', border: '2px dashed #cbd5e1', marginBottom: '12px' }}>
                            <ImageIcon size={28} style={{ margin: '0 auto 6px', opacity: 0.4 }} />
                            <div>Aún no hay fotos.</div>
                          </div>
                        ) : (
                          <div className="qc-photo-grid">
                            {/* Fotos ya subidas (eliminables) */}
                            {placePhotos.map((url, i) => (
                              <div key={`p-${i}`} style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', backgroundColor: 'white' }}>
                                <img src={url} alt={`QC ${i + 1}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                <button
                                  onClick={() => handleRemovePhoto(place.id, i)}
                                  style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(239, 68, 68, 0.95)', color: 'white', border: 'none', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
                                >
                                  <X size={13} />
                                </button>
                                <div style={{ position: 'absolute', bottom: '3px', left: '3px', backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', padding: '1px 5px', borderRadius: '8px', fontSize: '0.6rem', fontWeight: 600 }}>
                                  {String(i + 1).padStart(2, '0')}
                                </div>
                              </div>
                            ))}

                            {/* Previews locales (subiendo en segundo plano) */}
                            {pending.map(p => (
                              <div key={p.id} style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: '6px', overflow: 'hidden', border: '1px solid #e2e8f0', backgroundColor: '#f1f5f9' }}>
                                <img src={p.preview} alt="Subiendo…" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.45 }} />
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.35)' }}>
                                  <Loader2 size={22} className="spin-qc" color="#2563eb" />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <label style={s.labelQC}>Notas</label>
                        <textarea 
                          style={{...s.textareaQC, marginBottom: '12px'}} 
                          value={placeData.notes || ''} 
                          onChange={(e) => handleTextChange(place.id, 'notes', e.target.value)}
                        />

                        <label style={s.labelQC}>Daños</label>
                        <textarea 
                          style={s.textareaQC} 
                          value={placeData.damage || ''} 
                          onChange={(e) => handleTextChange(place.id, 'damage', e.target.value)}
                        />
                      </div>
                    </div>
                  );
                })
              )}

            </div>
            
            <div className="qc-savebar">
              <button style={s.btnSaveQC} onClick={handleSaveQC} disabled={isLoadingCatalogs || places.length === 0 || isSaving}>
                {isSaving ? 'GUARDANDO...' : 'GUARDAR TODO'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}