import {
  Building2, Home, Settings as SettingsIcon, Users, CalendarDays,
  ShieldCheck, UserPlus, LogOut, Bell, DollarSign, ClipboardCheck, X, FileText, Database, LayoutGrid, History, Camera, ArrowLeftRight, HelpCircle, ScrollText, Trash2, FileBarChart, Eye
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { auth } from '../config/firebase';
import { signOut } from 'firebase/auth';
import type { Role, Permission } from '../types/index';
import type { TabOptions } from '../App';
import { prefetchHandlers } from '../utils/viewPrefetch';
import './Sidebar.css';

interface NavItemConfig {
  tab: TabOptions;
  label: string;
  icon: LucideIcon;
  visible: boolean;
  /** Override opcional: si no se pasa, el click hace handleNavClick(tab). */
  onClick?: () => void;
}

import { useState } from 'react';
// ⭐ Panel de notificaciones: versión nueva + actividad reciente.
import NotificationsPanel from './NotificationsPanel';

interface SidebarProps {
  /** ⭐ Abre el selector "Ver como otro usuario". Si no se pasa, el boton no
   *  se renderiza (App decide si la funcion esta disponible). */
  onViewAsUser?: () => void;
  /** ⭐ Ya se esta viendo como otra persona: el boton pasa a "Salir". */
  isViewingAsUser?: boolean;
  /** ⭐ Hay una versión nueva desplegada: punto rojo en la campana y aviso
   *  dentro del panel de notificaciones. */
  updateAvailable?: boolean;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
  activeTab: TabOptions;
  setActiveTab: (tab: TabOptions) => void;
  onSettingsClick: () => void;
  activeRole: Role | null;
  isSuperAdmin: boolean;
}

export default function Sidebar({
  isSidebarOpen, setIsSidebarOpen, activeTab, setActiveTab, onSettingsClick, activeRole, isSuperAdmin,
  updateAvailable, onViewAsUser, isViewingAsUser = false,
}: SidebarProps) {
  // ⭐ Panel de notificaciones abierto/cerrado.
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  // ⭐ Helper centralizado para chequear permisos por módulo.
  //    SuperAdmin siempre ve todo. Si no hay role cargado todavía, NO mostrar
  //    nada (evita el "flash" de items visibles mientras carga).
  const canView = (moduleName: string): boolean => {
    if (isSuperAdmin) return true;
    if (!activeRole) return false;
    const permission = activeRole.permissions?.find((p: Permission) => p.module === moduleName);
    return permission ? !!permission.canView : false;
  };

  // ⭐ Permiso NUEVO con respaldo al anterior.
  //
  //    Varios items (Pipeline, No Status, Recalls, QC Reports, Empresa, Fotos,
  //    Activity Log) no tenian modulo propio en Roles y se colgaban del permiso
  //    de otro. Ahora cada uno tiene el suyo, pero los roles YA GUARDADOS no lo
  //    tienen marcado: si se exigiera el permiso nuevo sin mas, al desplegar
  //    esos items desaparecerian del menu de todos y pareceria que se rompio
  //    la app.
  //
  //    Por eso: si el rol NO declara el modulo nuevo (nunca fue configurado),
  //    manda la regla vieja. En cuanto alguien abra ese rol en Roles &
  //    Permissions y lo guarde, el modulo queda declarado y pasa a mandar el
  //    permiso propio.
  const canViewOrLegacy = (moduleName: string, legacy: boolean): boolean => {
    if (isSuperAdmin) return true;
    if (!activeRole) return false;
    const declared = activeRole.permissions?.find((p: Permission) => p.module === moduleName);
    return declared ? !!declared.canView : legacy;
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
    // ⭐ En movil el menu se cierra PRIMERO y el cambio de vista se aplica en el
    //    siguiente fotograma. Hacer las dos cosas en el mismo tick obligaba al
    //    navegador a animar el cierre del drawer MIENTRAS monta la vista nueva:
    //    la animacion perdia fotogramas y se veia un tiron. Separandolas, el
    //    cierre corre limpio y el montaje ocurre detras del menu que se va.
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
      requestAnimationFrame(() => setActiveTab(tab));
      return;
    }
    setActiveTab(tab);
  };

  const mainNavItems: NavItemConfig[] = [
    // ⭐ HOUSES — check propio
    { tab: 'houses', label: 'Overview', icon: Home, visible: canView('Houses') },
    { tab: 'pipeline', label: 'Pipeline', icon: LayoutGrid, visible: canViewOrLegacy('Pipeline', canView('Houses')) },
    // ⭐ NO STATUS — casas sin estado asignado. Usa el permiso de Houses para
    //    que funcione sin tocar el catalogo de Roles; si mas adelante quieres un
    //    permiso propio, agrega el modulo "No Status" y cambia el canView de aqui.
    { tab: 'no_status', label: 'No Status', icon: HelpCircle, visible: canViewOrLegacy('No Status', canView('Houses')) },
    // ⭐ INVOICES — check INDEPENDIENTE de Houses
    { tab: 'invoices', label: 'Invoices', icon: FileText, visible: canView('Invoices') },
    // ⭐ CALENDAR
    { tab: 'calendar', label: 'Calendar', icon: CalendarDays, visible: canView('Calendar') },
    // ⭐ QUALITY CHECK — usa módulo "Quality Check" (NO "Houses")
    { tab: 'qc_report', label: 'Quality Check', icon: ClipboardCheck, visible: canView('Quality Check') },
    // ⭐ QUALITY CHECK REPORTS — inspecciones ya finalizadas, en formato tabla.
    //    Comparte el permiso "Quality Check": quien puede inspeccionar tambien
    //    puede revisar lo inspeccionado.
    { tab: 'qc_reports_table', label: 'Quality Check Reports', icon: FileBarChart, visible: canViewOrLegacy('Quality Check Reports', canView('Quality Check')) },
    // ⭐ STATUS HISTORY — historial de status por casa
    // ⭐ STATUS HISTORY — SOLO su propio permiso (el fallback a Houses se eliminó:
    //    existía de antes de que el módulo estuviera en Roles y hacía que roles sin
    //    el permiso lo vieran igual).
    { tab: 'status_history', label: 'Status History', icon: History, visible: canView('Status History') },
    // ⭐ PAYROLL — usa módulo "Payroll" (NO "Settings")
    { tab: 'payroll', label: 'Payroll', icon: DollarSign, visible: canView('Payroll') },
    // ⭐ CUSTOMERS
    { tab: 'customers', label: 'Customers', icon: Users, visible: canView('Customers') },
  ];

  const adminNavItems: NavItemConfig[] = [
    { tab: 'roles', label: 'Roles & Permissions', icon: ShieldCheck, visible: canViewRoles },
    { tab: 'users', label: 'System Users', icon: UserPlus, visible: canViewUsers },
    // ⭐ DATA IMPORT — SuperAdmin siempre; además cualquier rol con el permiso
    //    "Data Import" marcado en Roles & Permissions (casilla View).
    { tab: 'data_import', label: 'Data Import', icon: Database, visible: isSuperAdmin || canViewDataImport },
    // ⭐ ACTIVITY LOG — bitacora de la app (muestra actividad de TODOS los
    //    usuarios, por eso vive en la seccion Admin).
    //    Visible para: SuperAdmin, quien tenga el permiso propio "Activity Log"
    //    (crealo en Roles & Permissions cuando quieras control fino), o quien
    //    ya administre la configuracion — el mismo permiso que Empresa y Fotos.
    {
      tab: 'activity_log', label: 'Activity Log', icon: ScrollText,
      visible: canViewOrLegacy('Activity Log', canViewSettings),
    },
    // ⭐ RECYCLE BIN — todo lo borrado llega aquí con quién/cuándo/motivo;
    //    se restaura íntegro o se elimina definitivamente. Mismo permiso que
    //    Activity Log (crear el permiso "Recycle Bin" en Roles para control fino).
    {
      tab: 'trash', label: 'Recycle Bin', icon: Trash2,
      visible: canViewOrLegacy('Recycle Bin', canViewSettings),
    },
    // ⭐ EMPRESA — logo, nombre, correo y dirección (se usan en documentos, login y menú)
    { tab: 'company', label: 'Empresa', icon: Building2, visible: canViewOrLegacy('Company Settings', canViewSettings) },
    // ⭐ FOTOS — compresión/opciones de captura de fotos (mismo permiso que Empresa/Settings)
    { tab: 'photo_settings', label: 'Fotos', icon: Camera, visible: canViewOrLegacy('Photo Settings', canViewSettings) },
    {
      tab: 'settings', label: 'Settings', icon: SettingsIcon, visible: canViewSettings,
      onClick: () => { onSettingsClick(); if (window.innerWidth <= 768) setIsSidebarOpen(false); },
    },
    // ⭐ TEMPORAL — Migración única payroll_records → payroll. Visible para
    //    cualquier rol con permiso de Settings (misma regla que Empresa/Fotos).
    //    QUITAR este item (y el icono ArrowLeftRight del import) cuando la
    //    migración esté hecha y verificada. Ver MigrarPayroll.tsx.
    { tab: 'migrar_payroll', label: 'Migrar Payroll', icon: ArrowLeftRight, visible: canViewSettings },
  ];

  const renderNavItem = (item: NavItemConfig) => (
    <li key={item.tab}>
      {/* ⭐ prefetchHandlers descarga el modulo al pasar el mouse (escritorio) o
          al APOYAR el dedo (movil), antes del click. Entre pointerdown y click
          hay ~90ms: suficiente para adelantar la descarga y que el cambio de
          vista se sienta instantaneo. Ver src/utils/viewPrefetch.ts. */}
      <button
        className={`nav-item ${activeTab === item.tab ? 'active' : ''}`}
        onClick={item.onClick ?? (() => handleNavClick(item.tab))}
        aria-current={activeTab === item.tab ? 'page' : undefined}
        {...prefetchHandlers(item.tab)}
      >
        <item.icon size={18} className="nav-icon" />
        {isSidebarOpen && <span className="nav-text">{item.label}</span>}
      </button>
    </li>
  );

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
            <X size={32} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <ul className="nav-list">
            {mainNavItems.filter(item => item.visible).map(renderNavItem)}

            {/* ⭐ ADMIN SECTION — Header solo aparece si al menos uno está visible */}
            {showAdminSection && isSidebarOpen && (
              <li className="menu-label spaced">ADMIN</li>
            )}

            {adminNavItems.filter(item => item.visible).map(renderNavItem)}
          </ul>
        </nav>

        <div className="sidebar-footer">
          {/* ⭐ NOTIFICACIONES: versión nueva (punto rojo) + actividad reciente */}
          <button
            type="button"
            className="sb-notif-btn"
            onClick={() => setIsNotifOpen(true)}
          >
            <span className="sb-notif-icon-wrap">
              <Bell size={18} />
              {updateAvailable && <span className="sb-notif-dot" />}
            </span>
            {isSidebarOpen && "Notificaciones"}
          </button>
          {/* ⭐ VER COMO OTRO USUARIO — se muestra solo si App habilito la funcion
              (permiso "View As User" en Roles & Permissions). Vive en el pie, junto
              a Log Out, porque es una accion sobre la SESION, no una vista mas. */}
          {onViewAsUser && (
            <button
              type="button"
              className={`vau-sidebar-btn${isViewingAsUser ? ' active' : ''}`}
              onClick={() => {
                onViewAsUser();
                if (window.innerWidth <= 768) setIsSidebarOpen(false);
              }}
            >
              <Eye size={18} />
              {isSidebarOpen && (isViewingAsUser ? 'Salir de la vista' : 'Ver como otro usuario')}
            </button>
          )}
          <button
            className="logout-btn"
            onClick={handleLogout}
          >
            <LogOut size={18} /> {isSidebarOpen && "Log Out"}
          </button>
          {/* ⭐ Versión del app (sello del build) + crédito */}
          {isSidebarOpen && (
            <div className="sb-version-box">
              <span className="sb-version">
                v{__BUILD_TIME__.slice(0, 16).replace("T", " ")}
              </span>
              <span className="sb-credit">Created by Jesus Molero</span>
            </div>
          )}
        </div>
      </aside>

      <NotificationsPanel
        open={isNotifOpen}
        onClose={() => setIsNotifOpen(false)}
        updateAvailable={!!updateAvailable}
      />
    </>
  );
}