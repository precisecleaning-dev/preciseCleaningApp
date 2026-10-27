// Aviso global "Nueva versión disponible" (useVersionCheck): lo ven todos los
// usuarios conectados, en cualquier vista, hasta que recargan.
import { RefreshCw } from 'lucide-react';
import { reloadForUpdate } from '../hooks/useVersionCheck';

const AppUpdateBanner = () => (
  <div className="app-update-toast" role="alert">
    <span className="app-update-toast-title">Nueva versión disponible</span>
    <span className="app-update-toast-text">Recarga para actualizar a la última versión del app.</span>
    <button type="button" className="app-update-toast-btn" onClick={reloadForUpdate}>
      <RefreshCw size={14} /> Actualizar ahora
    </button>
  </div>
);

export default AppUpdateBanner;
