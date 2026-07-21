import { useState, useMemo, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import HousesView from './views/HousesView';
import CustomersView from './views/CustomersView';
import SettingsView from './views/SettingsView';
import CalendarView from './views/CalendarView';
import QualityCheckHub from './views/QualityCheckHub';
import PayrollView from './views/PayrollView'; 
import InvoicesView from './views/InvoicesView';
import NoticeBoardView from './views/NoticeBoardView';
import LoginView from './views/auth/LoginView';
import RolesView from './views/admin/RolesView';
import UsersView from './views/admin/UsersView';
import DataImportView from './views/DataImportView'; // ⭐ Vista de importación de CSV (solo SuperAdmin)
import RecallsView from './views/RecallsView'; // ⭐ Vista de Recalls (ranking de equipos)
import StatusHistoryView from './views/StatusHistoryView'; // ⭐ Vista de historial de status por casa
import CompanySettingsView from './views/CompanySettingsView'; // ⭐ Módulo de empresa (logo, nombre, correo, dirección)
import PhotoSettingsView from './views/PhotoSettingsView'; // ⭐ Configuración de compresión/captura de fotos
import QCRouteView from './views/QCRouteView'; // ⭐ Hoja de ruta para casas con QC pendiente
import { MigrarPayroll } from './views/MigrarPayroll'; // ⭐ TEMPORAL — migración única payroll_records → payroll (quitar al terminar)

import type { Property, Role, SystemUser } from './types/index';
import './App.css';

import { auth, db } from './config/firebase';
import { onAuthStateChanged, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export type TabOptions = 'houses' | 'pipeline' | 'calendar' | 'invoices' | 'board' | 'done' | 'qc_report' | 'qc_route' | 'recalls' | 'status_history' | 'payroll' | 'customers' | 'settings' | 'company' | 'photo_settings' | 'roles' | 'users' | 'data_import' | 'migrar_payroll';

// ⭐ Persistencia de la pestaña activa: al recargar, la app vuelve a la misma
//    vista en la que estabas (p. ej. Quality Check) en vez de regresar a Houses.
const ACTIVE_TAB_KEY = 'pc_active_tab';
const VALID_TABS: TabOptions[] = ['houses', 'pipeline', 'calendar', 'invoices', 'board', 'done', 'qc_report', 'qc_route', 'recalls', 'status_history', 'payroll', 'customers', 'settings', 'company', 'roles', 'users', 'data_import', 'migrar_payroll'];
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
  const [isBypass, setIsBypass] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<SystemUser | null>(null);
  
  const [activeTab, setActiveTab] = useState<TabOptions>(getInitialTab); // ⭐ Restaura la última pestaña usada
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

  const [roles, setRoles] = useState<Role[]>([]);

  // ⭐ Flags de "primer dato recibido". Sirven para NO montar las vistas hasta que
  //    properties, roles y el perfil tengan al menos su primer snapshot. Con la
  //    caché local (IndexedDB) estos llegan en milisegundos al recargar, así que
  //    no hay demora perceptible; pero se evita el bug de mostrar 0 / "no existe"
  //    mientras la data aún no llega.
  const [rolesLoaded, setRolesLoaded] = useState<boolean>(false);
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

  // ⭐ Cargar roles con onSnapshot — aprovecha el cache de Firestore Persistence.
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'settings_roles'),
      (snapshot) => {
        const loadedRoles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Role));
        setRoles(loadedRoles);
        setRolesLoaded(true);
      },
      (error) => {
        console.error("Error loading roles globally:", error);
        setRolesLoaded(true); // no bloquear la app si falla
      }
    );
    return () => unsub();
  }, []);

  // ⭐⭐ LISTENER GLOBAL DE PROPERTIES (el fix principal).
  //    Antes, la colección 'properties' SOLO se cargaba dentro de HousesView.
  //    Si recargabas en otra pestaña (Quality Check, Status History, Recalls,
  //    QC Route, Calendar, Invoices), HousesView no se montaba y 'properties'
  //    quedaba vacío → todo aparecía en 0 / "no existe". Ahora se carga aquí,
  //    a nivel App, así SIEMPRE está disponible sin importar en qué vista estés.
  //    Se inicia solo cuando hay sesión (para que Firestore tenga el token de auth).
  useEffect(() => {
    if (!isAuthenticated) {
      setPropertiesLoaded(false);
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'properties'),
      (snapshot) => {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Property[];
        setProperties(data);
        setPropertiesLoaded(true);
      },
      (error) => {
        console.error("Error loading properties globally:", error);
        setPropertiesLoaded(true); // no bloquear la app si falla
      }
    );
    return () => unsub();
  }, [isAuthenticated]);

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
        setIsBypass(false);

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
        setIsBypass(false);
        setCurrentUser(null);
        setProfileLoaded(false);
        setPropertiesLoaded(false);
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

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    if (!auth.currentUser) {
      // Modo bypass (sin sesión de Firebase): no habrá perfil ni roles desde
      // Firestore, así que marcamos esos flags como listos para no bloquear.
      setIsBypass(true);
      setProfileLoaded(true);
      setRolesLoaded(true);
    }
  };

  const activeRole = useMemo(() => {
    if (!currentUser || roles.length === 0) return null;
    return roles.find(r => r.id === currentUser.roleId) || null;
  }, [currentUser, roles]);

  const isSuperAdmin = isBypass || activeRole?.name === 'Administrator';

  // ⭐ CUMPLIMIENTO ESTRICTO DE PERMISOS POR MÓDULO: el Sidebar oculta los items,
  //    pero el tab activo puede llegar por localStorage (última pestaña usada) o
  //    navegación directa. Esta guardia verifica el permiso canView del módulo
  //    correspondiente y, si el rol no lo tiene, redirige al primer módulo permitido.
  useEffect(() => {
    if (isSuperAdmin || !activeRole) return;
    const TAB_MODULE: Partial<Record<TabOptions, string[]>> = {
      houses: ['Houses'], pipeline: ['Houses'], invoices: ['Invoices'], calendar: ['Calendar'],
      qc_report: ['Quality Check'], status_history: ['Status History'], payroll: ['Payroll'],
      customers: ['Customers'], roles: ['Roles & Permissions'], users: ['System Users'],
      data_import: ['Data Import'], company: ['Settings'], photo_settings: ['Settings'],
      settings: ['Settings'], migrar_payroll: ['Settings'],
    };
    const canViewModule = (m: string) =>
      !!activeRole.permissions?.find(p => p.module === m && p.canView);
    const mods = TAB_MODULE[activeTab];
    if (!mods || mods.some(canViewModule)) return; // sin mapeo o permitido: no tocar
    const order: TabOptions[] = ['houses', 'pipeline', 'invoices', 'calendar', 'qc_report',
      'status_history', 'payroll', 'customers', 'roles', 'users', 'data_import', 'company',
      'photo_settings', 'settings'];
    const fallback = order.find(t => (TAB_MODULE[t] || []).some(canViewModule));
    if (fallback) setActiveTab(fallback);
  }, [activeTab, activeRole, isSuperAdmin]);
  // ⭐ Data Import: SuperAdmin siempre; o cualquier rol con el permiso "Data Import" (casilla View en Roles).
  const canViewDataImport = isSuperAdmin || !!activeRole?.permissions?.find((p: any) => p.module === 'Data Import')?.canView;
  // ⭐ TEMPORAL — permiso para la vista Migrar Payroll: misma regla que Settings en el Sidebar.
  const canViewMigrarPayroll = isSuperAdmin || !!activeRole?.permissions?.find((p: any) => p.module === 'Settings')?.canView;
  // ⭐ SCOPE POR MÓDULO (Roles & Permissions → columna Scope): 'Own' significa que
  //    el rol solo ve SUS registros. Un registro es "propio" si el usuario está en
  //    assignedWorkers (ids de system_users) o comparte teamId — exactamente la
  //    misma regla que HousesView aplica internamente (propertiesWithScope).
  const isOwnProperty = (prop: Property): boolean => {
    if (!currentUser) return false;
    if (prop.assignedWorkers?.includes(currentUser.id)) return true;
    return !!(currentUser.teamId && prop.teamId === currentUser.teamId);
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

  // ⭐ ¿Está toda la data base lista para pintar las vistas?
  //    - En modo normal: properties + roles + perfil con su primer snapshot.
  //    - En modo bypass: solo properties (no hay perfil/roles de Firestore).
  //    Con la caché local esto se cumple en milisegundos al recargar.
  const appDataReady = isBypass
    ? propertiesLoaded
    : (propertiesLoaded && rolesLoaded && profileLoaded);

  // ⭐ Mientras Firebase verifica si hay sesión guardada, pantalla de carga.
  if (!isAuthChecked) {
    return <LoadingScreen text="Verificando sesión..." />;
  }

  if (!isAuthenticated) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  // ⭐ Sesión confirmada pero la data aún no llega en su primer snapshot:
  //    mostramos "Cargando datos..." en vez de dejar que las vistas pinten 0.
  if (!appDataReady) {
    return <LoadingScreen text="Cargando datos..." />;
  }

  return (
    <div className="app-container">
      <Sidebar 
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab} 
        onSettingsClick={handleSettingsClick}
        activeRole={activeRole} 
        isSuperAdmin={isSuperAdmin}
      />

      <main className="main-content">
        {activeTab === 'houses' && (
          <HousesView
            properties={visibleProperties as any}
            setProperties={setProperties as any}
            onOpenMenu={toggleMenu}
            currentUser={currentUser}
            activeRole={activeRole}
            isSuperAdmin={isSuperAdmin}
            houseToOpenDetail={houseToOpenDetail as any}
            clearHouseToOpenDetail={() => setHouseToOpenDetail(null)}
            houseToOpenEdit={houseToOpenEdit as any}
            clearHouseToOpenEdit={() => setHouseToOpenEdit(null)}
          />
        )}

        {activeTab === 'pipeline' && (
          <HousesView
            viewMode="board"
            properties={visibleProperties as any}
            setProperties={setProperties as any}
            onOpenMenu={toggleMenu}
            currentUser={currentUser}
            activeRole={activeRole}
            isSuperAdmin={isSuperAdmin}
          />
        )}
        
        {activeTab === 'invoices' && (
          <InvoicesView 
            properties={visibleProperties} 
            setProperties={setProperties} 
            onOpenMenu={toggleMenu} 
            currentUser={currentUser}
            activeRole={activeRole}
            isSuperAdmin={isSuperAdmin}
          />
        )}

        {/* VISTA DEL MURO SOCIAL */}
        {activeTab === 'board' && (
          <NoticeBoardView 
            onOpenMenu={toggleMenu} 
            currentUser={currentUser} 
            isSuperAdmin={isSuperAdmin}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarView
            properties={propertiesForModule('Calendar')}
            setProperties={setProperties}
            onOpenMenu={toggleMenu}
            onCheckHouse={handleCheckHouse}
          />
        )}
        
        {/* ⭐ Payroll recibe contexto de usuario para poder abrir el formulario de
            edición de casa (HousesView modals-only) con los permisos correctos */}
        {activeTab === 'payroll' && <PayrollView onOpenMenu={toggleMenu} currentUser={currentUser} activeRole={activeRole} isSuperAdmin={isSuperAdmin} />}

        {activeTab === 'qc_report' && (
          <>
            {/* ⭐ Hub con pestañas: Quality Check | Rutas | Reportes */}
            <QualityCheckHub 
              onOpenMenu={toggleMenu} 
              properties={visibleProperties as any}
              houseToInspect={houseToInspect as any}
              clearHouseToInspect={() => setHouseToInspect(null)}
              currentUser={currentUser}
              onOpenHouseDetail={(house) => setHouseToOpenDetail(house as any)}
              onOpenHouseEdit={(house) => setHouseToOpenEdit(house as any)}
            />
            {/* ⭐ Modales de HousesView montados ENCIMA de QC: el detalle y el
                formulario se abren aquí mismo, sin sacar al usuario de la vista. */}
            <HousesView
              renderMode="modals-only"
              properties={visibleProperties as any}
              setProperties={setProperties as any}
              onOpenMenu={toggleMenu}
              currentUser={currentUser}
              activeRole={activeRole}
              isSuperAdmin={isSuperAdmin}
              houseToOpenDetail={houseToOpenDetail as any}
              clearHouseToOpenDetail={() => setHouseToOpenDetail(null)}
              houseToOpenEdit={houseToOpenEdit as any}
              clearHouseToOpenEdit={() => setHouseToOpenEdit(null)}
            />
          </>
        )}

        {/* ⭐ RECALLS — vista dedicada con ranking de equipos */}
        {activeTab === 'recalls' && (
          <RecallsView 
            onOpenMenu={toggleMenu} 
            properties={visibleProperties}
            currentUser={currentUser}
          />
        )}

        {/* ⭐ STATUS HISTORY — historial de status por casa */}
        {activeTab === 'status_history' && (
          <StatusHistoryView
            onOpenMenu={toggleMenu}
            properties={visibleProperties}
          />
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

        {activeTab === 'roles' && <RolesView onOpenMenu={toggleMenu} roles={roles} setRoles={setRoles} />}
        
        {activeTab === 'users' && <UsersView onOpenMenu={toggleMenu} roles={roles} />}

        {/* ⭐ DATA IMPORT — SuperAdmin o rol con permiso "Data Import" (el Sidebar usa la misma regla). */}
        {activeTab === 'data_import' && canViewDataImport && <DataImportView onOpenMenu={toggleMenu} />}

        {/* ⭐ TEMPORAL — Migración única payroll_records → payroll. Visible con
            permiso de Settings (misma regla que el item del Sidebar).
            QUITAR este bloque, el import de arriba y el item del Sidebar al terminar. */}
        {activeTab === 'migrar_payroll' && canViewMigrarPayroll && <MigrarPayroll />}

        {/* ⭐ QC ROUTE — hoja de ruta de casas con Quality Check pendiente */}
        {activeTab === 'qc_route' && (
          <QCRouteView
            onOpenMenu={toggleMenu}
            properties={visibleProperties}
            currentUser={currentUser}
          />
        )}

        {activeTab === 'done' && (
          <div className="fade-in app-under-construction">
            <h2 className="app-under-construction-title">Under Construction</h2>
            <p className="app-under-construction-text">The {activeTab.replace('_', ' ')} view is currently being developed.</p>
          </div>
        )}
      </main>
    </div>
  );
}