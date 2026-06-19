import { useState, useMemo, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import HousesView from './views/HousesView';
import CustomersView from './views/CustomersView';
import SettingsView from './views/SettingsView';
import CalendarView from './views/CalendarView';
import QualityCheckView from './views/QualityCheckView'; 
import PayrollView from './views/PayrollView'; 
import InvoicesView from './views/InvoicesView';
import NoticeBoardView from './views/NoticeBoardView';
import LoginView from './views/auth/LoginView';
import RolesView from './views/admin/RolesView';
import UsersView from './views/admin/UsersView';
import DataImportView from './views/DataImportView'; // ⭐ Vista de importación de CSV (solo SuperAdmin)
import RecallsView from './views/RecallsView'; // ⭐ Vista de Recalls (ranking de equipos)
import StatusHistoryView from './views/StatusHistoryView'; // ⭐ Vista de historial de status por casa

import type { Property, Role, SystemUser } from './types/index';
import './App.css';

import { auth, db } from './config/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

// ⭐ Tiempo de inactividad antes de cerrar sesión automáticamente (15 minutos)
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

export type TabOptions = 'houses' | 'pipeline' | 'calendar' | 'invoices' | 'board' | 'done' | 'qc_report' | 'qc_route' | 'recalls' | 'status_history' | 'payroll' | 'customers' | 'settings' | 'roles' | 'users' | 'data_import';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthChecked, setIsAuthChecked] = useState<boolean>(false); // ⭐ Para evitar flash de LoginView al recargar
  const [isBypass, setIsBypass] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<SystemUser | null>(null);
  
  const [activeTab, setActiveTab] = useState<TabOptions>('houses');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') return window.innerWidth > 768;
    return true;
  });
  
  const [properties, setProperties] = useState<Property[]>([]);
  const [currentSettingView, setCurrentSettingView] = useState<string>('menu');
  const [houseToInspect, setHouseToInspect] = useState<Property | null>(null);

  const [roles, setRoles] = useState<Role[]>([]);

  // ⭐ Cargar roles con onSnapshot — aprovecha el cache de Firestore Persistence
  // (IndexedDB). Primera carga normal, siguientes son INSTANTÁNEAS desde el cache.
  // Además, si un admin modifica un rol, se actualiza en tiempo real sin recargar.
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'settings_roles'),
      (snapshot) => {
        const loadedRoles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Role));
        setRoles(loadedRoles);
      },
      (error) => {
        console.error("Error loading roles globally:", error);
      }
    );
    return () => unsub();
  }, []);

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
        // ⭐ Usar onSnapshot en lugar de getDocs aprovecha el cache local.
        //    En cargas posteriores el perfil viene INSTANTÁNEO del IndexedDB.
        try {
          const q = query(collection(db, 'system_users'), where('email', '==', user.email.toLowerCase().trim()));
          userProfileUnsub = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
              const userData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as SystemUser;
              setCurrentUser(userData);
            } else {
              setCurrentUser(null);
            }
            setIsAuthChecked(true);
          }, (error) => {
            console.error("Error fetching user profile:", error);
            setIsAuthChecked(true);
          });
        } catch (error) {
          console.error("Error setting up user profile listener:", error);
          setIsAuthChecked(true);
        }
      } else {
        setIsAuthenticated(false);
        setIsBypass(false);
        setCurrentUser(null);
        // ⭐ Marcar que ya verificamos la sesión (ya sea que haya o no usuario)
        // Esto evita el "flash" del LoginView al recargar cuando hay sesión guardada.
        setIsAuthChecked(true);
      }
    });
    return () => {
      unsubscribe();
      if (userProfileUnsub) userProfileUnsub();
    };
  }, []);

  // ⭐ AUTO-LOGOUT POR INACTIVIDAD (15 minutos)
  // Escucha eventos del usuario y resetea un timer. Si pasa 15 min sin actividad,
  // cierra sesión automáticamente. Solo activo cuando el usuario está autenticado.
  useEffect(() => {
    if (!isAuthenticated) return;

    let timer: ReturnType<typeof setTimeout>;

    const handleAutoLogout = async () => {
      console.log('🕒 Sesión cerrada por inactividad (15 min)');
      try {
        if (auth.currentUser) {
          await signOut(auth);
        }
      } catch (err) {
        console.error('Error cerrando sesión por inactividad:', err);
      }
      // Limpiar estado local
      setIsAuthenticated(false);
      setIsBypass(false);
      setCurrentUser(null);
      // Avisar al usuario
      alert('Tu sesión se cerró por inactividad (15 minutos). Por favor inicia sesión nuevamente.');
    };

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(handleAutoLogout, INACTIVITY_TIMEOUT_MS);
    };

    // Eventos que cuentan como "actividad del usuario"
    const events = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart', 'click'];

    events.forEach(event => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    // Iniciar el timer al montar
    resetTimer();

    // Cleanup: remover listeners y limpiar timer al desmontar/cambiar auth
    return () => {
      clearTimeout(timer);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [isAuthenticated]);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    if (!auth.currentUser) {
      setIsBypass(true);
    }
  };

  const activeRole = useMemo(() => {
    if (!currentUser || roles.length === 0) return null;
    return roles.find(r => r.id === currentUser.roleId) || null;
  }, [currentUser, roles]);

  const isSuperAdmin = isBypass || activeRole?.name === 'Administrator';
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

  // ⭐ Mientras Firebase verifica si hay sesión guardada en localStorage,
  // mostramos una pantalla de carga. Esto evita el "flash" del LoginView
  // al recargar la página cuando hay una sesión activa.
  if (!isAuthChecked) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
        gap: '16px'
      }}>
        <style>{`
          @keyframes spin-load { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
        <div style={{
          width: '48px',
          height: '48px',
          border: '4px solid #e2e8f0',
          borderTopColor: '#3b82f6',
          borderRadius: '50%',
          animation: 'spin-load 0.8s linear infinite'
        }} />
        <div style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>
          Verificando sesión...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
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
            onCheckHouse={handleCheckHouse} 
            currentUser={currentUser}
            activeRole={activeRole}
            isSuperAdmin={isSuperAdmin}
          />
        )}

        {activeTab === 'pipeline' && (
          <HousesView 
            viewMode="board"
            properties={visibleProperties as any} 
            setProperties={setProperties as any} 
            onOpenMenu={toggleMenu} 
            onCheckHouse={handleCheckHouse} 
            currentUser={currentUser}
            activeRole={activeRole}
            isSuperAdmin={isSuperAdmin}
          />
        )}
        
        {activeTab === 'invoices' && (
          <InvoicesView 
            properties={visibleProperties as any} 
            setProperties={setProperties as any} 
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

        {activeTab === 'calendar' && <CalendarView properties={visibleProperties as any} onOpenMenu={toggleMenu} />}
        
        {activeTab === 'payroll' && <PayrollView onOpenMenu={toggleMenu} />}

        {activeTab === 'qc_report' && (
          <QualityCheckView 
            onOpenMenu={toggleMenu} 
            properties={visibleProperties as any}
            houseToInspect={houseToInspect as any}
            clearHouseToInspect={() => setHouseToInspect(null)}
            currentUser={currentUser}
          />
        )}

        {/* ⭐ RECALLS — vista dedicada con ranking de equipos */}
        {activeTab === 'recalls' && (
          <RecallsView 
            onOpenMenu={toggleMenu} 
            properties={visibleProperties as any}
            currentUser={currentUser}
          />
        )}

        {/* ⭐ STATUS HISTORY — historial de status por casa */}
        {activeTab === 'status_history' && (
          <StatusHistoryView 
            onOpenMenu={toggleMenu} 
            properties={visibleProperties as any}
            currentUser={currentUser}
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

        {activeTab === 'roles' && <RolesView onOpenMenu={toggleMenu} roles={roles} setRoles={setRoles} />}
        
        {activeTab === 'users' && <UsersView onOpenMenu={toggleMenu} roles={roles} />}

        {/* ⭐ DATA IMPORT — Solo accesible si es SuperAdmin (el Sidebar ya lo oculta para otros).
            Doble verificación aquí por seguridad: aunque alguien hackee el state, no podrá
            ver la vista si no es SuperAdmin. */}
        {activeTab === 'data_import' && isSuperAdmin && <DataImportView onOpenMenu={toggleMenu} />}

        {(activeTab === 'done' || activeTab === 'qc_route') && (
          <div className="fade-in" style={{ padding: '40px', textAlign: 'center', color: '#6b7280', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <h2 style={{ color: '#111827', fontSize: '1.5rem', margin: '0 0 8px 0' }}>Under Construction</h2>
            <p style={{ margin: 0 }}>The {activeTab.replace('_', ' ')} view is currently being developed.</p>
          </div>
        )}
      </main>
    </div>
  );
}