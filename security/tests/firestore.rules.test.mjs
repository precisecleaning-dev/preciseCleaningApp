// Pruebas de security/firestore.rules contra el emulador de Firestore.
//
//   npm run test:rules
//
// (firebase emulators:exec levanta el emulador con un proyecto "demo-" que no
// toca producción, corre `node --test` y lo apaga). Necesita el Firebase CLI
// (npm i -g firebase-tools) y Java 21 o superior.
//
// Cada persona de prueba tiene su espejo en user_access/{email}, como lo
// dejan las Cloud Functions de functions/src/userAccess.ts.
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const COMPANY_EMAIL = 'office@precise.test';

const R = (v = true, a = false, e = false, d = false) => ({ v, a, e, d });
const ALL = R(true, true, true, true);

/** Espejos de user_access por persona (email → datos). */
const PEOPLE = {
  'admin@precise.test': { active: true, admin: true, fin: true, roleId: 'r-admin', userId: 'u-admin', m: {} },
  'owner@precise.test': {
    active: true, admin: false, fin: true, roleId: 'r-owner', userId: 'u-owner',
    m: {
      Owner: R(), Manager: R(), Houses: ALL, Payroll: R(), Invoices: R(), Settings: R(),
      'System Users': R(), 'Roles & Permissions': R(), 'Task List': ALL, 'Projects': ALL,
      'Recycle Bin': R(), 'Activity Log': R(), 'Company Settings': R(),
    },
  },
  'sandy@precise.test': {
    active: true, admin: false, fin: true, roleId: 'r-manager', userId: 'u-sandy',
    m: { Manager: R(), Houses: R(true, true, true, false), 'Task List': ALL, 'Projects': ALL, 'Quality Check': R() },
  },
  // Task List con Scope "Own" (o: true): solo sus tareas.
  'employee@precise.test': {
    active: true, admin: false, fin: false, roleId: 'r-employee', userId: 'u-emp',
    m: { 'Task List': { ...R(true, true, false, false), o: true }, 'Projects': R(true, false, false, false) },
  },
  'cleaner@precise.test': {
    active: true, admin: false, fin: false, roleId: 'r-cleaner', userId: 'u-cleaner',
    m: { Houses: R(), 'Task List': R(false) },
  },
  'inspector@precise.test': {
    active: true, admin: false, fin: false, roleId: 'r-inspector', userId: 'u-inspector',
    m: { 'Quality Check': R(), Houses: R() },
  },
  'adder@precise.test': {
    active: true, admin: false, fin: true, roleId: 'r-adder', userId: 'u-adder',
    m: { Houses: R(true, true, false, false) },
  },
  'office@precise.test': {
    active: true, admin: false, fin: true, roleId: 'r-office', userId: 'u-office',
    m: { Houses: R(), 'Office Notes': R(), Settings: R(), Payroll: R(), 'Recycle Bin': R() },
  },
  // Inspector con "QC Checklist Setup": agrega y renombra (sin quitar ni Settings).
  'checklist@precise.test': {
    active: true, admin: false, fin: false, roleId: 'r-checklist', userId: 'u-checklist',
    m: { 'Quality Check': R(), 'QC Checklist Setup': R(true, true, true, false) },
  },
  // Solo "Clients Report": el reporte suma Final Cost, así que ve dinero.
  'reporter@precise.test': {
    active: true, admin: false, fin: true, roleId: 'r-reporter', userId: 'u-reporter',
    m: { 'Clients Report': R() },
  },
  // Invoices New: crea y edita (sin borrar); otro solo lo ve.
  'billing@precise.test': {
    active: true, admin: false, fin: true, roleId: 'r-billing', userId: 'u-billing',
    m: { 'Invoices New': R(true, true, true, false) },
  },
  'invviewer@precise.test': {
    active: true, admin: false, fin: true, roleId: 'r-invviewer', userId: 'u-invviewer',
    m: { 'Invoices New': R() },
  },
  'inactive@precise.test': {
    active: false, admin: false, fin: true, roleId: 'r-owner', userId: 'u-inactive', m: { Houses: ALL },
  },
};

let env;
const as = (email) => env.authenticatedContext(email.split('@')[0], { email }).firestore();
const stranger = () => env.authenticatedContext('nobody', { email: 'nobody@else.test' }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-precise-rules',
    firestore: { rules: RULES },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [email, access] of Object.entries(PEOPLE)) {
      await setDoc(doc(db, 'user_access', email), access);
    }
    await setDoc(doc(db, 'settings_company', 'main'), { name: 'Precise', email: COMPANY_EMAIL });
    await setDoc(doc(db, 'settings_roles', 'r-admin'), { name: 'Administrator', permissions: [] });
    await setDoc(doc(db, 'settings_roles', 'r-owner'), { name: 'Owner', permissions: [] });
    await setDoc(doc(db, 'settings_roles', 'r-cleaner'), { name: 'Cleaner', permissions: [] });
    await setDoc(doc(db, 'system_users', 'u-admin'), { email: 'admin@precise.test', roleId: 'r-admin' });
    await setDoc(doc(db, 'system_users', 'u-owner'), { email: 'owner@precise.test', roleId: 'r-owner' });
    await setDoc(doc(db, 'system_users', 'u-cleaner'), { email: 'cleaner@precise.test', roleId: 'r-cleaner', teamId: '' });
    await setDoc(doc(db, 'settings_statuses', 's1'), { name: 'Scheduled' });
    await setDoc(doc(db, 'properties', 'h1'), {
      statusId: 's1', client: 'c1', address: '1 Main St', note: '', notesHistory: [],
      officeNote: '', invoiceStatus: 'Pending', scheduleDate: '2026-10-01',
    });
    await setDoc(doc(db, 'payroll', 'p1'), { propertyId: 'h1', baseAmount: 100 });
    await setDoc(doc(db, 'billing_services', 'b1'), { propertyId: 'h1', total: 150 });
    await setDoc(doc(db, 'task_projects', 'pr1'), { title: 'Ops', taskCount: 0, doneCount: 0, openMinutes: 0 });
    await setDoc(doc(db, 'time_clock', 'closed'), { userId: 'u-sandy', inAt: '2026-10-12T08:00:00Z', outAt: '2026-10-12T17:00:00Z' });
    await setDoc(doc(db, 'time_clock', 'open'), { userId: 'u-sandy', inAt: '2026-10-13T08:00:00Z', outAt: null });
    await setDoc(doc(db, 'quality_checks', 'q1'), { houseId: 'h1', status: 'Pending' });
    await setDoc(doc(db, 'settings_places', 'pl1'), { name: 'Porch' });
    await setDoc(doc(db, 'settings_tasks', 'tk1'), { placeId: 'pl1', name: 'Sweep' });
  });
});

