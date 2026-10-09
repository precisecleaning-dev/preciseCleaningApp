// src/components/HistoryWindowNotice.tsx
// Aviso de la ventana de 12 meses (src/shared/data/propertiesWindow.ts): dice
// qué casas se están mostrando y ofrece cargar todo el historial. Desaparece
// cuando ya se cargó todo.
import { History } from 'lucide-react';
import { showFullHistory, useFullHistory, WINDOW_MONTHS } from '../shared/data/propertiesWindow';
import './HistoryWindowNotice.css';

export default function HistoryWindowNotice() {
  const fullHistory = useFullHistory();
  if (fullHistory) return null;
  return (
    <div className="hwn-bar" role="status">
      <History size={16} className="hwn-icon" aria-hidden="true" />
      <span className="hwn-text">
        Mostrando trabajos de los últimos {WINDOW_MONTHS} meses, los programados y los pendientes de cobro.
      </span>
      <button type="button" className="hwn-btn" onClick={showFullHistory}>
        Ver todo el historial
      </button>
    </div>
  );
}
