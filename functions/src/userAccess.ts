/* ============================================================================
   ACCESO POR USUARIO PARA LAS SECURITY RULES  (user_access/{email})
   ----------------------------------------------------------------------------
   Las reglas no pueden leer el permiso de un rol tal como lo guarda la app:
     · system_users NO usa el uid de Auth como id (ids de addDoc o del email),
       así que una regla no puede encontrar "mi usuario";
     · settings_roles guarda `permissions` como una LISTA de objetos, y el
       lenguaje de reglas no puede recorrer listas para buscar un módulo.
   Por eso estas funciones mantienen un espejo por usuario, con el email
   (en minúsculas, igual que el token de Auth) como id:

     user_access/{email} = {
       active: true,                       // existe en system_users y no está Inactive
       admin: false,                       // rol "Administrator"
       fin: true,                          // puede leer payroll y billing_services
       roleId, userId,                     // userId = id del doc en system_users
       m: { "Houses": { v, a, e, d, o }, ... } // permisos efectivos por módulo
                                           // (o = Scope "Own" en Roles)
     }

   Los permisos "heredados" se calculan aquí igual que en la app
   (Sidebar.canViewOrLegacy y features/ops/opsPermissions.ts): si un rol viejo
   no declara "Recycle Bin", usa lo de "Settings", etc.

   Solo el Admin SDK escribe user_access (las reglas propuestas lo prohíben al
   cliente). Orden para activarlo: desplegar estas funciones → ejecutar
   `rebuilduseraccess` una vez (botón o consola) → revisar user_access →
   publicar las reglas de security/.
   ============================================================================ */
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";

// Perezoso: index.ts llama a admin.initializeApp() DESPUÉS de importar este
// módulo (los imports se evalúan primero).
const db = () => admin.firestore();

/** Permisos de un módulo en el espejo. Los nombres van cortos a propósito:
 *  las reglas los leen así (`acc().m.get(módulo, {}).get('e', false)`). */
export interface Rights {
  /** View: ver el módulo (canView en Roles). */
  v: boolean;
  /** Add: crear registros (canAdd en Roles). */
  a: boolean;
  /** Edit: editar registros (canEdit en Roles). */
  e: boolean;
  /** Delete: borrar registros (canDelete en Roles). */
  d: boolean;
  /** Scope "Own" del módulo en Roles: solo sus propios registros. Hoy lo usan
   *  las reglas de user_tasks (módulo "Task List"). */
  o: boolean;
}

interface RolePermission {
  module?: string;
  canView?: boolean;
  canAdd?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  /** Grupos de Houses ocultos para el rol (p. ej. "financial"). */
  hiddenGroups?: string[];
  /** "All" | "Own" (Roles & Permissions → Scope). */
  scope?: string;
}

interface RoleDoc {
  name?: string;
  permissions?: RolePermission[];
}

interface UserDoc {
  email?: string;
  roleId?: string;
  status?: string;
}

export interface UserAccess {
  active: boolean;
  admin: boolean;
  fin: boolean;
  roleId: string;
  userId: string;
  m: Record<string, Rights>;
}

/** Módulos que, si el rol no los declara, heredan de otros (como en la app). */
const INHERITED_MODULE_SOURCES: Record<string, string[]> = {
  "Pipeline": ["Houses"],
  "Quality Check Reports": ["Quality Check"],
  "QC Dashboard": ["Quality Check"],
  "Task List": ["Manager", "Owner"],
  "Projects": ["Task List"],
  "Activity Log": ["Settings"],
  "Recycle Bin": ["Settings"],
  "Company Settings": ["Settings"],
  "Photo Settings": ["Settings"],
};

const NO_RIGHTS: Rights = { v: false, a: false, e: false, d: false, o: false };

const toRights = (permission?: RolePermission): Rights =>
  permission
    ? {
      v: !!permission.canView,
      a: !!permission.canAdd,
      e: !!permission.canEdit,
      d: !!permission.canDelete,
      o: permission.scope === "Own",
    }
    : NO_RIGHTS;

/** Clave del espejo: el email tal como viene en el token (minúsculas). */
export const accessKey = (email: string): string => email.trim().toLowerCase();

