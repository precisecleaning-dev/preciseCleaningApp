import { useState, useEffect } from 'react';
import { 
  Plus, X, Edit2, Trash2, User, Mail, ShieldCheck, Activity, Send, Loader2, Upload, AlertCircle
} from 'lucide-react';
import { db } from '../../config/firebase';
import { collection, getDocs, setDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import type { SystemUser, Role } from '../../types/index';
import { createUserWithResetEmail, resendPasswordReset } from '../../services/userAuthService';

interface UsersViewProps {
  onOpenMenu: () => void;
  roles: Role[];
}

// Genera un doc ID determinístico basado en el email (para usuarios aún no en Auth)
const emailToPendingId = (email: string) => 
  `pending_${email.toLowerCase().trim().replace(/[^a-zA-Z0-9]/g, '_')}`;

export default function UsersView({ onOpenMenu, roles }: UsersViewProps) {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [resendingForUserId, setResendingForUserId] = useState<string | null>(null);

  // ⭐ Estado para el bulk import
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [isBulkImporting, setIsBulkImporting] = useState(false);

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

  // ⭐ NUEVA LÓGICA:
  // - Al CREAR: SOLO guarda en Firestore. No toca Firebase Auth ni envía email.
  // - Al EDITAR: actualiza el documento en Firestore.
  // - El email se envía manualmente con el botón ✈️ cuando estés listo.
  const handleSave = async () => {
    if (!formData.firstName || !formData.email || !formData.roleId) {
      return alert("First Name, Email, and Role are required.");
    }
    const cleanEmail = (formData.email || '').toLowerCase().trim();
    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return alert("Please enter a valid email address.");
    }

    setIsSaving(true);
    try {
      if (formData.id) {
        // ===== EDITAR =====
        const { id, ...updateData } = formData;
        await updateDoc(doc(db, 'system_users', id as string), updateData as any);
        setUsers(users.map(u => u.id === id ? { ...u, ...updateData } as SystemUser : u));
        alert("✅ User updated.");
      } else {
        // ===== AGREGAR (sin email, sin Auth) =====
        const existingInFirestore = users.find(u => u.email?.toLowerCase().trim() === cleanEmail);
        if (existingInFirestore) {
          alert(`This email is already registered as a user (${existingInFirestore.firstName}).`);
          setIsSaving(false);
          return;
        }

        const userId = emailToPendingId(cleanEmail);
        const { id, ...newData } = formData;
        const dataToSave = {
          ...newData,
          email: cleanEmail,
          phone: (newData as any).phone || '',
          altPhone: (newData as any).altPhone || '',
          status: 'Pending Invite' as const,
          inviteSent: false,
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'system_users', userId), dataToSave);
        setUsers([...users, { id: userId, ...dataToSave } as SystemUser]);
        alert(`✅ User added.\n\nNo email has been sent yet. Click the ✈️ icon next to their name when you're ready to invite them.`);
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
    if (!window.confirm("Are you sure you want to delete this user from the system?\n\nNOTE: This removes them from your app's user list, but does NOT delete their Firebase Auth account if they were already invited. To fully remove access, also delete them from Firebase Console → Authentication.")) return;
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

  // ⭐ ENVIAR INVITACIÓN: crea cuenta en Auth (si no existe) + envía email.
  //    Si el usuario aún tenía un doc con ID temporal ("pending_..."), migramos
  //    el doc para que use el UID de Auth como ID (consistencia con el patrón
  //    que el resto de la app espera al hacer lookup por UID).
  const handleSendInvite = async (user: SystemUser) => {
    if (!user.email) return alert("This user has no email registered.");

    const wasInvited = !!(user as any).inviteSent;
    const confirmMsg = wasInvited
      ? `Resend password setup email to ${user.email}?`
      : `Send password setup email to ${user.email}?\n\nThis will create their Firebase Auth account and send them an email with a link to set up their password.`;
    
    if (!window.confirm(confirmMsg)) return;

    setResendingForUserId(user.id as string);
    try {
      // Si ya estaba invitado, usamos resendPasswordReset (más simple).
      // Si es primera vez, usamos createUserWithResetEmail que crea Auth + envía.
      let authUid: string | null = null;
      let alreadyExisted = false;

      if (wasInvited) {
        await resendPasswordReset(user.email);
      } else {
        const authResult = await createUserWithResetEmail(user.email);
        authUid = authResult.uid;
        alreadyExisted = authResult.alreadyExisted;
      }

      // ¿Necesitamos migrar el doc para usar el UID de Auth?
      const currentId = user.id as string;
      const needsMigration = !wasInvited && !alreadyExisted && authUid && currentId.startsWith('pending_');

      const updatedFields = {
        inviteSent: true,
        inviteSentAt: new Date().toISOString()
      };

      let finalUserId = currentId;

      if (needsMigration) {
        // Crear nuevo doc con el Auth UID + borrar el viejo (con ID basado en email)
        const { id, ...userData } = user;
        const newData = { ...userData, ...updatedFields };
        await setDoc(doc(db, 'system_users', authUid!), newData);
        await deleteDoc(doc(db, 'system_users', currentId));
        finalUserId = authUid!;
        setUsers(users.map(u => u.id === currentId 
          ? { ...u, id: finalUserId, ...updatedFields } as SystemUser 
          : u
        ));
      } else {
        // No hace falta migrar; solo actualizamos
        await updateDoc(doc(db, 'system_users', currentId), updatedFields);
        setUsers(users.map(u => u.id === currentId 
          ? { ...u, ...updatedFields } as SystemUser 
          : u
        ));
      }

      const msg = wasInvited
        ? `📧 Re-sent password setup email to ${user.email}`
        : alreadyExisted
          ? `📧 Email sent to ${user.email}\n\n⚠️ This email was already registered in Firebase Auth.`
          : `📧 Email sent to ${user.email}\n\nThey'll receive a link to set up their password.`;
      alert(msg);
    } catch (error: any) {
      console.error("Error sending invite:", error);
      alert(`Failed to send: ${error?.message || 'Unknown error'}`);
    } finally {
      setResendingForUserId(null);
    }
  };

  // ⭐ BULK IMPORT: parsea texto pegado y crea registros en Firestore.
  //    NO crea cuentas en Auth y NO envía emails.
  //    Formato esperado: firstName,lastName,email,roleName (uno por línea)
  //    Acepta también TSV (pegado desde Google Sheets / Excel).
  const handleBulkImport = async () => {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) {
      alert("Paste at least one user line.");
      return;
    }

    type ParsedRow = { firstName: string; lastName: string; email: string; roleName: string };
    const parsed: ParsedRow[] = [];
    const parseErrors: string[] = [];

    for (const line of lines) {
      // Auto-detectar separador (tab si pegaron de hoja de cálculo, sino coma)
      const separator = line.includes('\t') ? '\t' : ',';
      const parts = line.split(separator).map(p => p.trim());
      if (parts.length < 3) {
        parseErrors.push(`✗ Línea inválida: "${line}" (se esperan al menos 3 columnas)`);
        continue;
      }
      const [firstName, lastName, email, roleName = ''] = parts;
      if (!firstName || !email) {
        parseErrors.push(`✗ Línea inválida: "${line}" (firstName y email son obligatorios)`);
        continue;
      }
      if (!email.includes('@') || !email.includes('.')) {
        parseErrors.push(`✗ Email inválido: "${email}"`);
        continue;
      }
      parsed.push({ firstName, lastName, email: email.toLowerCase().trim(), roleName });
    }

    if (parsed.length === 0) {
      alert(`No valid rows.\n\n${parseErrors.join('\n')}`);
      return;
    }

    // Filtrar duplicados (ya existentes en system_users)
    const existingEmails = new Set(users.map(u => u.email?.toLowerCase().trim()).filter(Boolean));
    const validRows = parsed.filter(p => !existingEmails.has(p.email));
    const duplicates = parsed.length - validRows.length;

    if (validRows.length === 0) {
      alert(`All ${duplicates} users already exist in the system.`);
      return;
    }

    const summary = `Ready to import ${validRows.length} users.\n` +
      (duplicates > 0 ? `⚠️ ${duplicates} skipped (already exist in system).\n` : '') +
      (parseErrors.length > 0 ? `⚠️ ${parseErrors.length} skipped (parse errors).\n` : '') +
      `\nNo emails will be sent. You can invite users individually later.\n\nContinue?`;

    if (!window.confirm(summary)) return;

    setIsBulkImporting(true);
    const importedUsers: SystemUser[] = [];
    let errorCount = 0;

    for (const row of validRows) {
      try {
        // Buscar rol por nombre (case-insensitive); si no se encuentra, usa el primero
        const matchedRole = roles.find(r => r.name.toLowerCase().trim() === row.roleName.toLowerCase().trim());
        const roleId = matchedRole?.id || (roles[0]?.id || '');

        const userId = emailToPendingId(row.email);
        const dataToSave = {
          firstName: row.firstName,
          lastName: row.lastName || '',
          email: row.email,
          phone: '',
          altPhone: '',
          roleId,
          status: 'Pending Invite' as const,
          inviteSent: false,
          createdAt: new Date().toISOString(),
          importedFromBulk: true
        };
        await setDoc(doc(db, 'system_users', userId), dataToSave);
        importedUsers.push({ id: userId, ...dataToSave } as SystemUser);
      } catch (error) {
        console.error(`Error importing ${row.email}:`, error);
        errorCount++;
      }
    }

    setUsers([...users, ...importedUsers]);
    setIsBulkImporting(false);
    setIsBulkOpen(false);
    setBulkText('');

    let resultMsg = `✅ Imported ${importedUsers.length} users to the system.`;
    if (errorCount > 0) resultMsg += `\n\n⚠️ ${errorCount} errors. Check the browser console for details.`;
    resultMsg += `\n\n📌 NO emails were sent. Click the ✈️ icon next to each user to invite them when ready.`;
    alert(resultMsg);
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
        .modal-80 { background-color: #ffffff; width: 100%; max-width: 800px; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); display: flex; flex-direction: column; max-height: 90vh; }
        
        .hamburger-btn { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px; cursor: pointer; color: #111827; display: flex; align-items: center; justify-content: center; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .hamburger-btn:hover { background-color: #f8fafc; }

        .fade-in *::-webkit-scrollbar { width: 6px; height: 6px; }
        .fade-in *::-webkit-scrollbar-track { background: transparent; }
        .fade-in *::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.25); border-radius: 10px; }
        .fade-in *::-webkit-scrollbar-thumb:hover { background: rgba(100, 116, 139, 0.55); }
        .fade-in * { scrollbar-width: thin; scrollbar-color: rgba(148, 163, 184, 0.25) transparent; }

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

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* ⭐ Botón Bulk Import */}
          <button onClick={() => setIsBulkOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'white', color: '#111827', border: '1px solid #e5e7eb', padding: '0 20px', height: '42px', borderRadius: '20px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <Upload size={16} /> Bulk Import
          </button>
          <button onClick={() => handleOpenForm()} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#111827', color: 'white', border: 'none', padding: '0 20px', height: '42px', borderRadius: '20px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
            <Plus size={16} /> Add User
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
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No users found. Click "Add User" or "Bulk Import" to start.</td></tr>
            ) : (
              users.map(u => {
                const roleName = roles.find(r => r.id === u.roleId)?.name || 'Unknown';
                const isPending = u.status === 'Pending Invite';
                const isResending = resendingForUserId === u.id;
                const wasInvited = !!(u as any).inviteSent;
                
                return (
                  <tr key={u.id} style={{ transition: 'background-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <td data-label="Name" style={{...s.td, fontWeight: 600}}>{u.firstName} {u.lastName}</td>
                    <td data-label="Email" style={{...s.td, color: '#64748b'}}>{u.email}</td>
                    <td data-label="Role" style={s.td}>
                      <span style={{ backgroundColor: '#f1f5f9', color: '#475569', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}>{roleName}</span>
                    </td>
                    <td data-label="Status" style={s.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isPending ? (wasInvited ? '#f59e0b' : '#94a3b8') : '#10b981', flexShrink: 0 }}></span>
                        <span style={{ color: isPending ? (wasInvited ? '#f59e0b' : '#64748b') : '#10b981', fontWeight: 600, fontSize: '0.9rem' }}>
                          {isPending ? (wasInvited ? 'Invited (Pending)' : 'Not Invited') : (u.status || 'Active')}
                        </span>
                      </div>
                    </td>
                    <td data-label="Actions" style={{...s.td, textAlign: 'right'}}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button 
                          onClick={() => handleSendInvite(u)} 
                          disabled={isResending || isSaving}
                          title={wasInvited ? "Resend password setup email" : "Send invitation email (creates Auth account)"}
                          style={{ background: 'none', border: 'none', color: wasInvited ? '#8b5cf6' : '#0ea5e9', cursor: isResending ? 'wait' : 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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

      {/* FORM MODAL: Add / Edit single user */}
      {isModalOpen && (
        <div className="modal-overlay-centered" onClick={handleCloseForm}>
          <div className="modal-50" onClick={e => e.stopPropagation()}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>{formData.id ? 'Edit User' : 'Add User'}</h3>
              <button onClick={handleCloseForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={24} /></button>
            </header>
            
            <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {!formData.id && (
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px 16px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <AlertCircle size={18} color="#a16207" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '0.85rem', color: '#78350f', lineHeight: 1.5 }}>
                    The user will be <strong>saved to the system but no email will be sent</strong>. When you're ready to invite them, click the <strong>✈️ Send</strong> icon next to their name.
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
                      value={formData.status || 'Pending Invite'} 
                      onChange={e => setFormData({...formData, status: e.target.value as any})}
                    >
                      <option value="Pending Invite">Pending Invite</option>
                      <option value="Active">Active</option>
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
                  backgroundColor: '#111827', color: 'white', border: 'none', padding: '8px 20px', 
                  borderRadius: '6px', fontWeight: 600, cursor: isSaving ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px', opacity: isSaving ? 0.7 : 1
                }}
              >
                {isSaving && <Loader2 size={14} className="spin-users" />}
                {isSaving ? 'Saving...' : (formData.id ? 'Save Changes' : 'Save User')}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* BULK IMPORT MODAL */}
      {isBulkOpen && (
        <div className="modal-overlay-centered" onClick={() => !isBulkImporting && setIsBulkOpen(false)}>
          <div className="modal-80" onClick={e => e.stopPropagation()}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Bulk Import Users</h3>
              <button onClick={() => !isBulkImporting && setIsBulkOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={24} /></button>
            </header>

            <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '14px 16px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <Upload size={18} color="#1e40af" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '0.85rem', color: '#1e3a8a', lineHeight: 1.5 }}>
                  Pega una lista de usuarios, <strong>uno por línea</strong>, en formato:<br/>
                  <code style={{ backgroundColor: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.85rem', display: 'inline-block', marginTop: '4px' }}>firstName,lastName,email,roleName</code><br/>
                  También acepta <strong>tabs</strong> (pegado directo de Google Sheets / Excel).<br/>
                  <strong>No se enviarán correos.</strong> Quedan en "Not Invited" hasta que hagas click manual en ✈️.
                </div>
              </div>

              <div>
                <label style={s.label}>Paste users here</label>
                <textarea
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  disabled={isBulkImporting}
                  placeholder={"John,Doe,john@example.com,Employee\nJane,Smith,jane@example.com,Admin\nCarlos,Perez,carlos@example.com,Employee"}
                  style={{
                    width: '100%',
                    minHeight: '240px',
                    padding: '12px 14px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    fontFamily: 'ui-monospace, "SF Mono", Monaco, Consolas, monospace',
                    color: '#111827',
                    boxSizing: 'border-box',
                    outline: 'none',
                    resize: 'vertical',
                    backgroundColor: isBulkImporting ? '#f8fafc' : 'white'
                  }}
                />
                <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#64748b' }}>
                  {bulkText.split('\n').filter(l => l.trim().length > 0).length} líneas detectadas. 
                  Roles disponibles: {roles.map(r => r.name).join(', ') || '(ningún rol configurado todavía)'}
                </div>
              </div>

              {roles.length === 0 && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <AlertCircle size={18} color="#b91c1c" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '0.85rem', color: '#7f1d1d', lineHeight: 1.5 }}>
                    No hay roles configurados. Ve a <strong>Roles & Permissions</strong> y crea al menos uno antes de importar.
                  </div>
                </div>
              )}
            </div>

            <footer style={{ padding: '16px 24px', backgroundColor: '#f8fafc', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderRadius: '0 0 12px 12px' }}>
              <button 
                onClick={() => setIsBulkOpen(false)} 
                disabled={isBulkImporting}
                style={{ backgroundColor: 'white', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleBulkImport} 
                disabled={isBulkImporting || bulkText.trim().length === 0 || roles.length === 0}
                style={{ 
                  backgroundColor: '#111827', color: 'white', border: 'none', padding: '8px 20px', 
                  borderRadius: '6px', fontWeight: 600, 
                  cursor: (isBulkImporting || bulkText.trim().length === 0 || roles.length === 0) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  opacity: (isBulkImporting || bulkText.trim().length === 0 || roles.length === 0) ? 0.6 : 1
                }}
              >
                {isBulkImporting && <Loader2 size={14} className="spin-users" />}
                {isBulkImporting ? 'Importing...' : 'Import Users'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}