// App: sesión y perfil, listeners globales (casas y perfil), pestaña activa,
// guardia de permisos por módulo, "Ver como otro usuario" y el layout (menú,
// barra de arriba y el contenido de la pestaña en AppTabContent).
import { useEffect, useMemo, useState } from 'react';
import { browserLocalPersistence, onAuthStateChanged, setPersistence } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import type { Property, Role, SystemUser } from './types/index';
import { auth, db } from './config/firebase';
import { COLLECTIONS } from './lib/firebase/collections';
import { resetLiveCollections, useLiveCollection } from './shared/data/liveCollections';
import { subscribeProperties, useFullHistory } from './shared/data/propertiesWindow';
import { clearMemoryCache } from './shared/utils/memoryCache';
import { PHONE_QUERY, useMediaQuery } from './shared/hooks/useMediaQuery';
import { useVersionCheck } from './hooks/useVersionCheck';
import { prefetchView, startIdlePrefetch } from './utils/viewPrefetch';
import { useScrollMemory } from './utils/useScrollMemory';
import { canViewTaskList } from './features/ops/opsPermissions';
import { useTaskListBadgeCount } from './features/ops/hooks/useTaskListBadgeCount';
import { reloadOnLogoutInOtherTabs } from './services/sessionService';
import AppLoadingScreen from './components/AppLoadingScreen';
import AppTabContent from './components/AppTabContent';
import AppUpdateBanner from './components/AppUpdateBanner';
import Sidebar from './components/Sidebar';
import ViewAsUserModal, { ViewAsBanner, type ViewAsSelection } from './components/ViewAsUserModal';
import SessionActions from './shared/components/SessionActions';
import LoginView from './views/auth/LoginView';
import './App.css';

/** Pestañas del menú. TabOptions sale de esta lista: una pestaña nueva se agrega
 *  una sola vez (antes eran dos listas y 'photo_settings' faltaba en esta, así
 *  que recargar en "Fotos" volvía a Houses). */
const VALID_TABS = [
  'houses', 'pipeline', 'activity_log', 'trash', 'calendar', 'invoices', 'qc_report', 'qc_dashboard',
  'owner', 'manager', 'task_list', 'payroll', 'customers', 'settings', 'company', 'photo_settings',
  'roles', 'users', 'data_import',
] as const;
export type TabOptions = (typeof VALID_TABS)[number];

/** Última pestaña usada: al recargar, la app vuelve a ella. */
const ACTIVE_TAB_KEY = 'pc_active_tab';

/** Pestañas que reciben la lista de casas: esperan su primer snapshot. */
const TABS_WITH_PROPERTIES: ReadonlySet<TabOptions> = new Set<TabOptions>([
  'houses', 'pipeline', 'invoices', 'calendar', 'payroll', 'qc_report',
  'qc_dashboard', 'owner', 'manager',
]);
/** Pestañas que abren el detalle o el formulario de una casa encima (HousesView modals-only). */
const TABS_WITH_HOUSE_MODALS: ReadonlySet<TabOptions> = new Set<TabOptions>([
  'calendar', 'invoices', 'payroll', 'qc_report', 'qc_dashboard', 'owner', 'manager',
]);

/** Módulo(s) de Roles & Permissions que dan acceso a cada pestaña (basta uno).
 *  Una pestaña sin módulo no se revisa. */
const TAB_MODULE: Partial<Record<TabOptions, string[]>> = {
  houses: ['Houses'], pipeline: ['Houses'], invoices: ['Invoices'], calendar: ['Calendar'],
  qc_report: ['Quality Check'], qc_dashboard: ['QC Dashboard', 'Quality Check'],
  owner: ['Owner'], manager: ['Manager'], task_list: ['Task List'], payroll: ['Payroll'],
  customers: ['Customers'], roles: ['Roles & Permissions'], users: ['System Users'],
  data_import: ['Data Import'], company: ['Settings'], photo_settings: ['Settings'], settings: ['Settings'],
};
/** A dónde se manda a quien no puede ver la pestaña: la primera de estas que sí pueda. */
const FALLBACK_TAB_ORDER: TabOptions[] = [
  'houses', 'pipeline', 'invoices', 'calendar', 'qc_report', 'payroll', 'customers', 'roles',
  'users', 'data_import', 'company', 'photo_settings', 'settings',
];

const ADMINISTRATOR_ROLE_NAME = 'Administrator';

