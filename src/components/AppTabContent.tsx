// Contenido de la pestaña activa (una vista por pestaña del menú) y el host de
// los modales de casa: un solo HousesView renderMode="modals-only" que abre el
// detalle o el formulario de una casa ENCIMA de la vista, sin sacar al usuario
// de donde está. App.tsx decide en qué pestañas (TABS_WITH_HOUSE_MODALS).
// Cada vista se descarga con lazy() la primera vez que se abre (code splitting).
import { lazy, Suspense, useState, type Dispatch, type SetStateAction } from 'react';
import type { HouseDetailTab, Property, Role, SystemUser } from '../types/index';
import { getClientsReportPermissionModule } from '../utils/clientsReport';
import type { TabOptions } from '../App';
import RouteTransition, { ViewSkeleton } from './RouteTransition';

const HousesView = lazy(() => import('../views/HousesView'));
const CustomersView = lazy(() => import('../views/CustomersView'));
const SettingsView = lazy(() => import('../views/SettingsView'));
const CalendarView = lazy(() => import('../views/CalendarView'));
const QualityCheckHub = lazy(() => import('../views/QualityCheckHub'));
const PayrollView = lazy(() => import('../views/PayrollView'));
const InvoicesView = lazy(() => import('../views/InvoicesView'));
// ⭐ CLIENTS REPORT — trabajos y Final Cost por cliente en el periodo.
const ClientsReportView = lazy(() => import('../views/ClientsReportView'));
const ActivityLogView = lazy(() => import('../views/ActivityLogView'));
const TrashView = lazy(() => import('../views/TrashView'));
const RolesView = lazy(() => import('../views/admin/RolesView'));
const UsersView = lazy(() => import('../views/admin/UsersView'));
const DataImportView = lazy(() => import('../views/DataImportView'));
const QualityDashboardView = lazy(() => import('../views/QualityDashboardView'));
const OwnerView = lazy(() => import('../views/OwnerView'));
const ManagerView = lazy(() => import('../views/ManagerView'));
const TaskListView = lazy(() => import('../features/ops/TaskListView'));
const CompanySettingsView = lazy(() => import('../views/CompanySettingsView'));
const PhotoSettingsView = lazy(() => import('../views/PhotoSettingsView'));

interface AppTabContentProps {
  activeTab: TabOptions;
  properties: Property[];
  /** Casas que ve un módulo según su Scope (All / Own) en Roles & Permissions. */
  getPropertiesForModule: (module: string) => Property[];
  roles: Role[];
  /** Usuario efectivo: el de la sesión o, con "Ver como", el elegido. */
  currentUser: SystemUser | null;
  activeRole: Role | null;
  isSuperAdmin: boolean;
  canViewDataImport: boolean;
  /** La pestaña usa casas y todavía no llega su primer snapshot: esqueleto. */
  isWaitingForProperties: boolean;
  /** La pestaña activa puede abrir una casa encima (TABS_WITH_HOUSE_MODALS). */
  canOpenHouseModals: boolean;
  currentSettingView: string;
  onCurrentSettingViewChange: Dispatch<SetStateAction<string>>;
  onNavigate: (tab: TabOptions) => void;
  onOpenMenu: () => void;
}