describe('quién entra', () => {
  test('sin sesión, sin lista o inactivo: nada', async () => {
    await assertFails(getDoc(doc(anon(), 'properties', 'h1')));
    await assertFails(getDoc(doc(stranger(), 'properties', 'h1')));
    await assertFails(getDoc(doc(as('inactive@precise.test'), 'properties', 'h1')));
  });

  test('un usuario activo lee casas, catálogos y usuarios', async () => {
    const db = as('cleaner@precise.test');
    await assertSucceeds(getDocs(collection(db, 'properties')));
    await assertSucceeds(getDocs(collection(db, 'settings_statuses')));
    await assertSucceeds(getDocs(query(collection(db, 'system_users'), where('email', '==', 'cleaner@precise.test'))));
  });

  test('user_access: cada quien lee el suyo y nadie lo escribe', async () => {
    const db = as('cleaner@precise.test');
    await assertSucceeds(getDoc(doc(db, 'user_access', 'cleaner@precise.test')));
    await assertFails(getDoc(doc(db, 'user_access', 'owner@precise.test')));
    await assertFails(setDoc(doc(db, 'user_access', 'cleaner@precise.test'), { ...PEOPLE['cleaner@precise.test'], admin: true }));
    await assertFails(setDoc(doc(as('admin@precise.test'), 'user_access', 'x@precise.test'), { active: true }));
  });
});

describe('dinero', () => {
  test('payroll y billing_services: solo quien ve dinero', async () => {
    await assertFails(getDocs(collection(as('cleaner@precise.test'), 'payroll')));
    await assertFails(getDocs(collection(as('inspector@precise.test'), 'billing_services')));
    await assertSucceeds(getDocs(collection(as('owner@precise.test'), 'payroll')));
    await assertSucceeds(getDocs(collection(as('sandy@precise.test'), 'billing_services')));
  });

  test('Clients Report solo: lee billing_services y payroll (si no, vería $0.00)', async () => {
    await assertSucceeds(getDocs(collection(as('reporter@precise.test'), 'billing_services')));
    await assertSucceeds(getDocs(collection(as('reporter@precise.test'), 'payroll')));
  });

  test('registrar un pago: Payroll o editar Houses', async () => {
    await assertFails(setDoc(doc(as('cleaner@precise.test'), 'payroll', 'p2'), { propertyId: 'h1', baseAmount: 50 }));
    await assertSucceeds(setDoc(doc(as('sandy@precise.test'), 'payroll', 'p2'), { propertyId: 'h1', baseAmount: 50 }));
  });
});

describe('casas', () => {
  test('equipo de campo: Start/Finish, notas y fotos sí; status y dirección no', async () => {
    const db = as('cleaner@precise.test');
    await assertSucceeds(updateDoc(doc(db, 'properties', 'h1'), {
      employeeStartedAt: '2026-10-13T10:00:00Z', employeeStartedBy: 'Carlos', employeeStartedById: 'u-cleaner',
    }));
    await assertSucceeds(updateDoc(doc(db, 'properties', 'h1'), { note: 'ok', notesHistory: [{ text: 'ok' }] }));
    await assertSucceeds(updateDoc(doc(db, 'properties', 'h1'), { beforePhotos: ['https://x/1.jpg'] }));
    await assertFails(updateDoc(doc(db, 'properties', 'h1'), { statusId: 's2' }));
    await assertFails(updateDoc(doc(db, 'properties', 'h1'), { address: '2 Other St' }));
    await assertFails(updateDoc(doc(db, 'properties', 'h1'), { officeNote: 'interno' }));
  });

  test('Quality Check mueve la casa y retiene la factura, nada más', async () => {
    const db = as('inspector@precise.test');
    await assertSucceeds(updateDoc(doc(db, 'properties', 'h1'), {
      statusId: 'recall', invoiceHold: true, invoiceHoldAt: '2026-10-13T10:00:00Z', invoiceHoldBy: 'Ana',
    }));
    await assertFails(updateDoc(doc(db, 'properties', 'h1'), { statusId: 's1', address: 'x' }));
  });

  test('editar Houses edita todo; borrar pide el permiso de borrar', async () => {
    const sandy = as('sandy@precise.test');
    await assertSucceeds(updateDoc(doc(sandy, 'properties', 'h1'), { address: '2 Other St', statusId: 's2' }));
    await assertFails(deleteDoc(doc(sandy, 'properties', 'h1')));
  });

  test('papelera: el batch completo pasa solo con borrar en Houses', async () => {
    const moveToTrash = (db) => {
      const b = writeBatch(db);
      b.set(doc(collection(db, 'trash')), { collectionName: 'properties', originalId: 'h1', data: {}, related: [], reason: 'duplicada' });
      b.delete(doc(db, 'properties', 'h1'));
      b.delete(doc(db, 'payroll', 'p1'));
      b.delete(doc(db, 'billing_services', 'b1'));
      return b.commit();
    };
    await assertFails(moveToTrash(as('cleaner@precise.test')));
    await assertFails(moveToTrash(as('sandy@precise.test')));
    await assertSucceeds(moveToTrash(as('owner@precise.test')));
  });

  test('status_history: se agrega, no se edita', async () => {
    const db = as('sandy@precise.test');
    const ref = doc(collection(db, 'status_history'));
    await assertSucceeds(setDoc(ref, { propertyId: 'h1', toStatusId: 's2', changedAt: '2026-10-13T10:00:00Z' }));
    await assertFails(updateDoc(ref, { toStatusId: 's3' }));
  });
});

