import { useState } from 'react';
import type { CSSProperties } from 'react';
import { ClipboardCheck, Route, FileBarChart } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Property, SystemUser } from '../types/index';
import QualityCheckView, { type QCRecord } from './QualityCheckView';
import QCRoutesTableView from './QCRoutesTableView';
import QCReportsView from './QCReportsView';
import './QualityCheckHub.css';

// ============================================================================
//  Contenedor con tres pestañas (estructura pedida por el negocio):
//   - Quality Check: la vista de inspecciones de siempre (sin cambios).
//   - Rutas: tabla en tiempo real de las rutas guardadas, con vista "En vivo".
//   - Reportes: por ahora vacía (placeholder); aquí se integrarán los reportes.
//
//  ⭐ Decisión de producto: la pestaña "Dashboard" (QCDashboardView) se retiró
//     del hub a pedido del usuario. El componente QCDashboardView.tsx queda
//     intacto en el proyecto por si se reincorpora dentro de "Reportes".
//
//  Deep-link: si la URL trae ?qcRoute=<id> (link de "Compartir ruta"), el hub
//  abre directamente la pestaña Rutas, y QCRoutesTableView abre la vista en
//  vivo de esa ruta.
// ============================================================================

interface Props {
  onOpenMenu: () => void;
  properties: Property[];
  houseToInspect: Property | null;
  clearHouseToInspect: () => void;
  currentUser?: SystemUser | null;
  // ⭐ Navegación cruzada a Houses (App.tsx monta HousesView en modals-only)
  onOpenHouseDetail?: (house: Property) => void;
  onOpenHouseEdit?: (house: Property) => void;
}

type HubTab = 'inspections' | 'routes' | 'reports';

export default function QualityCheckHub(props: Props) {
  // Si llegan con un link de ruta compartida, aterrizan directo en "Rutas"
  const [tab, setTab] = useState<HubTab>(() =>
    new URLSearchParams(window.location.search).get('qcRoute') ? 'routes' : 'inspections');

  // ⭐ "Editar" desde la pestaña Reportes: brinca a Quality Check con el registro
  const [reportToEdit, setReportToEdit] = useState<QCRecord | null>(null);

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
          {tabBtn('inspections', 'Quality Check', ClipboardCheck, '#1d4ed8')}
          {tabBtn('routes', 'Rutas', Route, '#16a34a')}
          {tabBtn('reports', 'Reportes', FileBarChart, '#7c3aed')}
        </div>
      </div>

      {/* Contenido según la pestaña */}
      {tab === 'inspections' && (
        <QualityCheckView
          onOpenMenu={props.onOpenMenu}
          properties={props.properties}
          houseToInspect={props.houseToInspect}
          clearHouseToInspect={props.clearHouseToInspect}
          currentUser={props.currentUser}
          onOpenHouseDetail={props.onOpenHouseDetail}
          onOpenHouseEdit={props.onOpenHouseEdit}
          reportToEdit={reportToEdit}
          clearReportToEdit={() => setReportToEdit(null)}
        />
      )}
      {tab === 'routes' && <QCRoutesTableView onOpenMenu={props.onOpenMenu} />}
      {/* ⭐ Punto 9: reportes acumulados del más reciente al más antiguo */}
      {tab === 'reports' && (
        <QCReportsView onEditReport={(qc) => { setReportToEdit(qc); setTab('inspections'); }} />
      )}
    </div>
  );
}