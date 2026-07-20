import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { Plus, Edit2, Trash2, X, ShieldAlert, CheckSquare, Activity, Menu } from 'lucide-react';
import type { Role, Permission, Status } from '../../types/index';
import { db } from '../../config/firebase';
import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import './RolesView.css';

interface RolesViewProps {
  onOpenMenu: () => void;
  roles: Role[];
  setRoles: React.Dispatch<React.SetStateAction<Role[]>>;
}

// ⭐ Tipo extendido local: añade `allowedStatusIds` y `hiddenGroups` aunque el tipo
//    global Permission aún no los tenga declarados. Firestore acepta propiedades extra.
type PermissionExt = Permission & {
  allowedStatusIds?: string[];
  hiddenGroups?: string[];   // ⭐ Grupos de elementos que este rol NO ve
  readOnlyFields?: string[]; // ⭐ Campos del formulario de Houses en SOLO LECTURA para este rol
};
type RoleExt = Omit<Role, 'permissions'> & { permissions: PermissionExt[]; description?: string };

// ⭐ TODOS los módulos del sistema (deben coincidir EXACTAMENTE con los nombres usados en cada View)
const DEFAULT_MODULES = [
  'Houses',
  'Notice Board',
  'Calendar',
  'Quality Check',
  'Status History',
  'Payroll',
  'Invoices',
  'Customers',
  'Roles & Permissions',
  'System Users',
  'Data Import',
  'Settings'
];

// ⭐ GRUPOS de elementos del módulo Houses que pueden ser mostrados u ocultos por rol.
//    Los IDs DEBEN coincidir con los usados en HousesView.tsx (función isVisible).
const HOUSES_ELEMENT_GROUPS: { id: string; label: string; description: string }[] = [
  { id: 'workflow', label: 'Workflow Buttons', description: 'Sync, Start Job, Mark Finished, status changes' },
  { id: 'financial', label: 'Financial Operations', description: 'Pay, Financial tab, billed services, payments' },
  { id: 'admin', label: 'Admin Actions', description: 'Edit, Delete, Duplicate, Quality Check, assign workers/team' },
  { id: 'media', label: 'Media & Photos', description: 'Upload/delete photos, Export PDF, photo gallery' }
];

// ⭐ CAMPOS del formulario de Houses configurables como editable / solo lectura por rol.
//    Los ids DEBEN coincidir EXACTAMENTE con los usados por isFieldRO() en HousesView.tsx.
const HOUSES_FORM_FIELDS: { id: string; label: string }[] = [
  { id: 'client', label: 'Client' },
  { id: 'address', label: 'Address' },
  { id: 'statusId', label: 'Job Status' },
  { id: 'invoiceStatus', label: 'Invoice Status' },
  { id: 'serviceId', label: 'Service' },
  { id: 'priorityId', label: 'Priority' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'bathrooms', label: 'Bathrooms' },
  { id: 'receiveDate', label: 'Receive Date' },
  { id: 'scheduleDate', label: 'Schedule Date' },
  { id: 'dateOfIssue', label: 'Date of Issue' },
  { id: 'dueDate', label: 'Due Date' },
  { id: 'timeIn', label: 'Time In' },
  { id: 'timeOut', label: 'Time Out' },
  { id: 'teamId', label: 'Team' },
  { id: 'assignedWorkers', label: 'Assigned Workers' },
  { id: 'note', label: 'General Note' },
  { id: 'employeeNote', label: 'Employee Note' },
];

const buildEmptyPermissions = (): PermissionExt[] =>
  DEFAULT_MODULES.map(mod => ({
    module: mod,
    canView: false,
    canAdd: false,
    canEdit: false,
    canDelete: false,
    scope: 'Own' as const,
    allowedStatusIds: [],
    hiddenGroups: [],
    readOnlyFields: []
  }));

