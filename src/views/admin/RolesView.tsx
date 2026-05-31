import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, ShieldAlert, CheckSquare, Activity } from 'lucide-react';
import type { Role, Permission, Status } from '../../types/index';
import { db } from '../../config/firebase';
import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';

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
};
type RoleExt = Omit<Role, 'permissions'> & { permissions: PermissionExt[]; description?: string };

// ⭐ TODOS los módulos del sistema (deben coincidir EXACTAMENTE con los nombres usados en cada View)
const DEFAULT_MODULES = [
  'Houses',
  'Notice Board',
  'Calendar',
  'Quality Check',
  'Payroll',
  'Invoices',
  'Customers',
  'Roles & Permissions',
  'System Users',
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

const buildEmptyPermissions = (): PermissionExt[] =>
  DEFAULT_MODULES.map(mod => ({
    module: mod,
    canView: false,
    canAdd: false,
    canEdit: false,
    canDelete: false,
    scope: 'Own' as const,
    allowedStatusIds: [],
    hiddenGroups: []
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
            hiddenGroups: existing.hiddenGroups || []
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
          hiddenGroups: []
        };
      });
      const roleAsExt = role as RoleExt;
      setFormData({ ...roleAsExt, description: roleAsExt.description || '', permissions: mergedPermissions });
    } else {
      setFormData({ id: '', name: '', description: '', permissions: buildEmptyPermissions() });
    }
    setIsModalOpen(true);
  };

  const handlePermissionChange = (moduleName: string, field: keyof PermissionExt, value: any) => {
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

  const housesPermission: PermissionExt | undefined = formData.permissions.find((p: PermissionExt) => p.module === 'Houses');
  const housesAllowedStatuses: string[] = housesPermission?.allowedStatusIds || [];
  const housesHiddenGroups: string[] = housesPermission?.hiddenGroups || [];

  // Guardar DIRECTO en Firebase
  const handleSaveRole = async () => {
    if (!formData.name) return alert("Role name is required");

    setIsSaving(true);
    try {
      if (formData.id) {
        const { id, ...dataToUpdate } = formData;
        await updateDoc(doc(db, 'settings_roles', formData.id), dataToUpdate as any);
        setRoles(roles.map(r => r.id === formData.id ? (formData as unknown as Role) : r));
      } else {
        const { id, ...dataToAdd } = formData;
        const docRef = await addDoc(collection(db, 'settings_roles'), dataToAdd as any);
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

  const s = {
    th: { padding: '12px 20px', textAlign: 'left' as const, fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, borderBottom: '1px solid #f1f5f9' },
    td: { padding: '14px 20px', borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem', color: '#0f172a' },
    input: { width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', backgroundColor: '#ffffff', color: '#0f172a', fontSize: '0.95rem' } as React.CSSProperties,
    checkbox: { width: '18px', height: '18px', cursor: 'pointer', accentColor: '#2563eb' } as React.CSSProperties,
    select: { padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', outline: 'none', backgroundColor: '#ffffff', color: '#0f172a', cursor: 'pointer' } as React.CSSProperties,
    btnCancel: { backgroundColor: '#ffffff', border: '1px solid #cbd5e1', color: '#475569', padding: '10px 24px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' } as React.CSSProperties
  };

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onOpenMenu} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer' }} className="mobile-menu-btn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.8rem', color: '#111827', fontWeight: 700 }}>Roles & Permissions</h1>
            <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '0.95rem' }}>Configure the access simulation</p>
          </div>
        </div>
        <button onClick={() => handleOpenForm()} disabled={isLoading} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#111827', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '20px', fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
          <Plus size={18} /> Create New Role
        </button>
      </header>

      <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={s.th}>Role Name</th>
              <th style={s.th}>Description</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={3} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading roles...</td></tr>
            ) : roles.length === 0 ? (
              <tr><td colSpan={3} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No roles configured.</td></tr>
            ) : roles.map(role => (
              <tr key={role.id}>
                <td style={{ ...s.td, fontWeight: 600, color: '#2563eb' }}><ShieldAlert size={14} style={{ display: 'inline', marginRight: '8px' }} /> {role.name}</td>
                <td style={{ ...s.td, color: '#64748b' }}>{(role as RoleExt).description || ''}</td>
                <td style={{ ...s.td, textAlign: 'right' }}>
                  <button onClick={() => handleOpenForm(role)} disabled={isSaving} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '8px' }}><Edit2 size={18} /></button>
                  <button onClick={() => handleDeleteRole(role.id)} disabled={isSaving} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '8px', marginLeft: '8px' }}><Trash2 size={18} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ backgroundColor: 'white', width: '100%', maxWidth: '900px', borderRadius: '16px', display: 'flex', flexDirection: 'column', maxHeight: '90vh', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            <header style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{formData.id ? 'Edit Role' : 'New Role'}</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={24} /></button>
            </header>

            <div style={{ padding: '24px', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '8px' }}>Role Name</label>
                  <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} style={s.input} placeholder="e.g. Supervisor" />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '8px' }}>Role Description</label>
                  <input type="text" value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} style={s.input} placeholder="What is this role for?" />
                </div>
              </div>

              <h4 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Permissions Matrix</h4>
              <div style={{ border: '1px solid #f1f5f9', borderRadius: '12px', overflow: 'hidden', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                  <thead style={{ backgroundColor: '#f8fafc' }}>
                    <tr>
                      <th style={s.th}>Module</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>View</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Add</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Edit</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Delete</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Scope</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.permissions.map((perm: PermissionExt, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ ...s.td, fontWeight: 600 }}>{perm.module}</td>
                        <td style={{ ...s.td, textAlign: 'center' }}><input type="checkbox" style={s.checkbox} checked={perm.canView} onChange={e => handlePermissionChange(perm.module, 'canView', e.target.checked)} /></td>
                        <td style={{ ...s.td, textAlign: 'center' }}><input type="checkbox" style={s.checkbox} checked={perm.canAdd} onChange={e => handlePermissionChange(perm.module, 'canAdd', e.target.checked)} /></td>
                        <td style={{ ...s.td, textAlign: 'center' }}><input type="checkbox" style={s.checkbox} checked={perm.canEdit} onChange={e => handlePermissionChange(perm.module, 'canEdit', e.target.checked)} /></td>
                        <td style={{ ...s.td, textAlign: 'center' }}><input type="checkbox" style={s.checkbox} checked={perm.canDelete} onChange={e => handlePermissionChange(perm.module, 'canDelete', e.target.checked)} /></td>
                        <td style={{ ...s.td, textAlign: 'center' }}>
                          <select style={s.select} value={perm.scope} onChange={e => handlePermissionChange(perm.module, 'scope', e.target.value)}>
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
                <div style={{ marginTop: '24px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Activity size={18} color="#2563eb" />
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Allowed Statuses (Houses Module)</h4>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" onClick={() => toggleAllStatuses(true)} style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Select All</button>
                      <button type="button" onClick={() => toggleAllStatuses(false)} style={{ background: 'white', color: '#64748b', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Clear All</button>
                    </div>
                  </div>

                  <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#64748b' }}>
                    Select which job statuses this role can see. If nothing is selected, the role will see <strong>all</strong> statuses (no restriction).
                  </p>

                  {statuses.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic' }}>
                      No statuses configured. Add some in Settings &gt; Status first.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                      {statuses.map(status => {
                        const isChecked = housesAllowedStatuses.includes(status.id);
                        return (
                          <label
                            key={status.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '10px 12px',
                              backgroundColor: 'white',
                              border: isChecked ? '1px solid #2563eb' : '1px solid #e2e8f0',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                              boxShadow: isChecked ? '0 1px 3px rgba(37, 99, 235, 0.1)' : 'none'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleAllowedStatus(status.id)}
                              style={s.checkbox}
                            />
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: status.color, flexShrink: 0 }} />
                            <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#1e293b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {status.name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {housesAllowedStatuses.length > 0 && (
                    <div style={{ marginTop: '12px', padding: '8px 12px', backgroundColor: '#eff6ff', borderRadius: '6px', fontSize: '0.8rem', color: '#1e40af' }}>
                      <strong>{housesAllowedStatuses.length}</strong> {housesAllowedStatuses.length === 1 ? 'status' : 'statuses'} allowed for this role.
                    </div>
                  )}
                </div>
              )}

              {/* ⭐ NUEVO: Visibilidad de Grupos de Elementos para Houses */}
              {housesPermission?.canView && (
                <div style={{ marginTop: '24px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <CheckSquare size={18} color="#2563eb" />
                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Element Visibility (Houses Module)</h4>
                  </div>

                  <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#64748b' }}>
                    Toggle which groups of elements (buttons & form sections) this role can see inside the Houses module.
                    Items that are <strong>unchecked will be hidden</strong> for this role.
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                    {HOUSES_ELEMENT_GROUPS.map(group => {
                      const isVisible = !housesHiddenGroups.includes(group.id);
                      return (
                        <label
                          key={group.id}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            padding: '14px',
                            backgroundColor: 'white',
                            border: isVisible ? '1px solid #2563eb' : '1px solid #e2e8f0',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            boxShadow: isVisible ? '0 1px 3px rgba(37, 99, 235, 0.08)' : 'none'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isVisible}
                            onChange={() => toggleGroupVisibility(group.id)}
                            style={{ ...s.checkbox, marginTop: '2px' }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a', marginBottom: '2px' }}>
                              {group.label}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.4 }}>
                              {group.description}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  {housesHiddenGroups.length > 0 && (
                    <div style={{ marginTop: '12px', padding: '8px 12px', backgroundColor: '#fff7ed', borderRadius: '6px', fontSize: '0.8rem', color: '#9a3412' }}>
                      <strong>{housesHiddenGroups.length}</strong> {housesHiddenGroups.length === 1 ? 'group is' : 'groups are'} hidden for this role.
                    </div>
                  )}
                </div>
              )}
            </div>

            <footer style={{ padding: '20px 24px', borderTop: '1px solid #f1f5f9', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderRadius: '0 0 16px 16px' }}>
              <button type="button" onClick={() => setIsModalOpen(false)} style={s.btnCancel}>Cancel</button>
              <button onClick={handleSaveRole} disabled={isSaving} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '8px', fontWeight: 600, cursor: isSaving ? 'wait' : 'pointer', opacity: isSaving ? 0.7 : 1 }}>
                <CheckSquare size={18} /> {isSaving ? 'Saving...' : 'Save Configuration'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}