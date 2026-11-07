// Aviso de un trabajo de Carpet que todavía no tiene un servicio cobrado de
// carpet. Va en el formulario y en el detalle de la casa; no impide guardar.
import { AlertTriangle } from 'lucide-react';
import './CarpetServiceNotice.css';

const CarpetServiceNotice = () => (
  <div className="csn-notice" role="status">
    <AlertTriangle size={16} className="csn-icon" aria-hidden="true" />
    <span>
      Carpet job: add a <strong>Carpet Cleaning</strong> service (or any service with "carpet") to Billed Services.
    </span>
  </div>
);

export default CarpetServiceNotice;
