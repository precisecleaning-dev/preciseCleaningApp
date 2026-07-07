import {
  Building2, Home, Settings as SettingsIcon, Users, CalendarDays,
  ShieldCheck, UserPlus, LogOut, DollarSign, ClipboardCheck, X, FileText, Database, LayoutGrid, History
} from 'lucide-react';
import { auth } from '../config/firebase';
import { signOut } from 'firebase/auth';
import type { Role, Permission } from '../types/index';
import './Sidebar.css';

type TabOptions = 'houses' | 'pipeline' | 'calendar' | 'invoices' | 'board' | 'done' | 'qc_report' | 'qc_route' | 'recalls' | 'status_history' | 'payroll' | 'customers' | 'settings' | 'company' | 'roles' | 'users' | 'data_import';

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
  const canViewDataImport = canView('Data Import'); // ⭐ permiso propio (Roles > Data Import)
  const showAdminSection = canViewRoles || canViewUsers || canViewSettings || canViewDataImport || isSuperAdmin;

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
      {/* ⭐ Fondo oscuro (solo visible en móvil cuando el menú está abierto) */}
      <div
        className={`sidebar-backdrop ${isSidebarOpen ? 'show' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside className={`sidebar-container ${isSidebarOpen ? 'open' : 'closed'}`}>

        <div className="sidebar-header">
          <div className="sidebar-header-spacer" />
          <button className="mobile-close-btn" onClick={() => setIsSidebarOpen(false)} aria-label="Close menu">
            <X size={22} />
          </button>
        </div>

        <nav className="sidebar-nav">

          {/* ⭐ HOUSES — check propio */}
          {canView('Houses') && (
            <button className={`nav-item ${activeTab === 'houses' ? 'active' : ''}`} onClick={() => handleNavClick('houses')}>
              <Home size={20} className="nav-icon" />
              {isSidebarOpen && <span className="nav-text">Overview</span>}
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
            <div className="menu-label spaced">ADMIN</div>
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

          {/* ⭐ DATA IMPORT — SuperAdmin siempre; además cualquier rol con el permiso
              "Data Import" marcado en Roles & Permissions (casilla View). */}
          {(isSuperAdmin || canViewDataImport) && (
            <button className={`nav-item ${activeTab === 'data_import' ? 'active' : ''}`} onClick={() => handleNavClick('data_import')}>
              <Database size={20} className="nav-icon" />
              {isSidebarOpen && <span className="nav-text">Data Import</span>}
            </button>
          )}

          {/* ⭐ EMPRESA — logo, nombre, correo y dirección (se usan en documentos, login y menú) */}
          {canViewSettings && (
            <button className={`nav-item ${activeTab === 'company' ? 'active' : ''}`} onClick={() => handleNavClick('company')}>
              <Building2 size={20} className="nav-icon" />
              {isSidebarOpen && <span className="nav-text">Empresa</span>}
            </button>
          )}

          {canViewSettings && (
            <button className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => { onSettingsClick(); if (window.innerWidth <= 768) setIsSidebarOpen(false); }}>
              <SettingsIcon size={20} className="nav-icon" />
              {isSidebarOpen && <span className="nav-text">Settings</span>}
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <button
            className="logout-btn"
            onClick={handleLogout}
          >
            <LogOut size={20} /> {isSidebarOpen && "Log Out"}
          </button>
        </div>
      </aside>
    </>
  );
}