/** Permisos efectivos de un usuario según su rol (función pura: se prueba sola). */
export function computeAccess(userId: string, user: UserDoc, role: RoleDoc | null): UserAccess {
  const declared = new Map<string, RolePermission>();
  (role?.permissions ?? []).forEach((permission) => {
    if (permission?.module) declared.set(permission.module, permission);
  });
  const rightsByModule: Record<string, Rights> = {};
  declared.forEach((permission, module) => {
    rightsByModule[module] = toRights(permission);
  });
  Object.entries(INHERITED_MODULE_SOURCES).forEach(([module, sourceModules]) => {
    if (declared.has(module)) return;
    const inheritedRights = sourceModules.map((sourceModule) => toRights(declared.get(sourceModule)));
    if (module === "Task List") {
      // opsPermissions.ts: sin declarar, quien ve Manager u Owner tiene todo
      // (y ve las tareas de todos).
      const canSeeTaskList = inheritedRights.some((rights) => rights.v);
      rightsByModule[module] = {
        v: canSeeTaskList, a: canSeeTaskList, e: canSeeTaskList, d: canSeeTaskList, o: false,
      };
      return;
    }
    if (module === "Projects") {
      // opsPermissions.ts (taskProjectRights): sin declarar, crear y editar
      // proyectos es el Edit de Task List y borrarlos su Delete (como antes).
      // "Task List" ya está en `rightsByModule`: va antes en INHERITED_MODULE_SOURCES.
      const taskListRights = rightsByModule["Task List"] ?? NO_RIGHTS;
      rightsByModule[module] = {
        v: taskListRights.v, a: taskListRights.e, e: taskListRights.e, d: taskListRights.d, o: false,
      };
      return;
    }
    rightsByModule[module] = inheritedRights.reduce(
      (combinedRights, rights) => ({
        v: combinedRights.v || rights.v,
        a: combinedRights.a || rights.a,
        e: combinedRights.e || rights.e,
        d: combinedRights.d || rights.d,
        o: false,
      }),
      NO_RIGHTS,
    );
  });
  const isAdmin = role?.name === "Administrator";
  // ¿Puede ver dinero? Las pantallas que lo muestran: Payroll, Invoices,
  // Owner/Manager y Houses cuando el rol no oculta el grupo "financial".
  const hiddenHouseGroups = declared.get("Houses")?.hiddenGroups ?? [];
  const canSeeFinancials = isAdmin ||
    ["Payroll", "Invoices", "Owner", "Manager"].some((moduleName) => rightsByModule[moduleName]?.v) ||
    (!!rightsByModule["Houses"]?.v && !hiddenHouseGroups.includes("financial"));
  return {
    // Hoy la app deja entrar a un usuario "Inactive"; con las reglas propuestas
    // ya no podrá leer ni escribir nada (ver security/README.md).
    active: !!role && String(user.status ?? "") !== "Inactive",
    admin: isAdmin,
    fin: canSeeFinancials,
    roleId: String(user.roleId ?? ""),
    userId,
    m: rightsByModule,
  };
}

async function roleById(roleId?: string): Promise<RoleDoc | null> {
  if (!roleId) return null;
  const snap = await db().doc(`settings_roles/${roleId}`).get();
  return snap.exists ? (snap.data() as RoleDoc) : null;
}

/** Acceso de quien llama a una función, leído de las fuentes (no del espejo). */
export async function accessForEmail(email: string | undefined): Promise<UserAccess | null> {
  if (!email) return null;
  const snap = await db().collection("system_users").where("email", "==", accessKey(email)).limit(1).get();
  if (snap.empty) return null;
  const userDoc = snap.docs[0];
  const user = userDoc.data() as UserDoc;
  return computeAccess(userDoc.id, user, await roleById(user.roleId));
}

/** Lanza permission-denied si quien llama no es admin ni tiene `right` en `module`. */
export async function assertModuleAccess(
  auth: { token?: { email?: string } } | undefined,
  module: string,
  right: keyof Rights = "v",
): Promise<UserAccess> {
  const access = await accessForEmail(auth?.token?.email);
  if (!access || !access.active || (!access.admin && !access.m[module]?.[right])) {
    throw new HttpsError("permission-denied", `Tu rol no tiene permiso en "${module}".`);
  }
  return access;
}

