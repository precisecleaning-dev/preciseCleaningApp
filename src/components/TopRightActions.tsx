// ============================================================================
// ⭐ ACCIONES ARRIBA A LA DERECHA (solo escritorio).
// Notificaciones, "Ver como otro usuario" y Log Out viven en una barrita
// flotante fija en la esquina superior derecha, como en cualquier app de
// escritorio. En móvil NO se muestra: ahí siguen en el pie del menú lateral,
// para no romper el diseño existente (la esquina superior del móvil ya la
// usan los encabezados de cada vista).
// ============================================================================
import { useState } from 'react';
import { Bell, Eye, LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import NotificationsPanel from './NotificationsPanel';
import './TopRightActions.css';

interface TopRightActionsProps {
  /** Hay versión nueva desplegada: punto rojo en la campana. */
  updateAvailable?: boolean;
  /** Abre (o sale de) "Ver como otro usuario". Si no se pasa, el ojo no se
   *  muestra — misma regla que el menú lateral. */
  onViewAsUser?: () => void;
  isViewingAsUser?: boolean;
}

export default function TopRightActions({
  updateAvailable,
  onViewAsUser,
  isViewingAsUser,
}: TopRightActionsProps) {
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to log out?')) {
      await signOut(auth);
      window.location.reload();
    }
  };

  return (
    <>
      <div className="tra-bar">
        <button
          type="button"
          className="tra-btn"
          title="Notificaciones"
          aria-label="Notificaciones"
          onClick={() => setIsNotifOpen(true)}
        >
          <span className="tra-icon-wrap">
            <Bell size={18} />
            {updateAvailable && <span className="tra-dot" />}
          </span>
        </button>

        {onViewAsUser && (
          <button
            type="button"
            className={`tra-btn${isViewingAsUser ? ' active' : ''}`}
            title={isViewingAsUser ? 'Salir de la vista' : 'Ver como otro usuario'}
            aria-label="Ver como otro usuario"
            onClick={onViewAsUser}
          >
            <Eye size={18} />
          </button>
        )}

        <button
          type="button"
          className="tra-btn danger"
          title="Log Out"
          aria-label="Log Out"
          onClick={handleLogout}
        >
          <LogOut size={18} />
        </button>
      </div>

      <NotificationsPanel
        open={isNotifOpen}
        onClose={() => setIsNotifOpen(false)}
        updateAvailable={!!updateAvailable}
      />
    </>
  );
}
