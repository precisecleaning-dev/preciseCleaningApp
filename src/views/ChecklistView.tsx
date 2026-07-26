import { useState, useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import {
  ClipboardCheck, X, Search, Check, Save, MapPin, CalendarDays,
  User, Menu, Trash2, Edit2, StickyNote,
} from 'lucide-react';
import type { Property, SystemUser, Customer } from '../types/index';
import { settingsService } from '../services/settingsService';
import { db } from '../config/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import './ChecklistView.css';

/* ============================================================================
   ChecklistView — Lista de verificación con los MISMOS campos (places/tasks)
   del Quality Check, pero SOLO con la opción "Yes" (marcar / desmarcar).
   No hay "No", no hay resultado passed/failed ni recall: es una lista simple
   de confirmación. Se guarda en la colección Firestore `checklists`.
   ============================================================================ */

interface Place { id: string; name: string }
interface Task { id: string; name: string; placeId: string }

interface ChecklistRecord {
  id?: string;
  houseId: string;
  address: string;
  client: string;
  date: string;
  inspector?: string;
  // { [taskId]: true }  — solo se guardan las marcadas como "Yes"
  checked: Record<string, boolean>;
  notes?: string;
  createdAt?: string;
}

interface ChecklistViewProps {
  onOpenMenu: () => void;
  properties: Property[];
  currentUser?: SystemUser | null;
}

export default function ChecklistView({ onOpenMenu, properties, currentUser }: ChecklistViewProps) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [checklists, setChecklists] = useState<ChecklistRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Formulario
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedHouse, setSelectedHouse] = useState<Property | null>(null);
  const [houseSearch, setHouseSearch] = useState('');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [placesData, tasksData, customersSnap, checklistSnap] = await Promise.all([
          settingsService.getAll('settings_places').catch(() => []),
          settingsService.getAll('settings_tasks').catch(() => []),
          getDocs(collection(db, 'customers')).catch(() => ({ docs: [] as never[] })),
          getDocs(collection(db, 'checklists')).catch(() => ({ docs: [] as never[] })),
        ]);
        setPlaces((placesData as Place[]).sort((a, b) => a.name.localeCompare(b.name)));
        setTasks(tasksData as Task[]);
        setCustomersList(
          ((customersSnap as { docs: { id: string; data: () => object }[] }).docs || []).map(
            (d) => ({ id: d.id, ...d.data() } as Customer),
          ),
        );
        setChecklists(
          ((checklistSnap as { docs: { id: string; data: () => object }[] }).docs || [])
            .map((d) => ({ id: d.id, ...d.data() } as ChecklistRecord))
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
        );
      } catch (err) {
        console.error('Error cargando checklist:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const getClientName = (idOrName?: string | null): string => {
    if (!idOrName) return 'Unknown Client';
    const c = customersList.find((x) => x.id === idOrName);
    if (c) return c.name || idOrName;
    return idOrName;
  };

  // Lugares que tienen al menos una tarea
  const activePlaces = useMemo(
    () => places.filter((p) => tasks.some((t) => t.placeId === p.id)),
    [places, tasks],
  );

  const filteredHouses = useMemo(() => {
    const q = houseSearch.toLowerCase().trim();
    if (!q) return properties.slice(0, 50);
    return properties.filter((p) => {
      const cli = getClientName(p.client).toLowerCase();
      return cli.includes(q) || (p.address || '').toLowerCase().includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houseSearch, properties, customersList]);

  const openNew = (house: Property) => {
    setSelectedHouse(house);
    setEditingId(null);
    setChecked({});
    setNotes('');
    setIsFormOpen(true);
  };

  const openEdit = (rec: ChecklistRecord) => {
    const house = properties.find((p) => p.id === rec.houseId) || null;
    setSelectedHouse(
      house || ({ id: rec.houseId, address: rec.address, client: rec.client } as Property),
    );
    setEditingId(rec.id || null);
    setChecked(rec.checked || {});
    setNotes(rec.notes || '');
    setIsFormOpen(true);
  };

  const toggleTask = (taskId: string) => {
    setChecked((prev) => {
      const next = { ...prev };
      if (next[taskId]) delete next[taskId];
      else next[taskId] = true;
      return next;
    });
  };

  const toggleAllInPlace = (placeId: string, value: boolean) => {
    setChecked((prev) => {
      const next = { ...prev };
      tasks
        .filter((t) => t.placeId === placeId)
        .forEach((t) => {
          if (value) next[t.id] = true;
          else delete next[t.id];
        });
      return next;
    });
  };

  const totalTasks = useMemo(
    () => activePlaces.reduce((sum, p) => sum + tasks.filter((t) => t.placeId === p.id).length, 0),
    [activePlaces, tasks],
  );
  const checkedCount = Object.keys(checked).length;

  const handleSave = async () => {
    if (!selectedHouse) return;
    setIsSaving(true);
    try {
      const payload: Omit<ChecklistRecord, 'id'> = {
        houseId: selectedHouse.id,
        address: selectedHouse.address || '',
        client: selectedHouse.client || '',
        date: new Date().toISOString().slice(0, 10),
        inspector: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown',
        checked,
        notes: notes.trim(),
        createdAt: new Date().toISOString(),
      };
      if (editingId) {
        await updateDoc(doc(db, 'checklists', editingId), {
          checked: payload.checked,
          notes: payload.notes,
        });
        setChecklists((prev) =>
          prev.map((c) => (c.id === editingId ? { ...c, ...payload, id: editingId } : c)),
        );
      } else {
        const ref = await addDoc(collection(db, 'checklists'), payload);
        setChecklists((prev) => [{ ...payload, id: ref.id }, ...prev]);
      }
      setIsFormOpen(false);
    } catch (err) {
      console.error('Error guardando checklist:', err);
      const e = err as { code?: string; message?: string };
      alert(`Error al guardar el checklist.\n\nCódigo: ${e.code || 'desconocido'}\nDetalle: ${e.message || String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (rec: ChecklistRecord) => {
    if (!rec.id) return;
    if (!window.confirm('¿Eliminar este checklist? Esta acción no se puede deshacer.')) return;
    try {
      await deleteDoc(doc(db, 'checklists', rec.id));
      setChecklists((prev) => prev.filter((c) => c.id !== rec.id));
    } catch (err) {
      console.error('Error eliminando checklist:', err);
      alert('No se pudo eliminar el checklist.');
    }
  };

  return (
    <div className="fade-in cl-page">
      <header className="cl-header">
        <div className="cl-header-title-group">
          <button className="hamburger-btn cl-hamburger" onClick={onOpenMenu} aria-label="Open menu">
            <Menu size={24} />
          </button>
          <div>
            <h1 className="cl-title">
              <ClipboardCheck size={22} /> Checklist
            </h1>
            <p className="cl-subtitle">{checklists.length} checklist(s) registrados</p>
          </div>
        </div>
      </header>

      {/* Selección de casa para un nuevo checklist */}
      <div className="cl-newbox">
        <div className="cl-search-wrap">
          <Search size={16} className="cl-search-icon" />
          <input
            type="text"
            className="cl-search-input"
            placeholder="Buscar casa por cliente o dirección para iniciar un checklist…"
            value={houseSearch}
            onChange={(e) => setHouseSearch(e.target.value)}
          />
        </div>
        {houseSearch.trim() && (
          <div className="cl-house-results">
            {filteredHouses.length === 0 ? (
              <div className="cl-house-empty">No se encontraron casas.</div>
            ) : (
              filteredHouses.slice(0, 12).map((h) => (
                <button key={h.id} className="cl-house-result" onClick={() => openNew(h)}>
                  <span className="cl-house-client">{getClientName(h.client)}</span>
                  <span className="cl-house-address">
                    <MapPin size={12} /> {h.address || '—'}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Historial de checklists */}
      <div className="cl-list-card">
        {isLoading ? (
          <div className="cl-empty">Cargando…</div>
        ) : checklists.length === 0 ? (
          <div className="cl-empty">Aún no hay checklists. Busca una casa arriba para crear el primero.</div>
        ) : (
          <ul className="cl-list">
            {checklists.map((rec) => {
              const total = tasks.length;
              const done = Object.keys(rec.checked || {}).length;
              return (
                <li key={rec.id} className="cl-list-item" onClick={() => openEdit(rec)}>
                  <div className="cl-list-main">
                    <div className="cl-list-client">{getClientName(rec.client)}</div>
                    <div className="cl-list-address">
                      <MapPin size={12} /> {rec.address || '—'}
                    </div>
                  </div>
                  <div className="cl-list-meta">
                    <span className="cl-list-date">
                      <CalendarDays size={12} /> {rec.date}
                    </span>
                    <span className="cl-list-count">
                      <Check size={12} /> {done}
                      {total ? ` / ${total}` : ''}
                    </span>
                  </div>
                  <div className="cl-list-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="cl-icon-btn edit" onClick={() => openEdit(rec)} title="Editar">
                      <Edit2 size={15} />
                    </button>
                    <button className="cl-icon-btn delete" onClick={() => handleDelete(rec)} title="Eliminar">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Formulario del checklist */}
      {isFormOpen && selectedHouse && (
        <div className="modal-overlay-centered" onClick={() => !isSaving && setIsFormOpen(false)}>
          <div className="cl-modal" onClick={(e) => e.stopPropagation()}>
            <header className="cl-modal-header">
              <div>
                <h3 className="cl-modal-title">
                  <ClipboardCheck size={18} /> {editingId ? 'Editar Checklist' : 'Nuevo Checklist'}
                </h3>
                <p className="cl-modal-sub">
                  <User size={12} /> {getClientName(selectedHouse.client)} · {selectedHouse.address || '—'}
                </p>
              </div>
              <button className="cl-modal-close" onClick={() => setIsFormOpen(false)} disabled={isSaving}>
                <X size={22} />
              </button>
            </header>

            <div className="cl-modal-progress">
              <span className="cl-progress-text">
                {checkedCount} de {totalTasks} marcados
              </span>
              <div className="cl-progress-track">
                <div
                  className="cl-progress-fill"
                  style={{ '--cl-pct': `${totalTasks ? (checkedCount / totalTasks) * 100 : 0}%` } as CSSProperties}
                />
              </div>
            </div>

            <div className="cl-modal-body">
              {activePlaces.length === 0 ? (
                <div className="cl-empty">
                  No hay lugares/tareas configurados. Se usan los mismos de Quality Check
                  (settings_places / settings_tasks).
                </div>
              ) : (
                activePlaces.map((place) => {
                  const placeTasks = tasks.filter((t) => t.placeId === place.id);
                  const allChecked = placeTasks.every((t) => checked[t.id]);
                  return (
                    <div key={place.id} className="cl-place">
                      <div className="cl-place-head">
                        <span className="cl-place-name">{place.name}</span>
                        <button
                          className="cl-place-toggle-all"
                          onClick={() => toggleAllInPlace(place.id, !allChecked)}
                        >
                          {allChecked ? 'Desmarcar todo' : 'Marcar todo'}
                        </button>
                      </div>
                      <div className="cl-tasks">
                        {placeTasks.map((task) => {
                          const isOn = !!checked[task.id];
                          return (
                            <button
                              key={task.id}
                              className={`cl-task${isOn ? ' on' : ''}`}
                              onClick={() => toggleTask(task.id)}
                            >
                              <span className="cl-task-check">
                                {isOn && <Check size={14} />}
                              </span>
                              <span className="cl-task-name">{task.name}</span>
                              <span className="cl-task-yes">Yes</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}

              <div className="cl-notes-box">
                <label className="cl-notes-label">
                  <StickyNote size={13} /> Notas (opcional)
                </label>
                <textarea
                  className="cl-notes-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observaciones del checklist…"
                />
              </div>
            </div>

            <footer className="cl-modal-footer">
              <button className="cl-btn-cancel" onClick={() => setIsFormOpen(false)} disabled={isSaving}>
                Cancelar
              </button>
              <button className="cl-btn-save" onClick={handleSave} disabled={isSaving}>
                <Save size={15} /> {isSaving ? 'Guardando…' : 'Guardar Checklist'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}