describe('usuarios y roles', () => {
  test('nadie se sube de rol a sí mismo', async () => {
    await assertFails(updateDoc(doc(as('cleaner@precise.test'), 'system_users', 'u-cleaner'), { roleId: 'r-admin' }));
    await assertFails(updateDoc(doc(as('owner@precise.test'), 'system_users', 'u-owner'), { roleId: 'r-admin' }));
  });

  test('System Users asigna roles comunes, no Administrator, y no toca a un admin', async () => {
    const owner = as('owner@precise.test');
    await assertFails(updateDoc(doc(owner, 'system_users', 'u-cleaner'), { roleId: 'r-admin' }));
    await assertSucceeds(updateDoc(doc(owner, 'system_users', 'u-cleaner'), { roleId: 'r-owner' }));
    await assertFails(updateDoc(doc(owner, 'system_users', 'u-admin'), { roleId: 'r-cleaner' }));
    await assertFails(deleteDoc(doc(owner, 'system_users', 'u-admin')));
    await assertSucceeds(updateDoc(doc(as('admin@precise.test'), 'system_users', 'u-owner'), { roleId: 'r-admin' }));
  });

  test('roles: nadie fuera de admin crea o renombra un "Administrator"', async () => {
    const owner = as('owner@precise.test');
    await assertSucceeds(updateDoc(doc(owner, 'settings_roles', 'r-cleaner'), { permissions: [{ module: 'Houses', canView: true }] }));
    await assertFails(updateDoc(doc(owner, 'settings_roles', 'r-cleaner'), { name: 'Administrator' }));
    await assertFails(updateDoc(doc(owner, 'settings_roles', 'r-admin'), { permissions: [] }));
    await assertFails(updateDoc(doc(as('cleaner@precise.test'), 'settings_roles', 'r-cleaner'), { permissions: [] }));
  });

  test('catálogos: los edita quien entra a Settings', async () => {
    await assertFails(setDoc(doc(as('cleaner@precise.test'), 'settings_statuses', 's9'), { name: 'X' }));
    await assertSucceeds(setDoc(doc(as('owner@precise.test'), 'settings_statuses', 's9'), { name: 'X' }));
  });
});

describe('checklist de Quality Check (QC Checklist Setup)', () => {
  test('ordena áreas: solo sortOrder', async () => {
    const db = as('checklist@precise.test');
    await assertSucceeds(updateDoc(doc(db, 'settings_places', 'pl1'), { sortOrder: 0 }));
    await assertFails(updateDoc(doc(db, 'settings_places', 'pl1'), { name: 'Front porch' }));
    await assertFails(updateDoc(doc(as('inspector@precise.test'), 'settings_places', 'pl1'), { sortOrder: 1 }));
  });

  test('agrega y renombra tareas; quitar pide Delete; borrar sigue en Settings', async () => {
    const db = as('checklist@precise.test');
    await assertSucceeds(setDoc(doc(db, 'settings_tasks', 'tk2'), { placeId: 'pl1', name: 'Mop', archived: false }));
    await assertFails(setDoc(doc(db, 'settings_tasks', 'tk3'), { placeId: 'pl1', name: '', archived: false }));
    await assertSucceeds(updateDoc(doc(db, 'settings_tasks', 'tk1'), { name: 'Sweep porch' }));
    await assertFails(updateDoc(doc(db, 'settings_tasks', 'tk1'), { placeId: 'pl9' }));
    await assertFails(updateDoc(doc(db, 'settings_tasks', 'tk1'), { archived: true }));
    await assertFails(deleteDoc(doc(db, 'settings_tasks', 'tk1')));
    await assertFails(setDoc(doc(as('inspector@precise.test'), 'settings_tasks', 'tk4'), { placeId: 'pl1', name: 'X', archived: false }));
  });

  test('con Delete archiva la tarea (no la borra)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'user_access', 'checklist@precise.test'), {
        ...PEOPLE['checklist@precise.test'],
        m: { 'Quality Check': R(), 'QC Checklist Setup': R(true, false, false, true) },
      });
    });
    const db = as('checklist@precise.test');
    await assertSucceeds(updateDoc(doc(db, 'settings_tasks', 'tk1'), { archived: true }));
    await assertFails(updateDoc(doc(db, 'settings_tasks', 'tk1'), { name: 'Renamed' }));
  });
});

describe('correo', () => {
  test('solo al correo de la empresa y solo { to, message }', async () => {
    const db = as('inspector@precise.test');
    await assertSucceeds(setDoc(doc(collection(db, 'mail')), { to: COMPANY_EMAIL, message: { subject: 'QC', html: '<p>ok</p>' } }));
    await assertFails(setDoc(doc(collection(db, 'mail')), { to: 'victim@else.test', message: { subject: 'x', html: 'x' } }));
    await assertFails(setDoc(doc(collection(db, 'mail')), { to: COMPANY_EMAIL, message: { subject: 'x' }, delivery: { state: 'SUCCESS' } }));
  });
});

