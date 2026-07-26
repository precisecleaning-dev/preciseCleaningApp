import { useState, useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import {
  ClipboardCheck, X, Camera, MapPin, CalendarDays, User, Users, Edit2, Trash2,
  Upload, Loader2, Search, Check, Save, Clock, Plus, StickyNote, Menu,
} from 'lucide-react';
import type { Property, SystemUser, Place, Task, Customer } from '../types/index';
import { settingsService } from '../services/settingsService';
import { storageService } from '../services/storageService';
import { compressImage } from '../utils/imageCompression';
import { db } from '../config/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
// ⭐ Se REUSA el CSS del Quality Check para tener EXACTAMENTE el mismo formato.
import './QualityCheckView.css';
import './ChecklistView.css';

/* ============================================================================
   ChecklistView — misma estructura y funcionalidad que Quality Check
   (áreas por chips, tareas, score, notas, daños, fotos, tabla de registros),
   con UNA diferencia clave: las tareas SOLO tienen la opción "Yes".
   No hay "No", ni resultado passed/failed, ni recall.
   Colección Firestore: `checklists`.
   ============================================================================ */

interface PlaceData {
  tasks?: Record<string, 'Yes'>;
  notes?: string;
  damage?: string;
  score?: number | null;
  photos?: string[];
}

export interface ChecklistRecord {
  id?: string;
  houseId: string;
  date: string;
  address: string;
  client: string;
  team?: string;
  inspector?: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  durationMinutes?: number | null;
  selectedPlaces?: string[];
  createdAt?: string;
  clData?: Record<string, PlaceData>;
}

interface PendingPhoto { id: string; preview: string }

interface ChecklistViewProps {
  onOpenMenu: () => void;
  properties: Property[];
  currentUser?: SystemUser | null;
  onOpenHouseDetail?: (house: Property) => void;
  onOpenHouseEdit?: (house: Property) => void;
}

const uid = () =>
  typeof crypto !== 'undefined' && (crypto as { randomUUID?: () => string }).randomUUID
    ? (crypto as { randomUUID: () => string }).randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function ChecklistView({
  onOpenMenu, properties, currentUser, onOpenHouseDetail, onOpenHouseEdit,
}: ChecklistViewProps) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [clList, setClList] = useState<ChecklistRecord[]>([]);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Filtros de la vista
  const [tableSearch, setTableSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Done'>('All');

  // Modal del checklist
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState<Property | null>(null);
  const [editingClId, setEditingClId] = useState<string | null>(null);
  const [placeSearch, setPlaceSearch] = useState('');
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);
  const [clData, setClData] = useState<Record<string, PlaceData>>({});
  const [checkInAt, setCheckInAt] = useState<string | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<Record<string, PendingPhoto[]>>({});

  const cameraInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Carga de catálogos y registros ────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setIsLoadingCatalogs(true);
      try {
        const [placesData, tasksData, customersSnap, clSnap] = await Promise.all([
          settingsService.getAll('settings_places').catch(() => []),
          settingsService.getAll('settings_tasks').catch(() => []),
          getDocs(collection(db, 'customers')).catch(() => ({ docs: [] as never[] })),
          getDocs(collection(db, 'checklists')).catch(() => ({ docs: [] as never[] })),
        ]);
        setPlaces((placesData as Place[]).sort((a, b) => a.name.localeCompare(b.name)));
        setTasks((tasksData as Task[]).sort((a, b) => a.name.localeCompare(b.name)));
        setCustomersList(
          ((customersSnap as { docs: { id: string; data: () => object }[] }).docs || [])
            .map((d) => ({ id: d.id, ...d.data() } as Customer)),
        );
        setClList(
          ((clSnap as { docs: { id: string; data: () => object }[] }).docs || [])
            .map((d) => ({ id: d.id, ...d.data() } as ChecklistRecord))
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
        );
      } catch (err) {
        console.error('Error cargando checklist:', err);
      } finally {
        setIsLoadingCatalogs(false);
      }
    };
    load();
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getClientName = (idOrName?: string | null): string => {
    if (!idOrName) return 'Unknown Client';
    const c = customersList.find((x) => x.id === idOrName);
    return c?.name || idOrName;
  };

  const getTeamNameForHouse = (house?: Property | null): string =>
    (house as (Property & { teamName?: string }) | undefined)?.teamName || house?.teamId || '—';

  const houseNote = (house: Property): string =>
    String(
      (house as Property & { note?: string; generalNotes?: string }).note ||
      (house as Property & { generalNotes?: string }).generalNotes || '',
    ).trim();

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    const d = new Date(dateString.length <= 10 ? `${dateString}T00:00:00` : dateString);
    if (isNaN(d.getTime())) return dateString;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
  };

  const fmtTime = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const fmtDuration = (mins?: number | null) => {
    if (typeof mins !== 'number' || !isFinite(mins) || mins < 0) return '—';
    if (mins < 60) return `${Math.round(mins)} min`;
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  };

  const matchesSearch = (values: (string | undefined | null)[]) => {
    const q = tableSearch.toLowerCase().trim();
    if (!q) return true;
    return values.some((v) => String(v || '').toLowerCase().includes(q));
  };

  // Áreas que tienen al menos una tarea
  const availablePlaces = useMemo(
    () => places.filter((p) => tasks.some((t) => t.placeId === p.id)),
    [places, tasks],
  );
  const searchablePlaces = useMemo(() => {
    const q = placeSearch.toLowerCase().trim();
    if (!q) return availablePlaces;
    return availablePlaces.filter((p) => p.name.toLowerCase().includes(q));
  }, [availablePlaces, placeSearch]);
  const selectedRenderPlaces = availablePlaces.filter((p) => selectedPlaceIds.includes(p.id));

  // Casas sin checklist registrado (pendientes)
  const pendingHouses = useMemo(
    () => properties.filter((h) => !clList.some((c) => c.houseId === h.id)),
    [properties, clList],
  );
  const filteredPendingHouses = useMemo(
    () => pendingHouses.filter((h) =>
      matchesSearch([getClientName(h.client), h.address, getTeamNameForHouse(h), h.scheduleDate]),
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingHouses, tableSearch, customersList],
  );
  const filteredClList = useMemo(
    () => clList.filter((c) =>
      matchesSearch([getClientName(c.client), c.address, c.inspector, c.team, c.date, formatDate(c.date)]),
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clList, tableSearch, customersList],
  );

  const groupCounts = {
    All: filteredPendingHouses.length + filteredClList.length,
    Pending: filteredPendingHouses.length,
    Done: filteredClList.length,
  };
  const showPendingBlock = statusFilter !== 'Done';
  const showRecordsTable = statusFilter !== 'Pending';

  const countChecked = (rec: ChecklistRecord) =>
    Object.values(rec.clData || {}).reduce(
      (sum, d) => sum + Object.keys(d.tasks || {}).length, 0,
    );

  const collectNotesForCard = (rec: ChecklistRecord) => {
    const out: { area: string; notes?: string; damage?: string }[] = [];
    Object.entries(rec.clData || {}).forEach(([placeId, d]) => {
      if (d.notes || d.damage) {
        out.push({
          area: places.find((p) => p.id === placeId)?.name || placeId,
          notes: d.notes,
          damage: d.damage,
        });
      }
    });
    return out;
  };

  // ── Abrir / cerrar el formulario ──────────────────────────────────────────
  const handleOpenForm = (house: Property) => {
    setSelectedHouse(house);
    setEditingClId(null);
    setPlaceSearch('');
    setSelectedPlaceIds([]);
    setPendingPhotos({});
    setCheckInAt(new Date().toISOString());
    const initial: Record<string, PlaceData> = {};
    places.forEach((p) => {
      initial[p.id] = { tasks: {}, notes: '', damage: '', score: null, photos: [] };
    });
    setClData(initial);
    setIsFormModalOpen(true);
  };

  const handleEditChecklist = (rec: ChecklistRecord) => {
    const house =
      properties.find((p) => p.id === rec.houseId) ||
      ({ id: rec.houseId, address: rec.address, client: rec.client } as Property);
    setSelectedHouse(house);
    setEditingClId(rec.id || null);
    setPlaceSearch('');
    setPendingPhotos({});
    setCheckInAt(rec.checkInAt || new Date().toISOString());
    const base: Record<string, PlaceData> = {};
    places.forEach((p) => {
      base[p.id] = rec.clData?.[p.id] || { tasks: {}, notes: '', damage: '', score: null, photos: [] };
    });
    setClData(base);
    setSelectedPlaceIds(
      rec.selectedPlaces && rec.selectedPlaces.length > 0
        ? rec.selectedPlaces
        : Object.keys(rec.clData || {}),
    );
    setIsFormModalOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormModalOpen(false);
    setSelectedHouse(null);
    setEditingClId(null);
  };

  const togglePlaceSelection = (placeId: string) => {
    setSelectedPlaceIds((prev) =>
      prev.includes(placeId) ? prev.filter((id) => id !== placeId) : [...prev, placeId],
    );
  };

  // ⭐ SOLO "Yes": clic marca, clic de nuevo desmarca.
  const toggleTaskYes = (placeId: string, taskId: string) => {
    setClData((prev) => {
      const place = prev[placeId] || {};
      const t = { ...(place.tasks || {}) };
      if (t[taskId]) delete t[taskId];
      else t[taskId] = 'Yes';
      return { ...prev, [placeId]: { ...place, tasks: t } };
    });
  };

  const setScoreValue = (placeId: string, score: number) => {
    setClData((prev) => ({
      ...prev,
      [placeId]: { ...(prev[placeId] || {}), score: prev[placeId]?.score === score ? null : score },
    }));
  };

  const handleTextChange = (placeId: string, field: 'notes' | 'damage', value: string) => {
    setClData((prev) => ({ ...prev, [placeId]: { ...(prev[placeId] || {}), [field]: value } }));
  };

  // ── Fotos ─────────────────────────────────────────────────────────────────
  const ingestPhoto = async (placeId: string, placeName: string, file: File) => {
    if (!selectedHouse) return;
    const tempId = uid();
    const preview = URL.createObjectURL(file);
    setPendingPhotos((prev) => ({
      ...prev,
      [placeId]: [...(prev[placeId] || []), { id: tempId, preview }],
    }));
    try {
      let compressed: File = file;
      try {
        compressed = await compressImage(file, { quality: 0.8, maxWidth: 1600, maxSizeMB: 0.6 });
      } catch {
        compressed = file;
      }
      const urls = await storageService.uploadQualityCheckPhotos(
        [compressed], selectedHouse.address, placeName,
      );
      setClData((prev) => ({
        ...prev,
        [placeId]: { ...(prev[placeId] || {}), photos: [...(prev[placeId]?.photos || []), ...urls] },
      }));
    } catch (err) {
      console.error('Error subiendo foto del checklist:', err);
      alert('No se pudo subir la foto.');
    } finally {
      setPendingPhotos((prev) => ({
        ...prev,
        [placeId]: (prev[placeId] || []).filter((p) => p.id !== tempId),
      }));
      try { URL.revokeObjectURL(preview); } catch { /* noop */ }
    }
  };

  const handlePhotoUpload = (placeId: string, placeName: string, files: FileList | null) => {
    if (!files || files.length === 0 || !selectedHouse) return;
    Array.from(files).forEach((f) => { void ingestPhoto(placeId, placeName, f); });
  };

  const handleRemovePhoto = async (placeId: string, index: number) => {
    const url = clData[placeId]?.photos?.[index];
    if (!url) return;
    if (!window.confirm('¿Quitar esta foto?')) return;
    setClData((prev) => ({
      ...prev,
      [placeId]: {
        ...(prev[placeId] || {}),
        photos: (prev[placeId]?.photos || []).filter((_, i) => i !== index),
      },
    }));
    try { await storageService.deletePhotoByUrl(url); } catch (e) { console.error(e); }
  };

  // ── Guardar / eliminar ────────────────────────────────────────────────────
  const handleSaveChecklist = async () => {
    if (!selectedHouse) return;
    if (selectedPlaceIds.length === 0) {
      alert('Selecciona al menos un área para guardar el checklist.');
      return;
    }
    setIsSaving(true);
    try {
      const checkOutAt = new Date().toISOString();
      const durationMinutes = checkInAt
        ? Math.max(0, Math.round((new Date(checkOutAt).getTime() - new Date(checkInAt).getTime()) / 60000))
        : null;
      // Solo se guardan las áreas seleccionadas
      const dataToSave: Record<string, PlaceData> = {};
      selectedPlaceIds.forEach((pid) => { dataToSave[pid] = clData[pid] || {}; });

      const payload: Omit<ChecklistRecord, 'id'> = {
        houseId: selectedHouse.id,
        date: new Date().toISOString().slice(0, 10),
        address: selectedHouse.address || '',
        client: selectedHouse.client || '',
        team: getTeamNameForHouse(selectedHouse),
        inspector: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown',
        checkInAt,
        checkOutAt,
        durationMinutes,
        selectedPlaces: selectedPlaceIds,
        clData: dataToSave,
        createdAt: new Date().toISOString(),
      };

      if (editingClId) {
        await updateDoc(doc(db, 'checklists', editingClId), {
          clData: payload.clData,
          selectedPlaces: payload.selectedPlaces,
          checkOutAt: payload.checkOutAt,
          durationMinutes: payload.durationMinutes,
        });
        setClList((prev) =>
          prev.map((c) => (c.id === editingClId ? { ...c, ...payload, id: editingClId } : c)),
        );
      } else {
        const ref = await addDoc(collection(db, 'checklists'), payload);
        setClList((prev) => [{ ...payload, id: ref.id }, ...prev]);
      }
      handleCloseForm();
    } catch (err) {
      console.error('Error guardando checklist:', err);
      const e = err as { code?: string; message?: string };
      alert(`Error al guardar el checklist.\n\nCódigo: ${e.code || 'desconocido'}\nDetalle: ${e.message || String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteChecklist = async (id?: string) => {
    if (!id) return;
    if (!window.confirm('¿Eliminar este checklist? Esta acción no se puede deshacer.')) return;
    try {
      await deleteDoc(doc(db, 'checklists', id));
      setClList((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error('Error eliminando checklist:', err);
      alert('No se pudo eliminar el checklist.');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fade-in qc-view qcv-page">
      <header className="main-header qcv-header">
        <div className="qcv-header-title-wrap">
          <h1 className="qcv-header-title">Checklist</h1>
          <p className="qcv-header-subtitle">Lista de verificación de casas — solo confirmación (Yes)</p>
        </div>
      </header>

      <button className="hamburger-btn qcv-hamburger-btn" onClick={onOpenMenu} aria-label="Open menu">
        <Menu size={24} />
      </button>

      {/* Buscador + pestañas */}
      <div className="qc-toolbar">
        <div className="qc-table-search">
          <Search size={18} color="#9ca3af" />
          <input
            type="text"
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            placeholder="Buscar por dirección, cliente, equipo, fecha..."
          />
          {tableSearch && (
            <button type="button" onClick={() => setTableSearch('')} aria-label="Limpiar búsqueda" className="qcv-clear-search-btn">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="qc-status-pills">
          <button className={`qc-tab ${statusFilter === 'All' ? 'active' : ''}`} onClick={() => setStatusFilter('All')}>
            All ({groupCounts.All})
          </button>
          <button className={`qc-tab ${statusFilter === 'Pending' ? 'active' : ''}`} onClick={() => setStatusFilter('Pending')}>
            Pendientes ({groupCounts.Pending})
          </button>
          <button className={`qc-tab ${statusFilter === 'Done' ? 'active' : ''}`} onClick={() => setStatusFilter('Done')}>
            Completados ({groupCounts.Done})
          </button>
        </div>
      </div>

      {/* Casas pendientes de checklist */}
      {!isLoadingCatalogs && showPendingBlock && filteredPendingHouses.length > 0 && (
        <div className="qcv-house-block pending">
          <div className="qcv-house-block-header">
            <div className="qcv-house-block-icon pending">
              <ClipboardCheck size={19} color="#2563eb" />
            </div>
            <div>
              <div className="qcv-house-block-title pending">Casas sin checklist</div>
              <div className="qcv-house-block-sub">
                {filteredPendingHouses.length} casa(s) sin lista de verificación registrada
              </div>
            </div>
          </div>

          <div className="qc-pending-grid">
            {filteredPendingHouses.slice(0, 60).map((house) => (
              <div key={house.id} onClick={() => onOpenHouseDetail?.(house)} className="qcv-house-card">
                <div className="qcv-house-card-actions-row" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => onOpenHouseEdit?.(house)} title="Editar (formulario)" className="qcv-house-icon-btn">
                    <Edit2 size={15} />
                  </button>
                </div>
                <div className="qcv-house-card-title-row">
                  <div className="qcv-house-client-name">{getClientName(house.client)}</div>
                  <span className="qcv-house-badge pending-yellow">Pendiente</span>
                </div>
                <div className="qcv-house-info-col">
                  <div className="qcv-house-info-row">
                    <MapPin size={16} color="#94a3b8" className="qcv-shrink-0" />
                    <span className="qcv-ellipsis">{house.address || '—'}</span>
                  </div>
                  <div className="qcv-house-info-row">
                    <CalendarDays size={16} color="#94a3b8" className="qcv-shrink-0" />
                    <span>Schedule: {house.scheduleDate ? formatDate(house.scheduleDate) : 'Sin fecha'}</span>
                  </div>
                  <div className="qcv-house-info-row">
                    <Users size={16} color="#94a3b8" className="qcv-shrink-0" />
                    <span>{getTeamNameForHouse(house)}</span>
                  </div>
                  {houseNote(house) !== '' && (
                    <div className="qcv-house-note">
                      <StickyNote size={12} className="qcv-house-note-icon" />
                      <span className="qcv-house-note-text">{houseNote(house)}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleOpenForm(house); }}
                  disabled={isLoadingCatalogs}
                  className="qcv-house-inspect-btn"
                >
                  <ClipboardCheck size={17} /> Iniciar checklist
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoadingCatalogs && statusFilter === 'Pending' && filteredPendingHouses.length === 0 && (
        <div className="qcv-empty-note-box">No hay casas pendientes de checklist.</div>
      )}

      {/* Tabla de checklists completados */}
      {showRecordsTable && (
        <div className="qc-table-wrap qcv-table-wrap">
          <div className="qcv-table-scroll">
            <table className="qcv-table">
              <thead>
                <tr>
                  <th className="qcv-th">Estado</th>
                  <th className="qcv-th">Fecha</th>
                  <th className="qcv-th">Cliente / Dirección</th>
                  <th className="qcv-th">Equipo</th>
                  <th className="qcv-th">Realizado por</th>
                  <th className="qcv-th">Duración</th>
                  <th className="qcv-th">Notas</th>
                  <th className="qcv-th">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredClList.length === 0 ? (
                  <tr>
                    <td className="qcv-td empty" colSpan={8}>No hay checklists para mostrar.</td>
                  </tr>
                ) : filteredClList.map((rec) => {
                  const notes = collectNotesForCard(rec);
                  return (
                    <tr key={rec.id}>
                      <td className="qcv-td">
                        <span className="qcv-badge" style={{ '--badge-bg': '#dcfce7', '--badge-fg': '#166534' } as CSSProperties}>
                          <Check size={12} /> {countChecked(rec)} marcados
                        </span>
                      </td>
                      <td className="qcv-td">{formatDate(rec.date)}</td>
                      <td className="qcv-td">
                        <div className="qcv-client-name">{getClientName(rec.client)}</div>
                        <div className="qcv-client-address">{rec.address || '—'}</div>
                      </td>
                      <td className="qcv-td">{rec.team || '—'}</td>
                      <td className="qcv-td">{rec.inspector || 'Unknown'}</td>
                      <td className="qcv-td">
                        <div className="qcv-duration-row">
                          <Clock size={14} color="#94a3b8" /> {fmtDuration(rec.durationMinutes)}
                        </div>
                        <div className="qcv-duration-time">{fmtTime(rec.checkInAt)} – {fmtTime(rec.checkOutAt)}</div>
                      </td>
                      <td className="qcv-td notes">
                        {notes.length === 0 ? (
                          <span className="qcv-notes-empty">—</span>
                        ) : (
                          <div className="qcv-notes-col">
                            {notes.slice(0, 3).map((n, i) => (
                              <div key={i} className="qcv-note-line">
                                <span className="qcv-note-area">{n.area}:</span>{' '}
                                {n.notes && <span>{n.notes}</span>}
                                {n.damage && <span className="qcv-note-damage">{n.notes ? ' · ' : ''}⚠ {n.damage}</span>}
                              </div>
                            ))}
                            {notes.length > 3 && <div className="qcv-notes-more">+{notes.length - 3} área(s) más…</div>}
                          </div>
                        )}
                      </td>
                      <td className="qcv-td actions">
                        <div className="qcv-row-actions">
                          <button onClick={() => handleEditChecklist(rec)} title="Editar" className="qcv-row-icon-btn edit">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleDeleteChecklist(rec.id)} title="Eliminar" className="qcv-row-icon-btn delete">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tarjetas de registros (móvil) */}
      {showRecordsTable && (
        <div className="qc-cards-wrap qcv-record-cards-wrap">
          {filteredClList.length === 0 ? (
            <div className="qcv-record-empty">No hay checklists para mostrar.</div>
          ) : filteredClList.map((rec) => (
            <div key={rec.id} className="qcv-record-card">
              <div className="qcv-record-card-top">
                <div>
                  <div className="qcv-client-name">{getClientName(rec.client)}</div>
                  <div className="qcv-client-address">{rec.address || '—'}</div>
                </div>
                <span className="qcv-badge card" style={{ '--badge-bg': '#dcfce7', '--badge-fg': '#166534' } as CSSProperties}>
                  <Check size={11} /> {countChecked(rec)}
                </span>
              </div>
              <div className="qcv-record-meta-row">
                <span className="qcv-record-meta-item"><CalendarDays size={14} color="#94a3b8" /> {formatDate(rec.date)}</span>
                <span className="qcv-record-meta-item"><Users size={14} color="#94a3b8" /> {rec.team || '—'}</span>
                <span className="qcv-record-meta-item"><User size={14} color="#94a3b8" /> {rec.inspector || 'Unknown'}</span>
                <span className="qcv-record-meta-item"><Clock size={14} color="#94a3b8" /> {fmtDuration(rec.durationMinutes)}</span>
              </div>
              <div className="qcv-row-actions cl-card-actions">
                <button onClick={() => handleEditChecklist(rec)} className="qcv-row-icon-btn edit"><Edit2 size={16} /></button>
                <button onClick={() => handleDeleteChecklist(rec.id)} className="qcv-row-icon-btn delete"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════ MODAL DEL CHECKLIST ═══════════ */}
      {isFormModalOpen && selectedHouse && (
        <div className="qc-overlay" onClick={handleCloseForm}>
          <div className="qc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="qc-header">
              <div className="qcv-im-header-title-wrap">
                <h2 className="qc-title">
                  <ClipboardCheck size={20} /> {editingClId ? 'Editar' : 'Nuevo'} Checklist
                </h2>
                <p className="qc-prop">{getClientName(selectedHouse.client)} · {selectedHouse.address || '—'}</p>
                <p className="qc-insp">
                  <User size={13} /> {currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown'}
                  {checkInAt && <> · <Clock size={13} /> Entrada {fmtTime(checkInAt)}</>}
                </p>
              </div>
              <div className="qcv-im-header-actions">
                <button onClick={handleCloseForm} className="qcv-im-close-btn" aria-label="Cerrar"><X size={22} /></button>
              </div>
            </div>

            <div className="qc-search-bar">
              <div className="qc-search">
                <Search size={18} color="#94a3b8" />
                <input
                  type="text"
                  value={placeSearch}
                  onChange={(e) => setPlaceSearch(e.target.value)}
                  placeholder="Buscar área para el checklist..."
                />
                {placeSearch && <button onClick={() => setPlaceSearch('')} aria-label="Limpiar"><X size={16} /></button>}
              </div>
            </div>

            <div className="qc-body">
              {/* Selector de áreas */}
              <div className="qc-picker">
                <div className="qcv-im-picker-title">
                  Áreas del checklist ({selectedPlaceIds.length} seleccionada(s))
                </div>
                {searchablePlaces.length === 0 ? (
                  <div className="qcv-im-picker-empty">No hay áreas con tareas configuradas.</div>
                ) : (
                  <div className="qcv-im-chip-list">
                    {searchablePlaces.map((p) => {
                      const sel = selectedPlaceIds.includes(p.id);
                      return (
                        <button key={p.id} className={`qc-chip${sel ? ' selected' : ''}`} onClick={() => togglePlaceSelection(p.id)}>
                          {sel ? <Check size={14} /> : <Plus size={14} />} {p.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tarjetas por área */}
              {selectedRenderPlaces.map((p) => {
                const placeTasks = tasks.filter((t) => t.placeId === p.id);
                const data = clData[p.id] || { tasks: {}, notes: '', damage: '', score: null, photos: [] };
                const savedPhotos: string[] = data.photos || [];
                const pending = pendingPhotos[p.id] || [];
                const doneCount = Object.keys(data.tasks || {}).length;
                return (
                  <div key={p.id} className="qc-card">
                    <h3 className="qcv-im-card-title">
                      {p.name}
                      <span className="cl-place-counter">{doneCount}/{placeTasks.length}</span>
                    </h3>

                    {placeTasks.map((t) => {
                      const on = data.tasks?.[t.id] === 'Yes';
                      return (
                        <div key={t.id} className="qcv-im-task-item">
                          <span className="qcv-im-task-name">{t.name}</span>
                          <div className="qcv-im-task-buttons">
                            {/* ⭐ SOLO "Yes": clic marca / desmarca. No existe "No". */}
                            <button
                              className={`qc-toggle yes cl-yes-only${on ? ' active' : ''}`}
                              onClick={() => toggleTaskYes(p.id, t.id)}
                              title={on ? 'Clic para desmarcar' : 'Marcar como hecho'}
                            >
                              {on && <Check size={13} />} Yes
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    <div className="qcv-im-extra-fields">
                      <label className="qcv-im-label">Score (calidad general)</label>
                      <div className="qcv-im-score-row">
                        {[1, 2, 3].map((n) => (
                          <button key={n} className={`qc-toggle score${data.score === n ? ' active' : ''}`} onClick={() => setScoreValue(p.id, n)}>
                            {n}
                          </button>
                        ))}
                      </div>

                      <label className="qcv-im-label">Notas</label>
                      <textarea
                        className="qcv-im-textarea"
                        value={data.notes || ''}
                        onChange={(e) => handleTextChange(p.id, 'notes', e.target.value)}
                        placeholder="Observaciones del área..."
                      />

                      <label className="qcv-im-label">Daños</label>
                      <textarea
                        className="qcv-im-textarea"
                        value={data.damage || ''}
                        onChange={(e) => handleTextChange(p.id, 'damage', e.target.value)}
                        placeholder="Daños encontrados (si aplica)..."
                      />
                    </div>

                    {/* Fotos */}
                    <div className="qcv-im-photos-section">
                      <div className="qc-photo-actions">
                        <button className="qc-photo-btn qc-photo-btn-primary" onClick={() => cameraInputRefs.current[p.id]?.click()}>
                          <Camera size={16} /> Tomar foto
                        </button>
                        <button className="qc-photo-btn" onClick={() => fileInputRefs.current[p.id]?.click()}>
                          <Upload size={16} /> Galería
                        </button>
                      </div>
                      <input
                        ref={(el) => { cameraInputRefs.current[p.id] = el; }}
                        type="file" accept="image/*" capture="environment" className="qcv-im-hidden-input"
                        onChange={(e) => { handlePhotoUpload(p.id, p.name, e.target.files); e.target.value = ''; }}
                      />
                      <input
                        ref={(el) => { fileInputRefs.current[p.id] = el; }}
                        type="file" accept="image/*" multiple className="qcv-im-hidden-input"
                        onChange={(e) => { handlePhotoUpload(p.id, p.name, e.target.files); e.target.value = ''; }}
                      />

                      {(savedPhotos.length > 0 || pending.length > 0) && (
                        <div className="qc-photo-grid">
                          {savedPhotos.map((url, idx) => (
                            <div key={`s-${idx}`} className="qcv-im-photo-tile">
                              <img src={url} alt="" className="qcv-im-photo-img" />
                              <button onClick={() => handleRemovePhoto(p.id, idx)} className="qcv-im-photo-remove-btn">
                                <X size={13} />
                              </button>
                            </div>
                          ))}
                          {pending.map((pp) => (
                            <div key={`p-${pp.id}`} className="qcv-im-photo-tile pending">
                              <img src={pp.preview} alt="" className="qcv-im-photo-img" />
                              <div className="qcv-im-photo-pending-overlay">
                                <Loader2 size={20} color="#fff" className="spin-qc" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {selectedRenderPlaces.length === 0 && (
                <div className="qcv-im-picker-empty">
                  Selecciona al menos un área arriba para comenzar el checklist.
                </div>
              )}
            </div>

            <div className="qc-savebar">
              <button className="qcv-im-btn-save" disabled={isSaving} onClick={handleSaveChecklist}>
                {isSaving ? <Loader2 size={18} className="spin-qc" /> : <Save size={18} />} Guardar Checklist
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}