import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import RouteTransition, { ViewSkeleton } from './components/RouteTransition';
import { startIdlePrefetch, prefetchView } from './utils/viewPrefetch';
import { useScrollMemory } from './utils/useScrollMemory';
import ViewAsUserModal, { ViewAsBanner, type ViewAsSelection } from './components/ViewAsUserModal';
import Sidebar from './components/Sidebar';
// ⭐ Notificaciones / Ver como / Log Out: un solo componente (barra arriba en
//    la computadora, pie del menú en el teléfono).
import SessionActions from './shared/components/SessionActions';
import { PHONE_QUERY, useMediaQuery } from './shared/hooks/useMediaQuery';
// ⭐ Aviso de versión nueva a todos los usuarios conectados.
import { useVersionCheck, reloadForUpdate } from './hooks/useVersionCheck';
import { RefreshCw } from 'lucide-react';
import LoginView from './views/auth/LoginView';

// ⭐ PERF: CODE SPLITTING. Antes las 19 vistas se empaquetaban en un solo
//    bundle que el navegador tenia que descargar y parsear ANTES de pintar
//    nada, aunque el usuario solo fuera a abrir una. Con lazy() cada vista
//    se descarga en su propio archivo, la primera vez que se abre.
//    LoginView y Sidebar se quedan estaticos porque se necesitan de entrada.
const HousesView = lazy(() => import('./views/HousesView'));
const CustomersView = lazy(() => import('./views/CustomersView'));
const SettingsView = lazy(() => import('./views/SettingsView'));
const CalendarView = lazy(() => import('./views/CalendarView'));
const QualityCheckHub = lazy(() => import('./views/QualityCheckHub'));
const PayrollView = lazy(() => import('./views/PayrollView'));
const InvoicesView = lazy(() => import('./views/InvoicesView'));
// ⭐ CLIENTS REPORT — trabajos y Final Cost por cliente en el periodo (como la
//    tabla dinámica de la hoja del mes).
const ClientsReportView = lazy(() => import('./views/ClientsReportView'));
// ⭐ NO STATUS — casas sin estado asignado (salieron de Overview y Pipeline)
// ⭐ ACTIVITY LOG — bitacora de todo lo que se hace en la app
const ActivityLogView = lazy(() => import('./views/ActivityLogView'));
// ⭐ Papelera de reciclaje: restaurar o eliminar definitivamente lo borrado.
const TrashView = lazy(() => import('./views/TrashView'));
const RolesView = lazy(() => import('./views/admin/RolesView'));
const UsersView = lazy(() => import('./views/admin/UsersView'));
// ⭐ Vista de importacion de CSV (solo SuperAdmin)
const DataImportView = lazy(() => import('./views/DataImportView'));
// ⭐ Vista de Recalls (ranking de equipos)
// ⭐ QC DASHBOARD — vista nueva (diseño del lienzo): indicadores de calidad,
//    inspecciones con score/resultado/áreas con fallas y scorecard por equipo.
//    No reemplaza a Quality Check (ni a su tabla de reportes).
const QualityDashboardView = lazy(() => import('./views/QualityDashboardView'));
const OwnerView = lazy(() => import('./views/OwnerView'));
const ManagerView = lazy(() => import('./views/ManagerView'));
const TaskListView = lazy(() => import('./features/ops/TaskListView'));
// ⭐ Vista de historial de status por casa
// ⭐ Modulo de empresa (logo, nombre, correo, direccion)
const CompanySettingsView = lazy(() => import('./views/CompanySettingsView'));
// ⭐ Configuracion de compresion/captura de fotos
const PhotoSettingsView = lazy(() => import('./views/PhotoSettingsView'));

import type { Property, SystemUser } from './types/index';
import './App.css';