describe('Task list y reloj', () => {
  test('tareas: quien ve Task List; proyectos: quien lo edita', async () => {
    await assertSucceeds(setDoc(doc(as('sandy@precise.test'), 'user_tasks', 't1'), { title: 'Call', status: 'open' }));
    await assertFails(setDoc(doc(as('cleaner@precise.test'), 'user_tasks', 't2'), { title: 'x', status: 'open' }));
    await assertSucceeds(setDoc(doc(as('sandy@precise.test'), 'task_projects', 'pr2'), { title: 'New' }));
    await assertFails(setDoc(doc(as('cleaner@precise.test'), 'task_projects', 'pr3'), { title: 'x' }));
  });

  test('proyectos según "Projects": crear (Add), editar (Edit), borrar (Delete); contadores para todos', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'user_access', 'employee@precise.test'), {
        ...PEOPLE['employee@precise.test'],
        m: { ...PEOPLE['employee@precise.test'].m, 'Projects': R(true, true, false, false) },
      });
      await setDoc(doc(ctx.firestore(), 'task_projects', 'pr9'), { title: 'Old', taskCount: 0, doneCount: 0, openMinutes: 0 });
    });
    const employee = as('employee@precise.test');
    await assertSucceeds(setDoc(doc(employee, 'task_projects', 'pr10'), { title: 'Mine' }));
    await assertFails(updateDoc(doc(employee, 'task_projects', 'pr9'), { title: 'Renamed' }));
    await assertSucceeds(updateDoc(doc(employee, 'task_projects', 'pr9'), { taskCount: 1 }));
    await assertFails(deleteDoc(doc(employee, 'task_projects', 'pr9')));
    await assertSucceeds(deleteDoc(doc(as('sandy@precise.test'), 'task_projects', 'pr9')));
  });

  test('tareas con Scope "Own": solo las propias', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'user_tasks', 'mine'), { assignees: [{ userId: 'u-emp', userName: 'Emp' }], assigneeUserIds: ['u-emp'], createdByUserId: 'u-owner', status: 'open', approval: null });
      await setDoc(doc(db, 'user_tasks', 'shared'), {
        assignees: [{ userId: 'u-sandy', userName: 'Sandy' }, { userId: 'u-emp', userName: 'Emp' }],
        assigneeUserIds: ['u-sandy', 'u-emp'], createdByUserId: 'u-owner', status: 'open', approval: null,
      });
      await setDoc(doc(db, 'user_tasks', 'other'), { assignees: [{ userId: 'u-sandy', userName: 'Sandy' }], assigneeUserIds: ['u-sandy'], createdByUserId: 'u-owner', status: 'open', approval: null });
      // Formato de antes: una sola persona en assigneeUserId.
      await setDoc(doc(db, 'user_tasks', 'legacy'), { assigneeUserId: 'u-emp', createdByUserId: 'u-owner', status: 'open', approval: null });
      await setDoc(doc(db, 'user_tasks', 'toApprove'), {
        assignees: [{ userId: 'u-sandy', userName: 'Sandy' }], assigneeUserIds: ['u-sandy'], createdByUserId: 'u-sandy', status: 'open',
        approval: { approverUserId: 'u-emp', status: 'pending' },
      });
    });
    const emp = as('employee@precise.test');
    const tasks = collection(emp, 'user_tasks');
    await assertSucceeds(getDoc(doc(emp, 'user_tasks', 'mine')));
    await assertSucceeds(getDoc(doc(emp, 'user_tasks', 'shared')));
    await assertSucceeds(getDoc(doc(emp, 'user_tasks', 'legacy')));
    await assertSucceeds(getDoc(doc(emp, 'user_tasks', 'toApprove')));
    await assertFails(getDoc(doc(emp, 'user_tasks', 'other')));
    await assertSucceeds(getDocs(query(tasks, where('assigneeUserIds', 'array-contains', 'u-emp'), where('status', '==', 'open'))));
    await assertSucceeds(getDocs(query(tasks, where('assigneeUserId', '==', 'u-emp'), where('status', '==', 'open'))));
    await assertSucceeds(getDocs(query(tasks, where('approval.approverUserId', '==', 'u-emp'), where('approval.status', '==', 'pending'))));
    // Pestaña "Assigned by me": las que creó, aunque sean de otra persona.
    await assertSucceeds(getDocs(query(tasks, where('createdByUserId', '==', 'u-emp'), where('status', '==', 'open'))));
    await assertFails(getDocs(query(tasks, where('status', '==', 'open'))));
    await assertSucceeds(updateDoc(doc(emp, 'user_tasks', 'mine'), { status: 'done' }));
    await assertSucceeds(updateDoc(doc(emp, 'user_tasks', 'shared'), { dueTime: '08:00' }));
    await assertFails(updateDoc(doc(emp, 'user_tasks', 'other'), { status: 'done' }));
    // Quién la asignó no se edita (ni siquiera con Scope All).
    await assertFails(updateDoc(doc(emp, 'user_tasks', 'mine'), { createdByUserId: 'u-emp' }));
    await assertFails(updateDoc(doc(as('sandy@precise.test'), 'user_tasks', 'other'), { createdByUserName: 'Sandy' }));
    await assertSucceeds(setDoc(doc(emp, 'user_tasks', 'new'), { assignees: [{ userId: 'u-sandy', userName: 'Sandy' }], assigneeUserIds: ['u-sandy'], createdByUserId: 'u-emp', status: 'open' }));
    // Reasignar: no la que me asignó otra persona; sí la que asigné yo.
    await assertFails(updateDoc(doc(emp, 'user_tasks', 'mine'), { assignees: [{ userId: 'u-sandy', userName: 'Sandy' }], assigneeUserIds: ['u-sandy'] }));
    await assertFails(updateDoc(doc(emp, 'user_tasks', 'legacy'), { assignees: [{ userId: 'u-sandy', userName: 'Sandy' }], assigneeUserIds: ['u-sandy'], assigneeUserId: deleteField() }));
    await assertSucceeds(updateDoc(doc(emp, 'user_tasks', 'new'), {
      assignees: [{ userId: 'u-owner', userName: 'Owner' }, { userId: 'u-sandy', userName: 'Sandy' }], assigneeUserIds: ['u-owner', 'u-sandy'],
    }));
    // Con Edit: la que le asignaron a él (sola o con más personas), no; la de otra persona, sí.
    await assertFails(updateDoc(doc(as('sandy@precise.test'), 'user_tasks', 'other'), { assignees: [{ userId: 'u-owner', userName: 'Owner' }], assigneeUserIds: ['u-owner'] }));
    await assertFails(updateDoc(doc(as('sandy@precise.test'), 'user_tasks', 'shared'), { assignees: [{ userId: 'u-sandy', userName: 'Sandy' }], assigneeUserIds: ['u-sandy'] }));
    await assertSucceeds(updateDoc(doc(as('sandy@precise.test'), 'user_tasks', 'mine'), { assignees: [{ userId: 'u-owner', userName: 'Owner' }], assigneeUserIds: ['u-owner'] }));
    await assertSucceeds(updateDoc(doc(as('sandy@precise.test'), 'user_tasks', 'legacy'), {
      assignees: [{ userId: 'u-owner', userName: 'Owner' }], assigneeUserIds: ['u-owner'],
      assigneeUserId: deleteField(), assigneeUserName: deleteField(),
    }));
    // Scope "All": las de todos.
    await assertSucceeds(getDocs(query(collection(as('sandy@precise.test'), 'user_tasks'), where('status', '==', 'open'))));
  });

  test('time_clock: cada quien su propia entrada', async () => {
    const db = as('sandy@precise.test');
    await assertSucceeds(setDoc(doc(db, 'time_clock', 'c1'), { userId: 'u-sandy', inAt: '2026-10-13T08:00:00Z', outAt: null }));
    await assertFails(setDoc(doc(db, 'time_clock', 'c2'), { userId: 'u-owner', inAt: '2026-10-13T08:00:00Z', outAt: null }));
  });

  test('gcal_sync solo lo escriben las funciones', async () => {
    await assertFails(setDoc(doc(as('admin@precise.test'), 'app_settings', 'gcal_sync'), { channelId: 'x' }));
  });
});

