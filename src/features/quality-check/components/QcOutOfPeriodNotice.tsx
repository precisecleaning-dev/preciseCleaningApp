// Aviso de Quality Check cuando hay casas pendientes o en Recall con Schedule
// Date fuera del periodo elegido: una casa pendiente lo sigue estando sea cual
// sea su fecha, así que nunca queda escondida sin avisar. "Ver todas" quita el
// límite del periodo (Custom sin fechas).
import { CalendarDays } from 'lucide-react';

interface QcOutOfPeriodNoticeProps {
  outOfPeriodHouseCount: number;
  onShowAllHouses: () => void;
}

const QcOutOfPeriodNotice = ({ outOfPeriodHouseCount, onShowAllHouses }: QcOutOfPeriodNoticeProps) => (
  <div className="qcv-out-of-period" role="status">
    <CalendarDays size={16} />
    <span>
      {outOfPeriodHouseCount} casa(s) pendientes o en Recall tienen Schedule Date fuera de este periodo.
    </span>
    <button type="button" className="qcv-out-of-period-btn" onClick={onShowAllHouses}>
      Ver todas
    </button>
  </div>
);

export default QcOutOfPeriodNotice;