/** El rol tiene "View" en ese módulo de Roles & Permissions. */
const canRoleViewModule = (role: Role | null, module: string): boolean =>
  !!role?.permissions?.find((permission) => permission.module === module && permission.canView);

const getInitialTab = (): TabOptions => {
  // Ruta compartida (?qcRoute=<id>): abre Quality Check; el hub salta a Rutas.
  if (new URLSearchParams(window.location.search).get('qcRoute')) return 'qc_report';
  try {
    const savedTab = window.localStorage.getItem(ACTIVE_TAB_KEY);
    if (savedTab && (VALID_TABS as readonly string[]).includes(savedTab)) return savedTab as TabOptions;
  } catch { /* localStorage no disponible */ }
  return 'houses';
};

// Con sesión guardada, el código de la última pestaña empieza a bajar YA, en
// paralelo con la verificación de la sesión.
try {
  if (window.localStorage.getItem(ACTIVE_TAB_KEY)) prefetchView(getInitialTab());
} catch { /* sin localStorage: se precarga al confirmar la sesión */ }

// index.html marca has-session y pinta el esqueleto cuando hay sesión guardada.
const hasStoredSession = document.documentElement.classList.contains('has-session');

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // Evita el parpadeo del login al recargar mientras Firebase revisa la sesión.
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<SystemUser | null>(null);
  const [activeTab, setActiveTab] = useState<TabOptions>(getInitialTab);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth > 768);
  const [properties, setProperties] = useState<Property[]>([]);
  const [currentSettingView, setCurrentSettingView] = useState('menu');
  // Primer snapshot recibido: las vistas no se montan antes (evita pintar 0 / "no existe").
  const [isProfileLoaded, setIsProfileLoaded] = useState(false);
  const [arePropertiesLoaded, setArePropertiesLoaded] = useState(false);
  // "Ver como otro usuario": a propósito NO se guarda en localStorage (si
  // sobreviviera a una recarga, sería fácil olvidarlo y trabajar con menos permisos).
  const [viewAs, setViewAs] = useState<ViewAsSelection | null>(null);
  const [isViewAsModalOpen, setIsViewAsModalOpen] = useState(false);

  // El área de contenido recuerda su scroll por pestaña.
  const mainRef = useScrollMemory<HTMLElement>(activeTab);
  const updateAvailable = useVersionCheck();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isFullHistory = useFullHistory();
  // Roles del store compartido; se abre con sesión (antes las reglas lo rechazan).
  const { data: roles, loaded: areRolesLoaded } = useLiveCollection('roles', isAuthenticated);

  // El listener de casas se abre con la primera pestaña que las usa y ya no se
  // cierra: leer ~3,600 casas de la caché frena las demás consultas.
  const [arePropertiesWanted, setArePropertiesWanted] = useState(() => TABS_WITH_PROPERTIES.has(activeTab));
  if (!arePropertiesWanted && TABS_WITH_PROPERTIES.has(activeTab)) setArePropertiesWanted(true);

  // Guarda la pestaña activa para restaurarla al recargar.
  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
    } catch { /* localStorage no disponible */ }
  }, [activeTab]);

  // La sesión de Firebase sobrevive a la recarga.
  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.error('No se pudo fijar la persistencia de sesión:', error);
    });
  }, []);

  // Si se cierra sesión en otra pestaña, esta se recarga (su Firestore quedó apagado).
  useEffect(() => reloadOnLogoutInOtherTabs(), []);

  // Listener global de casas (ventana de 12 meses, o todo con "Ver todo el historial").
  useEffect(() => {
    if (!isAuthenticated || !arePropertiesWanted) return;
    return subscribeProperties(
      isFullHistory,
      (loadedProperties) => {
        setProperties(loadedProperties);
        setArePropertiesLoaded(true);
      },
      (error) => {
        console.error('Error loading properties globally:', error);
        setArePropertiesLoaded(true); // no bloquear la app si falla
      },
    );
  }, [isAuthenticated, arePropertiesWanted, isFullHistory]);

  // Sesión de Firebase. Al cerrarla se cierran los listeners compartidos y se
  // vacían sus datos y las lecturas en memoria: el siguiente usuario no ve nada
  // del anterior.
  useEffect(() => onAuthStateChanged(auth, (authUser) => {
    setIsAuthChecked(true);
    if (authUser?.email) {
      setIsAuthenticated(true);
      setAuthUserEmail(authUser.email.toLowerCase().trim());
      return;
    }
    setIsAuthenticated(false);
    setAuthUserEmail(null);
    setCurrentUser(null);
    setIsProfileLoaded(false);
    setArePropertiesLoaded(false);
    resetLiveCollections();
    clearMemoryCache();
  }), []);

  // Perfil del usuario (system_users por email), con el caché local de Firestore.
  useEffect(() => {
    if (!authUserEmail) return;
    try {
      const profileQuery = query(collection(db, COLLECTIONS.systemUsers), where('email', '==', authUserEmail));
      return onSnapshot(profileQuery, (snapshot) => {
        const profileDoc = snapshot.docs[0];
        setCurrentUser(profileDoc ? ({ id: profileDoc.id, ...profileDoc.data() } as SystemUser) : null);
        setIsProfileLoaded(true);
      }, (error) => {
        console.error('Error fetching user profile:', error);
        setIsProfileLoaded(true); // no bloquear la app si falla
      });
    } catch (error) {
      console.error('Error setting up user profile listener:', error);
      setIsProfileLoaded(true);
    }
  }, [authUserEmail]);

  // Rol y usuario REALES (los de la sesión), antes de "Ver como".
  const realRole = useMemo(
    () => (currentUser ? roles.find((role) => role.id === currentUser.roleId) ?? null : null),
    [currentUser, roles],
  );
  const isRealSuperAdmin = realRole?.name === ADMINISTRATOR_ROLE_NAME;

  // Desde aquí TODA la app usa activeRole / effectiveUser: con "Ver como" apuntan
  // a la persona elegida (menú, botones por rol, "solo mis casas"), y nunca se
  // hereda el superadmin del usuario real.
  const activeRole = viewAs ? viewAs.role : realRole;
  const effectiveUser = viewAs ? viewAs.user : currentUser;
  const isSuperAdmin = viewAs ? activeRole?.name === ADMINISTRATOR_ROLE_NAME : isRealSuperAdmin;

  // Círculo de "Task List" en el menú: abiertas asignadas + las que esperan su OK.
  const taskListBadgeCount = useTaskListBadgeCount(
    canViewTaskList(activeRole, isSuperAdmin) ? effectiveUser?.id ?? null : null,
  );

  const canUseViewAs = isRealSuperAdmin
    || !!realRole?.permissions?.find((permission) => permission.module === 'View As User')?.canView;
  // Data Import: SuperAdmin o el permiso "Data Import" (el Sidebar usa la misma regla).
  const canViewDataImport = isSuperAdmin
    || !!activeRole?.permissions?.find((permission) => permission.module === 'Data Import')?.canView;

  // Guardia de permisos: el menú oculta lo que no se puede ver, pero la pestaña
  // puede llegar de la última usada. Sin permiso, se pasa a la primera permitida.
  useEffect(() => {
    if (isSuperAdmin || !activeRole) return;
    const canViewTab = (tab: TabOptions): boolean => {
      // Task list: permiso propio con respaldo a Manager/Owner (opsPermissions.ts).
      if (tab === 'task_list' && canViewTaskList(activeRole, false)) return true;
      // Fotos: manda el permiso "Photo Settings" si el rol lo tiene; si no, el
      // de Settings (la misma regla que el ítem del menú, canViewOrLegacy).
      const photoSettingsPermission = tab === 'photo_settings'
        ? activeRole.permissions?.find((permission) => permission.module === 'Photo Settings')
        : undefined;
      if (photoSettingsPermission) return !!photoSettingsPermission.canView;
      const tabModules = TAB_MODULE[tab];
      return !tabModules || tabModules.some((module) => canRoleViewModule(activeRole, module));
    };
    if (canViewTab(activeTab)) return;
    const fallbackTab = FALLBACK_TAB_ORDER.find(canViewTab);
    if (fallbackTab) setActiveTab(fallbackTab);
  }, [activeTab, activeRole, isSuperAdmin]);

  // Precarga en reposo de las vistas más usadas, al iniciar sesión (antes el
  // ancho de banda es de Firestore). La pestaña actual va primero.
  useEffect(() => {
    if (!isAuthenticated) return;
    prefetchView(activeTab);
    return startIdlePrefetch();
    // Solo al iniciar sesión, no en cada cambio de pestaña.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Scope por módulo (Roles & Permissions → Scope): 'Own' = solo las casas
  // asignadas a la persona (assignedWorkers) o de su equipo, la misma regla
  // que HousesView. Con "Ver como" aplica las de la persona elegida.
  const isOwnProperty = (property: Property): boolean => {
    if (!effectiveUser) return false;
    if (property.assignedWorkers?.includes(effectiveUser.id)) return true;
    return !!effectiveUser.teamId && property.teamId === effectiveUser.teamId;
  };
  const getPropertiesForModule = (module: string): Property[] => {
    const modulePermission = activeRole?.permissions?.find((permission) => permission.module === module);
    const isOwnScope = !isSuperAdmin && modulePermission?.scope === 'Own';
    return isOwnScope ? properties.filter(isOwnProperty) : properties;
  };

  const handleSettingsClick = () => {
    setActiveTab('settings');
    setCurrentSettingView('menu');
  };

  const handleToggleViewAs = () => {
    if (viewAs) setViewAs(null);
    else setIsViewAsModalOpen(true);
  };

  const handleSelectViewAs = (selection: ViewAsSelection) => {
    setViewAs(selection);
    setIsViewAsModalOpen(false);
  };

  const toggleMenu = () => setIsSidebarOpen((isOpen) => !isOpen);

  if (!isAuthChecked) return <AppLoadingScreen isSidebarOpen={isSidebarOpen} isSkeleton={hasStoredSession} />;
  // LoginView avisa después de un inicio de sesión exitoso; perfil y roles los carga onAuthStateChanged.
  if (!isAuthenticated) return <LoginView onLoginSuccess={() => setIsAuthenticated(true)} />;
  // Roles y perfil deciden el menú y los permisos. Las casas no bloquean toda la
  // pantalla: solo las vistas que las usan esperan (AppTabContent).
  if (!areRolesLoaded || !isProfileLoaded) return <AppLoadingScreen isSidebarOpen={isSidebarOpen} isSkeleton />;

  const onViewAsUser = canUseViewAs ? handleToggleViewAs : undefined;
  // `||` a propósito: un nombre vacío ('') también pasa al siguiente.
  const viewAsUserName = viewAs
    ? [viewAs.user.firstName, viewAs.user.lastName].filter(Boolean).join(' ') || viewAs.user.email || 'Usuario'
    : '';

  return (
    <div className="app-container">
      {updateAvailable && <AppUpdateBanner />}

      <Sidebar
        updateAvailable={updateAvailable}
        onViewAsUser={onViewAsUser}
        isViewingAsUser={!!viewAs}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onSettingsClick={handleSettingsClick}
        activeRole={activeRole}
        isSuperAdmin={isSuperAdmin}
        taskListBadgeCount={taskListBadgeCount}
      />

      <main className="main-content" ref={mainRef}>
        {/* Notificaciones / Ver como / Log Out: arriba a la derecha en la
            computadora; en el teléfono van en el pie del menú lateral. */}
        {!isPhone && (
          <div className="app-topbar">
            <SessionActions variant="bar" updateAvailable={updateAvailable} onViewAsUser={onViewAsUser} isViewingAsUser={!!viewAs} />
          </div>
        )}
        {/* Barra fija de "Ver como": sin ella es fácil olvidar que se ve como otra persona. */}
        {viewAs && (
          <ViewAsBanner userName={viewAsUserName} roleName={viewAs.role?.name || 'Sin rol'} onExit={() => setViewAs(null)} />
        )}
        <AppTabContent
          activeTab={activeTab}
          properties={properties}
          getPropertiesForModule={getPropertiesForModule}
          roles={roles}
          currentUser={effectiveUser}
          activeRole={activeRole}
          isSuperAdmin={isSuperAdmin}
          canViewDataImport={canViewDataImport}
          isWaitingForProperties={!arePropertiesLoaded && TABS_WITH_PROPERTIES.has(activeTab)}
          canOpenHouseModals={TABS_WITH_HOUSE_MODALS.has(activeTab)}
          currentSettingView={currentSettingView}
          onCurrentSettingViewChange={setCurrentSettingView}
          onNavigate={setActiveTab}
          onOpenMenu={toggleMenu}
        />
      </main>

      {isViewAsModalOpen && (
        <ViewAsUserModal
          roles={roles}
          currentUserId={currentUser?.id}
          onSelect={handleSelectViewAs}
          onClose={() => setIsViewAsModalOpen(false)}
        />
      )}
    </div>
  );
};

export default App;