describe('hallazgos de la revisión', () => {
  test('nadie pone SU correo en otro usuario (el espejo le daría ese rol)', async () => {
    const owner = as('owner@precise.test');
    await assertFails(setDoc(doc(owner, 'system_users', 'u-new'), { email: 'owner@precise.test', roleId: 'r-cleaner' }));
    await assertFails(updateDoc(doc(owner, 'system_users', 'u-cleaner'), { email: 'owner@precise.test' }));
    await assertSucceeds(setDoc(doc(owner, 'system_users', 'u-new'), { email: 'new@precise.test', roleId: 'r-cleaner' }));
  });

  test('sin ser admin no se edita el rol propio', async () => {
    await assertFails(updateDoc(doc(as('owner@precise.test'), 'settings_roles', 'r-owner'), { permissions: [] }));
    await assertSucceeds(updateDoc(doc(as('admin@precise.test'), 'settings_roles', 'r-owner'), { permissions: [] }));
  });

  test('papelera: no se fabrica una entrada sin borrar la casa en el mismo batch', async () => {
    const owner = as('owner@precise.test');
    await assertFails(setDoc(doc(owner, 'trash', 'fake'), {
      collectionName: 'system_users', originalId: 'u-owner', data: { email: 'owner@precise.test', roleId: 'r-admin' }, related: [], reason: 'x',
    }));
    await assertFails(setDoc(doc(owner, 'trash', 'fake2'), { collectionName: 'properties', originalId: 'h1', data: {}, related: [], reason: 'x' }));
  });

  test('restaurar desde la papelera: casa, pago y servicio de vuelta', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'trash', 't1'), { collectionName: 'properties', originalId: 'h9', data: { address: '9 Elm' }, related: [] });
    });
    const db = as('office@precise.test');
    const b = writeBatch(db);
    b.set(doc(db, 'properties', 'h9'), { address: '9 Elm' });
    b.set(doc(db, 'payroll', 'p9'), { propertyId: 'h9', baseAmount: 10 });
    b.set(doc(db, 'billing_services', 'b9'), { propertyId: 'h9', total: 20 });
    b.delete(doc(db, 'trash', 't1'));
    await assertSucceeds(b.commit());
  });

  test('cierre de QC: reporte + casa + historial en un batch (inspector)', async () => {
    const db = as('inspector@precise.test');
    const b = writeBatch(db);
    b.update(doc(db, 'quality_checks', 'q1'), { status: 'Finished', result: 'failed' });
    b.update(doc(db, 'properties', 'h1'), { statusId: 'recall', invoiceHold: true, invoiceHoldAt: 'x', invoiceHoldBy: 'Ana' });
    b.set(doc(collection(db, 'status_history')), { propertyId: 'h1', toStatusId: 'recall' });
    await assertSucceeds(b.commit());
  });

  test('rol que solo agrega casas: crea la casa, la completa y registra su servicio', async () => {
    const db = as('adder@precise.test');
    await assertSucceeds(setDoc(doc(db, 'properties', 'hn'), { address: 'New', statusId: 's1' }));
    await assertSucceeds(updateDoc(doc(db, 'properties', 'hn'), { beforePhotos: [], sentToInvoiceAt: 'x' }));
    await assertSucceeds(setDoc(doc(db, 'billing_services', 'bn'), { propertyId: 'hn', total: 90 }));
    await assertFails(deleteDoc(doc(db, 'properties', 'hn')));
  });

  test('Settings asigna equipo; Payroll corrige fechas; Office Notes escribe su nota', async () => {
    const db = as('office@precise.test');
    await assertSucceeds(updateDoc(doc(db, 'system_users', 'u-cleaner'), { teamId: 't1' }));
    await assertFails(updateDoc(doc(db, 'system_users', 'u-cleaner'), { roleId: 'r-owner' }));
    await assertSucceeds(updateDoc(doc(db, 'properties', 'h1'), { scheduleDate: '2026-10-02' }));
    await assertSucceeds(updateDoc(doc(db, 'properties', 'h1'), { officeNote: 'interno', notesHistory: [{ text: 'interno' }] }));
  });

  test('el historial de notas no se vacía', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'properties', 'h1'), { notesHistory: [{ text: 'a' }, { text: 'b' }] });
    });
    await assertFails(updateDoc(doc(as('cleaner@precise.test'), 'properties', 'h1'), { notesHistory: [] }));
  });

  test('reloj: la salida se marca una sola vez', async () => {
    const db = as('sandy@precise.test');
    await assertSucceeds(updateDoc(doc(db, 'time_clock', 'open'), { outAt: '2026-10-13T17:00:00Z' }));
    await assertFails(updateDoc(doc(db, 'time_clock', 'closed'), { outAt: '2026-10-12T23:00:00Z' }));
  });

  test('configurar campos del formulario de Houses: quien edita Roles & Permissions', async () => {
    await assertFails(setDoc(doc(as('cleaner@precise.test'), 'app_settings', 'houses_form_config'), { visibility: {} }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'user_access', 'owner@precise.test'), {
        ...PEOPLE['owner@precise.test'],
        m: { ...PEOPLE['owner@precise.test'].m, Settings: R(false), 'Roles & Permissions': R(true, false, true, false) },
      });
    });
    await assertSucceeds(setDoc(doc(as('owner@precise.test'), 'app_settings', 'houses_form_config'), { visibility: {} }));
  });

  test('orden de las pestañas del Task list: quien edita Task List', async () => {
    const tabOrder = ['overdue', 'daily', 'approval', 'week', 'later', 'nodate', 'all', 'done'];
    await assertSucceeds(setDoc(doc(as('sandy@precise.test'), 'app_settings', 'task_list_tabs'), { tabOrder }));
    await assertFails(setDoc(doc(as('employee@precise.test'), 'app_settings', 'task_list_tabs'), { tabOrder }));
    await assertFails(setDoc(doc(as('employee@precise.test'), 'app_settings', 'photo_config'), { quality: 1 }));
    await assertSucceeds(getDoc(doc(as('employee@precise.test'), 'app_settings', 'task_list_tabs')));
  });
});

