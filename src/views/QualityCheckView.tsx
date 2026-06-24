import { useState, useEffect, useRef } from 'react';
import {
  ClipboardCheck, X, Camera, MapPin, CalendarDays, Activity, User, Users, Edit2, Trash2,
  Upload, Printer, Loader2, Image as ImageIcon, Search, Check, Mail, AlertTriangle, Repeat
} from 'lucide-react';
import type { Property, SystemUser, Place, Task } from '../types/index';
import { settingsService } from '../services/settingsService';
import { storageService } from '../services/storageService';
import { compressImage } from '../utils/imageCompression';
import { statusHistoryService } from '../services/statusHistoryService';
import { db } from '../config/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

interface QCRecord {
  id?: string;
  houseId: string;
  date: string;
  address: string;
  client: string;
  team?: string;
  status: 'Finished' | 'Pending';
  result?: 'passed' | 'failed' | null;
  inspector?: string;
  selectedPlaces?: string[];
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
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Finished' | 'Recall'>('All');
  const [tableSearch, setTableSearch] = useState('');

  const [places, setPlaces] = useState<Place[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [customersList, setCustomersList] = useState<any[]>([]);
  // ⭐ Catálogo de estados para detectar las casas en "Quality Check"
  const [statuses, setStatuses] = useState<any[]>([]);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // ⭐ Exportar PDF
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [exportingForQcId, setExportingForQcId] = useState<string | null>(null);

  // ⭐ Previews locales mientras las fotos se suben en segundo plano (UX instantáneo)
  const [pendingPhotos, setPendingPhotos] = useState<Record<string, { id: string; preview: string }[]>>({});

  // ⭐ Buscador de áreas dentro del modal
  const [placeSearch, setPlaceSearch] = useState('');

  // ⭐ Áreas seleccionadas para inspeccionar en el modal
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);

  // ⭐ Envío por email
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('jesuslevinole@gmail.com');
  const [emailCtx, setEmailCtx] = useState<{ subject: string; body: string } | null>(null);
  const [emailExport, setEmailExport] = useState<null | (() => Promise<void> | void)>(null);

  // ⭐ Refs dinámicas para inputs file y camera (uno por cada place)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const cameraInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [qcData, setQcData] = useState<Record<string, any>>({});

  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoadingCatalogs(true);
      try {
        const [placesData, tasksData, teamsData, statusesData, customersSnap, qcSnap] = await Promise.all([
          settingsService.getAll('settings_places').catch(() => []),
          settingsService.getAll('settings_tasks').catch(() => []),
          settingsService.getAll('settings_teams').catch(() => []),
          settingsService.getAll('settings_statuses').catch(() => []),
          getDocs(collection(db, 'customers')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'quality_checks')).catch(() => ({ docs: [] }))
        ]);

        const sortedPlaces = (placesData as Place[]).sort((a, b) => a.name.localeCompare(b.name));
        const sortedTasks = (tasksData as Task[]).sort((a, b) => a.name.localeCompare(b.name));

        setPlaces(sortedPlaces);
        setTasks(sortedTasks);
        setTeams(teamsData as any[]);
        setStatuses(statusesData as any[]);
        setCustomersList(((customersSnap as any).docs || []).map((d: any) => ({ id: d.id, ...d.data() })));

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

  // ⭐ Resuelve el nombre del equipo asociado a una casa (teamId puede ser id o nombre)
  const getTeamNameForHouse = (house?: Property | null): string => {
    if (!house) return '—';
    const tid = (house as any).teamId;
    if (!tid) return 'Unassigned';
    const found = teams.find((t: any) => String(t.id) === String(tid) || String(t.name) === String(tid));
    return found ? found.name : 'Unassigned';
  };

  // ⭐ Resuelve el nombre del cliente desde la colección customers (id o nombre)
  const getClientName = (clientIdOrName?: string | null): string => {
    if (!clientIdOrName) return 'Unknown';
    const safe = String(clientIdOrName).toLowerCase().trim();
    const found = customersList.find((c: any) => String(c.id).toLowerCase().trim() === safe || String(c.name).toLowerCase().trim() === safe);
    return found ? found.name : String(clientIdOrName);
  };

  // ⭐ Determina si una casa tiene estado "Quality Check" (resuelve id o nombre del status)
  const isQualityCheckStatus = (house: Property): boolean => {
    const sid = (house as any).statusId;
    const st = statuses.find((s: any) => String(s.id) === String(sid) || String(s.name) === String(sid));
    const name = String(st?.name || sid || '').toLowerCase().trim();
    return name === 'qc' || name.includes('quality check') || name.includes('quality-check');
  };

  // ⭐ Id del estado "Quality Check" (para regresar una casa cuando NO pasó)
  const getQualityCheckStatusId = (): string | null => {
    const st = statuses.find((s: any) => {
      const n = String(s.name || '').toLowerCase().trim();
      return n === 'qc' || n.includes('quality check') || n.includes('quality-check');
    });
    return st ? st.id : null;
  };

  // ⭐ Pistas de texto para reconocer un estado de "Recall"
  const RECALL_HINTS = ['recall', 're-call', 're call', 'recleaning', 're-clean', 'callback', 'call back'];

