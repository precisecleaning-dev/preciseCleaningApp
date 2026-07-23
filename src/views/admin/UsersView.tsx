import { useState, useEffect } from 'react';
import { 
  Plus, X, Edit2, Trash2, User, Mail, ShieldCheck, Activity, Send, Loader2, Upload, AlertCircle, Menu
} from 'lucide-react';
import { db } from '../../config/firebase';
import { collection, getDocs, setDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import type { SystemUser, Role } from '../../types/index';
import { createUserWithResetEmail, resendPasswordReset } from '../../services/userAuthService';
import './UsersView.css';

interface UsersViewProps {
  onOpenMenu: () => void;
  roles: Role[];
}

// ⭐ Tipo extendido local: `inviteSent`/`inviteSentAt` se leen y escriben en Firestore
//    pero aún no están declarados en el tipo global SystemUser (mismo patrón que
//    PermissionExt en RolesView.tsx).
type SystemUserExt = SystemUser & { inviteSent?: boolean; inviteSentAt?: string };

// Genera un doc ID determinístico basado en el email (para usuarios aún no en Auth)
const emailToPendingId = (email: string) => 
  `pending_${email.toLowerCase().trim().replace(/[^a-zA-Z0-9]/g, '_')}`;

export default function UsersView({ onOpenMenu, roles }: UsersViewProps) {
  const [users, setUsers] = useState<SystemUserExt[]>([]);
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
      const loadedUsers = snap.docs.map(d => ({ id: d.id, ...d.data() } as SystemUserExt));
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
        const id = formData.id as string;
        const original = users.find(u => u.id === id);
        const emailChanged =
          !!original && (original.email || '').toLowerCase().trim() !== cleanEmail;

        // ⭐ Si cambió el email, validar que no choque con otro usuario del sistema
        if (emailChanged) {
          const clash = users.find(
            u => u.id !== id && u.email?.toLowerCase().trim() === cleanEmail
          );
          if (clash) {
            alert(`This email is already registered as a user (${clash.firstName}).`);
            setIsSaving(false);
            return;
          }
        }

        const { id: _omit, ...updateData } = formData;
        const payload: Partial<SystemUserExt> = { ...updateData, email: cleanEmail };

        if (emailChanged) {
          // ⭐ El email cambió: la invitación anterior ya no aplica. Se marca
          //    inviteSent=false para que el botón ✈️ cree la cuenta de Auth del
          //    NUEVO email y envíe el enlace de contraseña (con migración del doc
          //    al nuevo UID; ver handleSendInvite).
          payload.inviteSent = false;

          if (id.startsWith('pending_')) {
            // Aún sin cuenta de Auth: migrar el doc al nuevo ID determinístico
            const newId = emailToPendingId(cleanEmail);
            const newData = { ...(original as SystemUserExt), ...payload };
            delete (newData as Partial<SystemUserExt>).id;
            await setDoc(doc(db, 'system_users', newId), newData);
            await deleteDoc(doc(db, 'system_users', id));
            setUsers(users.map(u =>
              u.id === id ? ({ ...u, ...payload, id: newId } as SystemUserExt) : u
            ));
            alert('✅ User updated.\n\n📧 El email fue cambiado. Cuando estés listo, usa el botón ✈️ para enviar la invitación al NUEVO correo.');
            handleCloseForm();
            setIsSaving(false);
            return;
          }

          // Usuario que YA fue invitado: Firestore se actualiza aquí, pero la
          // cuenta de Firebase AUTH del email viejo NO se puede modificar desde
          // la app (requiere Admin SDK). El flujo es: ✈️ crea la cuenta del
          // nuevo email y migra este doc a su UID; la cuenta vieja se borra a
          // mano en Firebase Console → Authentication.
          await updateDoc(doc(db, 'system_users', id), payload);
          setUsers(users.map(u => u.id === id ? ({ ...u, ...payload } as SystemUserExt) : u));
          alert('✅ User updated.\n\n⚠️ Este usuario ya tenía cuenta de acceso con el email anterior.\n\n1) Usa el botón ✈️ para crear su acceso con el NUEVO email y enviarle el enlace de contraseña.\n2) Borra la cuenta del email VIEJO en Firebase Console → Authentication para revocar ese acceso.');
          handleCloseForm();
          setIsSaving(false);
          return;
        }

        await updateDoc(doc(db, 'system_users', id), payload);
        setUsers(users.map(u => u.id === id ? ({ ...u, ...payload } as SystemUserExt) : u));
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
          phone: newData.phone || '',
          altPhone: newData.altPhone || '',
          status: 'Pending Invite' as const,
          inviteSent: false,
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'system_users', userId), dataToSave);
        setUsers([...users, { id: userId, ...dataToSave } as SystemUserExt]);
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
  const handleSendInvite = async (user: SystemUserExt) => {
    if (!user.email) return alert("This user has no email registered.");

    const wasInvited = !!user.inviteSent;
    const confirmMsg = wasInvited
      ? `Resend password setup email to ${user.email}?`
      : `Send password setup email to ${user.email}?\n\nThis will create their Firebase Auth account and send them an email with a link to set up their password.`;

    if (!window.confirm(confirmMsg)) return;

    setResendingForUserId(user.id);
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

      // ¿Necesitamos migrar el doc para usar el UID de Auth? Aplica cuando se
      //    creó una cuenta nueva y su UID no coincide con el ID actual del doc:
      //    · docs "pending_..." (usuario nuevo), o
      //    · docs con el UID viejo tras un CAMBIO DE EMAIL (el ✈️ crea la cuenta
      //      del nuevo correo y el doc debe apuntar al nuevo UID).
      const currentId = user.id;
      const needsMigration = !wasInvited && !alreadyExisted && !!authUid && authUid !== currentId;

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
          ? { ...u, id: finalUserId, ...updatedFields } as SystemUserExt 
          : u
        ));
      } else {
        // No hace falta migrar; solo actualizamos
        await updateDoc(doc(db, 'system_users', currentId), updatedFields);
        setUsers(users.map(u => u.id === currentId 
          ? { ...u, ...updatedFields } as SystemUserExt 
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
        importedUsers.push({ id: userId, ...dataToSave } as SystemUserExt);
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

  return (
    <div className="fade-in uv-page">
      {/* HEADER */}
      <header className="main-header dashboard-header-container uv-header">
        <div className="view-header-title-group">
          <button className="hamburger-btn" onClick={onOpenMenu} aria-label="Open menu">
            <Menu size={24} />
          </button>
          <div>
            <h1 className="uv-title">System Users</h1>
            <p className="uv-subtitle">Whitelist of authorized users</p>
          </div>
        </div>

        <div className="uv-header-actions">
          {/* ⭐ Botón Bulk Import */}
          <button onClick={() => setIsBulkOpen(true)} className="uv-btn-outline-pill">
            <Upload size={16} /> Bulk Import
          </button>
          <button onClick={() => handleOpenForm()} className="uv-btn-dark-pill">
            <Plus size={16} /> Add User
          </button>
        </div>
      </header>

      {/* TABLE */}
      <div className="uv-table-card">
        <table className="responsive-table uv-table">
          <thead>
            <tr>
              <th className="uv-th">Name</th>
              <th className="uv-th">Email</th>
              <th className="uv-th">Role</th>
              <th className="uv-th">Status</th>
              <th className="uv-th right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="uv-empty-row">Loading users...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="uv-empty-row">No users found. Click "Add User" or "Bulk Import" to start.</td></tr>
            ) : (
              users.map(u => {
                const roleName = roles.find(r => r.id === u.roleId)?.name || 'Unknown';
                const isPending = u.status === 'Pending Invite';
                const isResending = resendingForUserId === u.id;
                const wasInvited = !!u.inviteSent;
                const statusVariant = isPending ? (wasInvited ? 'invited-pending' : 'not-invited') : u.status === 'Inactive' ? 'inactive' : 'active';

                return (
                  <tr key={u.id}>
                    <td data-label="Name" className="uv-td strong">{u.firstName} {u.lastName}</td>
                    <td data-label="Email" className="uv-td muted">{u.email}</td>
                    <td data-label="Role" className="uv-td">
                      <span className="uv-role-badge">{roleName}</span>
                    </td>
                    <td data-label="Status" className="uv-td">
                      <div className="uv-status-row">
                        <span className={`uv-status-dot ${statusVariant}`}></span>
                        <span className={`uv-status-text ${statusVariant}`}>
                          {isPending ? (wasInvited ? 'Invited (Pending)' : 'Not Invited') : (u.status || 'Active')}
                        </span>
                      </div>
                    </td>
                    <td data-label="Actions" className="uv-td right">
                      <div className="uv-actions-cell">
                        <button
                          onClick={() => handleSendInvite(u)}
                          disabled={isResending || isSaving}
                          title={wasInvited ? "Resend password setup email" : "Send invitation email (creates Auth account)"}
                          className={`uv-btn-send${wasInvited ? ' resent' : ''}${isResending ? ' busy' : ''}`}
                        >
                          {isResending ? <Loader2 size={18} className="spin-users" /> : <Send size={18} />}
                        </button>
                        <button onClick={() => handleOpenForm(u)} className="uv-btn-edit">
                          <Edit2 size={18} />
                        </button>
                        <button onClick={() => handleDelete(u.id)} className="uv-btn-delete">
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
            <header className="uv-modal-header">
              <h3 className="uv-modal-title">{formData.id ? 'Edit User' : 'Add User'}</h3>
              <button onClick={handleCloseForm} className="uv-modal-close"><X size={24} /></button>
            </header>

            <div className="uv-modal-body">

              {!formData.id && (
                <div className="uv-banner warning">
                  <AlertCircle size={18} color="#a16207" className="uv-banner-icon" />
                  <div className="uv-banner-text warning">
                    The user will be <strong>saved to the system but no email will be sent</strong>. When you're ready to invite them, click the <strong>✈️ Send</strong> icon next to their name.
                  </div>
                </div>
              )}

              <div className="uv-form-row">
                <div>
                  <label className="uv-label">First Name <span className="uv-required">*</span></label>
                  <div className="uv-input-wrap">
                    <User size={16} color="#9ca3af" className="uv-input-icon" />
                    <input type="text" className="uv-input with-icon" value={formData.firstName || ''} onChange={e => setFormData({...formData, firstName: e.target.value})} placeholder="John" />
                  </div>
                </div>
                <div>
                  <label className="uv-label">Last Name</label>
                  <input type="text" className="uv-input" value={formData.lastName || ''} onChange={e => setFormData({...formData, lastName: e.target.value})} placeholder="Doe" />
                </div>
              </div>

              <div>
                <label className="uv-label">
                  Email Address <span className="uv-required">*</span>
                  {formData.id && <span className="uv-label-hint">(al cambiarlo, reenvía la invitación con ✈️)</span>}
                </label>
                <div className="uv-input-wrap">
                  <Mail size={16} color="#9ca3af" className="uv-input-icon" />
                  <input
                    type="email"
                    className="uv-input with-icon"
                    value={formData.email || ''}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    placeholder="john@example.com"
                  />
                </div>
              </div>

              <div className="uv-form-row">
                <div>
                  <label className="uv-label">Role <span className="uv-required">*</span></label>
                  <div className="uv-input-wrap">
                    <ShieldCheck size={16} color="#9ca3af" className="uv-input-icon" />
                    <select className="uv-input with-icon selectable" value={formData.roleId || ''} onChange={e => setFormData({...formData, roleId: e.target.value})}>
                      <option value="" disabled>Select Role...</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="uv-label">Status</label>
                  <div className="uv-input-wrap">
                    <Activity size={16} color="#9ca3af" className="uv-input-icon" />
                    <select
                      className="uv-input with-icon selectable"
                      value={formData.status || 'Pending Invite'}
                      onChange={e => setFormData({...formData, status: e.target.value as SystemUser['status']})}
                    >
                      <option value="Pending Invite">Pending Invite</option>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <footer className="uv-modal-footer">
              <button onClick={handleCloseForm} disabled={isSaving} className="uv-btn-cancel">Cancel</button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="uv-btn-primary-modal save"
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
            <header className="uv-modal-header">
              <h3 className="uv-modal-title">Bulk Import Users</h3>
              <button onClick={() => !isBulkImporting && setIsBulkOpen(false)} className="uv-modal-close"><X size={24} /></button>
            </header>

            <div className="uv-modal-body">

              <div className="uv-banner info">
                <Upload size={18} color="#1e40af" className="uv-banner-icon" />
                <div className="uv-banner-text info">
                  Pega una lista de usuarios, <strong>uno por línea</strong>, en formato:<br/>
                  <code className="uv-code">firstName,lastName,email,roleName</code><br/>
                  También acepta <strong>tabs</strong> (pegado directo de Google Sheets / Excel).<br/>
                  <strong>No se enviarán correos.</strong> Quedan en "Not Invited" hasta que hagas click manual en ✈️.
                </div>
              </div>

              <div>
                <label className="uv-label">Paste users here</label>
                <textarea
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  disabled={isBulkImporting}
                  placeholder={"John,Doe,john@example.com,Employee\nJane,Smith,jane@example.com,Admin\nCarlos,Perez,carlos@example.com,Employee"}
                  className="uv-textarea"
                />
                <div className="uv-helper-text">
                  {bulkText.split('\n').filter(l => l.trim().length > 0).length} líneas detectadas.
                  Roles disponibles: {roles.map(r => r.name).join(', ') || '(ningún rol configurado todavía)'}
                </div>
              </div>

              {roles.length === 0 && (
                <div className="uv-banner danger">
                  <AlertCircle size={18} color="#b91c1c" className="uv-banner-icon" />
                  <div className="uv-banner-text danger">
                    No hay roles configurados. Ve a <strong>Roles & Permissions</strong> y crea al menos uno antes de importar.
                  </div>
                </div>
              )}
            </div>

            <footer className="uv-modal-footer">
              <button
                onClick={() => setIsBulkOpen(false)}
                disabled={isBulkImporting}
                className="uv-btn-cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkImport}
                disabled={isBulkImporting || bulkText.trim().length === 0 || roles.length === 0}
                className="uv-btn-primary-modal import"
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