// ------------------------------------------------------------- Invoices New
// Los datos imitan lo que escribe src/services/invoicesService.ts (el converter
// no guarda `id` como campo).
const YEAR = new Date().getUTCFullYear();
const NOW_ISO = `${YEAR}-01-15T15:00:00.000Z`;
const EMPTY_DELIVERY = {
  sendCount: 0, lastAt: null, lastTo: '', lastIncludedPdf: false, lastIncludedPaymentLink: false, lastResult: null,
};
const invoiceNumber = (seq) => `INV-${YEAR}-${String(seq).padStart(4, '0')}`;

const invoiceData = (seq, overrides = {}) => ({
  number: invoiceNumber(seq), numberYear: YEAR, numberSeq: seq, numberKey: YEAR * 1_000_000 + seq,
  status: 'awaiting_payment', currency: 'USD',
  issueDate: `${YEAR}-01-15`, paymentTerms: 'net_15', dueDate: `${YEAR}-01-30`,
  subtotalCents: 10000, taxRateBps: 825, taxCents: 825, totalCents: 10825,
  propertyId: 'h1', customerId: 'c1', business: 'Normal',
  client: { customerId: 'c1', clientRef: 'c1', name: 'Ana', email: 'ana@client.test', phone: '', address: '', cityStateZip: '' },
  job: { propertyId: 'h1', address: '1 Main St', unit: '', city: '', serviceDate: `${YEAR}-01-10`, serviceId: '', serviceName: '' },
  jobAmountsAtIssue: null, recipientEmail: 'ana@client.test', notes: [],
  photos: { include: true, mode: 'all', selectedCount: 0, beforeCount: 0, afterCount: 0 },
  payment: null, delivery: EMPTY_DELIVERY, paymentLinkUrl: '',
  searchText: `${invoiceNumber(seq).toLowerCase()} ana 1 main st`,
  createdAt: NOW_ISO, createdByUserId: 'u-billing', createdByUserName: 'Bill',
  updatedAt: NOW_ISO, updatedByUserId: 'u-billing', updatedByUserName: 'Bill',
  ...overrides,
});
const manualPayment = (amountCents, overrides = {}) => ({
  source: 'manual', method: 'Check', paidDate: `${YEAR}-01-16`, amountCents, reference: 'CHK 101', note: '',
  recordedAt: NOW_ISO, recordedByUserId: 'u-billing', recordedByUserName: 'Bill',
  stripePaymentIntentId: null, stripeEventId: null,
  ...overrides,
});
const eventData = (type, overrides = {}) => ({
  type, at: NOW_ISO, actorType: 'user', actorUserId: 'u-billing', actorUserName: 'Bill', summary: type, changes: [],
  ...overrides,
});
const selectionData = (overrides = {}) => ({
  include: true, mode: 'all', items: [], updatedAt: NOW_ISO, updatedByUserId: 'u-billing', updatedByUserName: 'Bill',
  ...overrides,
});
const updatedBy = { updatedAt: NOW_ISO, updatedByUserId: 'u-billing', updatedByUserName: 'Bill' };

/** Un invoice ya guardado (con su contador y sus fotos), sin pasar por las reglas. */
const seedInvoice = (invoiceId, seq, overrides = {}) => env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'invoices', invoiceId), invoiceData(seq, overrides));
  await setDoc(doc(db, 'invoice_counters', String(YEAR)), { lastSeq: seq, lastInvoiceId: invoiceId, updatedAt: NOW_ISO });
  await setDoc(doc(db, 'invoices', invoiceId, 'photos', 'selection'), selectionData());
  await setDoc(doc(db, 'invoices', invoiceId, 'events', 'e-created'), eventData('created'));
});

/**
 * La transacción de invoicesService.create: contador +1, invoice, fotos y
 * evento. `overrides` cambia el invoice; `seqStep` y `withCounter` prueban
 * números que no salen del contador.
 */
const createInvoice = (db, invoiceId, { overrides = {}, seqStep = 1, withCounter = true, eventType = 'created' } = {}) =>
  runTransaction(db, async (transaction) => {
    const counterRef = doc(db, 'invoice_counters', String(YEAR));
    const counterSnap = await transaction.get(counterRef);
    const seq = (counterSnap.exists() ? counterSnap.data().lastSeq : 0) + seqStep;
    const invoice = invoiceData(seq, overrides);
    if (withCounter) transaction.set(counterRef, { lastSeq: seq, lastInvoiceId: invoiceId, updatedAt: NOW_ISO });
    transaction.set(doc(db, 'invoices', invoiceId), invoice);
    transaction.set(doc(db, 'invoices', invoiceId, 'photos', 'selection'), selectionData());
    transaction.set(doc(collection(db, 'invoices', invoiceId, 'events')), eventData(eventType));
    if (invoice.payment) transaction.set(doc(collection(db, 'invoices', invoiceId, 'events')), eventData('payment_recorded'));
  });

