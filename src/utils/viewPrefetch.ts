// src/utils/viewPrefetch.ts
//
// ============================================================================
// ⭐ PRECARGA DE MÓDULOS — la diferencia real entre "web" y "app instalada".
//
// Cada vista se carga con React.lazy(), así que la PRIMERA vez que se toca un
// item del menú el navegador tiene que descargar ese chunk. Mientras dura la
// descarga, Suspense reemplaza toda el área de contenido por un spinner. En una
// conexión móvil eso son 300–1200 ms de pantalla en blanco por cada módulo
// nuevo: exactamente lo que hace que una PWA "se sienta web".
//
// Una app nativa no tiene ese momento porque su código YA está en el
// dispositivo. Aquí se replica en dos pasos:
//
//   1. PRECARGA EN REPOSO — cuando el navegador queda ocioso tras el primer
//      render, se descargan los módulos en segundo plano, de más a menos usado.
//      Se hace de a uno para no competir por ancho de banda con los datos de
//      Firestore, que son lo que el usuario está esperando ver.
//
//   2. PRECARGA POR INTENCIÓN — al pasar el mouse por encima (escritorio) o al
//      apoyar el dedo (móvil, `pointerdown`) sobre un item del menú. Entre que
//      el dedo toca y levanta pasan ~90 ms, y entre el `pointerdown` y el
//      `click` real hay margen suficiente para adelantar la descarga. Es el
//      mismo truco que usan Next.js y Remix.
//
// El resultado: para cuando el usuario suelta el dedo, el módulo casi siempre
// ya está en memoria y el cambio de vista es instantáneo, sin spinner.
// ============================================================================

import type { TabOptions } from '../App';

/** Importadores dinámicos por pestaña. Deben ser los MISMOS que usa lazy() en
 *  App.tsx: Vite deduplica por especificador, así que precargar aquí resuelve
 *  el import de allá sin descargar dos veces. */
const LOADERS: Partial<Record<TabOptions, () => Promise<unknown>>> = {
  houses: () => import('../views/HousesView'),
  pipeline: () => import('../views/HousesView'),
  no_status: () => import('../views/NoStatusView'),
  invoices: () => import('../views/InvoicesView'),
  calendar: () => import('../views/CalendarView'),
  qc_report: () => import('../views/QualityCheckHub'),
  qc_reports_table: () => import('../views/QCReportsTableView'),
  qc_route: () => import('../views/QCRouteView'),
  recalls: () => import('../views/RecallsView'),
  status_history: () => import('../views/StatusHistoryView'),
  payroll: () => import('../views/PayrollView'),
  customers: () => import('../views/CustomersView'),
  activity_log: () => import('../views/ActivityLogView'),
  roles: () => import('../views/admin/RolesView'),
  users: () => import('../views/admin/UsersView'),
  data_import: () => import('../views/DataImportView'),
  company: () => import('../views/CompanySettingsView'),
  photo_settings: () => import('../views/PhotoSettingsView'),
  settings: () => import('../views/SettingsView'),
};

/**
 * Orden de precarga en reposo: de más a menos probable.
 *
 * No se precargan TODAS las vistas. Las de administración (roles, usuarios,
 * import de datos, migración) las abre un puñado de personas una vez al mes;
 * descargarlas en todos los teléfonos gastaría datos del usuario sin
 * beneficio. Esas se cubren con la precarga por intención, que es suficiente.
 */
const IDLE_ORDER: TabOptions[] = [
  'houses',
  'pipeline',
  'invoices',
  'calendar',
  'qc_report',
  'no_status',
  'payroll',
  'customers',
];

/** Módulos ya solicitados: un Set evita relanzar el import en cada hover. */
const requested = new Set<TabOptions>();

/**
 * Descarga el chunk de una pestaña si aún no se pidió.
 * Los errores se ignoran a propósito: una precarga fallida NO debe romper nada.
 * Si el chunk hace falta de verdad, lazy() lo volverá a pedir y ahí sí se
 * mostrará el error al usuario.
 */
export const prefetchView = (tab: TabOptions): void => {
  if (requested.has(tab)) return;
  const load = LOADERS[tab];
  if (!load) return;
  requested.add(tab);
  load().catch(() => requested.delete(tab));
};

/** ¿Ya está descargado (o en curso) el chunk de esta pestaña? */
export const isViewPrefetched = (tab: TabOptions): boolean => requested.has(tab);

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
};

/**
 * Arranca la precarga en reposo. Devuelve una función para cancelarla.
 *
 * Se respeta `navigator.connection.saveData` y las conexiones 2G: en esos casos
 * precargar 8 módulos sería gastar los datos del usuario en algo que quizá no
 * abra. Ahí queda solo la precarga por intención.
 */
export const startIdlePrefetch = (): (() => void) => {
  let cancelled = false;

  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (conn?.saveData) return () => {};
  if (conn?.effectiveType && /(^|-)2g$/.test(conn.effectiveType)) return () => {};

  const idle = (cb: () => void) => {
    const w = window as IdleWindow;
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(cb, { timeout: 2000 });
    } else {
      // Safari < 16.4 no tiene requestIdleCallback.
      window.setTimeout(cb, 300);
    }
  };

  // De a uno: en secuencia, no en paralelo. Diez descargas simultáneas compiten
  // con las consultas de Firestore y harían que la vista ACTUAL tarde más en
  // mostrar datos — el usuario percibiría la app más lenta, no más rápida.
  const step = (i: number) => {
    if (cancelled || i >= IDLE_ORDER.length) return;
    idle(() => {
      if (cancelled) return;
      const tab = IDLE_ORDER[i];
      const load = LOADERS[tab];
      if (!load || requested.has(tab)) {
        step(i + 1);
        return;
      }
      requested.add(tab);
      load()
        .catch(() => requested.delete(tab))
        .finally(() => step(i + 1));
    });
  };

  // Se espera un momento tras el primer render: los datos de la vista inicial
  // tienen prioridad sobre cualquier precarga.
  const timer = window.setTimeout(() => step(0), 1200);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
};

/**
 * Props listas para pegar en cualquier elemento que navegue a una pestaña.
 * `onPointerEnter` cubre escritorio (hover) y `onPointerDown` cubre táctil
 * (el dedo apoyado, antes del click).
 */
export const prefetchHandlers = (tab: TabOptions) => ({
  onPointerEnter: () => prefetchView(tab),
  onPointerDown: () => prefetchView(tab),
});
