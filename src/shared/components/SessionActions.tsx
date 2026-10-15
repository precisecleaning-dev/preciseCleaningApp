// ============================================================================
// ⭐ NOTIFICACIONES, "VER COMO OTRO USUARIO" Y LOG OUT — un solo componente.
//    · variant="bar": fila de iconos arriba a la derecha (computadora). App la
//      dibuja como una fila propia encima de la vista, así no tapa nada.
//    · variant="menu": botones con texto en el pie del menú lateral (teléfono).
// ============================================================================
import { useState } from 'react';
import { Bell, Eye, LogOut } from 'lucide-react';
import NotificationsPanel from '../../components/NotificationsPanel';
import { logout } from '../../services/sessionService';
import './SessionActions.css';

interface SessionActionsProps {
  variant: 'bar' | 'menu';
  /** Hay versión nueva desplegada: punto rojo en la campana. */
  updateAvailable?: boolean;
  /** Abre (o sale de) "Ver como otro usuario". Sin él, el ojo no se muestra. */
  onViewAsUser?: () => void;
  isViewingAsUser?: boolean;
}

export default function SessionActions({ variant, updateAvailable, onViewAsUser, isViewingAsUser }: SessionActionsProps) {
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const withText = variant === 'menu';
  const viewAsText = isViewingAsUser ? 'Salir de la vista' : 'Ver como otro usuario';

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to log out?')) await logout(); // borra la caché local y recarga
  };

  return (
    <>
      <div className={`sa-${variant}`}>
        <button type="button" className="sa-btn" title="Notificaciones" aria-label="Notificaciones" onClick={() => setIsNotifOpen(true)}>
          <span className="sa-icon">
            <Bell size={18} />
            {updateAvailable && <span className="sa-dot" />}
          </span>
          {withText && 'Notificaciones'}
        </button>
        {onViewAsUser && (
          <button
            type="button"
            className={`sa-btn view-as${isViewingAsUser ? ' active' : ''}`}
            title={viewAsText}
            aria-label={viewAsText}
            onClick={onViewAsUser}
          >
            <Eye size={18} />
            {withText && viewAsText}
          </button>
        )}
        <button type="button" className="sa-btn danger" title="Log Out" aria-label="Log Out" onClick={handleLogout}>
          <LogOut size={18} />
          {withText && 'Log Out'}
        </button>
      </div>
      <NotificationsPanel open={isNotifOpen} onClose={() => setIsNotifOpen(false)} updateAvailable={!!updateAvailable} />
    </>
  );
}
