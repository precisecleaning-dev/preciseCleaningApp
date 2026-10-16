// Pruebas de security/firestore.rules contra el emulador de Firestore.
//
//   npm run test:rules
//
// (firebase emulators:exec levanta el emulador con un proyecto "demo-" que no
// toca producción, corre `node --test` y lo apaga). Necesita el Firebase CLI
// (npm i -g firebase-tools) y Java 11 o superior.
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
  query,
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
      'System Users': R(), 'Roles & Permissions': R(), 'Task List': ALL,
      'Recycle Bin': R(), 'Activity Log': R(), 'Company Settings': R(),
    },
  },
  'sandy@precise.test': {
    active: true, admin: false, fin: true, roleId: 'r-manager', userId: 'u-sandy',
    m: { Manager: R(), Houses: R(true, true, true, false), 'Task List': ALL, 'Quality Check': R() },
  },
  // Task List con Scope "Own" (o: true): solo sus tareas.
  'employee@precise.test': {
    active: true, admin: false, fin: false, roleId: 'r-employee', userId: 'u-emp',
    m: { 'Task List': { ...R(true, true, false, false), o: true } },
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

  test('tareas con Scope "Own": solo las propias', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'user_tasks', 'mine'), { assigneeUserIds: ['u-emp'], createdByUserId: 'u-owner', status: 'open', approval: null });
      await setDoc(doc(db, 'user_tasks', 'shared'), { assigneeUserIds: ['u-sandy', 'u-emp'], createdByUserId: 'u-owner', status: 'open', approval: null });
      await setDoc(doc(db, 'user_tasks', 'other'), { assigneeUserIds: ['u-sandy'], createdByUserId: 'u-owner', status: 'open', approval: null });
      // Formato de antes: una sola persona en assigneeUserId.
      await setDoc(doc(db, 'user_tasks', 'legacy'), { assigneeUserId: 'u-emp', createdByUserId: 'u-owner', status: 'open', approval: null });
      await setDoc(doc(db, 'user_tasks', 'toApprove'), {
        assigneeUserIds: ['u-sandy'], createdByUserId: 'u-sandy', status: 'open',
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
    await assertSucceeds(setDoc(doc(emp, 'user_tasks', 'new'), { assigneeUserIds: ['u-sandy'], createdByUserId: 'u-emp', status: 'open' }));
    // Reasignar: no la que me asignó otra persona; sí la que asigné yo.
    await assertFails(updateDoc(doc(emp, 'user_tasks', 'mine'), { assigneeUserIds: ['u-sandy'], assigneeUserNames: ['Sandy'] }));
    await assertFails(updateDoc(doc(emp, 'user_tasks', 'legacy'), { assigneeUserIds: ['u-sandy'], assigneeUserId: deleteField() }));
    await assertSucceeds(updateDoc(doc(emp, 'user_tasks', 'new'), { assigneeUserIds: ['u-owner', 'u-sandy'], assigneeUserNames: ['Owner', 'Sandy'] }));
    // Con Edit: la que le asignaron a él (sola o con más personas), no; la de otra persona, sí.
    await assertFails(updateDoc(doc(as('sandy@precise.test'), 'user_tasks', 'other'), { assigneeUserIds: ['u-owner'] }));
    await assertFails(updateDoc(doc(as('sandy@precise.test'), 'user_tasks', 'shared'), { assigneeUserIds: ['u-sandy'] }));
    await assertSucceeds(updateDoc(doc(as('sandy@precise.test'), 'user_tasks', 'mine'), { assigneeUserIds: ['u-owner'] }));
    await assertSucceeds(updateDoc(doc(as('sandy@precise.test'), 'user_tasks', 'legacy'), {
      assigneeUserIds: ['u-owner'], assigneeUserNames: ['Owner'], assigneeUserId: deleteField(), assigneeUserName: deleteField(),
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
});