import { auth, db } from './config/firebase';
import { useLiveCollection, resetLiveCollections } from './shared/data/liveCollections';
import { clearMemoryCache } from './shared/utils/memoryCache';
import { subscribeProperties, useFullHistory } from './shared/data/propertiesWindow';
import { canViewTaskList } from './features/ops/opsPermissions';
import { useTaskListBadgeCount } from './features/ops/hooks/useTaskListBadgeCount';
import { reloadOnLogoutInOtherTabs } from './services/sessionService';
import { onAuthStateChanged, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export type TabOptions = 'houses' | 'pipeline' | 'activity_log' | 'trash' | 'calendar' | 'invoices' | 'clients_report' | 'qc_report' | 'qc_dashboard' | 'owner' | 'manager' | 'task_list' | 'payroll' | 'customers' | 'settings' | 'company' | 'photo_settings' | 'roles' | 'users' | 'data_import';

// ⭐ Persistencia de la pestaña activa: al recargar, la app vuelve a la misma
//    vista en la que estabas (p. ej. Quality Check) en vez de regresar a Houses.
const ACTIVE_TAB_KEY = 'pc_active_tab';

/** Pestañas que reciben la lista de casas: esperan su primer snapshot. */
const TABS_WITH_PROPERTIES: ReadonlySet<TabOptions> = new Set<TabOptions>([
  'houses', 'pipeline', 'invoices', 'calendar', 'payroll', 'qc_report',
  'qc_dashboard', 'owner', 'manager', 'clients_report',
]);
/** Pestañas que abren el detalle o el formulario de una casa encima (HousesView modals-only). */
const TABS_WITH_HOUSE_MODALS: ReadonlySet<TabOptions> = new Set<TabOptions>([
  'calendar', 'invoices', 'payroll', 'qc_report', 'qc_dashboard', 'owner', 'manager',
]);
const VALID_TABS: TabOptions[] = ['houses', 'pipeline', 'activity_log', 'trash', 'calendar', 'invoices', 'clients_report', 'qc_report', 'qc_dashboard', 'owner', 'manager', 'task_list', 'payroll', 'customers', 'settings', 'company', 'roles', 'users', 'data_import'];
const getInitialTab = (): TabOptions => {
  if (typeof window === 'undefined') return 'houses';
  // ⭐ Deep-link de ruta compartida (?qcRoute=<id>): abre la app directo en
  //    Quality Check; ahí el hub salta a la pestaña Rutas y abre la vista en vivo.
  try {
    if (new URLSearchParams(window.location.search).get('qcRoute')) return 'qc_report';
  } catch { /* noop */ }
  try {
    const saved = window.localStorage.getItem(ACTIVE_TAB_KEY);
    if (saved && (VALID_TABS as string[]).includes(saved)) return saved as TabOptions;
  } catch {
    /* localStorage no disponible */
  }
  return 'houses';
};

// ⭐ Quien ya usó la app en este equipo casi siempre tiene la sesión guardada:
//    el código de su última pestaña empieza a descargarse YA, en paralelo con
//    la verificación de sesión, en vez de esperar a que Firebase la confirme.
try {
  if (typeof window !== 'undefined' && window.localStorage.getItem(ACTIVE_TAB_KEY)) {
    prefetchView(getInitialTab());
  }
} catch { /* sin localStorage: se precarga al confirmar la sesión */ }

// index.html marca has-session y pinta el esqueleto cuando hay sesión guardada.
const hasStoredSession = document.documentElement.classList.contains('has-session');

// ⭐ Pantalla de carga reutilizable (verificando sesión / cargando datos).
const LoadingScreen = ({ text }: { text: string }) => (
  <div className="app-loading-screen">
    <div className="app-loading-spinner" />
    <div className="app-loading-text">{text}</div>
  </div>
);

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthChecked, setIsAuthChecked] = useState<boolean>(false); // ⭐ Para evitar flash de LoginView al recargar
  const [currentUser, setCurrentUser] = useState<SystemUser | null>(null);
  
  const [activeTab, setActiveTab] = useState<TabOptions>(getInitialTab); // ⭐ Restaura la última pestaña usada

  // ⭐ El area de contenido recuerda su scroll por pestaña: volver a Overview
  //    despues de abrir una casa deja la lista donde estaba, no arriba del todo.
  const mainRef = useScrollMemory<HTMLElement>(activeTab);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') return window.innerWidth > 768;
    return true;
  });
  
  const [properties, setProperties] = useState<Property[]>([]);
  const [currentSettingView, setCurrentSettingView] = useState<string>('menu');
  const [houseToInspect, setHouseToInspect] = useState<Property | null>(null);
  // ⭐ Apertura externa en HousesView (desde Quality Check): detalle o formulario de edición
  const [houseToOpenDetail, setHouseToOpenDetail] = useState<Property | null>(null);
  const [houseToOpenEdit, setHouseToOpenEdit] = useState<Property | null>(null);
  // Pestaña con la que abre el detalle ("media" = fotos y PDF, desde Invoices).
  const [detailTab, setDetailTab] = useState<'media' | undefined>();
  // El host de modales de Houses se monta la primera vez que se pide una casa:
  // las vistas que nunca abren una no pagan el render de HousesView.
  const [houseModalsUsed, setHouseModalsUsed] = useState(false);
  const openHouseDetail = (house: Property, tab?: 'media') => {
    setHouseModalsUsed(true);
    setDetailTab(tab);
    setHouseToOpenDetail(house);
  };
  const openHouseEdit = (house: Property) => {
    setHouseModalsUsed(true);
    setHouseToOpenEdit(house);
  };

  // ⭐ Flags de "primer dato recibido". Sirven para NO montar las vistas hasta que
  //    properties, roles y el perfil tengan al menos su primer snapshot. Con la
  //    caché local (IndexedDB) estos llegan en milisegundos al recargar, así que
  //    no hay demora perceptible; pero se evita el bug de mostrar 0 / "no existe"
  //    mientras la data aún no llega.
  const [profileLoaded, setProfileLoaded] = useState<boolean>(false);
  const [propertiesLoaded, setPropertiesLoaded] = useState<boolean>(false);

  // ⭐ Guardar la pestaña activa cada vez que cambia, para restaurarla al recargar.
  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
    } catch {
      /* localStorage no disponible */
    }
  }, [activeTab]);

  // ⭐ Asegurar que la sesión de Firebase se guarde en el navegador
  //    (browserLocalPersistence) para que SOBREVIVA al recargar la página.
  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.error('No se pudo fijar la persistencia de sesión:', err);
    });
  }, []);

  // ⭐ Roles desde el store compartido (src/shared/data/liveCollections.ts): el
  //    mismo listener lo usan HousesView, RolesView y Owner/Manager. Se abre al
  //    haber sesión (antes no hace falta y las reglas lo rechazarían).
  const { data: roles, loaded: rolesLoaded } = useLiveCollection('roles', isAuthenticated);

  // ⭐⭐ LISTENER GLOBAL DE PROPERTIES (el fix principal).
  //    Antes, la colección 'properties' SOLO se cargaba dentro de HousesView.
  //    Si recargabas en otra pestaña (Quality Check, Status History, Recalls,
  //    QC Route, Calendar, Invoices), HousesView no se montaba y 'properties'
  //    quedaba vacío → todo aparecía en 0 / "no existe". Ahora se carga aquí,
  //    a nivel App, así SIEMPRE está disponible sin importar en qué vista estés.
  //    Se inicia solo cuando hay sesión (para que Firestore tenga el token de auth).
  // ⭐ Ventana de 12 meses (src/shared/data/propertiesWindow.ts): por defecto
  //    solo las casas recientes, futuras, sin fecha válida o pendientes de
  //    cobro; con "Ver todo el historial" se escucha la colección completa.
  const fullHistory = useFullHistory();
  // El listener se abre con la primera pestaña que usa casas y ya no se cierra.
  // Antes se abría al entrar en cualquiera: leer ~3,600 casas de la caché frena
  // todas las demás consultas (Task list tardaba 3.9 s en vez de 1.2 s en un teléfono).
  const [propertiesWanted, setPropertiesWanted] = useState(() => TABS_WITH_PROPERTIES.has(activeTab));
  if (!propertiesWanted && TABS_WITH_PROPERTIES.has(activeTab)) setPropertiesWanted(true);
  // Si se cierra sesión en otra pestaña, esta se recarga (su Firestore quedó apagado).
  useEffect(() => reloadOnLogoutInOtherTabs(), []);
  useEffect(() => {
    if (!isAuthenticated || !propertiesWanted) {
      setPropertiesLoaded(false);
      return;
    }
    const unsub = subscribeProperties(
      fullHistory,
      (data) => {
        setProperties(data);
        setPropertiesLoaded(true);
      },
      (error) => {
        console.error("Error loading properties globally:", error);
        setPropertiesLoaded(true); // no bloquear la app si falla
      }
    );
    return () => unsub();
  }, [isAuthenticated, propertiesWanted, fullHistory]);

  useEffect(() => {
    // ⭐ Mantenemos una referencia al unsubscribe del onSnapshot del usuario
    // para limpiarlo cuando cambie la sesión.
    let userProfileUnsub: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Limpiar listener previo del usuario si existe
      if (userProfileUnsub) {
        userProfileUnsub();
        userProfileUnsub = null;
      }

      if (user && user.email) {
        setIsAuthenticated(true);

        // ⭐ CLAVE (fix recarga): en cuanto Firebase confirma que HAY sesión,
        //    ya podemos salir de la pantalla de "Verificando sesión...".
        setIsAuthChecked(true);

        // ⭐ Usar onSnapshot en lugar de getDocs aprovecha el cache local.
        try {
          const q = query(collection(db, 'system_users'), where('email', '==', user.email.toLowerCase().trim()));
          userProfileUnsub = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
              const userData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as SystemUser;
              setCurrentUser(userData);
            } else {
              setCurrentUser(null);
            }
            setProfileLoaded(true); // primer snapshot del perfil recibido
          }, (error) => {
            console.error("Error fetching user profile:", error);
            setProfileLoaded(true); // no bloquear la app si falla
          });
        } catch (error) {
          console.error("Error setting up user profile listener:", error);
          setProfileLoaded(true);
        }
      } else {
        setIsAuthenticated(false);
        setCurrentUser(null);
        setProfileLoaded(false);
        setPropertiesLoaded(false);
        // ⭐ Al cerrar sesión se cierran los listeners compartidos y se vacían
        //    sus datos y las lecturas en memoria: el siguiente usuario no ve
        //    nada del anterior.
        resetLiveCollections();
        clearMemoryCache();
        // ⭐ Marcar que ya verificamos la sesión (no hay usuario).
        setIsAuthChecked(true);
      }
    });
    return () => {
      unsubscribe();
      if (userProfileUnsub) userProfileUnsub();
    };
  }, []);

  // ⭐ Se ELIMINÓ el auto-logout por inactividad (15 min): la sesión ahora
  //    solo se cierra cuando el usuario presiona Log Out manualmente.

  // ⭐ LoginView solo avisa DESPUÉS de un signInWithEmailAndPassword exitoso; el
  //    resto (perfil, roles) lo carga onAuthStateChanged. El antiguo "modo bypass"
  //    (entrar sin sesión de Firebase y con permisos de superadmin) era
  //    inalcanzable y se eliminó en la limpieza de 10/2026.
  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  // ⭐ VER COMO OTRO USUARIO. Deliberadamente NO se persiste en localStorage:
  //    es una herramienta de inspeccion momentanea. Si sobreviviera a un
  //    refresco, seria facil olvidarse y trabajar dias creyendo tener menos
  //    permisos de los reales.
  const [viewAs, setViewAs] = useState<ViewAsSelection | null>(null);
  // ⭐ true cuando /version.json trae un sello distinto al del bundle en
  //    memoria: hay versión nueva desplegada → banner + punto en la campana.
  const updateAvailable = useVersionCheck();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [isViewAsModalOpen, setIsViewAsModalOpen] = useState(false);

  // Rol y usuario REALES (los de la sesion), antes de cualquier suplantacion.
  const realRole = useMemo(() => {
    if (!currentUser || roles.length === 0) return null;
    return roles.find(r => r.id === currentUser.roleId) || null;
  }, [currentUser, roles]);

  const realIsSuperAdmin = realRole?.name === 'Administrator';

  // ⭐ A partir de aqui TODA la app usa activeRole / effectiveUser. Al suplantar,
  //    estos apuntan al usuario elegido, asi que el menu, los botones por rol y
  //    los filtros "solo mis casas" se comportan igual que para esa persona.
  const activeRole = viewAs ? viewAs.role : realRole;
  const effectiveUser = viewAs ? viewAs.user : currentUser;

  // Mientras se suplanta NUNCA se hereda el superadmin del usuario real: si no,
  // se veria todo igual y la funcion no serviria para nada.
  const isSuperAdmin = viewAs
    ? activeRole?.name === 'Administrator'
    : realIsSuperAdmin;
  // Círculo de "Task List" en el menú: abiertas asignadas + las que esperan su OK.
  const taskListBadgeCount = useTaskListBadgeCount(
    canViewTaskList(activeRole, isSuperAdmin) ? effectiveUser?.id ?? null : null,
  );

  // ⭐ ¿Puede usar la herramienta? Permiso propio "View As User", o ser admin.
  const canUseViewAs = realIsSuperAdmin
    || !!realRole?.permissions?.find((p: { module: string; canView?: boolean }) =>
         p.module === 'View As User')?.canView;

  const exitViewAs = () => setViewAs(null);
  const toggleViewAs = canUseViewAs
    ? () => { if (viewAs) exitViewAs(); else setIsViewAsModalOpen(true); }
    : undefined;

  // ⭐ CUMPLIMIENTO ESTRICTO DE PERMISOS POR MÓDULO: el Sidebar oculta los items,
  //    pero el tab activo puede llegar por localStorage (última pestaña usada) o
  //    navegación directa. Esta guardia verifica el permiso canView del módulo
  //    correspondiente y, si el rol no lo tiene, redirige al primer módulo permitido.
  useEffect(() => {
    if (isSuperAdmin || !activeRole) return;
    const TAB_MODULE: Partial<Record<TabOptions, string[]>> = {
      houses: ['Houses'], pipeline: ['Houses'], invoices: ['Invoices'], calendar: ['Calendar'],
      qc_report: ['Quality Check'],
      qc_dashboard: ['QC Dashboard', 'Quality Check'],
      // Sin "Clients Report" declarado, lo hereda de Invoices (mismas cifras).
      clients_report: ['Clients Report', 'Invoices'],
      owner: ['Owner'], manager: ['Manager'], task_list: ['Task List'],
      payroll: ['Payroll'],
      customers: ['Customers'], roles: ['Roles & Permissions'], users: ['System Users'],
      data_import: ['Data Import'], company: ['Settings'], photo_settings: ['Settings'],
      settings: ['Settings'],
    };
    const canViewModule = (m: string) =>
      !!activeRole.permissions?.find(p => p.module === m && p.canView);
    // Task list: permiso propio con respaldo a Manager/Owner (opsPermissions.ts).
    if (activeTab === 'task_list' && canViewTaskList(activeRole, false)) return;
    const mods = TAB_MODULE[activeTab];
    if (!mods || mods.some(canViewModule)) return; // sin mapeo o permitido: no tocar
    const order: TabOptions[] = ['houses', 'pipeline', 'invoices', 'calendar', 'qc_report',
      'payroll', 'customers', 'roles', 'users', 'data_import', 'company',
      'photo_settings', 'settings'];
    const fallback = order.find(t => (TAB_MODULE[t] || []).some(canViewModule));
    if (fallback) setActiveTab(fallback);
  }, [activeTab, activeRole, isSuperAdmin]);
  // ⭐ Data Import: SuperAdmin siempre; o cualquier rol con el permiso "Data Import" (casilla View en Roles).
  const canViewDataImport = isSuperAdmin || !!activeRole?.permissions?.find((p) => p.module === 'Data Import')?.canView;
  // ⭐ SCOPE POR MÓDULO (Roles & Permissions → columna Scope): 'Own' significa que
  //    el rol solo ve SUS registros. Un registro es "propio" si el usuario está en
  //    assignedWorkers (ids de system_users) o comparte teamId — exactamente la
  //    misma regla que HousesView aplica internamente (propertiesWithScope).
  const isOwnProperty = (prop: Property): boolean => {
    // ⭐ Se usa effectiveUser: al ver como otra persona, el filtro "solo mis
    //    casas" debe aplicar SUS asignaciones, no las del admin que inspecciona.
    if (!effectiveUser) return false;
    if (prop.assignedWorkers?.includes(effectiveUser.id)) return true;
    return !!(effectiveUser.teamId && prop.teamId === effectiveUser.teamId);
  };
  const moduleScope = (module: string): 'All' | 'Own' => {
    if (isSuperAdmin) return 'All';
    const p = activeRole?.permissions?.find((x: { module: string; scope?: 'All' | 'Own' }) => x.module === module);
    return p?.scope === 'Own' ? 'Own' : 'All';
  };
  const propertiesForModule = (module: string): Property[] =>
    moduleScope(module) === 'Own' ? properties.filter(isOwnProperty) : properties;

  // Houses/Pipeline reciben todo: HousesView aplica su propio scope adentro (y
  // además sus allowedStatusIds); duplicar el filtro aquí cambiaría su comportamiento.
  const visibleProperties = properties;

  const handleSettingsClick = () => {
    setActiveTab('settings');
    setCurrentSettingView('menu');
  }; 


  const handleCheckHouse = (house: Property) => {
    setHouseToInspect(house);
    setActiveTab('qc_report');
  };

  const toggleMenu = () => setIsSidebarOpen(!isSidebarOpen);

  // ⭐ PRECARGA EN REPOSO de los modulos mas usados. Arranca solo cuando ya hay
  //    sesion y datos: antes de eso el ancho de banda le pertenece a Firestore,
  //    que es lo que el usuario esta esperando ver. Ver src/utils/viewPrefetch.ts.
  useEffect(() => {
    if (!isAuthenticated) return;
    // La pestana ACTUAL primero: si el usuario recargo estando en Invoices,
    // ese chunk es el unico que bloquea la pantalla ahora mismo.
    prefetchView(activeTab);
    return startIdlePrefetch();
    // Solo debe arrancar al iniciar sesion, no en cada cambio de pestana.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ⭐ ¿Está la data base lista para pintar la app? Roles + perfil (deciden
  //    el menú y los permisos). Las CASAS ya no bloquean toda la pantalla:
  //    el menú y las vistas que no las usan (Settings, Customers, Users…)
  //    aparecen de inmediato, y las que sí las usan muestran el esqueleto
  //    de la vista hasta el primer snapshot (evita pintar 0 / "no existe").
  const appDataReady = rolesLoaded && profileLoaded;
  const waitingForProperties = !propertiesLoaded && TABS_WITH_PROPERTIES.has(activeTab);

  // ⭐ Roles y perfil aún no llegan (deciden el menú y los permisos): se dibuja
  //    la forma de la app (barra lateral y esqueleto de la vista) en vez de
  //    "Cargando datos..." a pantalla completa. index.html pinta lo mismo.
  const appSkeleton = (
    <div className="app-container">
      <aside className={`sidebar-container ${isSidebarOpen ? 'open' : 'closed'}`} aria-hidden="true" />
      <main className="main-content"><ViewSkeleton /></main>
    </div>
  );

  // ⭐ Mientras Firebase verifica la sesión: si había una guardada, se queda el
  //    esqueleto que ya pintó index.html; si no, pantalla de carga.
  if (!isAuthChecked) {
    return hasStoredSession ? appSkeleton : <LoadingScreen text="Verificando sesión..." />;
  }

  if (!isAuthenticated) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  if (!appDataReady) return appSkeleton;

  return (
    <div className="app-container">
      {/* ⭐ BANNER GLOBAL: hay versión nueva desplegada — visible para TODOS
          los usuarios en cualquier vista hasta que recarguen. */}
      {updateAvailable && (
        <div className="app-update-toast" role="alert">
          <span className="app-update-toast-title">Nueva versión disponible</span>
          <span className="app-update-toast-text">
            Recarga para actualizar a la última versión del app.
          </span>
          <button className="app-update-toast-btn" onClick={reloadForUpdate}>
            <RefreshCw size={14} /> Actualizar ahora
          </button>
        </div>
      )}

      <Sidebar
        updateAvailable={updateAvailable}
        onViewAsUser={toggleViewAs}
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

      {/* ⭐ `key` por pestaña: fuerza un contenedor nuevo en cada navegacion, que
          es lo que permite reiniciar el scroll y animar la entrada. */}
      <main className="main-content" ref={mainRef}>
        {/* ⭐ Notificaciones / Ver como / Log Out en su propia fila arriba a la
            derecha (computadora): no flota encima de los encabezados de las
            vistas. En el teléfono están en el pie del menú lateral. */}
        {!isPhone && (
          <div className="app-topbar">
            <SessionActions variant="bar" updateAvailable={updateAvailable} onViewAsUser={toggleViewAs} isViewingAsUser={!!viewAs} />
          </div>
        )}
        {/* ⭐ Barra fija de modo inspeccion: sin algo asi es facil olvidar que se
            esta viendo como otra persona, confundirse por los botones que faltan
            y creer que la app tiene un error. */}
        {viewAs && (
          <ViewAsBanner
            userName={[viewAs.user.firstName, viewAs.user.lastName].filter(Boolean).join(' ') || viewAs.user.email || 'Usuario'}
            roleName={viewAs.role?.name || 'Sin rol'}
            onExit={exitViewAs}
          />
        )}
        {/* ⭐ Esqueleto en vez del spinner de pantalla completa: dibuja la FORMA
            de lo que viene, reduce la espera percibida y evita el salto de
            layout. Con la precarga en reposo casi nunca llega a verse. */}
        <Suspense fallback={<ViewSkeleton />}>
        <RouteTransition routeKey={activeTab}>
        {waitingForProperties ? <ViewSkeleton /> : (<>
        {activeTab === 'houses' && (
          <HousesView
            properties={visibleProperties}
            onOpenMenu={toggleMenu}
            currentUser={effectiveUser}
            activeRole={activeRole}
            isSuperAdmin={isSuperAdmin}
            houseToOpenDetail={houseToOpenDetail}
            clearHouseToOpenDetail={() => setHouseToOpenDetail(null)}
            houseToOpenEdit={houseToOpenEdit}
            clearHouseToOpenEdit={() => setHouseToOpenEdit(null)}
          />
        )}

        {activeTab === 'pipeline' && (
          <HousesView
            viewMode="board"
            properties={visibleProperties}
            onOpenMenu={toggleMenu}
            currentUser={effectiveUser}
            activeRole={activeRole}
            isSuperAdmin={isSuperAdmin}
          />
        )}
        
        {activeTab === 'activity_log' && (
          <ActivityLogView
            onOpenMenu={toggleMenu}
            currentUser={effectiveUser}
            activeRole={activeRole}
            isSuperAdmin={isSuperAdmin}
          />
        )}

        {activeTab === 'trash' && effectiveUser && (
          <TrashView onOpenMenu={toggleMenu} currentUser={effectiveUser} />
        )}

        {activeTab === 'invoices' && (
          <InvoicesView
            properties={visibleProperties}
            onOpenMenu={toggleMenu}
            currentUser={effectiveUser}
            activeRole={activeRole}
            isSuperAdmin={isSuperAdmin}
            onOpenHouseDetail={openHouseDetail}
            onOpenHouseEdit={openHouseEdit}
          />
        )}

        {activeTab === 'clients_report' && (
          <ClientsReportView
            onOpenMenu={toggleMenu}
            properties={propertiesForModule('Clients Report')}
          />
        )}

        {/* VISTA DEL MURO SOCIAL */}

        {activeTab === 'calendar' && (
          <CalendarView
            properties={propertiesForModule('Calendar')}
            onOpenMenu={toggleMenu}
            onOpenHouseDetail={openHouseDetail}
          />
        )}

        {/* ⭐ TASK LIST — tareas, proyectos y top 3 de los gerentes (user_tasks, projects y user_priorities). */}
        {activeTab === 'task_list' && (
          <TaskListView
            onOpenMenu={toggleMenu}
            currentUser={effectiveUser}
            activeRole={activeRole}
            isSuperAdmin={isSuperAdmin}
          />
        )}

        {activeTab === 'payroll' && <PayrollView onOpenMenu={toggleMenu} properties={visibleProperties} currentUser={effectiveUser} activeRole={activeRole} isSuperAdmin={isSuperAdmin} onOpenHouseEdit={openHouseEdit} />}

        {activeTab === 'qc_report' && (
          // Hub con pestañas: Quality Check | Rutas | Reportes
          <QualityCheckHub
            onOpenMenu={toggleMenu}
            properties={visibleProperties}
            activeRole={activeRole}
            isSuperAdmin={isSuperAdmin}
            houseToInspect={houseToInspect}
            clearHouseToInspect={() => setHouseToInspect(null)}
            currentUser={effectiveUser}
            onOpenHouseDetail={openHouseDetail}
          />
        )}

        {/* ⭐ OWNER y MANAGER — páginas de inicio del dueño y del gerente. Quien
            puede ver las dos cambia entre ellas con el menú lateral.
            El detalle / edición de una casa se abre aquí mismo. */}
        {(activeTab === 'owner' || activeTab === 'manager') && (
          <>
            {activeTab === 'owner' ? (
              <OwnerView
                onOpenMenu={toggleMenu}
                properties={visibleProperties}
                currentUser={effectiveUser}
                activeRole={activeRole}
                isSuperAdmin={isSuperAdmin}
                onNavigate={setActiveTab}
                onOpenHouseDetail={openHouseDetail}
              />
            ) : (
              <ManagerView
                onOpenMenu={toggleMenu}
                properties={propertiesForModule('Manager')}
                currentUser={effectiveUser}
                activeRole={activeRole}
                isSuperAdmin={isSuperAdmin}
                onOpenInspection={handleCheckHouse}
                onOpenHouseDetail={openHouseDetail}
                onOpenHouseEdit={openHouseEdit}
              />
            )}
          </>
        )}

        {/* ⭐ QC DASHBOARD — vista nueva del lienzo. "Inspect" abre la inspección
            en Quality Check; el detalle de la casa se abre aquí mismo. */}
        {activeTab === 'qc_dashboard' && (
          <QualityDashboardView
            onOpenMenu={toggleMenu}
            properties={visibleProperties}
            activeRole={activeRole}
            isSuperAdmin={isSuperAdmin}
            onInspect={handleCheckHouse}
            onOpenHouseDetail={openHouseDetail}
          />
        )}

        {/* ⭐ Detalle y formulario de una casa ENCIMA de estas vistas: se abren
            aquí mismo, sin sacar al usuario de donde está. */}
        {houseModalsUsed && TABS_WITH_HOUSE_MODALS.has(activeTab) && (
          <Suspense fallback={null}>
            <HousesView
              renderMode="modals-only"
              properties={visibleProperties}
              onOpenMenu={toggleMenu}
              currentUser={effectiveUser}
              activeRole={activeRole}
              isSuperAdmin={isSuperAdmin}
              houseToOpenDetail={houseToOpenDetail}
              clearHouseToOpenDetail={() => setHouseToOpenDetail(null)}
              detailInitialTab={detailTab}
              houseToOpenEdit={houseToOpenEdit}
              clearHouseToOpenEdit={() => setHouseToOpenEdit(null)}
            />
          </Suspense>
        )}

        {activeTab === 'customers' && <CustomersView onOpenMenu={toggleMenu} />}
        
        {activeTab === 'settings' && (
          <SettingsView 
            currentSettingView={currentSettingView}
            setCurrentSettingView={setCurrentSettingView}
            onOpenMenu={toggleMenu}
          />
        )}

        {/* ⭐ EMPRESA — logo, nombre, correo y dirección (se usan en los documentos, el login y el menú) */}
        {activeTab === 'company' && <CompanySettingsView onOpenMenu={toggleMenu} />}

        {/* ⭐ FOTOS — compresión y opciones de captura de fotos */}
        {activeTab === 'photo_settings' && <PhotoSettingsView onOpenMenu={toggleMenu} />}

        {activeTab === 'roles' && <RolesView onOpenMenu={toggleMenu} roles={roles} />}
        
        {activeTab === 'users' && <UsersView onOpenMenu={toggleMenu} roles={roles} />}

        {/* ⭐ DATA IMPORT — SuperAdmin o rol con permiso "Data Import" (el Sidebar usa la misma regla). */}
        {activeTab === 'data_import' && canViewDataImport && <DataImportView onOpenMenu={toggleMenu} />}

        {/* ⭐ QC ROUTE — hoja de ruta de casas con Quality Check pendiente */}
        </>)}
        </RouteTransition>
        </Suspense>
      </main>

      {isViewAsModalOpen && (
        <ViewAsUserModal
          roles={roles}
          currentUserId={currentUser?.id}
          onSelect={(sel) => { setViewAs(sel); setIsViewAsModalOpen(false); }}
          onClose={() => setIsViewAsModalOpen(false)}
        />
      )}
    </div>
  );
}