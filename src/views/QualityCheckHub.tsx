import { useState } from 'react';
import type { CSSProperties } from 'react';
import { ClipboardCheck, BarChart3 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Property, SystemUser } from '../types/index';
import QualityCheckView from './QualityCheckView';
import QCDashboardView from './QCDashboardView';
import './QualityCheckHub.css';

// ============================================================================
//  Contenedor con dos pestañas:
//   - Inspecciones: tu vista de Quality Check de siempre (sin cambios).
//   - Dashboard: los KPIs de gestión (Quality Check + Recall).
//  No modifica ni QualityCheckView ni QCDashboardView; solo los agrupa.
// ============================================================================

interface Props {
  onOpenMenu: () => void;
  properties: Property[];
  houseToInspect: Property | null;
  clearHouseToInspect: () => void;
  currentUser?: SystemUser | null;
}

type HubTab = 'inspections' | 'dashboard';

export default function QualityCheckHub(props: Props) {
  const [tab, setTab] = useState<HubTab>('inspections');

  const tabBtn = (key: HubTab, label: string, Icon: LucideIcon, activeColor: string) => {
    const active = tab === key;
    return (
      <button
        onClick={() => setTab(key)}
        className={`qch-tab-btn${active ? ' active' : ''}`}
        style={active ? ({ '--qch-active-color': activeColor } as CSSProperties) : undefined}
      >
        <Icon size={16} /> {label}
      </button>
    );
  };

  return (
    <div className="qch-root">
      {/* Barra de pestañas principal */}
      <div className="qch-tabbar-wrap">
        <div className="qch-tabbar">
          {tabBtn('inspections', 'Inspecciones', ClipboardCheck, '#1d4ed8')}
          {tabBtn('dashboard', 'Dashboard', BarChart3, '#4338ca')}
        </div>
      </div>

      {/* Contenido según la pestaña */}
      {tab === 'inspections' ? (
        <QualityCheckView
          onOpenMenu={props.onOpenMenu}
          properties={props.properties}
          houseToInspect={props.houseToInspect}
          clearHouseToInspect={props.clearHouseToInspect}
          currentUser={props.currentUser}
        />
      ) : (
        <QCDashboardView onOpenMenu={props.onOpenMenu} />
      )}
    </div>
  );
}