  // ⭐ Id del estado "Recall" (cuando un QC NO pasa, la casa pasa a Recall)
  const getRecallStatusId = (): string | null => {
    const st = statuses.find((s: any) => {
      const n = String(s.name || '').toLowerCase().trim();
      return RECALL_HINTS.some(h => n.includes(h));
    });
    return st ? st.id : null;
  };

  // ⭐ Resuelve el nombre de un status a partir de id o nombre
  const resolveStatusName = (idOrName?: string | null): string => {
    if (!idOrName) return '';
    const safe = String(idOrName).toLowerCase().trim();
    const f = statuses.find((s: any) => String(s.id).toLowerCase().trim() === safe || String(s.name).toLowerCase().trim() === safe);
    return f ? f.name : String(idOrName);
  };

  // ⭐ Clasifica un QC en uno de los tres grupos:
  //    - Recall:   se presionó "DID NOT PASS" (result === 'failed')
  //    - Finished: inspección terminada y guardada con "Guardar Todo" (pasó)
  //    - Pending:  llegó a Quality Check y aún no se completa la inspección
  const qcCategory = (qc: QCRecord): 'Pending' | 'Finished' | 'Recall' => {
    if (qc.result === 'failed') return 'Recall';
    if (qc.status === 'Finished') return 'Finished';
    return 'Pending';
  };

  // ⭐ Último reporte de QC registrado para una casa
  const latestQCForHouse = (houseId: string): QCRecord | undefined => {
    const recs = qcList.filter(q => q.houseId === houseId);
    if (recs.length === 0) return undefined;
    return recs.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  };

  // ⭐ ¿El último QC de la casa NO pasó?
  const houseFailedQC = (houseId: string): boolean => {
    const r = latestQCForHouse(houseId);
    return !!r && r.result === 'failed';
  };

  // ⭐ ¿El último QC de la casa ya pasó (Finished y no fallido)? -> sale de pendientes
  const housePassedQC = (houseId: string): boolean => {
    const r = latestQCForHouse(houseId);
    return !!r && r.status === 'Finished' && r.result !== 'failed';
  };

