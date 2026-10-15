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

export interface Rights {
  v: boolean;
  a: boolean;
  e: boolean;
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
const LEGACY: Record<string, string[]> = {
  "Pipeline": ["Houses"],
  "Quality Check Reports": ["Quality Check"],
  "QC Dashboard": ["Quality Check"],
  "Task List": ["Manager", "Owner"],
  "Activity Log": ["Settings"],
  "Recycle Bin": ["Settings"],
  "Company Settings": ["Settings"],
  "Photo Settings": ["Settings"],
};

const NONE: Rights = { v: false, a: false, e: false, d: false, o: false };

const rightsOf = (p?: RolePermission): Rights =>
  p ? { v: !!p.canView, a: !!p.canAdd, e: !!p.canEdit, d: !!p.canDelete, o: p.scope === "Own" } : NONE;

/** Clave del espejo: el email tal como viene en el token (minúsculas). */
export const accessKey = (email: string): string => email.trim().toLowerCase();

/** Permisos efectivos de un usuario según su rol (función pura: se prueba sola). */
export function computeAccess(userId: string, user: UserDoc, role: RoleDoc | null): UserAccess {
  const declared = new Map<string, RolePermission>();
  (role?.permissions || []).forEach((p) => {
    if (p && p.module) declared.set(p.module, p);
  });
  const m: Record<string, Rights> = {};
  declared.forEach((p, module) => {
    m[module] = rightsOf(p);
  });
  Object.entries(LEGACY).forEach(([module, fallbacks]) => {
    if (declared.has(module)) return;
    const inherited = fallbacks.map((f) => rightsOf(declared.get(f)));
    if (module === "Task List") {
      // opsPermissions.ts: sin declarar, quien ve Manager u Owner tiene todo
      // (y ve las tareas de todos).
      const any = inherited.some((r) => r.v);
      m[module] = { v: any, a: any, e: any, d: any, o: false };
      return;
    }
    m[module] = inherited.reduce(
      (acc, r) => ({ v: acc.v || r.v, a: acc.a || r.a, e: acc.e || r.e, d: acc.d || r.d, o: false }),
      NONE,
    );
  });
  const admin = role?.name === "Administrator";
  // ¿Puede ver dinero? Las pantallas que lo muestran: Payroll, Invoices,
  // Owner/Manager y Houses cuando el rol no oculta el grupo "financial".
  const housesHidden = declared.get("Houses")?.hiddenGroups || [];
  const fin = admin ||
    ["Payroll", "Invoices", "Owner", "Manager"].some((mod) => m[mod]?.v) ||
    (!!m["Houses"]?.v && !housesHidden.includes("financial"));
  return {
    // Hoy la app deja entrar a un usuario "Inactive"; con las reglas propuestas
    // ya no podrá leer ni escribir nada (ver security/README.md).
    active: !!role && String(user.status || "") !== "Inactive",
    admin,
    fin,
    roleId: String(user.roleId || ""),
    userId,
    m,
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
  const doc = snap.docs[0];
  const user = doc.data() as UserDoc;
  return computeAccess(doc.id, user, await roleById(user.roleId));
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
  const d = snap.docs[0];
  const user = d.data() as UserDoc;
  await writeAccess(d.id, user, await roleById(user.roleId));
}

// Usuario creado, editado o borrado → el espejo de su email (y del email
// anterior si cambió).
export const syncuseraccessonuser = onDocumentWritten(
  { document: "system_users/{userId}", region: "us-central1" },
  async (event) => {
    const before = event.data?.before?.exists ? (event.data.before.data() as UserDoc) : null;
    const after = event.data?.after?.exists ? (event.data.after.data() as UserDoc) : null;
    const keys = new Set(
      [before?.email, after?.email].filter((e): e is string => !!e).map(accessKey),
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
    await Promise.all(users.docs.map((d) => writeAccess(d.id, d.data() as UserDoc, role)));
    logger.info(`user_access: ${users.size} usuario(s) del rol ${event.params.roleId} recalculados.`);
  },
);

// Reconstruye todo el espejo (primera vez, o si algo quedó desfasado). Solo admin.
export const rebuilduseraccess = onCall({ region: "us-central1" }, async (request) => {
  const me = await accessForEmail(request.auth?.token?.email);
  if (!me?.admin) throw new HttpsError("permission-denied", "Solo un Administrator puede reconstruir los accesos.");
  const [users, roles, current] = await Promise.all([
    db().collection("system_users").get(),
    db().collection("settings_roles").get(),
    db().collection("user_access").get(),
  ]);
  const roleMap = new Map(roles.docs.map((r) => [r.id, r.data() as RoleDoc]));
  const keep = new Set<string>();
  const writer = db().bulkWriter();
  users.docs.forEach((d) => {
    const user = d.data() as UserDoc;
    if (!user.email) return;
    const key = accessKey(user.email);
    keep.add(key);
    writer.set(db().doc(`user_access/${key}`), {
      ...computeAccess(d.id, user, roleMap.get(String(user.roleId || "")) || null),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  // Espejos de usuarios que ya no existen.
  current.docs.forEach((d) => {
    if (!keep.has(d.id)) writer.delete(d.ref);
  });
  await writer.close();
  return { users: keep.size, removed: current.docs.filter((d) => !keep.has(d.id)).length };
});
