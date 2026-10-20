import { useState } from 'react';
import type { CSSProperties } from 'react';
import { ClipboardCheck, Route } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Property, Role, SystemUser } from '../types/index';
import QualityCheckView from './QualityCheckView';
import QCRoutesTableView from './QCRoutesTableView';
import './QualityCheckHub.css';

// ============================================================================
//  Contenedor con tres pestañas (estructura pedida por el negocio):
//   - Quality Check: la vista de inspecciones de siempre (sin cambios).
//   - Rutas: tabla en tiempo real de las rutas guardadas, con vista "En vivo".
//   - Reportes: por ahora vacía (placeholder); aquí se integrarán los reportes.
//
//  ⭐ Decisión de producto: la pestaña "Dashboard" se retiró del hub a pedido
//     del usuario; su reemplazo es la vista QC Dashboard del menú. El archivo
//     viejo (QCDashboardView.tsx) se eliminó en la limpieza de 10/2026 — está
//     en el historial de git si hiciera falta.
//
//  Deep-link: si la URL trae ?qcRoute=<id> (link de "Compartir ruta"), el hub
//  abre directamente la pestaña Rutas, y QCRoutesTableView abre la vista en
//  vivo de esa ruta.
// ============================================================================

interface Props {
  // ⭐ Para los permisos 'Office Notes' (las notas de oficina solo se muestran
  //    a los roles que las tienen permitidas o al super admin) y 'QC Checklist Setup'.
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
  onOpenMenu: () => void;
  properties: Property[];
  houseToInspect: Property | null;
  clearHouseToInspect: () => void;
  currentUser?: SystemUser | null;
  // ⭐ Navegación cruzada a Houses (App.tsx monta HousesView en modals-only)
  onOpenHouseDetail?: (house: Property) => void;
}

type HubTab = 'inspections' | 'routes';

export default function QualityCheckHub(props: Props) {
  // Si llegan con un link de ruta compartida, aterrizan directo en "Rutas"
  const [tab, setTab] = useState<HubTab>(() =>
    new URLSearchParams(window.location.search).get('qcRoute') ? 'routes' : 'inspections');

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
          {/* ⭐ La pestana "Reportes" se retiro: los reportes finalizados estan en
              la tabla "Quality Check Reports" de la vista Quality Check (debajo de
              Recall), con filtros y envio por WhatsApp/email. Tener dos listados del
              mismo dato invitaba a editar en uno y consultar en el otro.
              QCReportsView.tsx se eliminó en la limpieza de 10/2026 (historial de git). */}
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
          activeRole={props.activeRole}
          isSuperAdmin={props.isSuperAdmin}
          onOpenHouseDetail={props.onOpenHouseDetail}
        />
      )}
      {tab === 'routes' && <QCRoutesTableView onOpenMenu={props.onOpenMenu} />}
    </div>
  );
}