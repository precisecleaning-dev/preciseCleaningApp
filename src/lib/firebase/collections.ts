// src/lib/firebase/collections.ts
// ============================================================================
// ⭐ Nombres de las colecciones de Firestore en UN solo lugar. Antes cada
//    archivo escribía el suyo a mano ('billing_services', 'payroll', …) y un
//    error de dedo creaba una colección nueva en silencio. Las Security Rules
//    (security/firestore.rules) usan estos mismos nombres.
// ============================================================================
export const COLLECTIONS = {
  // Trabajo diario
  properties: 'properties',
  statusHistory: 'status_history',
  billingServices: 'billing_services',
  payroll: 'payroll',
  damages: 'damages',
  checklists: 'checklists',
  qualityChecks: 'quality_checks',
  qcRoutes: 'qc_routes',
  recalls: 'recalls',
  trash: 'trash',
  customers: 'customers',
  timeClock: 'time_clock',
  // Task list (antes ops_tasks, ops_projects y ops_priorities). Los
  // comentarios van dentro de cada tarea y de cada proyecto (comments[]).
  userTasks: 'user_tasks',
  taskProjects: 'task_projects',
  userPriorities: 'user_priorities',
  // Usuarios, bitácora y avisos
  systemUsers: 'system_users',
  userAccess: 'user_access',
  activityLogs: 'activity_logs',
  mail: 'mail',
  noticeBoard: 'notice_board',
  // Configuración
  appSettings: 'app_settings',
  statuses: 'settings_statuses',
  teams: 'settings_teams',
  priorities: 'settings_priorities',
  services: 'settings_services',
  products: 'settings_products',
  taxes: 'settings_tax',
  places: 'settings_places',
  tasks: 'settings_tasks',
  roles: 'settings_roles',
  company: 'settings_company',
  categories: 'settings_categories',
  responsables: 'settings_responsables',
  paymentMethods: 'settings_payment_methods',
  businesses: 'settings_businesses',
} as const;