async function writeAccess(userId: string, user: UserDoc, role: RoleDoc | null): Promise<void> {
  if (!user.email) return;
  await db().doc(`user_access/${accessKey(user.email)}`).set({
    ...computeAccess(userId, user, role),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Recalcula el espejo de UN email a partir de lo que hay AHORA en system_users.
 * No se usa el antes/después del evento: UsersView mueve un usuario de id
 * (set del nuevo + delete del viejo en un batch) y los dos triggers llegan en
 * cualquier orden; si el del delete llegara al final borraría el espejo de un
 * usuario que sigue existiendo.
 */
async function refreshAccessFor(key: string): Promise<void> {
  if (!key) return;
  const snap = await db().collection("system_users").where("email", "==", key).limit(1).get();
  if (snap.empty) {
    await db().doc(`user_access/${key}`).delete();
    return;
  }
  const userDoc = snap.docs[0];
  const user = userDoc.data() as UserDoc;
  await writeAccess(userDoc.id, user, await roleById(user.roleId));
}

// Usuario creado, editado o borrado → el espejo de su email (y del email
// anterior si cambió).
export const syncuseraccessonuser = onDocumentWritten(
  { document: "system_users/{userId}", region: "us-central1" },
  async (event) => {
    const before = event.data?.before?.exists ? (event.data.before.data() as UserDoc) : null;
    const after = event.data?.after?.exists ? (event.data.after.data() as UserDoc) : null;
    const keys = new Set(
      [before?.email, after?.email].filter((email): email is string => !!email).map(accessKey),
    );
    await Promise.all([...keys].map(refreshAccessFor));
  },
);

// Rol editado → recalcula a todos los usuarios con ese rol.
export const syncuseraccessonrole = onDocumentWritten(
  { document: "settings_roles/{roleId}", region: "us-central1" },
  async (event) => {
    const role = event.data?.after?.exists ? (event.data.after.data() as RoleDoc) : null;
    const users = await db().collection("system_users").where("roleId", "==", event.params.roleId).get();
    await Promise.all(users.docs.map((userDoc) => writeAccess(userDoc.id, userDoc.data() as UserDoc, role)));
    logger.info(`user_access: ${users.size} usuario(s) del rol ${event.params.roleId} recalculados.`);
  },
);

// Reconstruye todo el espejo (primera vez, o si algo quedó desfasado). Solo admin.
export const rebuilduseraccess = onCall({ region: "us-central1" }, async (request) => {
  const callerAccess = await accessForEmail(request.auth?.token?.email);
  if (!callerAccess?.admin) {
    throw new HttpsError("permission-denied", "Solo un Administrator puede reconstruir los accesos.");
  }
  const [users, roles, existingAccessDocs] = await Promise.all([
    db().collection("system_users").get(),
    db().collection("settings_roles").get(),
    db().collection("user_access").get(),
  ]);
  const roleMap = new Map(roles.docs.map((roleDoc) => [roleDoc.id, roleDoc.data() as RoleDoc]));
  // Emails de los usuarios que existen: sus espejos se reescriben y se conservan.
  const existingKeys = new Set<string>();
  const bulkWriter = db().bulkWriter();
  users.docs.forEach((userDoc) => {
    const user = userDoc.data() as UserDoc;
    if (!user.email) return;
    const key = accessKey(user.email);
    existingKeys.add(key);
    bulkWriter.set(db().doc(`user_access/${key}`), {
      ...computeAccess(userDoc.id, user, roleMap.get(String(user.roleId ?? "")) ?? null),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  // Espejos de usuarios que ya no existen.
  existingAccessDocs.docs.forEach((accessDoc) => {
    if (!existingKeys.has(accessDoc.id)) bulkWriter.delete(accessDoc.ref);
  });
  await bulkWriter.close();
  return {
    users: existingKeys.size,
    removed: existingAccessDocs.docs.filter((accessDoc) => !existingKeys.has(accessDoc.id)).length,
  };
});
