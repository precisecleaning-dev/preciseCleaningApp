import { useState, useEffect } from 'react';
import { 
  Plus, X, Edit2, Trash2, User, Mail, ShieldCheck, Activity, Send, Loader2
} from 'lucide-react';
import { db } from '../../config/firebase';
import { collection, getDocs, setDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import type { SystemUser, Role } from '../../types/index';
// ⭐ Importar el servicio de autenticación que crea usuarios en Auth + envía email
import { createUserWithResetEmail, resendPasswordReset } from '../../services/userAuthService';

interface UsersViewProps {
  onOpenMenu: () => void;
  roles: Role[];
}

export default function UsersView({ onOpenMenu, roles }: UsersViewProps) {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [resendingForUserId, setResendingForUserId] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<SystemUser>>({
    id: '', firstName: '', lastName: '', email: '', roleId: '', status: 'Pending Invite'
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const snap = await getDocs(collection(db, 'system_users'));
      const loadedUsers = snap.docs.map(d => ({ id: d.id, ...d.data() } as SystemUser));
      setUsers(loadedUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenForm = (user?: SystemUser) => {
    if (user) {
      setFormData(user);
    } else {
      setFormData({ id: '', firstName: '', lastName: '', email: '', roleId: roles.length > 0 ? roles[0].id : '', status: 'Pending Invite' });
    }
    setIsModalOpen(true);
  };

  const handleCloseForm = () => {
    setIsModalOpen(false);
  };

  // ⭐ NUEVA LÓGICA DE GUARDADO:
  // - Al CREAR nuevo usuario: registra en Firebase Auth + envía email de reset
  // - Al EDITAR usuario existente: solo actualiza Firestore (no toca Auth)
  const handleSave = async () => {
    if (!formData.firstName || !formData.email || !formData.roleId) {
      return alert("First Name, Email, and Role are required.");
    }

    // Validación simple de email
    const cleanEmail = (formData.email || '').toLowerCase().trim();
    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return alert("Please enter a valid email address.");
    }

    setIsSaving(true);
    try {
      if (formData.id) {
        // ===== EDITAR USUARIO EXISTENTE =====
        // No tocamos Firebase Auth (el usuario ya existe ahí); solo actualizamos
        // el documento de Firestore.
        const { id, ...updateData } = formData;
        await updateDoc(doc(db, 'system_users', id as string), updateData as any);
        setUsers(users.map(u => u.id === id ? { ...u, ...updateData } as SystemUser : u));
        alert("✅ User updated successfully.");
      } else {
        // ===== CREAR NUEVO USUARIO =====
        // PASO 1: Verificar que el email no esté ya en uso en Firestore
        const existingInFirestore = users.find(u => u.email?.toLowerCase().trim() === cleanEmail);
        if (existingInFirestore) {
          alert(`This email is already registered as a user (${existingInFirestore.firstName}).`);
          setIsSaving(false);
          return;
        }

        // PASO 2: Crear el usuario en Firebase Auth y enviar email de reset
        // (Esto usa una "secondary app" para NO cerrar la sesión del admin actual)
        console.log(`📧 Creating user in Firebase Auth: ${cleanEmail}`);
        const authResult = await createUserWithResetEmail(cleanEmail);

        // PASO 3: Guardar el documento en Firestore usando el UID de Auth como ID.
        // Esto vincula el usuario de Auth con su perfil en system_users.
        // ⚠️ Si el usuario ya existía en Auth (alreadyExisted=true), el UID viene
        // vacío. En ese caso generamos un ID alternativo basado en email.
        const userId = authResult.alreadyExisted 
          ? `existing_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`
          : authResult.uid;

        const { id, ...newData } = formData;
        const dataToSave = {
          ...newData,
          email: cleanEmail,
          status: 'Pending Invite' as const,
          createdAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'system_users', userId), dataToSave);
        setUsers([...users, { id: userId, ...dataToSave } as SystemUser]);

        if (authResult.alreadyExisted) {
          alert(`⚠️ This email was already registered in Firebase Auth. We've re-sent the password setup email to ${cleanEmail}.`);
        } else {
          alert(`✅ User created successfully!\n\n📧 An email has been sent to ${cleanEmail} so they can set up their password and log in.`);
        }
      }
      handleCloseForm();
    } catch (error: any) {
      console.error("Error saving user:", error);
      alert(`Failed to save user: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this user from the system?\n\nNOTE: This removes them from your app's user list, but does NOT delete their Firebase Auth account. To fully remove access, also delete them from Firebase Console → Authentication.")) return;
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, 'system_users', id));
      setUsers(users.filter(u => u.id !== id));
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Failed to delete user.");
    } finally {
      setIsSaving(false);
    }
  };

  // ⭐ Reenviar el email de configuración de contraseña a un usuario
  const handleResendInvite = async (user: SystemUser) => {
    if (!user.email) return alert("This user has no email registered.");
    if (!window.confirm(`Resend password setup email to ${user.email}?`)) return;

    setResendingForUserId(user.id as string);
    try {
      await resendPasswordReset(user.email);
      alert(`📧 Email re-sent to ${user.email}\n\nThe user will receive a link to set up their password.`);
    } catch (error: any) {
      console.error("Error resending invite:", error);
      alert(`Failed to resend: ${error?.message || 'Unknown error'}`);
    } finally {
      setResendingForUserId(null);
    }
  };

  const s = {
    th: { padding: '12px 20px', textAlign: 'left' as const, fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' as const },
    td: { padding: '16px 20px', borderBottom: '1px solid #f1f5f9', fontSize: '0.95rem', color: '#111827', verticalAlign: 'middle' as const },
    label: { fontSize: '0.85rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '6px', display: 'block' },
    input: { backgroundColor: '#ffffff', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.95rem', color: '#111827', width: '100%', boxSizing: 'border-box' as const, outline: 'none' },
    inputDisabled: { backgroundColor: '#f1f5f9', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.95rem', color: '#64748b', width: '100%', boxSizing: 'border-box' as const, outline: 'none', cursor: 'not-allowed' },
  };

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <style>{`
        .spin-users { animation: spin-users 1s linear infinite; }
        @keyframes spin-users { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .modal-overlay-centered { position: fixed; inset: 0; background-color: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px; box-sizing: border-box; }
        .modal-50 { background-color: #ffffff; width: 100%; max-width: 600px; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); display: flex; flex-direction: column; max-height: 90vh; }
        
        .hamburger-btn { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px; cursor: pointer; color: #111827; display: flex; align-items: center; justify-content: center; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .hamburger-btn:hover { background-color: #f8fafc; }

        @media (max-width: 768px) {
          .view-header-title-group { flex-direction: row-reverse; justify-content: space-between; width: 100%; }
          .responsive-table thead { display: none; }
          .responsive-table tr { display: flex; flex-direction: column; border: 1px solid #e5e7eb; border-radius: 12px; margin-bottom: 16px; padding: 16px; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
          .responsive-table td { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f5f9; text-align: right; }
          .responsive-table td:last-child { border-bottom: none; padding-bottom: 0; }
          .responsive-table td::before { content: attr(data-label); font-weight: 700; color: #6b7280; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; padding-right: 15px; white-space: nowrap; }
        }
      `}</style>

      {/* HEADER */}
      <header className="main-header dashboard-header-container" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div className="view-header-title-group" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="hamburger-btn" onClick={onOpenMenu} aria-label="Open menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.8rem', color: '#111827', fontWeight: 700 }}>System Users</h1>
            <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '0.95rem' }}>Whitelist of authorized users</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button onClick={() => handleOpenForm()} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#111827', color: 'white', border: 'none', padding: '0 20px', height: '42px', borderRadius: '20px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
            <Plus size={16} /> Invite New User
          </button>
        </div>
      </header>

      {/* TABLE */}
      <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflowX: 'auto' }}>
        <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
          <thead>
            <tr>
              <th style={s.th}>Name</th>
              <th style={s.th}>Email</th>
              <th style={s.th}>Role</th>
              <th style={s.th}>Status</th>
              <th style={{...s.th, textAlign: 'right'}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading users...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No users found.</td></tr>
            ) : (
              users.map(u => {
                const roleName = roles.find(r => r.id === u.roleId)?.name || 'Unknown';
                const isPending = u.status === 'Pending Invite';
                const isResending = resendingForUserId === u.id;
                
                return (
                  <tr key={u.id} style={{ transition: 'background-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <td data-label="Name" style={{...s.td, fontWeight: 600}}>{u.firstName} {u.lastName}</td>
                    <td data-label="Email" style={{...s.td, color: '#64748b'}}>{u.email}</td>
                    <td data-label="Role" style={s.td}>
                      <span style={{ backgroundColor: '#f1f5f9', color: '#475569', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}>{roleName}</span>
                    </td>
                    <td data-label="Status" style={s.td}>
                      <span style={{ color: isPending ? '#f59e0b' : '#10b981', fontWeight: 600, fontSize: '0.9rem' }}>
                        {u.status || 'Active'}
                      </span>
                    </td>
                    <td data-label="Actions" style={{...s.td, textAlign: 'right'}}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        {/* ⭐ Botón para reenviar email de invitación */}
                        <button 
                          onClick={() => handleResendInvite(u)} 
                          disabled={isResending || isSaving}
                          title="Resend password setup email"
                          style={{ background: 'none', border: 'none', color: '#8b5cf6', cursor: isResending ? 'wait' : 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          {isResending ? <Loader2 size={18} className="spin-users" /> : <Send size={18} />}
                        </button>
                        <button onClick={() => handleOpenForm(u)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '4px' }}>
                          <Edit2 size={18} />
                        </button>
                        <button onClick={() => handleDelete(u.id as string)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}>
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* FORM MODAL */}
      {isModalOpen && (
        <div className="modal-overlay-centered" onClick={handleCloseForm}>
          <div className="modal-50" onClick={e => e.stopPropagation()}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>{formData.id ? 'Edit User' : 'Invite User'}</h3>
              <button onClick={handleCloseForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={24} /></button>
            </header>
            
            <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* ⭐ Aviso informativo solo al CREAR */}
              {!formData.id && (
                <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 16px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <Mail size={18} color="#1e40af" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '0.85rem', color: '#1e3a8a', lineHeight: 1.5 }}>
                    The user will receive an <strong>email with a link</strong> to set up their own password. They'll appear as "Pending Invite" until they sign in.
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={s.label}>First Name <span style={{color: '#3b82f6'}}>*</span></label>
                  <div style={{ position: 'relative' }}>
                    <User size={16} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                    <input type="text" style={{...s.input, paddingLeft: '36px'}} value={formData.firstName || ''} onChange={e => setFormData({...formData, firstName: e.target.value})} placeholder="John" />
                  </div>
                </div>
                <div>
                  <label style={s.label}>Last Name</label>
                  <input type="text" style={s.input} value={formData.lastName || ''} onChange={e => setFormData({...formData, lastName: e.target.value})} placeholder="Doe" />
                </div>
              </div>

              <div>
                <label style={s.label}>
                  Email Address <span style={{color: '#3b82f6'}}>*</span>
                  {formData.id && <span style={{ marginLeft: '8px', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(cannot be changed)</span>}
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                  <input 
                    type="email" 
                    style={{...(formData.id ? s.inputDisabled : s.input), paddingLeft: '36px'}} 
                    value={formData.email || ''} 
                    onChange={e => setFormData({...formData, email: e.target.value})} 
                    placeholder="john@example.com"
                    disabled={!!formData.id}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={s.label}>Role <span style={{color: '#3b82f6'}}>*</span></label>
                  <div style={{ position: 'relative' }}>
                    <ShieldCheck size={16} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                    <select style={{...s.input, paddingLeft: '36px', cursor: 'pointer'}} value={formData.roleId || ''} onChange={e => setFormData({...formData, roleId: e.target.value})}>
                      <option value="" disabled>Select Role...</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={s.label}>Status</label>
                  <div style={{ position: 'relative' }}>
                    <Activity size={16} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                    <select 
                      style={{...s.input, paddingLeft: '36px', cursor: 'pointer'}} 
                      value={formData.status || 'Active'} 
                      onChange={e => setFormData({...formData, status: e.target.value as any})}
                    >
                      <option value="Active">Active</option>
                      <option value="Pending Invite">Pending Invite</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <footer style={{ padding: '16px 24px', backgroundColor: '#f8fafc', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderRadius: '0 0 12px 12px' }}>
              <button onClick={handleCloseForm} disabled={isSaving} style={{ backgroundColor: 'white', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button 
                onClick={handleSave} 
                disabled={isSaving} 
                style={{ 
                  backgroundColor: '#111827', 
                  color: 'white', 
                  border: 'none', 
                  padding: '8px 20px', 
                  borderRadius: '6px', 
                  fontWeight: 600, 
                  cursor: isSaving ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: isSaving ? 0.7 : 1
                }}
              >
                {isSaving && <Loader2 size={14} className="spin-users" />}
                {isSaving ? (formData.id ? 'Saving...' : 'Creating & Sending Email...') : (formData.id ? 'Save Changes' : 'Create User & Send Invite')}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}