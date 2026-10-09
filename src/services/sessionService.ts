// src/services/sessionService.ts
// ============================================================================
// ⭐ CERRAR SESIÓN — un solo lugar (antes repetido en Sidebar y TopRightActions).
//
// Además de `signOut`, borra la caché local de Firestore (IndexedDB) del
// equipo: en un equipo compartido el siguiente usuario no hereda datos de
// clientes (decisión del usuario, 10/2026). El inicio de sesión siguiente
// tarda un poco más porque vuelve a descargar los datos.
//
//   1. Espera unos segundos a que se envíen los cambios pendientes. Si no hay
//      conexión, pregunta: al cerrar sesión esos cambios se perderían.
//   2. signOut.
//   3. terminate + clearIndexedDbPersistence (con tope de tiempo). Para poder
//      borrar, Firestore apaga también su cliente en las OTRAS pestañas de la
//      app: por eso se les avisa (BroadcastChannel) y se recargan solas.
//   4. Recarga la página (la instancia de Firestore quedó cerrada).
//
// No toca la cola de fotos sin conexión (otra base de IndexedDB): son fotos
// que todavía no se subieron.
// ============================================================================
import { signOut } from 'firebase/auth';
import { clearIndexedDbPersistence, terminate, waitForPendingWrites } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

const PENDING_WRITES_WAIT_MS = 5000;
const CLEAR_CACHE_WAIT_MS = 4000;
const SESSION_CHANNEL = 'pc-session';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Las demás pestañas se recargan cuando una cierra sesión (App.tsx lo activa). */
export function reloadOnLogoutInOtherTabs(): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(SESSION_CHANNEL);
  channel.onmessage = (e) => { if (e.data === 'logout') window.location.reload(); };
  return () => channel.close();
}

export async function logout(): Promise<void> {
  const synced = await Promise.race([
    waitForPendingWrites(db).then(() => true, () => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), PENDING_WRITES_WAIT_MS)),
  ]);
  if (
    !synced &&
    !window.confirm(
      'Hay cambios que todavía no llegan al servidor (¿sin conexión?). Si cierras sesión ahora se perderán.\n\n¿Cerrar sesión de todos modos?',
    )
  ) {
    return;
  }

  try {
    await signOut(auth);
  } catch (e) {
    console.error('Error al cerrar sesión:', e);
  }
  try {
    await terminate(db);
    await Promise.race([clearIndexedDbPersistence(db), wait(CLEAR_CACHE_WAIT_MS)]);
  } catch (e) {
    console.error('No se pudo borrar la caché local de Firestore:', e);
  }
  try {
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.postMessage('logout');
    channel.close();
  } catch { /* navegador sin BroadcastChannel: las otras pestañas se recargan a mano */ }
  window.location.reload();
}