export default function RolesView({ onOpenMenu, roles, setRoles }: RolesViewProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [formData, setFormData] = useState<RoleExt>({ id: '', name: '', description: '', permissions: buildEmptyPermissions() });

  // Cargar roles y status DIRECTO desde Firebase al iniciar
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [rolesSnap, statusSnap] = await Promise.all([
          getDocs(collection(db, 'settings_roles')),
          getDocs(collection(db, 'settings_statuses'))
        ]);

        const loadedRoles = rolesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Role));
        if (loadedRoles.length > 0) setRoles(loadedRoles);

        const loadedStatuses = (statusSnap.docs.map(d => ({ id: d.id, ...d.data() } as Status)))
          .sort((a, b) => Number(a.order) - Number(b.order));
        setStatuses(loadedStatuses);
      } catch (error) {
        console.error("Error cargando datos de Firebase:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [setRoles]);

  const handleOpenForm = (role?: Role) => {
    if (role) {
      // ⭐ Mergear con la lista completa de módulos por si el rol fue creado antes
      //    de que existieran todos los módulos. Conserva permisos antiguos.
      const existingPermissions: PermissionExt[] = (role.permissions || []) as PermissionExt[];
      const mergedPermissions: PermissionExt[] = DEFAULT_MODULES.map(mod => {
        const existing = existingPermissions.find((p: PermissionExt) => p.module === mod);
        if (existing) {
          return {
            ...existing,
            allowedStatusIds: existing.allowedStatusIds || [],
            hiddenGroups: existing.hiddenGroups || [],
            readOnlyFields: existing.readOnlyFields || []
          };
        }
        return {
          module: mod,
          canView: false,
          canAdd: false,
          canEdit: false,
          canDelete: false,
          scope: 'Own' as const,
          allowedStatusIds: [],
          hiddenGroups: [],
          readOnlyFields: []
        };
      });
      const roleAsExt = role as RoleExt;
      setFormData({ ...roleAsExt, description: roleAsExt.description || '', permissions: mergedPermissions });
    } else {
      setFormData({ id: '', name: '', description: '', permissions: buildEmptyPermissions() });
    }
    setIsModalOpen(true);
  };

  const handlePermissionChange = <K extends keyof PermissionExt>(moduleName: string, field: K, value: PermissionExt[K]) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.map((p: PermissionExt) => p.module === moduleName ? { ...p, [field]: value } : p)
    }));
  };

  // Toggle de un status específico en la lista permitida para Houses
  const toggleAllowedStatus = (statusId: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.map((p: PermissionExt) => {
        if (p.module !== 'Houses') return p;
        const current: string[] = p.allowedStatusIds || [];
        const newList = current.includes(statusId)
          ? current.filter((id: string) => id !== statusId)
          : [...current, statusId];
        return { ...p, allowedStatusIds: newList };
      })
    }));
  };

  // Marcar / desmarcar todos los statuses
  const toggleAllStatuses = (selectAll: boolean) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.map((p: PermissionExt) =>
        p.module !== 'Houses' ? p : { ...p, allowedStatusIds: selectAll ? statuses.map(s => s.id) : [] }
      )
    }));
  };

  // ⭐ Toggle de un grupo de elementos para Houses (visible / oculto)
  //    Si el grupo está en hiddenGroups, está OCULTO. Si no está, es VISIBLE.
  const toggleGroupVisibility = (groupId: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.map((p: PermissionExt) => {
        if (p.module !== 'Houses') return p;
        const current: string[] = p.hiddenGroups || [];
        const newList = current.includes(groupId)
          ? current.filter((id: string) => id !== groupId)
          : [...current, groupId];
        return { ...p, hiddenGroups: newList };
      })
    }));
  };

  // ⭐ Toggle de un campo del formulario de Houses (editable / solo lectura).
  //    Si el campo está en readOnlyFields, el rol lo VE pero NO puede editarlo.
  const toggleFieldReadOnly = (fieldId: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.map((p: PermissionExt) => {
        if (p.module !== 'Houses') return p;
        const current: string[] = p.readOnlyFields || [];
        const newList = current.includes(fieldId)
          ? current.filter((id: string) => id !== fieldId)
          : [...current, fieldId];
        return { ...p, readOnlyFields: newList };
      })
    }));
  };

  const housesPermission: PermissionExt | undefined = formData.permissions.find((p: PermissionExt) => p.module === 'Houses');
  const housesAllowedStatuses: string[] = housesPermission?.allowedStatusIds || [];
  const housesHiddenGroups: string[] = housesPermission?.hiddenGroups || [];
  const housesReadOnlyFields: string[] = housesPermission?.readOnlyFields || [];

  // Guardar DIRECTO en Firebase
  const handleSaveRole = async () => {
    if (!formData.name) return alert("Role name is required");

    setIsSaving(true);
    try {
      if (formData.id) {
        const { id, ...dataToUpdate } = formData;
        await updateDoc(doc(db, 'settings_roles', formData.id), dataToUpdate);
        setRoles(roles.map(r => r.id === formData.id ? (formData as unknown as Role) : r));
      } else {
        const { id, ...dataToAdd } = formData;
        const docRef = await addDoc(collection(db, 'settings_roles'), dataToAdd);
        setRoles([...roles, { ...formData, id: docRef.id } as unknown as Role]);
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error guardando rol en Firebase:", error);
      alert("Hubo un error al guardar el rol. Revisa tu conexión y las reglas de Firestore.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRole = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this role?")) {
      setIsSaving(true);
      try {
        await deleteDoc(doc(db, 'settings_roles', id));
        setRoles(roles.filter(r => r.id !== id));
      } catch (error) {
        console.error("Error eliminando rol en Firebase:", error);
        alert("Hubo un error al eliminar el rol.");
      } finally {
        setIsSaving(false);
      }
    }
  };

  return (
    <div className="fade-in rv-page">
      <header className="rv-header">
        <div className="header-title-group">
          <button onClick={onOpenMenu} className="mobile-menu-btn" aria-label="Open menu">
            <Menu size={24} />
          </button>
          <div>
            <h1 className="rv-title">Roles & Permissions</h1>
            <p className="rv-subtitle">Configure the access simulation</p>
          </div>
        </div>
        <button onClick={() => handleOpenForm()} disabled={isLoading} className="rv-btn-create">
          <Plus size={18} /> Create New Role
        </button>
      </header>

      <div className="rv-table-card">
        <table className="rv-table">
          <thead>
            <tr>
              <th className="rv-th">Role Name</th>
              <th className="rv-th">Description</th>
              <th className="rv-th right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={3} className="rv-empty-row">Loading roles...</td></tr>
            ) : roles.length === 0 ? (
              <tr><td colSpan={3} className="rv-empty-row">No roles configured.</td></tr>
            ) : roles.map(role => (
              <tr key={role.id}>
                <td className="rv-td role-name"><ShieldAlert size={14} className="rv-icon-inline" /> {role.name}</td>
                <td className="rv-td muted">{(role as RoleExt).description || ''}</td>
                <td className="rv-td right">
                  <button onClick={() => handleOpenForm(role)} disabled={isSaving} className="rv-icon-btn edit"><Edit2 size={18} /></button>
                  <button onClick={() => handleDeleteRole(role.id)} disabled={isSaving} className="rv-icon-btn delete"><Trash2 size={18} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="rv-modal-overlay">
          <div className="rv-modal">
            <header className="rv-modal-header">
              <h3 className="rv-modal-title">{formData.id ? 'Edit Role' : 'New Role'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="rv-modal-close"><X size={24} /></button>
            </header>

            <div className="rv-modal-body">
              <div className="rv-form-grid">
                <div>
                  <label className="rv-label">Role Name</label>
                  <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="rv-input" placeholder="e.g. Supervisor" />
                </div>
                <div>
                  <label className="rv-label">Role Description</label>
                  <input type="text" value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} className="rv-input" placeholder="What is this role for?" />
                </div>
              </div>

              <h4 className="rv-section-title">Permissions Matrix</h4>
              <div className="rv-matrix-card">
                <table className="rv-matrix-table">
                  <thead className="rv-matrix-thead">
                    <tr>
                      <th className="rv-th">Module</th>
                      <th className="rv-th center">View</th>
                      <th className="rv-th center">Add</th>
                      <th className="rv-th center">Edit</th>
                      <th className="rv-th center">Delete</th>
                      <th className="rv-th center">Scope</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.permissions.map((perm: PermissionExt, idx: number) => (
                      <tr key={idx}>
                        <td className="rv-td strong">{perm.module}</td>
                        <td className="rv-td center"><input type="checkbox" className="rv-checkbox" checked={perm.canView} onChange={e => handlePermissionChange(perm.module, 'canView', e.target.checked)} /></td>
                        <td className="rv-td center"><input type="checkbox" className="rv-checkbox" checked={perm.canAdd} onChange={e => handlePermissionChange(perm.module, 'canAdd', e.target.checked)} /></td>
                        <td className="rv-td center"><input type="checkbox" className="rv-checkbox" checked={perm.canEdit} onChange={e => handlePermissionChange(perm.module, 'canEdit', e.target.checked)} /></td>
                        <td className="rv-td center"><input type="checkbox" className="rv-checkbox" checked={perm.canDelete} onChange={e => handlePermissionChange(perm.module, 'canDelete', e.target.checked)} /></td>
                        <td className="rv-td center">
                          <select className="rv-select" value={perm.scope} onChange={e => handlePermissionChange(perm.module, 'scope', e.target.value as 'Own' | 'All')}>
                            <option value="Own">Own</option>
                            <option value="All">All</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ⭐ NUEVO: Filtro de Statuses específico para Houses */}
              {housesPermission?.canView && (
                <div className="rv-panel">
                  <div className="rv-panel-header-row">
                    <div className="rv-panel-title-group">
                      <Activity size={18} color="#2563eb" />
                      <h4 className="rv-panel-title">Allowed Statuses (Houses Module)</h4>
                    </div>
                    <div className="rv-btn-row">
                      <button type="button" onClick={() => toggleAllStatuses(true)} className="rv-btn-chip primary">Select All</button>
                      <button type="button" onClick={() => toggleAllStatuses(false)} className="rv-btn-chip neutral">Clear All</button>
                    </div>
                  </div>

                  <p className="rv-panel-desc">
                    Select which job statuses this role can see. If nothing is selected, the role will see <strong>all</strong> statuses (no restriction).
                  </p>

                  {statuses.length === 0 ? (
                    <div className="rv-panel-empty">
                      No statuses configured. Add some in Settings &gt; Status first.
                    </div>
                  ) : (
                    <div className="rv-status-grid">
                      {statuses.map(status => {
                        const isChecked = housesAllowedStatuses.includes(status.id);
                        return (
                          <label
                            key={status.id}
                            className={`rv-status-option${isChecked ? ' checked' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleAllowedStatus(status.id)}
                              className="rv-checkbox"
                            />
                            <span className="rv-status-dot" style={{ '--dot-color': status.color } as CSSProperties} />
                            <span className="rv-status-name">
                              {status.name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {housesAllowedStatuses.length > 0 && (
                    <div className="rv-summary-box info">
                      <strong>{housesAllowedStatuses.length}</strong> {housesAllowedStatuses.length === 1 ? 'status' : 'statuses'} allowed for this role.
                    </div>
                  )}
                </div>
              )}

              {/* ⭐ NUEVO: Visibilidad de Grupos de Elementos para Houses */}
              {housesPermission?.canView && (
                <div className="rv-panel">
                  <div className="rv-panel-title-row">
                    <CheckSquare size={18} color="#2563eb" />
                    <h4 className="rv-panel-title">Element Visibility (Houses Module)</h4>
                  </div>

                  <p className="rv-panel-desc">
                    Toggle which groups of elements (buttons & form sections) this role can see inside the Houses module.
                    Items that are <strong>unchecked will be hidden</strong> for this role.
                  </p>

                  <div className="rv-groups-grid">
                    {HOUSES_ELEMENT_GROUPS.map(group => {
                      const isVisible = !housesHiddenGroups.includes(group.id);
                      return (
                        <label
                          key={group.id}
                          className={`rv-group-option${isVisible ? ' visible' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isVisible}
                            onChange={() => toggleGroupVisibility(group.id)}
                            className="rv-checkbox top"
                          />
                          <div className="rv-group-text">
                            <div className="rv-group-label">
                              {group.label}
                            </div>
                            <div className="rv-group-desc">
                              {group.description}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  {housesHiddenGroups.length > 0 && (
                    <div className="rv-summary-box warning">
                      <strong>{housesHiddenGroups.length}</strong> {housesHiddenGroups.length === 1 ? 'group is' : 'groups are'} hidden for this role.
                    </div>
                  )}

                  {/* ⭐ CAMPOS DEL FORMULARIO DE HOUSES: palomeado = EDITABLE;
                      sin palomear = SOLO LECTURA para este rol (verde/rojo). */}
                  <div className="rv-fields-section">
                    <div className="rv-fields-title">Houses Form Fields — editable o solo lectura</div>
                    <div className="rv-fields-hint">Palomeado = el rol puede editar el campo. Sin palomear = lo ve pero no puede modificarlo.</div>
                    <div className="rv-fields-grid">
                      {HOUSES_FORM_FIELDS.map(field => {
                        const isEditable = !housesReadOnlyFields.includes(field.id);
                        return (
                          <label key={field.id} className={`rv-field-option${isEditable ? ' editable' : ''}`}>
                            <input
                              type="checkbox"
                              checked={isEditable}
                              onChange={() => toggleFieldReadOnly(field.id)}
                              className="rv-checkbox"
                            />
                            <span>{field.label}</span>
                          </label>
                        );
                      })}
                    </div>
                    {housesReadOnlyFields.length > 0 && (
                      <div className="rv-summary-box warning">
                        <strong>{housesReadOnlyFields.length}</strong> campo(s) serán de SOLO LECTURA en el formulario de Houses para este rol.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <footer className="rv-modal-footer">
              <button type="button" onClick={() => setIsModalOpen(false)} className="rv-btn-cancel">Cancel</button>
              <button onClick={handleSaveRole} disabled={isSaving} className="rv-btn-save">
                <CheckSquare size={18} /> {isSaving ? 'Saving...' : 'Save Configuration'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}