/** Un cambio con su evento en el mismo batch (update, addNote, fotos). */
const updateInvoice = (db, invoiceId, patch, eventType = 'updated') => {
  const batch = writeBatch(db);
  batch.update(doc(db, 'invoices', invoiceId), { ...patch, ...updatedBy });
  batch.set(doc(collection(db, 'invoices', invoiceId, 'events')), eventData(eventType));
  return batch.commit();
};

describe('Invoices New', () => {
  test('lee quien ve Invoices New (lista, Activity y fotos); los demás no', async () => {
    await seedInvoice('i1', 1);
    const viewer = as('invviewer@precise.test');
    await assertSucceeds(getDocs(collection(viewer, 'invoices')));
    await assertSucceeds(getDocs(query(collection(viewer, 'invoices'), where('issueDate', '>=', `${YEAR - 1}-01-01`))));
    await assertSucceeds(getDocs(query(collection(viewer, 'invoices'), where('status', 'in', ['awaiting_payment', 'payment_link_sent']))));
    await assertSucceeds(getDocs(query(collection(viewer, 'invoices', 'i1', 'events'), orderBy('at', 'desc'))));
    await assertSucceeds(getDoc(doc(viewer, 'invoices', 'i1', 'photos', 'selection')));
    await assertFails(getDocs(collection(as('cleaner@precise.test'), 'invoices')));
    await assertFails(getDoc(doc(as('sandy@precise.test'), 'invoices', 'i1')));
    await assertFails(getDoc(doc(as('sandy@precise.test'), 'invoices', 'i1', 'events', 'e-created')));
  });

  test('crear: contador, invoice, fotos y evento en una transacción (Add)', async () => {
    const billing = as('billing@precise.test');
    await assertSucceeds(createInvoice(billing, 'i1'));
    await assertSucceeds(createInvoice(billing, 'i2'));
    await assertSucceeds(createInvoice(billing, 'i3', {
      overrides: { status: 'paid', payment: manualPayment(10825) },
    }));
    await assertFails(createInvoice(as('invviewer@precise.test'), 'i4', {
      overrides: { createdByUserId: 'u-invviewer', updatedByUserId: 'u-invviewer' },
    }));
    // Administrator con "View As User": la app escribe el id de la otra persona.
    await assertSucceeds(createInvoice(as('admin@precise.test'), 'i5'));
  });

  test('crear: el número sale del contador, sin saltos ni repetidos', async () => {
    const billing = as('billing@precise.test');
    await assertFails(createInvoice(billing, 'i1', { withCounter: false }));
    await assertFails(createInvoice(billing, 'i1', { seqStep: 2 }));
    await assertFails(createInvoice(billing, 'i1', { overrides: { number: `INV-${YEAR}-1` } }));
    await assertFails(createInvoice(billing, 'i1', { overrides: { numberKey: 1 } }));
    await assertSucceeds(createInvoice(billing, 'i1'));
    // El contador solo se mueve junto con SU invoice nuevo.
    await assertFails(setDoc(doc(billing, 'invoice_counters', String(YEAR)), { lastSeq: 2, lastInvoiceId: 'i1', updatedAt: NOW_ISO }));
    await assertFails(setDoc(doc(billing, 'invoice_counters', String(YEAR)), { lastSeq: 9, lastInvoiceId: 'nope', updatedAt: NOW_ISO }));
    await assertFails(deleteDoc(doc(billing, 'invoice_counters', String(YEAR))));
  });

  test('crear: montos exactos, estados del navegador y nada del servidor', async () => {
    const billing = as('billing@precise.test');
    await assertFails(createInvoice(billing, 'i1', { overrides: { totalCents: 99999 } }));
    await assertFails(createInvoice(billing, 'i1', { overrides: { taxCents: 900, totalCents: 10900 } }));
    await assertFails(createInvoice(billing, 'i1', { overrides: { subtotalCents: 0, taxCents: 0, totalCents: 0 } }));
    await assertFails(createInvoice(billing, 'i1', { overrides: { subtotalCents: 100.5 } }));
    await assertFails(createInvoice(billing, 'i1', { overrides: { dueDate: `${YEAR - 1}-12-31` } }));
    await assertFails(createInvoice(billing, 'i1', { overrides: { status: 'paid_via_stripe' } }));
    await assertFails(createInvoice(billing, 'i1', { overrides: { status: 'payment_link_sent' } }));
    await assertFails(createInvoice(billing, 'i1', { overrides: { delivery: { ...EMPTY_DELIVERY, sendCount: 1 } } }));
    await assertFails(createInvoice(billing, 'i1', { overrides: { createdByUserId: 'u-owner' } }));
    await assertFails(createInvoice(billing, 'i1', { overrides: { propertyId: 'no-house', job: { ...invoiceData(1).job, propertyId: 'no-house' } } }));
    await assertFails(createInvoice(billing, 'i1', { overrides: { status: 'paid' } }));
    await assertFails(createInvoice(billing, 'i1', { overrides: { status: 'paid', payment: manualPayment(5000) } }));
    await assertFails(createInvoice(billing, 'i1', {
      overrides: { status: 'paid', payment: manualPayment(10825, { source: 'stripe', method: 'Stripe' }) },
    }));
    await assertFails(createInvoice(billing, 'i1', { overrides: { paymentLinkUrl: 'javascript:alert(1)' } }));
    await assertFails(createInvoice(billing, 'i1', { overrides: { paymentLinkUrl: 'https://pay.example.test/x' } }));
    await assertFails(createInvoice(billing, 'i1', { eventType: 'payment_confirmed_stripe' }));
    // Tasa 0 (exento) y redondeo al centavo (1234 × 8.25% = 101.805 → 102).
    await assertSucceeds(createInvoice(billing, 'i1', { overrides: { taxRateBps: 0, taxCents: 0, totalCents: 10000 } }));
    await assertSucceeds(createInvoice(billing, 'i2', { overrides: { subtotalCents: 1234, taxCents: 102, totalCents: 1336 } }));
  });

  test('editar: fechas, montos, notas y correo (Edit); número, cliente y estado no', async () => {
    await seedInvoice('i1', 1);
    const billing = as('billing@precise.test');
    await assertSucceeds(updateInvoice(billing, 'i1', { dueDate: `${YEAR}-02-14`, paymentTerms: 'custom' }));
    await assertSucceeds(updateInvoice(billing, 'i1', {
      recipientEmail: 'billing@client.test', paymentLinkUrl: 'https://buy.stripe.com/test_abc123',
    }));
    await assertSucceeds(updateInvoice(billing, 'i1', { subtotalCents: 20000, taxCents: 1650, totalCents: 21650 }));
    await assertSucceeds(updateInvoice(billing, 'i1', {
      notes: [{ id: 'n1', text: 'Thanks', createdAt: NOW_ISO, createdByUserId: 'u-billing', createdByUserName: 'Bill' }],
    }, 'note_added'));
    await assertFails(updateInvoice(billing, 'i1', { subtotalCents: 30000 }));
    await assertFails(updateInvoice(billing, 'i1', { number: 'INV-1999-0001' }));
    await assertFails(updateInvoice(billing, 'i1', { client: { ...invoiceData(1).client, name: 'Other' } }));
    await assertFails(updateInvoice(billing, 'i1', { createdByUserId: 'u-owner' }));
    await assertFails(updateInvoice(billing, 'i1', { status: 'payment_link_sent' }));
    await assertFails(updateInvoice(billing, 'i1', { delivery: { ...EMPTY_DELIVERY, sendCount: 3 } }));
    await assertFails(updateInvoice(billing, 'i1', { dueDate: `${YEAR - 1}-01-01` }));
    await assertFails(updateDoc(doc(billing, 'invoices', 'i1'), { dueDate: `${YEAR}-03-01`, updatedByUserId: 'u-owner' }));
    await assertFails(updateInvoice(as('invviewer@precise.test'), 'i1', { dueDate: `${YEAR}-03-01` }));
    await assertFails(deleteDoc(doc(billing, 'invoices', 'i1')));
    await assertFails(deleteDoc(doc(as('admin@precise.test'), 'invoices', 'i1')));
  });

  test('Mark as Paid: el pago completo, una sola vez', async () => {
    await seedInvoice('i1', 1);
    const billing = as('billing@precise.test');
    await assertFails(updateInvoice(billing, 'i1', { status: 'paid', payment: manualPayment(100) }, 'payment_recorded'));
    await assertFails(updateInvoice(billing, 'i1', {
      status: 'paid', payment: manualPayment(10825, { stripeEventId: 'evt_1' }),
    }, 'payment_recorded'));
    await assertFails(updateInvoice(billing, 'i1', { status: 'paid_via_stripe', payment: manualPayment(10825) }, 'payment_recorded'));
    await assertSucceeds(updateInvoice(billing, 'i1', { status: 'paid', payment: manualPayment(10825) }, 'payment_recorded'));
    // Ya pagado: no se registra otro pago.
    await assertFails(updateInvoice(billing, 'i1', {
      payment: manualPayment(10825, { reference: 'second' }),
    }, 'payment_recorded'));
  });

  test('pagado: subtotal, tasa y montos fijos; notas y fotos sí', async () => {
    await seedInvoice('i1', 1, { status: 'paid', payment: manualPayment(10825) });
    const billing = as('billing@precise.test');
    await assertFails(updateInvoice(billing, 'i1', { subtotalCents: 20000, taxCents: 1650, totalCents: 21650 }));
    await assertFails(updateInvoice(billing, 'i1', { status: 'awaiting_payment', payment: null }));
    await assertSucceeds(updateInvoice(billing, 'i1', {
      notes: [{ id: 'n1', text: 'Paid in full', createdAt: NOW_ISO, createdByUserId: 'u-billing', createdByUserName: 'Bill' }],
    }, 'note_added'));
    await assertSucceeds(updateInvoice(billing, 'i1', {
      photos: { include: false, mode: 'all', selectedCount: 0, beforeCount: 0, afterCount: 0 },
    }, 'photos_updated'));
  });

  test('Activity: solo se agrega, a nombre de quien hace el cambio', async () => {
    await seedInvoice('i1', 1);
    const billing = as('billing@precise.test');
    const events = collection(billing, 'invoices', 'i1', 'events');
    await assertSucceeds(setDoc(doc(events), eventData('updated')));
    await assertFails(setDoc(doc(events), eventData('created')));
    await assertFails(setDoc(doc(events), eventData('delivery_sent')));
    await assertFails(setDoc(doc(events), eventData('updated', { actorUserId: 'u-owner' })));
    await assertFails(setDoc(doc(events), eventData('updated', { actorType: 'stripe' })));
    await assertFails(setDoc(doc(collection(billing, 'invoices', 'nope', 'events')), eventData('updated')));
    await assertFails(setDoc(doc(collection(as('invviewer@precise.test'), 'invoices', 'i1', 'events')), eventData('updated', { actorUserId: 'u-invviewer' })));
    await assertFails(updateDoc(doc(billing, 'invoices', 'i1', 'events', 'e-created'), { summary: 'edited' }));
    await assertFails(deleteDoc(doc(billing, 'invoices', 'i1', 'events', 'e-created')));
  });

  test('fotos elegidas: un solo documento, con Edit', async () => {
    await seedInvoice('i1', 1);
    const billing = as('billing@precise.test');
    const photo = { url: 'https://x/1.jpg', category: 'before', order: 0 };
    await assertSucceeds(setDoc(doc(billing, 'invoices', 'i1', 'photos', 'selection'), selectionData({ mode: 'selected', items: [photo] })));
    await assertFails(setDoc(doc(billing, 'invoices', 'i1', 'photos', 'other'), selectionData()));
    await assertFails(setDoc(doc(billing, 'invoices', 'i1', 'photos', 'selection'), selectionData({ mode: 'some' })));
    await assertFails(setDoc(doc(billing, 'invoices', 'nope', 'photos', 'selection'), selectionData()));
    await assertFails(setDoc(doc(as('invviewer@precise.test'), 'invoices', 'i1', 'photos', 'selection'), selectionData({ updatedByUserId: 'u-invviewer' })));
    await assertFails(deleteDoc(doc(billing, 'invoices', 'i1', 'photos', 'selection')));
  });
});
