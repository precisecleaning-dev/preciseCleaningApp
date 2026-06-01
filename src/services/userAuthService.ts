import { initializeApp, getApps } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as firebaseSignOut
} from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { auth as primaryAuth } from '../config/firebase';

// ⭐ Mismas credenciales del proyecto principal pero inicializadas en una app
// SECUNDARIA. Esto nos permite crear usuarios en Firebase Auth sin cerrar
// la sesión del admin actual (Firebase solo permite un usuario logueado por
// app instance).
const firebaseConfig = {
  apiKey: 'AIzaSyAU2ZPSROGJcf1NfamG-r5jWiOX13vOoe4',
  authDomain: 'bdprecise-2d4bc.firebaseapp.com',
  projectId: 'bdprecise-2d4bc',
  storageBucket: 'bdprecise-2d4bc.firebasestorage.app',
  messagingSenderId: '697053380036',
  appId: '1:697053380036:web:7343cab6d09ab258557891'
};

const SECONDARY_APP_NAME = 'Secondary-UserCreation';

/**
 * Devuelve (o crea si no existe) la app secundaria de Firebase,
 * con su propia instancia de Auth aislada de la principal.
 */
function getSecondaryAuth(): Auth {
  const existingApps = getApps();
  let secondaryApp: FirebaseApp | undefined = existingApps.find(a => a.name === SECONDARY_APP_NAME);
  if (!secondaryApp) {
    secondaryApp = initializeApp(firebaseConfig, SECONDARY_APP_NAME);
  }
  return getAuth(secondaryApp);
}

/**
 * Genera una contraseña temporal segura (no la verá el usuario; sirve solo
 * para crear la cuenta antes de que el usuario establezca la suya propia).
 */
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
  let pwd = '';
  for (let i = 0; i < 20; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

export interface CreateUserResult {
  uid: string;
  email: string;
  alreadyExisted: boolean;
}

/**
 * Crea un usuario en Firebase Authentication y le envía un email para que
 * establezca su propia contraseña.
 * 
 * Características:
 * - Usa una "secondary Firebase app" para NO cerrar la sesión del admin actual.
 * - Si el email ya existe en Auth, simplemente reenvía el email de reset.
 * - Devuelve el UID generado por Firebase (para guardar en Firestore).
 * 
 * @param email Email del nuevo usuario
 * @returns Objeto con uid, email y flag indicando si ya existía
 */
export async function createUserWithResetEmail(email: string): Promise<CreateUserResult> {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Email inválido');
  }

  const tempPassword = generateTempPassword();
  const secondaryAuth = getSecondaryAuth();

  try {
    // 1) Crear el usuario en Firebase Auth (con la app secundaria, no afecta al admin)
    const credential = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, tempPassword);
    const uid = credential.user.uid;

    // 2) Cerrar sesión en la app secundaria (limpieza)
    await firebaseSignOut(secondaryAuth).catch(() => { /* ignorar */ });

    // 3) Enviar email de reset password al usuario (usa la app principal)
    await sendPasswordResetEmail(primaryAuth, cleanEmail);

    console.log(`✅ Usuario creado en Auth: ${cleanEmail} (UID: ${uid})`);
    console.log(`📧 Email de configuración de contraseña enviado a: ${cleanEmail}`);

    return { uid, email: cleanEmail, alreadyExisted: false };
  } catch (error: any) {
    console.error('Error en createUserWithResetEmail:', error);

    // Si el usuario ya existe en Auth, solo reenviar el email de reset
    if (error?.code === 'auth/email-already-in-use') {
      try {
        await sendPasswordResetEmail(primaryAuth, cleanEmail);
        console.log(`📧 Email de reset reenviado a: ${cleanEmail} (ya existía en Auth)`);
        // Devolvemos un UID vacío porque no podemos obtenerlo desde el cliente.
        // El llamador debe manejar este caso (revisar alreadyExisted).
        return { uid: '', email: cleanEmail, alreadyExisted: true };
      } catch (resetError) {
        console.error('Error reenviando reset email:', resetError);
        throw new Error('El email ya está registrado pero no se pudo reenviar el reset. Intenta de nuevo.');
      }
    }

    if (error?.code === 'auth/invalid-email') {
      throw new Error('El formato del email no es válido.');
    }
    if (error?.code === 'auth/weak-password') {
      throw new Error('Error interno: contraseña temporal débil. Contacta soporte.');
    }
    if (error?.code === 'auth/network-request-failed') {
      throw new Error('Sin conexión. Revisa tu red e intenta de nuevo.');
    }

    throw new Error(`Error creando usuario en Auth: ${error?.message || 'desconocido'}`);
  }
}

/**
 * Reenvía manualmente el email de reset de contraseña a un usuario existente.
 * Útil cuando el admin quiere reenviar las credenciales.
 */
export async function resendPasswordReset(email: string): Promise<void> {
  const cleanEmail = email.toLowerCase().trim();
  await sendPasswordResetEmail(primaryAuth, cleanEmail);
  console.log(`📧 Email de reset reenviado a: ${cleanEmail}`);
}