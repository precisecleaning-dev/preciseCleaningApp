import { useState, useEffect, useMemo } from 'react';
import { Menu, Search, MapPin, CalendarDays, Users, HelpCircle, Tag } from 'lucide-react';
import type { Property, Status, Team, Customer, SystemUser, Role } from '../types/index';
import { propertiesService } from '../services/propertiesService';
import { db } from '../config/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { getRelationName } from '../utils/relations';
import { formatDate, dateSortValue } from '../utils/dateFormat';
import StatusChangeModal, { type StatusModalConfig } from '../components/StatusChangeModal';
import { logActivity } from '../services/activityLogService';
import HousesView from './HousesView';
import './NoStatusView.css';

/* ------------------------------------------------------------------
   NoStatusView.tsx — Modulo "No Status"

   Casas cuyo statusId esta vacio o apunta a un status que ya no existe
   en el catalogo (tipico de los registros importados de AppSheet).
   Antes se colaban en Overview y ocupaban una columna gigante en el
   tablero; aqui viven aparte y el trabajo es asignarles un estado para
   que salgan de esta lista y entren al flujo normal.

   No descarga 'properties': la recibe por props desde App.tsx, que
   mantiene el unico listener global de la coleccion.
   ------------------------------------------------------------------ */

const PAGE_SIZE = 50;

interface NoStatusViewProps {
  onOpenMenu: () => void;
  properties: Property[];
  setProperties: React.Dispatch<React.SetStateAction<Property[]>>;
  currentUser?: SystemUser | null;
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
}

