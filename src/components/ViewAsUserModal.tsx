import { useEffect, useMemo, useState } from 'react';
import { Search, X, Eye, ShieldCheck, User as UserIcon } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Role, SystemUser } from '../types/index';
import './ViewAsUserModal.css';

// ============================================================================
// ⭐ VER COMO OTRO USUARIO
//
// Permite a un administrador ver la app EXACTAMENTE como la ve otra persona:
// mismo menú, mismos módulos, mismos botones ocultos por rol. Sirve para
// verificar un permiso sin pedirle el teléfono a nadie ni crear cuentas de
// prueba.
//
// ⚠ LÍMITE IMPORTANTE, Y ES REAL:
//    Esto cambia la interfaz, NO la sesión. Ante Firebase sigues siendo tú, y
//    las reglas de Firestore se evalúan con TU cuenta. Es decir: si el rol que
//    estás simulando no debería poder leer una colección, aquí igual la vas a
//    ver, porque la lectura la hace tu usuario real.
//
//    Sirve para responder "¿qué ve esta persona?", no para auditar seguridad.
//    Una simulación real de permisos requeriría autenticarse como ese usuario,
//    lo que implicaría manejar su contraseña — algo que no se debe hacer.
//
//    Por eso el modo queda anunciado con una barra fija que no se puede
//    ignorar, y NO persiste al recargar: es una herramienta de inspección
//    momentánea, no un estado en el que trabajar.
// ============================================================================

export interface ViewAsSelection {
  user: SystemUser;
  role: Role | null;
}

interface ViewAsUserModalProps {
  roles: Role[];
  /** Usuario real, para excluirlo de la lista y marcarlo. */
  currentUserId?: string | null;
  onSelect: (selection: ViewAsSelection) => void;
  onClose: () => void;
}

export default function ViewAsUserModal({
  roles, currentUserId, onSelect, onClose,
}: ViewAsUserModalProps) {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    // Lectura puntual, no un listener: el modal se abre unos segundos y
    // mantener un onSnapshot abierto sobre toda la tabla de usuarios sería
    // gastar lecturas sin motivo.
    getDocs(collection(db, 'system_users'))
      .then(snap => setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SystemUser)))
      .catch(err => console.error('Error cargando usuarios:', err))
      .finally(() => setIsLoading(false));
  }, []);

  const roleName = (roleId?: string | null): string =>
    roles.find(r => r.id === roleId)?.name || 'Sin rol';

  const fullName = (u: SystemUser): string =>
    [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.id;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter(u => u.id !== currentUserId)
      .filter(u => !q || [fullName(u), u.email, roleName(u.roleId)]
        .some(v => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => fullName(a).localeCompare(fullName(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, search, currentUserId, roles]);

  return (
    <div className="vau-overlay" onClick={onClose}>
      <div className="vau-modal" onClick={e => e.stopPropagation()}>
        <header className="vau-header">
          <div className="vau-header-info">
            <span className="vau-header-icon"><Eye size={20} /></span>
            <div>
              <h3 className="vau-title">Ver como otro usuario</h3>
              <p className="vau-subtitle">
                La interfaz se mostrará con los permisos de la persona que elijas.
              </p>
            </div>
          </div>
          <button type="button" className="vau-close" onClick={onClose} aria-label="Cerrar">
            <X size={22} />
          </button>
        </header>

        {/* El aviso va DENTRO del modal, antes de elegir: quien lo use tiene que
            saber que esto no simula las reglas de seguridad. */}
        <div className="vau-note">
          Cambia solo lo que <strong>se ve</strong>. Los datos se siguen leyendo con tu
          cuenta, así que no sirve para comprobar reglas de seguridad.
        </div>

        <div className="vau-search">
          <Search size={16} className="vau-search-icon" />
          <input
            type="text"
            className="vau-search-input"
            placeholder="Buscar por nombre, correo o rol..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="vau-list">
          {isLoading ? (
            <div className="vau-empty">Cargando usuarios...</div>
          ) : filtered.length === 0 ? (
            <div className="vau-empty">
              {search ? 'Ningún usuario coincide con la búsqueda.' : 'No hay otros usuarios.'}
            </div>
          ) : filtered.map(u => {
            const role = roles.find(r => r.id === u.roleId) || null;
            return (
              <button
                key={u.id}
                type="button"
                className="vau-item"
                onClick={() => onSelect({ user: u, role })}
              >
                <span className="vau-avatar"><UserIcon size={18} /></span>
                <span className="vau-item-info">
                  <span className="vau-item-name">{fullName(u)}</span>
                  {u.email && <span className="vau-item-email">{u.email}</span>}
                </span>
                <span className="vau-item-role">
                  <ShieldCheck size={13} /> {roleName(u.roleId)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ⭐ BARRA DE MODO ACTIVO
// Fija arriba, imposible de pasar por alto. Sin algo así es fácil olvidar que
// se está en modo inspección, confundirse por los botones que faltan y creer
// que la app tiene un error.
// ============================================================================

export function ViewAsBanner({
  userName, roleName, onExit,
}: { userName: string; roleName: string; onExit: () => void }) {
  return (
    <div className="vau-banner" role="status">
      <span className="vau-banner-text">
        <Eye size={15} />
        Viendo como <strong>{userName}</strong>
        <span className="vau-banner-role">{roleName}</span>
      </span>
      <button type="button" className="vau-banner-exit" onClick={onExit}>
        Salir
      </button>
    </div>
  );
}