const AppTabContent = ({
  activeTab, properties, getPropertiesForModule, roles, currentUser, activeRole, isSuperAdmin,
  canViewDataImport, isWaitingForProperties, canOpenHouseModals, currentSettingView,
  onCurrentSettingViewChange, onNavigate, onOpenMenu,
}: AppTabContentProps) => {
  const [houseToInspect, setHouseToInspect] = useState<Property | null>(null);
  const [houseToOpenDetail, setHouseToOpenDetail] = useState<Property | null>(null);
  const [houseToOpenEdit, setHouseToOpenEdit] = useState<Property | null>(null);
  const [detailTab, setDetailTab] = useState<HouseDetailTab | undefined>();
  // El host de modales se monta la primera vez que se pide una casa: las vistas
  // que nunca abren una no pagan el render de HousesView.
  const [areHouseModalsUsed, setAreHouseModalsUsed] = useState(false);

  const handleOpenHouseDetail = (house: Property, tab?: HouseDetailTab) => {
    setAreHouseModalsUsed(true);
    setDetailTab(tab);
    setHouseToOpenDetail(house);
  };

  const handleOpenHouseEdit = (house: Property) => {
    setAreHouseModalsUsed(true);
    setHouseToOpenEdit(house);
  };

  // "Inspect" (Manager, QC Dashboard) abre la inspección en Quality Check.
  const handleInspectHouse = (house: Property) => {
    setHouseToInspect(house);
    onNavigate('qc_report');
  };

  const clearHouseToOpenDetail = () => setHouseToOpenDetail(null);
  const clearHouseToOpenEdit = () => setHouseToOpenEdit(null);

  // Lo que reciben casi todas las vistas.
  const sessionProps = { onOpenMenu, currentUser, activeRole, isSuperAdmin };

  const renderActiveView = () => {
    switch (activeTab) {
      case 'houses':
        // Houses y Pipeline reciben todas las casas: HousesView aplica su propio
        // Scope adentro (y sus allowedStatusIds).
        return (
          <HousesView
            {...sessionProps}
            properties={properties}
            houseToOpenDetail={houseToOpenDetail}
            clearHouseToOpenDetail={clearHouseToOpenDetail}
            houseToOpenEdit={houseToOpenEdit}
            clearHouseToOpenEdit={clearHouseToOpenEdit}
          />
        );
      case 'pipeline':
        return <HousesView {...sessionProps} viewMode="board" properties={properties} />;
      case 'activity_log':
        return <ActivityLogView {...sessionProps} />;
      case 'trash':
        return currentUser && <TrashView onOpenMenu={onOpenMenu} currentUser={currentUser} />;
      case 'invoices':
        return (
          <InvoicesView
            {...sessionProps}
            properties={properties}
            onOpenHouseDetail={handleOpenHouseDetail}
            onOpenHouseEdit={handleOpenHouseEdit}
          />
        );
      case 'clients_report':
        // Scope del módulo que manda (Clients Report o, sin declararlo, Invoices).
        return (
          <ClientsReportView
            onOpenMenu={onOpenMenu}
            properties={getPropertiesForModule(getClientsReportPermissionModule(activeRole))}
          />
        );
      case 'calendar':
        return (
          <CalendarView
            properties={getPropertiesForModule('Calendar')}
            onOpenMenu={onOpenMenu}
            onOpenHouseDetail={handleOpenHouseDetail}
          />
        );
      case 'task_list':
        return <TaskListView {...sessionProps} />;
      case 'payroll':
        return <PayrollView {...sessionProps} properties={properties} onOpenHouseEdit={handleOpenHouseEdit} />;
      case 'qc_report':
        // Hub con pestañas: Quality Check | Rutas | Reportes.
        return (
          <QualityCheckHub
            {...sessionProps}
            properties={properties}
            houseToInspect={houseToInspect}
            clearHouseToInspect={() => setHouseToInspect(null)}
            onOpenHouseDetail={handleOpenHouseDetail}
          />
        );
      case 'owner':
        return (
          <OwnerView
            {...sessionProps}
            properties={properties}
            onNavigate={onNavigate}
            onOpenHouseDetail={handleOpenHouseDetail}
          />
        );
      case 'manager':
        return (
          <ManagerView
            {...sessionProps}
            properties={getPropertiesForModule('Manager')}
            onOpenInspection={handleInspectHouse}
            onOpenHouseDetail={handleOpenHouseDetail}
            onOpenHouseEdit={handleOpenHouseEdit}
          />
        );
      case 'qc_dashboard':
        return (
          <QualityDashboardView
            onOpenMenu={onOpenMenu}
            properties={properties}
            activeRole={activeRole}
            isSuperAdmin={isSuperAdmin}
            onInspect={handleInspectHouse}
            onOpenHouseDetail={handleOpenHouseDetail}
          />
        );
      case 'customers':
        return <CustomersView onOpenMenu={onOpenMenu} />;
      case 'settings':
        return (
          <SettingsView
            currentSettingView={currentSettingView}
            setCurrentSettingView={onCurrentSettingViewChange}
            onOpenMenu={onOpenMenu}
          />
        );
      case 'company':
        return <CompanySettingsView onOpenMenu={onOpenMenu} />;
      case 'photo_settings':
        return <PhotoSettingsView onOpenMenu={onOpenMenu} />;
      case 'roles':
        return <RolesView onOpenMenu={onOpenMenu} roles={roles} />;
      case 'users':
        return <UsersView onOpenMenu={onOpenMenu} roles={roles} />;
      case 'data_import':
        // SuperAdmin o rol con permiso "Data Import" (el Sidebar usa la misma regla).
        return canViewDataImport && <DataImportView onOpenMenu={onOpenMenu} />;
      default:
        return null;
    }
  };

  const isHouseModalsHostShown = areHouseModalsUsed && canOpenHouseModals;

  return (
    <Suspense fallback={<ViewSkeleton />}>
      <RouteTransition routeKey={activeTab}>
        {isWaitingForProperties ? <ViewSkeleton /> : (
          <>
            {renderActiveView()}
            {isHouseModalsHostShown && (
              <Suspense fallback={null}>
                <HousesView
                  {...sessionProps}
                  renderMode="modals-only"
                  properties={properties}
                  houseToOpenDetail={houseToOpenDetail}
                  clearHouseToOpenDetail={clearHouseToOpenDetail}
                  detailInitialTab={detailTab}
                  houseToOpenEdit={houseToOpenEdit}
                  clearHouseToOpenEdit={clearHouseToOpenEdit}
                />
              </Suspense>
            )}
          </>
        )}
      </RouteTransition>
    </Suspense>
  );
};

export default AppTabContent;
