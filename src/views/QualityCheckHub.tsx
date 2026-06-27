import { useState } from 'react';
import { ClipboardCheck, BarChart3 } from 'lucide-react';
import type { Property, SystemUser } from '../types/index';
import QualityCheckView from './QualityCheckView';
import QCDashboardView from './QCDashboardView';

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

  const tabBtn = (key: HubTab, label: string, Icon: any, activeColor: string) => {
    const active = tab === key;
    return (
      <button
        onClick={() => setTab(key)}
        style={{
          border: 'none', cursor: 'pointer', padding: '10px 22px', borderRadius: '9px',
          fontWeight: 700, fontSize: '0.9rem', whiteSpace: 'nowrap',
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          background: active ? '#ffffff' : 'transparent',
          color: active ? activeColor : '#64748b',
          boxShadow: active ? '0 1px 2px rgba(15,23,42,0.1)' : 'none',
          transition: 'all 0.15s',
        }}
      >
        <Icon size={16} /> {label}
      </button>
    );
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Barra de pestañas principal */}
      <div style={{ padding: '16px 20px 0 20px', boxSizing: 'border-box' }}>
        <div style={{
          display: 'inline-flex', gap: '2px', background: '#f1f5f9',
          border: '1px solid #e5e7eb', borderRadius: '12px', padding: '4px',
          maxWidth: '100%', flexWrap: 'wrap',
        }}>
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
        <QCDashboardView onOpenMenu={props.onOpenMenu} currentUser={props.currentUser} />
      )}
    </div>
  );
}