  // ⭐ Fecha en formato mm/dd/YYYY
  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const [year, month, day] = dateString.split('-');
    if (!year || !month || !day) return dateString;
    return `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
  };

  // ⭐ PENDING = casas en estado "Quality Check" que aún esperan inspección
  //    (sin QC aprobado y sin QC reprobado: las reprobadas viven en Recall).
  const pendingQCHouses = properties.filter(h => isQualityCheckStatus(h) && !housePassedQC(h.id) && !houseFailedQC(h.id));

  // ⭐ ¿La casa/registro coincide con la búsqueda?
  const matchesSearch = (text: string[]) => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return true;
    return text.filter(Boolean).join(' ').toLowerCase().includes(q);
  };

  // ⭐ Casas pendientes ya filtradas por el buscador
  const filteredPendingHouses = pendingQCHouses.filter(h =>
    matchesSearch([h.address, getClientName(h.client), getTeamNameForHouse(h), String(h.client)])
  );

  // ⭐ Registros para la TABLA inferior: SOLO Finished y Recall.
  //    (Las Pending no se listan aquí: se muestran como tarjetas de "casas
  //    pendientes". Así cada pestaña filtra exactamente lo que indica su nombre.)
  const filteredQcList = qcList.filter(qc => {
    const cat = qcCategory(qc);
    if (cat === 'Pending') return false; // las pendientes van en las tarjetas de arriba
    if (statusFilter === 'Pending') return false; // en la pestaña Pending la tabla se oculta
    if (statusFilter === 'Finished' && cat !== 'Finished') return false;
    if (statusFilter === 'Recall' && cat !== 'Recall') return false;
    return matchesSearch([qc.status, cat, qc.result === 'failed' ? 'did not pass recall' : '', formatDate(qc.date), qc.date, qc.address, qc.client, getClientName(qc.client), qc.team || getTeamNameForHouse(properties.find(p => p.id === qc.houseId)), qc.inspector || '']);
  });

  // ⭐ Conteos de las pestañas (coherentes con lo que se ve):
  //    Pending = casas esperando inspección · Finished/Recall = registros de QC.
  const finishedCount = qcList.filter(q => qcCategory(q) === 'Finished').length;
  const recallCount = qcList.filter(q => qcCategory(q) === 'Recall').length;
  const groupCounts = {
    All: pendingQCHouses.length + finishedCount + recallCount,
    Pending: pendingQCHouses.length,
    Finished: finishedCount,
    Recall: recallCount,
  };

  // ⭐ ¿Mostrar cada bloque según la pestaña activa?
  const showPendingBlock = statusFilter === 'All' || statusFilter === 'Pending';
  const showRecordsTable = statusFilter !== 'Pending';

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
    setSelectedPlaceIds([]);

    const initialData: any = {};
    places.forEach(p => {
      initialData[p.id] = { tasks: {}, corrections: '', score: null, notes: '', damage: '', photos: [] };
    });
    setQcData(initialData);
    setIsFormModalOpen(true);
  };

  // ⭐ Abrir QC para una casa pendiente: si ya existe un reporte abierto (Pending o
  //    que NO pasó), se edita ese; de lo contrario se crea uno nuevo. Evita duplicados.
  const handleStartOrContinueQC = (house: Property) => {
    const existing = latestQCForHouse(house.id);
    if (existing && (existing.status === 'Pending' || existing.result === 'failed')) {
      handleEditQC(existing);
    } else {
      handleOpenForm(house);
    }
  };

  const handleEditQC = (qc: QCRecord) => {
    // Si la propiedad no está en el listado, usamos los datos guardados en el reporte.
    const house = (properties.find(p => p.id === qc.houseId) || { id: qc.houseId, address: qc.address, client: qc.client }) as Property;
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

    // ⭐ Restaurar áreas seleccionadas: usa las guardadas o, si no hay, deriva las que tengan datos
    const derived = places
      .filter(p => {
        const d = loadedData[p.id];
        if (!d) return false;
        return Object.keys(d.tasks || {}).length > 0
          || (d.photos || []).length > 0
          || (d.notes || '').trim().length > 0
          || (d.damage || '').trim().length > 0
          || d.score != null
          || (d.corrections || '').trim().length > 0;
      })
      .map(p => p.id);
    setSelectedPlaceIds(qc.selectedPlaces && qc.selectedPlaces.length ? qc.selectedPlaces : derived);

    setIsFormModalOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormModalOpen(false);
    setSelectedHouse(null);
    setEditingQcId(null);
    setPendingPhotos({});
    setPlaceSearch('');
    setSelectedPlaceIds([]);
  };

  const togglePlaceSelection = (placeId: string) => {
    setSelectedPlaceIds(prev => prev.includes(placeId) ? prev.filter(x => x !== placeId) : [...prev, placeId]);
  };

  // ⭐ Guardar QC. forceFail = true -> "DID NOT PASS": queda Finished+failed (grupo
  //    "Recall" en esta vista) y la casa pasa al estado "Recall" en el pipeline,
  //    apareciendo también en la vista de Recalls para que el equipo la corrija.
  const handleSaveQC = async (forceFail = false) => {
    if (!selectedHouse) return;

    if (forceFail) {
      const ok = window.confirm('¿Marcar este Quality Check como "DID NOT PASS"? La casa pasará a Recall para que el equipo la corrija y se vuelva a inspeccionar, y aparecerá en la vista de Recalls.');
      if (!ok) return;
    }

    setIsSaving(true);

    // Solo se consideran las áreas SELECCIONADAS para decidir si está completo.
    const activePlaces = activePlacesFor(selectedHouse).filter(p => selectedPlaceIds.includes(p.id));
    let isPending = activePlaces.length === 0;
    activePlaces.forEach(p => {
      const placeTasks = tasks.filter(t => t.placeId === p.id);
      placeTasks.forEach(t => {
        if (!qcData[p.id]?.tasks[t.id]) isPending = true;
      });
    });

    const finalStatus: 'Pending' | 'Finished' = forceFail ? 'Finished' : (isPending ? 'Pending' : 'Finished');
    const finalResult: 'passed' | 'failed' | null = forceFail ? 'failed' : (isPending ? null : 'passed');

    const recordData: any = {
      houseId: selectedHouse.id,
      date: editingQcId ? (qcList.find(q => q.id === editingQcId)?.date || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0],
      address: selectedHouse.address,
      client: selectedHouse.client,
      team: (editingQcId && qcList.find(q => q.id === editingQcId)?.team) || getTeamNameForHouse(selectedHouse),
      status: finalStatus,
      result: finalResult,
      inspector: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown',
      selectedPlaces: selectedPlaceIds,
      qcData: qcData
    };

    try {
      if (editingQcId) {
        await updateDoc(doc(db, 'quality_checks', editingQcId), recordData);
        setQcList(prev => prev.map(qc => qc.id === editingQcId ? { id: editingQcId, ...recordData } as QCRecord : qc));
      } else {
        const docRef = await addDoc(collection(db, 'quality_checks'), recordData);
        setQcList(prev => [{ id: docRef.id, ...recordData } as QCRecord, ...prev]);
      }

      // ⭐ Si NO pasó, mover la casa a "Recall" (con registro en status_history para
      //    que aparezca en la vista de Recalls con su fecha de entrada). Si no existe
      //    un status "Recall", como respaldo se deja en "Quality Check".
      if (forceFail) {
        const prevStatusId = (selectedHouse as any).statusId;
        const recallStatusId = getRecallStatusId();
        const targetStatusId = recallStatusId || getQualityCheckStatusId();
        if (targetStatusId) {
          try {
            await updateDoc(doc(db, 'properties', selectedHouse.id), { statusId: targetStatusId });
          } catch (e) { console.error('No se pudo actualizar el estado de la casa:', e); }
        }
        // Registrar la transición a Recall en el histórico (origen: Quality Check)
        if (recallStatusId) {
          try {
            await statusHistoryService.log({
              propertyId: selectedHouse.id,
              fromStatusId: prevStatusId || null,
              fromStatusName: resolveStatusName(prevStatusId) || null,
              toStatusId: recallStatusId,
              toStatusName: resolveStatusName(recallStatusId) || 'Recall',
              changedBy: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown',
              source: 'quality_check',
              reason: 'No pasó Quality Check',
            } as any);
          } catch (e) { console.error('No se pudo registrar el historial de status:', e); }
        }
      }

      alert(forceFail
        ? '⚠️ Quality Check marcado como DID NOT PASS. La casa pasó a Recall y aparecerá en la vista de Recalls para corregirse.'
        : '✅ Quality Check Saved Successfully!');
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
    setLoading?: (loading: boolean) => void,
    teamNameOverride?: string
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
      console.log(`✅ All images ready`);

      const inspector = inspectorName || 'Unknown';
      const displayDate = recordDate
        ? new Date(recordDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const date = displayDate;
      const clientName = getClientName(house.client);
      const teamName = teamNameOverride || getTeamNameForHouse(house);

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
                    <td>${t.name}</td>
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

        const notesHtml = (pd.notes || pd.damage) ? `
          <div class="notes-block">
            ${pd.notes ? `<div><strong>Notes:</strong> ${pd.notes}</div>` : ''}
            ${pd.damage ? `<div style="margin-top: 8px; color: #b91c1c;"><strong>Damage:</strong> ${pd.damage}</div>` : ''}
          </div>
        ` : '';

        const photosHtml = pd.photosBase64.length > 0 ? `
          <div class="photos-label">Photographic Evidence (${pd.photosBase64.length})</div>
          <div class="photo-grid">
            ${pd.photosBase64.map((src, idx) => `
              <figure class="photo-item">
                <div class="photo-frame"><img src="${src}" alt="QC photo ${idx + 1}" /></div>
                <figcaption class="photo-cap">${pd.place.name} — Photo ${String(idx + 1).padStart(2, '0')}</figcaption>
              </figure>
            `).join('')}
          </div>
        ` : '';

        return `
          <section class="place-section">
            <div class="place-header">
              <h2>${pd.place.name}</h2>
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
                  <div class="brand-logo">PC</div>
                  <div>
                    <div class="logo-text">PRECISE CLEANING</div>
                    <div class="logo-subtitle">Professional Cleaning Services</div>
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
                <div class="info-item"><span class="info-k">Address</span><span class="info-v">${house.address || '—'}</span></div>
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
                ${clientName} • Generated on ${date} • Precise Cleaning Services
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

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Por favor permite las ventanas emergentes (pop-ups) para generar el PDF.');
        return;
      }
      printWindow.document.write(html);
      printWindow.document.close();
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
    // Si la propiedad no está en el listado, reconstruimos lo necesario desde el propio reporte.
    const house = (properties.find(p => p.id === qc.houseId) || { id: qc.houseId, address: qc.address, client: qc.client }) as Property;
    const inspector = qc.inspector || 'Unknown';
    const recordQcData = (qc.qcData as Record<string, any>) || {};

    setExportingForQcId(qc.id as string);
    try {
      await buildAndExportQCPDF(house, recordQcData, inspector, qc.date, undefined, qc.team);
    } finally {
      setExportingForQcId(null);
    }
  };

  // ⭐ Resumen rápido (para el cuerpo del email)
  const qcSummary = (qcDataObj: Record<string, any>) => {
    let yes = 0, no = 0;
    places.forEach(p => {
      const d = qcDataObj[p.id];
      if (!d) return;
      tasks.filter(t => t.placeId === p.id).forEach(t => {
        const v = d.tasks?.[t.id];
        if (v === 'Yes') yes++; else if (v === 'No') no++;
      });
    });
    const total = yes + no;
    const passRate = total ? Math.round((yes / total) * 100) : 0;
    const hasData = total > 0;
    const verdict = !hasData ? 'Inspection Recorded' : passRate >= 90 ? 'Excellent Result' : passRate >= 75 ? 'Satisfactory' : 'Needs Attention';
    return { passRate, hasData, verdict };
  };

  // ⭐ Construye asunto + cuerpo (en inglés) del correo
  const buildEmail = (house: Property, qcDataObj: Record<string, any>, inspector: string, dateStr?: string, teamNameOverride?: string) => {
    const clientName = getClientName(house.client);
    const team = teamNameOverride || getTeamNameForHouse(house);
    const niceDate = formatDate(dateStr || new Date().toISOString().split('T')[0]);
    const { passRate, hasData, verdict } = qcSummary(qcDataObj);
    const subject = `Quality Check Report - ${clientName} (${niceDate})`;
    const body = [
      'Hello,',
      '',
      'Please find the Quality Check report for the property detailed below.',
      '',
      `Client: ${clientName}`,
      `Address: ${house.address || '-'}`,
      `Team: ${team}`,
      `Inspector: ${inspector || 'Unknown'}`,
      `Date: ${niceDate}`,
      `Overall result: ${verdict}${hasData ? ` (${passRate}% of tasks passed)` : ''}`,
      '',
      'The full report, including task results and photographic evidence, is attached as a PDF.',
      '',
      'Best regards,',
      'Precise Cleaning',
    ].join('\r\n');
    return { subject, body };
  };

  const openEmailForQC = (qc: QCRecord) => {
    const house = (properties.find(p => p.id === qc.houseId) || { id: qc.houseId, address: qc.address, client: qc.client }) as Property;
    setEmailCtx(buildEmail(house, (qc.qcData as Record<string, any>) || {}, qc.inspector || 'Unknown', qc.date, qc.team));
    setEmailExport(() => () => handleExportFromTable(qc));
    setEmailModalOpen(true);
  };

  const openEmailForCurrent = () => {
    if (!selectedHouse) return;
    const inspector = currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown';
    const dateStr = editingQcId ? (qcList.find(q => q.id === editingQcId)?.date) : new Date().toISOString().split('T')[0];
    setEmailCtx(buildEmail(selectedHouse, qcData, inspector, dateStr));
    setEmailExport(() => () => handleExportFromModal());
    setEmailModalOpen(true);
  };

  const sendEmail = async () => {
    if (!emailCtx) return;
    const to = emailTo.trim();
    if (!to) { alert('Ingresa un correo de destino.'); return; }
    // Abrir el PDF primero para que el usuario lo guarde y lo adjunte
    try { if (emailExport) await emailExport(); } catch (e) { console.error(e); }
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(emailCtx.subject)}&body=${encodeURIComponent(emailCtx.body)}`;
    window.location.href = mailto;
    setEmailModalOpen(false);
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
    btnSaveQC: { backgroundColor: '#22c55e', color: 'white', padding: '15px 50px', border: 'none', borderRadius: '30px', fontWeight: 'bold' as const, cursor: 'pointer', fontSize: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: isSaving ? 0.7 : 1 },
    btnFailQC: { backgroundColor: '#ef4444', color: 'white', padding: '15px 40px', border: 'none', borderRadius: '30px', fontWeight: 'bold' as const, cursor: 'pointer', fontSize: '16px', boxShadow: '0 4px 6px rgba(239,68,68,0.25)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: isSaving ? 0.7 : 1 },
    pillBtn: (active: boolean) => ({ padding: '6px 16px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: active ? '#3b82f6' : '#f1f5f9', color: active ? 'white' : '#64748b', transition: 'all 0.2s' })
  };

  // ⭐ Áreas disponibles (activas de la casa con tareas configuradas)
  const activePlaces = activePlacesFor(selectedHouse);
  const placeQuery = placeSearch.trim().toLowerCase();
  const availablePlaces = activePlaces.filter(p => tasks.some(t => t.placeId === p.id));
  const searchablePlaces = availablePlaces.filter(p => !placeQuery || p.name.toLowerCase().includes(placeQuery));
  const selectedRenderPlaces = availablePlaces.filter(p => selectedPlaceIds.includes(p.id));

  return (
    <div className="fade-in qc-view" style={{ padding: '20px', boxSizing: 'border-box' }}>
      <style>{`
        .spin-qc { animation: spin-qc 1s linear infinite; }
        @keyframes spin-qc { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* Por defecto (escritorio): tabla visible, tarjetas ocultas */
        .qc-cards-wrap { display: none; }
        .qc-view { overflow-x: hidden; max-width: 100%; }

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
          display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
          gap: 20px; flex: 1; align-content: start;
        }
        .qc-savebar {
          padding: 14px; display: flex; gap: 12px; justify-content: center; align-items: center; flex-wrap: wrap;
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

        /* ===== Selector de áreas (chips) ===== */
        .qc-picker { grid-column: 1 / -1; background: #fff; border: 1px solid #e1e4e8; border-radius: 10px; padding: 16px; }
        .qc-chip {
          padding: 8px 14px; border-radius: 20px; font-weight: 600; font-size: 0.85rem; cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s;
          -webkit-tap-highlight-color: transparent;
        }

        /* ===== Casas pendientes de Quality Check ===== */
        .qc-pending-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 12px; }

        /* ===== Barra de herramientas: buscador + pestañas juntos en una tarjeta ===== */
        .qc-toolbar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 14px; flex-wrap: wrap;
          background: #ffffff; border: 1px solid #e5e7eb; border-radius: 14px;
          padding: 12px 14px; margin-bottom: 20px;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
        }

        /* ===== Buscador de la tabla ===== */
        .qc-table-search { display: flex; align-items: center; gap: 8px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 12px; padding: 0 14px; height: 44px; flex: 1; min-width: 240px; transition: border-color 0.15s, box-shadow 0.15s; }
        .qc-table-search:focus-within { border-color: #93c5fd; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12); background: #ffffff; }
        .qc-table-search input { flex: 1; border: none; outline: none; background: transparent; color: #111827; font-size: 0.92rem; min-width: 0; }
        .qc-table-search button:hover { color: #475569; }

        /* ===== Pestañas de estado (control segmentado) ===== */
        .qc-status-pills { display: inline-flex; background: #f1f5f9; border: 1px solid #e5e7eb; border-radius: 12px; padding: 4px; gap: 2px; flex-shrink: 0; }
        .qc-tab {
          border: none; background: transparent; cursor: pointer;
          padding: 9px 20px; border-radius: 9px;
          font-weight: 600; font-size: 0.85rem; color: #64748b;
          transition: all 0.15s; white-space: nowrap;
          -webkit-tap-highlight-color: transparent;
        }
        .qc-tab:hover { color: #1e3a8a; }
        .qc-tab.active { background: #ffffff; color: #1d4ed8; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1); }
        .qc-tab-recall { color: #7c3aed; }
        .qc-tab-recall:hover { color: #6d28d9; }
        .qc-tab-recall.active { color: #6d28d9; box-shadow: 0 1px 2px rgba(124, 58, 237, 0.18); }

        /* ===== MÓVIL: tarjetas + modal nativo ===== */
        @media (max-width: 820px) {
          html, body { overflow-x: hidden; max-width: 100%; }
          .qc-view { padding: 14px !important; }

          /* Título más compacto, estilo Pipeline */
          .qc-view .main-header h1 { font-size: 1.6rem !important; }

          /* Ocultar tabla y mostrar tarjetas */
          .qc-table-wrap { display: none !important; }
          .qc-cards-wrap { display: flex !important; }

          .qc-toolbar { flex-direction: column; align-items: stretch; padding: 12px; }
          .qc-table-search { width: 100%; height: 50px; }
          .qc-status-pills { width: 100%; }
          .qc-status-pills button { flex: 1; padding: 11px 12px; }
        }

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
          .qc-chip { padding: 10px 16px; font-size: 0.95rem; }
        }

        @media (max-width: 480px) {
          .qc-view { padding: 10px !important; }
        }
      `}</style>

      <header className="main-header" style={{ marginBottom: '18px', paddingRight: '56px' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, color: '#111827', fontSize: '2rem' }}>Quality Check Reports</h1>
          <p style={{ marginTop: '4px', color: '#6b7280' }}>History and status of house inspections</p>
        </div>
      </header>

      {/* ⭐ Botón de menú: SIEMPRE fijo en la parte superior derecha */}
      <button className="hamburger-btn" onClick={onOpenMenu} aria-label="Open menu" style={{ position: 'fixed', top: '16px', right: '16px', zIndex: 60, background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(15,23,42,0.12)' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      </button>

      {/* ⭐ Buscador global + pestañas de estado (juntos, ARRIBA del todo) */}
      <div className="qc-toolbar">
        <div className="qc-table-search">
          <Search size={18} color="#9ca3af" />
          <input
            type="text"
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            placeholder="Buscar por estado, fecha, dirección, cliente, equipo..."
          />
          {tableSearch && (
            <button type="button" onClick={() => setTableSearch('')} aria-label="Limpiar búsqueda" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}>
              <X size={16} />
            </button>
          )}
        </div>
        <div className="qc-status-pills">
          <button className={`qc-tab ${statusFilter === 'All' ? 'active' : ''}`} onClick={() => setStatusFilter('All')}>All ({groupCounts.All})</button>
          <button className={`qc-tab ${statusFilter === 'Pending' ? 'active' : ''}`} onClick={() => setStatusFilter('Pending')}>Pending ({groupCounts.Pending})</button>
          <button className={`qc-tab ${statusFilter === 'Finished' ? 'active' : ''}`} onClick={() => setStatusFilter('Finished')}>Finished ({groupCounts.Finished})</button>
          <button className={`qc-tab qc-tab-recall ${statusFilter === 'Recall' ? 'active' : ''}`} onClick={() => setStatusFilter('Recall')}>Recall ({groupCounts.Recall})</button>
        </div>
      </div>

      {/* ⭐ CASAS PENDIENTES DE QUALITY CHECK (estado "Quality Check" en el pipeline) */}
      {!isLoadingCatalogs && showPendingBlock && filteredPendingHouses.length > 0 && (
        <div style={{ marginBottom: '20px', background: 'linear-gradient(135deg, #eff6ff, #ffffff)', border: '1px solid #bfdbfe', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ClipboardCheck size={19} color="#2563eb" />
            </div>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1e3a8a' }}>Casas pendientes de Quality Check</div>
              <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 500 }}>
                {filteredPendingHouses.length} casa(s) con estado "Quality Check" — Pending de inspección
              </div>
            </div>
          </div>

          <div className="qc-pending-grid">
            {filteredPendingHouses.map(house => {
              const failed = houseFailedQC(house.id);
              return (
                <div key={house.id} style={{ background: failed ? '#fff5f5' : '#ffffff', border: `1px solid ${failed ? '#fca5a5' : '#e2e8f0'}`, borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: failed ? '0 0 0 2px rgba(239,68,68,0.12)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.05rem', lineHeight: 1.25 }}>
                      {getClientName(house.client)}
                    </div>
                    {failed ? (
                      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#ef4444', color: '#fff', padding: '4px 10px', borderRadius: '10px', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        <AlertTriangle size={12} /> Did Not Pass
                      </span>
                    ) : (
                      <span style={{ flexShrink: 0, backgroundColor: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '10px', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Pending
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', color: '#475569' }}>
                      <MapPin size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{house.address || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', color: '#475569' }}>
                      <Users size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
                      <span>{getTeamNameForHouse(house)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleStartOrContinueQC(house)}
                    disabled={isLoadingCatalogs}
                    style={{ marginTop: '2px', height: '46px', borderRadius: '11px', background: failed ? '#ef4444' : '#3b82f6', border: 'none', color: '#fff', fontWeight: 600, fontSize: '0.92rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <ClipboardCheck size={17} /> {failed ? 'Revisar / Corregir QC' : 'Iniciar inspección'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mensaje cuando la pestaña Pending no tiene casas pendientes */}
      {!isLoadingCatalogs && statusFilter === 'Pending' && filteredPendingHouses.length === 0 && (
        <div style={{ textAlign: 'center', color: '#6b7280', fontStyle: 'italic', padding: '30px', background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          No hay casas pendientes de Quality Check.
        </div>
      )}

      {/* TABLA (escritorio) */}
      {showRecordsTable && (
        <div className="qc-table-wrap" style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', width: '100%', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '900px' }}>
              <thead>
                <tr>
                  <th style={{ ...s.th, width: '150px' }}><Activity size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} /> Status</th>
                  <th style={{ ...s.th, width: '120px' }}><CalendarDays size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} /> Date</th>
                  <th style={s.th}><MapPin size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} /> Address</th>
                  <th style={s.th}><User size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} /> Client</th>
                  <th style={s.th}><Users size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} /> Team</th>
                  <th style={{ ...s.th, width: '140px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingCatalogs ? (
                  <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', color: '#6b7280', fontStyle: 'italic', padding: '30px' }}>Loading records from database...</td></tr>
                ) : filteredQcList.length === 0 ? (
                  <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', color: '#6b7280', fontStyle: 'italic', padding: '30px' }}>No Quality Checks found.</td></tr>
                ) : (
                  filteredQcList.map((qc) => {
                    const teamLabel = qc.team || getTeamNameForHouse(properties.find(p => p.id === qc.houseId));
                    const isFailed = qc.result === 'failed';
                    return (
                      <tr key={qc.id} style={{ transition: 'background-color 0.2s', borderBottom: '1px solid #f1f5f9', backgroundColor: isFailed ? '#fff7f7' : 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isFailed ? '#fff7f7' : 'transparent'}>
                        <td style={s.td}>
                          {isFailed ? (
                            <span title="No pasó Quality Check — pasó a Recall" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#7c3aed', color: '#fff', padding: '4px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 800, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                              <Repeat size={12} /> Recall · No pasó
                            </span>
                          ) : (
                            <span style={{
                              backgroundColor: qc.status === 'Finished' ? '#dcfce7' : '#fef3c7',
                              color: qc.status === 'Finished' ? '#166534' : '#b45309',
                              padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap'
                            }}>
                              {qc.status}
                            </span>
                          )}
                        </td>
                        <td style={s.td}>{formatDate(qc.date)}</td>
                        <td style={{ ...s.td, color: '#6b7280' }}>
                          <div>{qc.address}</div>
                          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '4px' }}>Inspected by: {qc.inspector || 'Unknown'}</div>
                        </td>
                        <td style={{ ...s.td, fontWeight: 600 }}>{getClientName(qc.client)}</td>
                        <td style={{ ...s.td, color: '#475569' }}>{teamLabel}</td>
                        <td style={{ ...s.td, textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end' }}>
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
                              onClick={() => openEmailForQC(qc)}
                              title="Email Report"
                              style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Mail size={16} />
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
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ====== VISTA TARJETAS (MÓVIL) ====== */}
      {showRecordsTable && (
        <div className="qc-cards-wrap" style={{ flexDirection: 'column', gap: '14px' }}>
          {isLoadingCatalogs ? (
            <div style={{ textAlign: 'center', color: '#6b7280', fontStyle: 'italic', padding: '30px', background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb' }}>Loading records from database...</div>
          ) : filteredQcList.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#6b7280', fontStyle: 'italic', padding: '30px', background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb' }}>No Quality Checks found.</div>
          ) : (
            filteredQcList.map((qc) => {
              const teamLabel = qc.team || getTeamNameForHouse(properties.find(p => p.id === qc.houseId));
              const isFinished = qc.status === 'Finished';
              const isFailed = qc.result === 'failed';
              return (
                <div
                  key={qc.id}
                  onClick={() => handleEditQC(qc)}
                  style={{
                    background: isFailed ? '#fff5f5' : '#ffffff', border: `1px solid ${isFailed ? '#fca5a5' : '#e5e7eb'}`, borderRadius: '16px', padding: '18px',
                    cursor: 'pointer', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
                    display: 'flex', flexDirection: 'column', gap: '14px',
                  }}
                >
                  {/* Título + estado */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                    <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.15rem', lineHeight: 1.25, minWidth: 0 }}>
                      {getClientName(qc.client)}
                    </span>
                    {isFailed ? (
                      <span title="No pasó Quality Check — pasó a Recall" style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#7c3aed', color: '#fff', padding: '4px 12px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 800, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        <Repeat size={13} /> Recall · No pasó
                      </span>
                    ) : (
                      <span style={{
                        flexShrink: 0,
                        backgroundColor: isFinished ? '#dcfce7' : '#fef3c7',
                        color: isFinished ? '#166534' : '#b45309',
                        padding: '4px 12px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap'
                      }}>
                        {qc.status}
                      </span>
                    )}
                  </div>

                  {/* Info con iconos */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#475569' }}>
                      <MapPin size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{qc.address || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#475569' }}>
                      <CalendarDays size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
                      <span>{formatDate(qc.date)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#475569' }}>
                      <Users size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
                      <span>{teamLabel}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.82rem', color: '#94a3b8' }}>
                      <User size={15} color="#cbd5e1" style={{ flexShrink: 0 }} />
                      <span>Inspected by: {qc.inspector || 'Unknown'}</span>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '14px', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditQC(qc); }}
                      style={{ flex: 1, minWidth: '70px', height: '44px', borderRadius: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}>
                      <Edit2 size={16} /> Editar
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleExportFromTable(qc); }}
                      disabled={exportingForQcId === qc.id}
                      style={{ flex: 1, minWidth: '70px', height: '44px', borderRadius: '12px', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, fontSize: '0.88rem', cursor: exportingForQcId === qc.id ? 'wait' : 'pointer', opacity: exportingForQcId === qc.id ? 0.6 : 1 }}>
                      {exportingForQcId === qc.id ? <Loader2 size={16} className="spin-qc" /> : <Printer size={16} />} PDF
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); openEmailForQC(qc); }}
                      style={{ flex: 1, minWidth: '70px', height: '44px', borderRadius: '12px', background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}>
                      <Mail size={16} /> Email
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteQC(qc.id as string); }}
                      style={{ flex: 1, minWidth: '70px', height: '44px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}>
                      <Trash2 size={16} /> Borrar
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* --- MODAL DE QUALITY CHECK --- */}
      {isFormModalOpen && selectedHouse && (
        <div className="qc-overlay">
          <div className="qc-modal">

            <div className="qc-header">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 className="qc-title">
                  <ClipboardCheck size={22} /> Quality Check Inspection
                </h1>
                <p className="qc-prop">
                  Property: <strong style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: '4px' }}>{getClientName(selectedHouse.client)} - {selectedHouse.address}</strong>
                </p>
                <p className="qc-insp">
                  <User size={14} /> Inspector: {currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown User'}
                </p>
                <p className="qc-insp">
                  <Users size={14} /> Team: {getTeamNameForHouse(selectedHouse)}
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
                <button
                  onClick={openEmailForCurrent}
                  disabled={isLoadingCatalogs}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    backgroundColor: 'rgba(255,255,255,0.2)', color: 'white',
                    border: '1px solid rgba(255,255,255,0.3)', padding: '8px 14px',
                    borderRadius: '8px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer'
                  }}
                  title="Email Report"
                >
                  <Mail size={16} />
                  <span className="qc-export-label">Email</span>
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
              ) : availablePlaces.length === 0 ? (
                <div style={{ color: '#6b7280', padding: '30px', textAlign: 'center', gridColumn: '1 / -1', backgroundColor: 'white', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                  Esta casa no tiene áreas asignadas para inspeccionar. Configúralas en el formulario de la casa (Houses).
                </div>
              ) : (
                <>
                  {/* ⭐ Selector de áreas a inspeccionar */}
                  <div className="qc-picker">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <h2 style={{ margin: 0, fontSize: '1rem', color: '#111827', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ClipboardCheck size={18} color="#3b82f6" /> Áreas a inspeccionar
                      </h2>
                      <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{selectedPlaceIds.length} seleccionada(s)</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {searchablePlaces.length === 0 ? (
                        <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic' }}>
                          {placeSearch ? `No se encontraron áreas para "${placeSearch}".` : 'No hay áreas con tareas configuradas.'}
                        </span>
                      ) : searchablePlaces.map(p => {
                        const sel = selectedPlaceIds.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            className="qc-chip"
                            onClick={() => togglePlaceSelection(p.id)}
                            style={{ border: `1px solid ${sel ? '#3b82f6' : '#cbd5e1'}`, background: sel ? '#3b82f6' : '#fff', color: sel ? '#fff' : '#334155' }}
                          >
                            {sel && <Check size={14} />} {p.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ⭐ Tarjetas solo de las áreas seleccionadas */}
                  {selectedRenderPlaces.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', color: '#6b7280', padding: '30px', textAlign: 'center', backgroundColor: 'white', borderRadius: '8px', border: '2px dashed #cbd5e1' }}>
                      Selecciona una o más áreas arriba para comenzar la inspección.
                    </div>
                  ) : (
                    selectedRenderPlaces.map(place => {
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
                              style={{ ...s.textareaQC, marginBottom: '12px' }}
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
                </>
              )}

            </div>

            <div className="qc-savebar">
              <button style={s.btnSaveQC} onClick={() => handleSaveQC(false)} disabled={isLoadingCatalogs || places.length === 0 || isSaving}>
                {isSaving ? 'GUARDANDO...' : 'GUARDAR TODO'}
              </button>
              <button style={s.btnFailQC} onClick={() => handleSaveQC(true)} disabled={isSaving} title="La casa regresa a Quality Check para corregirse">
                <AlertTriangle size={18} /> DID NOT PASS
              </button>
            </div>

          </div>
        </div>
      )}

      {/* --- MODAL DE EMAIL --- */}
      {emailModalOpen && (
        <div className="qc-overlay" style={{ zIndex: 1100, padding: '16px' }} onClick={() => setEmailModalOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: '460px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
            <div style={{ background: '#3b82f6', color: '#fff', padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}><Mail size={18} /> Email Report</h2>
              <button style={s.closeBtn} onClick={() => setEmailModalOpen(false)}><X size={22} /></button>
            </div>
            <div style={{ padding: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Recipient</label>
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="email@example.com"
                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px 14px', fontSize: '0.95rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
              />
              {emailCtx && (
                <div style={{ marginTop: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Subject</div>
                  <div style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 600, marginTop: '2px' }}>{emailCtx.subject}</div>
                </div>
              )}
              <p style={{ marginTop: '14px', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
                Your email app will open with the message ready (in English). The report opens in a new tab so you can save it as PDF and attach it before sending.
              </p>
            </div>
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setEmailModalOpen(false)} style={{ background: '#fff', border: '1px solid #cbd5e1', color: '#475569', padding: '10px 18px', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={sendEmail} style={{ background: '#3b82f6', border: 'none', color: '#fff', padding: '10px 18px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}><Mail size={16} /> Open Email</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}