export default function NoStatusView({
  onOpenMenu, properties, setProperties, currentUser, activeRole, isSuperAdmin,
}: NoStatusViewProps) {

  const [statuses, setStatuses] = useState<Status[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [statusModal, setStatusModal] = useState<StatusModalConfig | null>(null);

  // ⭐ Detalle y formulario: los mismos de HousesView, montados encima de esta
  //    vista en modo 'modals-only' (igual que hace Invoices).
  const [editorMounted, setEditorMounted] = useState(false);
  const [houseToView, setHouseToView] = useState<Property | null>(null);
  const [houseToEdit, setHouseToEdit] = useState<Property | null>(null);

  const openDetail = (prop: Property) => {
    setEditorMounted(true);
    setHouseToView(prop);
  };
  const openEdit = (prop: Property) => {
    setEditorMounted(true);
    setHouseToEdit(prop);
  };

  const canEdit = isSuperAdmin || activeRole?.permissions?.find(p => p.module === 'Houses')?.canEdit;

  // Catalogos chicos. 'properties' NO se carga aqui a proposito.
  useEffect(() => {
    setIsLoading(true);
    const unsubscribes: (() => void)[] = [];
    let loaded = 0;
    const TOTAL = 3;
    const tick = () => { loaded++; if (loaded >= TOTAL) setIsLoading(false); };

    unsubscribes.push(onSnapshot(
      collection(db, 'settings_statuses'),
      (snap) => { setStatuses(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Status[]); tick(); },
      (err) => { console.error('Error statuses:', err); tick(); }
    ));
    unsubscribes.push(onSnapshot(
      collection(db, 'settings_teams'),
      (snap) => { setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Team[]); tick(); },
      (err) => { console.error('Error teams:', err); tick(); }
    ));
    unsubscribes.push(onSnapshot(
      collection(db, 'customers'),
      (snap) => { setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Customer[]); tick(); },
      (err) => { console.error('Error customers:', err); tick(); }
    ));

    return () => { unsubscribes.forEach(u => u()); };
  }, []);

  const getClientName = (idOrName?: string | null) =>
    idOrName ? getRelationName(customers, idOrName, String(idOrName)) : 'Unknown';

  // ⭐ Claves validas del catalogo (por id y por nombre, en minusculas).
  const statusKeys = useMemo(() => {
    const keys = new Set<string>();
    statuses.forEach(s => {
      keys.add(String(s.id).toLowerCase().trim());
      keys.add(String(s.name).toLowerCase().trim());
    });
    return keys;
  }, [statuses]);

  // ⭐ Las casas sin status: statusId vacio o que no existe en el catalogo.
  const noStatusProps = useMemo(() => {
    if (statuses.length === 0) return [];
    return properties.filter(p => !statusKeys.has(String(p.statusId || '').toLowerCase().trim()));
  }, [properties, statusKeys, statuses.length]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = q === ''
      ? noStatusProps
      : noStatusProps.filter(p =>
          String(p.address || '').toLowerCase().includes(q) ||
          getClientName(p.client).toLowerCase().includes(q)
        );
    return [...list].sort((a, b) => dateSortValue(b.scheduleDate) - dateSortValue(a.scheduleDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noStatusProps, search, customers]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const remaining = filtered.length - visible.length;

  // ⭐ Asignar status: al guardarlo, la casa sale de esta lista y entra al flujo
  //    normal de Overview y Pipeline.
  const assignStatus = async (propertyId: string, newStatusId: string) => {
    setIsSaving(true);
    try {
      const prev = properties.find(p => p.id === propertyId);
      await propertiesService.update(propertyId, { statusId: newStatusId });
      // ⭐ Bitacora: asignacion de status desde el modulo No Status.
      logActivity({
        action: 'status_change',
        module: 'No Status',
        user: currentUser,
        targetId: propertyId,
        targetLabel: prev ? `${getClientName(prev.client)} — ${prev.address || ''}`.trim() : propertyId,
        changes: [{
          field: 'statusId',
          before: '(sin status)',
          after: statuses.find(s => s.id === newStatusId)?.name || newStatusId,
        }],
      });
      setProperties(properties.map(p => p.id === propertyId ? { ...p, statusId: newStatusId } : p));
    } catch (error) {
      console.error('Error assigning status:', error);
      alert('Failed to assign the status.');
    } finally {
      setIsSaving(false);
    }
  };

  const openStatusModal = (prop: Property) => {
    setStatusModal({
      currentId: prop.statusId,
      onSelect: (id) => assignStatus(prop.id, id),
      title: getClientName(prop.client),
      subtitle: prop.address,
    });
  };

  return (
    <div className="fade-in ns-page">

      <header className="ns-header">
        <button onClick={onOpenMenu} className="ns-hamburger-btn" aria-label="Open menu">
          <Menu size={24} />
        </button>
        <div>
          <h1 className="ns-title">No Status</h1>
          <p className="ns-subtitle">Jobs without an assigned status</p>
        </div>
      </header>

      <div className="ns-toolbar">
        <div className="ns-kpi-card">
          <div className="ns-kpi-icon-box"><HelpCircle size={20} /></div>
          <div className="ns-min-w-0">
            <div className="ns-kpi-label">Without status</div>
            <div className="ns-kpi-count">{isLoading ? '—' : noStatusProps.length}</div>
          </div>
        </div>

        <div className="ns-search-box">
          <Search size={16} className="ns-search-icon" />
          <input
            type="text"
            className="ns-search-input"
            placeholder="Buscar por dirección o cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="ns-panel-card">
        <div className="ns-panel-head">
          <h2 className="ns-panel-title">Jobs</h2>
          <p className="ns-panel-sub">
            {isLoading ? 'Cargando...' : `${filtered.length} resultados`}
          </p>
        </div>

        {/* ===== TABLA (escritorio) ===== */}
        <div className="ns-table-wrap">
          <table className="ns-table">
            <thead>
              <tr>
                <th className="ns-th">Schedule</th>
                <th className="ns-th">Client / Address</th>
                <th className="ns-th">Team</th>
                <th className="ns-th center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="ns-empty-row">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="ns-empty-row">No hay casas sin status. </td></tr>
              ) : visible.map(prop => (
                <tr key={prop.id} className="ns-row" onClick={() => openDetail(prop)}>
                  <td className="ns-td muted">
                    {prop.scheduleDate ? formatDate(prop.scheduleDate) : '-'}
                  </td>
                  <td className="ns-td">
                    <div className="ns-client-name">{getClientName(prop.client)}</div>
                    <div className="ns-client-address">{prop.address || '-'}</div>
                  </td>
                  <td className="ns-td muted">
                    {getRelationName(teams, prop.teamId, 'Unassigned')}
                  </td>
                  <td className="ns-td center" onClick={(e) => e.stopPropagation()}>
                    <div className="ns-actions-cell">
                      {canEdit && (
                        <button
                          className="ns-btn-assign"
                          onClick={(e) => { e.stopPropagation(); openStatusModal(prop); }}
                          disabled={isSaving}
                        >
                          <Tag size={14} /> Assign status
                        </button>
                      )}
                      {canEdit && (
                        <button
                          className="ns-btn-edit"
                          onClick={(e) => { e.stopPropagation(); openEdit(prop); }}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {remaining > 0 && (
            <div className="ns-loadmore-wrap">
              <button className="ns-btn-loadmore" onClick={() => setVisibleCount(n => n + PAGE_SIZE)}>
                Load more ({remaining})
              </button>
            </div>
          )}
        </div>

        {/* ===== TARJETAS (móvil) ===== */}
        <div className="ns-cards-wrap">
          {isLoading ? (
            <div className="ns-cards-empty">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="ns-cards-empty">No hay casas sin status.</div>
          ) : visible.map(prop => (
            <div key={prop.id} className="ns-job-card" onClick={() => openDetail(prop)}>
              <div className="ns-card-name">{getClientName(prop.client)}</div>
              <div className="ns-card-info-row">
                <MapPin size={16} className="ns-shrink-0" />
                <span>{prop.address || '-'}</span>
              </div>
              <div className="ns-card-info-row">
                <CalendarDays size={16} className="ns-shrink-0" />
                <span>{prop.scheduleDate ? formatDate(prop.scheduleDate) : 'Sin fecha'}</span>
              </div>
              <div className="ns-card-info-row">
                <Users size={16} className="ns-shrink-0" />
                <span>{getRelationName(teams, prop.teamId, 'Unassigned')}</span>
              </div>
              {canEdit && (
                <div className="ns-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="ns-btn-assign full"
                    onClick={(e) => { e.stopPropagation(); openStatusModal(prop); }}
                    disabled={isSaving}
                  >
                    <Tag size={15} /> Assign status
                  </button>
                  <button
                    className="ns-btn-edit full"
                    onClick={(e) => { e.stopPropagation(); openEdit(prop); }}
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          ))}
          {remaining > 0 && (
            <div className="ns-loadmore-wrap">
              <button className="ns-btn-loadmore" onClick={() => setVisibleCount(n => n + PAGE_SIZE)}>
                Load more ({remaining})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ⭐ Modal central de cambio de estado (el mismo de Houses/Pipeline/QC) */}
      {statusModal && (
        <StatusChangeModal
          config={statusModal}
          statuses={statuses}
          onClose={() => setStatusModal(null)}
        />
      )}

      {/* ⭐ Detalle y formulario de HousesView, encima de esta vista */}
      {editorMounted && (
        <HousesView
          renderMode="modals-only"
          onOpenMenu={() => { /* sin página propia en modals-only */ }}
          properties={properties}
          setProperties={setProperties}
          currentUser={currentUser}
          activeRole={activeRole}
          isSuperAdmin={isSuperAdmin}
          houseToOpenDetail={houseToView}
          clearHouseToOpenDetail={() => setHouseToView(null)}
          houseToOpenEdit={houseToEdit}
          clearHouseToOpenEdit={() => setHouseToEdit(null)}
          detailInitialTab="overview"
        />
      )}
    </div>
  );
}