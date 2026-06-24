import {
  Building2, Home, Settings as SettingsIcon, Users, CalendarDays,
  ShieldCheck, UserPlus, LogOut, DollarSign, ClipboardCheck, X, FileText, Megaphone, Database, LayoutGrid, Repeat, History
} from 'lucide-react';
import { auth } from '../config/firebase';
import { signOut } from 'firebase/auth';
import type { Role, Permission } from '../types/index';

type TabOptions = 'houses' | 'pipeline' | 'calendar' | 'invoices' | 'board' | 'done' | 'qc_report' | 'qc_route' | 'recalls' | 'status_history' | 'payroll' | 'customers' | 'settings' | 'roles' | 'users' | 'data_import';

interface SidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
  activeTab: TabOptions;
  setActiveTab: (tab: TabOptions) => void;
  onSettingsClick: () => void;
  activeRole: Role | null;
  isSuperAdmin: boolean;
}

export default function Sidebar({
  isSidebarOpen, setIsSidebarOpen, activeTab, setActiveTab, onSettingsClick, activeRole, isSuperAdmin
}: SidebarProps) {

  // ⭐ Helper centralizado para chequear permisos por módulo.
  //    SuperAdmin siempre ve todo. Si no hay role cargado todavía, NO mostrar
  //    nada (evita el "flash" de items visibles mientras carga).
  const canView = (moduleName: string): boolean => {
    if (isSuperAdmin) return true;
    if (!activeRole) return false;
    const permission = activeRole.permissions?.find((p: Permission) => p.module === moduleName);
    return permission ? !!permission.canView : false;
  };

  // ⭐ Helper para saber si mostrar el header "ADMIN" en el menú.
  //    Solo aparece si al menos UNO de los módulos admin está visible.
  //    Data Import también cuenta porque vive en la sección Admin.
  const canViewRoles = canView('Roles & Permissions');
  const canViewUsers = canView('System Users');
  const canViewSettings = canView('Settings');
  const showAdminSection = canViewRoles || canViewUsers || canViewSettings || isSuperAdmin;

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to log out?')) {
      await signOut(auth);
      window.location.reload();
    }
  };

  const handleNavClick = (tab: TabOptions) => {
    setActiveTab(tab);
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  return (
    <>
      <style>{`
        .sidebar-container { background-color: #0f172a; color: white; display: flex; flex-direction: column; height: 100vh; width: 260px; transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); overflow-x: hidden; flex-shrink: 0; border-right: 1px solid rgba(255,255,255,0.05); }
        .sidebar-container.closed { width: 80px; }
        .mobile-close-btn { display: none; }
        .sidebar-header { padding: 20px; display: flex; align-items: center; justify-content: space-between; min-height: 70px; }
        .logo-container { display: flex; align-items: center; gap: 12px; overflow: hidden; white-space: nowrap; }
        .nav-item { display: flex; align-items: center; gap: 16px; padding: 12px 20px; color: #94a3b8; cursor: pointer; transition: all 0.2s; border: none; background: transparent; width: 100%; text-align: left; font-size: 0.95rem; font-weight: 500; white-space: nowrap; -webkit-tap-highlight-color: transparent; }
        .nav-item:hover { color: white; background-color: rgba(255,255,255,0.05); }
        .nav-item.active { color: #3b82f6; background-color: rgba(59, 130, 246, 0.1); border-right: 3px solid #3b82f6; }
        .menu-label { color: #475569; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; padding: 0 20px; margin-bottom: 8px; }

        /* Fondo oscuro detrás del drawer (solo móvil) */
        .sidebar-backdrop { display: none; }

        @media (max-width: 768px) {
          /* ===== Drawer profesional: angosto, redondeado y con sombra ===== */
          .sidebar-container {
            position: fixed; top: 0; left: 0;
            width: min(84vw, 330px) !important;
            z-index: 10000;
            border-right: none;
            border-radius: 0 22px 22px 0;
            box-shadow: 14px 0 44px rgba(0, 0, 0, 0.45);
            padding-top: env(safe-area-inset-top, 0px);
          }
          .sidebar-container.closed { width: min(84vw, 330px) !important; transform: translateX(-100%); }
          .sidebar-container.open { transform: translateX(0); }

          /* ===== Fondo oscuro que cierra al tocar afuera ===== */
          .sidebar-backdrop {
            display: block; position: fixed; inset: 0;
            background: rgba(8, 15, 30, 0.55);
            -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
            z-index: 9999;
            opacity: 0; pointer-events: none;
            transition: opacity 0.3s ease;
          }
          .sidebar-backdrop.show { opacity: 1; pointer-events: auto; }

          /* ===== Header del menú ===== */
          .sidebar-header { padding: 22px 18px; min-height: 78px; }
          .mobile-close-btn {
            display: flex; align-items: center; justify-content: center;
            background: rgba(255,255,255,0.1); border: none; color: white; cursor: pointer;
            width: 46px; height: 46px; border-radius: 14px;
            -webkit-tap-highlight-color: transparent; transition: background 0.2s;
          }
          .mobile-close-btn:active { background: rgba(255,255,255,0.22); }

          .sidebar-nav { padding-top: 6px !important; }

          /* ===== Items de navegación: grandes y fáciles de tocar ===== */
          .nav-item {
            min-height: 56px; padding: 14px 16px; gap: 16px;
            font-size: 1.05rem; font-weight: 600;
            width: auto; margin: 4px 12px; border-radius: 14px;
          }
          .nav-item:active { transform: scale(0.97); background-color: rgba(255,255,255,0.08); }
          .nav-item.active {
            color: #ffffff; background-color: rgba(59, 130, 246, 0.22);
            border-right: none;
            box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.45);
          }
          .nav-item.active .nav-icon { color: #60a5fa; }
          .nav-item .nav-icon { flex-shrink: 0; }

          .menu-label { font-size: 0.8rem; padding: 0 24px; }

          /* ===== Footer / Log Out ===== */
          .sidebar-footer { padding: 16px 12px calc(16px + env(safe-area-inset-bottom, 0px)) !important; }
          .logout-btn {
            min-height: 54px; border-radius: 14px !important;
            font-size: 1.02rem !important; padding: 14px 16px !important;
            -webkit-tap-highlight-color: transparent;
          }
          .logout-btn:active { background-color: rgba(239, 68, 68, 0.18) !important; }
        }
      `}</style>

      {/* ⭐ Fondo oscuro (solo visible en móvil cuando el menú está abierto) */}
      <div
        className={`sidebar-backdrop ${isSidebarOpen ? 'show' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside className={`sidebar-container ${isSidebarOpen ? 'open' : 'closed'}`}>

        <div className="sidebar-header">
          <div className="logo-container">
            <div className="logo-icon"><Building2 size={24} color="#3b82f6" /></div>
            {isSidebarOpen && <span style={{ fontWeight: 700, fontSize: '1.2rem', color: 'white' }}>Precise Cleaning</span>}
          </div>
          <button className="mobile-close-btn" onClick={() => setIsSidebarOpen(false)} aria-label="Close menu">
            <X size={22} />
          </button>
        </div>

        <nav className="sidebar-nav" style={{ flex: 1, overflowY: 'auto', paddingTop: '10px' }}>

          {/* ⭐ HOUSES — check propio */}
          {canView('Houses') && (
            <button className={`nav-item ${activeTab === 'houses' ? 'active' : ''}`} onClick={() => handleNavClick('houses')}>
              <Home size={20} className="nav-icon" />
              {isSidebarOpen && <span className="nav-text">Houses</span>}
            </button>
          )}

          {canView('Houses') && (
            <button className={`nav-item ${activeTab === 'pipeline' ? 'active' : ''}`} onClick={() => handleNavClick('pipeline')}>
              <LayoutGrid size={20} className="nav-icon" />
              {isSidebarOpen && <span className="nav-text">Pipeline</span>}
            </button>
          )}

          {/* ⭐ INVOICES — check INDEPENDIENTE de Houses */}
          {canView('Invoices') && (
            <button className={`nav-item ${activeTab === 'invoices' ? 'active' : ''}`} onClick={() => handleNavClick('invoices')}>
              <FileText size={20} className="nav-icon" />
              {isSidebarOpen && <span className="nav-text">Invoices</span>}
            </button>
          )}

          {/* ⭐ NOTICE BOARD — check propio (antes no tenía) */}
          {canView('Notice Board') && (
            <button className={`nav-item ${activeTab === 'board' ? 'active' : ''}`} onClick={() => handleNavClick('board')}>
              <Megaphone size={20} className="nav-icon" />
              {isSidebarOpen && <span className="nav-text">Notice Board</span>}
            </button>
          )}

          {/* ⭐ CALENDAR */}
          {canView('Calendar') && (
            <button className={`nav-item ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => handleNavClick('calendar')}>
              <CalendarDays size={20} className="nav-icon" />
              {isSidebarOpen && <span className="nav-text">Calendar</span>}
            </button>
          )}

          {/* ⭐ QUALITY CHECK — usa módulo "Quality Check" (NO "Houses") */}
          {canView('Quality Check') && (
            <button className={`nav-item ${activeTab === 'qc_report' ? 'active' : ''}`} onClick={() => handleNavClick('qc_report')}>
              <ClipboardCheck size={20} className="nav-icon" />
              {isSidebarOpen && <span className="nav-text">Quality Check</span>}
            </button>
          )}

          {/* ⭐ RECALLS — aparece con su propio permiso "Recalls" o donde se vea Quality Check */}
          {(canView('Recalls') || canView('Quality Check')) && (
            <button className={`nav-item ${activeTab === 'recalls' ? 'active' : ''}`} onClick={() => handleNavClick('recalls')}>
              <Repeat size={20} className="nav-icon" />
              {isSidebarOpen && <span className="nav-text">Recalls</span>}
            </button>
          )}

          {/* ⭐ STATUS HISTORY — historial de status por casa */}
          {(canView('Status History') || canView('Houses')) && (
            <button className={`nav-item ${activeTab === 'status_history' ? 'active' : ''}`} onClick={() => handleNavClick('status_history')}>
              <History size={20} className="nav-icon" />
              {isSidebarOpen && <span className="nav-text">Status History</span>}
            </button>
          )}

          {/* ⭐ PAYROLL — usa módulo "Payroll" (NO "Settings") */}
          {canView('Payroll') && (
            <button className={`nav-item ${activeTab === 'payroll' ? 'active' : ''}`} onClick={() => handleNavClick('payroll')}>
              <DollarSign size={20} className="nav-icon" />
              {isSidebarOpen && <span className="nav-text">Payroll</span>}
            </button>
          )}

          {/* ⭐ CUSTOMERS */}
          {canView('Customers') && (
            <button className={`nav-item ${activeTab === 'customers' ? 'active' : ''}`} onClick={() => handleNavClick('customers')}>
              <Users size={20} className="nav-icon" />
              {isSidebarOpen && <span className="nav-text">Customers</span>}
            </button>
          )}

          {/* ⭐ ADMIN SECTION — Header solo aparece si al menos uno está visible */}
          {showAdminSection && isSidebarOpen && (
            <div className="menu-label" style={{ marginTop: '24px' }}>ADMIN</div>
          )}

          {canViewRoles && (
            <button className={`nav-item ${activeTab === 'roles' ? 'active' : ''}`} onClick={() => handleNavClick('roles')}>
              <ShieldCheck size={20} className="nav-icon" />
              {isSidebarOpen && <span className="nav-text">Roles & Permissions</span>}
            </button>
          )}

          {canViewUsers && (
            <button className={`nav-item ${activeTab === 'users' ? 'active' : ''}`} onClick={() => handleNavClick('users')}>
              <UserPlus size={20} className="nav-icon" />
              {isSidebarOpen && <span className="nav-text">System Users</span>}
            </button>
          )}

          {/* ⭐ DATA IMPORT — Solo SuperAdmin. Útil para migrar datos de Google Sheets a Firestore. */}
          {isSuperAdmin && (
            <button className={`nav-item ${activeTab === 'data_import' ? 'active' : ''}`} onClick={() => handleNavClick('data_import')}>
              <Database size={20} className="nav-icon" />
              {isSidebarOpen && <span className="nav-text">Data Import</span>}
            </button>
          )}

          {canViewSettings && (
            <button className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => { onSettingsClick(); if (window.innerWidth <= 768) setIsSidebarOpen(false); }}>
              <SettingsIcon size={20} className="nav-icon" />
              {isSidebarOpen && <span className="nav-text">Settings</span>}
            </button>
          )}
        </nav>

        <div className="sidebar-footer" style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button
            className="logout-btn"
            onClick={handleLogout}
            style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.95rem', backgroundColor: 'transparent', color: '#ef4444', width: '100%', fontWeight: 600, transition: 'background 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <LogOut size={20} /> {isSidebarOpen && "Log Out"}
          </button>
        </div>
      </aside>
    </>
  );
}